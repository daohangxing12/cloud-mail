// 后台「收信域名」里添加的域名存在 KV，这里把它们合并进 env.domain，
// 这样收信、接码、建号、下拉框等所有用到 env.domain 的地方都自动生效，不需要改部署配置。
export const EXTRA_DOMAINS_KEY = 'mail_domains_extra';

let cache = { at: 0, list: [] };

export function parseDomainList(value) {
	let list = value;
	if (typeof list === 'string') {
		try { list = JSON.parse(list); } catch (e) { list = list.split(','); }
	}
	if (!Array.isArray(list)) return [];
	return [...new Set(list.map(d => String(d).replace(/^@/, '').trim().toLowerCase()).filter(Boolean))];
}

export async function readExtraDomains(env, fresh = false) {
	if (!fresh && Date.now() - cache.at < 30000) return cache.list;
	try {
		const list = await env.kv.get(EXTRA_DOMAINS_KEY, { type: 'json' });
		cache = { at: Date.now(), list: Array.isArray(list) ? parseDomainList(list) : [] };
	} catch (e) {
		cache = { at: Date.now(), list: cache.list || [] };
	}
	return cache.list;
}

export function resetExtraDomainsCache() {
	cache = { at: 0, list: [] };
}

export async function withExtraDomains(env) {
	if (!env || !env.kv) return env;
	const extra = await readExtraDomains(env);
	const base = parseDomainList(env.domain);
	if (!extra.length) return env;
	const merged = [...new Set([...base, ...extra])];
	return { ...env, domain: merged, domainBase: base };
}
