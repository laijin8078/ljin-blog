import { handleComments } from './server/comments.js';
import { archivedResponse, isArchivedPost, servePublic } from './server/articleArchive.js';
import { handlePrivate } from './server/private.js';
import { json } from './server/responses.js';

function getSlug(request) {
	const url = new URL(request.url);
	const slug = url.searchParams.get('slug') || '';
	return /^[a-z0-9][a-z0-9-_/]*$/i.test(slug) ? slug : '';
}

async function handleViews(request, env) {
	const slug = getSlug(request);

	if (!slug) {
		return json({ error: 'Missing or invalid slug' }, { status: 400 });
	}

	const key = `views:${slug}`;
	const current = Number((await env.BLOG_VIEWS.get(key)) || '0');

	if (request.method === 'POST') {
		const views = current + 1;
		await env.BLOG_VIEWS.put(key, String(views));
		return json({ slug, views });
	}

	if (request.method === 'GET') {
		return json({ slug, views: current });
	}

	return json({ error: 'Method not allowed' }, { status: 405 });
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === '/api/views') {
			const slug = getSlug(request);
			if (slug && await isArchivedPost(env.BLOG_DB, slug)) return archivedResponse();
			return handleViews(request, env);
		}
		if (url.pathname === '/api/comments') {
			try {
				const slug = url.searchParams.get('slug');
				if (slug && await isArchivedPost(env.BLOG_DB, slug)) return archivedResponse();
				return await handleComments(request, env, url);
			} catch {
				return json({ error: '评论暂时不可用，请稍后再试。' }, { status: 503 });
			}
		}
		if (url.pathname === '/private' || url.pathname.startsWith('/private/')) {
			return handlePrivate(request, env, url);
		}

		try {
			return await servePublic(request, env, url);
		} catch (error) {
			return new Response(null, { status: error instanceof URIError ? 400 : 503, headers: { 'Cache-Control': 'no-store' } });
		}
	},
};
