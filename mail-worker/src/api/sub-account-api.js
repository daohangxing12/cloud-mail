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
