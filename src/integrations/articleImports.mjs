import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleManifestPath, articleSlug, encodePath } from '../utils/articlePaths.js';
import { imagesInArticle, readArticleSnapshot } from '../utils/articleSnapshot.js';

const rasterFile = /\.(?:avif|gif|jpe?g|png|webp)$/i;

export default function articleImports(site) {
	return {
		name: 'article-imports',
		hooks: {
			async 'astro:build:done'({ dir }) {
				const root = fileURLToPath(dir);
				const entries = await readdir(root, { recursive: true, withFileTypes: true });
				const articles = Object.create(null);
				const byHash = new Map();
				const groups = Object.create(null);
				const owners = Object.create(null);
				for (const entry of entries) {
					if (!entry.isFile()) continue;
					const file = resolve(entry.parentPath, entry.name);
					const path = '/' + relative(root, file).split(sep).join('/');
					if (rasterFile.test(path)) {
						const hash = createHash('sha256').update(await readFile(file)).digest('hex');
						if (!byHash.has(hash)) byHash.set(hash, []);
						byHash.get(hash).push(path);
						continue;
					}
					const slug = path.endsWith('/index.html') && articleSlug(path);
				if (!slug) continue;
					const snapshot = readArticleSnapshot(await readFile(file, 'utf8'));
					if (!snapshot) continue;
					const url = new URL(`/blog/${encodePath(slug)}/`, site);
					const images = imagesInArticle(snapshot.article, url);
					articles[slug] = snapshot.title;
					for (const { path: source, variants } of images) {
					for (const asset of [source, ...variants].filter(Boolean)) {
							(owners[asset] ??= []).push(slug);
						}
					}
				}
				for (const paths of byHash.values()) {
					if (paths.length > 1) {
						for (const path of paths) groups[path] = paths;
					}
				}
				await writeFile(new URL('.' + articleManifestPath, dir), JSON.stringify({ articles, groups, owners }));
			},
		},
	};
}
