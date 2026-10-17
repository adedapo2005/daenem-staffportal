"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bot, Check, ChevronRight, CircleX, Copy, Image as ImageIcon, Layers3, Link2, Maximize2, Move, Palette, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Type, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_WIDGET_REGISTRY, PREBUILT_WIDGET_TYPE_COUNT, WIDGET_VARIANT_COUNT } from "./signin-widget-registry";
import { applyAiProposalToActiveDraft, restoreActiveDraft } from "./signin-builder-v16";
import { Badge, Btn, Callout, Pick } from "./ui";
import "./signin-studio-v21.css";

export const CUSTOM_WIDGET_RECIPE_STORAGE = "daenem-signin-custom-widget-recipe-v21";
export const BRAND_STUDIO_STORAGE = "daenem-signin-brand-studio-v21";
export const AI_PROPOSAL_STORAGE = "daenem-signin-ai-proposal-v21";
const blocks = ["Heading", "Text", "Image", "Icon", "Metric", "Badge", "Link", "Clock", "Date", "Public status", "Divider", "Spacer", "Container"];
const bindings = ["NONE", "BROWSER_TIME", "PUBLIC_STATUS", "PUBLISHED_VERSION"];

export function WidgetVariantPickerPanel() {
  const [family, setFamily] = useState("authentication");
  const entry = PUBLIC_WIDGET_REGISTRY.find(item => item.type === family) || PUBLIC_WIDGET_REGISTRY[0];
  const [selected, setSelected] = useState(entry.variants[0]);
  const major = PUBLIC_WIDGET_REGISTRY.filter(item => item.variants.length >= 5);
  return <section className="s21-panel" data-studio-surface="Widget Variant Picker">
    <header><div><span className="p-kicker">WIDGET PURPOSE × DESIGN VARIANT</span><h2>One capability. Many authored forms.</h2><p>Variants change composition, information hierarchy and behavior without duplicating the widget’s purpose.</p></div><div className="s21-counts"><span><b>{PREBUILT_WIDGET_TYPE_COUNT}</b> types</span><span><b>{WIDGET_VARIANT_COUNT}</b> variants</span></div></header>
    <div className="s21-variant-workspace"><aside>{major.map(item => <button key={item.type} className={family === item.type ? "active" : ""} onClick={() => { setFamily(item.type); setSelected(item.variants[0]); }}><Sparkles/><span><b>{item.name}</b><small>{item.variants.length} distinct designs</small></span><ChevronRight/></button>)}</aside><main><header><span><small>WIDGET PURPOSE</small><h3>{entry.name}</h3></span><Badge>{entry.category}</Badge></header><div className="s21-variant-grid">{entry.variants.map((variant, index) => <button key={variant} className={selected === variant ? "active" : ""} onClick={() => setSelected(variant)} data-widget-variant={variant}><div className={`s21-variant-demo form-${index % 6}`}><i/><i/><i/><strong>{String(index + 1).padStart(2, "0")}</strong></div><span><b>{variant}</b><small>{index % 2 ? "Responsive editorial structure" : "Interactive luminous structure"}</small></span></button>)}</div><Callout tone="neutral" title={`${selected} selected`}>Changing a variant keeps the widget’s security classification, data contract and content. It updates only its governed visual design.</Callout></main></div>
  </section>;
}

