import emailService from '../service/email-service';
import { readInboxRules } from './inbox-rules';

// 按「收件箱规则」里的天数彻底删除旧的收到的邮件（星标邮件不删）。每次最多删 maxRows 封，定时任务会分批删完
export async function cleanOldMail(env, maxRows = 3000) {
	const rules = await readInboxRules(env, true);
	const c = { env };
	const result = { spam: 0, inbox: 0 };
	const jobs = [
		['spam', 1, rules.cleanSpamDays],
		['inbox', 0, rules.cleanInboxDays]
	];
	for (const [key, spam, days] of jobs) {
		if (!days) continue;
		while (result.spam + result.inbox < maxRows) {
			const { results } = await env.db.prepare(`
				SELECT email_id FROM email
				WHERE type = 0 AND is_spam = ? AND create_time < datetime('now', ?)
				AND email_id NOT IN (SELECT email_id FROM star)
				LIMIT 200`).bind(spam, `-${days} days`).all();
			if (!results || !results.length) break;
			await emailService.physicsDelete(c, { emailIds: results.map(r => r.email_id).join(',') });
			result[key] += results.length;
			if (results.length < 200) break;
		}
	}
	return result;
}

// 一次性：把旧同步工具写进备注的「邮箱:xx | TikTok:xx | 粉丝:0 | 播放:0」清掉，改成邮箱用户名
export async function cleanSyncRemarks(env, force = false) {
	const flag = 'cleanup_sync_remark_v1';
	if (!force && await env.kv.get(flag)) return 0;
	const r = await env.db.prepare(`
		UPDATE account SET name = substr(email, 1, instr(email, '@') - 1)
		WHERE name LIKE '%邮箱:%' OR name LIKE '%粉丝:%' OR name LIKE '%播放:%' OR name LIKE '%TikTok:%|%'`).run();
	await env.kv.put(flag, '1');
	return r?.meta?.changes || 0;
}
