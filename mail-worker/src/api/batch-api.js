import app from '../hono/hono';
import permService from '../service/perm-service';

// 批量创建子邮箱 + 接码链接、导出已有链接、资产核对（只读）
const LINK_BASE = 'https://mail.ntmcn.com';
const TOKEN_PREFIX = 'sub_account_token:';
const MAX_PER_CALL = 100;
const json = (c, data, code = 200, message = 'success') => c.json({ code, message, data }, code === 200 ? 200 : code);
const domains = (env) => {
	let d = env.domain;
	if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = d.split(','); } }
	return Array.isArray(d) ? [...new Set(d.map(x => String(x).replace(/^@/, '').trim().toLowerCase()).filter(Boolean))] : [];
};
const linkOf = (base, email, token) => `${base}/getNewTkMailCode?username=${encodeURIComponent(email)}&token=${token}&format=json`;
const newToken = () => crypto.randomUUID().replaceAll('-', '');
const cleanBase = (b) => {
	const s = String(b || '').trim().replace(/\/+$/, '');
	return /^https:\/\/[a-z0-9.-]+$/i.test(s) ? s : LINK_BASE;
};
async function requireAdmin(c, permKey) {
	const user = c.get('user');
	if (!user) return 'unauthorized';
	if (user.email && c.env.admin && user.email.toLowerCase() === String(c.env.admin).toLowerCase()) return null;
	try {
		if (typeof permService !== 'undefined') {
			const keys = await permService.userPermKeys(c, user.userId);
			if (Array.isArray(keys) && keys.includes(permKey)) return null;
		}
	} catch (e) {}
	return 'unauthorized';
}
async function targetUserId(c, userEmail) {
	if (userEmail) {
		const row = await c.env.db.prepare('SELECT user_id AS userId FROM user WHERE email COLLATE NOCASE = ? AND is_del = 0').bind(String(userEmail).trim()).first();
		if (!row) throw new Error('目标用户不存在: ' + userEmail);
		return row.userId;
	}
	return c.get('user').userId;
}
function randLocal(prefix, len) {
	const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
	const bytes = new Uint8Array(len);
	crypto.getRandomValues(bytes);
	let s = '';
	for (const b of bytes) s += chars[b % chars.length];
	if (!/^[a-z]/.test(prefix + s)) s = 'm' + s.slice(1);
	return (prefix + s).toLowerCase();
}
const validLocal = (l) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(l);

