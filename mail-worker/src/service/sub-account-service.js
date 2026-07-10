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

const MAX_IMPORT_COUNT = 200;

const subAccountService = {
	async list(c, params) {
		let { num, size, email, domain, userEmail, isDel: isDelParam } = params;
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

		if (userEmail) {
			where.push('u.email COLLATE NOCASE LIKE ?');
			binds.push(`%${userEmail}%`);
		}

		if (domain) {
			const normalizedDomain = String(domain).replace(/^@/, '').trim();
			where.push("LOWER(SUBSTR(a.email, INSTR(a.email, '@') + 1)) = LOWER(?)");
			binds.push(normalizedDomain);
		}

		const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
		const offset = (num - 1) * size;
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
				a.tiktok_username AS tiktokUsername,
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
			ORDER BY a.account_id DESC
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

	async ensureAssets(c, params = {}) {
		const targetUser = await this.resolveTargetUser(c, params);
		const explicitEmails = this.parseImportEmails(params.text || params.emails || '');
		const sourceRows = explicitEmails.length > 0
			? explicitEmails.map(email => ({ email, name: emailUtils.getName(email), source: 'input' }))
			: await this.selectAssetEmailRows(c, params);

		const created = [];
		const restored = [];
		const existing = [];
		const failed = [];
		const seen = new Set();

		for (const sourceRow of sourceRows) {
			const email = this.normalizeEmail(sourceRow.email);
			if (!email || seen.has(email)) continue;
			seen.add(email);

			try {
				this.verifyEmail(c, email);
				const accountRow = await accountService.selectByEmailIncludeDel(c, email);
				const accountName = sourceRow.name || emailUtils.getName(email);

				if (accountRow && accountRow.isDel === isDel.NORMAL) {
					existing.push(email);
					continue;
				}

				if (accountRow && accountRow.isDel === isDel.DELETE) {
					await c.env.db.prepare(`
						UPDATE account
						SET user_id = ?, name = ?, is_del = ?, create_time = CURRENT_TIMESTAMP
						WHERE account_id = ?
					`).bind(targetUser.userId, accountName, isDel.NORMAL, accountRow.accountId).run();
					restored.push(email);
					continue;
				}

				await this.addOne(c, email, targetUser.userId, accountName);
				created.push(email);
			} catch (e) {
				failed.push({ email, message: e.message });
			}
		}

		return {
			total: seen.size,
			created,
			restored,
			existing,
			failed
		};
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
			hasToken: !!values[index]
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
					AND LOWER(to_email) IN (${placeholders})
			)
			WHERE rn <= 5
			ORDER BY toEmail, emailId DESC
		`).bind(
			emailConst.type.RECEIVE,
			isDel.NORMAL,
			emailConst.status.SAVING,
			...emails
		).all();

		const tiktokMap = {};
		for (const row of latestRows || []) {
			if (tiktokMap[row.toEmail]) continue;
			const username = this.extractTikTokUsername(row);
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
		});
		if (!tiktokUsername) return '';

		const accountRow = await accountService.selectByEmailIncludeDel(c, targetEmail);
		if (!accountRow || accountRow.isDel === isDel.DELETE) return '';

		const storedUsername = this.normalizeTikTokUsername(accountRow.tiktokUsername);
		if (storedUsername) return storedUsername;

		await orm(c)
			.update(account)
			.set({ tiktokUsername })
			.where(eq(account.accountId, accountRow.accountId))
			.run();

		return tiktokUsername;
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

	async selectAssetEmailRows(c, params = {}) {
		const domain = this.normalizeDomain(params.domain);
		const domains = domain ? [domain] : this.envDomainList(c.env.domain);
		if (domains.length === 0) {
			return [];
		}
		domains.forEach(item => {
			if (!this.envDomainList(c.env.domain).includes(item)) {
				throw new BizError(t('notEmailDomain'));
			}
		});

		const limit = Math.min(Math.max(Number(params.limit || 1000), 1), 3000);
		const domainSql = domains.map(() => '?').join(',');
		const { results } = await c.env.db.prepare(`
			SELECT
				email,
				name
			FROM account
			WHERE LOWER(SUBSTR(email, INSTR(email, '@') + 1)) IN (${domainSql})
			  AND (
				COALESCE(matrix_account_id, '') <> ''
				OR COALESCE(bit_browser_id, '') <> ''
				OR COALESCE(tiktok_username, '') <> ''
				OR COALESCE(tiktok_followers, 0) > 0
				OR COALESCE(tiktok_views, 0) > 0
				OR COALESCE(tiktok_views_text, '') <> ''
				OR COALESCE(login_status, '') <> ''
				OR COALESCE(last_agent_sync_at, '') <> ''
				OR COALESCE(last_stats_sync_at, '') <> ''
			  )
			ORDER BY account_id ASC
			LIMIT ?
		`).bind(...domains, limit).all();
		return results || [];
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

	extractTikTokUsername(row) {
		const text = this.normalizeText([
			row.subject,
			row.text,
			row.content
		].filter(Boolean).join('\n'));

		const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})/i);
		if (urlMatch) {
			return this.normalizeTikTokUsername(urlMatch[1]);
		}

		const labelMatch = text.match(/(?:tiktok|tik\s*tok|username|user\s*name|用户名|账号|用户)[^\n\r@A-Za-z0-9._]{0,30}@?([A-Za-z0-9._]{2,24})/i);
		if (labelMatch) {
			return this.normalizeTikTokUsername(labelMatch[1]);
		}

		for (const match of text.matchAll(/(?:^|[^\w.])@([A-Za-z0-9._]{2,24})(?=$|[^\w.])/g)) {
			const username = this.normalizeTikTokUsername(match[1]);
			if (username) return username;
		}

		return '';
	},

	normalizeText(text) {
		return String(text || '')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/&lt;/gi, '<')
			.replace(/&gt;/gi, '>')
			.replace(/&#64;/g, '@')
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
		if (!this.envDomainList(c.env.domain).includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}
	}
};

export default subAccountService;
