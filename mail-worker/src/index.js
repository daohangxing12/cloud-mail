import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)
		const host = url.hostname.toLowerCase()

		if (isHiddenFrontendHost(host) && isFrontendPath(url.pathname)) {
			return Response.redirect(`https://mail.ntmcn.com${url.pathname}${url.search}`, 302);
		}

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		if (url.pathname === '/getNewTkMailCode') {
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '*/30 * * * *') {
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

function isHiddenFrontendHost(host) {
	return ['api.orz.gay', '212202.xyz'].includes(host);
}

function isFrontendPath(pathname) {
	if (pathname.startsWith('/api/')) return false;
	if (pathname === '/getNewTkMailCode') return false;
	if (pathname.startsWith('/local-agent')) return false;
	if (pathname.startsWith('/public')) return false;
	if (pathname.startsWith('/webhooks')) return false;
	if (pathname.startsWith('/telegram')) return false;
	if (pathname.startsWith('/oauth')) return false;
	if (pathname.startsWith('/static/')) return false;
	if (pathname.startsWith('/attachments/')) return false;
	return true;
}
