/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { computePathScore, computeSurfaceScore, computeS4, determineLabel, buildComment, type PRFile, type RiskConfig } from './pr-risk-score.ts';

const defaultConfig: RiskConfig = {
	pathScores: {
		'src/vscode-dts/': 3,
		'src/vs/code/electron-main/': 2,
		'src/vs/workbench/': 1,
		'src/vs/base/': 0,
	},
	lines: { minor: 200, major: 500 },
	labels: { low: 'risk:low', medium: 'risk:medium', high: 'risk:high' },
	thresholds: { medium: 3, high: 5 },
};

suite('computePathScore (S1)', () => {

	test('vscode-dts path returns 3', () => {
		const files: PRFile[] = [{ filename: 'src/vscode-dts/vscode.d.ts', status: 'modified', additions: 1, deletions: 0 }];
		assert.strictEqual(computePathScore(files, defaultConfig.pathScores!), 3);
	});

	test('electron-main path returns 2', () => {
		const files: PRFile[] = [{ filename: 'src/vs/code/electron-main/main.ts', status: 'modified', additions: 10, deletions: 0 }];
		assert.strictEqual(computePathScore(files, defaultConfig.pathScores!), 2);
	});

	test('workbench path returns 1', () => {
		const files: PRFile[] = [{ filename: 'src/vs/workbench/contrib/foo.ts', status: 'added', additions: 100, deletions: 0 }];
		assert.strictEqual(computePathScore(files, defaultConfig.pathScores!), 1);
	});

	test('base path returns 0', () => {
		const files: PRFile[] = [{ filename: 'src/vs/base/common/strings.ts', status: 'modified', additions: 5, deletions: 5 }];
		assert.strictEqual(computePathScore(files, defaultConfig.pathScores!), 0);
	});

	test('unmatched path returns 0', () => {
		const files: PRFile[] = [{ filename: 'docs/readme.md', status: 'modified', additions: 1, deletions: 0 }];
		assert.strictEqual(computePathScore(files, defaultConfig.pathScores!), 0);
	});

	test('multiple files takes the max', () => {
		const files: PRFile[] = [
			{ filename: 'src/vs/base/common/strings.ts', status: 'modified', additions: 5, deletions: 5 },
			{ filename: 'src/vs/workbench/contrib/foo.ts', status: 'modified', additions: 10, deletions: 0 },
		];
		assert.strictEqual(computePathScore(files, defaultConfig.pathScores!), 1);
	});

	test('empty files list returns 0', () => {
		assert.strictEqual(computePathScore([], defaultConfig.pathScores!), 0);
	});
});

suite('computeSurfaceScore (S2)', () => {

	test('less than 200 lines returns s2=0', () => {
		const files: PRFile[] = [{ filename: 'src/main.ts', status: 'modified', additions: 50, deletions: 30 }];
		const result = computeSurfaceScore(files, { minor: 200, major: 500 });
		assert.strictEqual(result.s2, 0);
		assert.strictEqual(result.totalLines, 80);
		assert.strictEqual(result.hasDts, false);
	});

	test('between 200 and 500 lines returns s2=1', () => {
		const files: PRFile[] = [{ filename: 'src/main.ts', status: 'modified', additions: 150, deletions: 100 }];
		const result = computeSurfaceScore(files, { minor: 200, major: 500 });
		assert.strictEqual(result.s2, 1);
		assert.strictEqual(result.totalLines, 250);
	});

	test('more than 500 lines returns s2=2', () => {
		const files: PRFile[] = [{ filename: 'src/main.ts', status: 'modified', additions: 300, deletions: 250 }];
		const result = computeSurfaceScore(files, { minor: 200, major: 500 });
		assert.strictEqual(result.s2, 2);
		assert.strictEqual(result.totalLines, 550);
	});

	test('.d.ts file adds 1 bonus point', () => {
		const files: PRFile[] = [
			{ filename: 'src/main.ts', status: 'modified', additions: 10, deletions: 0 },
			{ filename: 'src/types.d.ts', status: 'added', additions: 30, deletions: 0 },
		];
		const result = computeSurfaceScore(files, { minor: 200, major: 500 });
		assert.strictEqual(result.s2, 1);
		assert.strictEqual(result.hasDts, true);
		assert.strictEqual(result.totalLines, 40);
	});

	test('.d.ts alone under threshold returns s2=1 (just the bonus)', () => {
		const files: PRFile[] = [{ filename: 'src/types.d.ts', status: 'modified', additions: 1, deletions: 0 }];
		const result = computeSurfaceScore(files, { minor: 200, major: 500 });
		assert.strictEqual(result.s2, 1);
	});

	test('custom thresholds are respected', () => {
		const files: PRFile[] = [{ filename: 'src/main.ts', status: 'modified', additions: 120, deletions: 0 }];
		const result = computeSurfaceScore(files, { minor: 10, major: 100 });
		assert.strictEqual(result.s2, 2);
	});

	test('.d.ts + over major = s2=3', () => {
		const files: PRFile[] = [
			{ filename: 'src/types.d.ts', status: 'modified', additions: 300, deletions: 300 },
		];
		const result = computeSurfaceScore(files, { minor: 200, major: 500 });
		assert.strictEqual(result.s2, 3);
		assert.strictEqual(result.totalLines, 600);
		assert.strictEqual(result.hasDts, true);
	});
});

