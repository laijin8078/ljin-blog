import type { CollectionEntry } from 'astro:content';

export type TagSummary = {
	name: string;
	key: string;
	count: number;
};

export function normalizeTagName(tag: string) {
	return tag.trim().replace(/\s+/g, ' ');
}

export function getTagKey(tag: string) {
	return normalizeTagName(tag).toLocaleLowerCase();
}

export function getUniqueTags(tags: string[]) {
	const uniqueTags = new Map<string, string>();

	for (const tag of tags) {
		const name = normalizeTagName(tag);
		if (!name) continue;

		const key = getTagKey(name);
		if (!uniqueTags.has(key)) uniqueTags.set(key, name);
	}

	return [...uniqueTags.values()];
}

export function getTagHref(tag: string) {
	return `/tags/${encodeURIComponent(getTagKey(tag))}/`;
}

export function collectTags(posts: CollectionEntry<'blog'>[]): TagSummary[] {
	const tags = new Map<string, TagSummary>();

	for (const post of posts) {
		for (const name of getUniqueTags(post.data.tags)) {
			const key = getTagKey(name);
			const existing = tags.get(key);

			if (existing) {
				existing.count += 1;
			} else {
				tags.set(key, { name, key, count: 1 });
			}
		}
	}

	return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
