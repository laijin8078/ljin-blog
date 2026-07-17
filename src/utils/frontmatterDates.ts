import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type DateDisplayPrecision = 'date' | 'datetime';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function stripWrappingQuotes(value: string) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

export function getFrontmatterDatePrecision(
	filePath: string | undefined,
	fieldName: 'pubDate' | 'updatedDate',
): DateDisplayPrecision {
	if (!filePath) {
		return 'datetime';
	}

	const source = readFileSync(resolve(filePath), 'utf8');
	const frontmatter = source.match(FRONTMATTER_PATTERN)?.[1];

	if (!frontmatter) {
		return 'datetime';
	}

	const field = frontmatter.match(new RegExp(`^${fieldName}:\\s*(.*?)\\s*$`, 'm'))?.[1]?.trim();

	if (!field) {
		return 'datetime';
	}

	return DATE_ONLY_PATTERN.test(stripWrappingQuotes(field)) ? 'date' : 'datetime';
}
