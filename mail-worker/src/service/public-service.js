import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { emailConst, isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import codeUtils from '../utils/code-utils';
import constant from '../const/constant';

const publicService = {

	async latestCode(c, params) {
		const list = await this.codeList(c, { ...params, size: 1 });
		return list[0] || null;
	},

	async getNewTkMailCode(c, params) {
		await this.verifyPublicToken(c, params);

		const username = params.username || params.email || params.toEmail;
		const includeText = params.includeText === '1' || params.includeText === 'true';
		return this.latestCode(c, {
			email: username,
			toEmail: username,
			fromEmail: params.fromEmail,
			subject: params.subject,
			sinceMinutes: params.sinceMinutes,
			includeText
		});
	},

	async verifyPublicToken(c, params) {
		const publicToken = params.token || params.key || c.req.header(constant.TOKEN_HEADER);
		const targetEmail = this.normalizeEmail(params.username || params.email || params.toEmail);

		if (targetEmail) {
			if (!verifyUtils.isEmail(targetEmail)) {
				throw new BizError(t('notEmail'));
			}
			this.verifyDomain(c, targetEmail);

			const accountRow = await c.env.db.prepare(`
				SELECT account_id AS accountId, is_del AS isDel
				FROM account
				WHERE email COLLATE NOCASE = ?
			`).bind(targetEmail).first();

			if (!accountRow || accountRow.isDel === isDel.DELETE) {
				throw new BizError('account not found', 404);
			}

			const subAccountToken = await c.env.kv.get(KvConst.SUB_ACCOUNT_TOKEN + targetEmail);
			if (!publicToken || publicToken !== subAccountToken) {
				throw new BizError(t('publicTokenFail'), 401);
			}
			return;
		}

		const userPublicToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		if (!publicToken || publicToken !== userPublicToken) {
			throw new BizError(t('publicTokenFail'), 401);
		}
	},

	async codeList(c, params) {

		let {
			email: receiveEmail,
			toEmail,
			fromEmail,
			subject,
			sinceMinutes,
			size,
			includeText
		} = params;

		toEmail = toEmail || receiveEmail;

		if (!toEmail) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(toEmail)) {
			throw new BizError(t('notEmail'));
		}

		this.verifyDomain(c, toEmail);

		size = Number(size || 10);
		if (Number.isNaN(size) || size < 1) {
			size = 10;
		}
		if (size > 20) {
			size = 20;
		}

		sinceMinutes = Number(sinceMinutes || 30);
		if (Number.isNaN(sinceMinutes) || sinceMinutes < 1) {
			sinceMinutes = 30;
		}
		if (sinceMinutes > 1440) {
			sinceMinutes = 1440;
		}

		const conditions = [
			sql`${email.toEmail} COLLATE NOCASE = ${toEmail}`,
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL),
			sql`${email.status} IN (${emailConst.status.RECEIVE}, ${emailConst.status.NOONE})`,
			gte(email.createTime, dayjs().subtract(sinceMinutes, 'minute').format('YYYY-MM-DD HH:mm:ss'))
		];

		if (fromEmail) {
			if (verifyUtils.isEmail(fromEmail)) {
				conditions.push(sql`${email.sendEmail} COLLATE NOCASE = ${fromEmail}`);
			} else {
				conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%' + fromEmail}`);
			}
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%' + subject + '%'}`);
		}

		const rows = await orm(c)
			.select({
				emailId: email.emailId,
				toEmail: email.toEmail,
				toName: email.toName,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				code: email.code,
				text: email.text,
				content: email.content,
				createTime: email.createTime
			})
			.from(email)
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(size)
			.all();

		return rows.map(row => this.toCodeResult(row, includeText));
	},

	toCodeResult(row, includeText) {
		const data = {
			emailId: row.emailId,
			email: row.toEmail,
			toName: row.toName,
			fromEmail: row.sendEmail,
			fromName: row.sendName,
			subject: row.subject,
			code: codeUtils.extract(row),
			createTime: row.createTime
		};

		if (includeText) {
			data.text = codeUtils.toSnippet(row);
		}

		return data;
	},

	verifyDomain(c, email) {
		const domainList = Array.isArray(c.env.domain) ? c.env.domain : [];
		if (!domainList.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}
	},

	normalizeEmail(email) {
		return String(email || '').trim().toLowerCase();
	},

	async emailList(c, params) {

		let { toEmail, content, subject, sendName, sendEmail, timeSort, num, size, type , isDel } = params

		const query = orm(c).select({
				emailId: email.emailId,
				sendEmail: email.sendEmail,
				sendName: email.name,
				subject: email.subject,
				toEmail: email.toEmail,
				toName: email.toName,
				type: email.type,
				createTime: email.createTime,
				content: email.content,
				text: email.text,
				isDel: email.isDel,
		}).from(email)

		if (!size) {
			size = 20
		}

		if (!num) {
			num = 1
		}

		size = Number(size);
		num = Number(num);

		num = (num - 1) * size;

		let conditions = []

		if (toEmail) {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail}`)
		}

		if (sendEmail) {
			conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail}`)
		}

		if (sendName) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName}`)
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject}`)
		}

		if (content) {
			conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content}`)
		}

		if (type || type === 0) {
			conditions.push(eq(email.type, type))
		}

		if (isDel || isDel === 0) {
			conditions.push(eq(email.isDel, isDel))
		}

		if (conditions.length === 1) {
			query.where(...conditions)
		} else if (conditions.length > 1) {
			query.where(and(...conditions))
		}

		if (timeSort === 'asc') {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		return query.limit(size).offset(num);

	},

	async addUser(c, params) {
		const { list } = params;

		if (list.length === 0) return;

		for (const emailRow of list) {
			if (!verifyUtils.isEmail(emailRow.email)) {
				throw new BizError(t('notEmail'));
			}

			if (!c.env.domain.includes(emailUtils.getDomain(emailRow.email))) {
				throw new BizError(t('notEmailDomain'));
			}

			const { salt, hash } = await saltHashUtils.hashPassword(
				emailRow.password || cryptoUtils.genRandomPwd()
			);

			emailRow.salt = salt;
			emailRow.hash = hash;
		}


		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

		const roleList = await roleService.roleSelectUse(c);
		const defRole = roleList.find(roleRow => roleRow.isDefault === roleConst.isDefault.OPEN);

		const userList = [];

		for (const emailRow of list) {
			let { email, hash, salt, roleName } = emailRow;
			let type = defRole.roleId;

			if (roleName) {
				const roleRow = roleList.find(role => role.name === roleName);
				type = roleRow ? roleRow.roleId : type;
			}

			const userSql = `INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
			VALUES ('${email}', '${hash}', '${salt}', '${type}', '${os}', '${browser}', '${activeIp}', '${activeIp}', '${device}', '${activeTime}', '${activeTime}')`

			const accountSql = `INSERT INTO account (email, name, user_id)
			VALUES ('${email}', '${emailUtils.getName(email)}', 0);`;

			userList.push(c.env.db.prepare(userSql));
			userList.push(c.env.db.prepare(accountSql));

		}

		userList.push(c.env.db.prepare(`UPDATE account SET user_id = (SELECT user_id FROM user WHERE user.email = account.email) WHERE user_id = 0;`))

		try {
			await c.env.db.batch(userList);
		} catch (e) {
			if(e.message.includes('SQLITE_CONSTRAINT')) {
				throw new BizError(t('emailExistDatabase'))
			} else {
				throw e
			}
		}

	},

	async genToken(c, params) {

		await this.verifyUser(c, params)

		const uuid = uuidv4();

		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid);

		return {token: uuid}
	},

	async verifyUser(c, params) {

		const { email, password } = params

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (email !== c.env.admin) {
			throw new BizError(t('notAdmin'));
		}

		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError(t('notExistUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	}

}

export default publicService
