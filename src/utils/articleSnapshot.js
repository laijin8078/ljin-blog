import { parse, serializeOuter } from 'parse5';
import { assetPath } from './articlePaths.js';

const contentElements = new Set([
	'a', 'abbr', 'article', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del',
	'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'section',
	'picture', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead',
	'time', 'tr', 'u', 'ul',
]);
const safeAttributes = new Set([
	'alt', 'class', 'colspan', 'datetime', 'height', 'hidden', 'href', 'id', 'lang', 'open', 'rowspan',
	'scope', 'src', 'start', 'style', 'title', 'width',
]);
export const rasterTypes = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);

function attribute(node, name) {
	return node.attrs?.find((item) => item.name === name)?.value;
}

function* descendants(node) {
	for (const child of node.childNodes ?? []) {
		yield child;
		yield* descendants(child);
	}
}

export function readArticleSnapshot(html) {
	const document = parse(html);
	const nodes = [...descendants(document)];
	const article = nodes.find((node) => attribute(node, 'data-import-content') !== undefined);
	const title = attribute(article ?? {}, 'data-import-content');
	return title ? { title, article } : null;
}

function imagePath(source, postUrl) {
	const url = source && new URL(source, postUrl);
	return url && url.origin === postUrl.origin ? assetPath(url.pathname) : null;
}

export function imagesInArticle(article, postUrl) {
	return [...descendants(article)].filter((node) => node.tagName === 'img').map((node) => ({
		path: imagePath(attribute(node, 'src'), postUrl),
		variants: [attribute(node, 'data-import-original'), ...(attribute(node, 'srcset') ?? '').split(',').map((part) => part.trim().split(/\s+/)[0])]
			.map((source) => imagePath(source, postUrl)).filter(Boolean),
	}));
}

export function renderArticleSnapshot(article, postUrl, privateImages) {
	function clean(node) {
		if (node.nodeName === '#text') return true;
		if (!contentElements.has(node.tagName)) return false;
		node.attrs = node.attrs.filter((item) => safeAttributes.has(item.name) && !item.namespace);
		const href = node.attrs.find((item) => item.name === 'href');
		if (href && !href.value.startsWith('#')) {
			const target = new URL(href.value, postUrl);
			const image = target.origin === postUrl.origin && privateImages.get(assetPath(target.pathname));
			if (image) href.value = image;
			else if (['https:', 'http:', 'mailto:'].includes(target.protocol)) href.value = target.href;
			else node.attrs = node.attrs.filter((item) => item !== href);
		}
		if (node.tagName === 'img') {
			const src = node.attrs.find((item) => item.name === 'src');
			const image = src && privateImages.get(imagePath(src.value, postUrl));
			if (!image) return false;
			src.value = image;
		}
		node.childNodes = node.childNodes.filter(clean);
		return true;
	}
	clean(article);
	return serializeOuter(article);
}
