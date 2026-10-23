import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-staffportal-staging.yml', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../.github/workflows/staffportal-release-controller-ci.yml', import.meta.url), 'utf8');

const checks = [
  ['workflow is labelled Pre-Production', workflow.includes('name: StaffPortal Pre-Production Deploy')],
  ['official branch push auto-deploy is enabled', workflow.includes("push:\n    branches:\n      - 'preproduction/staffportal'") || workflow.includes("push:\r\n    branches:\r\n      - 'preproduction/staffportal'")],
  ['manual exact-SHA recovery remains available', workflow.includes('workflow_dispatch:') && workflow.includes('candidate_sha:')],
  ['automatic run uses github.sha', workflow.includes("github.event_name == 'push' && github.sha || inputs.candidate_sha")],
  ['all deployment candidates must match the official branch head', workflow.includes("branch: 'preproduction/staffportal'") && workflow.includes('if (head !== sha)') && workflow.includes('Skipping unapproved Pre-Production deploy')],
  ['production safety gates remain closed', workflow.includes('productionDeployAuthorized') && workflow.includes('productionMigrationAuthorized')],
  ['post-deploy health verification remains present', workflow.includes('Verify Pre-Production health')],
  ['runtime verification remains present', workflow.includes('Verify Pre-Production runtime and auth route contract')],
  ['public asset API verification remains present', workflow.includes('Verify deployed public asset contract') && workflow.includes('test-staffportal-staging-public-assets.mjs')],
  ['asset integrity verification remains present', workflow.includes('Verify versioned Pre-Production asset integrity')],
  ['controller CI targets official Pre-Production source', controller.includes('ref: preproduction/staffportal')],
];

for (const [name, pass] of checks) {
  assert.ok(pass, name);
  console.log('PASS ' + name);
}
console.log('Pre-Production governance checks passed: ' + checks.length + '/' + checks.length + '.');
