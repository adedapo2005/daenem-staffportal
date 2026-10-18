import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const runtime = read("app/experience/signin-theme-runtime.tsx");
const auth = read("app/experience/auth-v3.tsx");
const builder = read("app/experience/signin-builder-v16.tsx");
const flagship = read("app/experience/signin-flagship.tsx");
const css = read("app/experience/signin-runtime-v17.css");
const changed = execFileSync("git", ["diff", "--name-only", "08486840586acc836dd3383e2fd08407a7b5a7b4"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim().split("\n").filter(Boolean);

const allowed = new Set([
  "app/experience/auth-v3.tsx",
  "app/experience/deployment-metadata.ts",
  "app/experience/signin-builder-v16.css",
  "app/experience/signin-builder-v16.tsx",
  "app/experience/signin-flagship.tsx",
  "app/experience/signin-runtime-v17.css",
  "app/experience/signin-theme-runtime.tsx",
]);
const checks = [
  ["V17-SCOPE-LOCK", changed.every((path) => allowed.has(path) || path.startsWith("docs/v17/") || path === "scripts/experience/check-v17.mjs"), `Changed source: ${changed.join(", ")}`],
  ["V17-SHARED-RUNTIME-PUBLIC", auth.includes("<SignInRuntimeRenderer theme={runtimeTheme}"), "Public Sign-In uses shared renderer."],
  ["V17-SHARED-RUNTIME-BUILDER", builder.match(/<SignInRuntimeRenderer/g)?.length >= 3, "Builder previews use shared renderer."],
  ["V17-THEME-DEFINITION", runtime.includes("export interface SignInThemeDefinition") && runtime.includes("layoutByBreakpoint"), "Declarative theme contract present."],
  ["V17-TEN-STRUCTURES", [...runtime.matchAll(/^\s{2}([a-z]+):\{/gm)].map((m) => m[1]).filter((id) => ["horizon","editorial","command","gallery","atrium","focus","nightfall","panorama","vertical","duet"].includes(id)).length === 10, "Ten named desktop structures."],
  ["V17-SIX-GLOBAL-CITIES", !flagship.slice(flagship.indexOf("export const primaryClocks"), flagship.indexOf("] as const", flagship.indexOf("export const primaryClocks"))).includes("Ibadan") && flagship.includes('data-global-time-city-count={primaryClocks.length}'), "Ibadan is separate; Global Time exposes measured count."],
  ["V17-TRUTHFUL-NEWS", flagship.includes("PROVIDER NOT CONNECTED") && flagship.includes("SOURCE UNAVAILABLE") && !flagship.includes("Reuters"), "No fabricated provider headlines."],
  ["V17-MOBILE-AUTH", css.includes("grid-template-columns:repeat(4") && css.includes("overflow:auto!important") && css.includes("font-size:16px!important"), "Purpose-built mobile grid and contained long-form auth."],
  ["V17-TYPOGRAPHY", css.includes("font-size:max(12px") && css.includes("min-height:46px!important"), "Runtime type and touch-target guards."],
  ["V17-PERSISTENCE", builder.includes("saveDraft(next)") && builder.includes("publishLocalTheme(theme)") && builder.includes("daenem-signin-drafts-v17-final"), "Full declarative draft/publication storage."],
  ["V17-DIRECT-MANIPULATION", builder.includes("draggable={!w.locked}") && builder.includes("onDrop=") && builder.includes("onPointerDown={startResize}"), "Drag/drop and pointer resize wired."],
  ["V17-KEYBOARD-ALTERNATIVES", ["Move Earlier","Move Later","Increase Width","Decrease Width","Increase Height","Decrease Height"].every((x) => builder.includes(x)), "Accessible manipulation actions."],
  ["V17-STYLE-RUNTIME", builder.includes("updateStyle") && runtime.includes("--s17-brightness") && runtime.includes("data-button-style"), "Style values reach runtime CSS variables."],
  ["V17-MOTION-RUNTIME", builder.includes("updateMotion") && runtime.includes("data-motion-weather") && css.includes("prefers-reduced-motion"), "Motion values reach runtime with reduced-motion override."],
  ["V17-LIFECYCLE", ["createTheme","clone","saveDraft","publishLocalTheme","scheduleTheme","exportTheme","importTheme","importPastedTheme","archive","rollback"].every((x) => builder.includes(x)), "Lifecycle handlers wired."],
  ["V17-SECURITY-ENVELOPE", runtime.includes('filter(w=>w.security==="PUBLIC_SAFE"') && runtime.includes("auth:{...(layout[bp]?.auth") && !builder.includes("eval("), "Public-only widgets and mandatory auth enforced."],
  ["V17-NO-NOOP-HANDLERS", !builder.includes("onChange={()=>{}}") && !builder.includes("onClick={()=>{}}"), "No empty event handlers."],
];
const output = { generatedAt: new Date().toISOString(), baselineCommit: "08486840586acc836dd3383e2fd08407a7b5a7b4", total: checks.length, passed: checks.filter(([,pass]) => pass).length, failed: checks.filter(([,pass]) => !pass).length, checks: checks.map(([id,pass,evidence]) => ({ id, pass, evidence })) };
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
