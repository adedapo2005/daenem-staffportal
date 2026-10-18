import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const version = read("app/experience/site-version.ts");
const metadata = read("app/experience/deployment-metadata.ts");
const flagship = read("app/experience/signin-flagship.tsx");
const widgets = read("app/experience/signin-widget-registry.tsx");
const defaultSignIn = read("app/experience/webflow-home-signin.tsx");
const defaultSignInCss = read("app/experience/premium-daylight-signin-v1.css");
const communications = read("app/experience/communications-settings.tsx");

const checks = [
  ["one source-owned release value", /CURRENT_SAVED_SITE_VERSION = "V\d+"/.test(version) && (version.match(/"V\d+"/g) || []).length === 1],
  ["public release metadata uses the shared release source", metadata.includes('import { CURRENT_SAVED_SITE_VERSION } from "./site-version"') && metadata.includes("releaseLabel: CURRENT_SAVED_SITE_VERSION")],
  ["stale publication number and timestamp are absent", !metadata.includes("publishedVersion") && !metadata.includes("builtAt") && !metadata.includes("Last Published")],
  ["public sign-in release label is plain language", metadata.includes("Staff Portal Release ${publishedBuildMetadata.releaseLabel}")],
  ["sign-in footer does not expose deployment metadata", flagship.includes('title="Current Staff Portal release"') && !flagship.includes("publishedBuildMetadata.builtAt")],
  ["default sign-in footer renders the shared release label", defaultSignIn.includes('import { publishedLabel } from "./deployment-metadata"') && defaultSignIn.includes("<span>{publishedLabel()}</span>")],
  ["Daylight desktop grid keeps the release footer inside the viewport", /\.erp-shell\.is-day\s*\{[^}]*display:\s*grid;[^}]*height:\s*100dvh;/.test(defaultSignInCss) && /grid-template-rows:\s*64px minmax\(0, 1fr\) 22px;/.test(defaultSignInCss)],
  ["optional public widgets use the same release label", widgets.includes('title={publishedLabel()}') && !widgets.includes("Published v") && !widgets.includes("DEPLOYMENT FRESHNESS")],
  ["communications policy mark is not a competing release number", communications.includes("<span>Policy</span>") && !communications.includes("<span>V44</span>")],
];

for (const [name, passed] of checks) assert.ok(passed, name);
console.log(`Release label unification: ${checks.length}/${checks.length} PASS`);