suite('computeS4 (absence of tests)', () => {

	test('modifies src/vs/ without tests returns 1', () => {
		const files: PRFile[] = [{ filename: 'src/vs/workbench/foo.ts', status: 'modified', additions: 10, deletions: 0 }];
		assert.strictEqual(computeS4(files), 1);
	});

	test('modifies src/vs/ with tests returns 0', () => {
		const files: PRFile[] = [
			{ filename: 'src/vs/workbench/foo.ts', status: 'modified', additions: 10, deletions: 0 },
			{ filename: 'src/vs/workbench/test/foo.test.ts', status: 'added', additions: 50, deletions: 0 },
		];
		assert.strictEqual(computeS4(files), 0);
	});

	test('modifies only docs returns 0', () => {
		const files: PRFile[] = [{ filename: 'docs/readme.md', status: 'modified', additions: 10, deletions: 0 }];
		assert.strictEqual(computeS4(files), 0);
	});

	test('modifies only config returns 0', () => {
		const files: PRFile[] = [{ filename: '.github/workflows/foo.yml', status: 'modified', additions: 1, deletions: 1 }];
		assert.strictEqual(computeS4(files), 0);
	});

	test('modifies src/vs/ with .spec.ts returns 0', () => {
		const files: PRFile[] = [
			{ filename: 'src/vs/workbench/foo.ts', status: 'modified', additions: 10, deletions: 0 },
			{ filename: 'src/vs/workbench/test/foo.spec.ts', status: 'added', additions: 30, deletions: 0 },
		];
		assert.strictEqual(computeS4(files), 0);
	});
});

suite('determineLabel', () => {

	test('score 0-2 returns low', () => {
		assert.strictEqual(determineLabel(0, defaultConfig), 'risk:low');
		assert.strictEqual(determineLabel(1, defaultConfig), 'risk:low');
		assert.strictEqual(determineLabel(2, defaultConfig), 'risk:low');
	});

	test('score 3-4 returns medium', () => {
		assert.strictEqual(determineLabel(3, defaultConfig), 'risk:medium');
		assert.strictEqual(determineLabel(4, defaultConfig), 'risk:medium');
	});

	test('score 5+ returns high', () => {
		assert.strictEqual(determineLabel(5, defaultConfig), 'risk:high');
		assert.strictEqual(determineLabel(6, defaultConfig), 'risk:high');
	});

	test('custom thresholds are respected', () => {
		const customConfig: RiskConfig = { thresholds: { medium: 2, high: 4 }, labels: { low: 'low', medium: 'med', high: 'high' } };
		assert.strictEqual(determineLabel(1, customConfig), 'low');
		assert.strictEqual(determineLabel(2, customConfig), 'med');
		assert.strictEqual(determineLabel(3, customConfig), 'med');
		assert.strictEqual(determineLabel(4, customConfig), 'high');
	});

	test('fallback labels when config is empty', () => {
		assert.strictEqual(determineLabel(0, {}), 'risk:low');
		assert.strictEqual(determineLabel(3, {}), 'risk:medium');
		assert.strictEqual(determineLabel(5, {}), 'risk:high');
	});
});

