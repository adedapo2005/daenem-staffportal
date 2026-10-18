import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const portal = read("app/experience/Portal.tsx");
const navigation = read("app/experience/navigation-adapter.ts");
const model = read("app/experience/model.ts");
const studios = read("app/experience/studios.tsx");
const review = read("app/review/viewports/page.tsx");
const css = read("app/experience/premium-shell-reset-v1.css");
const scenery = read("app/experience/scenery-v3.tsx");
const homes = read("app/experience/homes-v3.tsx");

const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) process.exitCode = 1;
};

check("Premium shell contract is the authenticated root", portal.includes('data-premium-shell-contract="premium-shell-reset-v1"'));
check("Persistent navigation contains no landscape promo", !portal.includes("<LandscapeAccent compact"));
check("Authenticated home contains no permanent stock-photo chrome", !scenery.includes("signInPresets") && !scenery.includes("v3-workspace-photo") && !scenery.includes("Photo credit") && !homes.includes("LandscapeAccent"));
check("Primary and contextual navigation share one chassis", css.includes(".premium-shell-reset .p-adaptive-navigation") && css.includes("border-right: 1px solid #28435a"));
check("Active navigation uses DAENEM teal and no semantic green", css.includes("--shell-teal: #21b7b0") && !/button\.active[^}]+green/i.test(css));
check("Daylight command surface is the default", css.includes("linear-gradient(90deg, #f7fafc, #ffffff 52%, #f4f7fa)") && css.includes(".premium-shell-reset:is(.theme-midnight,.theme-carbon,.theme-dark) .p-topbar"));
check("Owner Communications Control is permission-composed", navigation.includes('canonical("communication-settings", "Communications Control")'));
check("Communications Control has one authoritative navigation owner", (navigation.match(/canonical\("communication-settings"/g) || []).length === 1);
check("Owner Meta vault is a canonical permission-composed module", navigation.includes('canonical("meta-credential-vault", "Meta Credential Vault")') && model.includes("['meta-credential-vault', 'Meta Credential Vault'"));
check("Command search exposes governed Owner controls", portal.includes('heading="Governed Controls"') && portal.includes("Meta Credential Vault"));
check("Command controls are permission composed before render", portal.includes("const commandGovernedControls =") && portal.includes(".filter((item) => allowed.some((module) => module.id === item.moduleId))") && portal.includes("commandGovernedControls.map((item)"));
check("Meta vault exposes truthful Zero Disclosure status", studios.includes('data-provider-state="configuration-required"') && studios.includes('No Credential Material Is Available') && studios.includes('Production sends remain Owner-gated'));
check("Meta vault is addressable by the responsive review workbench", review.includes('"meta-vault": "/meta-credential-vault"'));
check("Reduced Motion disables premium shell transitions", css.includes("@media (prefers-reduced-motion: reduce)") && css.includes("transition: none !important"));
check("Tablet retains slim rail", css.includes("@media (min-width: 768px) and (max-width: 1024px)") && css.includes("width: 4.9rem !important"));
check("Mobile retains full-height shared navigation sheet", css.includes(".p-responsive-navigation-sheet") && css.includes(".p-mobile-bottom-nav"));

for (const result of checks) console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}`);
console.log(`Premium shell reset V1: ${checks.filter((item) => item.pass).length}/${checks.length} PASS`);