export function CustomWidgetBuilderPanel({ onOpenEditor, onAddToLayout }: { onOpenEditor?: () => void; onAddToLayout?: () => void }) {
  const [name, setName] = useState("Operations Welcome Card");
  const [selectedBlocks, setSelectedBlocks] = useState(["Heading", "Text", "Metric", "Link"]);
  const [binding, setBinding] = useState("NONE");
  const [glass, setGlass] = useState(72);
  const [glow, setGlow] = useState(34);
  const [motion, setMotion] = useState("Subtle");
  const [saved, setSaved] = useState(false);
  const [inspector, setInspector] = useState("Layout");
  function toggle(block: string) { setSaved(false); setSelectedBlocks(current => current.includes(block) ? current.filter(item => item !== block) : [...current, block]); }
  function save() {
    const recipe = { version: 22, type: "customComposition", name, blocks: selectedBlocks, dataBinding: binding, style: { glass, glow }, motion, classification: "PUBLIC_SAFE" };
    localStorage.setItem(CUSTOM_WIDGET_RECIPE_STORAGE, JSON.stringify(recipe));
    setSaved(true);
    window.dispatchEvent(new CustomEvent("daenem-custom-widget-v21", { detail: recipe }));
    toast.success("Custom widget recipe saved to the current local Studio draft.");
  }
  return <section className="s21-panel" data-studio-surface="Custom Widget Builder" data-custom-widget-saved={saved ? "true" : "false"}>
    <header><div><span className="p-kicker">CUSTOM WIDGET BUILDER</span><h2>Compose a new governed capability.</h2><p>Combine safe elements, control its design, and add the result to a theme without executable code.</p></div><Badge>PUBLIC_SAFE ONLY</Badge></header>
    <div className="s21-custom-grid"><aside><label className="p-field">Widget Name<input value={name} onChange={event => { setName(event.target.value.replace(/[<>]/g, "").slice(0, 80)); setSaved(false); }}/></label><h3>Composable Elements</h3><div className="s21-block-library">{blocks.map((block, index) => <button key={block} className={selectedBlocks.includes(block) ? "active" : ""} onClick={() => toggle(block)}><span>{index % 4 === 0 ? <Type/> : index % 4 === 1 ? <ImageIcon/> : index % 4 === 2 ? <Layers3/> : <Link2/>}</span>{block}{selectedBlocks.includes(block) && <Check/>}</button>)}</div></aside><main>
<div className="s21-compose-toolbar" aria-label="Custom widget editor modes">{[["Layout",<Move key="layout"/>],["Style",<Palette key="style"/>],["Motion",<WandSparkles key="motion"/>],["Responsive",<Maximize2 key="responsive"/>]].map(([label,icon]) => <button key={String(label)} className={inspector === label ? "active" : ""} aria-pressed={inspector === label} onClick={() => setInspector(String(label))}>{icon}{label}</button>)}</div>
<div className="s21-compose-canvas" style={{ "--compose-glass": glass / 100, "--compose-glow": glow / 100 } as CSSProperties}><header><Sparkles/><b>{name || "Untitled Safe Widget"}</b><span>PUBLIC SAFE</span></header><div>{selectedBlocks.length ? selectedBlocks.map((block, index) => <article key={`${block}-${index}`}><small>{block.toUpperCase()}</small>{block === "Metric" ? <strong>24 / 7</strong> : block === "Clock" ? <strong>9:41 AM</strong> : block === "Date" ? <strong>Monday · Sep 13</strong> : block === "Image" ? <div className="s21-image-placeholder"><ImageIcon/></div> : <p>Owner-approved public content</p>}</article>) : <p>Select at least one composable element.</p>}</div></div></main><aside className="s21-compose-inspector"><h3>Inspector</h3><Pick label="Approved data binding" value={binding} onChange={value => { setBinding(value); setSaved(false); }} options={bindings}/><label className="p-field">Glass <output>{glass}%</output><input type="range" min="0" max="100" value={glass} onChange={event => { setGlass(Number(event.target.value)); setSaved(false); }}/></label><label className="p-field">Glow <output>{glow}%</output><input type="range" min="0" max="100" value={glow} onChange={event => { setGlow(Number(event.target.value)); setSaved(false); }}/></label><Pick label="Motion" value={motion} onChange={value => { setMotion(value); setSaved(false); }} options={["Off", "Subtle", "Standard", "Enhanced"]}/><div className="s21-safety-list">{["No JavaScript", "No executable HTML", "No secrets or API keys", "No restricted data", "Authentication unchanged"].map(item => <span key={item}><ShieldCheck/>{item}</span>)}</div><div className="p-button-row"><Btn disabled={!name.trim() || !selectedBlocks.length} onClick={save}><Plus/>Save Draft Widget</Btn>{onAddToLayout && <Btn variant="outline" disabled={!saved} onClick={onAddToLayout}>Add To Layout</Btn>}{onOpenEditor && <Btn variant="outline" onClick={onOpenEditor}>Open Canvas Library</Btn>}</div></aside></div>
  </section>;
}

