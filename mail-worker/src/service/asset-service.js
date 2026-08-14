import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import { isDel } from '../const/entity-const';
import { CREATOR_STATUS } from './creator-rewards-service';
import { decryptSecret, encryptSecret } from '../utils/secret-utils';
import dayjs from 'dayjs';

const CREATOR_FOLLOWERS_THRESHOLD = 10000;
const CREATOR_VIEWS_THRESHOLD = 100000;
const CREATOR_FINAL_STATUS_VALUES = [
	CREATOR_STATUS.JOINED,
	CREATOR_STATUS.REJECTED,
	CREATOR_STATUS.BANNED,
	CREATOR_STATUS.NO_PERMISSION,
	'joined',
	'rejected',
	'banned',
	'ban',
	'no_permission',
	'no permission'
].map(value => String(value).toLowerCase());
const NORMAL_LOGIN_STATUS = new Set([
	'normal',
	'ok',
	'success',
	'active',
	'online',
	'logged_in',
	'login_success',
	'正常',
	'在线',
	'已登录',
	'登录成功'
]);

const assetService = {
	async summary(c, params = {}, user) {
		const scope = this.scopeWhere(c, user, 'a', { includeDeleted: true });
		const activeScope = this.scopeWhere(c, user, 'a');

		const [summaryRow, domainResult, statusResult] = await Promise.all([
			c.env.db.prepare(`
				SELECT
					COUNT(*) AS allTotal,
					SUM(CASE WHEN a.is_del = ? THEN 1 ELSE 0 END) AS total,
					SUM(CASE WHEN a.is_del = ? THEN 1 ELSE 0 END) AS deletedTotal,
					SUM(CASE WHEN a.is_del = ? AND TRIM(IFNULL(a.tiktok_username, '')) <> '' THEN 1 ELSE 0 END) AS tiktokLinked,
					SUM(CASE WHEN a.is_del = ? AND TRIM(IFNULL(a.bit_browser_id, '')) <> '' THEN 1 ELSE 0 END) AS bitBrowserLinked,
					SUM(CASE WHEN a.is_del = ? AND (TRIM(IFNULL(a.last_agent_sync_at, '')) <> '' OR TRIM(IFNULL(a.last_stats_sync_at, '')) <> '') THEN 1 ELSE 0 END) AS syncedTotal,
					SUM(CASE WHEN a.is_del = ? AND a.tiktok_followers >= ? AND a.tiktok_views >= ? THEN 1 ELSE 0 END) AS creatorReady,
					SUM(CASE WHEN a.is_del = ? AND a.tiktok_followers >= ? AND a.tiktok_views >= ? AND LOWER(TRIM(IFNULL(a.creator_rewards_status, ''))) NOT IN (${CREATOR_FINAL_STATUS_VALUES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS creatorReadyTodo,
					SUM(CASE WHEN a.is_del = ? AND a.creator_rewards_status = ? THEN 1 ELSE 0 END) AS creatorJoined,
					SUM(CASE WHEN a.is_del = ? AND a.creator_rewards_status = ? THEN 1 ELSE 0 END) AS creatorRejected,
					SUM(CASE WHEN a.is_del = ? AND a.creator_rewards_status = ? THEN 1 ELSE 0 END) AS creatorBanned,
					SUM(CASE WHEN a.is_del = ? AND a.creator_rewards_status = ? THEN 1 ELSE 0 END) AS creatorNoPermission,
					SUM(CASE WHEN a.is_del = ? AND TRIM(IFNULL(a.login_status, '')) <> '' AND LOWER(TRIM(a.login_status)) NOT IN (${[...NORMAL_LOGIN_STATUS].map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS abnormalTotal,
					MAX(NULLIF(a.last_agent_sync_at, '')) AS latestAgentSyncAt,
					MAX(NULLIF(a.last_stats_sync_at, '')) AS latestStatsSyncAt
				FROM account a
				${scope.sql}
			`).bind(
				isDel.NORMAL,
				isDel.DELETE,
				isDel.NORMAL,
				isDel.NORMAL,
				isDel.NORMAL,
				isDel.NORMAL,
				CREATOR_FOLLOWERS_THRESHOLD,
				CREATOR_VIEWS_THRESHOLD,
				isDel.NORMAL,
				CREATOR_FOLLOWERS_THRESHOLD,
				CREATOR_VIEWS_THRESHOLD,
				...CREATOR_FINAL_STATUS_VALUES,
				isDel.NORMAL,
				CREATOR_STATUS.JOINED,
				isDel.NORMAL,
				CREATOR_STATUS.REJECTED,
				isDel.NORMAL,
				CREATOR_STATUS.BANNED,
				isDel.NORMAL,
				CREATOR_STATUS.NO_PERMISSION,
				isDel.NORMAL,
				...[...NORMAL_LOGIN_STATUS],
				...scope.binds
			).first(),
			c.env.db.prepare(`
				SELECT
					LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1)) AS domain,
					COUNT(*) AS total,
					SUM(CASE WHEN TRIM(IFNULL(a.tiktok_username, '')) <> '' THEN 1 ELSE 0 END) AS tiktokLinked,
					SUM(CASE WHEN TRIM(IFNULL(a.bit_browser_id, '')) <> '' THEN 1 ELSE 0 END) AS bitBrowserLinked,
					SUM(CASE WHEN a.tiktok_followers >= ? AND a.tiktok_views >= ? THEN 1 ELSE 0 END) AS creatorReady,
					SUM(CASE WHEN a.tiktok_followers >= ? AND a.tiktok_views >= ? AND LOWER(TRIM(IFNULL(a.creator_rewards_status, ''))) NOT IN (${CREATOR_FINAL_STATUS_VALUES.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS creatorReadyTodo
				FROM account a
				${activeScope.sql}
				GROUP BY LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1))
				ORDER BY total DESC, domain ASC
			`).bind(
				CREATOR_FOLLOWERS_THRESHOLD,
				CREATOR_VIEWS_THRESHOLD,
				CREATOR_FOLLOWERS_THRESHOLD,
				CREATOR_VIEWS_THRESHOLD,
				...CREATOR_FINAL_STATUS_VALUES,
				...activeScope.binds
			).all(),
			c.env.db.prepare(`
				SELECT
					CASE
						WHEN TRIM(IFNULL(a.login_status, '')) = '' THEN '未同步'
						WHEN LOWER(TRIM(a.login_status)) IN (${[...NORMAL_LOGIN_STATUS].map(() => '?').join(',')}) THEN '正常'
						ELSE a.login_status
					END AS loginStatus,
					COUNT(*) AS total
				FROM account a
				${activeScope.sql}
				GROUP BY loginStatus
				ORDER BY total DESC
				LIMIT 10
			`).bind(...[...NORMAL_LOGIN_STATUS], ...activeScope.binds).all()
		]);

		const total = Number(summaryRow?.total || 0);
		const tiktokLinked = Number(summaryRow?.tiktokLinked || 0);
		const bitBrowserLinked = Number(summaryRow?.bitBrowserLinked || 0);
		const syncedTotal = Number(summaryRow?.syncedTotal || 0);

		return {
			total,
			deletedTotal: Number(summaryRow?.deletedTotal || 0),
			tiktokLinked,
			bitBrowserLinked,
			syncedTotal,
			unsyncedTotal: Math.max(0, total - syncedTotal),
			creatorReady: Number(summaryRow?.creatorReady || 0),
			creatorReadyTodo: Number(summaryRow?.creatorReadyTodo || 0),
			creatorJoined: Number(summaryRow?.creatorJoined || 0),
			creatorRejected: Number(summaryRow?.creatorRejected || 0),
			creatorBanned: Number(summaryRow?.creatorBanned || 0),
			creatorNoPermission: Number(summaryRow?.creatorNoPermission || 0),
			abnormalTotal: Number(summaryRow?.abnormalTotal || 0),
			tiktokRate: this.rate(tiktokLinked, total),
			bitBrowserRate: this.rate(bitBrowserLinked, total),
			syncRate: this.rate(syncedTotal, total),
			latestAgentSyncAt: summaryRow?.latestAgentSyncAt || '',
			latestStatsSyncAt: summaryRow?.latestStatsSyncAt || '',
			thresholds: {
				followers: CREATOR_FOLLOWERS_THRESHOLD,
				views: CREATOR_VIEWS_THRESHOLD
			},
			domains: (domainResult.results || []).map(row => ({
				domain: row.domain || '',
				total: Number(row.total || 0),
				tiktokLinked: Number(row.tiktokLinked || 0),
				bitBrowserLinked: Number(row.bitBrowserLinked || 0),
				creatorReady: Number(row.creatorReady || 0),
				creatorReadyTodo: Number(row.creatorReadyTodo || 0)
			})),
			statuses: (statusResult.results || []).map(row => ({
				loginStatus: row.loginStatus || '未同步',
				total: Number(row.total || 0)
			}))
		};
	},

	async list(c, params = {}, user) {
		const num = this.clampNumber(params.num, 1, 1, 999999);
		const size = this.clampNumber(params.size, 20, 1, 100);
		const offset = (num - 1) * size;
		const filter = this.assetFilter(c, params, user);
		const orderSql = this.orderSql(params);

		const [countRow, { results }] = await Promise.all([
			c.env.db.prepare(`
				SELECT COUNT(*) AS total
				FROM account a
				LEFT JOIN user u ON u.user_id = a.user_id
				${filter.sql}
			`).bind(...filter.binds).first(),
			c.env.db.prepare(`
				SELECT
					a.account_id AS accountId,
					a.email,
					a.name,
					a.window_name AS windowName,
					a.bit_group_name AS bitGroupName,
					a.password AS password,
					a.tiktok_username AS tiktokUsername,
					a.matrix_account_id AS matrixAccountId,
					a.bit_browser_id AS bitBrowserId,
					a.tiktok_followers AS tiktokFollowers,
					a.tiktok_views AS tiktokViews,
					a.tiktok_views_text AS tiktokViewsText,
					a.creator_rewards_status AS creatorStatus,
					a.creator_rewards_username AS creatorRewardsUsername,
					a.creator_rewards_joined_at AS creatorRewardsJoinedAt,
					a.creator_rewards_rejected_at AS creatorRewardsRejectedAt,
					a.creator_rewards_retry_at AS creatorRewardsRetryAt,
					a.creator_rewards_last_checked_at AS creatorRewardsLastCheckedAt,
					a.creator_rewards_email_id AS creatorRewardsEmailId,
					a.creator_rewards_subject AS creatorRewardsSubject,
					a.creator_rewards_baseline_followers AS creatorRewardsBaselineFollowers,
					a.creator_rewards_baseline_views AS creatorRewardsBaselineViews,
					a.device_no AS deviceNo,
					a.login_status AS loginStatus,
					a.last_agent_sync_at AS lastAgentSyncAt,
					a.last_stats_sync_at AS lastStatsSyncAt,
					a.status,
					a.latest_email_time AS latestEmailTime,
					a.create_time AS createTime,
					a.user_id AS userId,
					a.is_del AS isDel,
					u.email AS userEmail
				FROM account a
				LEFT JOIN user u ON u.user_id = a.user_id
				${filter.sql}
				${orderSql}
				LIMIT ? OFFSET ?
			`).bind(...filter.binds, size, offset).all()
		]);

		const list = await Promise.all((results || []).map(row => this.toAssetRow(c, row)));
		return {
			list,
			total: Number(countRow?.total || 0),
			num,
			size
		};
	},

	async update(c, params = {}, user) {
		const accountId = Number(params.accountId);
		if (!accountId) {
			throw new BizError('accountId required');
		}

		const row = await c.env.db.prepare(`
			SELECT account_id AS accountId, user_id AS userId, is_del AS isDel
			FROM account
			WHERE account_id = ?
			LIMIT 1
		`).bind(accountId).first();

		if (!row || row.isDel === isDel.DELETE) {
			throw new BizError('asset account not found', 404);
		}

		if (!this.isAdmin(c, user) && Number(row.userId) !== Number(user.userId)) {
			throw new BizError('unauthorized', 403);
		}

		const values = await this.updateValues(c, params);
		if (values.length === 0) {
			return this.findById(c, accountId);
		}

		await c.env.db.prepare(`
			UPDATE account
			SET ${values.map(item => `${item.column} = ?`).join(', ')}
			WHERE account_id = ?
		`).bind(...values.map(item => item.value), accountId).run();

		if (Object.prototype.hasOwnProperty.call(params, 'creatorRetryAt')) {
			await this.saveCreatorRetryBaseline(c, accountId, params.creatorRetryAt);
		}

		return this.findById(c, accountId);
	},

	async batchStatus(c, params = {}, user) {
		const accountIds = this.parseIdList(params.accountIds || params.account_ids || params.ids || params.accountId || params.account_id);
		if (accountIds.length === 0) {
			throw new BizError('accountIds required');
		}

		const action = this.cleanText(params.action || params.status || 'delete').toLowerCase();
		const targetIsDel = action === 'restore' || action === 'active' || action === 'normal'
			? isDel.NORMAL
			: isDel.DELETE;
		const placeholders = accountIds.map(() => '?').join(',');
		const conditions = [`account_id IN (${placeholders})`, 'is_del <> ?'];
		const binds = [...accountIds, targetIsDel];
		if (!this.isAdmin(c, user)) {
			conditions.push('user_id = ?');
			binds.push(user.userId);
		}

		const result = await c.env.db.prepare(`
			UPDATE account
			SET is_del = ?
			WHERE ${conditions.join(' AND ')}
		`).bind(targetIsDel, ...binds).run();

		return {
			updated: Number(result.meta?.changes || 0),
			action: targetIsDel === isDel.DELETE ? 'delete' : 'restore',
			accountIds
		};
	},

	async findById(c, accountId) {
		const row = await c.env.db.prepare(`
			SELECT
				a.account_id AS accountId,
				a.email,
				a.name,
				a.window_name AS windowName,
				a.bit_group_name AS bitGroupName,
				a.password AS password,
				a.tiktok_username AS tiktokUsername,
				a.matrix_account_id AS matrixAccountId,
				a.bit_browser_id AS bitBrowserId,
				a.tiktok_followers AS tiktokFollowers,
				a.tiktok_views AS tiktokViews,
				a.tiktok_views_text AS tiktokViewsText,
				a.creator_rewards_status AS creatorStatus,
				a.creator_rewards_username AS creatorRewardsUsername,
				a.creator_rewards_joined_at AS creatorRewardsJoinedAt,
				a.creator_rewards_rejected_at AS creatorRewardsRejectedAt,
				a.creator_rewards_retry_at AS creatorRewardsRetryAt,
				a.creator_rewards_last_checked_at AS creatorRewardsLastCheckedAt,
				a.creator_rewards_email_id AS creatorRewardsEmailId,
				a.creator_rewards_subject AS creatorRewardsSubject,
				a.creator_rewards_baseline_followers AS creatorRewardsBaselineFollowers,
				a.creator_rewards_baseline_views AS creatorRewardsBaselineViews,
				a.device_no AS deviceNo,
				a.login_status AS loginStatus,
				a.last_agent_sync_at AS lastAgentSyncAt,
				a.last_stats_sync_at AS lastStatsSyncAt,
				a.status,
				a.latest_email_time AS latestEmailTime,
				a.create_time AS createTime,
				a.user_id AS userId,
				a.is_del AS isDel,
				u.email AS userEmail
			FROM account a
			LEFT JOIN user u ON u.user_id = a.user_id
			WHERE a.account_id = ?
			LIMIT 1
		`).bind(accountId).first();

		return row ? await this.toAssetRow(c, row) : null;
	},

	assetFilter(c, params, user) {
		const conditions = [];
		const binds = [];
		const status = String(params.status || 'active').trim();

		if (status === 'all') {
			// Keep all rows.
		} else if (status === 'deleted') {
			conditions.push('a.is_del = ?');
			binds.push(isDel.DELETE);
		} else if (status === 'disabled') {
			conditions.push('a.is_del = ?');
			conditions.push('a.status = ?');
			binds.push(isDel.NORMAL, 1);
		} else {
			conditions.push('a.is_del = ?');
			binds.push(isDel.NORMAL);
			if (status === 'normal') {
				conditions.push('a.status = ?');
				binds.push(0);
			}
		}

		if (!this.isAdmin(c, user)) {
			conditions.push('a.user_id = ?');
			binds.push(user.userId);
		}

		const domain = this.normalizeDomain(params.domain);
		if (domain) {
			conditions.push("LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1)) = LOWER(?)");
			binds.push(domain);
		}

		const emailScope = this.cleanText(params.emailScope || params.email_scope || params.emailKind || params.email_kind).toLowerCase();
		if (emailScope === 'external' || emailScope === 'outside') {
			const domains = this.envDomainList(c.env.domain);
			if (domains.length > 0) {
				conditions.push(`LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1)) NOT IN (${domains.map(() => '?').join(',')})`);
				binds.push(...domains);
			}
		}
		if (emailScope === 'internal' || emailScope === 'project') {
			const domains = this.envDomainList(c.env.domain);
			if (domains.length > 0) {
				conditions.push(`LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
				binds.push(...domains);
			}
		}

		const tiktokLinked = this.cleanText(params.tiktokLinked || params.hasTikTok);
		if (tiktokLinked === '1') {
			conditions.push("TRIM(IFNULL(a.tiktok_username, '')) <> ''");
		}
		if (tiktokLinked === '0') {
			conditions.push("TRIM(IFNULL(a.tiktok_username, '')) = ''");
		}

		const bitBrowserLinked = this.cleanText(params.bitBrowserLinked || params.hasBitBrowser);
		if (bitBrowserLinked === '1') {
			conditions.push("TRIM(IFNULL(a.bit_browser_id, '')) <> ''");
		}
		if (bitBrowserLinked === '0') {
			conditions.push("TRIM(IFNULL(a.bit_browser_id, '')) = ''");
		}

		const syncState = this.cleanText(params.syncState || params.sync_state).toLowerCase();
		if (syncState === 'synced') {
			conditions.push("(TRIM(IFNULL(a.last_agent_sync_at, '')) <> '' OR TRIM(IFNULL(a.last_stats_sync_at, '')) <> '')");
		}
		if (syncState === 'unsynced') {
			conditions.push("TRIM(IFNULL(a.last_agent_sync_at, '')) = ''");
			conditions.push("TRIM(IFNULL(a.last_stats_sync_at, '')) = ''");
		}

		const email = this.cleanText(params.email);
		if (email) {
			conditions.push('a.email COLLATE NOCASE LIKE ?');
			binds.push(`%${email}%`);
		}

		const tiktokUsername = this.cleanText(params.tiktokUsername || params.username);
		if (tiktokUsername) {
			conditions.push('a.tiktok_username COLLATE NOCASE LIKE ?');
			binds.push(`%${this.normalizeTikTokUsername(tiktokUsername) || tiktokUsername}%`);
		}

		const keyword = this.cleanText(params.keyword);
		if (keyword) {
			conditions.push(`(
				a.email COLLATE NOCASE LIKE ?
				OR a.tiktok_username COLLATE NOCASE LIKE ?
				OR a.name COLLATE NOCASE LIKE ?
				OR a.window_name COLLATE NOCASE LIKE ?
				OR a.bit_group_name COLLATE NOCASE LIKE ?
				OR a.device_no COLLATE NOCASE LIKE ?
			)`);
			binds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
		}

		const name = this.cleanText(params.name || params.remark);
		if (name) {
			conditions.push('a.name COLLATE NOCASE LIKE ?');
			binds.push(`%${name}%`);
		}

		const windowName = this.cleanText(params.windowName || params.window_name);
		if (windowName) {
			conditions.push('a.window_name COLLATE NOCASE LIKE ?');
			binds.push(`%${windowName}%`);
		}

		const bitGroupName = this.cleanText(params.bitGroupName || params.bit_group_name || params.bitGroup || params.groupName);
		if (bitGroupName) {
			conditions.push('a.bit_group_name COLLATE NOCASE LIKE ?');
			binds.push(`%${bitGroupName}%`);
		}

		const deviceNo = this.cleanText(params.deviceNo || params.device_no || params.deviceKeyword);
		if (deviceNo) {
			conditions.push('a.device_no COLLATE NOCASE LIKE ?');
			binds.push(`%${deviceNo}%`);
		}

		const deviceState = this.cleanText(params.deviceState || params.device_state);
		if (deviceState) {
			const parsed = this.deviceStateFilterSql(c, user, deviceState);
			if (parsed) {
				conditions.push(parsed.sql);
				binds.push(...parsed.binds);
			}
		}

		const bitBrowserId = this.cleanText(params.bitBrowserId || params.browserId);
		if (bitBrowserId) {
			conditions.push('a.bit_browser_id COLLATE NOCASE LIKE ?');
			binds.push(`%${bitBrowserId}%`);
		}

		const loginStatus = this.cleanText(params.loginStatus);
		if (loginStatus) {
			conditions.push('a.login_status COLLATE NOCASE LIKE ?');
			binds.push(`%${loginStatus}%`);
		}

		const loginHealth = this.cleanText(params.loginHealth || params.login_health).toLowerCase();
		if (loginHealth === 'normal') {
			conditions.push(`LOWER(TRIM(a.login_status)) IN (${[...NORMAL_LOGIN_STATUS].map(() => '?').join(',')})`);
			binds.push(...[...NORMAL_LOGIN_STATUS]);
		}
		if (loginHealth === 'abnormal') {
			conditions.push("TRIM(IFNULL(a.login_status, '')) <> ''");
			conditions.push(`LOWER(TRIM(a.login_status)) NOT IN (${[...NORMAL_LOGIN_STATUS].map(() => '?').join(',')})`);
			binds.push(...[...NORMAL_LOGIN_STATUS]);
		}
		if (loginHealth === 'unknown') {
			conditions.push("TRIM(IFNULL(a.login_status, '')) = ''");
		}

		const creatorReady = String(params.creatorReady || '').trim();
		if (creatorReady === '1') {
			conditions.push('a.tiktok_followers >= ?');
			conditions.push('a.tiktok_views >= ?');
			binds.push(CREATOR_FOLLOWERS_THRESHOLD, CREATOR_VIEWS_THRESHOLD);
		}
		if (creatorReady === '0') {
			conditions.push('(a.tiktok_followers < ? OR a.tiktok_views < ?)');
			binds.push(CREATOR_FOLLOWERS_THRESHOLD, CREATOR_VIEWS_THRESHOLD);
		}

		const creatorTodo = this.cleanText(params.creatorTodo || params.creatorReadyTodo || params.creator_todo);
		if (creatorTodo === '1') {
			conditions.push('a.tiktok_followers >= ?');
			conditions.push('a.tiktok_views >= ?');
			conditions.push(`LOWER(TRIM(IFNULL(a.creator_rewards_status, ''))) NOT IN (${CREATOR_FINAL_STATUS_VALUES.map(() => '?').join(',')})`);
			binds.push(CREATOR_FOLLOWERS_THRESHOLD, CREATOR_VIEWS_THRESHOLD, ...CREATOR_FINAL_STATUS_VALUES);
		}

		const creatorStatus = this.normalizeCreatorStatus(params.creatorStatus);
		if (creatorStatus) {
			conditions.push('a.creator_rewards_status = ?');
			binds.push(creatorStatus);
		}

		const followersFilter = this.cleanText(params.followersFilter || params.fansFilter);
		if (followersFilter) {
			const parsed = this.parseFollowersFilter(followersFilter);
			if (parsed) {
				conditions.push(parsed.sql);
				binds.push(...parsed.binds);
			}
		}

		return {
			sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
			binds
		};
	},

	scopeWhere(c, user, alias = 'a', options = {}) {
		const conditions = [];
		const binds = [];
		if (!options.includeDeleted) {
			conditions.push(`${alias}.is_del = ?`);
			binds.push(isDel.NORMAL);
		}
		if (!this.isAdmin(c, user)) {
			conditions.push(`${alias}.user_id = ?`);
			binds.push(user.userId);
		}
		return {
			sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
			binds
		};
	},

	deviceValueSql(alias = 'a') {
		return `TRIM(IFNULL(${alias}.device_no, ''))`;
	},

	devicePrefixSql(alias = 'a') {
		const value = this.deviceValueSql(alias);
		return `LOWER(TRIM(SUBSTR(${value}, 1, INSTR(${value}, '-') - 1)))`;
	},

	deviceSlotSql(alias = 'a') {
		const value = this.deviceValueSql(alias);
		return `LOWER(TRIM(SUBSTR(${value}, INSTR(${value}, '-') + 1)))`;
	},

	deviceValidSql(alias = 'a') {
		const value = this.deviceValueSql(alias);
		return `(${value} <> '' AND INSTR(${value}, '-') > 1 AND ${this.devicePrefixSql(alias)} <> '')`;
	},

	deviceSlotExistsSql(slot) {
		return {
			sql: `EXISTS (
				SELECT 1
				FROM account d
				WHERE d.is_del = ?
					AND d.user_id = a.user_id
					AND ${this.deviceValidSql('d')}
					AND ${this.devicePrefixSql('d')} = ${this.devicePrefixSql('a')}
					AND ${this.deviceSlotSql('d')} = ?
				LIMIT 1
			)`,
			binds: [isDel.NORMAL, slot]
		};
	},

	deviceStateFilterSql(c, user, state) {
		const normalized = this.cleanText(state);
		if (!normalized) return null;

		if (normalized === 'empty') {
			return {
				sql: `${this.deviceValueSql('a')} = ''`,
				binds: []
			};
		}

		const valid = this.deviceValidSql('a');
		const hasA = this.deviceSlotExistsSql('a');
		const hasB = this.deviceSlotExistsSql('b');

		if (normalized === 'complete') {
			return {
				sql: `(${valid} AND ${hasA.sql} AND ${hasB.sql})`,
				binds: [...hasA.binds, ...hasB.binds]
			};
		}

		if (normalized === 'single') {
			return {
				sql: `(${valid} AND ((CASE WHEN ${hasA.sql} THEN 1 ELSE 0 END) + (CASE WHEN ${hasB.sql} THEN 1 ELSE 0 END)) = 1)`,
				binds: [...hasA.binds, ...hasB.binds]
			};
		}

		if (normalized === 'missingA') {
			return {
				sql: `(${valid} AND ${hasB.sql} AND NOT ${hasA.sql})`,
				binds: [...hasB.binds, ...hasA.binds]
			};
		}

		if (normalized === 'missingB') {
			return {
				sql: `(${valid} AND ${hasA.sql} AND NOT ${hasB.sql})`,
				binds: [...hasA.binds, ...hasB.binds]
			};
		}

		return null;
	},

	async updateValues(c, params) {
		const values = [];
		if (Object.prototype.hasOwnProperty.call(params, 'name')) {
			values.push({ column: 'name', value: this.cleanText(params.name).slice(0, 30) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'windowName')) {
			values.push({ column: 'window_name', value: this.cleanText(params.windowName).slice(0, 80) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'bitGroupName')) {
			values.push({ column: 'bit_group_name', value: this.cleanText(params.bitGroupName).slice(0, 80) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'password')) {
			values.push({ column: 'password', value: await encryptSecret(c?.env?.jwt_secret || '', this.cleanText(params.password).slice(0, 256)) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'deviceNo') || Object.prototype.hasOwnProperty.call(params, 'device_no')) {
			values.push({ column: 'device_no', value: this.cleanText(params.deviceNo ?? params.device_no).slice(0, 60) });
			values.push({ column: 'device_updated_at', value: dayjs().format('YYYY-MM-DD HH:mm:ss') });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'tiktokUsername')) {
			values.push({ column: 'tiktok_username', value: this.normalizeTikTokUsername(params.tiktokUsername) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'matrixAccountId')) {
			values.push({ column: 'matrix_account_id', value: this.cleanText(params.matrixAccountId).slice(0, 80) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'bitBrowserId')) {
			values.push({ column: 'bit_browser_id', value: this.cleanText(params.bitBrowserId).slice(0, 80) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'loginStatus')) {
			values.push({ column: 'login_status', value: this.cleanText(params.loginStatus).slice(0, 60) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'tiktokFollowers')) {
			values.push({ column: 'tiktok_followers', value: this.parseMetric(params.tiktokFollowers) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'tiktokViews')) {
			values.push({ column: 'tiktok_views', value: this.parseMetric(params.tiktokViews) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'tiktokViewsText')) {
			values.push({ column: 'tiktok_views_text', value: this.cleanText(params.tiktokViewsText).slice(0, 60) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'creatorStatus')) {
			values.push({ column: 'creator_rewards_status', value: this.normalizeCreatorStatus(params.creatorStatus) });
		}
		if (Object.prototype.hasOwnProperty.call(params, 'creatorRetryAt')) {
			values.push({ column: 'creator_rewards_retry_at', value: this.normalizeDate(params.creatorRetryAt) });
		}
		return values;
	},

	async saveCreatorRetryBaseline(c, accountId, creatorRetryAt) {
		const retryAt = this.normalizeDate(creatorRetryAt);
		if (!retryAt) {
			await c.env.db.prepare(`
				UPDATE account
				SET
					creator_rewards_retry_at = '',
					creator_rewards_baseline_followers = 0,
					creator_rewards_baseline_views = 0
				WHERE account_id = ?
			`).bind(accountId).run();
			return;
		}

		await c.env.db.prepare(`
			UPDATE account
			SET
				creator_rewards_retry_at = ?,
				creator_rewards_baseline_followers = COALESCE(tiktok_followers, 0),
				creator_rewards_baseline_views = COALESCE(tiktok_views, 0),
				creator_rewards_last_checked_at = CURRENT_TIMESTAMP
			WHERE account_id = ?
		`).bind(retryAt, accountId).run();
	},

	orderSql(params) {
		const orderMap = {
			accountId: 'a.account_id',
			email: 'a.email',
			name: 'a.name',
			windowName: 'a.window_name',
			bitGroupName: 'a.bit_group_name',
			tiktokFollowers: 'a.tiktok_followers',
			tiktokViews: 'a.tiktok_views',
			lastAgentSyncAt: 'a.last_agent_sync_at',
			lastStatsSyncAt: 'a.last_stats_sync_at',
			createTime: 'a.create_time'
		};
		const sortBy = orderMap[params.sortBy] || 'a.account_id';
		const order = String(params.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
		return `ORDER BY ${sortBy} ${order}`;
	},

	async toAssetRow(c, row) {
		const tiktokUsername = this.normalizeTikTokUsername(row.tiktokUsername);
		const followers = Number(row.tiktokFollowers || 0);
		const views = Number(row.tiktokViews || 0);
		const baselineFollowers = Number(row.creatorRewardsBaselineFollowers || 0);
		const baselineViews = Number(row.creatorRewardsBaselineViews || 0);
		const creatorWindowFollowers = Math.max(0, followers - baselineFollowers);
		const creatorWindowViews = Math.max(0, views - baselineViews);
		const loginStatus = this.cleanText(row.loginStatus);
		const loginHealth = this.loginHealth(loginStatus);
		const creatorRetryAt = row.creatorRewardsRetryAt || '';
		const password = await decryptSecret(c?.env?.jwt_secret || '', row.password || '');

		return {
			...row,
			domain: emailUtils.getDomain(row.email),
			name: row.name || '',
			windowName: row.windowName || '',
			bitGroupName: row.bitGroupName || '',
			password,
			tiktokUsername,
			tiktokUrl: tiktokUsername ? `https://www.tiktok.com/@${tiktokUsername}` : '',
			matrixAccountId: row.matrixAccountId || '',
			bitBrowserId: row.bitBrowserId || '',
			tiktokFollowers: followers,
			tiktokViews: views,
			tiktokViewsText: row.tiktokViewsText || '',
			creatorStatus: this.normalizeCreatorStatus(row.creatorStatus),
			creatorRewardsUsername: row.creatorRewardsUsername || '',
			creatorRewardsJoinedAt: row.creatorRewardsJoinedAt || '',
			creatorRewardsRejectedAt: row.creatorRewardsRejectedAt || '',
			creatorRewardsRetryAt: row.creatorRewardsRetryAt || '',
			creatorRewardsLastCheckedAt: row.creatorRewardsLastCheckedAt || '',
			creatorRewardsEmailId: Number(row.creatorRewardsEmailId || 0),
			creatorRewardsSubject: row.creatorRewardsSubject || '',
			creatorRewardsBaselineFollowers: baselineFollowers,
			creatorRewardsBaselineViews: baselineViews,
			creatorWindowFollowers,
			creatorWindowViews,
			creatorRetryReady: Boolean(creatorRetryAt) && dayjs().isAfter(dayjs(creatorRetryAt)) && followers >= CREATOR_FOLLOWERS_THRESHOLD && creatorWindowViews >= CREATOR_VIEWS_THRESHOLD,
			deviceNo: row.deviceNo || '',
			loginStatus,
			loginHealth,
			canCreatorProgram: followers >= CREATOR_FOLLOWERS_THRESHOLD && views >= CREATOR_VIEWS_THRESHOLD,
			lastAgentSyncAt: row.lastAgentSyncAt || '',
			lastStatsSyncAt: row.lastStatsSyncAt || ''
		};
	},

	parseFollowersFilter(value) {
		const text = this.cleanText(value).replaceAll('，', ',').replaceAll(' ', '');
		if (!text) return null;

		let match = text.match(/^([<>]=?)(\d+)$/);
		if (match) {
			return { sql: `a.tiktok_followers ${match[1]} ?`, binds: [Number(match[2])] };
		}

		match = text.match(/^(\d+)-(\d+)$/);
		if (match) {
			const min = Number(match[1]);
			const max = Number(match[2]);
			if (Number.isFinite(min) && Number.isFinite(max)) {
				return { sql: 'a.tiktok_followers BETWEEN ? AND ?', binds: [Math.min(min, max), Math.max(min, max)] };
			}
		}

		match = text.match(/^(\d+)\+$/);
		if (match) {
			return { sql: 'a.tiktok_followers >= ?', binds: [Number(match[1])] };
		}

		match = text.match(/^=(\d+)$/);
		if (match) {
			return { sql: 'a.tiktok_followers = ?', binds: [Number(match[1])] };
		}

		match = text.match(/^(\d+)$/);
		if (match) {
			return { sql: 'a.tiktok_followers = ?', binds: [Number(match[1])] };
		}

		return null;
	},

	parseIdList(value) {
		const source = Array.isArray(value) ? value : String(value || '').split(',');
		return [...new Set(source
			.map(item => Number(item))
			.filter(item => Number.isInteger(item) && item > 0)
		)].slice(0, 500);
	},

	loginHealth(status) {
		const value = this.cleanText(status).toLowerCase();
		if (!value) return 'unknown';
		return NORMAL_LOGIN_STATUS.has(value) ? 'normal' : 'abnormal';
	},

	isAdmin(c, user) {
		return user?.email === c.env.admin || Number(user?.type) === 0;
	},

	normalizeTikTokUsername(username) {
		const value = String(username || '').trim()
			.replace(/^https?:\/\/(?:www\.)?tiktok\.com\/@/i, '')
			.replace(/^@/, '')
			.split(/[/?#\s]/)[0]
			.replace(/[._]+$/g, '');
		if (!/^[A-Za-z0-9._]{2,32}$/.test(value)) {
			return '';
		}
		return value;
	},

	normalizeCreatorStatus(value) {
		const text = String(value || '').trim();
		const lower = text.toLowerCase();
		if (text === CREATOR_STATUS.JOINED || lower === 'joined') return CREATOR_STATUS.JOINED;
		if (text === CREATOR_STATUS.REJECTED || lower === 'rejected') return CREATOR_STATUS.REJECTED;
		if (text === CREATOR_STATUS.BANNED || lower === 'banned' || lower === 'ban') return CREATOR_STATUS.BANNED;
		if (text === CREATOR_STATUS.NO_PERMISSION || lower === 'no_permission' || lower === 'no permission') return CREATOR_STATUS.NO_PERMISSION;
		return '';
	},

	normalizeDate(value) {
		const text = String(value || '').trim();
		if (!text) return '';
		const parsed = dayjs(text);
		return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '';
	},

	parseMetric(value) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return Math.max(0, Math.round(value));
		}
		const text = String(value || '').trim().replaceAll(',', '');
		if (!text) return 0;
		const match = text.match(/([\d.]+)\s*(w|k|m|b|万)?/i);
		if (!match) return 0;
		const base = Number(match[1]);
		if (!Number.isFinite(base)) return 0;
		const unit = String(match[2] || '').toLowerCase();
		const factor = unit === '万' || unit === 'w' ? 10000 : unit === 'k' ? 1000 : unit === 'm' ? 1000000 : unit === 'b' ? 1000000000 : 1;
		return Math.max(0, Math.round(base * factor));
	},

	rate(value, total) {
		return total > 0 ? Number(((Number(value || 0) / Number(total)) * 100).toFixed(1)) : 0;
	},

	clampNumber(value, defaultValue, min, max) {
		const num = Number(value);
		if (!Number.isFinite(num)) return defaultValue;
		return Math.max(min, Math.min(max, Math.floor(num)));
	},

	normalizeDomain(domain) {
		return String(domain || '').replace(/^@/, '').trim().toLowerCase();
	},

	envDomainList(domainList) {
		let list = domainList;
		if (typeof list === 'string') {
			try {
				list = JSON.parse(list);
			} catch (e) {
				list = list.split(',');
			}
		}
		if (!Array.isArray(list)) {
			return [];
		}
		return [...new Set(list.map(domain => this.normalizeDomain(domain)).filter(Boolean))];
	},

	cleanText(value) {
		return String(value || '').trim();
	}
};

export default assetService;
