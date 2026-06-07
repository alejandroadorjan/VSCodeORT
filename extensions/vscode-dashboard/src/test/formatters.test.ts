/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { GitHubLabel } from '../model/github';
import { formatDuration, formatClosedDate, createLabelMarkup } from '../transformers/dashboardMetrics.formatters';

export async function runFormattersTests() {
	testFormatDuration();
	testFormatClosedDate();
	testCreateLabelMarkup();
}

function testFormatDuration() {
	assert.strictEqual(formatDuration(-1), '—');
	assert.strictEqual(formatDuration(0), '—');
	assert.strictEqual(formatDuration(30), '30s');
	assert.strictEqual(formatDuration(90), '1m 30s');
}

function testFormatClosedDate() {
	assert.strictEqual(formatClosedDate(undefined), '—');
	const s = formatClosedDate('2021-01-02T00:00:00Z');
	// US formatted string contains the year and month abbreviation
	assert.ok(/2021/.test(s));
	assert.ok(/[A-Za-z]{3}/.test(s));
}

function testCreateLabelMarkup() {
	const labels: GitHubLabel[] = [{ name: 'bug', color: 'ff0000' }];
	const html = createLabelMarkup(labels);
	assert.ok(html.includes('bug'));
	assert.ok(html.includes('background:rgba(255,0,0')); // red channel check
	// empty labels
	assert.strictEqual(createLabelMarkup(undefined), '');
}
