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

const topbarStart = portal.indexOf('data-topbar-contract="global-shell-v2"');
const topbarEnd = portal.indexOf("</header>", topbarStart);
const topbar = portal.slice(topbarStart, topbarEnd);
const drawerStart = portal.indexOf('<SheetTitle>{drawerTitle}</SheetTitle>');
const drawerEnd = portal.indexOf("</SheetContent>", drawerStart);
const drawer = portal.slice(drawerStart, drawerEnd);

check("Five utility drawer states are explicit", portal.includes('"help" | "actions" | "profile" | "version" | "weather" | null'));
check("Global utility visibility is permission composed", portal.includes('const globalUtilityAccess = canView(byId("help"), session)') && portal.includes("const canUseGlobalUtility = globalUtilityAccess"));
check("Weather chip is explicitly provider-required and exports its active unit", topbar.includes('data-provider-state="required"') && topbar.includes("data-weather-unit={weatherUnit}") && topbar.includes("—°{weatherUnit}"));
check("Weather falls back to the Fahrenheit organization default", portal.includes('const ORGANIZATION_WEATHER_UNIT = "F" as const') && portal.includes("weatherUnitOverride ?? ORGANIZATION_WEATHER_UNIT"));
check("Weather override is person scoped and device local", portal.includes('useDeviceState<') && portal.includes('`weather-unit-${session.personId}`') && portal.includes("setWeatherUnitOverride"));
check("Weather unit changes only by explicit action", drawer.includes('onClick={() => setWeatherUnitOverride("F")}') && drawer.includes('onClick={() => setWeatherUnitOverride("C")}'));
check("Weather can restore the organization default", drawer.includes("Use Organization Default") && drawer.includes("setWeatherUnitOverride(null)"));
check("Weather panel contains no fabricated observation", drawer.includes('data-weather-contract="provider-required"') && drawer.includes("No current observation") && drawer.includes("approved provider"));
check("Weather panel does not assert a location", !drawer.includes("Ibadan") && !drawer.includes("Daenem Complex"));
check("Release badge exports its saved release value", topbar.includes('data-version-state="saved"') && topbar.includes("data-saved-version={CURRENT_SAVED_SITE_VERSION}") && topbar.includes("Open Release Details"));
check("Release details use clear staff-facing language", drawer.includes('data-version-history-contract="plain-language-release-details"') && drawer.includes("Current Staff Portal Release") && drawer.includes("Detailed release notes are not available yet."));
check("Version surface does not import deployment internals", !portal.includes('from "./deployment-metadata"'));
check("Utility drawers restore focus to their opening control", portal.includes("const drawerRestoreRef = useRef<HTMLElement | null>(null)") && portal.includes("const openDrawer = useCallback") && portal.includes("restoreDrawerFocus();"));
check("Notification content begins with authorized attention rows", portal.includes("const noticeRows = attentionRecords(records, session)"));
check("Notification pulse requires authoritative freshness and authorized unacknowledged rows", portal.includes("hasAuthoritativeNotificationFreshness &&") && portal.includes("noticeRows.length > 0") && portal.includes("!notificationAcknowledged"));
check("Opening notifications acknowledges the pulse", topbar.includes("setNotificationAcknowledged(true)") && topbar.includes('openDrawer("actions")'));
check("Scope changes clear notification acknowledgement", portal.slice(portal.indexOf("function changeSession"), portal.indexOf("function open(")).includes("setNotificationAcknowledged(false)"));
check("Notification panel renders only authorized rows", drawer.includes("{noticeRows.map((r) => (") && drawer.includes("No authorized actions need attention"));
check("Help routes privileged support options independently", drawer.includes('canView(byId("support"), session)') && drawer.includes('canView(byId("resources"), session)'));
check("Unsupported documentation and FAQs remain neutral", drawer.includes("Authoritative support content is not connected") && drawer.includes("Authoritative answers are not connected") && drawer.includes("Unavailable"));
check("Profile opens a session-aware menu", topbar.includes('onClick={() => openDrawer("profile")}') && drawer.includes("Profile options"));
check("Profile destinations remain individually permission gated", drawer.includes("My Preferences") && drawer.includes("Appearance") && drawer.includes("Accessibility") && drawer.includes('canView(byId("layout"), session)') && drawer.includes('canView(byId("theme"), session)') && drawer.includes('canView(byId("security"), session)'));
check("Company switching uses only authorized options", drawer.includes("authorizedCompanyOptions.length > 1") && drawer.includes("authorizedCompanyOptions.map"));
check("Profile keeps an explicit sign-out path", drawer.includes("setPendingSignout(true)") && drawer.includes("Sign Out"));
check("New-notification animation is bounded", css.includes("p-authorized-notification-pulse 1.7s ease-out 2"));
check("Active controls remain blue rather than semantic green", css.includes("background: #edf2ff") && css.includes("color: #274ea8"));
check("Utility widgets compact before clipping", css.includes("@media (max-width: 1280px)") && css.includes("@media (max-width: 767px)") && css.includes("@media (max-width: 430px)"));
check("Reduced Motion removes widget animation", css.includes(".p-notification-control::after { animation: none !important; transition: none !important; }"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
