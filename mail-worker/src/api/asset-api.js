import app from '../hono/hono';
import result from '../model/result';
import assetService from '../service/asset-service';

app.get('/asset/overview', async (c) => {
	const data = await assetService.overview(c);
	return c.json(result.ok(data));
});

app.get('/asset/list', async (c) => {
	const data = await assetService.list(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/asset/scanCreatorRewards', async (c) => {
	const data = await assetService.scanCreatorRewards(c, await c.req.json());
	return c.json(result.ok(data));
});
