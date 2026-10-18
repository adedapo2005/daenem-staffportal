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

check("Mobile navigation declares the shared shell contract", portal.includes('data-mobile-navigation-contract="global-shell-v2"'));
check("Home is projected from authorized global areas", portal.includes('visibleGlobalItems.find((item) => item.id === "home")'));
check("My Work is projected from authorized global areas", portal.includes('visibleGlobalItems.find((item) => item.id === "my-work")'));
check("Mobile destinations use the same fail-closed resolver", portal.includes("destinationForGlobalItem(item)") && portal.includes("item.context.find((entry) => contextVisible(entry))"));
check("Mobile Search opens the existing Ask DAENEM command", portal.includes("openCommandPalette();") && portal.includes('<span>Search</span>'));
check("Mobile Notifications are independently permission composed", portal.includes('{canView(byId("notifications"), session) && (') && portal.includes('<span>Notifications</span>'));
check("Mobile notification access acknowledges only authorized notifications", portal.includes("setNotificationAcknowledged(true)") && portal.includes('openDrawer("actions")'));
check("More opens the responsive authorized navigation sheet", portal.includes('aria-controls="responsive-navigation-sheet"') && portal.includes("setMobile(true)"));
check("Responsive sheet identifies its authorized projection", portal.includes('data-navigation-source="authorized-global-projection"'));
check("Responsive sheet reuses the existing authorized navigation tree", /p-responsive-navigation-sheet[\s\S]{0,500}\{nav\}/.test(portal));
check("Mobile More sheet is full viewport height", css.includes("height: 100dvh !important") && css.includes("width: 100vw !important"));
check("Mobile does not compress the desktop sidebar", css.includes(".p-app > .p-sidebar") && css.includes("display: none !important"));
check("Mobile bottom navigation is fixed and safe-area aware", css.includes(".p-mobile-bottom-nav") && css.includes("env(safe-area-inset-bottom)"));
check("Required mobile labels wrap instead of clipping", css.includes(".p-mobile-bottom-nav button span") && css.includes("overflow-wrap: anywhere") && !/p-mobile-bottom-nav button span\s*\{[^}]*text-overflow:\s*ellipsis/.test(css));
check("Mobile active state is blue and not semantic green", css.includes("box-shadow: inset 0 2px #426fd0") && !/p-mobile-bottom-nav[^}]*green/i.test(css));
check("Tablet range keeps a slim persistent rail", css.includes("@media (min-width: 768px) and (max-width: 1024px)") && css.includes("width: 5.25rem !important"));
check("Tablet main workspace offsets for the persistent rail", css.includes("margin-left: 5.25rem !important"));
check("Tablet rail uses icons without compressing labels", css.includes(".p-app > .p-sidebar .p-global-nav button span { display: none; }") && css.includes("justify-content: center"));
check("Tablet context remains available through the responsive sheet", css.includes(".p-responsive-navigation-sheet .p-context-nav { display: block"));
check("Mobile module context remains available in the full-height sheet", portal.includes('aria-label={`${activeGlobal?.label || "Workspace"} contextual navigation`}') && css.includes(".p-responsive-navigation-sheet .p-context-nav"));
check("Responsive navigation closes through the canonical route function", portal.includes("setMobile(false);") && portal.includes("router.push(route)"));
check("Responsive navigation is protected from layout profile drift", portal.includes('data-navigation-contract="global-shell-v2"') && !portal.includes('nav-${prefs.navigation.toLowerCase()}'));
check("Reduced Motion removes responsive shell transitions", css.includes(".p-mobile-bottom-nav button,") && css.includes(".p-responsive-navigation-sheet { animation: none !important; transition: none !important; }"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