const logoRoles = ["Primary Header Logo", "Auth Card Logo", "Hero Logo", "Corner Mark", "Background Watermark", "Subtle Footer Logo"];
const logoEffects = ["None", "Float", "Gentle Pulse", "Breathing Glow", "Light Sweep", "Reveal", "Parallax", "Hover Lift", "Depth Tilt", "Shimmer", "Particle Halo", "Custom"];
export function BrandStudioPanel() {
  const [role, setRole] = useState(logoRoles[0]);
  const [size, setSize] = useState(148), [x, setX] = useState(6), [y, setY] = useState(7), [opacity, setOpacity] = useState(100), [glow, setGlow] = useState(30);
  const [plate, setPlate] = useState("Glass"), [effect, setEffect] = useState("Breathing Glow"), [breakpoint, setBreakpoint] = useState("Desktop"), [saved, setSaved] = useState(false);
  function save() { const value = { version: 23, approvedAsset: "/brand-assets/logo.svg", role, breakpoint, layout: { x, y, size }, opacity, plate, glow, effect, reducedMotion: "MANDATORY" }; localStorage.setItem(BRAND_STUDIO_STORAGE, JSON.stringify(value)); setSaved(true); toast.success("Approved logo object saved to the local theme draft."); }
  function reset() { setSize(148); setX(6); setY(7); setOpacity(100); setGlow(30); setPlate("Glass"); setEffect("None"); setSaved(false); }
  return <section className="s21-panel" data-studio-surface="Logo & Brand Studio" data-brand-saved={saved ? "true" : "false"}>
    <header><div><span className="p-kicker">LOGO & BRAND</span><h2>The approved Daenem mark is a governed design object.</h2><p>Place, size, layer and animate approved logo instances independently for Mobile, Tablet, Desktop and 4K.</p></div><Badge>APPROVED ASSETS ONLY</Badge></header>
    <div className="s21-brand-grid"><aside><h3>Logo Instances</h3>{logoRoles.map(item => <button key={item} className={role === item ? "active" : ""} onClick={() => { setRole(item); setSaved(false); }}><img src="/brand-assets/logo-mark.svg" alt=""/><span><b>{item}</b><small>{item === role ? "Editing now" : "Available instance"}</small></span><ChevronRight/></button>)}
<Btn variant="outline" onClick={() => { setRole("Corner Mark"); setX(82); setY(7); setSize(72); setSaved(false); toast.info("Approved Corner Mark instance added to this local draft."); }}><Plus/>Add Approved Instance</Btn>
</aside><main><div className="s21-brand-breakpoints">{["Mobile", "Tablet", "Desktop", "4K"].map(item => <button key={item} className={breakpoint === item ? "active" : ""} onClick={() => setBreakpoint(item)}>{item}</button>)}</div><div className={`s21-brand-canvas effect-${effect.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}><span>AUTHENTICATION AREA</span><figure style={{ left: `${x}%`, top: `${y}%`, width: size, opacity: opacity / 100, "--brand-glow": glow / 100 } as CSSProperties} className={`plate-${plate.toLowerCase()}`}><img src="/brand-assets/logo.svg" alt="Daenem approved logo"/><i/><i/></figure><div className="s21-brand-gridlines"/></div></main><aside className="s21-brand-inspector"><h3>Object Inspector</h3><Pick label="Instance" value={role} onChange={value => { setRole(value); setSaved(false); }} options={logoRoles}/>{[["X Position", x, setX, 0, 90], ["Y Position", y, setY, 0, 90], ["Size", size, setSize, 40, 320], ["Opacity", opacity, setOpacity, 10, 100], ["Glow", glow, setGlow, 0, 100]].map(([label, value, setter, min, max]) => <label className="p-field" key={String(label)}>{String(label)} <output>{String(value)}{label === "Size" ? "px" : "%"}</output><input type="range" min={Number(min)} max={Number(max)} value={Number(value)} onChange={event => { (setter as (value: number) => void)(Number(event.target.value)); setSaved(false); }}/></label>)}<Pick label="Background Plate" value={plate} onChange={value => { setPlate(value); setSaved(false); }} options={["None", "Solid", "Glass"]}/><Pick label="Logo Motion" value={effect} onChange={value => { setEffect(value); setSaved(false); }} options={logoEffects}/>
<div className="s21-object-actions"><button onClick={() => { setX(value => Math.min(90, value + 4)); setY(value => Math.min(90, value + 4)); setSaved(false); }}><Copy/>Duplicate</button><button onClick={() => { setGlow(value => Math.min(100, value + 10)); setSaved(false); }}><Layers3/>Layer Forward</button><button onClick={() => { setX(50); setSaved(false); }}><Move/>Align Center</button><button onClick={reset}><RotateCcw/>Reset</button></div>
<Btn onClick={save}><Check/>Save Brand Object</Btn></aside></div>
  </section>;
}

const promptTemplates = ["Make this more futuristic.", "Give this widget four alternatives.", "Make this mobile layout cleaner.", "Improve readability.", "Create an executive weather treatment.", "Make the logo glow subtly.", "Reduce visual clutter.", "Make Gallery clearly different from Panorama."];
const prohibitedPromptRules: Array<[RegExp, string]> = [
  [/remove\s+authentication|hide\s+authentication|bypass\s+auth/i, "Authentication is mandatory and cannot be removed or hidden."],
  [/restricted\s+(employee|staff)\s+data|private\s+employee|show\s+employee\s+records/i, "Restricted employee data cannot enter a pre-authentication design."],
  [/publish\s+automatically|auto[- ]?publish|publish\s+without/i, "The Copilot never publishes. Owner review and an explicit local action remain required."],
  [/insert\s+(javascript|js)|<script|executable\s+(html|code)|arbitrary\s+html/i, "Executable code and arbitrary HTML are not permitted in governed design proposals."],
  [/expose\s+(an?\s+)?api\s*key|secret\s*(api)?\s*key|reveal\s+secrets?/i, "Secrets and API keys are never accepted by the design surface."],
];
export function AIDesignCopilotPanel() {
  const [prompt, setPrompt] = useState(promptTemplates[0]);
  const [proposalSeed, setProposalSeed] = useState(0);
  const [state, setState] = useState<"READY" | "PROPOSED" | "ACCEPTED" | "REJECTED" | "BLOCKED">("READY");
  const [guardrailMessage, setGuardrailMessage] = useState("");
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [previousActiveDraft, setPreviousActiveDraft] = useState<string | null>(null);
  const aiAppliedRef = useRef(false);
  const proposal = useMemo(() => ({ title: prompt.includes("mobile") ? "Mobile clarity pass" : prompt.includes("logo") ? "Subtle brand light" : "Futuristic hierarchy pass", changes: prompt.includes("mobile") ? ["Move authentication to first priority", "Aggregate secondary context", "Increase helper copy to 14px", "Preserve six-city access"] : prompt.includes("logo") ? ["Set Breathing Glow to 22%", "Keep approved asset unchanged", "Disable loop under reduced motion", "Preserve responsive position"] : ["Increase background clarity", "Strengthen clock anchor", "Open intelligence spacing", "Shift decorative green to cyan"], seed: proposalSeed }), [prompt, proposalSeed]);
  const acceptedStyle = useMemo(() => prompt.includes("logo") ? { logoGlow: 22 } : prompt.includes("mobile") ? { mobileDensity: "Comfortable", authPriority: 1 } : { backgroundClarity: 68, clockScale: 1.12 }, [prompt]);
  function propose() {
    const blocked = prohibitedPromptRules.find(([rule]) => rule.test(prompt));
    if (blocked) {
      setGuardrailMessage(blocked[1]);
      setState("BLOCKED");
      toast.error("The request was blocked by the Sign-In security envelope.");
      return;
    }
    setGuardrailMessage("");
    setState("PROPOSED");
    toast.info("A governed local design proposal is ready. Nothing was published.");
  }
  function validateProposalConfig(candidate: Record<string, unknown>) { const widgets = candidate.widgets; return candidate.authenticationVisible === true && Array.isArray(widgets) && widgets.includes("authentication") && candidate.securityClassification === "PUBLIC_SAFE" && candidate.publication === "NONE" && candidate.rbacMutation === false && candidate.executableCode === false && candidate.privateData === false && candidate.backendOperation === false; }
  useEffect(() => {
    if (state === "ACCEPTED" && !aiAppliedRef.current) {
      const applied = applyAiProposalToActiveDraft({ appliedStyle: acceptedStyle });
      setPreviousActiveDraft(applied.before);
      aiAppliedRef.current = true;
    } else if (state === "PROPOSED" && aiAppliedRef.current) {
      restoreActiveDraft(previousActiveDraft);
      setPreviousActiveDraft(null);
      aiAppliedRef.current = false;
    } else if (state !== "ACCEPTED" && state !== "PROPOSED") {
      aiAppliedRef.current = false;
    }
  }, [acceptedStyle, previousActiveDraft, state]);
  function accept() { const candidate = { version: 23, prompt, proposal, authenticationVisible: true, widgets: ["authentication", "primaryLocation", "worldClockGrid"], securityClassification: "PUBLIC_SAFE", publication: "NONE", rbacMutation: false, executableCode: false, privateData: false, backendOperation: false, appliedStyle: prompt.includes("logo") ? { logoGlow: 22 } : prompt.includes("mobile") ? { mobileDensity: "Comfortable", authPriority: 1 } : { backgroundClarity: 68, clockScale: 1.12 } }; if (!validateProposalConfig(candidate)) { setState("BLOCKED"); setGuardrailMessage("The resulting declarative configuration violated an immutable Sign-In invariant."); return; } const prior = localStorage.getItem(AI_PROPOSAL_STORAGE); setPreviousDraft(prior); localStorage.setItem(AI_PROPOSAL_STORAGE, JSON.stringify({ ...candidate, acceptedAt: new Date().toISOString() })); window.dispatchEvent(new CustomEvent("daenem-ai-design-accepted", { detail: candidate })); setState("ACCEPTED"); toast.success("Proposal applied to the actual local draft. Public Sign-In remains unchanged."); }
  function undoAccepted() { if (previousDraft === null) localStorage.removeItem(AI_PROPOSAL_STORAGE); else localStorage.setItem(AI_PROPOSAL_STORAGE, previousDraft); window.dispatchEvent(new CustomEvent("daenem-ai-design-undone")); setState("PROPOSED"); toast.success("Accepted AI draft change undone."); }
  return <section className="s21-panel" data-studio-surface="AI Design Copilot" data-ai-proposal-state={state} data-ai-active-draft={state === "ACCEPTED" ? "changed" : "unchanged"} data-ai-security="governed" data-ai-publication="none">
    <header><div><span className="p-kicker">AI DESIGN COPILOT / GOVERNED LOCAL SIMULATION</span><h2>Ask for a direction. Approve every change.</h2><p>The Copilot generates safe declarative proposals with before/after preview. It cannot publish, remove authentication or change access control.</p></div><Badge>NEVER AUTO-PUBLISHES</Badge></header>
    <div className="s21-ai-grid"><aside><div className="s21-ai-orb"><Bot/><i/><i/><i/></div><h3>What should improve?</h3><textarea aria-label="AI design request" value={prompt} onChange={event => { setPrompt(event.target.value.replace(/[<>]/g, "").slice(0, 240)); setState("READY"); setGuardrailMessage(""); }}/><div className="s21-prompt-chips">{promptTemplates.map(item => <button key={item} onClick={() => { setPrompt(item); setState("READY"); setGuardrailMessage(""); }}>{item}</button>)}</div><Btn onClick={propose}><WandSparkles/>Generate Proposal</Btn></aside><main><header><span><small>{state === "BLOCKED" ? "GOVERNANCE BLOCK" : "PROPOSED CHANGE"}</small><h3>{state === "READY" ? "Waiting for a design request" : state === "BLOCKED" ? "Request blocked safely" : proposal.title}</h3></span><Badge>{state}</Badge></header><div className="s21-before-after"><article><small>BEFORE</small><div className="s21-ai-preview before"><i/><i/><i/><b>Current</b></div></article><article><small>AFTER</small><div className={`s21-ai-preview after ${state === "ACCEPTED" ? "accepted" : ""}`}><i/><i/><i/><b>{state === "READY" ? "Preview" : state === "BLOCKED" ? "No change" : "Proposed"}</b></div></article></div>{state === "BLOCKED" && <Callout tone="neutral" title="Safe rejection">{guardrailMessage} SITES AI DESIGN SIMULATION · PRODUCTION AI INTEGRATION PENDING.</Callout>}{state !== "READY" && state !== "BLOCKED" && <ul>{proposal.changes.map(item => <li key={item}><Check/>{item}</li>)}</ul>}
<div className="s21-ai-actions"><Btn disabled={state === "READY" || state === "BLOCKED" || state === "ACCEPTED"} onClick={accept}><Check/>Accept</Btn>{state === "ACCEPTED" && <Btn variant="outline" onClick={undoAccepted}><RotateCcw/>Undo Accepted Change</Btn>}<Btn disabled={state === "READY" || state === "BLOCKED"} variant="outline" onClick={() => setState("READY")}><Sparkles/>Modify</Btn><Btn disabled={state === "READY" || state === "BLOCKED"} variant="outline" onClick={() => { setProposalSeed(value => value + 1); setState("PROPOSED"); }}><RefreshCw/>Regenerate</Btn><Btn disabled={state === "READY" || state === "BLOCKED"} variant="outline" onClick={() => setState("REJECTED")}><CircleX/>Reject</Btn></div></main><aside className="s21-ai-guardrails"><ShieldCheck/><h3>Fixed security boundary</h3>{["Authentication cannot be removed", "No RBAC or access changes", "No restricted pre-auth data", "No JavaScript or executable HTML", "No secrets or arbitrary backend calls", "Owner acceptance required", "Preview never changes public Sign-In"].map(item => <span key={item}><Check/>{item}</span>)}</aside></div>
  </section>;
}