// ---- batch create ----
app.post('/subAccount/batchCreate', async (c) => {
	const denied = await requireAdmin(c, 'user:add');
	if (denied) return json(c, null, 403, '没有权限');
	const p = await c.req.json().catch(() => ({}));
	const allDomains = domains(c.env);
	const base = cleanBase(p.base);
	const genForExisting = p.tokenForExisting !== false;
	let emails = [];
	const domain = String(p.domain || '').replace(/^@/, '').trim().toLowerCase();
	const names = String(p.names || '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
	if (names.length) {
		for (const n of names) {
			const e = n.includes('@') ? n : (domain ? `${n}@${domain}` : '');
			if (e) emails.push(e);
		}
	} else {
		if (!allDomains.includes(domain)) return json(c, null, 400, '域名不在系统域名列表里: ' + domain);
		const count = Math.max(1, Math.min(MAX_PER_CALL, parseInt(p.count, 10) || 0));
		const len = Math.max(4, Math.min(20, parseInt(p.length, 10) || 8));
		const prefix = String(p.prefix || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
		const set = new Set();
		let guard = 0;
		while (set.size < count && guard++ < count * 20) set.add(`${randLocal(prefix, len)}@${domain}`);
		emails = [...set];
	}
	emails = [...new Set(emails)];
	if (!emails.length) return json(c, null, 400, '没有可创建的邮箱');
	if (emails.length > MAX_PER_CALL) return json(c, null, 400, `单次最多 ${MAX_PER_CALL} 个，请分批`);
	let userId;
	try { userId = await targetUserId(c, p.userEmail); } catch (e) { return json(c, null, 400, e.message); }
	const out = [];
	for (const email of emails) {
		const [local, dom] = email.split('@');
		if (!dom || !allDomains.includes(dom) || !validLocal(local)) { out.push({ email, status: 'invalid' }); continue; }
		try {
			const row = await c.env.db.prepare('SELECT account_id AS accountId, is_del AS isDel FROM account WHERE email COLLATE NOCASE = ?').bind(email).first();
			let status = 'created';
			if (row && row.isDel === 0) {
				status = 'exists';
			} else if (row) {
				await c.env.db.prepare('UPDATE account SET user_id = ?, name = ?, is_del = 0, create_time = CURRENT_TIMESTAMP WHERE account_id = ?').bind(userId, local, row.accountId).run();
				status = 'restored';
			} else {
				await c.env.db.prepare('INSERT INTO account (email, name, user_id) VALUES (?, ?, ?)').bind(email, local, userId).run();
			}
			let token = await c.env.kv.get(TOKEN_PREFIX + email);
			if (!token && (status !== 'exists' || genForExisting)) {
				token = newToken();
				await c.env.kv.put(TOKEN_PREFIX + email, token);
			}
			out.push({ email, status, token: token || '', link: token ? linkOf(base, email, token) : '' });
		} catch (e) {
			out.push({ email, status: 'failed', message: String(e.message || e).slice(0, 200) });
		}
	}
	return json(c, { list: out, base });
});

// ---- export links for existing accounts ----
app.post('/subAccount/exportLinks', async (c) => {
	const denied = await requireAdmin(c, 'user:query');
	if (denied) return json(c, null, 403, '没有权限');
	const p = await c.req.json().catch(() => ({}));
	const base = cleanBase(p.base);
	const domain = String(p.domain || '').replace(/^@/, '').trim().toLowerCase();
	const size = Math.max(1, Math.min(MAX_PER_CALL, parseInt(p.size, 10) || MAX_PER_CALL));
	const page = Math.max(1, parseInt(p.page, 10) || 1);
	const createMissing = p.createMissing === true;
	const where = ['is_del = 0'];
	const binds = [];
	if (domain) { where.push('email LIKE ?'); binds.push('%@' + domain); }
	const total = (await c.env.db.prepare(`SELECT COUNT(*) AS n FROM account WHERE ${where.join(' AND ')}`).bind(...binds).first())?.n || 0;
	const { results } = await c.env.db.prepare(`SELECT account_id AS accountId, email FROM account WHERE ${where.join(' AND ')} ORDER BY account_id LIMIT ? OFFSET ?`).bind(...binds, size, (page - 1) * size).all();
	const list = [];
	for (const r of results || []) {
		const email = String(r.email).toLowerCase();
		let token = await c.env.kv.get(TOKEN_PREFIX + email);
		let created = false;
		if (!token && createMissing) { token = newToken(); await c.env.kv.put(TOKEN_PREFIX + email, token); created = true; }
		list.push({ email, token: token || '', created, link: token ? linkOf(base, email, token) : '' });
	}
	return json(c, { total, page, size, list, base });
});

// ---- asset report (read only) ----
app.post('/subAccount/assetReport', async (c) => {
	const denied = await requireAdmin(c, 'user:query');
	if (denied) return json(c, null, 403, '没有权限');
	const { results } = await c.env.db.prepare(`
		SELECT LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
			SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS active,
			SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS deleted,
			SUM(CASE WHEN is_del = 0 AND latest_email_time IS NOT NULL AND latest_email_time >= datetime('now', '-30 day') THEN 1 ELSE 0 END) AS mail30d,
			MAX(latest_email_time) AS lastMail
		FROM account GROUP BY domain ORDER BY active DESC`).all();
	const dup = await c.env.db.prepare(`SELECT LOWER(email) AS e, COUNT(*) AS n FROM account WHERE is_del = 0 GROUP BY LOWER(email) HAVING n > 1 LIMIT 50`).all();
	const tokens = new Set();
	let cursor; let pages = 0;
	do {
		const r = await c.env.kv.list({ prefix: TOKEN_PREFIX, cursor });
		for (const k of r.keys) tokens.add(k.name.slice(TOKEN_PREFIX.length).toLowerCase());
		cursor = r.list_complete ? undefined : r.cursor;
	} while (cursor && ++pages < 50);
	const active = await c.env.db.prepare('SELECT LOWER(email) AS e, is_del AS d FROM account').all();
	const activeSet = new Set(); const deletedSet = new Set();
	for (const r of active.results || []) (r.d === 0 ? activeSet : deletedSet).add(r.e);
	const perDomainMissing = {}; const orphan = [];
	for (const e of activeSet) if (!tokens.has(e)) { const d = e.split('@')[1]; perDomainMissing[d] = (perDomainMissing[d] || 0) + 1; }
	for (const e of tokens) if (!activeSet.has(e)) orphan.push(e);
	const sysDomains = domains(c.env);
	return json(c, {
		systemDomains: sysDomains,
		domains: (results || []).map(r => ({ ...r, inSystem: sysDomains.includes(r.domain), missingToken: perDomainMissing[r.domain] || 0 })),
		tokenCount: tokens.size,
		orphanTokens: orphan.length,
		orphanSample: orphan.slice(0, 30),
		duplicateEmails: dup.results || []
	});
});

