import dayjs from 'dayjs';
import { isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import accountService from './account-service';

const STATUS = {
	JOINED: 'joined',
	REJECTED: 'rejected'
};

const creatorRewardsService = {
	STATUS,

	async updateFromIncomingEmail(c, toEmail, mail, emailRow = {}) {
		const result = this.analyzeMail({
			toEmail,
			fromEmail: mail?.from?.address || '',
			fromName: mail?.from?.name || '',
			subject: mail?.subject || '',
			text: mail?.text || '',
			content: mail?.html || mail?.content || '',
			createTime: mail?.date || emailRow?.createTime || emailRow?.create_time,
			emailId: emailRow?.emailId || emailRow?.email_id || 0
		});
		if (!result) return null;
		return this.applyResult(c, result);
	},

	async scanHistory(c, params = {}) {
		const domain = this.normalizeDomain(params.domain);
		const limit = Math.min(Math.max(Number(params.limit || 1000), 1), 3000);
		const domains = this.envDomainList(c.env.domain);
		if (domain && !domains.includes(domain)) {
			throw new Error('invalid email domain');
		}

		const where = [
			`LOWER(COALESCE(send_email, '')) LIKE '%@tiktok.com'`,
			`(
				LOWER(COALESCE(subject, '')) LIKE '%creator rewards program%'
				OR LOWER(COALESCE(text, '')) LIKE '%creator rewards program%'
				OR LOWER(COALESCE(content, '')) LIKE '%creator rewards program%'
			)`
		];
		const binds = [];
		if (domain) {
			where.push(`LOWER(SUBSTR(to_email, INSTR(to_email, '@') + 1)) = LOWER(?)`);
			binds.push(domain);
		} else if (domains.length > 0) {
			where.push(`LOWER(SUBSTR(to_email, INSTR(to_email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
			binds.push(...domains);
		}

		const { results } = await c.env.db.prepare(`
			SELECT
				email_id AS emailId,
				to_email AS toEmail,
				send_email AS fromEmail,
				name AS fromName,
				subject,
				text,
				content,
				create_time AS createTime
			FROM email
			WHERE ${where.join(' AND ')}
			ORDER BY email_id DESC
			LIMIT ?
		`).bind(...binds, limit).all();

		const summary = {
			scanned: 0,
			updated: 0,
			created: 0,
			restored: 0,
			joined: 0,
			rejected: 0,
			skipped: 0
		};

		for (const row of results || []) {
			summary.scanned += 1;
			const result = this.analyzeMail(row);
			if (!result) {
				summary.skipped += 1;
				continue;
			}
			const applied = await this.applyResult(c, result);
			if (!applied) {
				summary.skipped += 1;
				continue;
			}
			summary.updated += 1;
			if (applied.created) summary.created += 1;
			if (applied.restored) summary.restored += 1;
			if (result.status === STATUS.JOINED) summary.joined += 1;
			if (result.status === STATUS.REJECTED) summary.rejected += 1;
		}

		return summary;
	},

	analyzeMail(row = {}) {
		const toEmail = this.normalizeEmail(row.toEmail || row.to_email);
		if (!toEmail) return null;
		const fromEmail = this.normalizeEmail(row.fromEmail || row.sendEmail || row.send_email);
		if (!this.isTrustedTikTokSender(fromEmail)) return null;

		const subject = String(row.subject || '');
		const text = this.normalizeText([
			subject,
			row.text,
			row.content
		].filter(Boolean).join('\n'));
		const lower = text.toLowerCase();

		let status = '';
		if (
			lower.includes('application to join the creator rewards program was not approved')
			|| (lower.includes('creator rewards program') && (lower.includes('was not approved') || lower.includes("don't qualify") || lower.includes('do not qualify')))
		) {
			status = STATUS.REJECTED;
		} else if (
			lower.includes('welcome to the creator rewards program')
			|| lower.includes("successfully joined the program")
			|| lower.includes('start collecting rewards')
		) {
			status = STATUS.JOINED;
		}

		if (!status) return null;

		const eventTime = this.normalizeDate(row.createTime || row.create_time || row.date);
		const username = this.extractUsername(text);
		return {
			toEmail,
			fromEmail,
			subject,
			status,
			username,
			eventTime,
			retryAt: status === STATUS.REJECTED ? dayjs(eventTime).add(30, 'day').format('YYYY-MM-DD HH:mm:ss') : '',
			emailId: Number(row.emailId || row.email_id || 0)
		};
	},

	async applyResult(c, result) {
		if (!this.envDomainList(c.env.domain).includes(emailUtils.getDomain(result.toEmail))) {
			return null;
		}

		let accountRow = await accountService.selectByEmailIncludeDel(c, result.toEmail);
		let created = false;
		let restored = false;

		if (!accountRow) {
			const adminUser = await userService.selectByEmailIncludeDel(c, c.env.admin);
			if (!adminUser) return null;
			const insert = await c.env.db.prepare(`
				INSERT INTO account (
					email,
					name,
					tiktok_username,
					creator_rewards_username,
					creator_rewards_status,
					creator_rewards_joined_at,
					creator_rewards_rejected_at,
					creator_rewards_retry_at,
					creator_rewards_last_checked_at,
					creator_rewards_email_id,
					creator_rewards_subject,
					user_id,
					is_del
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
			`).bind(
				result.toEmail,
				emailUtils.getName(result.toEmail),
				result.username || '',
				result.username || '',
				result.status,
				result.status === STATUS.JOINED ? result.eventTime : '',
				result.status === STATUS.REJECTED ? result.eventTime : '',
				result.retryAt || '',
				result.emailId || 0,
				result.subject || '',
				adminUser.userId,
				isDel.NORMAL
			).run();
			accountRow = { accountId: insert.meta?.last_row_id, tiktokUsername: '', isDel: isDel.NORMAL };
			created = true;
		}

		if (accountRow?.isDel === isDel.DELETE) {
			restored = true;
		}

		const existingUsername = this.normalizeUsername(accountRow?.tiktokUsername);
		await c.env.db.prepare(`
			UPDATE account
			SET
				is_del = ?,
				tiktok_username = CASE
					WHEN COALESCE(tiktok_username, '') = '' AND ? <> '' THEN ?
					ELSE tiktok_username
				END,
				creator_rewards_username = ?,
				creator_rewards_status = ?,
				creator_rewards_joined_at = ?,
				creator_rewards_rejected_at = ?,
				creator_rewards_retry_at = ?,
				creator_rewards_last_checked_at = CURRENT_TIMESTAMP,
				creator_rewards_email_id = ?,
				creator_rewards_subject = ?
			WHERE email COLLATE NOCASE = ?
		`).bind(
			isDel.NORMAL,
			existingUsername ? '' : result.username,
			result.username || '',
			result.username || '',
			result.status,
			result.status === STATUS.JOINED ? result.eventTime : '',
			result.status === STATUS.REJECTED ? result.eventTime : '',
			result.retryAt || '',
			result.emailId || 0,
			result.subject || '',
			result.toEmail
		).run();

		return {
			email: result.toEmail,
			status: result.status,
			username: result.username,
			created,
			restored
		};
	},

	isTrustedTikTokSender(email) {
		const domain = emailUtils.getDomain(email || '').toLowerCase();
		return domain === 'tiktok.com' || domain.endsWith('.tiktok.com');
	},

	extractUsername(text) {
		const greeting = String(text || '').match(/\bHi\s+@?([A-Za-z0-9._]{2,24})\s*,/i);
		if (greeting) return this.normalizeUsername(greeting[1]);

		const url = String(text || '').match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})/i);
		if (url) return this.normalizeUsername(url[1]);

		const label = String(text || '').match(/(?:username|user\s*name|用户名|账号)[^A-Za-z0-9._@]{0,30}@?([A-Za-z0-9._]{2,24})/i);
		if (label) return this.normalizeUsername(label[1]);

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

	normalizeUsername(username) {
		const value = String(username || '').trim().replace(/^@/, '').replace(/[._]+$/g, '');
		if (!/^[A-Za-z0-9._]{2,24}$/.test(value)) return '';
		return value;
	},

	normalizeDate(value) {
		const parsed = dayjs(value || new Date());
		return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss');
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
		if (!Array.isArray(list)) return [];
		return [...new Set(list.map(domain => this.normalizeDomain(domain)).filter(Boolean))];
	}
};

export default creatorRewardsService;
