"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  Accessibility, AlarmClock, BellRing, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ChevronRight, CircleHelp, Clock3, CloudSun, Contact, Download,
  ExternalLink, FileText, Globe2, Heart, Image as ImageIcon, Info, Languages,
  Link2, MapPin, Megaphone, MoonStar, Newspaper, Radio, Rocket, Scale, Search,
  ShieldCheck, Sparkles, Star, SunMedium, Timer, TriangleAlert, Users, Wrench,
} from "lucide-react";
import { signInPresets, imageRuntimeFallback } from "./auth-contract";
import { publishedLabel } from "./deployment-metadata";
import {
  GlobalTime, IbadanSignature, Inspiration, Motivation, PrecisionClock,
  PublicNews, PublishFreshness, WeatherContext,
} from "./signin-flagship";
import { formatTime12 } from "./time-standard";
import "./signin-widget-v21.css";

export type SignInSecurityClassification =
  | "SECURITY_MANDATORY"
  | "CANONICAL_THEME_REQUIRED"
  | "OPTIONAL_PUBLIC"
  | "AUTHENTICATED_ONLY"
  | "ADMIN_ONLY";

export type WidgetSettingKind = "text" | "textarea" | "number" | "boolean" | "select" | "url";

export interface WidgetSettingSchema {
  key: string;
  label: string;
  kind: WidgetSettingKind;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  safe?: "plain_text" | "safe_url" | "approved_asset";
}

export interface WidgetRegistryEntry {
  type: string;
  name: string;
  category: "TIME" | "WEATHER" | "INTELLIGENCE" | "SYSTEM" | "COMPANY" | "UTILITIES" | "CONTENT" | "SECURITY";
  variants: string[];
  security: SignInSecurityClassification;
  defaultSettings: Record<string, string | number | boolean>;
  settingsSchema: WidgetSettingSchema[];
  minimumSize: { w: number; h: number };
  recommendedSize: { w: number; h: number };
  responsiveBehavior: string;
  truthState: string;
  renderer: ComponentType<WidgetRendererProps>;
}

export interface WidgetRendererProps {
  id: string;
  now: Date;
  auth: ReactNode;
  search: ReactNode;
  settings: Record<string, string | number | boolean>;
  themeName: string;
}

type Icon = ComponentType<{ size?: number; "aria-hidden"?: boolean }>;

function PublicCard({ icon: IconView, eyebrow, title, copy, meta, children, className = "" }: {
  icon: Icon; eyebrow: string; title: string; copy?: string; meta?: string; children?: ReactNode; className?: string;
}) {
  return <section className={`s18-public-card sf-glass ${className}`} aria-label={eyebrow}>
    <header><span className="sf-label"><IconView size={16} aria-hidden />{eyebrow}</span>{meta && <span className="s18-truth">{meta}</span>}</header>
    <div className="s18-public-card-body"><strong>{title}</strong>{copy && <p>{copy}</p>}{children}</div>
  </section>;
}

function variantSlug(value: unknown) { return String(value || "default").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function AuthenticationWidget({ auth }: WidgetRendererProps) { return <>{auth}</>; }
function SearchWidget({ search }: WidgetRendererProps) { return <>{search}</>; }
function AnalogClockWidget({ now, settings }: WidgetRendererProps) {
  const zone = String(settings.timezone || "Africa/Lagos");
  return <PublicCard icon={Clock3} eyebrow="ANALOG CLOCK" title={String(settings.city || "Ibadan")} meta="LIVE LOCAL TIME"><PrecisionClock date={now} zone={zone} /></PublicCard>;
}
function DigitalClockWidget({ now, settings }: WidgetRendererProps) {
  const zone = String(settings.timezone || "Africa/Lagos");
  return <PublicCard icon={Clock3} eyebrow="DIGITAL CLOCK" title={formatTime12(now, zone, Boolean(settings.seconds))} copy={`${String(settings.city || "Ibadan")} · ${zone}`} meta="LIVE" />;
}
function DateWidget({ now, settings }: WidgetRendererProps) {
  const zone = String(settings.timezone || "Africa/Lagos");
  return <PublicCard icon={CalendarDays} eyebrow="FULL LOCAL DATE" title={now.toLocaleDateString("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric", year: "numeric" })} copy={zone} />;
}
function PrimaryLocationWidget({ now }: WidgetRendererProps) { return <IbadanSignature now={now} />; }
const globalClockCatalog: Record<string, { country: string; zone: string }> = {
  Toronto: { country: "Canada", zone: "America/Toronto" }, London: { country: "United Kingdom", zone: "Europe/London" },
  "New York": { country: "United States", zone: "America/New_York" }, Moscow: { country: "Russia", zone: "Europe/Moscow" },
  Tokyo: { country: "Japan", zone: "Asia/Tokyo" }, Beijing: { country: "China", zone: "Asia/Shanghai" }, Shanghai: { country: "China", zone: "Asia/Shanghai" },
};
const canonicalGlobalCities = ["Toronto", "London", "New York", "Moscow", "Tokyo", "Beijing"];
function WorldClockWidget({ now, settings }: WidgetRendererProps) {
  const requested = String(settings.cities || "").split(",").map(city => city.trim()).filter(city => canonicalGlobalCities.includes(city)), ordered = [...new Set([...requested, ...canonicalGlobalCities])].slice(0, 6), analog = settings.presentation !== "Digital";
  return <section className={`s18-world-clocks sf-glass is-${String(settings.density || "Compact").toLowerCase()}`} aria-label="Six-city global time" data-global-time-city-count="6" data-global-time-contains-ibadan="false"><header><span className="sf-label"><Globe2 size={16} />GLOBAL TIME</span><span className="s18-truth">LIVE CLOCKS</span></header><div className="s18-world-grid">{ordered.map(city => { const value = globalClockCatalog[city]; return <article key={city}>{analog && <PrecisionClock date={now} zone={value.zone} />}<span><b>{city}</b><strong>{formatTime12(now, value.zone, Boolean(settings.seconds))}</strong>{settings.showDate && <small>{now.toLocaleDateString("en-US", { timeZone: value.zone, month: "short", day: "numeric" })}</small>}{settings.timezoneAbbreviation && <small>{new Intl.DateTimeFormat("en-US", { timeZone: value.zone, timeZoneName: "short" }).formatToParts(now).find(part => part.type === "timeZoneName")?.value} · {value.country}</small>}</span></article>; })}</div></section>;
}
function WeatherWidget({ settings }: WidgetRendererProps): ReactNode {
  const fahrenheit = settings.unit !== "°C", temperature = fahrenheit ? 82 : 28, feels = fahrenheit ? 86 : 30;
  const details = [["Feels Like", `${feels}${fahrenheit ? "°F" : "°C"}`, settings.feelsLike], ["Humidity", "74%", settings.humidity], ["Rain", "30%", settings.rain], ["Wind", "6 mph", settings.wind], ["Pressure", "1012 hPa", settings.pressure], ["Sunrise", "6:35 AM", settings.sunrise], ["Sunset", "6:45 PM", settings.sunset]].filter(([, , visible]) => visible !== false);
  return <section className={`s18-weather sf-glass motion-${String(settings.animation || "Standard").toLowerCase()}`} aria-label="Current weather"><header><span className="sf-label"><CloudSun size={16} />CURRENT WEATHER</span><span className="s18-truth">{String(settings.providerState || "DEMO")}</span></header><div className="s18-weather-main"><span className="s18-weather-orbit"><SunMedium size={32} /><CloudSun size={44} /></span><span><strong>{temperature}{fahrenheit ? "°F" : "°C"}</strong><b>Partly Cloudy</b><small>{String(settings.primaryLocation || "Ibadan")}, Nigeria</small></span></div><div className="s18-weather-data">{details.map(([label, value]) => <span key={String(label)}><small>{String(label)}</small><b>{String(value)}</b></span>)}</div><p>Warm with passing clouds · Illustrative forecast; no live provider is connected.</p></section>;
}
function ForecastWidget({ settings }: WidgetRendererProps) {
  return <PublicCard icon={CloudSun} eyebrow="IBADAN FORECAST" title={String(settings.summary || "Warm with passing clouds")} copy="High 86°F · Low 75°F · Rain 30%" meta={String(settings.providerState || "DEMO")}><div className="s18-forecast-strip"><span>NOW <b>82°</b></span><span>2 PM <b>84°</b></span><span>5 PM <b>80°</b></span></div></PublicCard>;
}
function SunWidget(): ReactNode { return <PublicCard icon={SunMedium} eyebrow="SUNRISE / SUNSET" title="6:35 AM → 6:45 PM" copy="Ibadan · Illustrative solar fixture" meta="DEMO" />; }
function InspirationWidget({ settings }: WidgetRendererProps): ReactNode {
  const message = String(settings.manualOverride || settings.prompt || "Build trust through the quality of every decision.");
  return <PublicCard icon={Sparkles} eyebrow="AI INSPIRATION" title={message} copy={`${String(settings.category || "Quality")} · ${String(settings.cadence || "Daily")} cadence`} meta={String(settings.providerState || "ADMIN EDITORIAL")}><span className="s18-governance">Generate → Preview → Edit → Approve → Publish</span></PublicCard>;
}
function MotivationWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Heart} eyebrow="EMPLOYEE MOTIVATION" title={String(settings.title || "Make Quality Visible")} copy={String(settings.copy || "Check the detail. Close the loop. Leave the next person a clear handover.")} meta="ADMIN MANAGED" />; }
function NewsWidget({ settings }: WidgetRendererProps): ReactNode {
  const [rotation, setRotation] = useState(0), count = Math.max(1, Math.min(6, Number(settings.cards || 3))), all = [String(settings.category || "World"), "Industry", "Technology", "Business", "Africa", "Daenem Sectors"];
  useEffect(() => { if (!settings.rotation) return; const timer = window.setInterval(() => setRotation(value => (value + 1) % all.length), Math.max(3, Number(settings.rotationSpeed || 8)) * 1000); return () => window.clearInterval(timer); }, [settings.rotation, settings.rotationSpeed, all.length]);
  const categories = [...all.slice(rotation), ...all.slice(0, rotation)].slice(0, count);
  return <section className={`s18-news s19-intelligence sf-glass is-${String(settings.density || "Detailed").toLowerCase()}`} aria-label="World and industry intelligence">
    <header><span className="sf-label"><Newspaper size={16} /><span className="s19-news-title-full">WORLD &amp; INDUSTRY INTELLIGENCE</span><span className="s19-news-title-compact">INTELLIGENCE</span></span>{settings.sourceDisplay !== false && <span className="s18-truth">{String(settings.providerState || "PROVIDER NOT CONNECTED")}</span>}</header>
    <nav className="s19-news-channels" aria-label="Intelligence channels">{all.slice(0, 4).map((channel, index) => <button key={channel} type="button" aria-pressed={rotation === index} onClick={() => setRotation(index)}>{channel}</button>)}</nav>
    <div className="s18-news-grid">{categories.map((category, index) => <article key={`${category}-${index}`}>
      <div className={`s19-news-visual tone-${index % 3}`} aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><i /><i /><i /><b /></div>
      <div className="s19-news-copy"><span>{category.toUpperCase()}</span><b>{index === 0 ? String(settings.headline || "Monitoring awaits a verified provider") : `${category} intelligence is ready for an approved source`}</b><small>{String(settings.refreshState || "Unavailable")} · No fabricated headline or timestamp</small></div>
    </article>)}</div>{settings.rotation && <p>Editorial preview rotation active · {Number(settings.rotationSpeed || 8)} seconds</p>}
  </section>;
}

