import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-staffportal-staging.yml', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../.github/workflows/staffportal-release-controller-ci.yml', import.meta.url), 'utf8');
const ci = fs.readFileSync(new URL('../.github/workflows/staffportal-ci.yml', import.meta.url), 'utf8');
const ciPullRequestBases = ci.match(/pull_request:\r?\n\s{4}branches:\r?\n((?:\s{6}-[^\r\n]+\r?\n?)+)/)?.[1] || '';

const checks = [
  ['workflow is labelled Pre-Production', workflow.includes('name: StaffPortal Pre-Production Deploy')],
  ['official branch push auto-deploy is enabled', workflow.includes("push:\n    branches:\n      - 'preproduction/staffportal'") || workflow.includes("push:\r\n    branches:\r\n      - 'preproduction/staffportal'")],
  ['manual exact-SHA recovery remains available', workflow.includes('workflow_dispatch:') && workflow.includes('candidate_sha:')],
  ['automatic run uses github.sha', workflow.includes("github.event_name == 'push' && github.sha || inputs.candidate_sha")],
  ['stale queued deployment is rejected', workflow.includes('Skipping stale Pre-Production deploy')],
  ['production safety gates remain closed', workflow.includes('productionDeployAuthorized') && workflow.includes('productionMigrationAuthorized')],
  ['post-deploy health verification remains present', workflow.includes('Verify Pre-Production health')],
  ['runtime verification remains present', workflow.includes('Verify Pre-Production runtime and auth route contract')],
  ['asset integrity verification remains present', workflow.includes('Verify versioned Pre-Production asset integrity')],
  ['Staff Portal CI covers main and official Pre-Production pull requests', ciPullRequestBases.includes('- main') && ciPullRequestBases.includes('- preproduction/staffportal')],
  ['controller CI targets official Pre-Production source', controller.includes('ref: preproduction/staffportal')],
];

for (const [name, pass] of checks) {
  assert.ok(pass, name);
  console.log('PASS ' + name);
}
console.log('Pre-Production governance checks passed: ' + checks.length + '/' + checks.length + '.');
