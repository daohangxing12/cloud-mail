import app from '../hono/hono';
import result from '../model/result';
import desktopSyncService from '../service/desktop-sync-service';

app.get('/desktop/session', async (c) => {
	return c.json(result.ok(await desktopSyncService.session(c)));
});

app.get('/desktop/bootstrap', async (c) => {
	return c.json(result.ok(await desktopSyncService.bootstrap(c)));
});

app.put('/desktop/profile', async (c) => {
	return c.json(result.ok(await desktopSyncService.saveProfile(c, await c.req.json())));
});

app.post('/desktop/windows/sync', async (c) => {
	return c.json(result.ok(await desktopSyncService.syncWindows(c, await c.req.json())));
});

app.post('/desktop/windows/delete', async (c) => {
	return c.json(result.ok(await desktopSyncService.deleteWindows(c, await c.req.json())));
});
