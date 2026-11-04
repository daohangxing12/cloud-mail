// 一次性数据维护（仓库是公开的：日志只打印数量，不打印任何邮箱/备注内容）
// 1) 退回被误改的子邮箱备注：时间回溯到 BEFORE 读取旧备注 → 立刻回到当前 → 只改回被改掉的那些
// 2) 管理员邮箱 admin@orz.gay → admin@ntmcn.com
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const DB = 'cloud-mail-db';
const BEFORE = process.env.BEFORE || '2026-11-04T09:59:00Z';
const TASKS = (process.env.TASKS || '').split(',').map(s => s.trim()).filter(Boolean);
mkdirSync('/tmp/d1', { recursive: true });

function wr(args) {
	return execFileSync('npx', ['wrangler', 'd1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
}
function jsonOut(text) {
	const i = text.search(/[\[{]/);
	return JSON.parse(text.slice(i));
}
function query(sql) {
	const out = jsonOut(wr(['execute', DB, '--remote', '--json', '--command', sql]));
	return (Array.isArray(out) ? out[0] : out).results || [];
}
function runFile(sql) {
	writeFileSync('/tmp/d1/update.sql', sql);
	wr(['execute', DB, '--remote', '--yes', '--file', '/tmp/d1/update.sql']);
}
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const local = (e) => String(e).split('@')[0];
const SYNC = /邮箱[:：]|粉丝[:：]|播放[:：]|TikTok[:：].*\|/;

if (TASKS.includes('remarks')) {
	const restore = jsonOut(wr(['time-travel', 'restore', DB, `--timestamp=${BEFORE}`, '--json']));
	const back = restore.previous_bookmark;
	if (!back) throw new Error('没有拿到回退书签，停止');
	console.log('已回溯到', BEFORE, '，回退书签', back);
	let old;
	try {
		old = query('SELECT account_id, email, name FROM account');
	} finally {
		jsonOut(wr(['time-travel', 'restore', DB, `--bookmark=${back}`, '--json']));
		console.log('已回到当前数据');
	}
	const cur = new Map(query('SELECT account_id, email, name FROM account').map(r => [r.account_id, r]));
	const fix = old.filter(o => {
		const c = cur.get(o.account_id);
		return c && SYNC.test(o.name || '') && c.name === local(c.email) && c.name !== o.name;
	});
	console.log(`旧数据 ${old.length} 个账号，需要退回备注 ${fix.length} 个`);
	for (let i = 0; i < fix.length; i += 200) {
		runFile(fix.slice(i, i + 200).map(o => `UPDATE account SET name = ${q(o.name)} WHERE account_id = ${o.account_id};`).join('\n'));
	}
	console.log('备注已退回');
}

if (TASKS.includes('admin')) {
	const from = 'admin@orz.gay', to = 'admin@ntmcn.com';
	const u = query(`SELECT COUNT(*) AS n FROM user WHERE lower(email) = ${q(to)}`)[0].n;
	const a = query(`SELECT COUNT(*) AS n FROM account WHERE lower(email) = ${q(to)}`)[0].n;
	if (u || a) throw new Error(`${to} 已经存在（user ${u} / account ${a}），没有改，需要人工处理`);
	runFile(`UPDATE user SET email = ${q(to)} WHERE lower(email) = ${q(from)};\nUPDATE account SET email = ${q(to)} WHERE lower(email) = ${q(from)};`);
	const n = query(`SELECT COUNT(*) AS n FROM user WHERE email = ${q(to)}`)[0].n;
	console.log('管理员邮箱已改为', to, '（user 行数', n, '）');
}
