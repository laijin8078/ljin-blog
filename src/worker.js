function json(data, init = {}) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...(init.headers || {}),
		},
	});
}

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
			return handleViews(request, env);
		}

		return env.ASSETS.fetch(request);
	},
};