suite('integrated scenarios (synthetic PRs)', () => {

	test('SCENARIO 1: Docs typo fix → risk:low (score 0-2)', () => {
		const files: PRFile[] = [
			{ filename: 'docs/readme.md', status: 'modified', additions: 1, deletions: 1 },
		];
		const s1 = computePathScore(files, defaultConfig.pathScores!);
		const { s2 } = computeSurfaceScore(files, { minor: 200, major: 500 });
		const s4 = computeS4(files);
		const total = s1 + s2 + s4;
		const label = determineLabel(total, defaultConfig);
		assert.strictEqual(s1, 0);
		assert.strictEqual(s2, 0);
		assert.strictEqual(s4, 0);
		assert.strictEqual(total, 0);
		assert.strictEqual(label, 'risk:low');
	});

	test('SCENARIO 2: src/vs/base/ change under 200 lines → risk:low (score 0)', () => {
		const files: PRFile[] = [
			{ filename: 'src/vs/base/common/strings.ts', status: 'modified', additions: 30, deletions: 10 },
		];
		const s1 = computePathScore(files, defaultConfig.pathScores!);
		const { s2 } = computeSurfaceScore(files, { minor: 200, major: 500 });
		const s4 = computeS4(files);
		const total = s1 + s2 + s4;
		assert.strictEqual(s1, 0);
		assert.strictEqual(s2, 0);
		assert.strictEqual(s4, 1);
		assert.strictEqual(total, 1);
		assert.strictEqual(determineLabel(total, defaultConfig), 'risk:low');
	});

	test('SCENARIO 3: workbench change >200 lines without tests → risk:medium (score 3)', () => {
		const files: PRFile[] = [
			{ filename: 'src/vs/workbench/contrib/editor.ts', status: 'modified', additions: 150, deletions: 60 },
		];
		const s1 = computePathScore(files, defaultConfig.pathScores!);
		const { s2 } = computeSurfaceScore(files, { minor: 200, major: 500 });
		const s4 = computeS4(files);
		const total = s1 + s2 + s4;
		assert.strictEqual(s1, 1);
		assert.strictEqual(s2, 1);
		assert.strictEqual(s4, 1);
		assert.strictEqual(total, 3);
		assert.strictEqual(determineLabel(total, defaultConfig), 'risk:medium');
	});

	test('SCENARIO 4: vscode-dts API change + .d.ts + >500 lines + no tests → risk:high (score 7)', () => {
		const files: PRFile[] = [
			{ filename: 'src/vscode-dts/vscode.d.ts', status: 'modified', additions: 301, deletions: 200 },
		];
		const config: RiskConfig = {
			pathScores: { 'src/vscode-dts/': 3 },
			lines: { minor: 200, major: 500 },
			thresholds: { medium: 3, high: 5 },
		};
		const s1 = computePathScore(files, config.pathScores!);
		const { s2 } = computeSurfaceScore(files, { minor: 200, major: 500 });
		const s4 = computeS4(files);
		const total = s1 + s2 + s4;
		assert.strictEqual(s1, 3);
		assert.strictEqual(s2, 3);
		assert.strictEqual(s4, 0);
		assert.strictEqual(total, 6);
		assert.strictEqual(determineLabel(total, defaultConfig), 'risk:high');
	});

	test('SCENARIO 5: electron-main change with tests → risk:medium (score 3)', () => {
		const files: PRFile[] = [
			{ filename: 'src/vs/code/electron-main/window.ts', status: 'modified', additions: 120, deletions: 90 },
			{ filename: 'src/vs/code/electron-main/test/window.test.ts', status: 'added', additions: 80, deletions: 0 },
		];
		const s1 = computePathScore(files, defaultConfig.pathScores!);
		const { s2 } = computeSurfaceScore(files, { minor: 200, major: 500 });
		const s4 = computeS4(files);
		const total = s1 + s2 + s4;
		assert.strictEqual(s1, 2);
		assert.strictEqual(s2, 1);
		assert.strictEqual(s4, 0);
		assert.strictEqual(total, 3);
		assert.strictEqual(determineLabel(total, defaultConfig), 'risk:medium');
	});

	test('SCENARIO 6: build/config change only → risk:low (score 0)', () => {
		const files: PRFile[] = [
			{ filename: '.github/workflows/pr.yml', status: 'modified', additions: 5, deletions: 5 },
			{ filename: '.github/pr-risk-config.json', status: 'added', additions: 10, deletions: 0 },
		];
		const s1 = computePathScore(files, defaultConfig.pathScores!);
		const { s2 } = computeSurfaceScore(files, { minor: 200, major: 500 });
		const s4 = computeS4(files);
		const total = s1 + s2 + s4;
		assert.strictEqual(total, 0);
		assert.strictEqual(determineLabel(total, defaultConfig), 'risk:low');
	});
});

suite('buildComment', () => {

	test('includes risk level and score breakdown', () => {
		const comment = buildComment(3, 'risk:medium', 1, 1, 0, 1, 250, false, ['mjbvz', 'alexr00'], false);
		assert.ok(comment.includes('**PR Risk Score**: 3 (risk:medium)'));
		assert.ok(comment.includes('- S1 (path): 1'));
		assert.ok(comment.includes('- S2 (size/.d.ts): 1'));
		assert.ok(comment.includes('- S3 (recent fixes): 0'));
		assert.ok(comment.includes('- S4 (tests absent): 1'));
	});

	test('high risk includes checklist', () => {
		const comment = buildComment(6, 'risk:high', 3, 3, 0, 0, 600, true, [], true);
		assert.ok(comment.includes('### Review Checklist'));
		assert.ok(comment.includes('Verify backward compatibility'));
	});

	test('medium risk omits checklist', () => {
		const comment = buildComment(3, 'risk:medium', 1, 1, 0, 1, 250, false, ['mjbvz'], false);
		assert.ok(!comment.includes('### Review Checklist'));
	});

	test('includes suggested owners', () => {
		const comment = buildComment(3, 'risk:medium', 1, 1, 0, 1, 250, false, ['mjbvz', 'alexr00'], false);
		assert.ok(comment.includes('@mjbvz'));
		assert.ok(comment.includes('@alexr00'));
	});

	test('no owners listed when array is empty', () => {
		const comment = buildComment(0, 'risk:low', 0, 0, 0, 0, 0, false, [], false);
		assert.ok(!comment.includes('Suggested owners'));
	});
});
