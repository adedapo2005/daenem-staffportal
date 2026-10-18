import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const portal = read("app/experience/Portal.tsx");
const navigation = read("app/experience/navigation-adapter.ts");
const storage = read("app/experience/cloud-storage-admin.tsx");
const css = read("app/experience/cloud-storage-admin.css");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Cloud Storage has the canonical Admin Platform route", navigation.includes('CLOUD_STORAGE_ROUTE = "/admin/platform/storage"') && portal.includes('parts[1] === "platform"') && portal.includes('parts[2] === "storage"'));
check("Cloud Storage authorization requires Admin manage authority", portal.includes("const cloudStorageAccess = globalShellAccess") && portal.includes('canAct(adminModule, session, "manage")'));
check("Cloud Storage direct routes fail closed", portal.includes("isCloudStoragePath") && portal.includes("? cloudStorageAccess"));
check("Cloud Storage navigation is composed before rendering", portal.includes('entry.id === "cloud-storage"') && portal.includes("? cloudStorageAccess"));
check("Role changes remove unauthorized storage routes", portal.includes("isCloudStoragePath &&") && portal.includes('canAct(byId("admin")!, nextSession, "manage")'));
check("Unauthorized breadcrumbs remain neutral", portal.includes('const breadcrumbItems: Array<') && portal.includes('!workspaceAuthorized') && portal.includes('? [{ label: "Workspace" }]'));
check("Authorized breadcrumbs include Platform and Cloud Storage", portal.includes('"Platform"') && portal.includes('"Cloud Storage & Backup"'));
check("Authorized search terms are permission gated", portal.includes("...(cloudStorageAccess") && portal.includes('"Microsoft OneDrive secondary backup"'));
check("Cloud Storage renders only inside its authorized surface", portal.includes("adminPlatformSurface ? (") && portal.includes("<CloudStorageAdmin"));
check("Cloudflare R2 remains primary operational storage", storage.includes("PRIMARY OPERATIONAL STORAGE") && storage.includes("Cloudflare R2") && storage.includes("operationally owned by R2"));
check("OneDrive is a required asynchronous secondary copy", storage.includes("SECONDARY BACKUP COPY") && storage.includes("Microsoft OneDrive") && storage.includes("Every accepted upload must ultimately receive a secondary copy"));
check("Runtime state is truthful and configuration-required", storage.includes("Runtime unverified") && storage.includes("CONFIGURATION REQUIRED") && storage.includes("Not connected"));
check("Destination and health remain unavailable", storage.includes("Not configured") && storage.includes("Sync health") && storage.includes("Unavailable"));
check("Pending retrying and failed counts are neutral", ["Pending", "Retrying", "Failed"].every((term) => storage.includes(term)) && storage.includes(">—</strong>") && !/>0<\/strong>/.test(storage));
check("Connection controls cover connect reconnect and disconnect", ["Connect Microsoft OneDrive", "Reconnect", "Disconnect"].every((term) => storage.includes(term)));
check("Connection controls remain disabled without backend contracts", (storage.match(/disabled aria-disabled="true"/g) || []).length >= 4);
check("Retry remains disabled without command and telemetry contracts", storage.includes("Retry failed copies") && storage.includes("Scoped retry command and failed-copy telemetry required"));
check("Retention and deletion states are explicit and neutral", storage.includes("Retention policy") && storage.includes("Deletion propagation") && storage.includes("No retention period, deletion delay or legal-hold behavior is inferred"));
check("Audit state is truthful and contains no fabricated metadata", storage.includes("No authoritative sync audit available") && storage.includes("No event actor, file name, destination, timestamp or retry detail is fabricated"));
check("Microsoft secrets are never requested", storage.includes("never asks for Microsoft passwords, MFA codes, access tokens, refresh tokens or client secrets") && !/type=["']password|localStorage|sessionStorage/i.test(storage));
check("No storage endpoint or browser mutation is invented", !/fetch\(|axios\.|useMutation|\/api\/|window\.(localStorage|sessionStorage)/i.test(storage));
check("Exact backend dependencies are recorded", ["Microsoft OAuth authorization", "Microsoft Graph drive", "Durable asynchronous job enqueue", "Idempotent OneDrive copy", "Retry, backoff and dead-letter", "Permission-scoped sync health", "Retention and deletion-policy persistence", "Immutable audit events", "grant-revocation"].every((term) => storage.includes(term)));
check("Responsive layout reflows before compression", css.includes("@media(max-width:1050px)") && css.includes("@media(max-width:620px)") && css.includes("grid-template-columns:1fr"));
check("Reduced Motion removes non-essential movement", css.includes("@media(prefers-reduced-motion:reduce)") && css.includes("animation:none!important"));
check("Active and unavailable styling stays blue-neutral", css.includes("#2766bd") && !/\bgreen\b/i.test(css));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
