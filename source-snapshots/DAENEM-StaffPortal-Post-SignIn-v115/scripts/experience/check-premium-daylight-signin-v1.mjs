import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const auth = read("app/experience/auth-v3.tsx");
const renderer = read("app/experience/unified-signin-renderer.tsx");
const home = read("app/experience/webflow-home-signin.tsx");
const css = read("app/experience/premium-daylight-signin-v1.css");
const deploymentPrune = read("scripts/prune-deployment-assets.mjs");
const layout = read("app/layout.tsx");
const deploymentMetadata = read("app/experience/deployment-metadata.ts");
const signInPreferences = read("app/experience/staffportal-import/signin-preferences.ts");
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check("Daylight visual layer follows the canonical Webflow renderer", home.includes('import "./premium-daylight-signin-v1.css"'));
check("Desktop and tablet front door remain viewport-bound", css.includes("height: 100dvh") && css.includes("overflow: hidden"));
check("Narrow desktop resets legacy two-row grid areas", css.includes('@media (min-width: 1181px) and (max-width: 1365px)') && css.includes('grid-template-areas: "weather hero auth"'));
check("Mobile can reflow and scroll", css.includes("@media (max-width: 767px)") && css.includes("overflow-y: visible"));
check("Bright platinum and white surfaces are the default", css.includes("linear-gradient(145deg, #edf3f7, #ffffff 50%, #eef5f6)"));
check("Semantic focus states remain visible", css.includes(":focus-visible") && css.includes("outline: 3px solid"));
check("Reduced Motion removes nonessential effects", css.includes("prefers-reduced-motion") && css.includes("animation: none !important"));
check("Install App is an interactive governed action", home.includes('className="install-pill" type="button" onClick={onInstall}') && renderer.includes("onInstall={onInstall}"));
check("Public access state is plain and does not claim production live status", home.includes("Staff Access") && !home.includes("QA Workspace") && !home.includes("LIVE ERP ACCESS"));
check("Weather fails truthfully closed without technical provider wording", home.includes("Local Time") && home.includes("Weather unavailable") && !home.includes("Provider Pending") && home.includes('value: "—"'));
check("WhatsApp Sign In is first class but unavailable until connected", auth.includes("Sign In with WhatsApp") && auth.includes("WhatsApp sign-in unavailable"));
check("WhatsApp Create Account is first class but unavailable until connected", auth.includes("Create Account with WhatsApp") && auth.includes("previously verified contact"));
check("No WhatsApp or external sign-in send is triggered from the client", !auth.includes("sendWhatsApp") && auth.includes("No external account connection, verification message"));
check("Remember Me defaults to unchecked", auth.includes("[remember, setRemember] = useState(false)"));
check("Terms and Privacy are keyboard-operable information notices", auth.includes('setModal("Terms")') && auth.includes('setModal("Privacy")') && auth.includes("No legal acceptance event or production account action is recorded"));
check("Password visibility control is an accessible non-submit action", auth.includes('aria-label={show ? "Hide Password" : "Show Password"}') && auth.includes('className="usp-password-toggle"') && auth.includes('type="button"') && auth.includes("onClick={() => setShow(!show)}"));
check("Authentication tabs use roving focus and keyboard navigation", auth.includes('role="tablist"') && auth.includes('aria-label="Authentication options"') && auth.includes('tabIndex={stage === "signin" ? 0 : -1}') && auth.includes('tabIndex={stage === "signup" ? 0 : -1}') && auth.includes('onKeyDown={handleAuthTabKeyDown}') && ["ArrowLeft", "ArrowRight", "Home", "End"].every((key) => auth.includes(`"${key}"`)));
check("Governed public actions are non-submit buttons", auth.includes('className="usp-whatsapp-button"') && auth.includes('setModal("WhatsApp")') && auth.includes('setModal("Terms")') && auth.includes('setModal("Privacy")') && home.includes('className="install-pill" type="button" onClick={onInstall}'));
check("QA authentication copy does not claim a live ERP workspace", !auth.includes("enter the live ERP workspace") && auth.includes("Access appears only after identity and role checks"));
check("Authentication status is truthful and uses plain language", !auth.includes("MFA READY") && !auth.includes("Secure service") && !auth.includes("Provider Status Pending") && !auth.includes("Federated access") && auth.includes("Other sign-in options unavailable") && renderer.includes("Other sign-in options unavailable") && signInPreferences.includes("Other sign-in options unavailable"));
check("Public sign-in headings use plain workplace language", auth.includes("SECURE STAFF ACCESS") && auth.includes("EXTRA VERIFICATION") && renderer.includes("SECURE STAFF ACCESS") && renderer.includes("EXTRA VERIFICATION") && signInPreferences.includes("SECURE STAFF ACCESS") && !auth.includes("SECURE ERP ACCESS") && !auth.includes("MFA POLICY"));
check("Public sign-in notices do not expose internal QA or provider terminology", !auth.includes("QA notice") && !auth.includes("Review-only QA notice") && !auth.includes("configured provider") && !home.includes("QA Workspace") && !home.includes("Provider Pending"));
check("Focused text actions meet the 24px minimum target", /\.usp-forgot-link\s*\{[^}]*min-height:\s*24px/s.test(css) && /\.usp-legal-actions button\s*\{[^}]*min-height:\s*24px/s.test(css));
check("Legacy photo showcase is absent from the rendered front door", !home.includes("showcaseCards") && !home.includes('className="showcase-row"'));
check("Legacy 4K showcase payload is excluded from deployment", deploymentPrune.includes("showcase-intelligence-4k.jpg") && deploymentPrune.includes("showcase-operations-4k.jpg"));
check("Public metadata does not disclose project or deployment identifiers", !layout.includes("appgprj_") && !layout.includes("appgdep_") && !deploymentMetadata.includes("appgprj_") && !deploymentMetadata.includes("appgdep_"));

console.log(JSON.stringify({ total: checks.length, passed: checks.filter((item) => item.pass).length, checks }, null, 2));
