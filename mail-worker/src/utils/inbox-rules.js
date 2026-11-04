// 收件箱白名单规则（对齐原 VPS 邮局的 sieve 规则）：
// 只有「重要邮件」进收件箱（验证码、开通/审核、登录/密码、申诉封禁、回复、自家域名来信），
// 其余（点赞/关注/转发等通知、营销）全部进垃圾邮箱。接码链接照常能取到垃圾邮箱里的验证码。
export const INBOX_RULES_KEY = 'inbox_rules';

export const DEFAULT_INBOX_RULES = {
	enabled: true,
	subject: [
		// 01 验证码
		'is your 6-digit code', 'is your 6 digit code', 'verification code', 'security code', 'one-time code', 'one time code', '验证码', '驗證碼', '認証コード',
		// 02 开通 / 审核通过
		"You're Officially a TikTok Shop Affiliate", 'You’re Officially a TikTok Shop Affiliate', 'your application has been approved', 'your account has been approved',
		'开通成功', '開通成功', '橱窗开通', '櫥窗開通', '带货权限已开通', '审核通过', '審核通過', 'Welcome to the Creator Rewards Program',
		// 03 登录 / 密码
		'New device login detected', 'login successful', 'successful login', 'new login', 'new sign-in', 'new sign in', 'password reset', 'reset your password',
		'password changed', 'email address changed', '登录成功', '登入成功', '新设备登录', '新裝置登入', '异常登录', '異常登入', '重置密码', '密码重置', '重設密碼', '密码已更改', '密碼已變更',
		// 04 申诉 / 封禁 / 恢复
		"We've restored your account", 'We’ve restored your account', 'Your account has been disqualified', "We couldn't approve your account", 'We couldn’t approve your account',
		'your account has been suspended', 'your account has been banned', 'your appeal has been', '账号申诉', '帳號申訴', '账户申诉', '賬戶申訴', '账号已恢复', '帳號已恢復',
		'账号被封禁', '帳號被封鎖', '取消资格', '取消資格', '申诉结果', '申訴結果'
	],
	body: ['Your 6-digit code is:', 'Your verification code is:', '你的验证码是', '您的验证码是', '你的驗證碼是'],
	from: ['ntmcn.com', 'flyvg.com', 'flygw.com'],
	replyToInbox: true
};

let cache = { at: 0, rules: null };

const cleanList = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map(s => String(s).trim()).filter(Boolean))];

export function normalizeRules(r) {
	r = r || {};
	return {
		enabled: r.enabled !== false,
		subject: cleanList(r.subject ?? DEFAULT_INBOX_RULES.subject),
		body: cleanList(r.body ?? DEFAULT_INBOX_RULES.body),
		from: cleanList(r.from ?? DEFAULT_INBOX_RULES.from).map(s => s.toLowerCase()),
		replyToInbox: r.replyToInbox !== false
	};
}

export async function readInboxRules(env, fresh = false) {
	if (!fresh && cache.rules && Date.now() - cache.at < 30000) return cache.rules;
	let raw = null;
	try { raw = await env.kv.get(INBOX_RULES_KEY, { type: 'json' }); } catch (e) {}
	cache = { at: Date.now(), rules: normalizeRules(raw || DEFAULT_INBOX_RULES) };
	return cache.rules;
}

export async function saveInboxRules(env, rules) {
	const r = normalizeRules(rules);
	await env.kv.put(INBOX_RULES_KEY, JSON.stringify(r));
	cache = { at: Date.now(), rules: r };
	return r;
}

// 是否是重要邮件（应进收件箱）。mail: { subject, text, html, from, inReplyTo }
export function isImportant(rules, mail) {
	const subject = String(mail.subject || '').toLowerCase();
	if (rules.subject.some(k => subject.includes(k.toLowerCase()))) return true;
	const body = (String(mail.text || '') + '\n' + String(mail.html || '')).toLowerCase();
	if (rules.body.some(k => body.includes(k.toLowerCase()))) return true;
	const from = String(mail.from || '').toLowerCase();
	const fromDomain = from.split('@')[1] || '';
	if (rules.from.some(k => from === k || fromDomain === k || fromDomain.endsWith('.' + k))) return true;
	if (rules.replyToInbox && mail.inReplyTo) return true;
	return false;
}