function NewsChannelWidget({ settings }: WidgetRendererProps) {
  const category = String(settings.category || "World");
  return <PublicCard icon={Newspaper} eyebrow={`${category.toUpperCase()} INTELLIGENCE`} title={String(settings.headline || `${category} monitoring is ready for a verified provider`)} copy="No live headline, source or timestamp is represented without a configured feed." meta={String(settings.providerState || "PROVIDER NOT CONNECTED")} />;
}

function SystemStatusWidget(): ReactNode {
  return <PublicCard icon={Radio} eyebrow="SYSTEM STATUS" title="Staff Portal Available" copy="Authentication · Local Design Lab" meta="OPERATIONAL"><div className="s18-status-dots"><span><i />Portal</span><span><i />Authentication</span></div></PublicCard>;
}
function AuthenticationStatusWidget(): ReactNode { return <PublicCard icon={ShieldCheck} eyebrow="AUTHENTICATION STATUS" title="Authentication Available" copy="Fictional preview · Assigned access remains required" meta="SAFE" />; }
function ServiceHealthWidget(): ReactNode { return <PublicCard icon={Radio} eyebrow="SERVICE HEALTH" title="Public Sign-In Services" copy="Portal and local authentication simulation available" meta="DESIGN LAB" />; }
function PortalVersionWidget(): ReactNode { return <PublicCard icon={Info} eyebrow="STAFF PORTAL RELEASE" title={publishedLabel()} copy="This is the Staff Portal release currently available to you." />; }
function FreshnessWidget(): ReactNode { return <PublicCard icon={Clock3} eyebrow="STAFF PORTAL RELEASE" title="Current Staff Portal Release"><PublishFreshness /></PublicCard>; }

