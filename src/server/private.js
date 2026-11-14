import MarkdownIt from 'markdown-it';
import { checkRateLimit, isSameOrigin, readFields } from './responses.js';

const markdown = new MarkdownIt({ html: false }).disable('image');
const cookieName = '__Host-ljin-owner';
const sessionSeconds = 8 * 60 * 60;
const encoder = new TextEncoder();
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const privateHeaders = {
	'Cache-Control': 'private, no-store',
	'X-Robots-Tag': 'noindex, nofollow',
	// Native forms need Origin for the POST check. Keep private URLs out of off-site referrers.
	'Referrer-Policy': 'same-origin',
	'X-Content-Type-Options': 'nosniff',
	'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function escapeHtml(value = '') {
	return value.replace(/[&<>"']/g, (character) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	})[character]);
}

function page(title, content, status = 200) {
	return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(title)} · 来进札记</title>
	<style>
		* { box-sizing: border-box; }
		body { margin: 0; min-height: 100vh; background: linear-gradient(#eef2f8, white 20rem); color: #222939; font: 17px/1.65 system-ui, sans-serif; }
		main { width: min(100% - 2rem, 720px); margin: auto; padding: 2.5rem 0; overflow-wrap: anywhere; }
		nav { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
		a { color: #2337cc; }
		h1 { line-height: 1.25; }
		label { display: block; margin-top: 1rem; }
		input, textarea { display: block; width: 100%; margin: .3rem 0 1rem; padding: .65rem; border: 1px solid #98a3ba; border-radius: 6px; font: inherit; }
		textarea { resize: vertical; }
		button { padding: .45rem .85rem; border: 1px solid #98a3ba; border-radius: 6px; background: white; color: inherit; font: inherit; cursor: pointer; }
		button[type=submit].primary { background: #2337cc; color: white; border-color: #2337cc; }
		article { border-top: 1px solid #e5e9f0; }
		pre { overflow: auto; }
		li { margin-bottom: .5rem; }
		[role=alert] { color: #a12a22; }
	</style>
</head>
<body>
	<main>
		<nav aria-label="私密文章导航"><a href="/">博客首页</a><a href="/private/">私密文章</a></nav>
		<h1>${escapeHtml(title)}</h1>
		${content}
	</main>
</body>
</html>`, {
		status,
		headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' },
	});
}

function redirect(location, cookie) {
	const headers = new Headers({ ...privateHeaders, Location: location });
	if (cookie) headers.set('Set-Cookie', cookie);
	return new Response(null, { status: 303, headers });
}

function sessionCookie(value, maxAge) {
	return `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

function importKey(secret) {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function createSession(key) {
	const expires = Math.floor(Date.now() / 1000) + sessionSeconds;
	const payload = `${expires}.${crypto.randomUUID()}`;
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`session:${payload}`));
	return `${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function hasSession(request, key) {
	const cookie = request.headers.get('Cookie')?.split('; ').find((pair) => pair.startsWith(`${cookieName}=`));
	const token = cookie?.slice(cookieName.length + 1) || '';
	const match = /^(\d{10}\.[0-9a-f-]{36})\.([A-Za-z0-9+/]{43}=)$/.exec(token);
	if (!match || Number(match[1].split('.')[0]) <= Math.floor(Date.now() / 1000)) return false;
	const signature = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
	return crypto.subtle.verify('HMAC', key, signature, encoder.encode(`session:${match[1]}`));
}

function signIn(message = '', status = 200) {
	return page('站主登录', `
		${message ? `<p role="alert">${message}</p>` : ''}
		<form method="post" action="/private/login">
			<label for="password">站主密码</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256">
			<button class="primary" type="submit">登录</button>
		</form>`, status);
}

function editor(post, message = '', status = 200) {
	const action = post.id ? `/private/${post.id}/edit` : '/private/new';
	return page(post.id ? '编辑私密文章' : '写私密文章', `
		${message ? `<p role="alert">${message}</p>` : ''}
		<form method="post" action="${action}">
			<label for="title">标题</label>
			<input id="title" name="title" maxlength="120" required value="${escapeHtml(post.title)}">
			<label for="body">正文（Markdown）</label>
			<textarea id="body" name="body" rows="14" maxlength="20000" required>${escapeHtml(post.body)}</textarea>
			<button class="primary" type="submit">保存私密文章</button>
			<a href="${post.id ? `/private/${post.id}/` : '/private/'}">取消</a>
		</form>`, status);
}

async function privatePosts(request, db, pathname) {
	const match = /^\/private\/([0-9a-f-]+)(?:\/(edit|delete))?\/?$/.exec(pathname);
	const id = match?.[1];
	const action = match?.[2];
	const creating = pathname === '/private/new';
	const reading = request.method === 'GET';

	if (pathname === '/private/' && reading) {
		const { results } = await db.prepare('SELECT id, title FROM private_posts ORDER BY updated_at DESC, id').all();
		const items = results.map((post) => `<li><a href="/private/${post.id}/">${escapeHtml(post.title)}</a></li>`).join('');
		return page('私密文章', `
			<nav><a href="/private/new">写私密文章</a><form method="post" action="/private/logout"><button type="submit">退出登录</button></form></nav>
			${items ? `<ul>${items}</ul>` : '<p>还没有私密文章。</p>'}`);
	}

	if (creating || (id && uuidPattern.test(id))) {
		const post = creating ? {} : await db.prepare('SELECT id, title, body FROM private_posts WHERE id = ?').bind(id).first();
		if (!post) return page('文章不存在', '', 404);
		if (creating || action === 'edit') {
			if (reading) return editor(post);
			const fields = await readFields(request, 185_000);
			const title = fields?.get('title')?.trim() || '';
			const body = fields?.get('body') || '';
			if (!title || title.length > 120 || !body.trim() || body.length > 20_000) {
				return editor({ id, title, body }, '请填写标题和正文。标题最多 120 字，正文最多 20000 字。', 400);
			}
			const postId = id || crypto.randomUUID();
			const statement = creating
				? 'INSERT INTO private_posts (title, body, updated_at, id) VALUES (?, ?, ?, ?)'
				: 'UPDATE private_posts SET title = ?, body = ?, updated_at = ? WHERE id = ?';
			const result = await db.prepare(statement).bind(title, body, new Date().toISOString(), postId).run();
			if (!result.meta.changes) return page('文章不存在', '', 404);
			return redirect(`/private/${postId}/`);
		}
		if (action === 'delete') {
			if (reading) {
				return page('删除私密文章', `
					<p>确定删除《${escapeHtml(post.title)}》吗？</p>
					<form method="post"><button type="submit">确认删除</button> <a href="/private/${id}/">取消</a></form>`);
			}
			await db.prepare('DELETE FROM private_posts WHERE id = ?').bind(id).run();
			return redirect('/private/');
		}
		if (reading) {
			return page(post.title, `
				<nav><a href="/private/${id}/edit">编辑</a><a href="/private/${id}/delete">删除</a></nav>
				<article>${markdown.render(post.body)}</article>`);
		}
	}
	return page('页面不存在', '', 404);
}

export async function handlePrivate(request, env, { pathname }) {
	if (request.method !== 'GET' && request.method !== 'POST') {
		return new Response(null, { status: 405, headers: { ...privateHeaders, Allow: 'GET, POST' } });
	}
	if (request.method === 'POST' && !isSameOrigin(request)) return page('请求已拒绝', '', 403);
	if (pathname === '/private' && request.method === 'GET') return redirect('/private/');
	if (!env.BLOG_OWNER_PASSWORD || env.BLOG_OWNER_PASSWORD.length < 32 || env.BLOG_OWNER_PASSWORD.length > 256) {
		return page('私密文章暂未启用', '', 503);
	}
	try {
		const key = await importKey(env.BLOG_OWNER_PASSWORD);
		if (pathname === '/private/login' && request.method === 'POST') {
			if (!(await checkRateLimit(request, env, 'login'))) return signIn('尝试次数过多，请一分钟后再试。', 429);
			const password = (await readFields(request, 3500))?.get('password');
			if (!password || password.length > 256) return signIn('请输入正确的站主密码。', 401);
			const challenge = encoder.encode('ljin:owner-login');
			const signature = await crypto.subtle.sign('HMAC', key, challenge);
			if (!(await crypto.subtle.verify('HMAC', await importKey(password), signature, challenge))) {
				return signIn('请输入正确的站主密码。', 401);
			}
			return redirect('/private/', sessionCookie(await createSession(key), sessionSeconds));
		}
		if (!(await hasSession(request, key))) return signIn('', request.method === 'GET' ? 200 : 401);
		if (pathname === '/private/logout' && request.method === 'POST') {
			return redirect('/private/', sessionCookie('', 0));
		}
		return await privatePosts(request, env.BLOG_DB, pathname);
	} catch {
		return page('私密文章暂时不可用', '<p>请稍后再试。</p>', 503);
	}
}
