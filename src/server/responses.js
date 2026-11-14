export function json(data, init = {}) {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...init.headers,
		},
	});
}

export function isSameOrigin(request) {
	return request.headers.get('Origin') === new URL(request.url).origin;
}

export async function readFields(request, maxBytes) {
	if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/x-www-form-urlencoded') {
		return null;
	}
	const reader = request.body?.getReader();
	if (!reader) return null;

	const decoder = new TextDecoder();
	let size = 0;
	let body = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return new URLSearchParams(body + decoder.decode());
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			return null;
		}
		body += decoder.decode(value, { stream: true });
	}
}

export async function checkRateLimit(request, env, action) {
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	const { success } = await env.BLOG_RATE_LIMIT.limit({ key: `${action}:${ip}` });
	return success;
}