function SelectWidget({ icon, eyebrow, label, options, value }: { icon: Icon; eyebrow: string; label: string; options: string[]; value?: string }) {
  return <PublicCard icon={icon} eyebrow={eyebrow} title={label}><select aria-label={label} defaultValue={value}>{options.map(option => <option key={option}>{option}</option>)}</select></PublicCard>;
}
function AccessibilityWidget(): ReactNode {
  const [large, setLarge] = useState(false), [contrast, setContrast] = useState(false);
  return <PublicCard icon={Accessibility} eyebrow="ACCESSIBILITY" title="Reading Preferences"><div className="s18-action-row"><button aria-pressed={large} onClick={() => setLarge(!large)}>Larger Type</button><button aria-pressed={contrast} onClick={() => setContrast(!contrast)}>High Contrast</button></div></PublicCard>;
}
function PwaWidget(): ReactNode { const [checked, setChecked] = useState(false); return <PublicCard icon={Download} eyebrow="PWA INSTALL" title="Install Daenem ERP App" copy={checked ? "Install capability checked · browser prompt unavailable in this Design Lab" : "Browser support required · No installation performed"}><button className="s18-inline-action" onClick={() => setChecked(true)}>Check Install Support</button></PublicCard>; }
function HelpWidget({ settings }: WidgetRendererProps): ReactNode { const [open, setOpen] = useState(false); return <PublicCard icon={CircleHelp} eyebrow={String(settings.eyebrow || "HELP & SUPPORT")} title={String(settings.title || "Sign-In Assistance")} copy={open ? "Use Forgot Password or Create Account. Responses never confirm whether an account exists." : String(settings.copy || "Recovery, account creation and safe public guidance are available.")}><button className="s18-inline-action" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close Safe Help" : "Open Safe Help"}</button></PublicCard>; }
function SecurityWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={ShieldCheck} eyebrow={String(settings.eyebrow || "LOGIN SAFETY")} title={String(settings.title || "Protect Your Account")} copy={String(settings.copy || "Use only your assigned identity. Never share passwords or verification codes.")} meta="PUBLIC SAFE" />; }
function MessageWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Megaphone} eyebrow={String(settings.eyebrow || "COMPANY MESSAGE")} title={String(settings.title || "Operational Excellence")} copy={String(settings.copy || "Build trust through quality, clarity and responsible execution.")} meta="ADMIN MANAGED" />; }
function ValuesWidget(): ReactNode { return <PublicCard icon={Star} eyebrow="COMPANY VALUES" title="Clarity · Quality · Accountability" copy="Technology in service of dependable operations." />; }
function OfficeWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Building2} eyebrow={String(settings.eyebrow || "OFFICE / SITE INFORMATION")} title={String(settings.title || "Daenem Complex · Ibadan")} copy={String(settings.copy || "Illustrative public location context · No restricted operational data")} />; }
function ContactWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Contact} eyebrow={String(settings.eyebrow || "CONTACT INFORMATION")} title={String(settings.title || "Sign-In Support")} copy={String(settings.copy || "Use approved Daenem support channels provided by your administrator.")} meta="PUBLIC GUIDANCE" />; }
function ReleaseWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Rocket} eyebrow={String(settings.eyebrow || "RELEASE NOTES")} title={String(settings.title || "Sign-In Experience Update")} copy={String(settings.copy || "Improved shared runtime, direct context and no-code configuration safeguards.")} meta="DESIGN LAB" />; }
function NoticeWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={TriangleAlert} eyebrow={String(settings.eyebrow || "NOTICE")} title={String(settings.title || "No Active Maintenance")} copy={String(settings.copy || "Authentication remains available in this design-lab experience.")} meta={String(settings.state || "INFORMATION")} />; }
function CountdownWidget({ settings, now }: WidgetRendererProps): ReactNode {
  const target = new Date(String(settings.targetDate || "2026-12-31T23:59:00Z"));
  const days = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
  return <PublicCard icon={Timer} eyebrow="COUNTDOWN / EVENT" title={`${days} days`} copy={String(settings.title || "Until the configured public event")} meta="ADMIN CONFIGURED" />;
}
function HybridClockWidget(props: WidgetRendererProps): ReactNode {
  const zone = String(props.settings.timezone || "Africa/Lagos");
  return <PublicCard icon={Clock3} eyebrow="HYBRID CLOCK" title={String(props.settings.city || "Ibadan")} meta="LIVE BROWSER TIME"><div className="s21-hybrid-clock"><PrecisionClock date={props.now} zone={zone}/><strong>{formatTime12(props.now, zone)}</strong><small>{props.now.toLocaleDateString("en-US", { timeZone: zone, weekday: "long", month: "short", day: "numeric" })}</small></div></PublicCard>;
}
function WeatherMetricWidget({ settings }: WidgetRendererProps): ReactNode {
  return <PublicCard icon={CloudSun} eyebrow={String(settings.eyebrow || "WEATHER DETAIL")} title={String(settings.value || "Available in approved forecast")} copy={String(settings.copy || "Illustrative public-safe weather context for Ibadan.")} meta="DEMO WEATHER"/>;
}
function SystemSurfaceWidget({ settings }: WidgetRendererProps): ReactNode {
  const state = String(settings.state || "AVAILABLE");
  return <PublicCard icon={Radio} eyebrow={String(settings.eyebrow || "SYSTEM")} title={String(settings.title || "Public Sign-In Services")} copy={String(settings.copy || "Status is limited to public-safe availability context.")} meta={state}><div className="s21-system-track"><i/><i/><i/><span>{state}</span></div></PublicCard>;
}
function EditorialSurfaceWidget({ settings }: WidgetRendererProps): ReactNode {
  return <PublicCard icon={Newspaper} eyebrow={String(settings.eyebrow || "PUBLIC INTELLIGENCE")} title={String(settings.title || "Approved briefing surface")} copy={String(settings.copy || "Connect an approved public source during production integration.")} meta={String(settings.providerState || "SOURCE NOT CONNECTED")}><div className="s21-editorial-bars"><i/><i/><i/></div></PublicCard>;
}
function ContentSurfaceWidget({ settings }: WidgetRendererProps): ReactNode {
  return <PublicCard icon={Sparkles} eyebrow={String(settings.eyebrow || "CUSTOM CONTENT")} title={String(settings.title || "Approved Public Content")} copy={String(settings.copy || "Owner-managed plain text and approved assets only.")} meta="PUBLIC SAFE"><div className="s21-content-actions"><span>{String(settings.value || "Configured")}</span>{settings.linkLabel && <button type="button">{String(settings.linkLabel)}</button>}</div></PublicCard>;
}
function CustomCompositionWidget({ settings, now }: WidgetRendererProps): ReactNode {
  const blocks = String(settings.blocks || "Heading, Text, Metric, Link").split(",").map(value => value.trim()).filter(Boolean);
  return <section className="s21-composed-widget sf-glass" data-custom-widget="true" aria-label={String(settings.title || "Custom composed widget")}><header><Sparkles size={16}/><span>{String(settings.title || "Custom Public-Safe Widget")}</span><b>PUBLIC SAFE</b></header><div>{blocks.map((block, index) => <article key={`${block}-${index}`} data-composable-block={block}><small>{block}</small>{block === "Metric" ? <strong>{String(settings.metric || "24/7")}</strong> : block === "Clock" ? <strong>{formatTime12(now, String(settings.timezone || "Africa/Lagos"))}</strong> : block === "Date" ? <strong>{now.toLocaleDateString("en-US", { timeZone: String(settings.timezone || "Africa/Lagos"), weekday: "long", month: "short", day: "numeric" })}</strong> : <span>{String(settings.copy || "Owner-approved content")}</span>}</article>)}</div></section>;
}
function OnboardingWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Users} eyebrow={String(settings.eyebrow || "ONBOARDING MESSAGE")} title={String(settings.title || "Your Daenem Journey Starts Here")} copy={String(settings.copy || "Create a login identity; authorized assignment remains a separate administrator action.")} />; }
function RecruitmentWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={BriefcaseBusiness} eyebrow={String(settings.eyebrow || "JOIN DAENEM")} title={String(settings.title || "Build Meaningful Systems")} copy={String(settings.copy || "Public recruitment information can be connected after Owner approval.")} meta="CONTENT UNAVAILABLE" />; }
function LegalWidget(): ReactNode { return <PublicCard icon={Scale} eyebrow="LEGAL / TERMS / PRIVACY" title="Use Daenem Systems Responsibly" copy="Terms, privacy and acceptable-use policies remain available before authentication."><div className="s18-link-row"><a href="#terms">Terms</a><a href="#privacy">Privacy</a></div></PublicCard>; }
function BusinessHighlightWidget({ settings }: WidgetRendererProps): ReactNode { return <PublicCard icon={Building2} eyebrow={String(settings.eyebrow || "PUBLIC BUSINESS HIGHLIGHT")} title={String(settings.title || "Nigerian-Founded · Globally Oriented")} copy={String(settings.copy || "A technology-driven enterprise experience without restricted business disclosure.")} />; }
function PublicStatsWidget(): ReactNode { return <PublicCard icon={Radio} eyebrow="PUBLIC SAFE STATISTICS" title="3 public services available" copy="Portal · Authentication · Sign-In Help" meta="NO ERP DATA" />; }
function CustomTextWidget({ settings }: WidgetRendererProps): ReactNode { return <div style={{ textAlign: String(settings.alignment || "Left").toLowerCase() as "left" | "center" | "right", height: "100%" }}><PublicCard icon={FileText} eyebrow={String(settings.eyebrow || "CUSTOM ADMIN TEXT")} title={String(settings.heading || "Approved Public Message")} copy={String(settings.content || "Enter safe, administrator-reviewed public content in Widget Settings.")} meta="PLAIN TEXT ONLY" /></div>; }
function CustomImageWidget({ settings }: WidgetRendererProps): ReactNode {
  const preset = signInPresets.find(item => item.id === String(settings.assetId || "horizon")) || signInPresets[0];
  return <figure className="s18-custom-image sf-glass"><img src={imageRuntimeFallback(preset)} alt={String(settings.altText || `Illustrative ${preset.city} environment`)} style={{ objectFit: settings.fit === "contain" ? "contain" : "cover", objectPosition: String(settings.focalPoint || preset.focalPoint) }} /><figcaption>{String(settings.caption || "Approved illustrative asset · Not a Daenem facility")}</figcaption></figure>;
}
function CustomLinkWidget({ settings }: WidgetRendererProps): ReactNode {
  const href = String(settings.url || "https://www.daenem.com");
  return <PublicCard icon={Link2} eyebrow="CUSTOM LINK" title={String(settings.label || "Visit Daenem")} copy="Safe public destination"><a className="s18-inline-action" href={href} target={settings.target === "Same window" ? "_self" : "_blank"} rel="noreferrer">Open Link <ExternalLink size={14} /></a></PublicCard>;
}
function DividerWidget(): ReactNode { return <div className="s18-divider" role="separator"><span>SECTION DIVIDER</span></div>; }
function SpacerWidget(): ReactNode { return <div className="s18-spacer" aria-label="Responsive spacer"><span>SPACER</span></div>; }
function ContainerWidget({ settings }: WidgetRendererProps): ReactNode { return <section className="s18-container sf-glass" aria-label="Structural container"><header><Wrench size={15} />{String(settings.label || "STRUCTURAL CONTAINER")}</header><p>Group approved public widgets into a responsive visual region.</p></section>; }

