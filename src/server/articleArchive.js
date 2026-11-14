import { parseFragment } from 'parse5';
import { articleManifestPath, articleSlug, assetPath, encodePath } from '../utils/articlePaths.js';
import { imagesInArticle, rasterTypes, readArticleSnapshot, renderArticleSnapshot } from '../utils/articleSnapshot.js';
import { escapeHtml, readFields } from './responses.js';

const maxImageBytes = 1_000_000;
const maxArticleBytes = 1_000_000;
const maxImages = 12;

async function readBytes(response, limit) {
	if (!response.ok || !response.body) throw new Error('Asset unavailable');
	if (Number(response.headers.get('Content-Length')) > limit) {
		await response.body.cancel();
		throw new Error('Asset too large');
	}
	const reader = response.body.getReader();
	const chunks = [];
	let length = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (length > limit) {
			await reader.cancel();
			throw new Error('Asset too large');
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes.buffer;
}

function fetchAsset(env, origin, path) {
	return env.ASSETS.fetch(new Request(new URL(encodePath(path), origin)));
}

async function getManifest(env, origin) {
	const response = await fetchAsset(env, origin, articleManifestPath);
	return JSON.parse(new TextDecoder().decode(await readBytes(response, maxArticleBytes)));
}

export async function importPage(request, env, page, redirect) {
	const url = new URL(request.url);
	const slug = request.method === 'POST'
		? (await readFields(request, 4000))?.get('slug')
		: url.searchParams.get('slug');
	const db = env.BLOG_DB;
	const { articles, groups, owners } = await getManifest(env, url.origin);
	if (!slug && request.method === 'GET') {
		const { results } = await db.prepare('SELECT slug FROM archived_posts').all();
		const archived = new Set(results.map((row) => row.slug));
		const entries = Object.entries(articles).filter(([id]) => !archived.has(id));
		return page('转入私密区', entries.length ? `<ul>${entries.map(([id, title]) =>
			`<li><a href="/private/import?slug=${encodeURIComponent(id)}">${escapeHtml(title)}</a></li>`).join('')}</ul>`
			: '<p>目前没有可转入的公开文章。</p>');
	}
	if (!slug || !Object.hasOwn(articles, slug)) return page('公开文章不存在', '', 404);
	const published = await db.prepare(`SELECT archived_posts.private_id, private_posts.id AS active_id
		FROM archived_posts LEFT JOIN private_posts ON private_posts.id = archived_posts.private_id
		WHERE archived_posts.slug = ?`).bind(slug).first();
	if (published) {
		return published.active_id ? redirect(`/private/${published.active_id}/`)
			: page('文章已下架', '<p>这篇文章的私密副本已经删除。</p>', 410);
	}
	const title = articles[slug];
	if (request.method === 'GET') {
		return page('转入私密区', `<p>将《${escapeHtml(title)}》的正文、排版和站内图片保存到私密区，并从博客下架公开版。</p>
			<p>旧的 Git 历史和他人保存的副本仍可能保留内容。</p>
			<form method="post" action="/private/import">
				<input type="hidden" name="slug" value="${escapeHtml(slug)}">
				<button class="primary" type="submit">确认转为私密</button> <a href="/private/import">取消</a>
			</form>`);
	}
	const articlePath = `/blog/${slug}/`;
	const postUrl = new URL(encodePath(articlePath), url.origin);
	const source = await fetchAsset(env, url.origin, articlePath);
	const snapshot = readArticleSnapshot(new TextDecoder().decode(await readBytes(source, maxArticleBytes)));
	if (!snapshot || snapshot.title !== title) return page('文章暂时无法转入', '<p>请刷新文章列表后重试。</p>', 409);
	const id = crypto.randomUUID();
	const saved = new Map();
	const blocked = new Set();
	const imageInserts = [];
	const references = imagesInArticle(snapshot.article, postUrl);
	if (references.some(({ path }) => !path) || new Set(references.map(({ path }) => path)).size > maxImages) {
		return page('文章暂时无法转入', '<p>目前支持每篇最多 12 张站内图片。公开版仍可访问。</p>', 422);
	}
	let imageBytes = 0;
	for (const { path, variants } of references) {
		const matching = [path, ...variants].flatMap((item) => groups[item] ?? [item]);
		for (const asset of matching) blocked.add(asset);
		if (saved.has(path)) continue;
		const image = await fetchAsset(env, url.origin, path);
		const contentType = image.headers.get('Content-Type')?.split(';')[0];
		if (!rasterTypes.has(contentType)) {
			return page('文章暂时无法转入', '<p>使用了不支持的图片格式，或有图片已无法读取。</p>', 422);
		}
		let bytes;
		try {
			bytes = await readBytes(image, maxImageBytes);
		} catch {
			return page('文章暂时无法转入', '<p>有图片无法读取，或超过 1 MB。公开版仍可访问。</p>', 422);
		}
		imageBytes += bytes.byteLength;
		if (imageBytes > 2_000_000) return page('文章暂时无法转入', '<p>图片总大小超过 2 MB。公开版仍可访问。</p>', 422);
		const imageId = crypto.randomUUID();
		const privatePath = `/private/${id}/images/${imageId}`;
		for (const asset of groups[path] ?? [path]) saved.set(asset, privatePath);
		imageInserts.push(db.prepare('INSERT INTO private_post_images (id, post_id, content_type, data) VALUES (?, ?, ?, ?)')
			.bind(imageId, id, contentType, bytes));
	}
	if ([...blocked].some((path) => owners[path]?.some((owner) => owner !== slug))) {
		return page('文章暂时无法转入', '<p>有图片也被其他公开文章使用。请先在其他文章中替换该图片，再试一次。</p>', 409);
	}
	const html = renderArticleSnapshot(snapshot.article, postUrl, saved);
	try {
		await db.batch([
			db.prepare('INSERT INTO private_posts (id, title, body, updated_at, archive_html) VALUES (?, ?, ?, ?, ?)')
				.bind(id, title, '', new Date().toISOString(), html),
			db.prepare('INSERT INTO archived_posts (slug, private_id) VALUES (?, ?)').bind(slug, id),
			...imageInserts,
			...[...blocked].map((path) => db.prepare('INSERT INTO archived_assets (path, slug) VALUES (?, ?)').bind(path, slug)),
		]);
	} catch (error) {
		const existing = await db.prepare('SELECT private_id FROM archived_posts WHERE slug = ?').bind(slug).first();
		if (existing) return redirect(`/private/${existing.private_id}/`);
		throw error;
	}
	return redirect(`/private/${id}/`);
}

const publicList = /^\/(?:blog|tags)(?:\/index(?:\.html)?)?$/i;
const feed = /^\/(?:rss\.xml|sitemap-\d+\.xml)$/i;

function listElement(slugSet) {
	let tagCount = 0;
	return {
		element(element) {
			if (element.hasAttribute('data-tag-total')) {
				element.setInnerContent(`${tagCount} 篇`);
				element.removeAttribute('data-tag-total');
				return;
			}
			const slug = element.getAttribute('data-post-slug');
			const posts = element.getAttribute('data-tag-posts') ?? element.getAttribute('data-tag-count');
			if (slug !== null) {
				if (slugSet.has(decodeURIComponent(slug))) element.remove();
				element.removeAttribute('data-post-slug');
				return;
			}
			const count = posts.split(',').filter((id) => id && !slugSet.has(decodeURIComponent(id))).length;
			if (element.hasAttribute('data-tag-posts')) {
				tagCount = count;
				if (!count) element.remove();
			}
			if (element.hasAttribute('data-tag-count')) element.setInnerContent(`共 ${count} 篇文章`);
			element.removeAttribute('data-tag-posts');
			element.removeAttribute('data-tag-count');
		},
	};
}

function filterFeed(xml, origin, slugSet) {
	return xml.replace(/<(item|url)>([\s\S]*?)<\/\1>/g, (entry, tag, contents) => {
		const link = contents.match(tag === 'item' ? /<link>([^<]+)<\/link>/ : /<loc>([^<]+)<\/loc>/)?.[1];
		if (!link) return entry;
		const url = parseFragment(link).childNodes[0]?.value;
		return url && slugSet.has(articleSlug(assetPath(new URL(url, origin).pathname))) ? '' : entry;
	});
}

export const archivedResponse = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function isArchivedPost(db, slug) {
	return Boolean(await db.prepare('SELECT 1 FROM archived_posts WHERE slug = ? COLLATE NOCASE').bind(slug).first());
}

export async function servePublic(request, env, url) {
	const path = assetPath(url.pathname);
	if (path.toLowerCase() === articleManifestPath) return archivedResponse();
	const slug = articleSlug(path);
	const isImage = /\.(?:avif|gif|jpe?g|png|webp)$/i.test(path);
	if (slug || isImage) {
		const archived = await env.BLOG_DB.prepare(`SELECT 1 FROM archived_posts WHERE slug = ? COLLATE NOCASE
			UNION ALL SELECT 1 FROM archived_assets WHERE path = ? COLLATE NOCASE LIMIT 1`)
			.bind(slug, path).first();
		if (archived) return archivedResponse();
	}
	const isList = publicList.test(path) || path.startsWith('/tags/');
	const isFeed = feed.test(path);
	if (!isList && !isFeed) {
		const response = await env.ASSETS.fetch(request);
		if (!slug && !isImage) return response;
		const headers = new Headers(response.headers);
		headers.set('Cache-Control', 'no-cache');
		return new Response(response.body, { status: response.status, headers });
	}
	const assetRequest = new Request(request);
	for (const name of ['If-None-Match', 'If-Modified-Since', 'If-Range', 'Range']) assetRequest.headers.delete(name);
	const response = await env.ASSETS.fetch(assetRequest);
	if (!response.ok) return response;
	const { results } = await env.BLOG_DB.prepare('SELECT slug FROM archived_posts').all();
	const slugSet = new Set(results.map((row) => row.slug));
	const headers = new Headers(response.headers);
	for (const name of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified']) headers.delete(name);
	headers.set('Cache-Control', 'no-store');
	if (request.method === 'HEAD') return new Response(null, { headers });
	if (isFeed) return new Response(filterFeed(await response.text(), url.origin, slugSet), { headers });
	return new HTMLRewriter().on('[data-post-slug], [data-tag-posts], [data-tag-count], [data-tag-total]', listElement(slugSet))
		.transform(new Response(response.body, { headers }));
}
