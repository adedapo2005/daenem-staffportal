import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const compilerFile = process.argv[2];
const mainStaffPortalRoot = process.argv[3];
assert.ok(compilerFile && mainStaffPortalRoot,
  'Provide existing StaffPortal TypeScript compiler file and main StaffPortal root.');
const ts = createRequire(import.meta.url)(compilerFile);
const writerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configFile = join(writerRoot, 'tsconfig.json');
const read = ts.readConfigFile(configFile, ts.sys.readFile);
if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, writerRoot);
const options = { ...parsed.options, noEmit: true, incremental: false, composite: false,
  typeRoots: [join(mainStaffPortalRoot, 'node_modules', '@types'),
    join(mainStaffPortalRoot, 'node_modules')] };
const ownedSources = [
  'src/jobs-entry.tsx',
  'src/jobs-recruitment-workspace.tsx',
  'src/jobs-recruitment-actions.tsx',
  'src/jobs-recruitment-scheduler.tsx',
  'worker/recruitment.ts'
].map(name => join(writerRoot, name));
const host = ts.createCompilerHost(options);
host.resolveModuleNames = (names, containingFile) => names.map(name => {
  const own = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
  if (own) return own;
  // Read dependencies from the existing StaffPortal installation; never install or write packages.
  return ts.resolveModuleName(name,
    join(mainStaffPortalRoot, 'src', '__recruitment_type_resolution__.tsx'),
    options, host).resolvedModule;
});
const program = ts.createProgram({ rootNames: ownedSources, options, host });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
  .filter(d => d.category === ts.DiagnosticCategory.Error);
for (const diagnostic of diagnostics.slice(0, 60)) {
  const where = diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.fileName + ':' + (diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1)
    : '<compiler>';
  console.log(where, 'TS' + diagnostic.code,
    ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
}
console.log('RECRUITMENT OWNED TYPECHECK:', diagnostics.length
  ? 'FAILED (' + diagnostics.length + ' errors; first 60 shown)'
  : 'PASS (owned sources with read-only existing StaffPortal dependency resolution).');
console.log('Not a full StaffPortal project build, authenticated Worker, D1, or browser gate.');
if (diagnostics.length) process.exitCode = 1;
