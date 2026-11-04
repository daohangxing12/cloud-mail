// TikTok 邮件分类（沿用原 VPS 邮局「代收分类」规则）：
// 重要邮件 → 收件箱；其它 TikTok 邮件（转发/点赞/关注/推广等）→ 垃圾邮箱。
// 只作用于 tiktok.com 及其子域名发来的邮件，其它发件人仍按黑名单处理。

const IMPORTANT_SUBJECT = [
	// 验证码
	'is your 6-digit code', 'is your 6 digit code', 'verification code', 'security code', 'one-time code', 'one time code',
	'验证码', '驗證碼', '認証コード',
	// 橱窗及审核通过
	"you're officially a tiktok shop affiliate", 'you’re officially a tiktok shop affiliate',
	'your application has been approved', 'your account has been approved',
	'开通成功', '開通成功', '橱窗开通', '櫥窗開通', '带货权限已开通', '审核通过', '審核通過',
	// 登录及安全提醒
	'new device login detected', 'login successful', 'successful login', 'new login', 'new sign-in', 'new sign in',
	'password reset', 'reset your password', 'password changed', 'email address changed',
	'登录成功', '登入成功', '新设备登录', '新裝置登入', '异常登录', '異常登入', '重置密码', '重設密碼', '密码已更改', '密碼已變更',
	// 账号异常及申诉结果
	"we've restored your account", 'we’ve restored your account', 'your account has been disqualified',
	"we couldn't approve your account", 'we couldn’t approve your account', 'your account has been suspended',
	'your account has been banned', 'your appeal has been',
	'账号申诉', '帳號申訴', '账户申诉', '賬戶申訴', '账号已恢复', '帳號已恢復', '账号被封禁', '帳號被封鎖',
	'取消资格', '取消資格', '申诉结果', '申訴結果',
	// 中视频（Creator Rewards）结果
	'welcome to the creator rewards program', 'creator rewards program'
];

const IMPORTANT_BODY = [
	'your 6-digit code is:', 'your verification code is:', '你的验证码是', '您的验证码是', '你的驗證碼是'
];

export function isTikTokSender(address) {
	const domain = String(address || '').split('@')[1]?.toLowerCase() || '';
	return domain === 'tiktok.com' || domain.endsWith('.tiktok.com');
}

export function isImportantTikTok(subject, text) {
	const s = String(subject || '').toLowerCase();
	if (IMPORTANT_SUBJECT.some(k => s.includes(k))) return true;
	const t = String(text || '').slice(0, 20000).toLowerCase();
	return IMPORTANT_BODY.some(k => t.includes(k));
}

// 返回 true 表示进垃圾邮箱；null 表示不是 TikTok 邮件（交给黑名单判断）
export function tiktokSpamFlag(fromAddress, subject, text) {
	if (!isTikTokSender(fromAddress)) return null;
	return !isImportantTikTok(subject, text);
}
