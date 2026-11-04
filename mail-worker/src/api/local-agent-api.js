import app from '../hono/hono';
import result from '../model/result';
import localAgentService from '../service/local-agent-service';
import subAccountService from '../service/sub-account-service';

app.get('/local-agent/ping', async (c) => {
	const data = await localAgentService.ping(c);
	return c.json(result.ok(data));
});

app.get('/local-agent/mail/list', async (c) => {
	const data = await localAgentService.mailList(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/local-agent/mail/latest', async (c) => {
	const data = await localAgentService.latestMail(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/local-agent/code/latest', async (c) => {
	const data = await localAgentService.latestCode(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/local-agent/sub-account/token', async (c) => {
	const data = await localAgentService.ensureSubAccountToken(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/local-agent/mail/read', async (c) => {
	const data = await localAgentService.markRead(c, await c.req.json());
	return c.json(result.ok(data));
});

app.get('/local-agent/account/list', async (c) => {
	const data = await localAgentService.accountList(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/local-agent/tiktok/scanInbox', async (c) => {
	await localAgentService.verifyAgent(c);
	const data = await subAccountService.scanTikTokFromInbox(c, await c.req.json());
	return c.json(result.ok(data));
});