const noSettings: WidgetSettingSchema[] = [];
const textSettings: WidgetSettingSchema[] = [
  { key: "eyebrow", label: "Label", kind: "text", safe: "plain_text" },
  { key: "title", label: "Title", kind: "text", safe: "plain_text" },
  { key: "copy", label: "Supporting Copy", kind: "textarea", safe: "plain_text" },
];
const newsSettings: WidgetSettingSchema[] = [
  { key: "category", label: "Category", kind: "select", options: ["World", "Business", "Technology", "Industry", "Daenem Sectors"] },
  { key: "headline", label: "Editorial Preview", kind: "text", safe: "plain_text" },
  { key: "cards", label: "Number of Cards", kind: "number", min: 1, max: 6 },
  { key: "density", label: "Density", kind: "select", options: ["Compact", "Detailed"] },
  { key: "images", label: "Show Images", kind: "boolean" },
  { key: "rotation", label: "Auto Rotation", kind: "boolean" },
  { key: "rotationSpeed", label: "Rotation Seconds", kind: "number", min: 3, max: 60 },
  { key: "sourceDisplay", label: "Show Source State", kind: "boolean" },
  { key: "providerState", label: "Provider State", kind: "select", options: ["PROVIDER NOT CONNECTED", "DEMO EDITORIAL PREVIEW", "SOURCE UNAVAILABLE"] },
  { key: "refreshState", label: "Refresh State", kind: "select", options: ["Manual", "Unavailable", "Future Provider"] },
];
const weatherSettings: WidgetSettingSchema[] = [
  { key: "primaryLocation", label: "Primary Location", kind: "text", safe: "plain_text" },
  { key: "additionalLocations", label: "Additional Locations", kind: "text", safe: "plain_text" },
  { key: "unit", label: "Temperature Unit", kind: "select", options: ["°F", "°C"] },
  ...["temperature", "condition", "feelsLike", "humidity", "rain", "wind", "pressure", "sunrise", "sunset"].map(key => ({ key, label: key.replace(/([A-Z])/g, " $1").replace(/^./, value => value.toUpperCase()), kind: "boolean" as const })),
  { key: "animation", label: "Weather Motion", kind: "select", options: ["Off", "Subtle", "Standard"] },
  { key: "providerState", label: "Truth / Provider State", kind: "select", options: ["DEMO", "LIVE", "CACHED", "STALE", "UNAVAILABLE"] },
  { key: "density", label: "Density", kind: "select", options: ["Compact", "Detailed"] },
];
const clockSettings: WidgetSettingSchema[] = [
  { key: "cities", label: "Cities / Order", kind: "text", safe: "plain_text" },
  { key: "timezone", label: "Timezone", kind: "select", options: ["Africa/Lagos", "America/Toronto", "Europe/London", "America/New_York", "Europe/Moscow", "Asia/Tokyo", "Asia/Shanghai"] },
  { key: "presentation", label: "Presentation", kind: "select", options: ["Analog + Digital", "Analog", "Digital"] },
  { key: "hourFormat", label: "Hour Format (12-hour / AM·PM)", kind: "select", options: ["12"] },
  { key: "showDate", label: "Show Full Date", kind: "boolean" },
  { key: "seconds", label: "Show Seconds", kind: "boolean" },
  { key: "timezoneAbbreviation", label: "Timezone Abbreviation", kind: "boolean" },
  { key: "density", label: "Density", kind: "select", options: ["Compact", "Detailed"] },
  { key: "maxVisible", label: "Maximum Visible Cities", kind: "number", min: 1, max: 6 },
];
const inspirationSettings: WidgetSettingSchema[] = [
  { key: "source", label: "Source", kind: "select", options: ["Admin Defined", "AI Assisted"] },
  { key: "category", label: "Category", kind: "select", options: ["Quality", "Leadership", "Safety", "Service", "Teamwork"] },
  { key: "rotation", label: "Rotate Approved Messages", kind: "boolean" },
  { key: "prompt", label: "Public-Safe Prompt", kind: "textarea", safe: "plain_text" },
  { key: "manualOverride", label: "Manual Override", kind: "text", safe: "plain_text" },
  { key: "cadence", label: "Cadence", kind: "select", options: ["Daily", "Weekly", "Manual"] },
  { key: "providerState", label: "Provider State", kind: "select", options: ["ADMIN EDITORIAL", "AI PROVIDER UNAVAILABLE", "APPROVED"] },
];

