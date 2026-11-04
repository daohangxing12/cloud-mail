import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
import batchToolHtml from './batch-tool/tool-html';
import { withExtraDomains } from './utils/extra-domains';
import { cleanOldMail, cleanSyncRemarks } from './utils/mail-cleanup';
export default {
	 async fetch(req, env, ctx) {

		env = await withExtraDomains(env);

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (url.pathname === '/batch-tool' || url.pathname === '/batch-tool/') {
			return new Response(batchToolHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
		}

		if (url.pathname === '/getNewTkMailCode') {
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	async email(message, env, ctx) {
		return email(message, await withExtraDomains(env), ctx);
	},
	async scheduled(c, env, ctx) {
		env = await withExtraDomains(env);
		if (c.cron === '*/30 * * * *') {
			try { await cleanSyncRemarks(env); } catch (e) { console.error('清理备注失败', e); }
			try { await cleanOldMail(env); } catch (e) { console.error('自动清理邮件失败', e); }
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await oauthService.clearNoBindOathUser({ env })
		await analysisService.refreshEchartsCache({ env })
	},
};
