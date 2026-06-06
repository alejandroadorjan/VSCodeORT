/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { GitHubIssue, GitHubWorkflowRun } from '../model/github';
import { createRecentRunCard, createIssueCard, createRunInsight } from '../transformers/dashboardMetrics.cards';

export async function runCardsTests() {
  testRecentRunCardSuccess();
  testRecentRunCardFallbacks();
  testCreateIssueCard();
  testCreateRunInsight();
}

function testRecentRunCardSuccess() {
  const run: GitHubWorkflowRun = {
    name: 'My Workflow Name That Is Surprisingly Long And Will Be Truncated',
    workflow_name: undefined,
    head_branch: 'main',
    run_started_at: '2021-01-01T00:00:00Z',
    updated_at: '2021-01-01T00:00:30Z',
    conclusion: 'success',
  };

  const card = createRecentRunCard(run);
  assert.ok(card.name.length <= 30);
  assert.strictEqual(card.branch, ' / main');
  assert.strictEqual(card.badgeClass, 'badge-green');
  assert.strictEqual(card.dotClass, 'green');
  assert.strictEqual(card.statusLabel, 'success');
}

function testRecentRunCardFallbacks() {
  const run: GitHubWorkflowRun = {
    workflow_name: 'WF',
    run_started_at: undefined,
    updated_at: undefined,
    conclusion: undefined,
  };

  const card = createRecentRunCard(run);
  assert.strictEqual(card.branch, '');
  assert.ok(card.name === 'WF' || card.name === 'Workflow');
  assert.strictEqual(card.statusLabel, 'unknown');
}

function testCreateIssueCard() {
  const issue: GitHubIssue = {
    number: 42,
    title: 'Fix me',
    closed_at: null,
    labels: [{ name: 'p1', color: '00ff00' }],
    closed_by: { login: 'alice' },
    comments: 3,
  };

  const ic = createIssueCard(issue);
  assert.strictEqual(ic.number, 42);
  assert.ok(ic.labels.includes('p1'));
  assert.ok(ic.closedBy.includes('@alice'));
  assert.strictEqual(ic.commentCount, '3');
}

function testCreateRunInsight() {
  const run: GitHubWorkflowRun = {
    name: 'CI',
    display_title: 'Fix terminal regression',
    head_branch: 'main',
    head_sha: '1234567890abcdef',
    conclusion: 'action_required',
    run_started_at: '2021-01-01T00:00:00Z',
    updated_at: null,
    html_url: 'https://github.com/microsoft/vscode/actions/runs/1',
  };

  const insight = createRunInsight(run);
  assert.strictEqual(insight.name, 'CI');
  assert.strictEqual(insight.title, 'Fix terminal regression');
  assert.strictEqual(insight.commit, '1234567');
  assert.strictEqual(insight.hasDuration, false);
  assert.strictEqual(insight.url, 'https://github.com/microsoft/vscode/actions/runs/1');
}
