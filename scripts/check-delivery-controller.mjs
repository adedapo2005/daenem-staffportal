import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const state = readJson('delivery/current-state.json');
const requirements = readJson('delivery/requirements-index.json');

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

assert(state.project === 'DAENEM Staff Portal', 'Wrong project identity.');
assert(state.repository === 'adedapo2005/daenem-staffportal', 'Wrong repository identity.');
assert(state.branch === 'feature/staffportal-whatsapp-ai-communications-01', 'Unexpected controller branch.');
assert(state.farmsAccessAllowed === false, 'Farms access must remain prohibited.');
assert(state.productionReady === false, 'Controller must not predeclare production readiness.');
assert(state.productionDeployAuthorized === false, 'Production deployment must remain approval-gated.');
assert(state.productionMigrationAuthorized === false, 'Production migrations must remain approval-gated.');
assert(state.liveMetaAuthorized === false, 'Live Meta must remain approval-gated.');
assert(state.hardRules?.zeroDisclosure === true, 'Zero disclosure must remain enabled.');
assert(state.hardRules?.twelveHourTime === true, '12-hour time rule missing.');
assert(state.hardRules?.greenSemanticOnly === true, 'Green semantic-only rule missing.');
assert(state.hardRules?.reducedMotion === true, 'Reduced Motion rule missing.');
assert(Array.isArray(requirements.families) && requirements.families.length > 0, 'Requirements index is empty.');
const requiredFamilies = [
  'V44-CLOSURE',
  'SECURITY-ZERO-DISCLOSURE',
  'RELEASE-INTEGRITY',
  'MASTER-V3',
  'HOME',
  'SMART-INPUT',
  'ERP-COMPLETION',
  'COMMUNICATIONS-META',
  'PRODUCTION-ACTIVATION',
];

const ids = new Set(requirements.families.map((family) => family.id));
for (const id of requiredFamilies) {
  assert(ids.has(id), `Missing requirement family: ${id}`);
}

const production = requirements.families.find((family) => family.id === 'PRODUCTION-ACTIVATION');
assert(production?.status === 'PRODUCTION-GATED', 'Production activation must remain blocked pending Owner approval.');

if (errors.length) {
  console.error('Staff Portal delivery-controller validation FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Staff Portal delivery-controller validation PASS');
console.log(`Tracked requirement families: ${requirements.families.length}`);
