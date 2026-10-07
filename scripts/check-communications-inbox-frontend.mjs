import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/communications-inbox-entry.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/communications-inbox.css', import.meta.url), 'utf8');
const hub = await readFile(new URL('../src/module-hub.tsx', import.meta.url), 'utf8');

assert.match(ui, /canViewInboxCompany[\s\S]*communications\.support\.inbox\.view/);
assert.match(ui, /cleanCompanies[\s\S]*canViewInboxCompany/);
assert.match(ui, /waInbox/);
assert.match(ui, /waConversation/);
assert.match(ui, /waCompany/);
assert.match(ui, /window\.history\.pushState/);
assert.match(ui, /window\.history\.replaceState/);
assert.match(ui, /window\.addEventListener\('popstate'/);
assert.match(ui, /listScrollRef/);
assert.match(ui, /pendingScrollRef/);
assert.match(ui, /matchMedia\('\(max-width:760px\)'\)/);
assert.match(ui, /Back to conversation list/);
assert.match(ui, /data-conversation-id/);
assert.match(ui, /Live WhatsApp Sending Off/);
assert.doesNotMatch(ui, /Provider send release-gated/);
assert.doesNotMatch(ui, /Meta System User token is missing/);
assert.doesNotMatch(ui, /provider release gate/);
assert.doesNotMatch(css, /font-size:(?:[0-8](?:\.\d+)?)px/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /\.wa-layout:has\(\.wa-thread-header\) \.wa-conversation-list\{display:none\}/);
assert.match(hub, /waConversation/);
assert.match(hub, /isModuleVisible\(context, module, routeCompany\.id, routeCompany\.code\)/);
assert.match(hub, /deepLinkLaunchRef/);
assert.match(hub, /void launch\(module\)/);

console.log('Communications Inbox frontend closure: PASS');
