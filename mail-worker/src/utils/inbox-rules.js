// 收信分类规则：照搬原 VPS 邮局（Stalwart sieve「代收分类」）的 7 条，按顺序命中即停：
// 01-05 重要消息 → 收件箱；06 推广邮件 → 垃圾邮件；07 其余未识别 → 其他通知。
// 另外：自家域名 / PayPal / Apple 来信 → 收件箱；只对 TikTok 业务域名生效，其他域名照常进收件箱。
// 接码链接不看文件夹，三个文件夹里的验证码都能取到。
export const INBOX_RULES_KEY = 'inbox_rules_v2';

export const DEFAULT_INBOX_RULES = {
	enabled: true,
	// 只对这些收件域名生效（做 TikTok 业务的）；其他域名不过滤，照常进收件箱
	domains: ['ntmcn.com', 'baofa.de', 'feilong168.com'],
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
	// 06 推广邮件（已确认的营销主题）→ 垃圾邮件
	marketing: ['Inspire the Art of Selling', 'Post Shoppable Content to Start Earn', 'Keep Posting. Keep Going. Success', 'Your First TikTok Shop Products Are',
		'Start Posting With Products You Own', 'Debunking the Myth:', 'Still no sale? Try this', 'Review Your Content & More Ways', 'ACE your LIVE with Follower Growth',
		'Biggest sale of this summer?', 'in rewards waiting'],
	// 这些发件方永远进收件箱（含子域名，如 email.apple.com）
	from: ['ntmcn.com', 'flyvg.com', 'flygw.com', 'paypal.com', 'apple.com', 'icloud.com'],
	replyToInbox: false,
	// 自动清理：超过 N 天的邮件彻底删除（0 = 不清理）。加了星标的永远不删
	cleanSpamDays: 15,
	cleanInboxDays: 0
};

let cache = { at: 0, rules: null };

const cleanList = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map(s => String(s).trim()).filter(Boolean))];

const days = (v) => Math.min(Math.max(Math.floor(Number(v) || 0), 0), 3650);

export function normalizeRules(r) {
	r = r || {};
	return {
		enabled: r.enabled !== false,
		domains: cleanList(r.domains ?? DEFAULT_INBOX_RULES.domains).map(s => s.toLowerCase().replace(/^@/, '')),
		subject: cleanList(r.subject ?? DEFAULT_INBOX_RULES.subject),
		body: cleanList(r.body ?? DEFAULT_INBOX_RULES.body),
		marketing: cleanList(r.marketing ?? DEFAULT_INBOX_RULES.marketing),
		from: cleanList(r.from ?? DEFAULT_INBOX_RULES.from).map(s => s.toLowerCase()),
		replyToInbox: r.replyToInbox === true,
		cleanSpamDays: days(r.cleanSpamDays ?? DEFAULT_INBOX_RULES.cleanSpamDays),
		cleanInboxDays: days(r.cleanInboxDays ?? DEFAULT_INBOX_RULES.cleanInboxDays)
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
// 收件地址是否在规则作用范围内（domains 为空 = 所有域名）
export function inScope(rules, to) {
	if (!rules.domains.length) return true;
	const d = String(to || '').toLowerCase().split('@')[1] || '';
	return rules.domains.some(k => d === k || d.endsWith('.' + k));
}

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

export const FOLDER = { INBOX: 0, SPAM: 1, OTHER: 2 };

// 返回该邮件该进的文件夹：0 收件箱 / 1 垃圾邮件 / 2 其他通知
export function classify(rules, mail, to) {
	if (!rules.enabled || !inScope(rules, to)) return FOLDER.INBOX;
	if (isImportant(rules, mail)) return FOLDER.INBOX;
	const subject = String(mail.subject || '').toLowerCase();
	if (rules.marketing.some(k => subject.includes(k.toLowerCase()))) return FOLDER.SPAM;
	return FOLDER.OTHER;
}
