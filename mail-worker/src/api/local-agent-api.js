/*
 * STABLE GUARD:
 * /api/local-agent/* 是本地 NTMCN 矩阵工具依赖的稳定接口。
 * 禁止随意删除、改名、改认证方式或改返回结构；否则登录接码、资产同步会直接失败。
 * 修改前必须先阅读 cloud-mail/AGENTS.md 和 STABLE_FEATURES_DO_NOT_BREAK.md。
 */
import app from '../hono/hono';
import result from '../model/result';
import localAgentService from '../service/local-agent-service';

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

app.post('/local-agent/mail/read', async (c) => {
	const data = await localAgentService.markRead(c, await c.req.json());
	return c.json(result.ok(data));
});

app.get('/local-agent/account/list', async (c) => {
	const data = await localAgentService.accountList(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/local-agent/sub-account/token', async (c) => {
	const data = await localAgentService.subAccountToken(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/local-agent/account/sync', async (c) => {
	const data = await localAgentService.syncAccount(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/local-agent/tiktok/stats', async (c) => {
	const data = await localAgentService.syncAccount(c, await c.req.json());
	return c.json(result.ok(data));
});
