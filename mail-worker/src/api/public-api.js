import app from '../hono/hono';
import result from '../model/result';
import publicService from '../service/public-service';

app.post('/public/genToken', async (c) => {
	const data = await publicService.genToken(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/emailList', async (c) => {
	const list = await publicService.emailList(c, await c.req.json());
	return c.json(result.ok(list));
});

app.post('/public/code/latest', async (c) => {
	const data = await publicService.latestCode(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/public/code/list', async (c) => {
	const list = await publicService.codeList(c, await c.req.json());
	return c.json(result.ok(list));
});

app.get('/getNewTkMailCode', async (c) => {
	const params = c.req.query();
	const format = (params.format || '').toLowerCase();
	let data = null;

	try {
		data = await publicService.getNewTkMailCode(c, params);
	} catch (err) {
		const status = err.code && err.code >= 400 && err.code <= 599 ? err.code : 500;
		if (format === 'json') {
			return c.json(result.fail(err.message, err.code), status);
		}
		return new Response(renderCodeHtml(params, null, err.message), {
			status,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	}

	const code = data?.code || '';

	if (format === 'json') {
		return c.json(result.ok({
			username: params.username || params.email || params.toEmail,
			mailCode: code,
			emailId: data?.emailId || null,
			fromEmail: data?.fromEmail || '',
			subject: data?.subject || '',
			createTime: data?.createTime || ''
		}));
	}

	return new Response(renderCodeHtml(params, data), {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
});

app.post('/public/addUser', async (c) => {
	await publicService.addUser(c, await c.req.json());
	return c.json(result.ok());
});

function renderCodeHtml(params, data, error = '') {
	const username = params.username || params.email || params.toEmail || '';
	const refresh = Number(params.refresh || 0);
	const refreshMeta = refresh > 0 ? `<meta http-equiv="refresh" content="${Math.min(refresh, 60)}">` : '';
	const code = data?.code || '';
	const title = error ? '接码失败' : '接码结果';

	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	${refreshMeta}
	<title>${title}</title>
	<style>
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f8fb; color: #172033; }
		main { width: min(680px, calc(100vw - 32px)); padding: 34px; border: 1px solid #dfe6f1; border-radius: 18px; background: #fff; box-shadow: 0 18px 50px rgba(22, 35, 58, .08); }
		.label { margin: 0 0 8px; color: #667085; font-size: 14px; }
		.code { margin: 0 0 22px; font-size: clamp(42px, 9vw, 80px); line-height: 1; font-weight: 800; letter-spacing: .08em; }
		.empty { margin: 0 0 22px; font-size: 26px; font-weight: 700; color: #98a2b3; }
		.error { margin: 0 0 22px; padding: 16px 18px; border-radius: 12px; background: #fff3f0; color: #b42318; font-size: 20px; font-weight: 800; }
		.row { display: grid; grid-template-columns: 90px 1fr; gap: 10px; padding: 9px 0; border-top: 1px solid #edf1f7; font-size: 14px; }
		.key { color: #667085; }
	</style>
</head>
<body>
	<main>
		<p class="label">${error ? '接码状态' : '最新验证码'}</p>
		${error ? `<p class="error">${escapeHtml(error)}</p>` : (code ? `<h1 class="code">${escapeHtml(code)}</h1>` : '<p class="empty">暂未收到验证码</p>')}
		<div class="row"><span class="key">邮箱</span><span>${escapeHtml(username)}</span></div>
		<div class="row"><span class="key">发件人</span><span>${escapeHtml(data?.fromEmail || '-')}</span></div>
		<div class="row"><span class="key">标题</span><span>${escapeHtml(data?.subject || '-')}</span></div>
		<div class="row"><span class="key">时间</span><span>${escapeHtml(data?.createTime || '-')}</span></div>
	</main>
</body>
</html>`;
}

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}
