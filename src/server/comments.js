import { checkRateLimit, isSameOrigin, json, readFields } from './responses.js';

const PAGE_SIZE = 20;

function getPostPath(slug) {
	if (!slug || slug.length > 256) return null;
	const segments = slug.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\\u0000-\u001f]/.test(segment))) return null;
	return `/blog/${segments.map(encodeURIComponent).join('/')}/`;
}

export async function handleComments(request, env, url) {
	if (request.method !== 'GET' && request.method !== 'POST') {
		return json({ error: '请求方式不受支持。' }, { status: 405, headers: { Allow: 'GET, POST' } });
	}
	const slug = url.searchParams.get('slug');
	const postPath = getPostPath(slug);
	if (!postPath) return json({ error: '文章不存在。' }, { status: 404 });
	if (request.method === 'POST' && !isSameOrigin(request)) {
		return json({ error: '请从文章页提交评论。' }, { status: 403 });
	}

	// The public article page must exist in this deployment before its thread is available.
	const post = await env.ASSETS.fetch(new Request(new URL(postPath, url), { method: 'HEAD' }));
	if (post.status !== 200) return json({ error: '文章不存在。' }, { status: 404 });

	if (request.method === 'GET') {
		const before = Number(url.searchParams.get('before') ?? Number.MAX_SAFE_INTEGER);
		if (!Number.isSafeInteger(before) || before < 1) {
			return json({ error: '评论页码无效。' }, { status: 400 });
		}
		const { results } = await env.BLOG_DB.prepare(
			'SELECT id, nickname, body, created_at FROM comments WHERE slug = ? AND id < ? ORDER BY id DESC LIMIT ?',
		).bind(slug, before, PAGE_SIZE + 1).all();
		const comments = results.slice(0, PAGE_SIZE);
		return json({ comments, next: results.length > PAGE_SIZE ? comments.at(-1).id : null });
	}

	if (!(await checkRateLimit(request, env, 'comment'))) {
		return json({ error: '留言太频繁，请一分钟后再试。' }, { status: 429 });
	}
	const fields = await readFields(request, 24_000);
	const body = fields?.get('body')?.trim();
	const nickname = fields?.get('nickname')?.trim() || '匿名访客';
	if (!body || body.length > 1000 || nickname.length > 30 || /[\r\n]/.test(nickname)) {
		return json({ error: '请填写 1–1000 字的留言，昵称最多 30 字。' }, { status: 400 });
	}
	const comment = await env.BLOG_DB.prepare(
		'INSERT INTO comments (slug, nickname, body, created_at) VALUES (?, ?, ?, ?) RETURNING id, nickname, body, created_at',
	).bind(slug, nickname, body, new Date().toISOString()).first();
	return json(comment, { status: 201 });
}
