import app from '../hono/hono';
import { EXTRA_DOMAINS_KEY, parseDomainList, readExtraDomains, resetExtraDomainsCache } from '../utils/extra-domains';

// 收信域名管理：在后台添加域名 → 自动配置 Cloudflare Email Routing（MX/SPF）→ 全收转到本 Worker → 加入域名列表
// 需要 Worker 密钥 CF_MAIL_TOKEN（Cloudflare API 令牌：Zone 读取、DNS 编辑、Email Routing 规则编辑、Zone 设置编辑）
const CF_API = 'https://api.cloudflare.com/client/v4';
const CF_MX = /\.mx\.cloudflare\.net\.?$/i;

const json = (c, data, code = 200, message = 'success') => c.json({ code, message, data });

function isAdmin(c) {
	const user = c.get('user');
	return !!(user && user.email && c.env.admin && user.email.toLowerCase() === String(c.env.admin).toLowerCase());
}

function baseDomains(c) {
	return parseDomainList(c.env.domainBase ?? c.env.domain);
}

function token(c) {
	return c.env.CF_MAIL_TOKEN || '';
}

async function cf(c, method, path, body) {
	const r = await fetch(CF_API + path, {
		method,
		headers: { Authorization: `Bearer ${token(c)}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await r.json().catch(() => ({}));
	if (!r.ok || data.success === false) {
		const msg = (data.errors || []).map(e => `${e.code || ''} ${e.message || ''}`.trim()).join('; ');
		throw new Error(msg || `Cloudflare 返回 HTTP ${r.status}`);
	}
	return data.result;
}

async function findZone(c, domain) {
	const zones = await cf(c, 'GET', `/zones?name=${encodeURIComponent(domain)}`);
	return zones && zones.length ? zones[0] : null;
}

async function domainStatus(c, domain) {
	const out = { domain, zone: false, routing: '', mx: [], catchAll: '' };
	if (!token(c)) return out;
	try {
		const zone = await findZone(c, domain);
		if (!zone) return out;
		out.zone = true;
		const [routing, mx, catchAll] = await Promise.all([
			cf(c, 'GET', `/zones/${zone.id}/email/routing`).catch(() => null),
			cf(c, 'GET', `/zones/${zone.id}/dns_records?type=MX&name=${encodeURIComponent(domain)}`).catch(() => []),
			cf(c, 'GET', `/zones/${zone.id}/email/routing/rules/catch_all`).catch(() => null)
		]);
		out.routing = routing ? (routing.enabled ? 'enabled' : (routing.status || 'disabled')) : '';
		out.mx = (mx || []).map(r => r.content);
		const action = (catchAll?.actions || [])[0];
		out.catchAll = catchAll?.enabled && action ? `${action.type}:${(action.value || []).join(',')}` : '';
	} catch (e) {
		out.error = String(e.message || e).slice(0, 200);
	}
	return out;
}

function guard(handler) {
	return async (c) => {
		if (!isAdmin(c)) return json(c, null, 403, '只有管理员可以管理收信域名');
		try {
			return json(c, await handler(c, await c.req.json().catch(() => ({}))));
		} catch (e) {
			return json(c, null, 400, String(e.message || e));
		}
	};
}

app.post('/mailDomain/list', guard(async (c) => {
	const fixed = baseDomains(c);
	const extra = await readExtraDomains(c.env, true);
	const all = [...new Set([...fixed, ...extra])];
	const list = await Promise.all(all.map(d => domainStatus(c, d)));
	return { hasToken: !!token(c), list: list.map(x => ({ ...x, fixed: fixed.includes(x.domain) })) };
}));

app.post('/mailDomain/add', guard(async (c, p) => {
	if (!token(c)) throw new Error('还没有配置 CF_MAIL_TOKEN，无法自动解析 DNS');
	const domain = String(p.domain || '').trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) throw new Error('域名格式不对');
	const removeOld = p.removeOld === true;
	const worker = c.env.WORKER_NAME || 'cloud-mail';
	const steps = [];

	const zone = await findZone(c, domain);
	if (!zone) throw new Error(`Cloudflare 账号里找不到 ${domain}（需要先把域名托管到这个 Cloudflare 账号，或令牌没有该域名的权限）`);
	steps.push('找到域名区域');

	// 旧的非 Cloudflare MX / SPF 会和 Email Routing 冲突
	const mx = await cf(c, 'GET', `/zones/${zone.id}/dns_records?type=MX&name=${encodeURIComponent(domain)}`);
	const oldMx = (mx || []).filter(r => !CF_MX.test(r.content));
	const txt = await cf(c, 'GET', `/zones/${zone.id}/dns_records?type=TXT&name=${encodeURIComponent(domain)}`);
	const oldSpf = (txt || []).filter(r => /v=spf1/i.test(r.content) && !/_spf\.mx\.cloudflare\.net/i.test(r.content));
	if ((oldMx.length || oldSpf.length) && !removeOld) {
		return {
			needConfirm: true,
			domain,
			oldRecords: [...oldMx.map(r => `MX ${r.content}`), ...oldSpf.map(r => `TXT ${r.content}`)]
		};
	}
	for (const r of [...oldMx, ...oldSpf]) {
		await cf(c, 'DELETE', `/zones/${zone.id}/dns_records/${r.id}`);
	}
	if (oldMx.length || oldSpf.length) steps.push(`删除旧记录 ${oldMx.length + oldSpf.length} 条`);

	// 开启 Email Routing 并写入 MX/SPF
	try {
		await cf(c, 'POST', `/zones/${zone.id}/email/routing/dns`, zone.name === domain ? {} : { name: domain });
		steps.push('写入收信 DNS 记录');
	} catch (e) {
		steps.push('收信 DNS：' + String(e.message || e).slice(0, 120));
	}
	try {
		await cf(c, 'POST', `/zones/${zone.id}/email/routing/enable`, {});
	} catch (e) {
		// 已开启时会报错，忽略
	}

	// 全收 → 本 Worker
	await cf(c, 'PUT', `/zones/${zone.id}/email/routing/rules/catch_all`, {
		name: 'catch-all to ' + worker,
		enabled: true,
		matchers: [{ type: 'all' }],
		actions: [{ type: 'worker', value: [worker] }]
	});
	steps.push(`全部邮件转给 ${worker}`);

	// 加入域名列表
	const fixed = baseDomains(c);
	const extra = await readExtraDomains(c.env, true);
	if (!fixed.includes(domain) && !extra.includes(domain)) {
		await c.env.kv.put(EXTRA_DOMAINS_KEY, JSON.stringify([...extra, domain]));
		resetExtraDomainsCache();
		steps.push('加入收信域名列表');
	}

	return { domain, steps, status: await domainStatus(c, domain) };
}));

// 只从列表移除（不改 DNS，不删邮件和子邮箱）
app.post('/mailDomain/remove', guard(async (c, p) => {
	const domain = String(p.domain || '').trim().toLowerCase().replace(/^@/, '');
	const fixed = baseDomains(c);
	if (fixed.includes(domain)) throw new Error('这个域名写在部署配置里，不能在这里移除');
	const extra = await readExtraDomains(c.env, true);
	await c.env.kv.put(EXTRA_DOMAINS_KEY, JSON.stringify(extra.filter(d => d !== domain)));
	resetExtraDomainsCache();
	return { removed: domain };
}));
