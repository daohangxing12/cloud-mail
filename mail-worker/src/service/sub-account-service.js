import BizError from '../error/biz-error';
import { emailConst, isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';
import userService from './user-service';
import accountService from './account-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { eq } from 'drizzle-orm';
import userContext from '../security/user-context';
import { t } from '../i18n/i18n';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';
import { CREATOR_STATUS } from './creator-rewards-service';

const MAX_IMPORT_COUNT = 200;
const SUSPICIOUS_TIKTOK_USERNAMES = new Set([
	'account',
	'accounts',
	'activity',
	'analytics',
	'app',
	'apps',
	'body',
	'button',
	'cdn',
	'cdn.com',
	'code',
	'com',
	'comment',
	'comments',
	'confirm',
	'css',
	'device',
	'email',
	'font',
	'fonts',
	'help',
	'html',
	'https',
	'http',
	'login',
	'location',
	'mail',
	'message',
	'notification',
	'notifications',
	'post',
	'privacy',
	'problem',
	'register',
	'report',
	'security',
	'service',
	'settings',
	'style',
	'support',
	'technology',
	'time',
	'tiktok',
	'user',
	'users',
	'valid',
	'verification',
	'verify',
	'video',
	'was',
	'www',
	'your',
	'you'
]);

const subAccountService = {
	async list(c, params) {
		let { num, size, email, name, domain, userEmail, isDel: isDelParam, creatorStatus } = params;
		num = Number(num || 1);
		size = Number(size || 20);
		if (Number.isNaN(num) || num < 1) num = 1;
		if (Number.isNaN(size) || size < 1) size = 20;
		if (size > 100) size = 100;

		const where = [];
		const binds = [];

		if (isDelParam === undefined || isDelParam === '') {
			where.push('a.is_del = ?');
			binds.push(isDel.NORMAL);
		} else {
			const isDelValue = Number(isDelParam);
			if (!Number.isNaN(isDelValue) && isDelValue >= 0) {
				where.push('a.is_del = ?');
				binds.push(isDelValue);
			}
		}

		if (email) {
			where.push('a.email COLLATE NOCASE LIKE ?');
			binds.push(`%${email}%`);
		}

		if (name) {
			where.push('a.name COLLATE NOCASE LIKE ?');
			binds.push(`%${name}%`);
		}

		if (userEmail) {
			where.push('u.email COLLATE NOCASE LIKE ?');
			binds.push(`%${userEmail}%`);
		}

		if (domain) {
			const normalizedDomain = String(domain).replace(/^@/, '').trim();
			where.push("LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1)) = LOWER(?)");
			binds.push(normalizedDomain);
		}

		const normalizedCreatorStatus = this.normalizeCreatorStatus(creatorStatus);
		if (normalizedCreatorStatus) {
			where.push('a.creator_rewards_status = ?');
			binds.push(normalizedCreatorStatus);
		}

		const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
		const offset = (num - 1) * size;
		const orderSql = this.orderSql(params);
		const countSql = `
			SELECT COUNT(*) AS total
			FROM account a
			LEFT JOIN user u ON u.user_id = a.user_id
			${whereSql}
		`;
		const listSql = `
			SELECT
				a.account_id AS accountId,
				a.email,
				a.name,
				a.password AS password,
				a.tiktok_username AS tiktokUsername,
				a.creator_rewards_status AS creatorStatus,
				a.creator_rewards_retry_at AS creatorRewardsRetryAt,
				a.creator_rewards_last_checked_at AS creatorRewardsLastCheckedAt,
				a.device_no AS deviceNo,
				a.status,
				a.latest_email_time AS latestEmailTime,
				a.create_time AS createTime,
				a.user_id AS userId,
				a.all_receive AS allReceive,
				a.sort,
				a.is_del AS isDel,
				u.email AS userEmail
			FROM account a
			LEFT JOIN user u ON u.user_id = a.user_id
			${whereSql}
			${orderSql}
			LIMIT ? OFFSET ?
		`;

		const [countRow, { results }] = await Promise.all([
			c.env.db.prepare(countSql).bind(...binds).first(),
			c.env.db.prepare(listSql).bind(...binds, size, offset).all()
		]);

		const rows = await this.attachAccountInsights(c, results);
		return { list: await this.attachTokenStatus(c, rows), total: countRow?.total || 0 };
	},

	async add(c, params) {
		const targetUser = await this.resolveTargetUser(c, params);
		return this.addOne(c, params.email, targetUser.userId, params.name);
	},

	async importList(c, params) {
		const targetUser = await this.resolveTargetUser(c, params);
		const emails = this.parseImportEmails(params.text || params.emails || '');

		if (emails.length === 0) {
			throw new BizError(t('emptyEmail'));
		}

		if (emails.length > MAX_IMPORT_COUNT) {
			throw new BizError(`Too many emails. Max ${MAX_IMPORT_COUNT}.`);
		}

		const success = [];
		const failed = [];

		for (const email of emails) {
			try {
				const row = await this.addOne(c, email, targetUser.userId);
				success.push(row.email);
			} catch (e) {
				failed.push({ email, message: e.message });
			}
		}

		return { success, failed, total: emails.length };
	},

	async setName(c, params) {
		const { accountId, name } = params;
		if (!accountId) {
			throw new BizError('accountId required');
		}
		if (name && name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({ name: name || '' }).where(eq(account.accountId, Number(accountId))).run();
	},

	async setTikTok(c, params) {
		const { accountId } = params;
		const accountRow = await this.resolveAccount(c, accountId);
		const tiktokUsername = this.parseTikTokInput(params.tiktokUsername ?? params.username ?? '');
		await orm(c)
			.update(account)
			.set({ tiktokUsername })
			.where(eq(account.accountId, accountRow.accountId))
			.run();
		return { tiktokUsername, tiktokUrl: this.buildTikTokUrl(tiktokUsername) };
	},

	async setCreatorStatus(c, params) {
		const { accountId } = params;
		const accountRow = await this.resolveAccount(c, accountId);
		const creatorStatus = this.normalizeCreatorStatus(params.creatorStatus ?? params.status ?? '');
		await c.env.db.prepare(`
			UPDATE account
			SET creator_rewards_status = ?
			WHERE account_id = ?
		`).bind(creatorStatus, accountRow.accountId).run();
		return { creatorStatus };
	},

	async setDeviceNo(c, params) {
		const { accountId } = params;
		const accountRow = await this.resolveAccount(c, accountId);
		const deviceNo = String(params.deviceNo ?? params.device_no ?? '').trim().slice(0, 60);
		await c.env.db.prepare(`
			UPDATE account
			SET device_no = ?, device_updated_at = CURRENT_TIMESTAMP
			WHERE account_id = ?
		`).bind(deviceNo, accountRow.accountId).run();
		return { deviceNo };
	},

	async genToken(c, params) {
		const accountRow = await this.resolveAccount(c, params.accountId);
		const token = uuidv4().replaceAll('-', '');
		await c.env.kv.put(this.tokenKey(accountRow.email), token);
		return { token, hasToken: true };
	},

	async getToken(c, params) {
		const accountRow = await this.resolveAccount(c, params.accountId);
		const token = await c.env.kv.get(this.tokenKey(accountRow.email));
		if (!token) {
			return { token: '', hasToken: false };
		}
		return { token, hasToken: true };
	},

	async delete(c, params) {
		const accountIds = String(params.accountIds || params.accountId || '')
			.split(',')
			.map(item => Number(item.trim()))
			.filter(Boolean);

		if (accountIds.length === 0) {
			throw new BizError('accountId required');
		}

		const placeholders = accountIds.map(() => '?').join(',');
		const { results } = await c.env.db.prepare(`
			SELECT a.account_id AS accountId, a.email, u.email AS userEmail
			FROM account a
			LEFT JOIN user u ON u.user_id = a.user_id
			WHERE a.account_id IN (${placeholders})
		`).bind(...accountIds).all();

		const protectedIds = results
			.filter(row => row.email && row.userEmail && row.email.toLowerCase() === row.userEmail.toLowerCase())
			.map(row => row.accountId);
		const deleteIds = accountIds.filter(id => !protectedIds.includes(id));

		if (deleteIds.length > 0) {
			const deletePlaceholders = deleteIds.map(() => '?').join(',');
			await c.env.db.prepare(`UPDATE account SET is_del = ? WHERE account_id IN (${deletePlaceholders})`)
				.bind(isDel.DELETE, ...deleteIds)
				.run();
			const deleteRows = results.filter(row => deleteIds.includes(row.accountId));
			await Promise.all(deleteRows.map(row => c.env.kv.delete(this.tokenKey(row.email))));
		}

		return { deleted: deleteIds.length, protected: protectedIds.length };
	},

	async attachTokenStatus(c, list) {
		const rows = list || [];
		const values = await Promise.all(rows.map(row => c.env.kv.get(this.tokenKey(row.email))));
		return rows.map((row, index) => ({
			...row,
			hasToken: !!values[index],
			token: values[index] || ''
		}));
	},

	async attachAccountInsights(c, list) {
		const rows = list || [];
		const emails = [...new Set(rows
			.filter(row => !this.normalizeTikTokUsername(row.tiktokUsername))
			.map(row => this.normalizeEmail(row.email))
			.filter(Boolean))];
		if (emails.length === 0) {
			return rows.map(row => this.withTikTokUrl(row));
		}

		const placeholders = emails.map(() => '?').join(',');
		const { results: latestRows } = await c.env.db.prepare(`
			SELECT toEmail, subject, text, content, emailId
			FROM (
				SELECT
					LOWER(to_email) AS toEmail,
					subject,
					text,
					content,
					email_id AS emailId,
					ROW_NUMBER() OVER (PARTITION BY LOWER(to_email) ORDER BY email_id DESC) AS rn
				FROM email
				WHERE type = ?
					AND is_del = ?
					AND status <> ?
					AND is_spam = ?
					AND LOWER(to_email) IN (${placeholders})
			)
			WHERE rn <= 5
			ORDER BY toEmail, emailId DESC
		`).bind(
			emailConst.type.RECEIVE,
			isDel.NORMAL,
			emailConst.status.SAVING,
			emailConst.spam.NORMAL,
			...emails
		).all();

		const tiktokMap = {};
		for (const row of latestRows || []) {
			if (tiktokMap[row.toEmail]) continue;
			const username = this.extractTikTokUsername(row, { strictBinding: true });
			if (username) {
				tiktokMap[row.toEmail] = {
					tiktokUsername: username,
					tiktokUrl: this.buildTikTokUrl(username)
				};
			}
		}

		return rows.map(row => {
			const key = this.normalizeEmail(row.email);
			const storedUsername = this.normalizeTikTokUsername(row.tiktokUsername);
			const tiktokUsername = storedUsername || tiktokMap[key]?.tiktokUsername || '';
			return {
				...row,
				tiktokUsername,
				tiktokUrl: this.buildTikTokUrl(tiktokUsername)
			};
		});
	},

	withTikTokUrl(row) {
		const tiktokUsername = this.normalizeTikTokUsername(row.tiktokUsername);
		return {
			...row,
			tiktokUsername,
			tiktokUrl: this.buildTikTokUrl(tiktokUsername)
		};
	},

	async updateTikTokFromEmail(c, rawEmail, mail) {
		const targetEmail = this.normalizeEmail(rawEmail);
		if (!targetEmail) return '';

		const tiktokUsername = this.extractTikTokUsername({
			subject: mail?.subject,
			text: mail?.text,
			content: mail?.content || mail?.html
		}, { strictBinding: true });
		if (!tiktokUsername) return '';

		const accountRow = await accountService.selectByEmailIncludeDel(c, targetEmail);
		if (!accountRow || accountRow.isDel === isDel.DELETE) return '';

		const storedUsername = this.normalizeTikTokUsername(accountRow.tiktokUsername);
		if (storedUsername === tiktokUsername) return storedUsername;

		await orm(c)
			.update(account)
			.set({ tiktokUsername })
			.where(eq(account.accountId, accountRow.accountId))
			.run();

		return tiktokUsername;
	},

	async scanTikTokFromInbox(c, params = {}, currentUser = null) {
		const domain = this.normalizeDomain(params.domain);
		const domains = this.envDomainList(c.env.domain);
		if (domain && !domains.includes(domain)) {
			throw new BizError('invalid email domain', 400);
		}

		const limit = Math.min(Math.max(Number(params.limit || 3000), 1), 10000);
		const batchSize = Math.min(Math.max(Number(params.batchSize || 150), 20), 300);
		const bodyLimit = Math.min(Math.max(Number(params.bodyLimit || 12000), 1000), 30000);
		const targetUserId = await this.resolveScanUserId(c, params, currentUser);
		const where = [
			'type = ?',
			'is_del = ?',
			'status <> ?',
			'is_spam = ?',
			`(
				LOWER(COALESCE(send_email, '')) LIKE '%tiktok.com'
				OR LOWER(COALESCE(name, '')) LIKE '%tiktok%'
				OR LOWER(COALESCE(subject, '')) LIKE '%tiktok%'
			)`
		];
		const binds = [
			emailConst.type.RECEIVE,
			isDel.NORMAL,
			emailConst.status.SAVING,
			emailConst.spam.NORMAL
		];

		if (domain) {
			where.push(`LOWER(SUBSTR(to_email, INSTR(to_email, '@') + 1)) = LOWER(?)`);
			binds.push(domain);
		} else if (domains.length > 0) {
			where.push(`LOWER(SUBSTR(to_email, INSTR(to_email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
			binds.push(...domains);
		}

		const summary = {
			scanned: 0,
			created: 0,
			restored: 0,
			updated: 0,
			unchanged: 0,
			conflict: 0,
			skipped: 0,
			batches: 0
		};
		const processedEmails = new Set();
		let remaining = limit;
		let beforeEmailId = Math.max(Number(params.beforeEmailId || params.beforeId || 0), 0);

		while (remaining > 0) {
			const pageWhere = [...where];
			const pageBinds = [...binds];
			if (beforeEmailId > 0) {
				pageWhere.push('email_id < ?');
				pageBinds.push(beforeEmailId);
			}

			const pageSize = Math.min(batchSize, remaining);
			const { results } = await c.env.db.prepare(`
				SELECT
					email_id AS emailId,
					to_email AS toEmail,
					send_email AS fromEmail,
					name AS fromName,
					subject,
					SUBSTR(text, 1, ?) AS text,
					SUBSTR(content, 1, ?) AS content,
					create_time AS createTime
				FROM email
				WHERE ${pageWhere.join(' AND ')}
				ORDER BY email_id DESC
				LIMIT ?
			`).bind(bodyLimit, bodyLimit, ...pageBinds, pageSize).all();

			const rows = results || [];
			if (rows.length === 0) {
				break;
			}
			summary.batches += 1;

			for (const row of rows) {
				summary.scanned += 1;
				const targetEmail = this.normalizeEmail(row.toEmail);
				if (!targetEmail || processedEmails.has(targetEmail)) {
					summary.skipped += 1;
					continue;
				}
				if (!verifyUtils.isEmail(targetEmail) || !domains.includes(emailUtils.getDomain(targetEmail))) {
					summary.skipped += 1;
					continue;
				}

				const tiktokUsername = this.extractTikTokUsername(row, { strictBinding: true });
				if (!tiktokUsername) {
					summary.skipped += 1;
					continue;
				}
				processedEmails.add(targetEmail);

				const applied = await this.applyInboxTikTokUsername(c, {
					email: targetEmail,
					tiktokUsername,
					userId: targetUserId
				});
				if (summary[applied.action] !== undefined) {
					summary[applied.action] += 1;
				} else {
					summary.skipped += 1;
				}
			}

			remaining -= rows.length;
			beforeEmailId = Math.min(...rows.map(row => Number(row.emailId || beforeEmailId)).filter(Boolean));
			if (rows.length < pageSize || !beforeEmailId) {
				break;
			}
		}

		return summary;
	},

	async resolveScanUserId(c, params = {}, currentUser = null) {
		if (currentUser?.userId) {
			return currentUser.userId;
		}
		const userEmail = this.normalizeEmail(params.userEmail || c.env.admin);
		const row = await userService.selectByEmailIncludeDel(c, userEmail);
		if (!row || row.isDel === isDel.DELETE) {
			throw new BizError('admin user not found', 500);
		}
		return row.userId;
	},

	async applyInboxTikTokUsername(c, payload = {}) {
		const targetEmail = this.normalizeEmail(payload.email);
		const tiktokUsername = this.normalizeTikTokUsername(payload.tiktokUsername);
		if (!targetEmail || !tiktokUsername) {
			return { action: 'skipped' };
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, targetEmail);
		if (!accountRow) {
			await c.env.db.prepare(`
				INSERT INTO account (email, name, tiktok_username, user_id, is_del)
				VALUES (?, ?, ?, ?, ?)
			`).bind(targetEmail, emailUtils.getName(targetEmail), tiktokUsername, payload.userId, isDel.NORMAL).run();
			return { action: 'created' };
		}

		const storedUsername = this.normalizeTikTokUsername(accountRow.tiktokUsername);

		if (accountRow.isDel === isDel.DELETE) {
			await c.env.db.prepare(`
				UPDATE account
				SET is_del = ?, user_id = ?, tiktok_username = ?
				WHERE account_id = ?
			`).bind(isDel.NORMAL, payload.userId, tiktokUsername, accountRow.accountId).run();
			return { action: 'restored' };
		}

		if (storedUsername === tiktokUsername) {
			return { action: 'unchanged' };
		}

		await c.env.db.prepare(`
			UPDATE account
			SET tiktok_username = ?
			WHERE account_id = ?
		`).bind(tiktokUsername, accountRow.accountId).run();
		return { action: 'updated' };
	},

	async resolveAccount(c, accountId) {
		if (!accountId) {
			throw new BizError('accountId required');
		}
		const row = await orm(c)
			.select()
			.from(account)
			.where(eq(account.accountId, Number(accountId)))
			.get();

		if (!row || row.isDel === isDel.DELETE) {
			throw new BizError('account not found');
		}
		return row;
	},

	async addOne(c, rawEmail, userId, name = '') {
		const email = this.normalizeEmail(rawEmail);
		this.verifyEmail(c, email);

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.NORMAL) {
			throw new BizError(t('isRegAccount'));
		}

		const accountName = name || emailUtils.getName(email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			await c.env.db.prepare(`
				UPDATE account
				SET user_id = ?, name = ?, is_del = ?, create_time = CURRENT_TIMESTAMP
				WHERE account_id = ?
			`).bind(userId, accountName, isDel.NORMAL, accountRow.accountId).run();
			return accountService.selectByEmailIncludeDel(c, email);
		}

		const row = await orm(c).insert(account).values({
			email,
			name: accountName,
			userId
		}).returning().get();
		return row;
	},

	async resolveTargetUser(c, params) {
		if (params.userId) {
			const row = await userService.selectById(c, Number(params.userId));
			if (!row) throw new BizError(t('notExistUser'));
			return row;
		}

		if (params.userEmail) {
			const row = await userService.selectByEmail(c, params.userEmail);
			if (!row) throw new BizError(t('notExistUser'));
			return row;
		}

		const currentUser = userContext.getUser(c);
		const row = await userService.selectById(c, currentUser.userId);
		if (!row) throw new BizError(t('notExistUser'));
		return row;
	},

	parseImportEmails(text) {
		const matches = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
		return [...new Set(matches.map(email => this.normalizeEmail(email)))];
	},

	normalizeEmail(email) {
		return String(email || '').trim().toLowerCase();
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

	parseTikTokInput(value) {
		const plainUsername = this.normalizeTikTokUsername(value);
		if (plainUsername) return plainUsername;
		return this.extractTikTokUsername({ text: value });
	},

	extractTikTokUsername(row, options = {}) {
		const rawText = [
			row.subject,
			row.text,
			row.content
		].filter(Boolean).join('\n');
		const text = this.normalizeText(rawText);

		if (options.strictBinding) {
			return this.extractTrustedTikTokUsername(row, rawText, text);
		}

		const urlUsername = this.extractTikTokProfileUrlUsername(rawText);
		if (urlUsername) {
			return urlUsername;
		}

			const labelMatch = text.match(/(?:tiktok\s*(?:username|user\s*name|account|profile)|username|user\s*name|\u7528\u6237\u540d|\u8d26\u53f7|\u7528\u6237)\s*[:=-]\s*@?([A-Za-z0-9._]{2,24})/i);
		if (labelMatch) {
			return this.normalizeTikTokUsername(labelMatch[1]);
		}

		for (const match of text.matchAll(/(?:^|[^\w.])@([A-Za-z0-9._]{2,24})(?=$|[^\w.])/g)) {
			const username = this.normalizeTikTokUsername(match[1]);
			if (username) return username;
		}

		return '';
	},

	extractTrustedTikTokUsername(row, rawText, text) {
		const subject = this.normalizeText(row?.subject).toLowerCase();
		const isAnalyticsMail = /(?:^|,\s*)your\s+tiktok\s+analytics\b/i.test(subject);
		const hasExplicitAccountLabel = /(?:tiktok\s*(?:username|user\s*name|account|profile)|username|user\s*name|\u7528\u6237\u540d|\u8d26\u53f7|\u7528\u6237)\s*[:=-]/i.test(text);

		const accountUsername = this.extractTikTokAccountContextUsername(text);
		if (accountUsername) {
			return accountUsername;
		}

		if (!isAnalyticsMail && this.isUnsafeTikTokBindingSubject(subject)) {
			return '';
		}

		if (isAnalyticsMail || hasExplicitAccountLabel) {
			const urlUsername = this.extractTikTokProfileUrlUsername(rawText, { rejectSuspicious: true });
			if (urlUsername) return urlUsername;
		}

		if (hasExplicitAccountLabel) {
		const labelMatch = text.match(/(?:tiktok\s*(?:username|user\s*name|account|profile)|username|user\s*name|\u7528\u6237\u540d|\u8d26\u53f7|\u7528\u6237)\s*[:=-]\s*@?([A-Za-z0-9._]{2,24})/i);
			const username = this.normalizeTikTokUsername(labelMatch?.[1]);
			if (username && !this.isSuspiciousTikTokUsername(username)) {
				return username;
			}
		}

		const bodyMention = this.extractBodyMentionUsername(text);
		if (bodyMention) {
			return bodyMention;
		}

		return '';
	},

	extractTikTokAccountContextUsername(text) {
		const patterns = [
			/(?:verify(?:\s+that)?|\u9a8c\u8bc1)\s+@([A-Za-z0-9._]{2,24}).{0,80}(?:tiktok|account|\u8d26\u53f7)/i,
			/@([A-Za-z0-9._]{2,24})\s+(?:is|\u662f).{0,40}(?:tiktok).{0,20}(?:account|\u8d26\u53f7)/i,
			/(?:generated\s+for|email\s+was\s+generated\s+for)\s+@?([A-Za-z0-9._]{2,24})/i
		];
		for (const pattern of patterns) {
			const username = this.normalizeTikTokUsername(text.match(pattern)?.[1]);
			if (username && !this.isSuspiciousTikTokUsername(username)) {
				return username;
			}
		}

		const greetingMatch = text.match(/(?:^|\s)(?:hi|hello|hey|dear|\u4f60\u597d|\u60a8\u597d)\s+@?([A-Za-z0-9._]{2,24})(?=[,\s\uff0c])/i);
		const greetingUsername = this.normalizeTikTokUsername(greetingMatch?.[1]);
		if (!greetingUsername || this.isSuspiciousTikTokUsername(greetingUsername)) {
			return '';
		}

		const escaped = this.escapeRegExp(greetingUsername);
		const hasSameMention = new RegExp(`@${escaped}(?=$|[^A-Za-z0-9._])`, 'i').test(text);
		const hasGeneratedFor = new RegExp(`generated\\s+for\\s+@?${escaped}(?=$|[^A-Za-z0-9._])`, 'i').test(text);
		const hasTikTokAccountContext = /(?:tiktok).{0,40}(?:account|\u8d26\u53f7)/i.test(text);
		if (hasSameMention || hasGeneratedFor || hasTikTokAccountContext) {
			return greetingUsername;
		}

		return '';
	},

	extractBodyMentionUsername(text) {
		const contextText = String(text || '');
		if (!/(?:tiktok|account|\u8d26\u53f7|verify|\u9a8c\u8bc1|code|\u9a8c\u8bc1\u7801|password)/i.test(contextText)) {
			return '';
		}
		for (const match of contextText.matchAll(/(?:^|[^\w.])@([A-Za-z0-9._]{2,24})(?=$|[^\w.])/g)) {
			const username = this.normalizeTikTokUsername(match[1]);
			if (username && !this.isSuspiciousTikTokUsername(username)) {
				return username;
			}
		}
		return '';
	},

	extractTikTokProfileUrlUsername(text, options = {}) {
		const source = this.decodeHtmlEntities(text);
		for (const match of source.matchAll(/(?:https?:\\?\/\\?\/)?(?:www\.)?tiktok\.com\\?\/@([A-Za-z0-9._]{2,24})(?=$|[/?#&"'<>\s\\])/gi)) {
			const username = this.normalizeTikTokUsername(match[1]);
			if (!username) continue;
			if (options.rejectSuspicious && this.isSuspiciousTikTokUsername(username)) continue;
			return username;
		}
		return '';
	},

	isUnsafeTikTokBindingSubject(subject) {
		return /(?:notification|liked|likes|comment|comments|mentioned|viewed your profile|profile view|posted|new follower|followers|left you|reminder|\u8d5e|\u70b9\u8d5e|\u8bc4\u8bba|\u901a\u77e5|\u63d0\u9192|\u7c89\u4e1d|\u5173\u6ce8|\u6d4f\u89c8|\u67e5\u770b)/i.test(subject || '');
	},

	escapeRegExp(value) {
		return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	},

	isSuspiciousTikTokUsername(username) {
		const value = this.normalizeTikTokUsername(username).toLowerCase();
		if (!value) return true;
		if (SUSPICIOUS_TIKTOK_USERNAMES.has(value)) return true;
		if (value.endsWith('.com')) return true;
		if (/^\d{2,8}$/.test(value)) return true;
		return false;
	},

	decodeHtmlEntities(text) {
		return String(text || '')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/g, "'")
			.replace(/&#64;/g, '@');
	},

	normalizeText(text) {
		return this.decodeHtmlEntities(text)
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	},

	normalizeTikTokUsername(username) {
		const value = String(username || '').trim().replace(/^@/, '').replace(/[._]+$/g, '');
		if (!/^[A-Za-z0-9._]{2,24}$/.test(value)) {
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

	orderSql(params = {}) {
		const orderMap = {
			accountId: 'a.account_id',
			email: 'a.email',
			domain: "LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1))",
			name: 'a.name',
			deviceNo: 'a.device_no',
			creatorStatus: 'a.creator_rewards_status',
			userEmail: 'u.email',
			status: 'a.status',
			tiktokUsername: 'a.tiktok_username',
			createTime: 'a.create_time'
		};
		const sortBy = orderMap[params.sortBy] || 'a.account_id';
		const order = String(params.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
		return `ORDER BY ${sortBy} ${order}`;
	},
	buildTikTokUrl(username) {
		if (!username) return '';
		return `https://www.tiktok.com/@${username}`;
	},

	tokenKey(email) {
		return KvConst.SUB_ACCOUNT_TOKEN + this.normalizeEmail(email);
	},

	verifyEmail(c, email) {
		if (!email) {
			throw new BizError(t('emptyEmail'));
		}
		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}
		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}
	}
};

export default subAccountService;
