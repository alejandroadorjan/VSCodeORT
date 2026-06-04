import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const H2_HEADING_PATTERN = /^##(?!#)\s+(.+)$/;

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function stripHtmlComments(text) {
	if (!text) {
		return '';
	}

	return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * @param {string} heading
 * @returns {string}
 */
export function normalizeHeading(heading) {
	return heading.trim().toLowerCase();
}

/**
 * @param {string} configHeading
 * @returns {string}
 */
export function toDisplayHeading(configHeading) {
	const trimmed = configHeading.trim();
	return trimmed.startsWith('##') ? trimmed : `## ${trimmed}`;
}

/**
 * @param {string | null | undefined} body
 * @returns {Map<string, string>}
 */
export function parseSectionContents(body) {
	/** @type {Map<string, string>} */
	const sections = new Map();
	const lines = stripHtmlComments(body).split('\n');

	let currentKey = null;
	/** @type {string[]} */
	let currentLines = [];

	const flush = () => {
		if (currentKey === null) {
			return;
		}

		const content = currentLines.join('\n').trim();
		const existing = sections.get(currentKey);

		if (existing) {
			sections.set(currentKey, `${existing}\n${content}`);
		} else {
			sections.set(currentKey, content);
		}
	};

	for (const line of lines) {
		const match = line.match(H2_HEADING_PATTERN);

		if (match) {
			flush();
			currentKey = normalizeHeading(match[1]);
			currentLines = [];
			continue;
		}

		if (currentKey !== null) {
			currentLines.push(line);
		}
	}

	flush();
	return sections;
}

/**
 * @typedef {{
 *   heading: string;
 *   description?: string;
 *   minContentLength: number;
 * }} ConfigSection
 *
 * @typedef {{
 *   bypassLabel?: string;
 *   sections: ConfigSection[];
 * }} PrStructureConfig
 *
 * @typedef {{
 *   valid: boolean;
 *   errors: string[];
 * }} ValidationResult
 */

/**
 * @param {string | null | undefined} body
 * @param {PrStructureConfig} config
 * @returns {ValidationResult}
 */
export function validatePrStructure(body, config) {
	/** @type {string[]} */
	const errors = [];
	const parsed = parseSectionContents(body);

	for (const section of config.sections) {
		const key = normalizeHeading(section.heading.replace(/^##\s*/, ''));
		const displayHeading = toDisplayHeading(section.heading);

		if (!parsed.has(key)) {
			errors.push(`Missing required section: ${displayHeading}`);
			continue;
		}

		const content = parsed.get(key) ?? '';
		const minLength = section.minContentLength ?? 0;

		if (content.length < minLength) {
			errors.push(
				`Section ${displayHeading} has insufficient content (${content.length}/${minLength} characters)`
			);
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * @param {string} configPath
 * @returns {PrStructureConfig}
 */
export function loadConfig(configPath) {
	const raw = readFileSync(configPath, 'utf8');
	const config = JSON.parse(raw);

	if (!config || !Array.isArray(config.sections) || config.sections.length === 0) {
		throw new Error(`Invalid config at ${configPath}: "sections" must be a non-empty array`);
	}

	for (const section of config.sections) {
		if (!section.heading || typeof section.minContentLength !== 'number') {
			throw new Error(`Invalid config at ${configPath}: each section requires "heading" and "minContentLength"`);
		}
	}

	return config;
}

/**
 * @param {ValidationResult} result
 * @param {{ githubActions?: boolean }} [options]
 */
export function printValidationResult(result, options = {}) {
	for (const error of result.errors) {
		if (options.githubActions) {
			console.log(`::error::${error}`);
		} else {
			console.error(error);
		}
	}
}

async function readBodyFromStdin() {
	if (process.stdin.isTTY) {
		return '';
	}

	const chunks = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}

	return Buffer.concat(chunks).toString('utf8');
}

async function main() {
	const { values } = parseArgs({
		options: {
			config: { type: 'string' },
			body: { type: 'string' },
			'github-actions': { type: 'boolean', default: false }
		}
	});

	if (!values.config) {
		console.error('Usage: node validate-pr-structure.mjs --config <path> [--body <text>] [--github-actions]');
		process.exit(2);
	}

	const config = loadConfig(values.config);
	const body = values.body ?? await readBodyFromStdin();
	const result = validatePrStructure(body, config);

	printValidationResult(result, { githubActions: values['github-actions'] });

	if (result.valid) {
		console.log('PR structure validation passed.');
		process.exit(0);
	}

	process.exit(1);
}

const isMain = process.argv[1] !== undefined &&
	fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], import.meta.url));

if (isMain) {
	main().catch(error => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	});
}
