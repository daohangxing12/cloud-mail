import app from '../hono/hono';
import permService from '../service/perm-service';
import settingService from '../service/setting-service';

// 发信域名管理（Resend）：一个通用密钥 + 在后台添加/验证发信域名，自动写 Cloudflare DNS
const RESEND_API = 'https://api.resend.com';
const CF_API = 'https://api.cloudflare.com/client/v4';
const GLOBAL_KEY = '*';

const json = (c, data, code = 200, message = 'success') => c.json({ code, message, data });

async function requireSettingPerm(c) {
	const user = c.get('user');
	if (!user) return false;
	if (user.email && c.env.admin && user.email.toLowerCase() === String(c.env.admin).toLowerCase()) return true;
	try {
		const keys = await permService.userPermKeys(c, user.userId);
		return Array.isArray(keys) && keys.includes('setting:set');
	} catch (e) {
		return false;
	}
}

async function resendKey(c) {
	const setting = await settingService.query(c);
	const tokens = setting.resendTokens || {};
	return tokens[GLOBAL_KEY] || Object.values(tokens).find(Boolean) || '';
}

async function resend(c, method, path, body) {
	const key = await resendKey(c);
	if (!key) throw new Error('还没有填写 Resend 密钥');
	const r = await fetch(RESEND_API + path, {
		method,
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await r.text();
	let data = {};
	try { data = JSON.parse(text); } catch (e) { data = { message: text.slice(0, 200) }; }
	if (!r.ok) throw new Error(data.message || data.name || `Resend 返回 HTTP ${r.status}`);
	return data;
}

async function cf(c, method, path, body) {
	const token = c.env.CF_DNS_TOKEN;
	if (!token) throw new Error('未配置 CF_DNS_TOKEN');
	const r = await fetch(CF_API + path, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await r.json().catch(() => ({}));
	if (!r.ok || data.success === false) {
		throw new Error((data.errors || []).map(e => e.message).join('; ') || `Cloudflare 返回 HTTP ${r.status}`);
	}
	return data.result;
}

async function findZone(c, domain) {
	const parts = domain.split('.');
	for (let i = 0; i < parts.length - 1; i++) {
		const name = parts.slice(i).join('.');
		const zones = await cf(c, 'GET', `/zones?name=${encodeURIComponent(name)}`);
		if (zones && zones.length) return zones[0];
	}
	return null;
}

function fqdn(recordName, domain) {
	const n = String(recordName || '').replace(/\.$/, '');
	if (!n || n === '@') return domain;
	if (n === domain || n.endsWith('.' + domain)) return n;
	return `${n}.${domain}`;
}

// 把 Resend 要求的记录写进 Cloudflare；已存在相同记录则跳过
async function applyDns(c, domain, records) {
	const zone = await findZone(c, domain);
	if (!zone) throw new Error(`Cloudflare 账号里找不到 ${domain} 的区域`);
	const results = [];
	for (const rec of records || []) {
		const type = String(rec.type || '').toUpperCase();
		const name = fqdn(rec.name, domain);
		const content = String(rec.value || '');
		try {
			const existing = await cf(c, 'GET', `/zones/${zone.id}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
			const same = (existing || []).find(r => String(r.content).replace(/^"|"$/g, '') === content.replace(/^"|"$/g, ''));
			if (same) { results.push({ type, name, status: 'exists' }); continue; }
			if (type === 'CNAME' && (existing || []).length) {
				await cf(c, 'PUT', `/zones/${zone.id}/dns_records/${existing[0].id}`, { type, name, content, ttl: 1, proxied: false });
				results.push({ type, name, status: 'updated' });
				continue;
			}
			const payload = { type, name, content, ttl: 1, proxied: false, comment: 'Resend 发信' };
			if (type === 'MX') payload.priority = Number(rec.priority ?? 10);
			await cf(c, 'POST', `/zones/${zone.id}/dns_records`, payload);
			results.push({ type, name, status: 'created' });
		} catch (e) {
			results.push({ type, name, status: 'failed', message: String(e.message || e).slice(0, 200) });
		}
	}
	return results;
}

function guard(handler) {
	return async (c) => {
		if (!await requireSettingPerm(c)) return json(c, null, 403, '没有权限');
		try {
			return json(c, await handler(c, await c.req.json().catch(() => ({}))));
		} catch (e) {
			return json(c, null, 400, String(e.message || e));
		}
	};
}

// 保存通用密钥（所有域名共用）
app.post('/resendDomain/saveKey', guard(async (c, p) => {
	const key = String(p.key || '').trim();
	if (key && !/^re_[A-Za-z0-9_]{10,}$/.test(key)) throw new Error('密钥格式不对，应以 re_ 开头');
	await settingService.set(c, { resendTokens: { [GLOBAL_KEY]: key } });
	return { saved: true, hasKey: !!key };
}));

app.post('/resendDomain/list', guard(async (c) => {
	const hasKey = !!await resendKey(c);
	if (!hasKey) return { hasKey, autoDns: !!c.env.CF_DNS_TOKEN, list: [] };
	const data = await resend(c, 'GET', '/domains');
	return {
		hasKey,
		autoDns: !!c.env.CF_DNS_TOKEN,
		list: (data.data || []).map(d => ({ id: d.id, name: d.name, status: d.status, region: d.region, createdAt: d.created_at }))
	};
}));

app.post('/resendDomain/get', guard(async (c, p) => {
	if (!p.id) throw new Error('缺少域名 id');
	const d = await resend(c, 'GET', `/domains/${p.id}`);
	return { id: d.id, name: d.name, status: d.status, records: d.records || [] };
}));

app.post('/resendDomain/add', guard(async (c, p) => {
	const domain = String(p.domain || '').trim().toLowerCase().replace(/^@/, '');
	if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('域名格式不对');
	const list = await resend(c, 'GET', '/domains');
	let d = (list.data || []).find(x => x.name === domain);
	if (!d) d = await resend(c, 'POST', '/domains', { name: domain, region: p.region || 'us-east-1' });
	const detail = await resend(c, 'GET', `/domains/${d.id}`);
	let dns = null;
	let dnsError = '';
	if (c.env.CF_DNS_TOKEN) {
		try { dns = await applyDns(c, domain, detail.records); } catch (e) { dnsError = String(e.message || e); }
	} else {
		dnsError = '已在 Resend 添加。请到 Resend 网站该域名页点 Auto configure 写入 DNS，再回来点验证';
	}
	try { await resend(c, 'POST', `/domains/${d.id}/verify`); } catch (e) {}
	return { id: d.id, name: domain, status: detail.status, records: detail.records || [], dns, dnsError };
}));

app.post('/resendDomain/verify', guard(async (c, p) => {
	if (!p.id) throw new Error('缺少域名 id');
	await resend(c, 'POST', `/domains/${p.id}/verify`);
	const d = await resend(c, 'GET', `/domains/${p.id}`);
	return { id: d.id, name: d.name, status: d.status, records: d.records || [] };
}));

app.post('/resendDomain/applyDns', guard(async (c, p) => {
	if (!p.id) throw new Error('缺少域名 id');
	const d = await resend(c, 'GET', `/domains/${p.id}`);
	const dns = await applyDns(c, d.name, d.records);
	try { await resend(c, 'POST', `/domains/${p.id}/verify`); } catch (e) {}
	return { dns };
}));

// ===== 发件地址：写信时只显示这里配置的几个地址 =====
const SENDERS_KEY = 'send_senders';

async function readSenders(c) {
	const list = await c.env.kv.get(SENDERS_KEY, { type: 'json' }).catch(() => null);
	return Array.isArray(list) ? list : [];
}

async function senderRows(c, emails) {
	if (!emails.length) return [];
	const placeholders = emails.map(() => '?').join(',');
	const { results } = await c.env.db.prepare(`
		SELECT account_id AS accountId, email, name, sort
		FROM account
		WHERE is_del = 0 AND LOWER(email) IN (${placeholders})
	`).bind(...emails).all();
	const byEmail = new Map((results || []).map(r => [String(r.email).toLowerCase(), r]));
	return emails.map(e => byEmail.get(e)).filter(Boolean);
}

// 写信框用：已配置时返回这几个地址，没配置返回空（前端按原方式列出全部邮箱）
app.post('/sendSender/list', async (c) => {
	const emails = await readSenders(c);
	return json(c, { emails, list: await senderRows(c, emails) });
});

app.post('/sendSender/save', guard(async (c, p) => {
	const raw = Array.isArray(p.emails) ? p.emails : String(p.emails || '').split(/[\s,;]+/);
	const emails = [...new Set(raw.map(x => String(x).trim().toLowerCase()).filter(Boolean))];
	if (emails.length > 20) throw new Error('发件地址最多 20 个');
	let domainList = c.env.domain;
	if (typeof domainList === 'string') { try { domainList = JSON.parse(domainList); } catch (e) { domainList = domainList.split(','); } }
	const domains = (Array.isArray(domainList) ? domainList : []).map(d => String(d).replace(/^@/, '').toLowerCase());
	const userId = c.get('user').userId;
	for (const email of emails) {
		const [local, dom] = email.split('@');
		if (!local || !dom || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(local)) throw new Error('邮箱格式不对：' + email);
		if (!domains.includes(dom)) throw new Error('不是系统里的域名：' + email);
		const row = await c.env.db.prepare('SELECT account_id AS accountId, is_del AS isDel FROM account WHERE email COLLATE NOCASE = ?').bind(email).first();
		if (!row) {
			await c.env.db.prepare('INSERT INTO account (email, name, user_id) VALUES (?, ?, ?)').bind(email, local, userId).run();
		} else if (row.isDel !== 0) {
			await c.env.db.prepare('UPDATE account SET is_del = 0, user_id = ? WHERE account_id = ?').bind(userId, row.accountId).run();
		}
	}
	await c.env.kv.put(SENDERS_KEY, JSON.stringify(emails));
	return { emails, list: await senderRows(c, emails) };
}));
