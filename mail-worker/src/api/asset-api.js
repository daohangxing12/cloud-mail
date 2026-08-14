import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import assetService from '../service/asset-service';
import localAgentService from '../service/local-agent-service';
import creatorRewardsService from '../service/creator-rewards-service';
import subAccountService from '../service/sub-account-service';

app.get('/asset/summary', async (c) => {
	const data = await assetService.summary(c, c.req.query(), userContext.getUser(c));
	return c.json(result.ok(data));
});

app.get('/asset/list', async (c) => {
	const data = await assetService.list(c, c.req.query(), userContext.getUser(c));
	return c.json(result.ok(data));
});

app.post('/asset/exportTxt', async (c) => {
	const data = await assetService.exportTxt(c, await c.req.json(), userContext.getUser(c));
	return c.json(result.ok(data));
});

app.put('/asset/update', async (c) => {
	const data = await assetService.update(c, await c.req.json(), userContext.getUser(c));
	return c.json(result.ok(data));
});

app.put('/asset/batchStatus', async (c) => {
	const data = await assetService.batchStatus(c, await c.req.json(), userContext.getUser(c));
	return c.json(result.ok(data));
});

app.post('/asset/creatorRewards/scanHistory', async (c) => {
	const data = await creatorRewardsService.scanHistory(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/asset/tiktok/scanInbox', async (c) => {
	const data = await subAccountService.scanTikTokFromInbox(c, await c.req.json(), userContext.getUser(c));
	return c.json(result.ok(data));
});

app.post('/sync_account', async (c) => {
	const payload = await c.req.json();
	const email = firstEmail(
		payload.currentEmail,
		payload.current_email,
		payload.toEmail,
		payload.email,
		payload.mail,
		payload.mailbox,
		payload.window_name,
		payload.display_name
	);

	if (!email) {
		return c.json({
			success: false,
			msg: 'email is required',
			data: {
				updated: 0,
				created: 0,
				skipped: 1
			}
		});
	}

	const remark = payload.remark
		|| payload.bitRemark
		|| payload.bit_remark
		|| payload.browserRemark
		|| payload.browser_remark
		|| payload.note
		|| payload.memo
		|| payload.name
		|| '';

	const data = await localAgentService.syncAccount(c, {
		createIfMissing: true,
		email,
		currentEmail: email,
		name: payload.name || remark || '',
		remark,
		windowName: payload.windowName || payload.window_name || payload.browserName || payload.browser_name || payload.displayName || payload.display_name || '',
		bitGroupName: payload.bitGroupName || payload.bit_group_name || payload.group_name || payload.groupName || '',
		tiktokUsername: payload.tiktokUsername || payload.tiktok_username || payload.username || payload.primary_username || '',
		bitBrowserId: payload.bitBrowserId || payload.bit_browser_id || payload.browser_id || '',
		matrixAccountId: payload.matrixAccountId || payload.matrix_account_id || payload.account_id || '',
		password: payload.password || payload.login_password || payload.loginPassword || '',
		followers: payload.followers ?? payload.fans ?? payload.tiktokFollowers,
		views: payload.views ?? payload.tiktokViews,
		viewsText: payload.viewsText || payload.views_text || payload.mv_sync_text || '',
		loginStatus: payload.loginStatus || payload.login_status || payload.local_presence_state || payload.status || ''
	});

	return c.json({
		success: true,
		msg: 'ok',
		data
	});
});

function firstEmail(...values) {
	for (const value of values) {
		const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
		if (match) {
			return match[0].toLowerCase();
		}
	}
	return '';
}
