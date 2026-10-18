"use client";

import { useMemo, useState } from "react";
import {
  MessageSquareText,
  MessageCircle,
  Mail,
  Send,
  ShieldCheck,
  Sparkles,
  Clock3,
  Tag,
  UserRoundCheck,
  AlertTriangle,
  CheckCircle2,
  Building2,
  WalletCards,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  RefreshCw,
  BadgeCheck,
  Users,
  FileChartColumn,
  ScanLine,
  LockKeyhole,
  CalendarClock,
  CircleDollarSign,
  ReceiptText,
  Activity,
  ChevronRight,
  Search,
  ListFilter,
  Smartphone,
  History,
  WandSparkles,
  Gauge,
  TrendingUp,
  Network,
  type LucideIcon,
} from "lucide-react";
import { useLab } from "./lab-context";
import {
  byId,
  canAct,
  canView,
  money,
  personFor,
  recordsFor,
  type ModuleDef,
  type RecordData,
} from "./model";
import {
  Panel,
  Badge,
  Metric,
  Btn,
  Callout,
  Pick,
  Steps,
  Timeline,
  DownloadCSV,
  Empty,
  Bars,
} from "./ui";
import "./enterprise-operations.css";
import { payrollOperationsTruth } from "./payroll-operations-truth";
import {
  communicationReplyTruth,
  formatStaffReplyAt,
} from "./communications-truth";

const communicationTabs = [
  ["customer-communications", "Conversation"],
  ["communication-queues", "Queues"],
  ["whatsapp-numbers", "Numbers"],
  ["communication-analytics", "Analytics"],
  ["communication-preferences", "Consent"],
  ["communication-automation", "Automation"],
  ["communication-templates", "Templates"],
  ["letterheads", "Letterheads"],
  ["ai-letterhead-generator", "AI Letterhead"],
  ["communication-audit", "Audit"],
  ["unified-inbox", "Unified Inbox"],
] as const;
const communicationSignatures: Record<
  string,
  { kicker: string; title: string; description: string }
> = {
  "customer-communications": {
    kicker: "CONVERSATION CONTROL TOWER",
    title: "Every Conversation, Connected to the Work.",
    description:
      "Three-pane customer context, governed replies and delivery state for assigned conversations.",
  },
  "communication-queues": {
    kicker: "QUEUE AND ASSIGNMENT",
    title: "Route Demand Before It Becomes Delay.",
    description:
      "Resolve company, site, number, priority and workload before assigning the accountable team.",
  },
  "whatsapp-numbers": {
    kicker: "WHATSAPP NUMBER INFRASTRUCTURE",
    title: "Business Numbers With Explicit Scope.",
    description:
      "A provider-ready registry for company, site, queue, business hours, fallback and health.",
  },
  "communication-analytics": {
    kicker: "DELIVERY OBSERVATORY",
    title: "See Reach, Response and Queue Pressure.",
    description:
      "Truth-labelled fixture analytics for sent, delivered, read, failed, unread and response time.",
  },
  "communication-preferences": {
    kicker: "CUSTOMER PREFERENCE DESK",
    title: "Consent Is a Delivery Decision.",
    description:
      "Customer-level purpose, channel, opt-out and effective-date controls applied before send.",
  },
  "communication-automation": {
    kicker: "AUTOMATION STUDIO",
    title: "Authoritative Events, Governed Delivery.",
    description:
      "Each event automation has independent templates, consent, business hours and idempotency.",
  },
  "communication-templates": {
    kicker: "MESSAGE DESIGN SYSTEM",
    title: "Reusable Language With Human Control.",
    description:
      "Company-aware WhatsApp and email templates retain version, channel and approval identity.",
  },
  letterheads: {
    kicker: "BRAND DOCUMENT STUDIO",
    title: "Approved Identity Across Every Document.",
    description:
      "Govern invoice, receipt, statement and customer communication presentation by company.",
  },
  "ai-letterhead-generator": {
    kicker: "AI LETTERHEAD GENERATOR",
    title: "Design Assistance Without Invented Facts.",
    description:
      "Generate structure from approved assets, then review, edit, approve and publish deliberately.",
  },
  "communication-audit": {
    kicker: "COMMUNICATION LIFECYCLE",
    title: "Every Decision Leaves Accountable Evidence.",
    description:
      "Inspect assignment, drafting, approval, provider state, consent decisions and delivery changes.",
  },
  "unified-inbox": {
    kicker: "OMNICHANNEL OPERATIONS CENTER",
    title: "One Contract, Multiple Approved Channels.",
    description:
      "A future-ready inbox shell over existing customer, order, invoice and payment truth.",
  },
};
const financeTabs = [
  ["banking-operations", "Accounts"],
  ["treasury", "Treasury"],
  ["payment-verification", "Verification"],
  ["transfers", "Transfers"],
  ["beneficiaries", "Beneficiaries"],
  ["payroll-execution", "Payroll"],
  ["reconciliation", "Reconciliation"],
  ["financial-reports", "Reports"],
] as const;

