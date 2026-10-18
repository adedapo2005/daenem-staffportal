"use client";
import { useEffect, useState } from "react";
import {
  Search,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Globe2,
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Radio,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { publishedLabel } from "./deployment-metadata";
import { formatTime12 } from "./time-standard";

export const localClock = ["DAENEM COMPLEX — IBADAN", "Nigeria", "Africa/Lagos"] as const;
export const primaryClocks = [
  ["Toronto", "Canada", "America/Toronto"],
  ["London", "United Kingdom", "Europe/London"],
  ["New York", "United States", "America/New_York"],
  ["Moscow", "Russia", "Europe/Moscow"],
  ["Tokyo", "Japan", "Asia/Tokyo"],
  ["Beijing", "China", "Asia/Shanghai"],
] as const;
export const preAuthHelpCatalog = [
  {
    title: "Sign-In Assistance",
    group: "Account Help",
    text: "Use your assigned username or email. This review Site uses fictional authentication; do not enter real credentials.",
    action: "signin",
  },
  {
    title: "Password Recovery",
    group: "Account Help",
    text: "Select Forgot password to begin recovery. Account matching never confirms whether an identity exists.",
    action: "recovery",
  },
  {
    title: "Create Account",
    group: "Identity Guidance",
    text: "An identity request requires verification and administrator assignment. Creating an identity does not grant operational access.",
    action: "signup",
  },
] as const;
const publicHelp = preAuthHelpCatalog;

export function SafeSpotlight({
  navigate,
}: {
  navigate: (stage: "signin" | "recovery" | "signup") => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [thinking, setThinking] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!query) return;
    const t = setTimeout(() => setThinking(false), 180);
    return () => clearTimeout(t);
  }, [query]);
  const ghost = publicHelp.find(
    (p) =>
      query.length > 1 && p.title.toLowerCase().startsWith(query.toLowerCase()),
  );
  return (
    <>
      <button
        className="sf-spotlight"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="sf-orb" />
        <span>Ask or Find Sign-In Help</span>
        <kbd>⌘ / Ctrl K</kbd>
        <Search size={19} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sf-search-dialog">
          <DialogTitle>
            <Sparkles size={20} />
            Daenem intelligence
          </DialogTitle>
          <DialogDescription>
            Public account guidance only · AI provider not connected
          </DialogDescription>
          <Command shouldFilter>
            <CommandInput
              placeholder="Search safe sign-in guidance…"
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setThinking(Boolean(value));
              }}
            />
            {ghost && (
              <p className="sf-ghost" aria-live="polite">
                Ghost completion: {query}
                <strong>{ghost.title.slice(query.length)}</strong>
              </p>
            )}
            {thinking && (
              <p className="sf-thinking">
                <span className="sf-orb" />
                Checking public guidance…
              </p>
            )}
            <CommandList>
              <CommandEmpty>
                <div className="sf-search-empty">
                  <Search size={22} />
                  <strong>No matching public guidance</strong>
                  <span>
                    Internal modules, records, people and reports are never
                    searched before authentication.
                  </span>
                </div>
              </CommandEmpty>
              {["Account Help", "Identity Guidance"].map((group) => (
                <CommandGroup heading={group} key={group}>
                  {publicHelp
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <CommandItem
                        key={p.title}
                        value={p.title + " " + p.text}
                        onSelect={() => {
                          navigate(p.action);
                          setOpen(false);
                        }}
                      >
                        <span>
                          <strong>{p.title}</strong>
                          <small>{p.text}</small>
                        </span>
                        <ArrowRight size={18} />
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
          <div className="sf-safe-recent">
            <span>Safe recent</span>
            <button
              onClick={() => {
                setQuery("Password Recovery");
                setThinking(true);
              }}
            >
              Password Recovery
            </button>
            <button
              onClick={() => {
                setQuery("Create Account");
                setThinking(true);
              }}
            >
              Create Account
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function clockParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);
  const n = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  return { h: n("hour") % 24, m: n("minute"), s: n("second") };
}
function offset(date: Date, zone: string) {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "UTC") || "UTC"
  );
}
export function PrecisionClock({ date, zone }: { date: Date; zone: string }) {
  const { h, m, s } = clockParts(date, zone);
  return (
    <svg
      viewBox="0 0 120 120"
      className={`sf-clock ${h >= 6 && h < 18 ? "day" : "night"}`}
      role="img"
      aria-label={`Analog clock ${formatTime12(date, zone, true)}`}
    >
      <circle cx="60" cy="60" r="58" className="sf-clock-halo" />
      <circle cx="60" cy="60" r="54" className="sf-clock-rim" />
      <circle cx="60" cy="60" r="48" className="sf-clock-face" />
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={i}
          x1="60"
          y1={i % 5 === 0 ? 14 : 17}
          x2="60"
          y2={i % 5 === 0 ? 22 : 20}
          transform={`rotate(${i * 6} 60 60)`}
          className={i % 5 === 0 ? "major" : "minor"}
        />
      ))}
      <text x="60" y="34">
        12
      </text>
      <text x="88" y="64">
        3
      </text>
      <text x="60" y="94">
        6
      </text>
      <text x="32" y="64">
        9
      </text>
      <line
        className="hour"
        x1="60"
        y1="63"
        x2="60"
        y2="37"
        transform={`rotate(${h * 30 + m / 2} 60 60)`}
      />
      <line
        className="minute"
        x1="60"
        y1="65"
        x2="60"
        y2="27"
        transform={`rotate(${m * 6 + s / 10} 60 60)`}
      />
      <line
        className="second"
        x1="60"
        y1="69"
        x2="60"
        y2="23"
        transform={`rotate(${s * 6} 60 60)`}
      />
      <circle cx="60" cy="60" r="4" className="sf-clock-pin" />
    </svg>
  );
}
export function GlobalTime({
  now,
  compact = false,
}: {
  now: Date;
  compact?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const city = primaryClocks[index];
  const { h } = clockParts(now, city[2]);
  return (
    <section
      className={`sf-global sf-glass ${compact ? "compact" : ""}`}
      aria-label="Six-city global time"
      data-global-time-city-count={primaryClocks.length}
      data-global-time-contains-ibadan="false"
    >
      <header>
        <span className="sf-label">
          <Globe2 size={16} />
          GLOBAL TIME
        </span>
        <span className="sf-live">
          <i />
          LIVE CLOCK
        </span>
      </header>
      <div className="sf-time-focus">
        <PrecisionClock date={now} zone={city[2]} />
        <div>
          <span className="sf-label">{city[0]}</span>
          <strong className="sf-digital">
            {now.toLocaleTimeString("en-US", {
              timeZone: city[2],
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </strong>
          <p>
            {now.toLocaleDateString("en-US", {
              timeZone: city[2],
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <small>
            {city[1]} ·{" "}
            {
              new Intl.DateTimeFormat("en-US", {
                timeZone: city[2],
                timeZoneName: "short",
              })
                .formatToParts(now)
                .find((p) => p.type === "timeZoneName")?.value
            }{" "}
            · {offset(now, city[2])} · {h >= 6 && h < 18 ? "Day" : "Night"}*
          </small>
        </div>
      </div>
      <nav aria-label="Primary world-clock locations">
        {primaryClocks.map((p, i) => (
          <button
            key={p[2]}
            onClick={() => setIndex(i)}
            aria-pressed={i === index}
          >
            <span>{p[0]}</span>
            <small>
              {now.toLocaleTimeString("en-US", {
                timeZone: p[2],
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </small>
          </button>
        ))}
      </nav>
      <small className="sf-footnote">
        *Day/night uses local clock hours; solar provider data is unavailable.
      </small>
    </section>
  );
}

function WeatherGlyph({ condition }: { condition: string }) {
  return (
    <span
      className="sf-weather-visual"
      data-condition={condition.toLowerCase().replace(" ", "-")}
      aria-hidden="true"
    >
      <i className="sun" />
      <i className="cloud one" />
      <i className="cloud two" />
      <span className="rain">
        <b />
        <b />
        <b />
      </span>
      <span className="fog">
        <b />
        <b />
        <b />
      </span>
      <i className="moon" />
      <span className="stars">✦ ·</span>
    </span>
  );
}
export function WeatherContext({ compact = false }: { compact?: boolean }) {
  const [condition, setCondition] = useState("Partly cloudy"),
    [detail, setDetail] = useState(false);
  if (compact) {
    const conditions = ["Sunny", "Partly cloudy", "Rain", "Storm", "Fog", "Night"];
    return (
      <section className={`sf-weather sf-glass condition-${condition.replace(" ", "-").toLowerCase()} compact`} aria-label="Ibadan Weather">
        <header><span className="sf-label">IBADAN WEATHER</span><span className="sf-demo">DEMO</span></header>
        <button className="sf-weather-main" onClick={() => setCondition(conditions[(conditions.indexOf(condition) + 1) % conditions.length])} aria-label={`Preview next weather condition. Current: ${condition}`}>
          <WeatherGlyph condition={condition} />
          <span><strong>82<span>°F</span></strong><small>{condition} · Feels 86°F</small></span>
        </button>
        <p>H 86° · L 75° · Humidity 74%</p>
        <small>Rain 30% · Wind 6 mph · Sunrise 6:35 AM · Sunset 6:45 PM</small>
      </section>
    );
  }
  return (
    <section
      className={`sf-weather sf-glass condition-${condition.replace(" ", "-").toLowerCase()} ${compact ? "compact" : ""}`}
    >
      <header>
        <span className="sf-label">IBADAN WEATHER</span>
        <span className="sf-demo">DEMO</span>
      </header>
      <button
        className="sf-weather-main"
        onClick={() => setDetail(!detail)}
        aria-expanded={detail}
      >
        <WeatherGlyph condition={condition} />
        <span>
          <strong>
            82<span>°F</span>
          </strong>
          <small>{condition} · Feels like 86°F</small>
        </span>
        <ArrowRight size={18} />
      </button>
      <p>High 86° · Low 75° · Humidity 74%</p>
      {detail && (
        <div className="sf-weather-details">
          <p>Precipitation 30% · Wind 6 mph SW</p>
          <p>Illustrative sunrise 6:35 AM · Sunset 6:45 PM</p>
          <p>
            Short forecast: warm with passing clouds. Fictional fixture; no live
            weather connection.
          </p>
          <label>
            Preview condition
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              {["Sunny", "Partly cloudy", "Rain", "Storm", "Fog", "Night"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
const inspiration = [
  "Build trust through the quality of every decision.",
  "Progress is a team discipline: listen, improve, deliver.",
  "Make today’s work clear enough for tomorrow’s team to build on.",
];
export function Inspiration({ compact = false }: { compact?: boolean }) {
  const [i, setI] = useState(0);
  const [stage, setStage] = useState(1);
  if (compact) return (
    <section className="sf-inspiration sf-glass compact">
      <header><span className="sf-label"><span className="sf-orb" />AI INSPIRATION</span><button aria-label="Next approved inspiration" onClick={() => setI((i + 1) % inspiration.length)}><ChevronRight size={18} /></button></header>
      <blockquote>“{inspiration[i]}”</blockquote>
      <small>Approved editorial fixture · AI provider unavailable</small>
      <button className="sf-inline-stage" disabled={stage >= 4} onClick={() => setStage(Math.min(4, stage + 1))}>{["Generate → Preview", "Preview → Edit", "Edit → Approve", "Approve → Publish", "Published"][stage]}</button>
    </section>
  );
  return (
    <section className={`sf-inspiration sf-glass ${compact ? "compact" : ""}`}>
      <header>
        <span className="sf-label">
          <span className="sf-orb" />
          AI INSPIRATION
        </span>
        <button
          aria-label="Next approved inspiration"
          onClick={() => setI((i + 1) % inspiration.length)}
        >
          <ChevronRight size={19} />
        </button>
      </header>
      <blockquote>“{inspiration[i]}”</blockquote>
      <small>
        {compact
          ? "Approved editorial demo · AI provider unavailable"
          : "Editorial demo · No AI provider · Organization publication requires approval"}
      </small>
      <div className="sf-governance" aria-label="Inspiration governance">
        <span>
          {["Generate", "Preview", "Edit", "Approve", "Publish"][stage]}
        </span>
        <button
          disabled={stage >= 4}
          onClick={() => setStage(Math.min(4, stage + 1))}
        >
          Advance local review
        </button>
      </div>
    </section>
  );
}
export function Motivation({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`sf-motivation sf-glass ${compact ? "compact" : ""}`}>
      <span className="sf-label">EMPLOYEE MOTIVATION</span>
      <h3>Make quality visible.</h3>
      <p>
        Check the detail. Close the loop. Leave the next person a clear
        handover.
      </p>
      <small>{compact ? "Daily focus · Admin-managed fixture" : "Daily focus · Administrator-managed editorial fixture"}</small>
    </section>
  );
}
export function PublicNews({ compact = false }: { compact?: boolean }) {
  const [i, setI] = useState(0);
  const categories = [
    {title:"World Monitor",state:"PROVIDER NOT CONNECTED",copy:"A verified world-news provider can populate this public-safe monitor after configuration."},
    {title:"Industry Intelligence",state:"DEMO EDITORIAL PREVIEW",copy:"Approved categories include manufacturing, logistics, finance and African business."},
    {title:"Technology Intelligence",state:"SOURCE UNAVAILABLE",copy:"No external technology headlines or timestamps are represented as live."},
  ];
  if (compact) return <section className="sf-news sf-glass compact"><header><span className="sf-label"><Newspaper size={15}/>WORLD &amp; INDUSTRY INTELLIGENCE</span><span className="sf-demo">TRUTHFUL STATE</span></header><div className="sf-news-intelligence">{categories.map(c=><article key={c.title}><h3>{c.title}</h3><p>{c.copy}</p><small>{c.state}</small></article>)}</div></section>;
  return (
    <section className={`sf-news sf-glass ${compact ? "compact" : ""}`}>
      <header>
        <span className="sf-label">
          <Newspaper size={16} />
          WORLD & INDUSTRY NEWS
        </span>
        <span className="sf-demo">UNAVAILABLE</span>
      </header>
      <div className="sf-news-intelligence">{categories.map((c,index)=><article key={c.title} aria-current={index===i}><h3>{c.title}</h3><p>{c.copy}</p><small>{c.state}</small><button aria-label={`Inspect ${c.title}`} onClick={()=>setI(index)}>{index===i?"Selected":"Inspect"}</button></article>)}</div>
    </section>
  );
}
export function PublicStatus() {
  return (
    <div className="sf-status" aria-label="SYSTEM STATUS">
      <ShieldCheck size={18} />
      <span>
        REVIEW PORTAL <b>AVAILABLE</b>
      </span>
      <span>
        AUTHENTICATION <b>LOCAL DEMO</b>
      </span>
    </div>
  );
}

export function PublishFreshness() {
  return (
    <div className="sf-published" title="Current Staff Portal release">
      <span className="sf-published-pulse" aria-hidden="true" />
      <span>{publishedLabel()}</span>
    </div>
  );
}

export function IbadanSignature({ now }: { now: Date }) {
  const city = localClock;
  const { h } = clockParts(now, city[2]);
  return (
    <section
      className="sf-signature sf-glass"
      aria-label="Daenem Complex Ibadan time, weather and status"
    >
      <div className="sf-signature-clock">
        <PrecisionClock date={now} zone={city[2]} />
        <div>
          <span className="sf-label">DAENEM COMPLEX / IBADAN</span>
          <strong>
            {now.toLocaleTimeString("en-US", {
              timeZone: city[2],
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </strong>
          <p>
            {now.toLocaleDateString("en-US", {
              timeZone: city[2],
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <small>
            WAT · {offset(now, city[2])} · {h >= 6 && h < 18 ? "DAY" : "NIGHT"}
          </small>
        </div>
      </div>
      <div className="sf-signature-weather">
        <WeatherGlyph condition="Partly cloudy" />
        <span>
          <strong>82°F</strong>
          <small>Partly cloudy · DEMO</small>
        </span>
      </div>
      <div className="sf-signature-sun">
        <span>
          Sunrise <b>6:35 AM</b>
        </span>
        <span>
          Sunset <b>6:45 PM</b>
        </span>
        <span className="healthy">
          <i />
          Portal available
        </span>
      </div>
    </section>
  );
}
export function ContextDock({ now }: { now: Date }) {
  return (
    <section className="sf-context-dock" aria-label="Live Public Context">
      <IbadanSignature now={now} />
      <div className="sf-context-grid">
        <div className="sf-context-wide">
          <GlobalTime now={now} compact />
        </div>
        <WeatherContext compact />
        <Inspiration compact />
        <Motivation compact />
        <PublicNews compact />
        <section className="sf-context-status sf-glass" aria-label="System Status">
          <header>
            <span className="sf-label">SYSTEM STATUS</span>
            <Radio size={17} aria-hidden="true" />
          </header>
          <div className="sf-context-health"><span><i />STAFF PORTAL</span><strong>AVAILABLE</strong><span>AUTHENTICATION</span><strong>LOCAL DEMO</strong></div>
          <p>Public-safe status only.</p>
        </section>
      </div>
    </section>
  );
}
