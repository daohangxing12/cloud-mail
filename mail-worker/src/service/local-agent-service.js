/*
 * STABLE GUARD:
 * 本服务支撑本地软件的全局收件箱读取、TikTok 验证码接码、子邮箱 Token、资产同步。
 * 禁止删除 mail/list、code/latest、sub-account/token、account/sync 等稳定链路。
 * 修改前必须先阅读 cloud-mail/AGENTS.md 和 STABLE_FEATURES_DO_NOT_BREAK.md。
 */
import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import { emailConst, isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';
import codeUtils from '../utils/code-utils';
import { v4 as uuidv4 } from 'uuid';
import subAccountService from './sub-account-service';

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

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
				tiktok_username AS tiktokUsername,
				matrix_account_id AS matrixAccountId,
				bit_browser_id AS bitBrowserId,
				tiktok_followers AS tiktokFollowers,
				tiktok_views AS tiktokViews,
				tiktok_views_text AS tiktokViewsText,
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

		const list = (results || []).map(row => ({
			...row,
			tiktokUrl: this.buildTikTokUrl(row.tiktokUsername)
		}));

		return {
			list,
			total: list.length,
			nextAccountId: list.reduce((max, row) => Math.max(max, Number(row.accountId || 0)), 0)
		};
	},

	async subAccountToken(c, params = {}) {
		await this.verifyAgent(c);
		const targetEmail = this.normalizeEmail(params.email || params.toEmail || params.username);
		if (!targetEmail) {
			throw new BizError('email is required', 400);
		}
		this.verifyEmail(c, targetEmail);

		const row = await c.env.db.prepare(`
			SELECT
				account_id AS accountId,
				email,
				is_del AS isDel
			FROM account
			WHERE email COLLATE NOCASE = ?
			LIMIT 1
		`).bind(targetEmail).first();

		if (!row || Number(row.isDel) === isDel.DELETE) {
			if (this.truthy(params.ensure || params.ensureToken || params.generate || params.createIfMissing || params.create_if_missing)) {
				const created = await subAccountService.ensureManagedEmailForAgent(c, {
					email: targetEmail,
					userEmail: params.userEmail || c.env.admin,
					source: 'login-agent',
					ensureToken: true
				});
				return {
					accountId: created.accountId,
					email: targetEmail,
					hasToken: created.hasToken,
					token: created.token || '',
					generated: created.generatedToken,
					created: created.action === 'created',
					restored: created.action === 'restored',
					action: created.action
				};
			}
			throw new BizError('account not found', 404);
		}

		let token = await c.env.kv.get(KvConst.SUB_ACCOUNT_TOKEN + targetEmail);
		let generated = false;
		if (!token && this.truthy(params.ensure || params.ensureToken || params.generate)) {
			token = uuidv4().replaceAll('-', '');
			await c.env.kv.put(KvConst.SUB_ACCOUNT_TOKEN + targetEmail, token);
			generated = true;
		}
		return {
			accountId: row.accountId,
			email: targetEmail,
			hasToken: !!token,
			token: token || '',
			generated
		};
	},

	async syncAccount(c, payload = {}) {
		await this.verifyAgent(c);
		const items = this.normalizeSyncItems(payload);
		if (items.length === 0) {
			throw new BizError('sync item is required', 400);
		}

		const createIfMissing = this.resolveCreateIfMissing(payload, true);
		const results = [];
		let updated = 0;
		let created = 0;
		let skipped = 0;

		for (const item of items) {
			const result = await this.syncOneAccount(c, item, createIfMissing);
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

	async syncOneAccount(c, item, defaultCreateIfMissing) {
		const email = this.normalizeEmail(item.email || item.currentEmail || item.toEmail);
		if (!email) {
			return { action: 'skipped', reason: 'missing_email' };
		}
		this.verifyEmail(c, email);

		const createIfMissing = this.resolveCreateIfMissing(item, defaultCreateIfMissing);
		const now = dayjs().format(DATE_FORMAT);
		const existing = await c.env.db.prepare(`
			SELECT
				account_id AS accountId,
				email,
				name,
				tiktok_username AS tiktokUsername,
				matrix_account_id AS matrixAccountId,
				bit_browser_id AS bitBrowserId,
				tiktok_followers AS tiktokFollowers,
				tiktok_views AS tiktokViews,
				tiktok_views_text AS tiktokViewsText,
				login_status AS loginStatus,
				last_agent_sync_at AS lastAgentSyncAt,
				last_stats_sync_at AS lastStatsSyncAt,
				user_id AS userId,
				is_del AS isDel
			FROM account
			WHERE email COLLATE NOCASE = ?
			LIMIT 1
		`).bind(email).first();

		if (existing && existing.isDel === isDel.DELETE && !createIfMissing) {
			return { action: 'skipped', email, reason: 'account_deleted' };
		}

		if (!existing && !createIfMissing) {
			return { action: 'skipped', email, reason: 'account_not_found' };
		}

		if (createIfMissing && (!existing || Number(existing.isDel) === isDel.DELETE) && !this.isManagedAutoCreateEmail(c, email)) {
			return { action: 'skipped', email, reason: 'domain_not_allowed_for_auto_create' };
		}

		const values = this.buildAccountSyncValues(item, existing || {}, now);

		if (!existing) {
			const userId = await this.resolveUserId(c, item.userEmail);
			const insertResult = await c.env.db.prepare(`
				INSERT INTO account (
					email,
					name,
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
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(
				email,
				emailUtils.getName(email),
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
				accountId: insertResult.meta?.last_row_id || null
			};
		}

		await c.env.db.prepare(`
			UPDATE account
			SET
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
			email,
			accountId: existing.accountId
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
		const shouldSyncStats = hasStats && this.shouldSyncStats(item, existing, now);

		return {
			tiktokUsername: username || existing.tiktokUsername || '',
			matrixAccountId: this.cleanText(item.matrixAccountId || item.matrix_account_id || item.accountId || item.account_id || existing.matrixAccountId || ''),
			bitBrowserId: this.cleanText(item.bitBrowserId || item.bit_browser_id || item.browserId || item.browser_id || existing.bitBrowserId || ''),
			tiktokFollowers: shouldSyncStats && hasFollowers ? this.parseMetric(item.followers ?? item.fans ?? item.fansCurrent ?? item.fans_current ?? item.tiktokFollowers) : Number(existing.tiktokFollowers || 0),
			tiktokViews: shouldSyncStats && hasViews ? this.parseMetric(item.views ?? item.viewsCurrent ?? item.views_current ?? item.tiktokViews) : Number(existing.tiktokViews || 0),
			tiktokViewsText: shouldSyncStats && viewsText ? viewsText : existing.tiktokViewsText || '',
			loginStatus: this.cleanText(item.loginStatus || item.login_status || item.status || existing.loginStatus || ''),
			hasStats: shouldSyncStats,
			now
		};
	},

	shouldSyncStats(item, existing, now) {
		const forceStats = ['forceStatsSync', 'force_stats_sync', 'statsForce', 'stats_force']
			.some(key => this.truthy(item[key]));
		if (forceStats) {
			return true;
		}

		const hasExistingStats = Number(existing.tiktokFollowers || 0) > 0
			|| Number(existing.tiktokViews || 0) > 0
			|| Boolean(this.cleanText(existing.tiktokViewsText || ''));
		if (!hasExistingStats) {
			return true;
		}

		const lastStatsSyncAt = this.cleanText(existing.lastStatsSyncAt || '');
		if (!lastStatsSyncAt) {
			return true;
		}

		const lastDay = dayjs(lastStatsSyncAt).format('YYYY-MM-DD');
		const currentDay = dayjs(now).format('YYYY-MM-DD');
		return lastDay !== currentDay;
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

	isManagedAutoCreateEmail(c, email) {
		try {
			subAccountService.verifyManagedEmail(c, email);
			return true;
		} catch (e) {
			return false;
		}
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
		const text = String(value || '').trim().replaceAll(',', '');
		if (!text) return 0;
		const match = text.match(/([\d.]+)\s*(万|w|k|m|b)?/i);
		if (!match) return 0;
		const base = Number(match[1]);
		if (!Number.isFinite(base)) return 0;
		const unit = String(match[2] || '').toLowerCase();
		const factor = unit === '万' || unit === 'w' ? 10000 : unit === 'k' ? 1000 : unit === 'm' ? 1000000 : unit === 'b' ? 1000000000 : 1;
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

	buildTikTokUrl(username) {
		const value = this.normalizeTikTokUsername(username);
		return value ? `https://www.tiktok.com/@${value}` : '';
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

	resolveCreateIfMissing(source, fallback = false) {
		if (!source || typeof source !== 'object') {
			return Boolean(fallback);
		}
		if (Object.prototype.hasOwnProperty.call(source, 'createIfMissing')) {
			return this.truthy(source.createIfMissing);
		}
		if (Object.prototype.hasOwnProperty.call(source, 'create_if_missing')) {
			return this.truthy(source.create_if_missing);
		}
		return Boolean(fallback);
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