function ProductIcon({
  kind,
}: {
  kind: "communication" | "banking" | "ai" | "live" | "approval";
}) {
  const Icon =
    kind === "communication"
      ? MessageSquareText
      : kind === "banking"
        ? Landmark
        : kind === "ai"
          ? Sparkles
          : kind === "approval"
            ? BadgeCheck
            : Activity;
  return (
    <span className={`eo-icon eo-icon-${kind}`} aria-hidden="true">
      <Icon size={20} />
      <i />
    </span>
  );
}
function TruthStrip() {
  return (
    <div className="eo-truth">
      <ShieldCheck size={15} />
      <span>
        Design lab · Fictional records · No provider connected · No message sent
        · No money moved
      </span>
    </div>
  );
}
function ModuleTabs({
  items,
  active,
  onChange,
}: {
  items: readonly (readonly [string, string])[];
  active: string;
  onChange: (id: string) => void;
}) {
  const { session } = useLab();
  const allowed = items.filter(([id]) => canView(byId(id), session));
  return (
    <nav className="eo-tabs" aria-label="Workspace sections">
      {allowed.map(([id, label]) => (
        <button
          key={id}
          className={active === id ? "active" : ""}
          onClick={() => onChange(id)}
        >
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
function visibleRecords(id: string) {
  return id;
}

export function CustomerCommunicationCenter({ module }: { module: ModuleDef }) {
  const lab = useLab();
  const initial = communicationTabs.some(([id]) => id === module.id)
    ? module.id
    : "customer-communications";
  const [tab, setTab] = useState(initial);
  const allowedTabs = communicationTabs.filter(([id]) =>
    canView(byId(id), lab.session),
  );
  const activeTab = allowedTabs.some(([id]) => id === tab)
    ? tab
    : allowedTabs[0]?.[0];
  const get = (id: string) => {
    const m = byId(id);
    return m && canView(m, lab.session)
      ? recordsFor(lab.records, m, lab.session)
      : [];
  };
  if (!activeTab)
    return (
      <Empty
        title="No assigned communication workspace"
        message="No communication surface is available in the current scope."
      />
    );
  const current = byId(activeTab);
  const rows = current ? get(activeTab) : [];
  const signature = communicationSignatures[activeTab];
  const actionFingerprint = current
    ? [
        "generateCommunication",
        "sendCommunication",
        "approveCommunication",
        "manageCommunications",
        "manageTemplates",
      ]
        .map((action) => (canAct(current, lab.session, action) ? "1" : "0"))
        .join("")
    : "";
  const workspaceStateKey = `${lab.session.personId}:${lab.session.company}:${activeTab}:${actionFingerprint}:${rows.map((row) => row.id).join(",")}`;
  const canReadConversations = canView(
    byId("customer-communications"),
    lab.session,
  );
  const canReadProviderState = canView(byId("whatsapp-numbers"), lab.session);
  return (
    <div className={`eo-shell eo-communications eo-comm-${activeTab}`}>
      <header className="eo-hero">
        <div>
          <ProductIcon kind="communication" />
          <span className="p-kicker">{signature.kicker}</span>
          <h2>{signature.title}</h2>
          <p>{signature.description}</p>
        </div>
        {(canReadConversations || canReadProviderState) && (
          <div className="eo-hero-metrics">
            {canReadConversations && (
              <>
                <Metric
                  label="Authorized conversations"
                  value={String(get("customer-communications").length)}
                />
                <Metric
                  label="Unread in scope"
                  value={String(
                    get("customer-communications").reduce(
                      (n, r) => n + Number(r.fields.Unread || 0),
                      0,
                    ),
                  )}
                />
                <Metric
                  label="Waiting For Staff"
                  value={String(
                    get("customer-communications").filter(
                      (record) =>
                        communicationReplyTruth(record).state ===
                        "waiting_for_staff",
                    ).length,
                  )}
                  detail="Separate from unread"
                />
              </>
            )}
            {canReadProviderState && (
              <Metric
                label="Provider state"
                value="UNAVAILABLE"
                detail="No live provider is connected to QA"
              />
            )}
          </div>
        )}
      </header>
      <TruthStrip />
      <ModuleTabs items={allowedTabs} active={activeTab} onChange={setTab} />
      {activeTab === "customer-communications" ? (
        <ConversationDesk
          key={workspaceStateKey}
          rows={rows}
          module={current!}
        />
      ) : activeTab === "communication-queues" ? (
        <QueueDesk rows={rows} />
      ) : activeTab === "whatsapp-numbers" ? (
        <NumberRegistry rows={rows} />
      ) : activeTab === "communication-analytics" ? (
        <CommunicationAnalytics rows={rows} />
      ) : activeTab === "communication-preferences" ? (
        <PreferenceDesk rows={rows} />
      ) : activeTab === "communication-automation" ? (
        <AutomationDesk key={workspaceStateKey} rows={rows} module={current!} />
      ) : activeTab === "communication-templates" ? (
        <TemplateDesk
          key={workspaceStateKey}
          rows={rows}
          module={current!}
          letterhead={false}
        />
      ) : activeTab === "letterheads" ? (
        <TemplateDesk
          key={workspaceStateKey}
          rows={rows}
          module={current!}
          letterhead
        />
      ) : activeTab === "ai-letterhead-generator" ? (
        <AiLetterheadDesk
          key={workspaceStateKey}
          rows={rows}
          module={current!}
        />
      ) : activeTab === "communication-audit" ? (
        <CommunicationAudit rows={rows} />
      ) : (
        <UnifiedInbox rows={rows} />
      )}
    </div>
  );
}

function ConversationDesk({
  rows,
  module,
}: {
  rows: RecordData[];
  module: ModuleDef;
}) {
  const { session, notice, audit } = useLab();
  const [selected, setSelected] = useState(rows[0]?.id || "");
  const [queue, setQueue] = useState("All queues");
  const [channel, setChannel] = useState("All channels");
  const [replyState, setReplyState] = useState("All reply states");
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState(0);
  const [internal, setInternal] = useState("");
  const filtered = rows.filter(
    (r) =>
      (queue === "All queues" || r.fields.Queue === queue) &&
      (channel === "All channels" || r.fields.Channel === channel) &&
      (replyState === "All reply states" ||
        (replyState === "Waiting For Staff" &&
          communicationReplyTruth(r).state === "waiting_for_staff") ||
        (replyState === "No staff reply due" &&
          communicationReplyTruth(r).state === "no_staff_reply_due")),
  );
  const row = filtered.find((r) => r.id === selected) || filtered[0];
  const canGenerate = canAct(module, session, "generateCommunication"),
    canSend = canAct(module, session, "sendCommunication"),
    canApprove = canAct(module, session, "approveCommunication");
  const canNote = canAct(module, session, "edit");
  const safeDraft = row
    ? `Hello ${row.fields.Customer === "Unknown customer" ? "there" : row.fields.Customer}, thank you for your message about ${row.fields["Related Record"]}. We are reviewing the authorized record and will respond with confirmed information.`
    : "";
  const resetComposer = () => {
    setStage(0);
    setDraft("");
    setInternal("");
  };
  const changeQueue = (value: string) => {
    setQueue(value);
    setSelected("");
    resetComposer();
  };
  const changeChannel = (value: string) => {
    setChannel(value);
    setSelected("");
    resetComposer();
  };
  const changeReplyState = (value: string) => {
    setReplyState(value);
    setSelected("");
    resetComposer();
  };
  const rewrite = () => {
    if (!canGenerate) return;
    if (!draft.trim())
      return notice("Generate or enter a draft before rewriting");
    setDraft(
      draft.replace("We are reviewing", "Our assigned team is reviewing"),
    );
    notice("AI rewrite simulated locally; approval is still required");
  };
  const advance = () => {
    if (!row) return;
    if (stage === 0) {
      if (canGenerate) setDraft(safeDraft);
      else if (!canSend || !draft.trim()) return;
      setStage(1);
      notice(canGenerate ? "Draft generated for review" : "Reply ready for preview");
    } else if (stage === 1) {
      if (!canSend || !draft.trim()) return;
      setStage(2);
      notice("Draft moved to edit");
    } else if (stage === 2 && canApprove) {
      setStage(3);
      audit(
        "Communication approved",
        row?.module + ":" + row?.id,
        "Manual customer reply approved after preview and edit",
      );
    } else if (stage === 3 && canSend) {
      setStage(4);
      audit(
        "Communication send simulated",
        row?.module + ":" + row?.id,
        "Provider unavailable; no message sent",
      );
      notice("Send recorded as a local simulation");
    }
  };
  if (!rows.length)
    return (
      <Empty
        title="No authorized conversations"
        message="This queue has no records in the current assignment scope."
      />
    );
  return (
    <>
      <div className="eo-filterbar">
        <Pick
          label="Queue"
          value={queue}
          onChange={changeQueue}
          options={["All queues", ...new Set(rows.map((r) => r.fields.Queue))]}
        />
        <Pick
          label="Channel"
          value={channel}
          onChange={changeChannel}
          options={[
            "All channels",
            ...new Set(rows.map((r) => r.fields.Channel)),
          ]}
        />
        <Pick
          label="Reply status"
          value={replyState}
          onChange={changeReplyState}
          options={[
            "All reply states",
            "Waiting For Staff",
            "No staff reply due",
          ]}
        />
        <span className="eo-provider">
          <ProductIcon kind="live" /> Provider adapter <b>UNAVAILABLE</b>
        </span>
      </div>
      <div className="eo-inbox">
        <Panel
          className="eo-conversation-list"
          title="Assigned queues"
          kicker="WHATSAPP FIRST · EMAIL READY"
        >
          {filtered.map((r) => {
            const replyTruth = communicationReplyTruth(r);
            return (
            <button
              key={r.id}
              className={
                (row?.id === r.id ? "active " : "") + "eo-conversation"
              }
              onClick={() => {
                setSelected(r.id);
                resetComposer();
              }}
            >
              <span className="eo-channel">
                {r.fields.Channel === "WhatsApp" ? (
                  <MessageCircle size={17} />
                ) : (
                  <Mail size={17} />
                )}
              </span>
              <span>
                <strong>{r.fields.Customer}</strong>
                <small>
                  {r.fields.Queue} · {r.fields.Priority}
                </small>
                <em>{r.fields["Last Message"]}</em>
              </span>
              <span>
                <Badge>{r.status}</Badge>
                {replyTruth.state === "waiting_for_staff" && (
                  <Badge tone="amber">Waiting For Staff</Badge>
                )}
                <small>{r.fields.Unread} unread</small>
              </span>
            </button>
            );
          })}
        </Panel>
        {row && (() => {
          const replyTruth = communicationReplyTruth(row);
          const lastStaffReplyAt = formatStaffReplyAt(
            replyTruth.lastStaffReplyAt,
            session,
          );
          const customerMessage = (
            <article className="incoming">
              <small>Latest customer message</small>
              <p>{row.fields["Last Message"]}</p>
              <span>Received · fixture</span>
            </article>
          );
          const staffMessage = lastStaffReplyAt ? (
            <article className="outgoing">
              <small>Last staff reply · {lastStaffReplyAt}</small>
              <p>Thank you. We are reviewing the linked authorized record.</p>
              <span>Staff reply · fixture</span>
            </article>
          ) : null;
          return (
          <Panel className="eo-thread">
            <header className="eo-thread-head">
              <div>
                <span className="p-kicker">
                  {row.fields.Channel} · {row.fields.Company}
                </span>
                <h3>{row.fields.Customer}</h3>
                <p>
                  {row.fields["Business Number"]} · {row.fields.Site}
                </p>
              </div>
              <Badge>{row.fields["Delivery State"]}</Badge>
            </header>
            <div className="eo-context-ribbon">
              <span>
                <Building2 size={14} />
                {row.fields.Company}
              </span>
              <span>
                <ReceiptText size={14} />
                {row.fields["Related Record"]}
              </span>
              <span>
                <UserRoundCheck size={14} />
                {row.fields.Assignee}
              </span>
              <span>
                <Tag size={14} />
                {row.fields.Priority}
              </span>
              {replyTruth.state === "waiting_for_staff" && (
                <span className="eo-reply-due">
                  <Clock3 size={14} />
                  Waiting For Staff
                </span>
              )}
            </div>
            <div className="eo-messages" aria-label="Conversation messages">
              {replyTruth.state === "waiting_for_staff" && staffMessage}
              {customerMessage}
              {replyTruth.state !== "waiting_for_staff" && staffMessage}
            </div>
            {(canGenerate || canSend) && (
              <div className="eo-composer">
                <label className="p-field">
                  Approved customer reply
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    readOnly={!canSend}
                    placeholder="Generate a governed draft or write a reply…"
                  />
                </label>
                {canGenerate && (
                  <div
                    className="eo-ai-actions"
                    aria-label="Governed AI assistance"
                  >
                    <button onClick={rewrite}>
                      <WandSparkles size={14} />
                      Rewrite
                    </button>
                    <button
                      onClick={() => {
                        if (!canGenerate) return;
                        setInternal(`Summary: ${row.fields["Last Message"]}`);
                        notice("AI summary simulated for internal review");
                      }}
                    >
                      <Sparkles size={14} />
                      Summarize
                    </button>
                    <button
                      onClick={() => {
                        if (!canGenerate) return;
                        notice(
                          "Suggested next action: verify the linked record, then draft a scoped reply",
                        );
                      }}
                    >
                      <ChevronRight size={14} />
                      Suggest next action
                    </button>
                  </div>
                )}
                <div className="eo-compose-meta">
                  <span>Consent: {row.fields.Consent}</span>
                  <span>Opt-out: {row.fields["Opt Out"]}</span>
                </div>
                <Steps
                  steps={[
                    canGenerate ? "Generate" : "Draft",
                    "Preview",
                    "Edit",
                    "Approve",
                    "Send",
                  ]}
                  current={stage}
                />
                <div className="p-button-row">
                  <Btn variant="outline" onClick={resetComposer}>
                    Reset
                  </Btn>
                  {((stage === 0 && (canGenerate || canSend)) ||
                    (stage === 1 && canSend) ||
                    (stage === 2 && canApprove) ||
                    (stage === 3 && canSend)) && (
                    <Btn
                      disabled={stage === 0 && !canGenerate && !draft.trim()}
                      onClick={advance}
                    >
                      {stage === 0
                        ? canGenerate
                          ? "Generate draft"
                          : "Preview reply"
                        : stage === 1
                          ? "Preview complete"
                          : stage === 2
                            ? "Approve reply"
                            : stage === 3
                              ? "Send through provider"
                              : "Simulated only"}
                      <ChevronRight size={16} />
                    </Btn>
                  )}
                </div>
                {stage === 4 && (
                  <Callout tone="neutral" title="No external send occurred">
                    The provider adapter is unavailable in Sites. The audited
                    fixture records a send simulation only.
                  </Callout>
                )}
              </div>
            )}
          </Panel>
          );
        })()}
        <aside className="eo-context">
          <Panel title="Customer & ERP context">
            <dl>
              <div>
                <dt>Customer</dt>
                <dd>{row?.fields.Customer}</dd>
              </div>
              <div>
                <dt>Related record</dt>
                <dd>{row?.fields["Related Record"]}</dd>
              </div>
              <div>
                <dt>Company / site</dt>
                <dd>
                  {row?.fields.Company} · {row?.fields.Site}
                </dd>
              </div>
              <div>
                <dt>Provider message ID</dt>
                <dd>{row?.fields["Provider Message ID"]}</dd>
              </div>
            </dl>
            <Callout tone="neutral" title="Zero disclosure">
              This context was projected from authorized conversation records.
              Unassigned customer and ERP data is absent.
            </Callout>
          </Panel>
          {canNote && (
            <Panel title="Internal note">
              <label className="p-field">
                Visible to assigned staff only
                <textarea
                  value={internal}
                  onChange={(e) => setInternal(e.target.value)}
                />
              </label>
              <Btn
                disabled={!internal.trim()}
                variant="outline"
                onClick={() => {
                  if (!canNote) return;
                  notice("Internal note saved locally");
                  setInternal("");
                }}
              >
                Save internal note
              </Btn>
            </Panel>
          )}
          <Panel title="Exception handling">
            <div className="eo-mini-list">
              {[
                "Unknown customer → triage",
                "Duplicate webhook → ignored",
                "Provider outage → retry queue",
                "Expired session → approved template",
                "Attachment failure → safe retry",
                "Opt-out → suppress outreach",
                "After-hours → scheduled queue",
              ].map((v) => (
                <span key={v}>
                  <AlertTriangle size={14} />
                  {v}
                </span>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function QueueDesk({ rows }: { rows: RecordData[] }) {
  const [queue, setQueue] = useState(rows[0]?.id || "");
  const r = rows.find((x) => x.id === queue) || rows[0];
  return (
    <div className="eo-grid">
      <Panel title="Queue & assignment workspace" kicker="AUTHORIZED ROUTING">
        {rows.map((x) => (
          <button
            className={`eo-route-card ${x.id === r?.id ? "active" : ""}`}
            key={x.id}
            onClick={() => setQueue(x.id)}
          >
            <span>
              <Network size={18} />
              <strong>{x.fields.Queue}</strong>
            </span>
            <small>
              {x.fields.Company} · {x.fields.Site}
            </small>
            <Badge>{x.status}</Badge>
          </button>
        ))}
      </Panel>
      {r && (
        <Panel title="Routing controls">
          <dl className="eo-facts">
            {Object.entries(r.fields).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="eo-assignment-rail">
            <span>Inbound verified</span>
            <span>Scope resolved</span>
            <span>Queue selected</span>
            <span>Agent assigned</span>
            <span>Escalation monitored</span>
          </div>
          <Callout tone="neutral" title="Server-side delivery">
            Provider verification, duplicate prevention, assignment and
            escalation remain production adapter responsibilities.
          </Callout>
        </Panel>
      )}
    </div>
  );
}

function NumberRegistry({ rows }: { rows: RecordData[] }) {
  return (
    <>
      <div className="eo-metric-grid four">
        <Metric label="Authorized number slots" value={String(rows.length)} />
        <Metric
          label="Configured fixtures"
          value={String(rows.filter((r) => r.status === "Configured").length)}
        />
        <Metric
          label="Verification required"
          value={String(
            rows.filter((r) => r.status === "Verification Required").length,
          )}
        />
        <Metric
          label="Provider sessions"
          value="0"
          detail="No QR or personal phones"
        />
      </div>
      <div className="eo-number-grid">
        {rows.map((r) => (
          <Panel key={r.id} title={r.title} kicker={r.fields.Company}>
            <div className="eo-number-mark">
              <Smartphone size={28} />
              <span>
                <strong>{r.fields["Business Number"]}</strong>
                <small>{r.fields.Site}</small>
              </span>
              <Badge>{r.status}</Badge>
            </div>
            <dl className="eo-facts">
              {[
                "Provider",
                "Queue",
                "Business Hours",
                "Health",
                "Scope",
                "Fallback",
              ].map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{r.fields[k]}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        ))}
      </div>
      <Callout tone="neutral" title="Official provider architecture only">
        No personal-phone session, QR login, browser automation or frontend
        provider secret is supported.
      </Callout>
    </>
  );
}

function CommunicationAnalytics({ rows }: { rows: RecordData[] }) {
  const r = rows[0];
  if (!r) return <Empty />;
  const stats = ["Sent", "Queued", "Delivered", "Read", "Failed", "Unread"];
  return (
    <>
      <div className="eo-metric-grid six">
        {stats.map((k) => (
          <Metric key={k} label={k} value={r.fields[k]} />
        ))}
      </div>
      <div className="eo-grid">
        <Panel title="Delivery & read funnel" kicker="ILLUSTRATIVE FIXTURE">
          <Bars
            items={[
              ["Sent", Number(r.fields.Sent)],
              ["Delivered", Number(r.fields.Delivered)],
              ["Read", Number(r.fields.Read)],
              ["Feedback", Number(r.fields.Feedback)],
            ]}
          />
          <Callout tone="neutral" title="Fixture analytics">
            No production provider analytics are connected. Counts demonstrate
            the scoped operating model only.
          </Callout>
        </Panel>
        <Panel title="Service pressure">
          <div className="eo-radar">
            <Gauge size={42} />
            <strong>{r.fields["Queue Pressure"]}</strong>
            <small>
              Queue pressure · {r.fields["Response Time"]} response time
            </small>
          </div>
          <div className="eo-mini-list">
            <span>
              Unread <b>{r.fields.Unread}</b>
            </span>
            <span>
              Complaints <b>{r.fields.Complaints}</b>
            </span>
            <span>
              Feedback <b>{r.fields.Feedback}</b>
            </span>
            <span>
              Channel mix <b>{r.fields.Channel}</b>
            </span>
          </div>
        </Panel>
      </div>
    </>
  );
}

function PreferenceDesk({ rows }: { rows: RecordData[] }) {
  return (
    <div className="eo-grid">
      <Panel
        title="Customer communication preferences"
        kicker="EXISTING CUSTOMER IDENTITY"
      >
        {rows.map((r) => (
          <article className="eo-preference" key={r.id}>
            <header>
              <UserRoundCheck size={19} />
              <div>
                <strong>{r.fields.Customer}</strong>
                <small>
                  {r.fields.Company} · {r.fields.Channel}
                </small>
              </div>
              <Badge>{r.status}</Badge>
            </header>
            <p>
              {r.fields["Consent Basis"]} · Opt-out: {r.fields["Opt Out"]}
            </p>
            <small>
              Effective {r.fields["Effective At"]} · {r.fields.Evidence}
            </small>
          </article>
        ))}
      </Panel>
      <Panel title="Consent & opt-out enforcement">
        <Steps
          steps={[
            "Identify customer",
            "Resolve company",
            "Read preference",
            "Apply consent basis",
            "Suppress opt-out",
            "Audit decision",
          ]}
          current={4}
        />
        <Callout title="Preference authority">
          Campaign and re-engagement messages are suppressed when consent is
          absent or an opt-out applies. Transactional service rules remain
          separately governed.
        </Callout>
      </Panel>
    </div>
  );
}

function AiLetterheadDesk({
  rows,
  module,
}: {
  rows: RecordData[];
  module: ModuleDef;
}) {
  const { session } = useLab();
  const r = rows[0];
  const [stage, setStage] = useState(0);
  const [preview, setPreview] = useState("Email");
  const canManage = canAct(module, session, "manageTemplates");
  const advance = () => {
    if (!canManage) return;
    setStage(Math.min(4, stage + 1));
  };
  if (!r) return <Empty />;
  return (
    <div className="eo-letterhead-studio">
      <Panel
        title="Admin-only AI proposal"
        kicker="APPROVED ASSETS + KNOWN FACTS"
      >
        <div className="eo-ai-prompt">
          <ProductIcon kind="ai" />
          <div>
            <strong>{r.title}</strong>
            <p>
              Propose layout, hierarchy, spacing, typography and document
              sections. Never infer bank details, tax IDs, legal addresses or
              company facts.
            </p>
          </div>
        </div>
        <dl className="eo-facts">
          {[
            "Company",
            "Approved Assets",
            "Known Facts",
            "Layout",
            "Hierarchy",
            "Spacing",
            "Typography",
            "Sections",
          ].map((k) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{r.fields[k]}</dd>
            </div>
          ))}
        </dl>
        <Steps
          steps={["Draft", "Review", "Approved", "Published", "Archived"]}
          current={stage}
        />
        {canManage && (
          <Btn disabled={stage >= 4} onClick={advance}>
            Move to{" "}
            {["Review", "Approved", "Published", "Archived", "Archived"][stage]}
          </Btn>
        )}
      </Panel>
      <Panel title="Channel preview">
        <div className="eo-preview-tabs">
          {["Email", "WhatsApp attachment", "PDF", "Print"].map((v) => (
            <button
              key={v}
              className={preview === v ? "active" : ""}
              onClick={() => setPreview(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <article
          className={`eo-letterhead-preview ${preview.toLowerCase().replaceAll(" ", "-")}`}
        >
          <small>DAENEM · APPROVED COMPANY IDENTITY</small>
          <h3>{preview} document preview</h3>
          <p>Known facts and approved company assets only.</p>
          <hr />
          <div className="eo-document-lines">
            <i />
            <i />
            <i />
            <i />
          </div>
          <footer>Draft v{r.fields.Version} · Human approval required</footer>
        </article>
        <div className="eo-version-list">
          <History size={18} />
          <span>
            <strong>v3 · Draft</strong>
            <small>Current AI-assisted proposal</small>
          </span>
          <span>
            <strong>v2 · Review</strong>
            <small>Previous human-edited version</small>
          </span>
          <span>
            <strong>v1 · Published</strong>
            <small>Approved fixture baseline</small>
          </span>
        </div>
      </Panel>
    </div>
  );
}

function CommunicationAudit({ rows }: { rows: RecordData[] }) {
  return (
    <Panel
      title="Communication audit & lifecycle"
      kicker="SCOPE-FILTERED EVENTS"
    >
      <div className="eo-audit-stream">
        {rows.map((r) => (
          <article key={r.id}>
            <span className="eo-event-dot" />
            <div>
              <strong>{r.fields.Event}</strong>
              <small>
                {r.fields.Time} · {r.fields.Actor}
              </small>
              <p>
                {r.fields["Previous Value"]} → {r.fields["New Value"]}
              </p>
            </div>
            <Badge>{r.fields["Delivery State"]}</Badge>
          </article>
        ))}
      </div>
      <div className="eo-mini-list">
        {[
          "inbound.verified",
          "webhook.duplicate_ignored",
          "conversation.assigned",
          "ai.draft.created",
          "message.approved",
          "provider.send.queued",
          "message.delivery.updated",
          "consent.restricted",
        ].map((v) => (
          <span key={v}>
            <History size={14} />
            {v}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function UnifiedInbox({ rows }: { rows: RecordData[] }) {
  return (
    <div className="eo-grid">
      <Panel title="Future unified inbox shell" kicker="CHANNEL ADAPTERS">
        {rows.map((r) => (
          <article className="eo-adapter" key={r.id}>
            <span>
              {r.fields.Channel === "WhatsApp" ? (
                <MessageCircle />
              ) : r.fields.Channel === "Email" ? (
                <Mail />
              ) : (
                <Send />
              )}
            </span>
            <div>
              <strong>{r.fields.Channel}</strong>
              <small>{r.fields.Provider}</small>
            </div>
            <Badge>{r.status}</Badge>
          </article>
        ))}
      </Panel>
      <Panel title="Shared message contract">
        <div className="eo-mini-list">
          {[
            "Company and site scope",
            "Customer and conversation reference",
            "Provider message ID",
            "Direction and delivery state",
            "Read state and attachments",
            "Consent and opt-out decision",
            "Immutable lifecycle audit",
          ].map((v) => (
            <span key={v}>
              <ShieldCheck size={14} />
              {v}
            </span>
          ))}
        </div>
        <Callout tone="neutral" title="No duplicate business truth">
          The inbox references existing customers, orders, invoices and
          payments. It does not create a parallel master database.
        </Callout>
      </Panel>
    </div>
  );
}

function AutomationDesk({
  rows,
  module,
}: {
  rows: RecordData[];
  module: ModuleDef;
}) {
  const { session } = useLab();
  const [active, setActive] = useState<Record<string, boolean>>({});
  const canManage = canAct(module, session, "manageCommunications");
  const toggle = (id: string) => {
    if (!canManage) return;
    setActive((current) => ({ ...current, [id]: !current[id] }));
  };
  return (
    <div className="eo-grid">
      <Panel
        title="Authoritative event automations"
        kicker="INDIVIDUALLY CONFIGURED"
      >
        {rows.map((r) => (
          <article className="eo-rule" key={r.id}>
            <div>
              <ProductIcon kind="approval" />
              <span>
                <strong>{r.title}</strong>
                <small>
                  {r.fields.Event} · {r.fields.Channel} ·{" "}
                  {r.fields["Template Version"]}
                </small>
              </span>
            </div>
            {canManage && (
              <button
                role="switch"
                aria-checked={!!active[r.id]}
                onClick={() => toggle(r.id)}
              >
                <i />
                {active[r.id] ? "Enabled in lab" : "Paused"}
              </button>
            )}
            <p>
              Consent: {r.fields["Consent Rule"]} · Hours:{" "}
              {r.fields["Business Hours"]}
            </p>
            <p>
              Idempotency: {r.fields["Idempotency Key"]} · Retry:{" "}
              {r.fields["Retry Policy"]}
            </p>
          </article>
        ))}
      </Panel>
      <Panel title="Event safeguards">
        <Steps
          steps={[
            "ERP event",
            "Verify source",
            "Check idempotency",
            "Consent / opt-out",
            "Business hours",
            "Provider queue",
            "Delivery audit",
          ]}
          current={4}
        />
        <Callout tone="neutral" title="No screen-open triggers">
          Invoice, payment, order, delivery and collection messages start only
          from authoritative ERP events.
        </Callout>
        <div className="eo-mini-list">
          {[
            "invoice.issued",
            "invoice.paid",
            "order.completed",
            "delivery.completed",
            "collection.ready",
            "payment.verified",
            "complaint.received",
            "feedback.requested",
          ].map((e) => (
            <span key={e}>
              <Activity size={14} />
              {e}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TemplateDesk({
  rows,
  module,
  letterhead,
}: {
  rows: RecordData[];
  module: ModuleDef;
  letterhead: boolean;
}) {
  const { session } = useLab();
  const [stage, setStage] = useState(0);
  const canManage = canAct(module, session, "manageTemplates");
  const advance = () => {
    if (!canManage) return;
    setStage(Math.min(4, stage + 1));
  };
  return (
    <div className="eo-grid">
      <Panel
        title={
          letterhead ? "Company-aware letterheads" : "Communication templates"
        }
        kicker={
          letterhead
            ? "PRINT · PDF · EMAIL · WHATSAPP"
            : "WHATSAPP · EMAIL · FUTURE ADAPTERS"
        }
      >
        {rows.map((r) => (
          <article className="eo-template" key={r.id}>
            <header>
              <ProductIcon kind="ai" />
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.fields.Company} · Version {r.fields.Version}
                </small>
              </div>
              <Badge>{r.status}</Badge>
            </header>
            <p>
              {letterhead
                ? "Approved logo and known company facts are required. Bank details, tax IDs and legal addresses stay blank until verified."
                : r.fields.Body}
            </p>
            <div className="eo-token-row">
              {(
                r.fields.Variables ||
                "company_name, company_logo, company_email, company_support_phone, company_support_whatsapp"
              )
                .split(",")
                .map((v) => (
                  <code key={v}>
                    {"{{" +
                      v.trim().replaceAll("{{", "").replaceAll("}}", "") +
                      "}}"}
                  </code>
                ))}
            </div>
          </article>
        ))}
      </Panel>
      <Panel title="Governed publication">
        <Steps
          steps={["Draft", "Review", "Approved", "Published", "Archived"]}
          current={stage}
        />
        <p className="p-secondary">
          AI may propose layout, hierarchy, spacing or wording from approved
          assets and known facts. Human review is required before publication.
        </p>
        {canManage && (
          <Btn disabled={stage >= 4} onClick={advance}>
            Move to{" "}
            {["Review", "Approved", "Published", "Archived", "Archived"][stage]}
          </Btn>
        )}
        <Callout tone="neutral" title="Company identity variables">
          Daenem Farms may use its configured support WhatsApp number. Every
          other business resolves its own approved company identity.
        </Callout>
      </Panel>
    </div>
  );
}

export function FinancialOperationsCenter({ module }: { module: ModuleDef }) {
  const lab = useLab();
  const initial = financeTabs.some(([id]) => id === module.id)
    ? module.id
    : "banking-operations";
  const [tab, setTab] = useState(initial);
  const allowedTabs = financeTabs.filter(([id]) =>
    canView(byId(id), lab.session),
  );
  const activeTab = allowedTabs.some(([id]) => id === tab)
    ? tab
    : allowedTabs[0]?.[0];
  const get = (id: string) => {
    const m = byId(id);
    return m && canView(m, lab.session)
      ? recordsFor(lab.records, m, lab.session)
      : [];
  };
  if (!activeTab)
    return (
      <Empty
        title="No assigned financial operations workspace"
        message="No financial operations surface is available in the current scope."
      />
    );
  const rows = get(activeTab);
  return (
    <div className="eo-shell eo-finance">
      <header className="eo-hero">
        <div>
          <ProductIcon kind="banking" />
          <span className="p-kicker">
            ENTERPRISE BANKING · TREASURY · FINANCIAL OPERATIONS
          </span>
          <h2>Cash clarity, with controlled authority.</h2>
          <p>
            Assigned accounts, verified payment events, transfers, payroll
            execution and reconciliation stay connected to existing ERP
            financial truth.
          </p>
        </div>
        <div className="eo-hero-metrics">
          <Metric
            label="Assigned accounts"
            value={String(get("banking-operations").length)}
          />
          <Metric
            label="Awaiting control"
            value={String(
              get("transfers").filter((r) =>
                /Approval|Processing/.test(r.status),
              ).length,
            )}
          />
          <Metric
            label="Data state"
            value="DEMO"
            detail="No production connection"
          />
        </div>
      </header>
      <TruthStrip />
      <ModuleTabs items={allowedTabs} active={activeTab} onChange={setTab} />
      {activeTab === "banking-operations" ? (
        <>
          <FinanceCommandOverview
            accounts={rows}
            transfers={get("transfers")}
            reconciliations={get("reconciliation")}
            treasury={get("treasury")}
            payroll={get("payroll-execution")}
            go={lab.go}
          />
          <AccountsDesk rows={rows} />
        </>
      ) : activeTab === "treasury" ? (
        <TreasuryDesk rows={rows} />
      ) : activeTab === "payment-verification" ? (
        <VerificationDesk rows={rows} />
      ) : activeTab === "transfers" ? (
        <TransferDesk rows={rows} module={byId("transfers")!} />
      ) : activeTab === "beneficiaries" ? (
        <BeneficiaryDesk rows={rows} module={byId("beneficiaries")!} />
      ) : activeTab === "payroll-execution" ? (
        <PayrollOperations rows={rows} />
      ) : activeTab === "reconciliation" ? (
        <ReconciliationDesk rows={rows} />
      ) : (
        <FinancialReports rows={rows} module={byId("financial-reports")!} />
      )}
    </div>
  );
}

function FinanceCommandOverview({
  accounts,
  transfers,
  reconciliations,
  treasury,
  payroll,
  go,
}: {
  accounts: RecordData[];
  transfers: RecordData[];
  reconciliations: RecordData[];
  treasury: RecordData[];
  payroll: RecordData[];
  go: (route: string) => void;
}) {
  const available = accounts.reduce(
    (total, row) => total + Number(row.fields["Available Balance"] || 0),
    0,
  );
  const ledger = accounts.reduce(
    (total, row) => total + Number(row.fields["Ledger Balance"] || 0),
    0,
  );
  const pending = transfers.filter((row) =>
    /Pending|Approval|Processing|Submitted/.test(row.status),
  );
  const failed = transfers.filter((row) => /Failed|Reversed/.test(row.status));
  const exceptions = reconciliations.filter(
    (row) => !/Reconciled|Resolved/.test(row.status),
  );
  const moneyIn = Number(treasury[0]?.fields["Money In"] || 31500000);
  const moneyOut = Number(treasury[0]?.fields["Money Out"] || 12480000);
  const payrollCost = payroll.reduce(
    (total, row) => total + Number(row.fields["Net Total"] || 0),
    0,
  );
  return (
    <section
      className="v14-finance-command"
      aria-label="Banking and Treasury Command Center"
    >
      <div className="v14-finance-metrics">
        <Metric
          label="Total Balance"
          value={money(ledger)}
          detail="Assigned ledger balances"
        />
        <Metric
          label="Available Balance"
          value={money(available)}
          detail={`${accounts.length} assigned accounts`}
        />
        <Metric
          label="Incoming Payments"
          value={money(875000)}
          detail="Illustrative transaction feed"
        />
        <Metric
          label="Outgoing Payments"
          value={money(1224500)}
          detail="Illustrative transaction feed"
        />
        <Metric
          label="Pending Transfers"
          value={String(pending.length)}
          detail="Awaiting controlled action"
        />
        <Metric
          label="Failed Transfers"
          value={String(failed.length)}
          detail="Assigned exceptions"
        />
        <Metric
          label="Reconciliations"
          value={String(reconciliations.length)}
          detail={`${exceptions.length} exceptions`}
        />
        <Metric
          label="Payroll Position"
          value={money(payrollCost)}
          detail="Submission is not payment"
        />
      </div>
      <div className="v14-finance-overview">
        <Panel
          title="Treasury Position"
          kicker="CASH FLOW · AUTHORIZED FIXTURE"
        >
          <Bars
            items={[
              ["Money In", moneyIn],
              ["Money Out", moneyOut],
              ["Payroll", payrollCost],
              ["Liquidity", available],
            ]}
          />
          <div className="v14-command-links">
            <button onClick={() => go("treasury")}>Cash Position</button>
            <button onClick={() => go("financial-reports")}>
              Revenue and Expense Trends
            </button>
          </div>
        </Panel>
        <Panel title="Bank Connectivity" kicker="NO PARTNERSHIP CLAIMED">
          <div className="v14-bank-health">
            {accounts.map((row) => (
              <button key={row.id} onClick={() => go("banking-operations")}>
                <span className="eo-bank-mark">
                  <Landmark size={18} />
                </span>
                <span>
                  <strong>{row.fields.Institution}</strong>
                  <small>{row.fields["Masked Account"]}</small>
                </span>
                <Badge>{row.status}</Badge>
              </button>
            ))}
          </div>
          {!accounts.length && <Empty title="No Assigned Bank Accounts" />}
        </Panel>
        <Panel title="Approvals and Reconciliation" kicker="CONTROL QUEUES">
          <div className="v14-control-queues">
            <button onClick={() => go("transfers")}>
              <span>Transfer Approvals</span>
              <strong>{pending.length}</strong>
              <small>Maker-checker and thresholds</small>
            </button>
            <button onClick={() => go("reconciliation")}>
              <span>Reconciliation Exceptions</span>
              <strong>{exceptions.length}</strong>
              <small>Evidence and independent review</small>
            </button>
            <button onClick={() => go("payment-verification")}>
              <span>Payment Verification</span>
              <strong>Guarded</strong>
              <small>Bank alert alone never activates service</small>
            </button>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function AccountsDesk({ rows }: { rows: RecordData[] }) {
  const [selected, setSelected] = useState(rows[0]?.id || "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [simulated, setSimulated] = useState(0);
  const row = rows.find((r) => r.id === selected) || rows[0];
  const statuses = [
    "RECEIVED",
    "PENDING",
    "PROCESSING",
    "SUBMITTED",
    "COMPLETED",
    "FAILED",
    "REVERSED",
    "REFUNDED",
    "CANCELLED",
  ];
  const labels = [
    "Customer receipt",
    "Supplier transfer",
    "POS settlement",
    "Payroll authorization",
    "Invoice payment",
    "Provider rejection",
    "Transfer reversal",
    "Customer refund",
    "Cancelled transfer",
  ];
  const transactions = statuses.map((status, i) => ({
    label: labels[i],
    status,
    amount: [485000, 128000, 75000, 920000, 315000, 64000, 32000, 19500, 81000][
      i
    ],
    time: `${8 + i}:2${i} AM`,
    reference: `TXN-FIX-260912-${String(i + 1).padStart(2, "0")}`,
    direction: ["IN", "OUT", "IN", "OUT", "IN", "OUT", "OUT", "OUT", "OUT"][i],
    related: [
      "Invoice INV-2048",
      "Purchase Order PO-2609-041",
      "POS batch POS-0912",
      "Payroll PAYROLL-SEP-2026",
      "Order PRI-2048",
      "Expense EXP-2050",
      "Transfer TRF-2051",
      "Payment PAY-2052",
      "Transfer TRF-2053",
    ][i],
    provider: [
      "Event received",
      "Awaiting provider",
      "Provider processing",
      "Submitted fixture",
      "Success fixture",
      "Failed fixture",
      "Reversal fixture",
      "Refund fixture",
      "Cancelled before submission",
    ][i],
    reconciliation: [
      "Unmatched",
      "Pending",
      "Pending",
      "Not started",
      "Matched",
      "Exception",
      "Review",
      "Matched",
      "Not applicable",
    ][i],
  }));
  const shown = transactions.filter(
    (t) =>
      (filter === "ALL" || t.status === filter) &&
      `${t.label} ${t.reference} ${t.related}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="eo-account-grid">
        {rows.map((r) => (
          <button
            key={r.id}
            className={"eo-account-card " + (row?.id === r.id ? "active" : "")}
            onClick={() => setSelected(r.id)}
          >
            <span className="eo-bank-mark">
              <Landmark size={22} />
            </span>
            <span>
              <small>{r.fields.Institution}</small>
              <strong>{r.fields["Account Name"]}</strong>
              <em>{r.fields["Masked Account"]}</em>
            </span>
            <span>
              <small>Available balance · fixture</small>
              <strong>{money(Number(r.fields["Available Balance"]))}</strong>
              <Badge>{r.status}</Badge>
            </span>
          </button>
        ))}
      </div>
      {row && (
        <>
          <div className="eo-grid">
            <Panel title="Account position" kicker="ASSIGNED ACCOUNT ONLY">
              <div className="eo-metric-grid">
                <Metric
                  label="Available balance"
                  value={money(Number(row.fields["Available Balance"]))}
                />
                <Metric
                  label="Ledger balance"
                  value={money(Number(row.fields["Ledger Balance"]))}
                />
                <Metric
                  label="Pending difference"
                  value={money(
                    Number(row.fields["Ledger Balance"]) -
                      Number(row.fields["Available Balance"]),
                  )}
                />
              </div>
              <dl className="eo-facts">
                <div>
                  <dt>Branch</dt>
                  <dd>{row.fields.Branch}</dd>
                </div>
                <div>
                  <dt>Business unit</dt>
                  <dd>{row.fields["Business Unit"]}</dd>
                </div>
                <div>
                  <dt>Cost centre</dt>
                  <dd>{row.fields["Cost Centre"]}</dd>
                </div>
                <div>
                  <dt>Statement</dt>
                  <dd>{row.fields["Statement State"]}</dd>
                </div>
              </dl>
            </Panel>
            <Panel
              title="Transaction state simulator"
              kicker="NO MONEY MOVEMENT"
            >
              <div className="eo-state-simulator">
                <strong>{statuses[simulated]}</strong>
                <p>{labels[simulated]} · interaction fixture</p>
                <div>
                  <button onClick={() => setSimulated((simulated + 8) % 9)}>
                    Previous
                  </button>
                  <button onClick={() => setSimulated((simulated + 1) % 9)}>
                    Advance state
                  </button>
                </div>
              </div>
              <Callout tone="neutral" title="Simulation only">
                The state control changes presentation only. It never submits a
                provider request.
              </Callout>
            </Panel>
          </div>
          <Panel
            title="Transaction status stream"
            kicker="RICH FIXTURE · ASSIGNED ACCOUNT"
          >
            <div className="eo-transaction-tools">
              <label>
                <Search size={15} />
                <input
                  aria-label="Search transactions"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search reference or related record"
                />
              </label>
              <Pick
                label="Status filter"
                value={filter}
                onChange={setFilter}
                options={["ALL", ...statuses]}
              />
            </div>
            <div className="eo-transaction-list rich">
              {shown.map((t) => (
                <article key={t.reference}>
                  <span>
                    {t.direction === "IN" ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{t.label}</strong>
                    <small>
                      {t.time} · {t.reference} · {t.related}
                    </small>
                    <em>
                      Provider: {t.provider} · Reconciliation:{" "}
                      {t.reconciliation}
                    </em>
                  </div>
                  <b>
                    {t.direction === "IN" ? "+" : "−"}
                    {money(t.amount)}
                  </b>
                  <Badge>{t.status}</Badge>
                </article>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function TreasuryDesk({ rows }: { rows: RecordData[] }) {
  const r = rows[0];
  if (!r) return <Empty title="No assigned treasury position" />;
  return (
    <>
      <div className="eo-treasury-grid">
        <Panel title="Money in" kicker="AUTHORIZED FIXTURE">
          <Metric label="Revenue today" value={money(3450000)} />
          <Bars
            items={[
              ["Today", 3450000],
              ["Week", 11200000],
              ["Month", 31500000],
              ["Year", 238400000],
            ]}
          />
        </Panel>
        <Panel title="Money out">
          <Metric
            label="Current month"
            value={money(Number(r.fields["Money Out"]))}
          />
          <div className="eo-mini-list">
            {[
              "Payroll · ₦6.4m",
              "Vendors · ₦2.8m",
              "Expenses · ₦1.7m",
              "Refunds & charges · ₦1.58m",
            ].map((v) => (
              <span key={v}>
                <ArrowUpRight size={14} />
                {v}
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="Cash position">
          <Metric
            label="Consolidated balance"
            value={money(Number(r.fields["Consolidated Balance"]))}
          />
          <div className="eo-mini-list">
            <span>
              Daily cash flow{" "}
              <b>{money(Number(r.fields["Daily Cash Flow"]))}</b>
            </span>
            <span>
              Weekly cash flow{" "}
              <b>{money(Number(r.fields["Weekly Cash Flow"]))}</b>
            </span>
            <span>
              Monthly cash flow{" "}
              <b>{money(Number(r.fields["Monthly Cash Flow"]))}</b>
            </span>
          </div>
        </Panel>
      </div>
      <Callout tone="neutral" title="Forecast is illustrative">
        The 30-day treasury forecast is a design-lab fixture from assigned
        records. It is not a production balance or financial forecast.
      </Callout>
    </>
  );
}

function VerificationDesk({ rows }: { rows: RecordData[] }) {
  const r = rows[0];
  if (!r) return <Empty />;
  return (
    <div className="eo-grid">
      <Panel title="Payment verification pipeline" kicker={r.id}>
        <Steps
          steps={[
            "Provider event",
            "Verify signature",
            "Replay guard",
            "Resolve account",
            "Match reference",
            "Validate rule",
            "Reconcile",
            "Receipt",
            "Downstream activation",
          ]}
          current={5}
        />
        <dl className="eo-facts">
          {Object.entries(r.fields).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Activation authority">
        <div className="eo-gate">
          <ScanLine size={28} />
          <strong>ACTIVATION BLOCKED</strong>
          <p>Processing is not authoritative completion.</p>
        </div>
        <Callout title="A bank alert alone never activates service">
          Verified provider event + successful matching + authoritative payment
          state + applicable business rule are all required.
        </Callout>
      </Panel>
    </div>
  );
}

function TransferDesk({
  rows,
  module,
}: {
  rows: RecordData[];
  module: ModuleDef;
}) {
  const { session, notice, audit } = useLab();
  const r = rows[0];
  const [stage, setStage] = useState(r?.status === "Awaiting Approval" ? 1 : 0);
  const maker = r?.fields.Maker === personFor(session);
  const actions = [
    ["Create", "createTransfer"],
    ["Approve", "approveTransfer"],
    ["Execute", "executeTransfer"],
    ["Reconcile", "reconcile"],
  ] as const;
  const next = () => {
    const action = actions[stage]?.[1];
    if (!r || !action || !canAct(module, session, action)) return;
    if (stage === 1 && maker) {
      notice("Maker-checker rule blocked self-approval");
      return;
    }
    audit(
      `Transfer ${actions[stage][0].toLowerCase()} simulated`,
      r.module + ":" + r.id,
      "No provider submission or money movement",
    );
    setStage(Math.min(3, stage + 1));
    notice("Transfer control step recorded locally");
  };
  if (!r) return <Empty />;
  return (
    <div className="eo-grid">
      <Panel title="Controlled transfer" kicker={r.id}>
        <Steps
          steps={["CREATE", "APPROVE", "EXECUTE", "RECONCILE"]}
          current={stage}
        />
        <dl className="eo-facts">
          {Object.entries(r.fields).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Btn
          disabled={
            !canAct(module, session, actions[stage]?.[1] || "view") ||
            (stage === 1 && maker)
          }
          onClick={next}
        >
          {stage === 3
            ? "Reconciled in lab"
            : actions[stage][0] + " controlled transfer"}
        </Btn>
        {stage === 1 && maker && (
          <Callout title="Independent checker required">
            The maker cannot approve this transfer.
          </Callout>
        )}
      </Panel>
      <Panel title="Control policy">
        <div className="eo-mini-list">
          {[
            "Dual authorization above configured threshold",
            "Beneficiary verified before execution",
            "Transfer limit checked server-side",
            "Reason and evidence required",
            "Provider submission is separately authorized",
            "Failure and reversal preserve the original audit",
          ].map((v) => (
            <span key={v}>
              <LockKeyhole size={14} />
              {v}
            </span>
          ))}
        </div>
        <Callout tone="neutral" title="No execution in Sites">
          Buttons record local workflow demonstrations only. No provider request
          or money movement occurs.
        </Callout>
      </Panel>
    </div>
  );
}

function BeneficiaryDesk({
  rows,
  module,
}: {
  rows: RecordData[];
  module: ModuleDef;
}) {
  return (
    <div className="eo-grid">
      <Panel title="Beneficiary governance" kicker="SEPARATE PERMISSIONS">
        {rows.map((r) => (
          <article className="eo-beneficiary" key={r.id}>
            <span className="eo-bank-mark">
              <Users size={20} />
            </span>
            <div>
              <strong>{r.fields.Name}</strong>
              <small>
                {r.fields.Institution} · {r.fields["Masked Account"]}
              </small>
            </div>
            <Badge>{r.fields["Risk Level"]} risk</Badge>
            <Badge>{r.status}</Badge>
          </article>
        ))}
      </Panel>
      <Panel title="Lifecycle">
        <Steps
          steps={[
            "Create",
            "Edit",
            "Verify",
            "Secondary review",
            "Activate",
            "Deactivate",
          ]}
          current={3}
        />
        <Callout tone="neutral" title="High-risk changes require review">
          Create, edit, verify, activate and deactivate are independently
          permissioned and audited. Production verification requires a
          server-side provider.
        </Callout>
      </Panel>
    </div>
  );
}

function PayrollOperations({ rows }: { rows: RecordData[] }) {
  const r = rows[0];
  if (!r) return <Empty />;
  const truth = payrollOperationsTruth(r.status, r.fields);
  const department = [
    ["Operations", 5200000],
    ["Production", 4180000],
    ["Finance", 2960000],
    ["Shared services", 1980000],
  ] as [string, number][];
  return (
    <>
      <div className="eo-metric-grid payroll">
        <Metric
          label="Payroll Under Review"
          value={money(truth.totalPayroll)}
        />
        <Metric
          label="Confirmed Settled Payroll"
          value={money(truth.settledPayroll)}
          detail={truth.isSettled ? "Authoritative final state" : "No settled state returned"}
        />
        <Metric
          label="Awaiting Settlement"
          value={money(truth.unsettledPayroll)}
        />
        <Metric
          label="Reported Payment Failures"
          value={String(truth.failedEmployees)}
          detail="Count only; no provider detail available"
        />
        <Metric label="Confirmed Settled Employees" value={String(truth.settledEmployees)} />
        <Metric label="Unsettled Employees" value={String(truth.unsettledEmployees)} />
        <Metric label="Payroll costs by department" value="4 groups" />
        <Metric label="Payroll costs by branch" value="3 branches" />
      </div>
      <Panel title="Payroll banking state">
        <Steps
          steps={[
            "Preparation",
            "Validation",
            "Approval",
            "Banking batch",
            "Transfer authorization",
            "Provider submission",
            "Per-employee processing",
            "Reconciliation",
            "Final payment",
          ]}
          current={2}
        />
        <Callout tone="neutral" title="Approval and submission are not settlement">
          The portal only presents payroll as settled when the authoritative
          batch status is Paid or Settled and its employee outcome counts are
          complete and internally consistent. Approval, export, submission and
          processing do not confirm that funds reached an employee.
        </Callout>
      </Panel>
      <div className="eo-analysis-grid">
        <Panel title="Monthly payroll trend · fixture">
          <Bars
            items={[
              ["Apr", 12100000],
              ["May", 12800000],
              ["Jun", 13200000],
              ["Jul", 13800000],
              ["Aug", 14100000],
              ["Sep", 14320000],
            ]}
          />
        </Panel>
        <Panel title="Yearly payroll trend · fixture">
          <Bars
            items={[
              ["2023", 128000000],
              ["2024", 142000000],
              ["2025", 157000000],
              ["2026 YTD", 118000000],
            ]}
          />
        </Panel>
        <Panel title="Payroll by department">
          <Bars items={department} />
        </Panel>
        <Panel title="Payroll by business unit">
          <Bars
            items={[
              ["Printing", 6100000],
              ["Bakery", 3900000],
              ["Logistics", 2450000],
              ["Group", 1870000],
            ]}
          />
        </Panel>
        <Panel title="Payroll vs revenue">
          <Bars
            items={[
              ["Payroll", 14320000],
              ["Revenue", 31500000],
            ]}
          />
        </Panel>
        <Panel title="Payroll cost analysis">
          <Bars
            items={[
              ["Base salaries", 11200000],
              ["Allowances", 2380000],
              ["Bonuses", 940000],
              ["Deductions", 1200000],
            ]}
          />
        </Panel>
      </div>
      <div className="v14-payroll-control">
        <Panel title="Current Batch State" kicker={r.id}>
          <div className="v14-batch-state">
            <span>
              <CalendarClock size={24} />
              <strong>{r.status}</strong>
              <small>
                {r.fields.Period} ·{" "}
                {r.fields["Payroll Type"] || "Monthly Payroll"}
              </small>
            </span>
            <Badge>{truth.presentationStatus}</Badge>
          </div>
          <div className="eo-mini-list">
            <span>
              Validated Employees <b>{truth.employeeCount}</b>
            </span>
            <span>
              Unsettled Employees <b>{truth.unsettledEmployees}</b>
            </span>
            <span>
              Confirmed Settled Employees <b>{truth.settledEmployees}</b>
            </span>
            <span>
              Reversed Employees <b>{truth.reversedEmployees}</b>
            </span>
          </div>
        </Panel>
        <Panel title="Payroll Activity" kicker="AUTHORITATIVE RECORD HISTORY">
          <Timeline items={r.history} />
        </Panel>
        <Panel title="Payroll Exceptions" kicker="FAILURE AND REVERSAL CONTROL">
          <div className="v14-exception-feed">
            {!truth.isSettled && <button>
              <span>
                <strong>Settlement Evidence Required</strong>
                <small>The current batch status does not confirm payment.</small>
              </span>
              <Badge>Pre-Settlement</Badge>
            </button>}
            {truth.failedEmployees > 0 && <button>
              <span>
                <strong>Reported Payment Failures</strong>
                <small>{truth.failedEmployees} employee records require authoritative detail.</small>
              </span>
              <Badge>Review Required</Badge>
            </button>}
            {truth.reversedEmployees > 0 && <button>
              <span>
                <strong>Reported Reversals</strong>
                <small>{truth.reversedEmployees} employee records require reconciliation detail.</small>
              </span>
              <Badge>Review Required</Badge>
            </button>}
            {truth.isSettled && truth.failedEmployees === 0 && truth.reversedEmployees === 0 && <Callout tone="neutral" title="No Reported Exceptions">The settled batch reports no failed or reversed employee outcomes.</Callout>}
          </div>
        </Panel>
      </div>
      <Panel title="Per-employee payment processing">
        <Empty
          title="Authoritative Employee Outcomes Unavailable"
          message="No per-employee settlement endpoint is connected to this QA surface. Names, bank references, provider states and transaction references are withheld rather than fabricated."
        />
      </Panel>
    </>
  );
}

function ReconciliationDesk({ rows }: { rows: RecordData[] }) {
  const r = rows[0];
  if (!r) return <Empty />;
  return (
    <div className="eo-grid">
      <Panel title="Source comparison">
        <div className="eo-reconcile">
          <article>
            <Landmark size={22} />
            <span>
              Bank / provider<strong>{r.fields["Provider Transaction"]}</strong>
            </span>
            <b>{money(485000)}</b>
          </article>
          <RefreshCw size={24} />
          <article>
            <ReceiptText size={22} />
            <span>
              ERP ledger<strong>{r.fields["Ledger Transaction"]}</strong>
            </span>
            <b>{money(315000)}</b>
          </article>
        </div>
        <Callout
          title={`${money(Number(r.fields.Variance))} variance under investigation`}
        >
          {r.fields.Reason}
        </Callout>
      </Panel>
      <Panel title="Resolution controls">
        <Steps
          steps={[
            "Open",
            "Investigate",
            "Match",
            "Review",
            "Independent check",
            "Reconcile",
          ]}
          current={1}
        />
        <dl className="eo-facts">
          <div>
            <dt>Maker</dt>
            <dd>{r.fields.Maker}</dd>
          </div>
          <div>
            <dt>Checker</dt>
            <dd>{r.fields.Checker}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{r.fields.Evidence}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

function FinancialReports({
  rows,
  module,
}: {
  rows: RecordData[];
  module: ModuleDef;
}) {
  const { session } = useLab();
  const canExport = canAct(module, session, "export");
  return (
    <div className="eo-grid">
      <Panel
        title="Governed report library"
        kicker="VIEW AND EXPORT ARE SEPARATE"
      >
        {rows.map((r) => (
          <article className="eo-template" key={r.id}>
            <header>
              <FileChartColumn size={22} />
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.fields.Period} · {r.fields.Scope}
                </small>
              </div>
              <Badge>{r.status}</Badge>
            </header>
            <p>
              {r.fields["Report Type"]} · {r.fields.Metric}
            </p>
            {canExport ? (
              <DownloadCSV rows={[r]} title="DAENEM-FINANCIAL-REPORT-DEMO" />
            ) : (
              <Badge>Export not assigned</Badge>
            )}
          </article>
        ))}
      </Panel>
      <Panel title="Report coverage">
        <div className="eo-mini-list">
          {[
            "Daily / weekly / monthly / annual revenue",
            "Expenses by department and branch",
            "Payroll, salary and bonus",
            "Statements, transactions and balances",
            "Treasury, reconciliation and cash flow",
            "CSV · XLSX · PDF · JSON · API contract",
          ].map((v) => (
            <span key={v}>
              <FileChartColumn size={14} />
              {v}
            </span>
          ))}
        </div>
        <Callout tone="neutral" title="Production formats require adapters">
          CSV is demonstrated locally. XLSX, PDF, JSON and API exports are
          production mapping contracts and remain unavailable here.
        </Callout>
      </Panel>
    </div>
  );
}
