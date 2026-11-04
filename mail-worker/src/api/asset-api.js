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


function firstEmail(...values) {
	for (const value of values) {
		const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
		if (match) {
			return match[0].toLowerCase();
		}
	}
	return '';
}
