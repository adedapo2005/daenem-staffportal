import fs from 'node:fs';

const reportPath = process.argv[2] || 'qa-artifacts/npm-audit.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const vulnerabilities = report.metadata?.vulnerabilities || {};
const high = Number(vulnerabilities.high || 0);
const critical = Number(vulnerabilities.critical || 0);
console.log(JSON.stringify({ productionRuntime: true, high, critical, total: Number(vulnerabilities.total || 0) }, null, 2));
if (high > 0 || critical > 0) {
  throw new Error(`Production dependency audit found ${high} high and ${critical} critical vulnerabilities.`);
}
