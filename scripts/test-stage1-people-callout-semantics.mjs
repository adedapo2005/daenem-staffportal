import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { stage1WorkspaceCalloutOverlay } from './lib/stage1-workspace-callout-overlay.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/workspaces.tsx');
const wrapper = path.join(root, 'src/stage1-safe-workspace-callout.tsx');
const workspace = fs.readFileSync(target, 'utf8');
const source = fs.readFileSync(wrapper, 'utf8');
const overlay = stage1WorkspaceCalloutOverlay();

assert.equal(overlay.name, 'daenem-stage1-workspace-callout-semantic-overlay');
assert.equal(overlay.resolveId('./ui', target), wrapper);
assert.equal(overlay.resolveId('./ui', path.join(root, 'src/employee-center.tsx')), null);
assert.match(workspace, /<Callout tone="neutral" title="People directory unavailable"><p>\{current\.message\}<\/p><\/Callout>/);
assert.match(source, /isText \? <p>\{children\}<\/p> : children/);
const parsed = ts.createSourceFile('stage1-safe-workspace-callout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(parsed.parseDiagnostics.length, 0, 'Stage One wrapper TSX must parse');
assert.equal(source.includes('backdrop-filter'), false);
console.log('STAGE1_PEOPLE_CALLOUT_SOURCE_CONTRACT=PASS');
