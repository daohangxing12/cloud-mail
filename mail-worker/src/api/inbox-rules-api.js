import app from '../hono/hono';
import settingService from '../service/setting-service';
import { DEFAULT_INBOX_RULES, readInboxRules, saveInboxRules, isImportant, inScope } from '../utils/inbox-rules';
import { checkBlock } from '../email/email';

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

// 按当前规则重新整理最近 N 天收到的邮件：不重要的移到垃圾邮箱，重要的（且不在黑名单）移回收件箱
app.post('/inboxRules/apply', guard(async (c, p) => {
	const days = Math.min(Math.max(Number(p.days) || 30, 1), 365);
	const rules = await readInboxRules(c.env, true);
	if (!rules.enabled) throw new Error('规则未开启');
	const { blackSubject, blackContent, blackFrom } = await settingService.query({ env: c.env });
	const toSpam = [], toInbox = [];
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
			const blocked = checkBlock(blackSubject, blackContent, blackFrom, mail);
			// 不在作用域名里的：只把被误放进垃圾邮箱的（非黑名单）移回收件箱
			if (!inScope(rules, r.to_email)) {
				if (!blocked && Number(r.is_spam) === 1) toInbox.push(r.email_id);
				continue;
			}
			const important = !blocked && isImportant(rules, { ...mail, from: r.send_email, inReplyTo: r.in_reply_to });
			if (!important && Number(r.is_spam) === 0) toSpam.push(r.email_id);
			if (important && Number(r.is_spam) === 1) toInbox.push(r.email_id);
		}
		if (results.length < 500) break;
	}
	const update = async (ids, val) => {
		for (let i = 0; i < ids.length; i += 90) {
			const part = ids.slice(i, i + 90);
			await c.env.db.prepare(`UPDATE email SET is_spam = ? WHERE email_id IN (${part.map(() => '?').join(',')})`).bind(val, ...part).run();
		}
	};
	await update(toSpam, 1);
	await update(toInbox, 0);
	return { days, scanned, movedToSpam: toSpam.length, movedToInbox: toInbox.length };
}));
