import app from '../hono/hono';
import settingService from '../service/setting-service';
import { DEFAULT_INBOX_RULES, readInboxRules, saveInboxRules, classify, FOLDER } from '../utils/inbox-rules';
import { checkBlock } from '../email/email';
import { cleanOldMail } from '../utils/mail-cleanup';

const json = (c, data, code = 200, message = 'success') => c.json({ code, message, data });

function isAdmin(c) {
	const user = c.get('user');
	return !!(user && user.email && c.env.admin && user.email.toLowerCase() === String(c.env.admin).toLowerCase());
}

function guard(handler) {
	return async (c) => {
		if (!isAdmin(c)) return json(c, null, 403, '只有管理员可以修改收件箱规则');
		try {
			return json(c, await handler(c, await c.req.json().catch(() => ({}))));
		} catch (e) {
			return json(c, null, 400, String(e.message || e));
		}
	};
}

app.post('/inboxRules/get', guard(async (c) => ({ rules: await readInboxRules(c.env, true), defaults: DEFAULT_INBOX_RULES })));

app.post('/inboxRules/save', guard(async (c, p) => ({ rules: await saveInboxRules(c.env, p.rules || p) })));

// 按当前规则重新整理最近 N 天收到的邮件，分到 收件箱 / 垃圾邮件 / 其他通知
app.post('/inboxRules/apply', guard(async (c, p) => {
	const days = Math.min(Math.max(Number(p.days) || 30, 1), 365);
	const rules = await readInboxRules(c.env, true);
	const { blackSubject, blackContent, blackFrom } = await settingService.query({ env: c.env });
	const move = { 0: [], 1: [], 2: [] };
	let lastId = 0, scanned = 0;
	while (true) {
		const { results } = await c.env.db.prepare(`
			SELECT email_id, subject, to_email, send_email, in_reply_to, is_spam, substr(text, 1, 6000) AS text, substr(content, 1, 20000) AS html
			FROM email WHERE type = 0 AND is_del = 0 AND email_id > ? AND create_time >= datetime('now', ?)
			ORDER BY email_id LIMIT 500`).bind(lastId, `-${days} days`).all();
		if (!results || !results.length) break;
		for (const r of results) {
			lastId = r.email_id;
			scanned++;
			const mail = { subject: r.subject || '', text: r.text || '', html: r.html || '', from: { address: r.send_email || '' } };
			const folder = checkBlock(blackSubject, blackContent, blackFrom, mail)
				? FOLDER.SPAM
				: classify(rules, { ...mail, from: r.send_email, inReplyTo: r.in_reply_to }, r.to_email);
			if (Number(r.is_spam) !== folder) move[folder].push(r.email_id);
		}
		if (results.length < 500) break;
	}
	for (const folder of [0, 1, 2]) {
		const ids = move[folder];
		for (let i = 0; i < ids.length; i += 90) {
			const part = ids.slice(i, i + 90);
			await c.env.db.prepare(`UPDATE email SET is_spam = ? WHERE email_id IN (${part.map(() => '?').join(',')})`).bind(folder, ...part).run();
		}
	}
	return { days, scanned, toInbox: move[0].length, toSpam: move[1].length, toOther: move[2].length };
}));

app.post('/inboxRules/clean', guard(async (c) => await cleanOldMail(c.env, 5000)));