const MAJOR_VARIANTS: Record<string, string[]> = {
  authentication: ["Integrated", "Floating Glass", "Auth Tower", "Split", "Executive", "Minimal", "Command", "Immersive"],
  aiSearch: ["AI Orb", "Command Bar", "Floating Assistant", "Insight Card", "Search Surface", "Ambient Intelligence Panel"],
  analogClock: ["Classic Analog", "Minimal Analog", "Neon HUD", "Orbital", "Executive", "Glass"],
  digitalClock: ["Precision", "Flip", "Executive", "Glass", "Compact World Clock"],
  hybridClock: ["Hybrid Analog Digital", "Orbital", "Neon HUD", "Executive", "Glass"],
  detailedWeather: ["Compact", "Detailed", "Forecast Rail", "Ambient Scene", "Executive", "HUD", "Floating Glass", "Minimal"],
  forecast: ["Compact", "Forecast Rail", "Ambient Scene", "Executive", "HUD"],
  worldNews: ["Magazine", "Hero + List", "Card Grid", "Briefing Stack", "Ticker", "Carousel", "Intelligence Matrix"],
  systemStatus: ["Status Pill", "Pulse Orb", "Health Ring", "Gauge", "Service Matrix", "Status Timeline", "Command Surface"],
  aiInspiration: ["Editorial", "Image Tile", "Quote Card", "Glass Panel", "Carousel", "Ambient Card"],
  employeeMotivation: ["Editorial", "Image Tile", "Quote Card", "Glass Panel", "Carousel", "Ambient Card"],
};
function categoryFor(type: string): WidgetRegistryEntry["category"] {
  if (/auth|security|legal|login/i.test(type)) return "SECURITY";
  if (/clock|date|time|sunrise|countdown|event/i.test(type)) return "TIME";
  if (/weather|forecast|rain|wind|humidity|pressure|feels|precipitation/i.test(type)) return "WEATHER";
  if (/news|brief|ticker|carousel|search|inspiration|motivation|businessHighlight/i.test(type)) return "INTELLIGENCE";
  if (/status|health|availability|version|published|maintenance|connectivity|release|emergency/i.test(type)) return "SYSTEM";
  if (/company|office|contact|recruit|onboarding|announcement|values/i.test(type)) return "COMPANY";
  if (/language|timezone|accessibility|themeSelector|pwa|help/i.test(type)) return "UTILITIES";
  return "CONTENT";
}
function define(entry: Omit<WidgetRegistryEntry, "category" | "variants"> & Partial<Pick<WidgetRegistryEntry, "category" | "variants">>) {
  const variants = entry.variants || MAJOR_VARIANTS[entry.type] || ["Standard", "Compact", "Glass"];
  return {
    ...entry,
    category: entry.category || categoryFor(entry.type),
    variants,
    defaultSettings: { variant: variants[0], ...entry.defaultSettings },
    settingsSchema: [{ key: "variant", label: "Design Variant", kind: "select" as const, options: variants }, ...entry.settingsSchema],
  } as WidgetRegistryEntry;
}
const baseDefaults = { density: "Compact" };
export const SIGNIN_WIDGET_REGISTRY: WidgetRegistryEntry[] = [
  define({ type: "authentication", name: "Authentication", security: "SECURITY_MANDATORY", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 3, h: 5 }, recommendedSize: { w: 4, h: 11 }, responsiveBehavior: "Always visible; stage-aware sizing", truthState: "LOCAL DESIGN LAB", renderer: AuthenticationWidget }),
  define({ type: "aiSearch", name: "AI Search", security: "CANONICAL_THEME_REQUIRED", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 3, h: 1 }, recommendedSize: { w: 8, h: 1 }, responsiveBehavior: "Full-width intelligence entry", truthState: "AI PROVIDER NOT CONNECTED", renderer: SearchWidget }),
  define({ type: "analogClock", name: "Analog Clock", security: "OPTIONAL_PUBLIC", defaultSettings: { city: "Ibadan", timezone: "Africa/Lagos" }, settingsSchema: clockSettings, minimumSize: { w: 2, h: 2 }, recommendedSize: { w: 3, h: 3 }, responsiveBehavior: "Scales clock face", truthState: "BROWSER TIMEZONE RENDER", renderer: AnalogClockWidget }),
  define({ type: "digitalClock", name: "Digital Clock", security: "OPTIONAL_PUBLIC", defaultSettings: { city: "Ibadan", timezone: "Africa/Lagos", hourFormat: "12", seconds: false }, settingsSchema: clockSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Condenses seconds first", truthState: "BROWSER TIMEZONE RENDER", renderer: DigitalClockWidget }),
  define({ type: "hybridClock", name: "Hybrid Clock", security: "OPTIONAL_PUBLIC", defaultSettings: { city: "Ibadan", timezone: "Africa/Lagos", hourFormat: "12", seconds: false }, settingsSchema: clockSettings, minimumSize: { w: 2, h: 2 }, recommendedSize: { w: 4, h: 3 }, responsiveBehavior: "Analog face and digital readout reflow together", truthState: "BROWSER TIMEZONE RENDER", renderer: HybridClockWidget }),
  define({ type: "fullDate", name: "Full Date", security: "OPTIONAL_PUBLIC", defaultSettings: { timezone: "Africa/Lagos" }, settingsSchema: clockSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Wraps weekday/date", truthState: "BROWSER TIMEZONE RENDER", renderer: DateWidget }),
  define({ type: "primaryLocation", name: "Primary Location", security: "CANONICAL_THEME_REQUIRED", defaultSettings: { city: "Ibadan" }, settingsSchema: clockSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 4 }, responsiveBehavior: "Signature becomes compact row", truthState: "TIME LIVE · WEATHER DEMO", renderer: PrimaryLocationWidget }),
  define({ type: "worldClockGrid", name: "World Clock Grid", security: "CANONICAL_THEME_REQUIRED", defaultSettings: { cities: "Toronto, London, New York, Moscow, Tokyo, Beijing", timezone: "Africa/Lagos", presentation: "Analog + Digital", hourFormat: "12", showDate: true, seconds: false, timezoneAbbreviation: true, density: "Compact", maxVisible: 6 }, settingsSchema: clockSettings.map(field => field.key === "maxVisible" ? { ...field, min: 6, max: 6 } : field), minimumSize: { w: 4, h: 1 }, recommendedSize: { w: 8, h: 2 }, responsiveBehavior: "Six-city 3×2 mobile grid", truthState: "LIVE BROWSER CLOCKS", renderer: WorldClockWidget }),
  define({ type: "detailedWeather", name: "Detailed Weather", security: "CANONICAL_THEME_REQUIRED", defaultSettings: { primaryLocation: "Ibadan", additionalLocations: "", unit: "°F", temperature: true, condition: true, feelsLike: true, humidity: true, rain: true, wind: true, pressure: true, sunrise: true, sunset: true, animation: "Standard", providerState: "DEMO", density: "Detailed" }, settingsSchema: weatherSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 5, h: 3 }, responsiveBehavior: "Summary on mobile; full metrics on desktop", truthState: "DEMO", renderer: WeatherWidget }),
  define({ type: "forecast", name: "Forecast", security: "OPTIONAL_PUBLIC", defaultSettings: { summary: "Warm with passing clouds", providerState: "DEMO" }, settingsSchema: weatherSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Three-period strip", truthState: "DEMO", renderer: ForecastWidget }),
  define({ type: "sunriseSunset", name: "Sunrise / Sunset", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Single solar row", truthState: "ILLUSTRATIVE", renderer: SunWidget }),
  define({ type: "eventClock", name: "Event Clock", security: "OPTIONAL_PUBLIC", defaultSettings: { title: "Next public event", targetDate: "2026-12-31T23:59:00Z" }, settingsSchema: [{ key: "title", label: "Event Title", kind: "text", safe: "plain_text" }, { key: "targetDate", label: "Target Date", kind: "text", safe: "plain_text" }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Countdown and event time stack on mobile", truthState: "ADMIN CONFIGURED", renderer: CountdownWidget }),
  ...[
    ["currentWeather", "Current Weather", "CURRENT WEATHER", "82°F · Partly Cloudy", "Ibadan public-safe illustrative state"],
    ["hourlyForecast", "Hourly Forecast", "HOURLY FORECAST", "Now 82° · 2 PM 84° · 5 PM 80°", "Three-period public fixture"],
    ["dailyForecast", "Daily Forecast", "DAILY FORECAST", "Today 86° / 75°", "Illustrative seven-day rail"],
    ["weatherScene", "Weather Scene", "AMBIENT WEATHER", "Warm daylight · passing clouds", "Motion respects reduced-motion"],
    ["precipitation", "Rain / Precipitation", "PRECIPITATION", "30%", "Illustrative probability"],
    ["wind", "Wind", "WIND", "6 mph · SW", "Illustrative wind context"],
    ["humidity", "Humidity", "HUMIDITY", "74%", "Illustrative humidity"],
    ["pressure", "Pressure", "PRESSURE", "1012 hPa", "Illustrative pressure"],
    ["feelsLike", "Feels Like", "FEELS LIKE", "86°F", "Illustrative apparent temperature"],
    ["weatherAlert", "Weather Alert", "WEATHER ALERT", "No active public alert", "Approved provider mapping pending"],
  ].map(([type, name, eyebrow, value, copy]) => define({ type, name, security: "OPTIONAL_PUBLIC" as const, defaultSettings: { eyebrow, value, copy }, settingsSchema: [...textSettings, { key: "value", label: "Display Value", kind: "text" as const, safe: "plain_text" as const }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Metric and context reflow without clipping", truthState: "DEMO WEATHER", renderer: WeatherMetricWidget })),
  define({ type: "aiInspiration", name: "AI Inspiration", security: "CANONICAL_THEME_REQUIRED", defaultSettings: { source: "Admin Defined", category: "Quality", rotation: true, prompt: "Approved public staff inspiration", manualOverride: "", cadence: "Daily", providerState: "ADMIN EDITORIAL" }, settingsSchema: inspirationSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "One approved message", truthState: "APPROVED EDITORIAL FIXTURE", renderer: InspirationWidget }),
  define({ type: "employeeMotivation", name: "Employee Motivation", security: "CANONICAL_THEME_REQUIRED", defaultSettings: { ...baseDefaults, eyebrow: "EMPLOYEE MOTIVATION", title: "Make Quality Visible", copy: "Check the detail. Close the loop. Leave the next person a clear handover." }, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Daily focus summary", truthState: "ADMIN MANAGED", renderer: MotivationWidget }),
  define({ type: "worldNews", name: "World News", security: "CANONICAL_THEME_REQUIRED", defaultSettings: { category: "World", headline: "World monitoring awaits a verified provider", cards: 3, density: "Detailed", images: true, rotation: false, rotationSpeed: 8, sourceDisplay: true, providerState: "PROVIDER NOT CONNECTED", refreshState: "Unavailable" }, settingsSchema: newsSettings, minimumSize: { w: 3, h: 1 }, recommendedSize: { w: 8, h: 3 }, responsiveBehavior: "Three rich states; labels remain visible", truthState: "PROVIDER NOT CONNECTED", renderer: NewsWidget }),
  ...["Industry", "Technology", "Business"].map(category => define({ type: `${category.toLowerCase()}News`, name: `${category} News`, security: "OPTIONAL_PUBLIC" as const, defaultSettings: { category, headline: `${category} monitoring awaits a verified provider`, cards: 1, density: "Compact", images: false, rotation: false, rotationSpeed: 8, sourceDisplay: true, providerState: "PROVIDER NOT CONNECTED", refreshState: "Unavailable" }, settingsSchema: newsSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Condensed truthful monitor", truthState: "PROVIDER NOT CONNECTED", renderer: NewsChannelWidget })),
  ...[
    ["executiveBriefing", "Executive Briefing", "EXECUTIVE BRIEFING", "A governed public intelligence summary"],
    ["newsTicker", "News Ticker", "PUBLIC NEWS TICKER", "Approved headlines rotate after provider mapping"],
    ["newsCarousel", "News Carousel", "PUBLIC NEWS CAROUSEL", "Visual stories remain source-attributed"],
    ["industryBriefing", "Industry Briefing", "INDUSTRY BRIEFING", "Sector context awaits an approved provider"],
    ["technologyBriefing", "Technology Briefing", "TECHNOLOGY BRIEFING", "Technology context awaits an approved provider"],
  ].map(([type, name, eyebrow, title]) => define({ type, name, security: "OPTIONAL_PUBLIC" as const, defaultSettings: { eyebrow, title, copy: "No fabricated headline, source or timestamp.", providerState: "SOURCE NOT CONNECTED" }, settingsSchema: [...textSettings, { key: "providerState", label: "Provider State", kind: "select" as const, options: ["SOURCE NOT CONNECTED", "DEMO EDITORIAL PREVIEW", "APPROVED"] }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Editorial hierarchy compacts on smaller breakpoints", truthState: "SOURCE NOT CONNECTED", renderer: EditorialSurfaceWidget })),
  define({ type: "systemStatus", name: "System Status", security: "CANONICAL_THEME_REQUIRED", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 2, h: 1 }, responsiveBehavior: "Compact safe status", truthState: "LOCAL DESIGN LAB", renderer: SystemStatusWidget }),
  define({ type: "authenticationStatus", name: "Authentication Status", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Compact safe status", truthState: "LOCAL DESIGN LAB", renderer: AuthenticationStatusWidget }),
  define({ type: "serviceHealth", name: "Service Health", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Safe public health only", truthState: "LOCAL DESIGN LAB", renderer: ServiceHealthWidget }),
  ...[
    ["availability", "Availability", "SERVICE AVAILABILITY", "Public Sign-In Available", "AVAILABLE"],
    ["upcomingMaintenance", "Upcoming Maintenance", "UPCOMING MAINTENANCE", "No scheduled public maintenance", "INFORMATION"],
    ["connectivityStatus", "Connectivity Status", "CONNECTIVITY", "Browser connection ready", "CONNECTED"],
    ["serviceMatrix", "Service Matrix", "SERVICE MATRIX", "Authentication · Portal · Help", "AVAILABLE"],
    ["statusTimeline", "Status Timeline", "STATUS TIMELINE", "Current public-safe state", "AVAILABLE"],
  ].map(([type, name, eyebrow, title, state]) => define({ type, name, security: "OPTIONAL_PUBLIC" as const, defaultSettings: { eyebrow, title, copy: "Fictional Sites laboratory status; production integration pending.", state }, settingsSchema: [...textSettings, { key: "state", label: "Public State", kind: "select" as const, options: ["AVAILABLE", "CONNECTED", "INFORMATION", "SCHEDULED", "UNAVAILABLE"] }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "State and label remain visible at every breakpoint", truthState: "LOCAL DESIGN LAB", renderer: SystemSurfaceWidget })),
  define({ type: "portalVersion", name: "Portal Version", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Compact metadata", truthState: "IMMUTABLE BUILD METADATA", renderer: PortalVersionWidget }),
  define({ type: "publicationFreshness", name: "Portal Updated / Last Published", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 1 }, responsiveBehavior: "Compact metadata", truthState: "IMMUTABLE DEPLOYMENT METADATA", renderer: FreshnessWidget }),
  define({ type: "pwaInstall", name: "PWA Install", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Support-state action", truthState: "BROWSER DEPENDENT", renderer: PwaWidget }),
  define({ type: "helpSupport", name: "Help & Support", security: "OPTIONAL_PUBLIC", defaultSettings: { eyebrow: "HELP & SUPPORT", title: "Sign-In Assistance", copy: "Recovery, account creation and safe public guidance are available." }, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Compact public guidance", truthState: "PUBLIC SAFE", renderer: HelpWidget }),
  define({ type: "quickHelp", name: "Quick Help", security: "OPTIONAL_PUBLIC", defaultSettings: { eyebrow: "QUICK HELP", title: "Need Help Signing In?", copy: "Use recovery or account creation without exposing whether an account exists." }, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "One-action guidance", truthState: "PUBLIC SAFE", renderer: HelpWidget }),
  define({ type: "securityMessage", name: "Security Message", security: "OPTIONAL_PUBLIC", defaultSettings: { eyebrow: "SECURITY MESSAGE", title: "Assigned Access Only", copy: "Unauthorized capabilities remain nonexistent after authentication." }, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Compact safety copy", truthState: "PUBLIC SAFE", renderer: SecurityWidget }),
  define({ type: "loginSafety", name: "Login Safety", security: "OPTIONAL_PUBLIC", defaultSettings: { eyebrow: "LOGIN SAFETY", title: "Protect Your Account", copy: "Never share passwords or verification codes." }, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Compact safety copy", truthState: "PUBLIC SAFE", renderer: SecurityWidget }),
  define({ type: "companyMessage", name: "Company Message", security: "OPTIONAL_PUBLIC", defaultSettings: { eyebrow: "COMPANY MESSAGE", title: "Operational Excellence", copy: "Build trust through quality, clarity and responsible execution." }, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Admin editorial summary", truthState: "ADMIN MANAGED", renderer: MessageWidget }),
  define({ type: "companyValues", name: "Company Values", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Compact values line", truthState: "ADMIN MANAGED", renderer: ValuesWidget }),
  define({ type: "officeInfo", name: "Office / Site Information", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Public location summary", truthState: "PUBLIC SAFE", renderer: OfficeWidget }),
  define({ type: "contactInfo", name: "Contact Information", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Public support summary", truthState: "PUBLIC SAFE", renderer: ContactWidget }),
  define({ type: "languageSelector", name: "Language Selector", security: "OPTIONAL_PUBLIC", defaultSettings: { language: "English" }, settingsSchema: [{ key: "language", label: "Default Language", kind: "select", options: ["English", "Yorùbá", "French"] }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Native select", truthState: "LOCAL PREFERENCE", renderer: ({ settings }) => <SelectWidget icon={Languages} eyebrow="LANGUAGE" label="Interface Language" options={["English", "Yorùbá", "French"]} value={String(settings.language || "English")} /> }),
  define({ type: "timezoneSelector", name: "Timezone Selector", security: "OPTIONAL_PUBLIC", defaultSettings: { timezone: "Africa/Lagos" }, settingsSchema: clockSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Native select", truthState: "LOCAL PREFERENCE", renderer: ({ settings }) => <SelectWidget icon={Globe2} eyebrow="TIMEZONE" label="Display Timezone" options={["Africa/Lagos", "America/New_York", "Europe/London"]} value={String(settings.timezone || "Africa/Lagos")} /> }),
  define({ type: "accessibilityControls", name: "Accessibility Controls", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Touch-friendly controls", truthState: "LOCAL PREFERENCE", renderer: AccessibilityWidget }),
  define({ type: "themeSelector", name: "Theme Selector", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 1 }, responsiveBehavior: "Canonical theme select", truthState: "LOCAL DESIGN LAB", renderer: ({ themeName }) => <SelectWidget icon={MoonStar} eyebrow="THEME SELECTOR" label="Public Experience" options={[themeName, ...signInPresets.map(item => item.name).filter(name => name !== themeName)]} value={themeName} /> }),
  define({ type: "releaseNotes", name: "Release Notes", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Compact release summary", truthState: "DESIGN LAB", renderer: ReleaseWidget }),
  ...[
    ["maintenanceNotice", "Maintenance Notice", "MAINTENANCE NOTICE", "No Active Maintenance", "INFORMATION"],
    ["emergencyNotice", "Emergency Notice", "EMERGENCY NOTICE", "No Active Emergency", "INACTIVE"],
    ["announcement", "Announcement", "ANNOUNCEMENT", "Welcome to Daenem", "ADMIN MANAGED"],
  ].map(([type, name, eyebrow, title, state]) => define({ type, name, security: "OPTIONAL_PUBLIC" as const, defaultSettings: { eyebrow, title, copy: "Administrator-managed public notice.", state }, settingsSchema: [...textSettings, { key: "state", label: "State", kind: "select", options: ["INFORMATION", "ACTIVE", "INACTIVE", "SCHEDULED"] }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Notice priority treatment", truthState: "ADMIN MANAGED", renderer: NoticeWidget })),
  define({ type: "countdown", name: "Countdown / Event", security: "OPTIONAL_PUBLIC", defaultSettings: { title: "Until the configured public event", targetDate: "2026-12-31T23:59:00Z" }, settingsSchema: [{ key: "title", label: "Event Title", kind: "text", safe: "plain_text" }, { key: "targetDate", label: "Target Date", kind: "text", safe: "plain_text" }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Days-only mobile summary", truthState: "ADMIN CONFIGURED", renderer: CountdownWidget }),
  define({ type: "onboardingMessage", name: "Onboarding Message", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Identity guidance", truthState: "PUBLIC SAFE", renderer: OnboardingWidget }),
  define({ type: "recruitment", name: "Recruitment / Join Daenem", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Public recruitment state", truthState: "CONTENT UNAVAILABLE", renderer: RecruitmentWidget }),
  define({ type: "legal", name: "Legal / Terms / Privacy", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Safe policy links", truthState: "PUBLIC SAFE", renderer: LegalWidget }),
  define({ type: "businessHighlight", name: "Public Business Highlight", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: textSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Public brand summary", truthState: "PUBLIC SAFE", renderer: BusinessHighlightWidget }),
  define({ type: "publicStatistics", name: "Public Safe Statistics", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "No ERP measures", truthState: "NO ERP DATA", renderer: PublicStatsWidget }),
  define({ type: "customText", name: "Custom Admin Text", security: "OPTIONAL_PUBLIC", defaultSettings: { eyebrow: "CUSTOM ADMIN TEXT", heading: "Approved Public Message", content: "Enter safe, administrator-reviewed public content.", alignment: "Left" }, settingsSchema: [{ key: "eyebrow", label: "Label", kind: "text", safe: "plain_text" }, { key: "heading", label: "Heading", kind: "text", safe: "plain_text" }, { key: "content", label: "Content", kind: "textarea", safe: "plain_text" }, { key: "alignment", label: "Alignment", kind: "select", options: ["Left", "Center", "Right"] }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Safe text wrapping", truthState: "ADMIN MANAGED", renderer: CustomTextWidget }),
  define({ type: "customImage", name: "Custom Image", security: "OPTIONAL_PUBLIC", defaultSettings: { assetId: "horizon", altText: "Approved illustrative environment", focalPoint: "center center", fit: "cover", caption: "Approved illustrative asset · Not a Daenem facility" }, settingsSchema: [{ key: "assetId", label: "Approved Asset", kind: "select", options: signInPresets.map(item => item.id), safe: "approved_asset" }, { key: "altText", label: "Alternative Text", kind: "text", safe: "plain_text" }, { key: "focalPoint", label: "Focal Point", kind: "text", safe: "plain_text" }, { key: "fit", label: "Fit", kind: "select", options: ["cover", "contain"] }, { key: "caption", label: "Caption", kind: "text", safe: "plain_text" }], minimumSize: { w: 2, h: 2 }, recommendedSize: { w: 4, h: 3 }, responsiveBehavior: "Cropped with alternative text", truthState: "APPROVED ASSET", renderer: CustomImageWidget }),
  define({ type: "customLink", name: "Custom Link", security: "OPTIONAL_PUBLIC", defaultSettings: { label: "Visit Daenem", url: "https://www.daenem.com", target: "New window", icon: "External Link" }, settingsSchema: [{ key: "label", label: "Label", kind: "text", safe: "plain_text" }, { key: "url", label: "Safe URL", kind: "url", safe: "safe_url" }, { key: "target", label: "Target", kind: "select", options: ["New window", "Same window"] }, { key: "icon", label: "Icon", kind: "select", options: ["External Link", "Arrow", "Information"] }], minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Touch-friendly link", truthState: "ADMIN APPROVED", renderer: CustomLinkWidget }),
  ...[
    ["customHeading", "Custom Heading", "HEADING", "A strong public-safe heading", "Typography-first content block"],
    ["publicMetric", "Public Metric", "PUBLIC METRIC", "24 / 7", "Only approved public-safe data bindings"],
    ["publicStatistic", "Public Statistic", "PUBLIC STATISTIC", "100%", "No ERP or restricted data"],
    ["customBadge", "Badge", "BADGE", "Approved", "Admin-governed public label"],
    ["customIcon", "Icon", "ICON", "Daenem", "Approved icon library only"],
    ["imageText", "Image + Text", "IMAGE + TEXT", "Visual story", "Approved asset and plain text"],
    ["heroBlock", "Hero Block", "HERO", "Lead with clarity", "Large visual anchor with responsive copy"],
    ["callout", "Callout", "CALLOUT", "Important public guidance", "Priority treatment without restricted content"],
    ["quote", "Quote", "QUOTE", "Build trust through quality.", "Owner-approved attribution only"],
    ["featureBlock", "Feature Block", "FEATURE", "One clear capability", "Image, icon, title and safe link"],
  ].map(([type, name, eyebrow, value, copy]) => define({ type, name, security: "OPTIONAL_PUBLIC" as const, defaultSettings: { eyebrow, title: value, value, copy, linkLabel: "" }, settingsSchema: [...textSettings, { key: "value", label: "Value", kind: "text" as const, safe: "plain_text" as const }, { key: "linkLabel", label: "Link Label", kind: "text" as const, safe: "plain_text" as const }], minimumSize: { w: 1, h: 1 }, recommendedSize: { w: 3, h: 2 }, responsiveBehavior: "Content reflows with theme typography", truthState: "ADMIN MANAGED", renderer: ContentSurfaceWidget })),
  define({ type: "customComposition", name: "Custom Widget Composition", security: "OPTIONAL_PUBLIC", variants: ["Canvas", "Stack", "Split", "Floating Glass", "Compact"], defaultSettings: { title: "Custom Public-Safe Widget", blocks: "Heading, Text, Metric, Link", copy: "Owner-approved content", metric: "24/7", dataBinding: "NONE" }, settingsSchema: [{ key: "title", label: "Widget Name", kind: "text", safe: "plain_text" }, { key: "blocks", label: "Composable Blocks", kind: "textarea", safe: "plain_text" }, { key: "copy", label: "Public Copy", kind: "textarea", safe: "plain_text" }, { key: "metric", label: "Metric", kind: "text", safe: "plain_text" }, { key: "dataBinding", label: "Approved Binding", kind: "select", options: ["NONE", "BROWSER_TIME", "PUBLIC_STATUS", "PUBLISHED_VERSION"] }], minimumSize: { w: 2, h: 2 }, recommendedSize: { w: 5, h: 3 }, responsiveBehavior: "Composable blocks stack or split per breakpoint", truthState: "PUBLIC SAFE COMPOSITION", renderer: CustomCompositionWidget }),
  define({ type: "divider", name: "Divider", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 2, h: 1 }, recommendedSize: { w: 4, h: 1 }, responsiveBehavior: "Responsive separator", truthState: "STRUCTURAL", renderer: DividerWidget }),
  define({ type: "spacer", name: "Spacer", security: "OPTIONAL_PUBLIC", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 1, h: 1 }, recommendedSize: { w: 2, h: 1 }, responsiveBehavior: "Layout-only spacing", truthState: "STRUCTURAL", renderer: SpacerWidget }),
  define({ type: "container", name: "Structural Container", security: "OPTIONAL_PUBLIC", defaultSettings: { label: "STRUCTURAL CONTAINER" }, settingsSchema: [{ key: "label", label: "Container Label", kind: "text", safe: "plain_text" }], minimumSize: { w: 2, h: 2 }, recommendedSize: { w: 6, h: 3 }, responsiveBehavior: "Grouping surface", truthState: "STRUCTURAL", renderer: ContainerWidget }),
  define({ type: "payrollSnapshot", name: "Payroll Snapshot", security: "AUTHENTICATED_ONLY", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 3, h: 2 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Blocked pre-auth", truthState: "RESTRICTED", renderer: PublicStatsWidget }),
  define({ type: "employeeRecord", name: "Employee Record", security: "AUTHENTICATED_ONLY", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 3, h: 2 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Blocked pre-auth", truthState: "RESTRICTED", renderer: PublicStatsWidget }),
  define({ type: "bankBalance", name: "Bank Balance", security: "AUTHENTICATED_ONLY", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 3, h: 2 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Blocked pre-auth", truthState: "RESTRICTED", renderer: PublicStatsWidget }),
  define({ type: "apiSecret", name: "API Secret", security: "ADMIN_ONLY", defaultSettings: {}, settingsSchema: noSettings, minimumSize: { w: 3, h: 2 }, recommendedSize: { w: 4, h: 2 }, responsiveBehavior: "Never rendered pre-auth", truthState: "RESTRICTED", renderer: PublicStatsWidget }),
];

export const WIDGET_REGISTRY_BY_TYPE = Object.fromEntries(SIGNIN_WIDGET_REGISTRY.map(entry => [entry.type, entry])) as Record<string, WidgetRegistryEntry>;
export const PUBLIC_WIDGET_REGISTRY = SIGNIN_WIDGET_REGISTRY.filter(entry => entry.security === "SECURITY_MANDATORY" || entry.security === "CANONICAL_THEME_REQUIRED" || entry.security === "OPTIONAL_PUBLIC");
export const CANONICAL_WIDGET_TYPES = SIGNIN_WIDGET_REGISTRY.filter(entry => entry.security === "SECURITY_MANDATORY" || entry.security === "CANONICAL_THEME_REQUIRED").map(entry => entry.type);
export const PREBUILT_WIDGET_TYPE_COUNT = PUBLIC_WIDGET_REGISTRY.length;
export const WIDGET_VARIANT_COUNT = PUBLIC_WIDGET_REGISTRY.reduce((total, entry) => total + entry.variants.length, 0);

export function RegisteredSignInWidget(props: WidgetRendererProps & { type: string }) {
  const entry = WIDGET_REGISTRY_BY_TYPE[props.type];
  if (!entry || entry.security === "AUTHENTICATED_ONLY" || entry.security === "ADMIN_ONLY") return null;
  const Renderer = entry.renderer;
  const variant = String(props.settings.variant || entry.variants[0]);
  return <div className={`s21-widget-variant is-${variantSlug(variant)}`} data-widget-variant={variant}><Renderer {...props} /></div>;
}

export function safePublicUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return ["https:", "mailto:", "tel:"].includes(parsed.protocol) ? text : "";
  } catch { return ""; }
}
