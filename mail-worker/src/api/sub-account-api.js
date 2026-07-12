/*
 * STABLE GUARD:
 * 子邮箱 API 是自动创建子邮箱、生成 Token、本地软件接码的核心入口。
 * 禁止删除 ensure/token/scan/import 等稳定能力，禁止扩大允许域名范围。
 * 修改前必须先阅读 cloud-mail/AGENTS.md 和 STABLE_FEATURES_DO_NOT_BREAK.md。
 */
import app from '../hono/hono';
import result from '../model/result';
import subAccountService from '../service/sub-account-service';

app.get('/subAccount/list', async (c) => {
	const data = await subAccountService.list(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/subAccount/add', async (c) => {
	const data = await subAccountService.add(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/subAccount/import', async (c) => {
	const data = await subAccountService.importList(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/subAccount/ensureAssets', async (c) => {
	const data = await subAccountService.ensureAssets(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/subAccount/ensureManaged', async (c) => {
	const data = await subAccountService.ensureManagedEmail(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/subAccount/ensureFromEmail', async (c) => {
	const data = await subAccountService.ensureFromEmail(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/subAccount/scanUnmanaged', async (c) => {
	const data = await subAccountService.scanUnmanagedMailboxes(c, await c.req.json());
	return c.json(result.ok(data));
});

app.put('/subAccount/setName', async (c) => {
	await subAccountService.setName(c, await c.req.json());
	return c.json(result.ok());
});

app.put('/subAccount/setTiktok', async (c) => {
	const data = await subAccountService.setTikTok(c, await c.req.json());
	return c.json(result.ok(data));
});

app.get('/subAccount/token', async (c) => {
	const data = await subAccountService.getToken(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/subAccount/genToken', async (c) => {
	const data = await subAccountService.genToken(c, await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/subAccount/delete', async (c) => {
	const data = await subAccountService.delete(c, c.req.query());
	return c.json(result.ok(data));
});
