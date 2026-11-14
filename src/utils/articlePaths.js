export const articleManifestPath = '/_article-imports.json';

export function assetPath(pathname) {
	const segments = [];
	for (const segment of decodeURIComponent(pathname).replaceAll('\\', '/').split('/')) {
		if (segment === '..') segments.pop();
		else if (segment && segment !== '.') segments.push(segment);
	}
	return '/' + segments.join('/');
}

export function articleSlug(path) {
	if (!path.startsWith('/blog/')) return null;
	return path.slice(6).replace(/\/index(?:\.html)?$|\.html$/i, '') || null;
}

export function encodePath(path) {
	return path.split('/').map(encodeURIComponent).join('/');
}
