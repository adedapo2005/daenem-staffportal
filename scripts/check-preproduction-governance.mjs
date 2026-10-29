import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-staffportal-staging.yml', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../.github/workflows/staffportal-release-controller-ci.yml', import.meta.url), 'utf8');

const checks = [
  ['Pre-Production workflow identity', workflow.includes('name: StaffPortal Pre-Production Deploy')],
  ['manual-only deployment trigger', /^on:\r?\n  workflow_dispatch:/m.test(workflow) && !/^  push:/m.test(workflow.split('permissions:')[0])],
  ['exact SHA and Owner approval ID required', workflow.includes('candidate_sha:') && workflow.includes('approval_comment_id:')],
  ['approval job has scoped issues write', workflow.includes('issues: write')],
  ['Owner dispatch only', workflow.includes("context.eventName !== 'workflow_dispatch'") && workflow.includes('context.actor?.toLowerCase() !== owner.toLowerCase()')],
  ['Issue #5 exact SHA Owner comment', workflow.includes('issues.getComment') && workflow.includes("'/issues/5'") && workflow.includes('approval.user?.login?.toLowerCase()') && workflow.includes('APPROVE STAFFPORTAL STAGING DEPLOY SHA')],
  ['official HEAD exact SHA check', workflow.includes("branch: 'preproduction/staffportal'") && workflow.includes('branch.data.commit.sha.toLowerCase() !== sha')],
  ['consumed approval before deploy', workflow.includes('github.paginate(github.rest.issues.listComments') && workflow.includes('issues.createComment') && workflow.includes('STAFFPORTAL STAGING APPROVAL CONSUMED SHA')],
  ['production gates retained', workflow.includes('productionDeployAuthorized') && workflow.includes('productionMigrationAuthorized')],
  ['staging health retained', workflow.includes('Verify Pre-Production health')],
  ['staging auth/runtime retained', workflow.includes('Verify Pre-Production runtime and auth route contract')],
  ['staging assets retained', workflow.includes('Verify versioned Pre-Production asset integrity')],
  ['controller CI uses official branch', controller.includes('ref: preproduction/staffportal')],
];
for (const [name, pass] of checks) {
  assert.ok(pass, name);
  console.log('PASS ' + name);
}
console.log('Pre-Production governance checks passed: ' + checks.length + '/' + checks.length + '.');
