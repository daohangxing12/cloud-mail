/*
 * STABLE GUARD:
 * 资产中心用于同步邮箱、TikTok 用户名、粉丝、播放量、登录状态、中视频识别。
 * 禁止随意删除字段、统计、列表筛选或本地软件同步兼容逻辑。
 * 修改前必须先阅读 cloud-mail/AGENTS.md 和 STABLE_FEATURES_DO_NOT_BREAK.md。
 */
import KvConst from '../const/kv-const';
import { isDel } from '../const/entity-const';
import creatorRewardsService from './creator-rewards-service';

const assetService = {
	async overview(c) {
		await this.ensureAssetIdentitySchema(c);
		const domains = this.envDomainList(c.env.domain);
		const now = this.nowSqlTime();
		const { results: domainRows } = await c.env.db.prepare(`
			SELECT
				LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
				COUNT(*) AS total,
				SUM(CASE WHEN is_del = ? THEN 1 ELSE 0 END) AS normal,
				SUM(CASE WHEN is_del = ? THEN 1 ELSE 0 END) AS deleted,
				SUM(CASE WHEN ${this.assetSql()} THEN 1 ELSE 0 END) AS assetMarked,
				SUM(CASE WHEN creator_rewards_status = 'joined' THEN 1 ELSE 0 END) AS creatorJoined,
				SUM(CASE WHEN creator_rewards_status = 'rejected' THEN 1 ELSE 0 END) AS creatorRejected,
				SUM(CASE WHEN creator_rewards_status = 'rejected' AND creator_rewards_retry_at <> '' AND creator_rewards_retry_at <= ? THEN 1 ELSE 0 END) AS creatorRetryReady,
				MAX(last_agent_sync_at) AS lastAgentSyncAt,
				MAX(last_stats_sync_at) AS lastStatsSyncAt,
				MAX(creator_rewards_last_checked_at) AS creatorLastCheckedAt
			FROM account
			GROUP BY domain
			ORDER BY total DESC
		`).bind(isDel.NORMAL, isDel.DELETE, now).all();

		const rows = (domainRows || []).map(row => ({
			...row,
			canReceive: domains.includes(row.domain)
		}));

		const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
		const normal = rows.reduce((sum, row) => sum + Number(row.normal || 0), 0);
		const assetMarked = rows.reduce((sum, row) => sum + Number(row.assetMarked || 0), 0);
		const creatorJoined = rows.reduce((sum, row) => sum + Number(row.creatorJoined || 0), 0);
		const creatorRejected = rows.reduce((sum, row) => sum + Number(row.creatorRejected || 0), 0);
		const creatorRetryReady = rows.reduce((sum, row) => sum + Number(row.creatorRetryReady || 0), 0);
		const receivable = rows
			.filter(row => row.canReceive)
			.reduce((sum, row) => sum + Number(row.normal || 0), 0);

		return {
			total,
			normal,
			assetMarked,
			receivable,
			external: Math.max(0, normal - receivable),
			creatorJoined,
			creatorRejected,
			creatorRetryReady,
			configuredDomains: domains,
			domains: rows
		};
	},

	async list(c, params = {}) {
		await this.ensureAssetIdentitySchema(c);
		let num = Number(params.num || 1);
		let size = Number(params.size || 20);
		if (!Number.isFinite(num) || num < 1) num = 1;
		if (!Number.isFinite(size) || size < 1) size = 20;
		if (size > 100) size = 100;

		const domains = this.envDomainList(c.env.domain);
		const accountWhere = ['is_del = ?'];
		const accountBinds = [isDel.NORMAL];
		const usernameWhere = ['is_del = ?'];
		const usernameBinds = [isDel.NORMAL];
		const domain = this.normalizeDomain(params.domain);
		const keyword = String(params.keyword || params.email || '').trim();
		const configuredOnly = this.truthy(params.configuredOnly);
		const creatorStatus = String(params.creatorStatus || '').trim();
		const now = this.nowSqlTime();

		if (domain) {
			accountWhere.push("LOWER(SUBSTR(email, INSTR(email, '@') + 1)) = LOWER(?)");
			accountBinds.push(domain);
			usernameWhere.push('1 = 0');
		}

		if (configuredOnly && domains.length > 0) {
			accountWhere.push(`LOWER(SUBSTR(email, INSTR(email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
			accountBinds.push(...domains);
			usernameWhere.push('1 = 0');
		}

		if (keyword) {
			accountWhere.push('(email COLLATE NOCASE LIKE ? OR name COLLATE NOCASE LIKE ? OR window_name COLLATE NOCASE LIKE ? OR tiktok_username COLLATE NOCASE LIKE ? OR creator_rewards_username COLLATE NOCASE LIKE ? OR bit_browser_id COLLATE NOCASE LIKE ?)');
			accountBinds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
			usernameWhere.push('(window_name COLLATE NOCASE LIKE ? OR tiktok_username COLLATE NOCASE LIKE ? OR bit_browser_id COLLATE NOCASE LIKE ?)');
			usernameBinds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
		}

		if (this.truthy(params.assetOnly)) {
			accountWhere.push(`(${this.assetSql()})`);
		}

		if (creatorStatus === 'joined') {
			accountWhere.push("creator_rewards_status = 'joined'");
			usernameWhere.push('1 = 0');
		} else if (creatorStatus === 'rejected') {
			accountWhere.push("creator_rewards_status = 'rejected'");
			usernameWhere.push('1 = 0');
		} else if (creatorStatus === 'retryReady') {
			accountWhere.push("creator_rewards_status = 'rejected' AND creator_rewards_retry_at <> '' AND creator_rewards_retry_at <= ?");
			accountBinds.push(now);
			usernameWhere.push('1 = 0');
		} else if (creatorStatus === 'unrecognized') {
			accountWhere.push("COALESCE(creator_rewards_status, '') = ''");
		}

		const accountWhereSql = `WHERE ${accountWhere.join(' AND ')}`;
		const usernameWhereSql = `WHERE ${usernameWhere.join(' AND ')}`;
		const orderSql = this.assetOrderSql(params);
		const offset = (num - 1) * size;
		const countRow = await c.env.db.prepare(`
			SELECT COUNT(*) AS total FROM (
				SELECT account_id AS id FROM account ${accountWhereSql}
				UNION ALL
				SELECT username_asset_id AS id FROM username_asset ${usernameWhereSql}
			)
		`).bind(...accountBinds, ...usernameBinds).first();

		const { results } = await c.env.db.prepare(`
			SELECT * FROM (
				SELECT
					'email' AS assetSource,
					account_id AS accountId,
					email,
					LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
					name,
					window_name AS windowName,
					tiktok_username AS tiktokUsername,
					matrix_account_id AS matrixAccountId,
					bit_browser_id AS bitBrowserId,
					tiktok_followers AS tiktokFollowers,
					tiktok_views AS tiktokViews,
					tiktok_views_text AS tiktokViewsText,
					creator_rewards_username AS creatorRewardsUsername,
					creator_rewards_status AS creatorRewardsStatus,
					creator_rewards_joined_at AS creatorRewardsJoinedAt,
					creator_rewards_rejected_at AS creatorRewardsRejectedAt,
					creator_rewards_retry_at AS creatorRewardsRetryAt,
					creator_rewards_last_checked_at AS creatorRewardsLastCheckedAt,
					creator_rewards_email_id AS creatorRewardsEmailId,
					creator_rewards_subject AS creatorRewardsSubject,
					login_status AS loginStatus,
					last_agent_sync_at AS lastAgentSyncAt,
					last_stats_sync_at AS lastStatsSyncAt,
					create_time AS createTime,
					COALESCE(last_agent_sync_at, create_time, '') AS sortTime,
					CASE WHEN ${this.assetSql()} THEN 1 ELSE 0 END AS assetMarked
				FROM account
				${accountWhereSql}
				UNION ALL
				SELECT
					'username_only' AS assetSource,
					username_asset_id AS accountId,
					'' AS email,
					'' AS domain,
					window_name AS name,
					window_name AS windowName,
					tiktok_username AS tiktokUsername,
					matrix_account_id AS matrixAccountId,
					bit_browser_id AS bitBrowserId,
					tiktok_followers AS tiktokFollowers,
					tiktok_views AS tiktokViews,
					tiktok_views_text AS tiktokViewsText,
					'' AS creatorRewardsUsername,
					'' AS creatorRewardsStatus,
					'' AS creatorRewardsJoinedAt,
					'' AS creatorRewardsRejectedAt,
					'' AS creatorRewardsRetryAt,
					'' AS creatorRewardsLastCheckedAt,
					0 AS creatorRewardsEmailId,
					'' AS creatorRewardsSubject,
					login_status AS loginStatus,
					last_agent_sync_at AS lastAgentSyncAt,
					last_stats_sync_at AS lastStatsSyncAt,
					create_time AS createTime,
					COALESCE(last_agent_sync_at, update_time, create_time, '') AS sortTime,
					1 AS assetMarked
				FROM username_asset
				${usernameWhereSql}
			)
			ORDER BY ${orderSql}
			LIMIT ? OFFSET ?
		`).bind(...accountBinds, ...usernameBinds, size, offset).all();

		const rows = results || [];
		const tokens = await Promise.all(rows.map(row => row.email ? c.env.kv.get(KvConst.SUB_ACCOUNT_TOKEN + String(row.email || '').toLowerCase()) : null));
		return {
			list: rows.map((row, index) => ({
			...row,
			canReceive: domains.includes(row.domain),
			hasToken: !!tokens[index],
			creatorRewardsText: this.creatorRewardsText(row)
		})),
			total: countRow?.total || 0
		};
	},

	assetOrderSql(params = {}) {
		const sortBy = String(params.sortBy || params.sortField || params.orderBy || '').trim();
		const rawOrder = String(params.sortOrder || params.order || params.direction || '').toLowerCase();
		const direction = ['asc', 'ascending'].includes(rawOrder) ? 'ASC' : 'DESC';
		const fields = {
			accountId: 'accountId',
			email: "LOWER(COALESCE(email, ''))",
			domain: "LOWER(COALESCE(domain, ''))",
			windowName: "LOWER(COALESCE(windowName, ''))",
			tiktokUsername: "LOWER(COALESCE(tiktokUsername, ''))",
			creatorRewardsStatus: "LOWER(COALESCE(creatorRewardsStatus, ''))",
			tiktokFollowers: 'COALESCE(tiktokFollowers, 0)',
			tiktokViews: 'COALESCE(tiktokViews, 0)',
			loginStatus: "LOWER(COALESCE(loginStatus, ''))",
			createTime: "COALESCE(createTime, '')",
			sortTime: "COALESCE(sortTime, '')",
			lastAgentSyncAt: "COALESCE(lastAgentSyncAt, '')",
			lastStatsSyncAt: "COALESCE(lastStatsSyncAt, '')"
		};
		const field = fields[sortBy] || fields.sortTime;
		const tieBreaker = sortBy === 'accountId' ? '' : ', accountId DESC';
		return `${field} ${direction}${tieBreaker}`;
	},

	async scanCreatorRewards(c, params = {}) {
		return creatorRewardsService.scanHistory(c, params);
	},

	async ensureAssetIdentitySchema(c) {
		const statements = [
			`ALTER TABLE account ADD COLUMN window_name TEXT NOT NULL DEFAULT '';`,
			`CREATE TABLE IF NOT EXISTS username_asset (
				username_asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
				tiktok_username TEXT NOT NULL DEFAULT '',
				window_name TEXT NOT NULL DEFAULT '',
				matrix_account_id TEXT NOT NULL DEFAULT '',
				bit_browser_id TEXT NOT NULL DEFAULT '',
				group_name TEXT NOT NULL DEFAULT '',
				tiktok_followers INTEGER NOT NULL DEFAULT 0,
				tiktok_views INTEGER NOT NULL DEFAULT 0,
				tiktok_views_text TEXT NOT NULL DEFAULT '',
				login_status TEXT NOT NULL DEFAULT '',
				last_agent_sync_at TEXT NOT NULL DEFAULT '',
				last_stats_sync_at TEXT NOT NULL DEFAULT '',
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				update_time TEXT NOT NULL DEFAULT '',
				is_del INTEGER DEFAULT 0 NOT NULL
			);`,
			`CREATE INDEX IF NOT EXISTS idx_username_asset_bit_browser_id ON username_asset(bit_browser_id);`,
			`CREATE INDEX IF NOT EXISTS idx_username_asset_tiktok_username ON username_asset(tiktok_username);`,
			`CREATE INDEX IF NOT EXISTS idx_account_window_name ON account(window_name);`
		];
		for (const statement of statements) {
			try {
				await c.env.db.prepare(statement).run();
			} catch (e) {
				if (!String(e?.message || '').toLowerCase().includes('duplicate column')) {
					console.warn(`skip asset identity schema statement: ${e.message}`);
				}
			}
		}
	},

	assetSql() {
		return `
			COALESCE(matrix_account_id, '') <> ''
			OR COALESCE(bit_browser_id, '') <> ''
			OR COALESCE(tiktok_username, '') <> ''
			OR COALESCE(creator_rewards_status, '') <> ''
			OR COALESCE(creator_rewards_username, '') <> ''
			OR COALESCE(tiktok_followers, 0) > 0
			OR COALESCE(tiktok_views, 0) > 0
			OR COALESCE(tiktok_views_text, '') <> ''
			OR COALESCE(login_status, '') <> ''
			OR COALESCE(last_agent_sync_at, '') <> ''
			OR COALESCE(last_stats_sync_at, '') <> ''
		`;
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
		if (!Array.isArray(list)) return [];
		return [...new Set(list.map(domain => this.normalizeDomain(domain)).filter(Boolean))];
	},

	normalizeDomain(domain) {
		return String(domain || '').replace(/^@/, '').trim().toLowerCase();
	},

	truthy(value) {
		return value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
	},

	nowSqlTime() {
		return new Date().toISOString().slice(0, 19).replace('T', ' ');
	},

	creatorRewardsText(row) {
		if (row.creatorRewardsStatus === 'joined') {
			return row.creatorRewardsJoinedAt ? `已加入 ${row.creatorRewardsJoinedAt}` : '已加入';
		}
		if (row.creatorRewardsStatus === 'rejected') {
			return row.creatorRewardsRetryAt ? `被拒，可重申 ${row.creatorRewardsRetryAt}` : '被拒';
		}
		return '';
	}
};

export default assetService;
