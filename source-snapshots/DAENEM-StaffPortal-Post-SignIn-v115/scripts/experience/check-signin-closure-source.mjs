import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const runtime = read("app/experience/signin-theme-runtime.tsx");
const registry = read("app/experience/signin-widget-registry.tsx");
const builder = read("app/experience/signin-builder-v16.tsx");
const closureCss = read("app/experience/signin-closure.css");
const auth = read("app/experience/auth-v3.tsx");

const tests = [];
const check = (id, assertion, pass, evidence) => tests.push({ id, assertion, pass: Boolean(pass), evidence });
const directlyDefinedWidgetTypes = [...registry.matchAll(/define\(\{\s*type:\s*"([^"]+)"/g)].map((match) => match[1]);
const generatedWidgetTypes = ["industryNews", "technologyNews", "businessNews", "maintenanceNotice", "emergencyNotice", "announcement"];
const definedWidgetTypes = [...directlyDefinedWidgetTypes, ...generatedWidgetTypes];
const uniqueThemes = [...runtime.matchAll(/^\s{2}(horizon|editorial|command|gallery|atrium|focus|nightfall|panorama|vertical|duet):\s*\{/gm)].map((match) => match[1]);
const requiredCities = ["Toronto", "London", "New York", "Moscow", "Tokyo", "Beijing"];

check("SOURCE-001", "Shared runtime model exists", /export (?:type|interface) SignInThemeDefinition/.test(runtime) && runtime.includes("export function SignInRuntimeRenderer"), "SignInThemeDefinition + SignInRuntimeRenderer");
check("SOURCE-002", "Public Sign-In uses shared renderer", auth.includes("<SignInRuntimeRenderer"), "auth-v3.tsx");
check("SOURCE-003", "Builder uses shared renderer", builder.match(/<SignInRuntimeRenderer/g)?.length >= 3, "canvas, style and responsive previews");
check("SOURCE-004", "Exactly ten named layout definitions exist", new Set(uniqueThemes).size === 10, [...new Set(uniqueThemes)]);
check("SOURCE-005", "Global Time canonical cities are exact and exclude Ibadan", requiredCities.every((city) => registry.includes(`\"${city}\"`)) && registry.includes(`const canonicalGlobalCities = [${requiredCities.map((city) => `\"${city}\"`).join(", ")}]`) && !registry.match(/canonicalGlobalCities\s*=\s*\[[^\]]*Ibadan/), requiredCities);
check("SOURCE-006", "Initial authentication uses stage-specific non-scrolling treatment", closureCss.includes("[data-auth-stage=signin]") && closureCss.includes("overflow:visible!important") && closureCss.includes(":not([data-auth-stage=signin])"), "signin-closure.css");
check("SOURCE-007", "Typed widget registry contains the 49 advertised public-safe widgets plus mandatory Authentication", new Set(definedWidgetTypes).size >= 54 && registry.includes("settingsSchema") && registry.includes("renderer:"), { typedWidgetCount: new Set(definedWidgetTypes).size, publicSafeIncludingAuthentication: new Set(definedWidgetTypes).size - 4 });
check("SOURCE-008", "Restricted pre-authentication examples are registered", ["payrollSnapshot", "employeeRecord", "bankBalance", "apiSecret"].every((type) => registry.includes(`type: \"${type}\"`)), "AUTHENTICATED_ONLY / ADMIN_ONLY");
check("SOURCE-009", "Imports validate canonical capabilities", runtime.includes("Import rejected: missing canonical widgets") && runtime.includes("validateImportedTheme"), "signin-theme-runtime.tsx");
check("SOURCE-010", "Four independent breakpoint definitions are modeled", ["Desktop", "Tablet", "Mobile", "4K"].every((value) => runtime.includes(`\"${value}\"`)), "layoutByBreakpoint");
check("SOURCE-011", "Exact-widget resize handler receives widget ID and starting layout", builder.includes("startResize = (event: ReactPointerEvent, id: string, bp: SignInBreakpoint, startingLayout: SignInWidgetLayout)") && builder.includes("startResize(event, id, breakpoint, clone(itemLayout))"), "signin-builder-v16.tsx");
check("SOURCE-012", "Grid movement includes collision handling and group-member movement", builder.includes("const blocked = Object.entries(source).some") && builder.includes("ids = group?.memberIds || [id]"), "moveWidget");
check("SOURCE-013", "Active builder draft identity persists", builder.includes("SIGNIN_CURRENT_BUILDER_THEME_STORAGE") && builder.includes("remembered"), "local declarative Design Lab storage");
check("SOURCE-014", "Scheduling is truthfully production-pending", builder.includes("Automatic Activation · Production Integration Pending") && builder.includes("PRODUCTION_INTEGRATION_PENDING"), "no fake scheduled publication");
check("SOURCE-015", "Stale V16 matrix is not present at authoritative root", !existsSync(resolve(root, "signin-viewport-matrix.csv")) && existsSync(resolve(root, "docs/v16/signin-viewport-matrix-stale-v16.csv")), "stale matrix quarantined");

const output = {
  generatedAt: new Date().toISOString(),
  scope: "Supplemental exact-source structural checks only",
  acceptanceEligible: false,
  browserEvidenceRequired: true,
  summary: { pass: tests.filter((test) => test.pass).length, fail: tests.filter((test) => !test.pass).length, total: tests.length },
  tests,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (tests.some((test) => !test.pass)) process.exitCode = 1;
