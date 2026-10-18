import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const css = read("app/experience/navigation-v24.css");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

const topbarEnd = portal.indexOf("</header>", portal.indexOf('<header className="p-topbar">'));
const workspaceContext = portal.indexOf('className="p-shell-workspace-context"');
const previewStrip = portal.indexOf('className="p-demo-strip"', workspaceContext);

check("Command bar and breadcrumb are separate shell regions", portal.includes('className="p-topbar-leading"') && !/<header className="p-topbar">[\s\S]*?className="p-breadcrumb"/.test(portal));
check("Workspace context follows the command bar", topbarEnd > 0 && workspaceContext > topbarEnd);
check("Workspace context precedes preview and page content", workspaceContext > 0 && previewStrip > workspaceContext);
check("Breadcrumb has an explicit navigation label", portal.includes('<nav className="p-shell-breadcrumb" aria-label="Breadcrumb">'));
check("Current breadcrumb segment is exposed accessibly", portal.includes('<strong aria-current="page">{item.label}</strong>'));
check("Workspace heading labels the main region", portal.includes('<h1 id="workspace-title">{workspaceTitle}</h1>') && portal.includes('aria-labelledby="workspace-title"'));
check("Denied and unknown surfaces receive neutral shell context", portal.includes('const breadcrumbItems: Array<') && portal.includes('? [{ label: "Workspace" }]'));
check("Denied surfaces do not receive requested module titles", portal.includes('const workspaceTitle = !workspaceAuthorized') && portal.includes('? "Workspace"'));
check("Denied surfaces use a non-revealing description", portal.includes('? "This destination is unavailable."'));
check("Workspace authorization matches the rendered access boundary", portal.includes("surfaceAccess &&") && portal.includes('mode !== "Permission Denied"') && portal.includes("(!recordId || selected)"));
check("Company scope comes from the normalized active session company", portal.includes("company.id === session.company") && portal.includes('{activeCompany?.name || "Assigned workspace"}'));
check("Only an authorized module may supply workspace metadata", portal.includes("const authorizedModule = m && canView(m, session) ? m : undefined") && portal.includes('authorizedModule?.purpose || "Authorized workspace"'));
check("Record breadcrumb and title require an authorized selected record", portal.includes("...(recordId && selected ? [{ label: selected.title }] : [])") && portal.includes(": selected\n      ? selected.title"));
check("Studio breadcrumb requires section-level authorization", portal.includes(": isStudioPath && studioSectionAccess") && portal.includes("activeStudioItem.label"));
check("Primary actions retain capability checks", portal.includes('canAct(m, session, "create")') && portal.includes('canView(byId("layout"), session)'));
check("Denied surfaces cannot render workspace actions", portal.includes("const workspaceActions = workspaceAuthorized && m ?"));
check("Legacy duplicate page heading is removed from the render tree", !portal.includes('<div className="p-page-head">'));
check("Desktop header preserves bounded action density", css.includes(".p-workspace-header .p-head-actions") && css.includes("max-width: min(34rem, 45%)"));
check("Tablet keeps navigation access and reflows the header", css.includes("@media (max-width: 1024px)") && css.includes(".p-topbar-leading > .p-iconbtn { display: inline-flex; }") && css.includes("align-items: flex-start"));
check("Mobile reflows rather than compressing required controls", css.includes("@media (max-width: 767px)") && css.includes(".p-workspace-header { display: grid") && css.includes("max-width: 100%"));
check("Reduced Motion explicitly suppresses context transitions", css.includes(".p-shell-workspace-context,") && css.includes("animation: none !important; transition: none !important"));
check("Workspace scope styling is neutral blue rather than semantic green", css.includes("background: #eef4fc") && css.includes("color: #31577f"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
