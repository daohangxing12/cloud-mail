import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import { emailConst, isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';
import codeUtils from '../utils/code-utils';
import { decryptSecret, encryptSecret } from '../utils/secret-utils';
import { v4 as uuidv4 } from 'uuid';

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const CREATOR_FOLLOWERS_THRESHOLD = 10000;
const CREATOR_VIEWS_THRESHOLD = 100000;
const CREATOR_STATUS_VALUES = new Set(['已加入', '被拒绝', '已封', '无权限']);

const localAgentService = {
	async ping(c) {
		await this.verifyAgent(c);
		return {
			ok: true,
			serverTime: dayjs().format(DATE_FORMAT),
			domains: this.envDomainList(c.env.domain)
		};
	},

	async mailList(c, params = {}) {
		await this.verifyAgent(c);
		const rows = await this.queryMailRows(c, params, {
			defaultSize: 50,
			maxSize: 200,
			defaultSinceMinutes: params.afterEmailId || params.afterId ? 0 : 1440
		});
		const includeText = this.truthy(params.includeText);
		const includeContent = this.truthy(params.includeContent);
		const list = rows.map(row => this.toMailResult(row, { includeText, includeContent }));
		return {
			list,
			total: list.length,
			nextEmailId: list.reduce((max, row) => Math.max(max, Number(row.emailId || 0)), 0)
		};
	},

	async latestMail(c, params = {}) {
		const data = await this.mailList(c, { ...params, size: 1, order: 'desc' });
		return data.list[0] || null;
	},

	async latestCode(c, params = {}) {
		await this.verifyAgent(c);
		const toEmail = this.normalizeEmail(params.email || params.toEmail || params.username);
		if (!toEmail) {
			throw new BizError('email is required', 400);
		}
		this.verifyEmail(c, toEmail);

		const rows = await this.queryMailRows(c, {
			...params,
			email: toEmail,
			toEmail,
			size: 20,
			order: 'desc'
		}, {
			defaultSize: 20,
			maxSize: 20,
			defaultSinceMinutes: 30
		});

		const includeText = this.truthy(params.includeText);
		const list = rows.map(row => this.toMailResult(row, { includeText }));
		return list.find(item => item.code) || list[0] || null;
	},

	async ensureSubAccountToken(c, params = {}) {
		await this.verifyAgent(c);
		const targetEmail = this.normalizeEmail(params.email || params.toEmail || params.username);
		if (!targetEmail) {
			throw new BizError('email is required', 400);
		}
		this.verifyEmail(c, targetEmail);

		const ensure = this.truthy(params.ensure);
		let created = false;
		let restored = false;
		let row = await c.env.db.prepare(`
			SELECT account_id AS accountId, email, name, user_id AS userId, is_del AS isDel
			FROM account
			WHERE email COLLATE NOCASE = ?
			LIMIT 1
		`).bind(targetEmail).first();

		if (!row && !ensure) {
			throw new BizError('account not found', 404);
		}

		if (!row) {
			const userId = await this.resolveUserId(c, params.userEmail);
			const insertResult = await c.env.db.prepare(`
				INSERT INTO account (email, name, user_id, is_del)
				VALUES (?, ?, ?, ?)
			`).bind(targetEmail, emailUtils.getName(targetEmail), userId, isDel.NORMAL).run();
			row = {
				accountId: insertResult.meta?.last_row_id || null,
				email: targetEmail,
				name: emailUtils.getName(targetEmail),
				userId,
				isDel: isDel.NORMAL
			};
			created = true;
		}

		if (row.isDel === isDel.DELETE) {
			if (!ensure) {
				throw new BizError('account not found', 404);
			}
			await c.env.db.prepare(`
				UPDATE account
				SET is_del = ?, name = CASE WHEN name = '' THEN ? ELSE name END
				WHERE account_id = ?
			`).bind(isDel.NORMAL, emailUtils.getName(targetEmail), row.accountId).run();
			row.isDel = isDel.NORMAL;
			restored = true;
		}

		let token = await c.env.kv.get(KvConst.SUB_ACCOUNT_TOKEN + targetEmail);
		let tokenCreated = false;
		if (!token && ensure) {
			token = uuidv4().replaceAll('-', '');
			await c.env.kv.put(KvConst.SUB_ACCOUNT_TOKEN + targetEmail, token);
			tokenCreated = true;
		}

		return {
			email: targetEmail,
			accountId: row.accountId,
			hasToken: Boolean(token),
			token: token || '',
			created,
			restored,
			tokenCreated
		};
	},

	async markRead(c, params = {}) {
		await this.verifyAgent(c);
		const ids = this.parseIds(params.emailIds || params.ids || params.emailId || params.id);
		if (ids.length === 0) {
			throw new BizError('emailIds is required', 400);
		}
		const placeholders = ids.map(() => '?').join(',');
		const result = await c.env.db.prepare(`
			UPDATE email
			SET unread = ?
			WHERE email_id IN (${placeholders})
			  AND type = ?
			  AND is_del = ?
		`).bind(emailConst.unread.READ, ...ids, emailConst.type.RECEIVE, isDel.NORMAL).run();

		return {
			updated: result.meta?.changes || 0,
			emailIds: ids
		};
	},

	async accountList(c, params = {}) {
		await this.verifyAgent(c);
		const size = this.clampNumber(params.size, 100, 1, 500);
		const afterAccountId = this.clampNumber(params.afterAccountId || params.afterId, 0, 0, Number.MAX_SAFE_INTEGER);
		const domain = this.normalizeDomain(params.domain);
		const includeDeleted = this.truthy(params.includeDeleted);
		const conditions = [];
		const binds = [];

		if (!includeDeleted) {
			conditions.push('is_del = ?');
			binds.push(isDel.NORMAL);
		}
		if (afterAccountId > 0) {
			conditions.push('account_id > ?');
			binds.push(afterAccountId);
		}
		if (domain) {
			this.verifyDomain(c, domain);
			conditions.push("LOWER(SUBSTR(email, INSTR(email, '@') + 1)) = LOWER(?)");
			binds.push(domain);
		} else {
			const domains = this.envDomainList(c.env.domain);
			if (domains.length > 0) {
				conditions.push(`LOWER(SUBSTR(email, INSTR(email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
				binds.push(...domains);
			}
		}

		const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const { results } = await c.env.db.prepare(`
			SELECT
				account_id AS accountId,
				email,
				name,
				window_name AS windowName,
				bit_group_name AS bitGroupName,
				password,
				tiktok_username AS tiktokUsername,
				matrix_account_id AS matrixAccountId,
				bit_browser_id AS bitBrowserId,
				tiktok_followers AS tiktokFollowers,
				tiktok_views AS tiktokViews,
				tiktok_views_text AS tiktokViewsText,
				creator_rewards_status AS creatorStatus,
				creator_rewards_retry_at AS creatorRewardsRetryAt,
				creator_rewards_baseline_followers AS creatorRewardsBaselineFollowers,
				creator_rewards_baseline_views AS creatorRewardsBaselineViews,
				login_status AS loginStatus,
				last_agent_sync_at AS lastAgentSyncAt,
				last_stats_sync_at AS lastStatsSyncAt,
				is_del AS isDel,
				create_time AS createTime
			FROM account
			${whereSql}
			ORDER BY account_id ASC
			LIMIT ?
		`).bind(...binds, size).all();

		const list = await Promise.all((results || []).map(async row => ({
			...row,
			password: await decryptSecret(c?.env?.jwt_secret || '', row.password || ''),
			...this.toCreatorLocalFields(row),
			tiktokUrl: this.buildTikTokUrl(row.tiktokUsername)
		})));

		return {
			list,
			total: list.length,
			nextAccountId: list.reduce((max, row) => Math.max(max, Number(row.accountId || 0)), 0)
		};
	},

	async syncAccount(c, payload = {}) {
		await this.verifyAgent(c);
		const items = this.normalizeSyncItems(payload);
		if (items.length === 0) {
			throw new BizError('sync item is required', 400);
		}

		const createIfMissing = this.truthy(payload.createIfMissing);
		const allowExternalDomain = this.truthy(payload.allowExternalDomain) || this.truthy(payload.assetOnly);
		const results = [];
		let updated = 0;
		let created = 0;
		let skipped = 0;

		for (const item of items) {
			const result = await this.syncOneAccount(c, item, createIfMissing, { allowExternalDomain });
			results.push(result);
			if (result.action === 'updated') updated += 1;
			if (result.action === 'created') created += 1;
			if (result.action === 'skipped') skipped += 1;
		}

		return {
			updated,
			created,
			skipped,
			results
		};
	},

	async deleteAccounts(c, payload = {}) {
		await this.verifyAgent(c);
		const items = this.normalizeSyncItems(payload);
		const accountIds = this.parseIds(payload.accountIds || payload.account_ids || payload.accountId || payload.account_id);
		const emails = new Set();
		const bitBrowserIds = new Set();
		const usernames = new Set();

		for (const item of items) {
			const email = this.normalizeEmail(item.email || item.currentEmail || item.current_email || item.toEmail);
			const bitBrowserId = this.cleanText(item.bitBrowserId || item.bit_browser_id || item.browserId || item.browser_id || item.id);
			const username = this.normalizeTikTokUsername(item.tiktokUsername || item.tiktok_username || item.username || item.primaryUsername || item.primary_username);
			if (email) emails.add(email);
			if (bitBrowserId) bitBrowserIds.add(bitBrowserId);
			if (username) usernames.add(username);
			for (const id of this.parseIds(item.accountIds || item.account_ids || item.accountId || item.account_id)) {
				accountIds.push(id);
			}
		}

		const idList = [...new Set(accountIds)].slice(0, 500);
		const emailList = [...emails].slice(0, 500);
		const bitIdList = [...bitBrowserIds].slice(0, 500);
		const usernameList = [...usernames].slice(0, 500);
		const clauses = [];
		const binds = [];

		if (idList.length) {
			clauses.push(`account_id IN (${idList.map(() => '?').join(',')})`);
			binds.push(...idList);
		}
		if (emailList.length) {
			clauses.push(`LOWER(email) IN (${emailList.map(() => '?').join(',')})`);
			binds.push(...emailList);
		}
		if (bitIdList.length) {
			clauses.push(`bit_browser_id IN (${bitIdList.map(() => '?').join(',')})`);
			binds.push(...bitIdList);
		}
		if (usernameList.length) {
			clauses.push(`LOWER(tiktok_username) IN (${usernameList.map(() => '?').join(',')})`);
			binds.push(...usernameList);
		}

		if (!clauses.length) {
			throw new BizError('delete identifier is required', 400);
		}

		const result = await c.env.db.prepare(`
			UPDATE account
			SET is_del = ?
			WHERE is_del = ?
			  AND (${clauses.join(' OR ')})
		`).bind(isDel.DELETE, isDel.NORMAL, ...binds).run();

		return {
			deleted: result.meta?.changes || 0,
			matched: {
				accountIds: idList.length,
				emails: emailList.length,
				bitBrowserIds: bitIdList.length,
				usernames: usernameList.length
			}
		};
	},

	async syncOneAccount(c, item, defaultCreateIfMissing, options = {}) {
		let email = this.normalizeEmail(item.email || item.currentEmail || item.current_email || item.toEmail);
		const username = this.normalizeTikTokUsername(
			item.tiktokUsername || item.tiktok_username || item.username || item.primaryUsername || item.primary_username
		);
		const bitBrowserId = this.cleanText(item.bitBrowserId || item.bit_browser_id || item.browserId || item.browser_id || item.id);
		if (!email && !username) {
			return { action: 'skipped', reason: 'missing_identity' };
		}

		let emailRejectedReason = '';
		if (email) {
			try {
				this.verifySyncEmail(c, email, options);
			} catch (error) {
				if (!username) {
					throw error;
				}
				emailRejectedReason = error?.message || 'email_rejected';
				email = '';
			}
		}

		const createIfMissing = this.truthy(item.createIfMissing) || defaultCreateIfMissing;
		const now = dayjs().format(DATE_FORMAT);
		let matchedBy = '';
		let existing = null;
		if (email) {
			existing = await this.findAccountForSyncByEmail(c, email);
			if (existing) {
				matchedBy = 'email';
			}
		}

		if (!existing && bitBrowserId) {
			existing = await this.findAccountForSyncByBitBrowserId(c, bitBrowserId);
			if (existing) {
				matchedBy = 'bit_browser_id';
			}
		}

		if (!existing && username) {
			const usernameMatches = await this.findAccountsForSyncByUsername(c, username);
			if (usernameMatches.length === 1) {
				existing = usernameMatches[0];
				matchedBy = 'username';
			} else if (usernameMatches.length > 1) {
				return {
					action: 'skipped',
					email,
					username,
					reason: 'ambiguous_username',
					matched: usernameMatches.length
				};
			}
		}

		if (!existing && !email) {
			return {
				action: 'skipped',
				username,
				reason: emailRejectedReason ? 'email_rejected_unmatched_username' : 'missing_email_unmatched_username',
				emailRejectedReason
			};
		}

		if (existing && existing.isDel === isDel.DELETE && !createIfMissing) {
			return { action: 'skipped', email: email || existing.email, username, reason: 'account_deleted', matchedBy };
		}

		if (!existing && !createIfMissing) {
			return { action: 'skipped', email, username, reason: 'account_not_found' };
		}

		const values = this.buildAccountSyncValues(item, existing || {}, now);
		const storedPassword = await this.normalizePassword(c, values.password, existing?.password || '');

		if (!existing) {
			const userId = await this.resolveUserId(c, item.userEmail);
			const insertResult = await c.env.db.prepare(`
				INSERT INTO account (
					email,
					name,
					window_name,
					bit_group_name,
					password,
					tiktok_username,
					matrix_account_id,
					bit_browser_id,
					tiktok_followers,
					tiktok_views,
					tiktok_views_text,
					login_status,
					last_agent_sync_at,
					last_stats_sync_at,
					user_id,
					is_del
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				email,
				values.name || emailUtils.getName(email),
				values.windowName,
				values.bitGroupName,
				storedPassword,
				values.tiktokUsername,
				values.matrixAccountId,
				values.bitBrowserId,
				values.tiktokFollowers,
				values.tiktokViews,
				values.tiktokViewsText,
				values.loginStatus,
				now,
				values.hasStats ? now : '',
				userId,
				isDel.NORMAL
			).run();

			return {
				action: 'created',
				email,
				username,
				matchedBy: 'email',
				accountId: insertResult.meta?.last_row_id || null,
				...this.toCreatorLocalFields({
					tiktokFollowers: values.tiktokFollowers,
					tiktokViews: values.tiktokViews,
					creatorStatus: '',
					creatorRewardsRetryAt: '',
					creatorRewardsBaselineFollowers: 0,
					creatorRewardsBaselineViews: 0
				})
			};
		}

		await c.env.db.prepare(`
			UPDATE account
			SET
				name = ?,
				window_name = ?,
				bit_group_name = ?,
				password = ?,
				tiktok_username = ?,
				matrix_account_id = ?,
				bit_browser_id = ?,
				tiktok_followers = ?,
				tiktok_views = ?,
				tiktok_views_text = ?,
				login_status = ?,
				last_agent_sync_at = ?,
				last_stats_sync_at = ?,
				is_del = ?
			WHERE account_id = ?
		`).bind(
			values.name,
			values.windowName,
			values.bitGroupName,
			storedPassword,
			values.tiktokUsername,
			values.matrixAccountId,
			values.bitBrowserId,
			values.tiktokFollowers,
			values.tiktokViews,
			values.tiktokViewsText,
			values.loginStatus,
			now,
			values.hasStats ? now : (existing.lastStatsSyncAt || ''),
			isDel.NORMAL,
			existing.accountId
		).run();

		return {
			action: 'updated',
			email: existing.email || email,
			username,
			matchedBy,
			accountId: existing.accountId,
			...this.toCreatorLocalFields({
				...existing,
				tiktokFollowers: values.tiktokFollowers,
				tiktokViews: values.tiktokViews
			})
		};
	},

	accountSyncSelectSql() {
		return `
			SELECT
				account_id AS accountId,
				email,
				name,
				window_name AS windowName,
				bit_group_name AS bitGroupName,
				password,
				tiktok_username AS tiktokUsername,
				matrix_account_id AS matrixAccountId,
				bit_browser_id AS bitBrowserId,
				tiktok_followers AS tiktokFollowers,
				tiktok_views AS tiktokViews,
				tiktok_views_text AS tiktokViewsText,
				creator_rewards_status AS creatorStatus,
				creator_rewards_retry_at AS creatorRewardsRetryAt,
				creator_rewards_baseline_followers AS creatorRewardsBaselineFollowers,
				creator_rewards_baseline_views AS creatorRewardsBaselineViews,
				login_status AS loginStatus,
				last_agent_sync_at AS lastAgentSyncAt,
				last_stats_sync_at AS lastStatsSyncAt,
				user_id AS userId,
				is_del AS isDel
			FROM account`;
	},

	async findAccountForSyncByEmail(c, email) {
		return c.env.db.prepare(`
			${this.accountSyncSelectSql()}
			WHERE email COLLATE NOCASE = ?
			LIMIT 1
		`).bind(email).first();
	},

	async findAccountForSyncByBitBrowserId(c, bitBrowserId) {
		return c.env.db.prepare(`
			${this.accountSyncSelectSql()}
			WHERE is_del = ?
			  AND bit_browser_id = ?
			LIMIT 1
		`).bind(isDel.NORMAL, bitBrowserId).first();
	},

	async findAccountsForSyncByUsername(c, username) {
		const { results } = await c.env.db.prepare(`
			${this.accountSyncSelectSql()}
			WHERE is_del = ?
			  AND LOWER(tiktok_username) = LOWER(?)
			LIMIT 3
		`).bind(isDel.NORMAL, username).all();
		return results || [];
	},

	toCreatorLocalFields(row = {}) {
		const followers = Number(row.tiktokFollowers || 0);
		const views = Number(row.tiktokViews || 0);
		const baselineFollowers = Number(row.creatorRewardsBaselineFollowers || 0);
		const baselineViews = Number(row.creatorRewardsBaselineViews || 0);
		const creatorStatus = this.normalizeCreatorStatus(row.creatorStatus);
		const creatorRetryAt = String(row.creatorRewardsRetryAt || '').trim();
		const creatorWindowFollowers = Math.max(0, followers - baselineFollowers);
		const creatorWindowViews = Math.max(0, views - baselineViews);
		const creatorRetryReady = Boolean(creatorRetryAt)
			&& dayjs().isAfter(dayjs(creatorRetryAt))
			&& followers >= CREATOR_FOLLOWERS_THRESHOLD
			&& creatorWindowViews >= CREATOR_VIEWS_THRESHOLD;
		const mvSyncState = creatorRetryReady ? 'ready' : (creatorStatus === '已加入' ? 'joined' : '');
		const mvSyncText = creatorRetryReady ? '可再试' : creatorStatus;
		return {
			creatorStatus,
			creatorRewardsRetryAt: creatorRetryAt,
			creatorWindowFollowers,
			creatorWindowViews,
			creatorRetryReady,
			mv_sync_state: mvSyncState,
			mv_sync_text: mvSyncText,
			mv_status: creatorStatus,
			rejoin_display: mvSyncText
		};
	},

	buildAccountSyncValues(item, existing, now) {
		const username = this.normalizeTikTokUsername(
			item.tiktokUsername || item.username || item.primaryUsername || item.primary_username
		);
		const hasFollowers = this.hasValue(item, ['followers', 'fans', 'fansCurrent', 'fans_current', 'tiktokFollowers']);
		const hasViews = this.hasValue(item, ['views', 'viewsCurrent', 'views_current', 'tiktokViews']);
		const viewsText = this.cleanText(item.viewsText || item.views_text || item.viewsCurrentText || item.views_current_text);
		const hasStats = hasFollowers || hasViews || Boolean(viewsText);
		const followersMetric = item.tiktokFollowers ?? item.followers ?? item.fansCurrent ?? item.fans_current ?? item.fans;
		const viewsMetric = item.tiktokViews ?? item.viewsCurrent ?? item.views_current ?? item.views;
		const remarkKeys = [
			'remark',
			'bitRemark',
			'bit_remark',
			'browserRemark',
			'browser_remark',
			'note',
			'notes',
			'memo',
			'description'
		];
		const hasRemarkField = remarkKeys.some(key => Object.prototype.hasOwnProperty.call(item, key));
		const remarkValue = remarkKeys
			.map(key => item[key])
			.find(value => value !== undefined && value !== null && String(value).trim() !== '');
		const remark = this.cleanText(remarkValue ?? (hasRemarkField ? '' : undefined));
		const legacyName = this.cleanText(item.name || '');
		const windowName = this.cleanText(
			item.windowName
			|| item.window_name
			|| item.browserName
			|| item.browser_name
			|| item.displayName
			|| item.display_name
			|| item.apiName
			|| item.api_name
			|| ''
		);

		return {
			name: hasRemarkField ? remark : (legacyName || existing.name || ''),
			windowName: windowName || legacyName || existing.windowName || '',
			bitGroupName: this.cleanText(item.bitGroupName || item.bit_group_name || item.groupName || item.group_name || existing.bitGroupName || ''),
			password: this.cleanText(item.password || item.loginPassword || item.login_password || ''),
			tiktokUsername: username || existing.tiktokUsername || '',
			matrixAccountId: this.cleanText(item.matrixAccountId || item.matrix_account_id || item.accountId || item.account_id || existing.matrixAccountId || ''),
			bitBrowserId: this.cleanText(item.bitBrowserId || item.bit_browser_id || item.browserId || item.browser_id || existing.bitBrowserId || ''),
			tiktokFollowers: hasFollowers ? this.parseMetric(followersMetric) : Number(existing.tiktokFollowers || 0),
			tiktokViews: hasViews ? this.parseMetric(viewsMetric) : Number(existing.tiktokViews || 0),
			tiktokViewsText: viewsText || existing.tiktokViewsText || '',
			loginStatus: this.cleanText(item.loginStatus || item.login_status || item.status || existing.loginStatus || ''),
			hasStats,
			now
		};
	},

	async normalizePassword(c, password, fallback = '') {
		const text = this.cleanText(password);
		if (!text) {
			return String(fallback || '');
		}
		return encryptSecret(c?.env?.jwt_secret || '', text);
	},

	async queryMailRows(c, params, options = {}) {
		const size = this.clampNumber(params.size, options.defaultSize || 50, 1, options.maxSize || 200);
		const sinceMinutes = this.clampNumber(params.sinceMinutes, options.defaultSinceMinutes ?? 1440, 0, 10080);
		const afterEmailId = this.clampNumber(params.afterEmailId || params.afterId, 0, 0, Number.MAX_SAFE_INTEGER);
		const toEmail = this.normalizeEmail(params.email || params.toEmail || params.username);
		const fromEmail = this.cleanText(params.fromEmail || params.sender || '');
		const subject = this.cleanText(params.subject || '');
		const domain = this.normalizeDomain(params.domain);
		const order = String(params.order || (afterEmailId > 0 ? 'asc' : 'desc')).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
		const conditions = [
			'type = ?',
			'is_del = ?',
			'status IN (?, ?)'
		];
		const binds = [
			emailConst.type.RECEIVE,
			isDel.NORMAL,
			emailConst.status.RECEIVE,
			emailConst.status.NOONE
		];

		if (toEmail) {
			this.verifyEmail(c, toEmail);
			conditions.push('to_email COLLATE NOCASE = ?');
			binds.push(toEmail);
		} else if (domain) {
			this.verifyDomain(c, domain);
			conditions.push("LOWER(SUBSTR(to_email, INSTR(to_email, '@') + 1)) = LOWER(?)");
			binds.push(domain);
		} else {
			const domains = this.envDomainList(c.env.domain);
			if (domains.length > 0) {
				conditions.push(`LOWER(SUBSTR(to_email, INSTR(to_email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
				binds.push(...domains);
			}
		}

		if (afterEmailId > 0) {
			conditions.push('email_id > ?');
			binds.push(afterEmailId);
		}
		if (sinceMinutes > 0) {
			conditions.push('create_time >= ?');
			binds.push(dayjs().subtract(sinceMinutes, 'minute').format(DATE_FORMAT));
		}
		if (fromEmail) {
			if (verifyUtils.isEmail(fromEmail)) {
				conditions.push('send_email COLLATE NOCASE = ?');
				binds.push(fromEmail);
			} else {
				conditions.push('send_email COLLATE NOCASE LIKE ?');
				binds.push(`%${fromEmail}`);
			}
		}
		if (subject) {
			conditions.push('subject COLLATE NOCASE LIKE ?');
			binds.push(`%${subject}%`);
		}
		this.applySpamFilter(conditions, binds, params.spam ?? params.isSpam);
		if (this.truthy(params.unread)) {
			conditions.push('unread = ?');
			binds.push(emailConst.unread.UNREAD);
		}

		const { results } = await c.env.db.prepare(`
			SELECT
				email_id AS emailId,
				to_email AS toEmail,
				to_name AS toName,
				send_email AS fromEmail,
				name AS fromName,
				subject,
				code,
				text,
				content,
				unread,
				is_spam AS isSpam,
				status,
				create_time AS createTime
			FROM email
			WHERE ${conditions.join(' AND ')}
			ORDER BY email_id ${order}
			LIMIT ?
		`).bind(...binds, size).all();

		return results || [];
	},

	applySpamFilter(conditions, binds, value) {
		const mode = String(value ?? 'all').trim().toLowerCase();
		if (['0', 'normal', 'false'].includes(mode)) {
			conditions.push('is_spam = ?');
			binds.push(emailConst.spam.NORMAL);
		}
		if (['1', 'spam', 'true'].includes(mode)) {
			conditions.push('is_spam = ?');
			binds.push(emailConst.spam.SPAM);
		}
	},

	toMailResult(row, options = {}) {
		const data = {
			emailId: row.emailId,
			email: row.toEmail,
			toEmail: row.toEmail,
			toName: row.toName || '',
			fromEmail: row.fromEmail || '',
			fromName: row.fromName || '',
			subject: row.subject || '',
			code: codeUtils.extract(row),
			unread: Number(row.unread || 0),
			isUnread: Number(row.unread || 0) === emailConst.unread.UNREAD,
			isSpam: Number(row.isSpam || 0),
			status: Number(row.status || 0),
			createTime: row.createTime || ''
		};

		if (options.includeText) {
			data.text = codeUtils.toSnippet(row);
		}
		if (options.includeContent) {
			data.content = row.content || '';
		}
		return data;
	},

	async resolveUserId(c, userEmail) {
		const email = this.normalizeEmail(userEmail || c.env.admin);
		const row = await c.env.db.prepare(`
			SELECT user_id AS userId
			FROM user
			WHERE email COLLATE NOCASE = ?
			  AND is_del = ?
			LIMIT 1
		`).bind(email, isDel.NORMAL).first();

		if (!row) {
			throw new BizError('admin user not found', 500);
		}
		return row.userId;
	},

	async verifyAgent(c) {
		const validTokens = await this.validAgentTokens(c);
		if (validTokens.length === 0) {
			throw new BizError('local agent token is not configured', 503);
		}

		const token = this.extractToken(c);
		if (!token || !validTokens.includes(token)) {
			throw new BizError('local agent token verification failed', 401);
		}
	},

	async validAgentTokens(c) {
		const tokens = [
			c.env.LOCAL_AGENT_TOKEN,
			c.env.local_agent_token,
			c.env.AGENT_TOKEN,
			c.env.agent_token
		];

		try {
			tokens.push(await c.env.kv.get(KvConst.LOCAL_AGENT_TOKEN));
		} catch (e) {
			console.warn(`local agent kv token unavailable: ${e.message}`);
		}

		return [...new Set(tokens.map(token => this.normalizeToken(token)).filter(Boolean))];
	},

	extractToken(c) {
		const query = c.req.query();
		return this.normalizeToken(
			c.req.header('x-agent-token') ||
			c.req.header('x-ntteam-token') ||
			c.req.header(constant.TOKEN_HEADER) ||
			query.token ||
			query.key
		);
	},

	normalizeToken(token) {
		let value = String(token || '').trim();
		if (value.toLowerCase().startsWith('bearer ')) {
			value = value.slice(7).trim();
		}
		return value;
	},

	normalizeSyncItems(payload) {
		if (Array.isArray(payload)) {
			return payload;
		}
		if (Array.isArray(payload.items)) {
			return payload.items;
		}
		if (Array.isArray(payload.accounts)) {
			return payload.accounts;
		}
		return [payload].filter(item => item && typeof item === 'object');
	},

	parseIds(value) {
		const source = Array.isArray(value) ? value : String(value || '').split(',');
		return [...new Set(source
			.map(item => Number(item))
			.filter(item => Number.isInteger(item) && item > 0)
		)].slice(0, 200);
	},

	hasValue(item, keys) {
		return keys.some(key => item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '');
	},

	parseMetric(value) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return Math.max(0, Math.round(value));
		}
		let text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
		if (/^\d+,\d+(亿|万|w|k|m|b|tsd\.?|mio\.?)?$/.test(text)) {
			text = text.replace(',', '.');
		} else {
			text = text.replaceAll(',', '');
		}
		if (!text) return 0;
		const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(亿|万|w|k|m|b|tsd\.?|mio\.?)?/i);
		if (!match) return 0;
		const base = Number(match[1]);
		if (!Number.isFinite(base)) return 0;
		const unit = String(match[2] || '').toLowerCase();
		const factor = unit === '万' || unit === 'w'
			? 10000
			: unit === '亿'
				? 100000000
				: unit === 'k' || unit === 'tsd' || unit === 'tsd.'
					? 1000
					: unit === 'm' || unit === 'mio' || unit === 'mio.'
						? 1000000
						: unit === 'b'
							? 1000000000
							: 1;
		return Math.max(0, Math.round(base * factor));
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
		if (text.includes('宸插姞鍏')) return '已加入';
		if (text.includes('琚') && text.includes('嫆')) return '被拒绝';
		if (text.includes('宸插皝')) return '已封';
		if (text.includes('鏃犳潈')) return '无权限';
		return CREATOR_STATUS_VALUES.has(text) ? text : '';
	},

	buildTikTokUrl(username) {
		const value = this.normalizeTikTokUsername(username);
		return value ? `https://www.tiktok.com/@${value}` : '';
	},

	verifySyncEmail(c, email, options = {}) {
		if (!verifyUtils.isEmail(email)) {
			throw new BizError('invalid email', 400);
		}
		if (options.allowExternalDomain) {
			return;
		}
		this.verifyDomain(c, emailUtils.getDomain(email));
	},

	verifyEmail(c, email) {
		if (!verifyUtils.isEmail(email)) {
			throw new BizError('invalid email', 400);
		}
		this.verifyDomain(c, emailUtils.getDomain(email));
	},

	verifyDomain(c, domain) {
		const normalizedDomain = this.normalizeDomain(domain);
		if (!this.envDomainList(c.env.domain).includes(normalizedDomain)) {
			throw new BizError('invalid email domain', 400);
		}
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

	normalizeDomain(domain) {
		return String(domain || '').replace(/^@/, '').trim().toLowerCase();
	},

	normalizeEmail(email) {
		return String(email || '').trim().toLowerCase();
	},

	cleanText(value) {
		return String(value || '').trim();
	},

	truthy(value) {
		return value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
	},

	clampNumber(value, defaultValue, min, max) {
		const num = Number(value);
		if (!Number.isFinite(num)) {
			return defaultValue;
		}
		return Math.max(min, Math.min(max, Math.floor(num)));
	}
};

export default localAgentService;
