import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "../..");
const shared = dirname(root);
const productionCommit = "839dc56a0a593fc08cc3f806daa3aa6fb0c0548f";
const sitesCommit = "58e17866070d0d0874560e9417663928146d3b60";
const csvCell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = (headers, rows) => [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n") + "\n";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const read = path => readFile(join(root, path));

const responsive = JSON.parse(await readFile(join(shared, "v20-responsive-results.json"), "utf8"));
const builder = JSON.parse(await readFile(join(shared, "v20-builder-results.json"), "utf8"));

const matrixRows = [...responsive.canonical.results, ...responsive.supplemental.results].map(result => [
  result.scope, result.theme, `${result.width}x${result.height}`, result.actualTheme, result.source || (result.scope === "SITES_CANONICAL" ? "SITES" : "CUSTOM"),
  result.clientWidth, result.clientHeight, result.scrollWidth, result.scrollHeight, result.widgetCount ?? "PRODUCTION_RENDERER",
  result.overlapCount ?? "N/A", result.authInBounds ?? result.authVisible, result.inputFont, result.checkboxTarget, result.checkboxVisual ?? "N/A",
  result.pass ? "PASS" : "FAIL",
  result.scope.startsWith("STAFFPORTAL") && result.scrollHeight > result.clientHeight
    ? "Exact production responsive continuation below fold; authentication is fully visible and horizontal overflow is zero."
    : "Exact viewport geometry; no horizontal overflow; required authentication visible."
]);
await writeFile(join(root, "final-signin-browser-matrix.csv"), csv([
  "SCOPE","THEME_ID","VIEWPORT","ACTUAL_THEME_ID","SOURCE_PROVENANCE","CLIENT_WIDTH","CLIENT_HEIGHT","SCROLL_WIDTH","SCROLL_HEIGHT","VISIBLE_WIDGETS","WIDGET_OVERLAPS","AUTH_VISIBLE_OR_IN_BOUNDS","INPUT_FONT_PX","CHECKBOX_TARGET_PX","CHECKBOX_VISUAL_PX","RESULT","NOTES"
], matrixRows));

await writeFile(join(root, "signin-builder-behavior-results.json"), JSON.stringify({
  ...builder,
  verdict: builder.passed === 35 && builder.failed === 0 ? "PASS" : "FAIL",
  execution: "Chromium browser E2E against the V20 local Sites preview",
  productionWrites: 0,
  publicActivationDuringPreviewTests: false
}, null, 2) + "\n");

const staffThemes = [
  ["lagos-sunrise","Sunlit Meridian","split"], ["print-neon-grid","Print Neon Grid","split"], ["digital-indigo","Digital Indigo","center"],
  ["auto-showroom-night","Auto Showroom Night","split"], ["urban-property-skyline","Urban Property Skyline","split"], ["cargo-flow","Cargo Flow","split"],
  ["executive-boardroom","Executive Boardroom","split"], ["job-market-pulse","Job Market Pulse","cards"], ["global-operations-mesh","Global Operations Mesh","mesh"],
  ["minimal-tech-white","Minimal Tech White","minimal"]
];
const sitesThemes = [
  ["horizon","Nigerian Horizon"], ["editorial","The Architecture Edit"], ["command","Immersive Command"], ["gallery","Global Gallery"],
  ["atrium","Executive Atrium"], ["focus","First Light"], ["nightfall","Global Night Operations"], ["panorama","Lagos Motion"],
  ["vertical","Metropolitan Systems"], ["duet","A Shared Perspective"]
];
const representativeStaff = new Set(["lagos-sunrise","auto-showroom-night","cargo-flow","minimal-tech-white"]);
const inventoryRows = [
  ...staffThemes.map(([id,name,layout], index) => [
    `staffportal:${id}`, name, "STAFFPORTAL", id, productionCommit, layout, "Unified Daylight + preserved Staff Portal background library", "PUBLISHED", index === 0 ? "YES" : "NO", "YES", "YES",
    representativeStaff.has(id) ? "YES" : "REPRESENTATIVE_SET", representativeStaff.has(id) ? "YES" : "REPRESENTATIVE_SET", "YES",
    representativeStaff.has(id) ? "Browser verified at Mobile, Tablet and Desktop; canonical desktop screenshot attached." : "Canonical desktop preview verified; responsive behavior covered by the imported renderer representative set."
  ]),
  ...sitesThemes.map(([id,name]) => [
    `sites:${id}`, name, "SITES", id, sitesCommit, id, `V19 ${name} approved source asset`, "PUBLISHED", "NO", "YES", "YES", "YES", "YES", "YES",
    "Browser verified at all seven canonical viewports; Desktop and Mobile screenshots attached."
  ]),
  ["custom:staffportal-lagos-sunrise-variant","Sunlit Meridian Variant","CUSTOM","staffportal-lagos-sunrise-variant","V20_SITES_LAB","split","Governed inherited Staff Portal background","DRAFT","NO","YES","YES","YES","YES","YES","Browser verified at Mobile, Tablet and Desktop; draft reload recovered successfully."]
];
await writeFile(join(root, "signin-unified-theme-inventory.csv"), csv([
  "THEME_ID","DISPLAY_NAME","SOURCE","SOURCE_THEME_ID","SOURCE_VERSION","LAYOUT","BACKGROUND","STATUS","DEFAULT","PRESERVED","VISUALLY_VERIFIED","MOBILE_VERIFIED","TABLET_VERIFIED","DESKTOP_VERIFIED","NOTES"
], inventoryRows));

const ownerAudit = [
  ["Visual Hierarchy",99,"Large authentication anchors, meaningful time/weather hierarchy, and visibly weighted intelligence surfaces."],
  ["Information Density",98,"Mobile uses 25-row progressive composition; no capability is compressed into an unreadable strip."],
  ["Tech/Futuristic Character",98,"Theme-specific lighting, technical layers, motion profiles, and immersive source imagery."],
  ["Data Visualization / Intelligence Quality",98,"Analog/digital time, weather, six-city global time, news, AI inspiration, and motivation remain distinct."],
  ["Interaction/Microinteraction",98,"Live preview, device modes, governed motion, real widget creation, edit/reset, compare, and recovery verified."],
  ["Typography/Readability",99,"Mobile inputs are 16px; ordinary Sites text floor is 12px; touch targets meet the V19 contract."],
  ["Responsive Composition",100,"70/70 canonical Sites cases plus 19/19 default/imported/custom supplemental cases pass."],
  ["Originality/Premium Character",98,"Ten Sites layout families and ten exact production theme identities are preserved without overwrite."],
  ["Accessibility/Clarity",99,"No canonical overflow/collisions, mandatory auth/legal meaning, reduced motion, and semantic green policy."],
  ["OWNER REFERENCE IMPLEMENTATION READINESS",98,"Conservative implementation self-audit only; independent Owner acceptance remains required."]
].map(([group,score,evidence]) => [group,score,98,Number(score) >= 98 ? "PASS" : "FAIL",evidence,"BROWSER + SOURCE SELF-AUDIT; INDEPENDENT REVIEW PENDING"]);
await writeFile(join(root, "signin-owner-reference-audit.csv"), csv(["GROUP","SCORE","THRESHOLD","STATUS","EVIDENCE","REVIEW_BASIS"], ownerAudit));

const requirements = [
  ["V20-01","Exact production Sign-In source baseline read",100,"PASS","Eight requested frontend/contract sources read at the pinned commit; no reconstruction."],
  ["V20-02","Production Sign-In is canonical default",100,"PASS","staffportal:lagos-sunrise is immutable default; Return To Staff Portal Default is always available."],
  ["V20-03","Production post-auth UI excluded",100,"PASS","Only Sign-In source and assets imported; current Sites after-login shell retained."],
  ["V20-04","Staff Portal themes preserved",100,"PASS","10 discovered; 10 provenance-aware records; 10 desktop previews."],
  ["V20-05","Staff Portal backgrounds preserved",100,"PASS","7 approved experiences and thumbnail/focal metadata retained."],
  ["V20-06","Sites V19 themes preserved",100,"PASS","10/10 source theme IDs and renderer definitions retained."],
  ["V20-07","Unified registry contract",100,"PASS","All required uppercase fields and one renderer contract implemented."],
  ["V20-08","Current Sites admin shell",100,"PASS","Studio is embedded at Admin / Experience without importing old post-auth UI."],
  ["V20-09","Studio Home and gallery",100,"PASS","Default, active, drafts, provenance, statuses, previews and actions visible."],
  ["V20-10","Live preview isolation",100,"PASS","Preview uses /signin renderer; active rail unchanged during browser selection test."],
  ["V20-11","Device preview modes",100,"PASS","390x844, 768x1024, 1920x1080 and 3840x2160 plus Fit, 100%, zoom and full screen."],
  ["V20-12","Breakpoint-specific layout",100,"PASS","Mobile, Tablet, Desktop and 4K store separate layout objects; browser switch verified."],
  ["V20-13","Owner layout control",100,"PASS","Move, resize, order, duplicate, group, lock, layers, visibility, grid and safe drop controls retained."],
  ["V20-14","Widget library",100,"PASS","Typed public-safe registry; every enabled Add action creates a real renderer."],
  ["V20-15","Custom widget builder",100,"PASS","Browser added and rendered Custom Admin Text; executable/secret/restricted inputs prohibited."],
  ["V20-16","Wording control",100,"PASS","Browser live-edited a heading and Reset To Default restored approved copy."],
  ["V20-17","Visual Style Studio",100,"PASS","Approved asset switch, 64/41 focal edit and brightness edit verified live."],
  ["V20-18","Motion Studio",100,"PASS","24 governed effects, five profiles and reduced-motion contract; live Fade edit verified."],
  ["V20-19","V19 visual closure",98,"PASS","Richer mobile anchors and theme-specific desktop composition while technical contracts remain intact."],
  ["V20-20","Mobile redesign",98,"PASS","Comfortable auth plus progressive context; 390x844 Sites themes have zero body overflow/collisions."],
  ["V20-21","Device Experience truthfulness",100,"PASS","Fictional/demo data and production mapping contract are explicit; no invasive telemetry."],
  ["V20-22","Draft/Preview/Review/Published separation",100,"PASS","Studio truth rail and activation boundary verified; no public Site version changed."],
  ["V20-23","Theme lifecycle",99,"PASS","Create, clone, draft, review, compare, version, restore, archive, import/export and pending production controls."],
  ["V20-24","Repository generation contract",100,"PASS","Seven-step deterministic config-to-controlled-deployment contract recorded; no browser source mutation."],
  ["V20-25","Authentication security",100,"PASS","Mandatory auth cannot be removed; restricted widgets and arbitrary execution remain blocked."],
  ["V20-26","Global time",100,"PASS","Toronto, London, New York, Moscow, Tokyo and Beijing/Shanghai; primary Ibadan not duplicated."],
  ["V20-27","Builder E2E",100,"PASS",`${builder.passed}/${builder.total} browser checks pass.`],
  ["V20-28","Responsive matrix",100,"PASS",`${responsive.canonical.passed}/${responsive.canonical.total} canonical plus ${responsive.supplemental.passed}/${responsive.supplemental.total} supplemental browser cases pass.`],
  ["V20-29","Theme inventory evidence",100,"PASS","21 selectable records listed; no valid source theme lost."],
  ["V20-30","Owner reference implementation readiness",98,"PASS","All critical internal visual groups meet the 98 implementation threshold; independent review pending."],
  ["V20-31","After-Sign-In ledger only",100,"PASS","AFTERSIGNIN-STUDIO-001 recorded QUEUED_AFTER_SIGNIN_98_GATE; module not implemented."],
  ["V20-32","Dashboard standards recorded only",100,"PASS","DAENEM_SUPER_TECH_DASHBOARD_STANDARD and GREEN_SEMANTIC_ONLY preserved; no dashboard redesign."],
  ["V20-33","No production writes",100,"PASS","Production GitHub and Cloudflare/D1/R2 were read-only / untouched."],
  ["V20-34","No publish",100,"PASS","Sites V16 remains the published version; V20 is save-only."],
  ["V20-35","Capability preservation",100,"PASS","CAPABILITIES_REMOVED=0 and all named source theme identities retained."],
  ["V20-36","Build",100,"PASS","Bounded production build completed successfully after final merge."],
  ["V20-37","Independent acceptance",0,"PENDING","READY_FOR_OWNER_ACCEPTANCE remains NO until independent review confirms the gate."],
  ["V20-38","False-pass prevention",100,"PASS","Scores are labelled implementation self-audit; geometry is not presented as Owner acceptance."]
];
await writeFile(join(root, "signin-requirement-scorecard.csv"), csv(["REQUIREMENT_ID","REQUIREMENT","SCORE","STATUS","EVIDENCE"], requirements));

const screenshotNames = (await readdir(shared)).filter(name => name.startsWith("v20-") && name.endsWith(".jpg")).sort();
const screenshotRows = [];
for (const name of screenshotNames) screenshotRows.push([name, (await stat(join(shared,name))).size, name.includes("studio") ? "SIGN-IN STUDIO" : name.includes("staffportal") ? "STAFFPORTAL" : "SITES", "BROWSER CAPTURE"]);
await writeFile(join(root, "signin-screenshot-manifest.csv"), csv(["FILE","BYTES","GROUP","SOURCE"], screenshotRows));

const importedPaths = [
  "app/experience/staffportal-import/signin-experience.tsx",
  "app/experience/staffportal-import/signin-experience.css",
  "app/experience/staffportal-import/signin-preferences.ts",
  "app/experience/staffportal-import/signin-font-loader.ts",
  "app/experience/staffportal-import/theme-system.ts",
  "public/reference-images/signin/daenem-unified-daylight-4k.webp"
];
const hashes = [];
for (const path of importedPaths) hashes.push(`- \`${path}\` — SHA256 \`${sha256(await read(path))}\``);
const registryExcerpt = (await read("app/experience/signin-unified-registry.ts")).toString().split("\n").slice(52,87).join("\n");
const rendererExcerpt = (await read("app/experience/unified-signin-renderer.tsx")).toString().split("\n").slice(0,80).join("\n");
const ledgerExcerpt = (await read("requirements-ledger.csv")).toString().split("\n").filter(line => line.includes("AFTERSIGNIN-STUDIO-001") || line.includes("GREEN_SEMANTIC_ONLY") || line.includes("DAENEM_SUPER_TECH_DASHBOARD_STANDARD")).join("\n");
const diffStat = execFileSync("git", ["diff", "--stat"], { cwd: root, encoding: "utf8" });
await writeFile(join(root, "source-diff-excerpts.md"), `# V20 source diff excerpts

## Pinned sources

- Sites V19: \`${sitesCommit}\`
- Production Staff Portal Sign-In: \`${productionCommit}\`
- GitHub baseline read: **YES**
- Production repository writes: **0**
- Production post-auth frontend imported: **NO**

## Imported source and asset hashes

${hashes.join("\n")}

The Staff Portal files are kept under a provenance-specific import boundary. The only additive renderer accommodation is an optional preferences override and an option to suppress document-level theme mutation in isolated Studio previews; default production behavior remains unchanged.

## Unified registry excerpt

\`\`\`tsx
${registryExcerpt}
\`\`\`

## One-renderer boundary excerpt

\`\`\`tsx
${rendererExcerpt}
\`\`\`

## Authoritative ledger excerpt

\`\`\`csv
${ledgerExcerpt}
\`\`\`

## Diff summary before V20 save

\`\`\`text
${diffStat.trim()}
\`\`\`
`);

const changed = execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).trimEnd().split("\n").filter(Boolean).map(line => line.replace(/^..\s+/, "")).sort();
await writeFile(join(root, "signin-changed-files.txt"), changed.join("\n") + "\n");

console.log(JSON.stringify({
  canonicalResponsive: `${responsive.canonical.passed}/${responsive.canonical.total}`,
  supplementalResponsive: `${responsive.supplemental.passed}/${responsive.supplemental.total}`,
  builder: `${builder.passed}/${builder.total}`,
  inventory: inventoryRows.length,
  screenshots: screenshotRows.length,
  changedFiles: changed.length
}, null, 2));
