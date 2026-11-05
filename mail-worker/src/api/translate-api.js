import app from '../hono/hono';

// 邮件翻译（对应原 VPS 的 flygw_translate 插件）。原来用自建 LibreTranslate，这里用 Cloudflare Workers AI 的 m2m100 翻译模型。
// 只接收纯文本片段，返回纯文本，不会把译文当 HTML 插入。
const MODEL = '@cf/meta/m2m100-1.2b';
export const LANGUAGES = {
	zh: '中文', en: '英语', vi: '越南语', ja: '日语', ko: '韩语', th: '泰语', id: '印尼语', ms: '马来语',
	es: '西班牙语', fr: '法语', de: '德语', pt: '葡萄牙语', it: '意大利语', ru: '俄语', ar: '阿拉伯语', tr: '土耳其语', hi: '印地语'
};
const MAX_SEGMENTS = 80;
const MAX_CHARS = 12000;

const json = (c, data, code = 200, message = 'success') => c.json({ code, message, data });

async function pool(items, size, fn) {
	const out = new Array(items.length);
	let i = 0;
	await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
		while (i < items.length) {
			const k = i++;
			out[k] = await fn(items[k], k);
		}
	}));
	return out;
}

app.post('/email/translate', async (c) => {
	if (!c.get('user')) return json(c, null, 401, '登录已过期');
	if (!c.env.ai) return json(c, null, 400, '没有开启 Workers AI');
	const p = await c.req.json().catch(() => ({}));
	const source = String(p.source || 'en');
	const target = String(p.target || 'zh');
	if (!LANGUAGES[source] || !LANGUAGES[target]) return json(c, null, 400, '不支持这个语言');
	const segments = Array.isArray(p.segments) ? p.segments.map(s => String(s ?? '')) : [];
	if (!segments.length) return json(c, null, 400, '没有可以翻译的正文');
	if (segments.length > MAX_SEGMENTS) return json(c, null, 413, '段落太多，请分批翻译');
	const total = segments.reduce((t, s) => t + s.length, 0);
	if (total > MAX_CHARS) return json(c, null, 413, '正文太长（超过一万二千字）');
	if (source === target) return json(c, { segments });
	try {
		const result = await pool(segments, 6, async (text) => {
			if (!text.trim()) return text;
			const r = await c.env.ai.run(MODEL, { text, source_lang: source, target_lang: target });
			return String(r?.translated_text ?? text);
		});
		return json(c, { segments: result });
	} catch (e) {
		const msg = String(e?.message || e);
		return json(c, null, 500, /limit|quota|neuron/i.test(msg) ? '今天的免费翻译额度用完了，明天再试' : '翻译失败：' + msg.slice(0, 120));
	}
});
