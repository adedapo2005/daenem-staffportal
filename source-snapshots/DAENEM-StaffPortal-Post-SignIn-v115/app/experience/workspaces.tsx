"use client";
import {
  FinancialDesk,
  BakeryDesk,
} from "./domain-intelligence";
import { StaffChat, NotificationCenter } from "./collaboration-desk";
import { WorkTimeline } from "./work-timeline";
import { WorkCalendar, WorkBoard } from "./work-views";
import { activeConfigurations } from "./config-runtime";
import { PublishedForms } from "./config-consumers";
import type { ConfigVersion } from "./enterprise-contract";
import { useEffect, useState } from "react";
import { formatAuthenticatedTime12 } from "./time-standard";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Check,
  Plus,
  Clock,
  MapPin,
  Camera,
  ShieldCheck,
  AlertTriangle,
  Users,
  FileText,
  Printer,
  Package,
  Car,
  Truck,
  Building2,
  CalendarDays,
  Search,
  LayoutGrid,
  List,
  ArrowDown,
  Receipt,
  Monitor,
  BookOpen,
  CheckCircle2,
  Flame,
  Send,
  ChevronLeft,
  Download,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useLab } from "./lab-context";
import { iconFor, Logo } from "./Portal";
import { useDeviceState } from "./device-state";
import {
  modules,
  byId,
  companies,
  canView,
  canAct,
  canRecordAct,
  recordsFor,
  attentionRecords,
  money,
  personFor,
  sessionScopeKey,
  authorizedCompaniesForModule,
  type RecordData,
  type ModuleDef,
} from "./model";
import { apiErrorMessage, staffPortalApi } from "./staffportal-api";
import {
  isEmployeeDirectoryResponse,
  isHrOverview,
  isPayrollRunsResponse,
  workforceCompanyId,
  type HrOverview as HrOverviewData,
  type PayrollRun,
  type WorkforceEmployee,
} from "./workforce-api";
import {
  payrollStatementPresentation,
  payrollStatementTitle,
} from "./payroll-statement-contract";
import {
  Btn,
  Panel,
  Badge,
  Metric,
  Empty,
  Callout,
  RecordsTable,
  Avatar,
  Pick,
  Bars,
  Viz,
  RouteMap,
  Steps,
  Timeline,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  DownloadCSV,
} from "./ui";
import Homes from "./homes-v3";
import EnterpriseWorkspace from "./enterprise-v3";
import Profile from "./profile-v3";
import AttendanceV3 from "./attendance-v3";
import AdminWorkspace from "./studios";
import {
  CustomerCommunicationCenter,
  FinancialOperationsCenter,
} from "./enterprise-operations";
import ConstructionWorkspace from "./construction-erp";
import AdaptiveRecordWorkspace from "./record-workspace";
import PrintingWorkspace from "./printing-workspace";
import LogisticsWorkspace from "./logistics-workspace";
import PropertyWorkspace from "./property-workspace";
import LifecycleWorkspace from "./lifecycle-workspace";
import { auditPresentation } from "./audit-presentation";
import {
  autosSalesIdentityFacts,
  autosSalesPresentation,
} from "./autos-sales-truth";
export default function Workspace({ module: m }: { module: ModuleDef }) {
  const lab = useLab(),
    rows = recordsFor(lab.records, m, lab.session),
    open = (r: RecordData) => lab.open(r, m);
  const kind = m.kind;
  if (kind.startsWith("construction-"))
    return <ConstructionWorkspace module={m} />;
  if (m.id === "staff-messaging") return <StaffChat />;
  if (m.id === "notifications") return <NotificationCenter />;
  if (
    [
      "communication-center",
      "communication-queues",
      "communication-numbers",
      "communication-analytics",
      "communication-preferences",
      "communication-automation",
      "communication-templates",
      "letterheads",
      "letterhead-ai",
      "communication-audit",
      "unified-inbox",
    ].includes(kind)
  )
    return <CustomerCommunicationCenter module={m} />;
  if (
    [
      "banking-operations",
      "treasury-operations",
      "payment-verification",
      "transfer-operations",
      "beneficiary-operations",
      "payroll-operations",
      "reconciliation-operations",
      "financial-reporting",
    ].includes(kind)
  )
    return <FinancialOperationsCenter module={m} />;
  if (kind === "payroll") return <Payroll />;
  if (m.id === "hr-records") return <HrOverview />;
  if (kind === "self-service") return <SelfService />;
  if (m.id === "auto-leads")
    return <AutosSalesPipeline module={m} rows={rows} open={open} />;
  if (kind === "records")
    return <AdaptiveRecordWorkspace module={m} rows={rows} onOpen={open} />;
  if (
    [
      "builder",
      "platform",
      "procurement",
      "purchase-orders",
      "goods-receipts",
      "stock-transfers",
      "stock-borrowing",
      "bakery-accountability",
      "technology-services",
      "vacancies",
      "staff-messaging",
      "files",
      "saved-views",
      "session-analytics",
      "reports",
    ].includes(kind) ||
    m.id === "signin-design" ||
    m.id === "audit"
  )
    return <EnterpriseWorkspace module={m} />;
  if (
    !canAct(m, lab.session) &&
    ![
      "home",
      "cockpit",
      "work",
      "hub",
      "integrations",
      "resources",
      "payslips",
      "audit",
      "security",
      "archive",
    ].includes(kind)
  )
    return (
      <>
        <RecordsTable rows={rows} onOpen={open} title={m.title} />
      </>
    );
  if (kind === "home" || kind === "cockpit" || kind === "work")
    return <Homes cockpit={kind === "cockpit"} work={kind === "work"} />;
  if (kind === "profile") return <Profile key={lab.session.personId} />;
  if (kind === "hub") return <Hub />;
  if (
    [
      "studio",
      "signin-studio",
      "policy",
      "access",
      "recovery",
      "support",
      "resources",
      "integrations",
      "sync",
      "toolbox",
      "help",
    ].includes(kind)
  )
    return <AdminWorkspace module={m} rows={rows} />;
  if (kind === "attendance") return <AttendanceV3 key={sessionScopeKey(lab.session)} />;
  if (kind === "people") return <People module={m} />;
  if (m.id === "lifecycle")
    return <LifecycleWorkspace module={m} rows={rows} open={open} />;
  if (kind === "calendar")
    return <WorkCalendar module={m} rows={rows} open={open} />;
  if (kind === "payslips") return <Payslips rows={rows} />;
  if (kind === "projects")
    return (
      <>
        <WorkTimeline module={m} rows={rows} open={open} />
        <RecordsTable
          rows={rows}
          onOpen={open}
          title={m.title + " records"}
          financial
        />
      </>
    );
  if (kind === "printing")
    return <PrintingWorkspace module={m} rows={rows} open={open} />;
  if (["board", "recruitment"].includes(kind))
    return (
      <>
        <WorkBoard module={m} rows={rows} open={open} />
        <WorkTimeline module={m} rows={rows} open={open} />
      </>
    );
  if (kind === "bakery") return <BakeryDesk rows={rows} open={open} />;
  if (kind === "autos") return <Autos rows={rows} open={open} />;
  if (kind === "logistics")
    return <LogisticsWorkspace module={m} rows={rows} open={open} />;
  if (kind === "properties")
    return <PropertyWorkspace module={m} rows={rows} open={open} />;
  if (["finance", "receivables", "budget", "spend", "costing"].includes(kind))
    return <FinancialDesk module={m} rows={rows} open={open} />;
  if (kind === "approvals") return <Approvals rows={rows} open={open} />;
  if (kind === "expenses")
    return (
      <>
        <div className="p-expense-intro">
          <Receipt size={35} />
          <div>
            <h2>Every request, backed by evidence.</h2>
            <p>
              Keep the purpose, amount and receipt together from draft to
              decision.
            </p>
          </div>
          <Metric
            label="My pending requests"
            value={String(rows.filter((r) => r.status !== "Approved").length)}
          />
        </div>
        <AdaptiveRecordWorkspace module={m} rows={rows} onOpen={open} />
      </>
    );
  if (
    ["projects", "facilities", "inventory", "fleet", "productivity"].includes(
      kind,
    )
  )
    return (
      <>
        <Operations module={m} rows={rows} open={open} />
        {["facilities", "fleet"].includes(kind) && (
          <WorkTimeline module={m} rows={rows} open={open} />
        )}
      </>
    );
  if (
    [
      "social",
      "marketing",
      "inbox",
      "website",
      "communications",
      "broadcast",
      "encouragement",
      "notifications",
      "staff-messaging",
    ].includes(kind)
  )
    return (
      <>
        <Communications module={m} rows={rows} open={open} />
        {kind === "marketing" && (
          <WorkTimeline module={m} rows={rows} open={open} />
        )}
      </>
    );
  if (["lifecycle", "reviews", "cases", "forms", "recipes"].includes(kind))
    return (
      <>
        <StaffWork module={m} rows={rows} open={open} />
        {kind === "lifecycle" && (
          <WorkTimeline module={m} rows={rows} open={open} />
        )}
      </>
    );
  if (["security", "audit"].includes(kind))
    return <Audit module={m} rows={rows} open={open} />;
  return (
    <>
      {kind === "archive" && (
        <Callout tone="neutral" title="Historical workshop archive">
          Records are read-only. Current Autos operations focus on vehicle
          acquisition and sales.
        </Callout>
      )}
      <RecordsTable
        rows={rows}
        onOpen={open}
        title={m.title}
        financial={/payroll|print|hr-records/.test(m.id)}
      />
    </>
  );
}
function AutosSalesPipeline({
  module,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (row: RecordData) => void;
}) {
  const presentation = autosSalesPresentation(module, rows);
  return (
    <section
      aria-label="Autos sales payment truth"
      data-autos-sales-workflow="bank-confirmation-required"
      data-payment-confirmation="not-confirmed"
      data-workshop-state="historical-read-only"
      data-settlement-source="authoritative-provider-required"
    >
      <Callout tone="neutral" title="Recorded amounts are not confirmed payments">
        Deposit requests and balances are sales working figures. A bank or
        payment provider must confirm settlement before any payment is treated
        as received.
      </Callout>
      <AdaptiveRecordWorkspace
        module={presentation.module}
        rows={presentation.rows}
        onOpen={open}
        recordNoun="Sales Lead"
        identityFacts={autosSalesIdentityFacts}
      />
    </section>
  );
}
function Hub() {
  const { session, go } = useLab();
  const [q, setQ] = useState(""),
    [family, setFamily] = useState("All families"),
    [pins, setPins] = useDeviceState<string[]>(
      "module-hub-pins-" + session.personId,
      [],
    );
  const allowed = modules.filter(
    (m) => canView(m, session) && !["home", "hub"].includes(m.id),
  );
  const filtered = allowed.filter(
    (m) =>
      (m.title + " " + m.family + " " + m.purpose)
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (family === "All families" || m.family === family),
  );
  return (
    <>
      <div className="p-hub-search">
        <div>
          <span className="p-kicker">YOUR AUTHORIZED WORKSPACE</span>
          <h2>The right tool for the work ahead.</h2>
          <p>
            {allowed.length} workspaces · {session.role} ·{" "}
            {companies.find((c) => c.id === session.company)?.name}
          </p>
        </div>
        <label className="p-search">
          <Search size={20} />
          <input
            placeholder="Find a workspace…"
            aria-label="Search Module Hub"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      <div className="p-family-tabs">
        <Pick
          label="ERP family"
          value={family}
          onChange={setFamily}
          options={["All families", ...new Set(allowed.map((m) => m.family))]}
        />
        {pins.length > 0 && <span>{pins.length} pinned workspaces</span>}
      </div>
      {!filtered.length ? (
        <Empty />
      ) : (
        <div className="p-module-grid">
          {filtered
            .sort(
              (a, b) =>
                Number(pins.includes(b.id)) - Number(pins.includes(a.id)),
            )
            .map((m) => {
              const Icon = iconFor(m);
              return (
                <article
                  className={`p-module-tile company-${m.company || "group"}`}
                  key={m.id}
                >
                  <div>
                    <span className="p-module-icon">
                      <Icon size={23} />
                    </span>
                    <button
                      className="p-pin"
                      onClick={() =>
                        setPins((p) =>
                          p.includes(m.id)
                            ? p.filter((x) => x !== m.id)
                            : [...p, m.id],
                        )
                      }
                      aria-label={`${pins.includes(m.id) ? "Unpin" : "Pin"} ${m.title}`}
                    >
                      {pins.includes(m.id) ? "Pinned" : "+ Pin"}
                    </button>
                  </div>
                  <small>{m.family}</small>
                  <h3>{m.title}</h3>
                  <p>{m.purpose}</p>
                  <button onClick={() => go(m.id)}>
                    Open workspace
                    <ArrowUpRight size={17} />
                  </button>
                </article>
              );
            })}
        </div>
      )}
    </>
  );
}
function Attendance({ rows }: { rows: RecordData[] }) {
  const { session, notice, open, go } = useLab();
  const [state, setState] = useState<"Not Started" | "Incomplete" | "Present">(
      "Not Started",
    ),
    [location, setLocation] = useState("Permission Required"),
    [photo, setPhoto] = useState("Required"),
    [history, setHistory] = useState<
      {
        action: string;
        actor: string;
        time: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [date, setDate] = useState(11);
  useEffect(() => {
    try {
      const x = localStorage.getItem(
        "daenem-demo-attendance-" + session.personId,
      );
      if (x) {
        const a = JSON.parse(x);
        if (
          ["Not Started", "Incomplete", "Present"].includes(a.state) &&
          Array.isArray(a.history)
        )
          queueMicrotask(() => {
            setState(a.state);
            setHistory(a.history);
          });
      }
    } catch {}
  }, [session.personId]);
  function clock() {
    if (location !== "In Geofence" || photo !== "Captured (Demo)") {
      setError(
        "Complete location validation and the required photo before recording an attendance event.",
      );
      return;
    }
    setError("");
    const next = state === "Not Started" ? "Incomplete" : "Present";
    const nextHistory = [
      ...history,
      {
        action:
          state === "Not Started"
            ? "Clock-in recorded · Clock-out still required"
            : "Clock-out recorded · Day marked Present",
        actor: personFor(session),
        time: `${formatAuthenticatedTime12(new Date(), session)} · Demo`,
      },
    ];
    setState(next);
    setHistory(nextHistory);
    localStorage.setItem(
      "daenem-demo-attendance-" + session.personId,
      JSON.stringify({ state: next, history: nextHistory }),
    );
    setPhoto("Required");
    notice("Attendance event recorded");
  }
  return (
    <div className="p-attendance-grid">
      <Panel className="p-shift-card">
        <span className="p-kicker">TODAY&apos;S ATTENDANCE</span>
        <h2>Friday, 11 September</h2>
        <div className="p-shift-ring">
          <Clock size={28} />
          <strong>
            {state === "Not Started"
              ? "Ready to start?"
              : state === "Incomplete"
                ? "Shift in progress"
                : "Day complete"}
          </strong>
          <Badge>{state}</Badge>
          <span>
            {state === "Incomplete"
              ? "Required clock-out is still missing."
              : "Your sign-in is separate from attendance."}
          </span>
        </div>
        <div className="p-shift-checks">
          <label>
            <MapPin size={18} />
            <span>Location validation</span>
            <Pick
              label="Demo location state"
              value={location}
              onChange={setLocation}
              options={[
                "Permission Required",
                "In Geofence",
                "Outside Geofence",
                "Unavailable",
              ]}
            />
          </label>
          <label>
            <Camera size={18} />
            <span>Attendance photo</span>
            <Btn
              variant="outline"
              onClick={() => {
                setPhoto("Captured (Demo)");
                notice("Demo photo placeholder captured");
              }}
            >
              {photo === "Required" ? "Simulate capture" : "Captured (Demo)"}
            </Btn>
          </label>
        </div>
        {error && (
          <Callout title="Attendance event not recorded">{error}</Callout>
        )}
        <Btn className="p-full" disabled={state === "Present"} onClick={clock}>
          {state === "Not Started"
            ? "Clock in"
            : state === "Incomplete"
              ? "Clock out"
              : "Both events recorded"}
          <ArrowRight size={17} />
        </Btn>
        <p className="p-secondary">
          Location and camera are simulated. No employee tracking runs in this
          preview.
        </p>
      </Panel>
      <div>
        <Panel
          title="September attendance"
          kicker="CALENDAR"
          action={<Badge>Demo calendar</Badge>}
        >
          <div className="p-calendar weekdays">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <strong key={d}>{d}</strong>
            ))}
          </div>
          <div className="p-calendar attendance">
            <i />
            {Array.from({ length: 30 }, (_, i) => (
              <button
                key={i}
                onClick={() => setDate(i + 1)}
                className={`${i + 1 === date ? "selected" : ""} ${i < 10 ? "complete" : ""} ${i === 10 ? "incomplete" : ""}`}
              >
                <span>{i + 1}</span>
                {i < 10 ? (
                  <Check size={13} />
                ) : i === 10 ? (
                  <Clock size={13} />
                ) : null}
              </button>
            ))}
          </div>
          <div className="p-calendar-legend">
            <span>✓ Complete events</span>
            <span>◷ Incomplete</span>
            <span>— No events</span>
          </div>
          <Callout
            tone="neutral"
            title={`September ${date} · ${date === 11 ? state : date < 11 ? "Present (Demo)" : "No Events"}`}
          >
            {date === 11
              ? "Today is marked Present only after both required attendance events exist."
              : "Select a day to inspect its attendance status."}
          </Callout>
        </Panel>
        <Panel title="Today's event timeline">
          {history.length ? (
            <Timeline items={history} />
          ) : (
            <p className="p-secondary">
              No attendance events recorded. Signing in did not clock you in.
            </p>
          )}
        </Panel>
      </div>
      {session.role !== "Employee" && (
        <div className="p-wide">
          <RecordsTable
            rows={rows.map((r, i) => ({
              ...r,
              status: i === 0 ? "Incomplete" : i === 1 ? "Late" : "Present",
            }))}
            onOpen={open}
            title="Team exceptions & corrections"
          />
        </div>
      )}
    </div>
  );
}
type PeopleState =
  | { status: "loading"; scopeKey: string }
  | { status: "ready"; scopeKey: string; employees: WorkforceEmployee[] }
  | { status: "error"; scopeKey: string; message: string };

function People({ module }: { module: ModuleDef }) {
  const { session } = useLab();
  const [refresh, setRefresh] = useState(0);
  const scopeKey = sessionScopeKey(session);
  const companyId = workforceCompanyId(session.company);
  const [state, setState] = useState<PeopleState>({ status: "loading", scopeKey });
  useEffect(() => {
    if (!companyId) {
      queueMicrotask(() => setState({
        status: "error",
        scopeKey,
        message: "Choose a specific assigned business to view its people directory.",
      }));
      return;
    }
    const controller = new AbortController();
    let current = true;
    queueMicrotask(() => {
      if (current) setState({ status: "loading", scopeKey });
    });
    staffPortalApi<unknown>(`/api/hr/workflows/employees?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!isEmployeeDirectoryResponse(response)) {
          setState({ status: "error", scopeKey, message: "The Staff Portal service returned an invalid response." });
          return;
        }
        setState({ status: "ready", scopeKey, employees: response.employees });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setState({ status: "error", scopeKey, message: apiErrorMessage(error) });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [companyId, refresh, scopeKey]);
  const current = state.scopeKey === scopeKey ? state : { status: "loading" as const, scopeKey };
  const employees = current.status === "ready" ? current.employees : [];
  const directoryRows: RecordData[] = employees.map((employee) => ({
    id: employee.employeeNo || employee.id,
    module: module.id,
    title: employee.displayName,
    subtitle: employee.jobTitle || "Job Title Not Supplied",
    company: session.company,
    status: employee.status || "Status Not Supplied",
    owner: employee.displayName,
    amount: 0,
    due: "",
    fields: {
      ...(employee.employeeNo ? { "Employee Number": employee.employeeNo } : {}),
      ...(employee.email ? { "Work Email": employee.email } : {}),
      ...(employee.jobTitle ? { "Job Title": employee.jobTitle } : {}),
      ...(employee.department ? { Department: employee.department } : {}),
    },
    evidence: [],
    history: [],
  }));
  return (
    <>
      <div className="p-people-toolbar">
        <div>
          <Users size={26} />
          <strong>{current.status === "ready" ? `${employees.length} employees available` : "Employees available to you"}</strong>
        </div>
        <Btn variant="outline" onClick={() => setRefresh((value) => value + 1)} disabled={!companyId || current.status === "loading"}>Refresh</Btn>
      </div>
      {current.status === "loading" ? <Panel title="Loading Employees"><p role="status" className="p-secondary">Loading the employees you can view…</p></Panel>
        : current.status === "error" ? <Callout tone="neutral" title="People directory unavailable"><p>{current.message}</p></Callout>
        : employees.length === 0 ? <Empty title="No Employees Available" message="No employee records are available for this business." />
        : (
          <AdaptiveRecordWorkspace
            module={module}
            rows={directoryRows}
            allowDedicatedPage={false}
            recordNoun="Employee"
            defaultSort="Title"
            sortOptions={["Title", "Status"]}
            identityFacts={(row) => [
              { label: "Employee Number", value: row.id },
              { label: "Department", value: row.fields.Department || "Not Supplied" },
              { label: "Job Title", value: row.fields["Job Title"] || "Not Supplied" },
            ]}
          />
      )}
      {current.status === "ready" && <p className="p-secondary">Only the employee details you are allowed to view are shown. Full employee records and confidential HR details stay protected.</p>}
    </>
  );
}
function Calendar({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const [month, setMonth] = useState(8),
    [day, setDay] = useState(11);
  const { session, create } = useLab();
  const d = new Date(2026, month, 1),
    offset = (d.getDay() + 6) % 7,
    days = new Date(2026, month + 1, 0).getDate();
  return (
    <div className="p-calendar-layout">
      <Panel
        className="p-main-calendar"
        title={d.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        })}
        kicker={
          m.id === "leave"
            ? "TEAM COVERAGE"
            : m.id === "leases"
              ? "LEASE & PAYMENT SCHEDULE"
              : "INTERVIEW SCHEDULE"
        }
        action={
          <div className="p-button-row">
            <Btn
              variant="quiet"
              onClick={() => setMonth(month - 1)}
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </Btn>
            <Btn
              variant="quiet"
              onClick={() => setMonth(month + 1)}
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </Btn>
          </div>
        }
      >
        <div className="p-calendar weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((s) => (
            <strong key={s}>{s}</strong>
          ))}
        </div>
        <div className="p-calendar big">
          {Array.from({ length: offset }, (_, i) => (
            <i key={"empty" + i} />
          ))}
          {Array.from({ length: days }, (_, i) => (
            <button
              key={i}
              className={day === i + 1 ? "selected" : ""}
              onClick={() => setDay(i + 1)}
            >
              <strong>{i + 1}</strong>
              {[12, 15, 18].includes(i + 1) &&
                rows[[12, 15, 18].indexOf(i + 1)] && (
                  <span className={`event event-${i % 3}`}>
                    {rows[[12, 15, 18].indexOf(i + 1)].title.split(" · ")[0]}
                  </span>
                )}
            </button>
          ))}
        </div>
      </Panel>
      <aside>
        <Panel
          title={
            m.id === "leave"
              ? "Your leave balance"
              : m.id === "leases"
                ? "Schedule attention"
                : "Interview readiness"
          }
        >
          {m.id === "leave" ? (
            <>
              <Metric
                label="Annual leave"
                value="12 days"
                detail="Demo balance · Subject to policy"
              />
              <div className="p-service-row">
                <span>Pending</span>
                <strong>5 days</strong>
              </div>
              <div className="p-service-row">
                <span>Scheduled absence</span>
                <strong>14–18 Sep</strong>
              </div>
            </>
          ) : (
            <Metric
              label="Items this period"
              value={String(rows.length)}
              detail="Review upcoming commitments"
            />
          )}
          <Btn className="p-full p-spaced" onClick={() => create(m)}>
            {m.primary}
          </Btn>
        </Panel>
        <Panel title={`Selected day · ${day}`}>
          <p className="p-secondary">
            {[12, 15, 18].includes(day)
              ? "One scheduled record. Open it to review details."
              : "No scheduled records for the selected demo day."}
          </p>
          {[12, 15, 18].includes(day) && rows[[12, 15, 18].indexOf(day)] && (
            <Btn
              variant="outline"
              onClick={() => open(rows[[12, 15, 18].indexOf(day)])}
            >
              Open scheduled record
            </Btn>
          )}
        </Panel>
        <Panel title="Upcoming">
          <div className="p-action-list">
            {rows.map((r) => (
              <button key={r.id} onClick={() => open(r)}>
                <CalendarDays size={18} />
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.due} · {r.status}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
type PayrollState =
  | { status: "loading"; scopeKey: string }
  | { status: "ready"; scopeKey: string; runs: PayrollRun[] }
  | { status: "error"; scopeKey: string; message: string };

function Payroll() {
  const { session } = useLab();
  const scopeKey = sessionScopeKey(session);
  const companyId = workforceCompanyId(session.company);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<PayrollState>({ status: "loading", scopeKey });
  useEffect(() => {
    if (!companyId) {
      queueMicrotask(() => setState({ status: "error", scopeKey, message: "Choose a specific assigned business to view payroll." }));
      return;
    }
    const controller = new AbortController();
    let current = true;
    queueMicrotask(() => { if (current) setState({ status: "loading", scopeKey }); });
    staffPortalApi<unknown>(`/api/payroll/runs?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!isPayrollRunsResponse(response)) {
          setState({ status: "error", scopeKey, message: "We could not load payroll information. Please try again." });
          return;
        }
        setState({ status: "ready", scopeKey, runs: response.runs });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setState({ status: "error", scopeKey, message: apiErrorMessage(error) });
      });
    return () => { current = false; controller.abort(); };
  }, [companyId, refresh, scopeKey]);
  const current = state.scopeKey === scopeKey ? state : { status: "loading" as const, scopeKey };
  if (current.status === "loading") return <Panel title="Loading payroll"><p role="status" className="p-secondary">Loading authorized payroll runs…</p></Panel>;
  if (current.status === "error") return <><Callout tone="neutral" title="Payroll unavailable"><p>{current.message}</p></Callout><Btn variant="outline" onClick={() => setRefresh((value) => value + 1)} disabled={!companyId}><RefreshCw size={16} />Retry</Btn></>;
  if (!current.runs.length) return <Empty title="No Payroll Runs" message="No payroll runs are available for this business." action={<Btn variant="outline" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} />Refresh</Btn>} />;
  const run = current.runs.find((item) => item.id === selected) || current.runs[0];
  const toNaira = (kobo: number) => money(kobo / 100);
  return <>
    <Panel className="p-payroll-header">
      <div><span className="p-kicker">PAYROLL CONTROL · CURRENT BUSINESS</span><h2>Prepare with confidence.<br />Release with control.</h2><p>{run.runNo}</p></div>
      <div className="p-payroll-summary"><Metric label="Gross pay" value={toNaira(run.totalGrossKobo)} /><Metric label="Net pay" value={toNaira(run.totalNetKobo)} /><Badge>{run.status}</Badge></div>
    </Panel>
    <div className="p-payroll-workspace">
      <Panel title="Payroll Run" kicker="CURRENT BUSINESS">
        <Pick label="Payroll run" value={run.id} onChange={setSelected} options={current.runs.map((item) => ({ value: item.id, label: `${item.runNo} · ${item.status}` }))} />
        <dl className="p-detail-fields"><div><dt>Period</dt><dd>{run.periodStart} – {run.periodEnd}</dd></div><div><dt>Pay date</dt><dd>{run.payDate}</dd></div><div><dt>Deductions</dt><dd>{toNaira(run.totalDeductionsKobo)}</dd></div><div><dt>Status</dt><dd>{run.status}</dd></div></dl>
        <Callout tone="neutral" title="Payroll Actions Are Not Available Here"><p>Use the approved payroll process for drafting, review, approval and payment updates.</p></Callout>
      </Panel>
      <Panel title="Run archive" action={<Btn variant="outline" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} />Refresh</Btn>}>
        <div className="p-action-list">{current.runs.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={item.id === run.id}><FileText size={18} /><span><strong>{item.runNo}</strong><small>{item.periodStart} – {item.periodEnd} · {item.status}</small></span><ChevronRight size={15} /></button>)}</div>
      </Panel>
    </div>
  </>;
}

type HrOverviewState =
  | { status: "loading"; scopeKey: string }
  | { status: "ready"; scopeKey: string; data: HrOverviewData }
  | { status: "error"; scopeKey: string; message: string };

function HrOverview() {
  const { session, go } = useLab();
  const scopeKey = sessionScopeKey(session);
  const companyId = workforceCompanyId(session.company);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<HrOverviewState>({ status: "loading", scopeKey });
  useEffect(() => {
    if (!companyId) {
      queueMicrotask(() => setState({ status: "error", scopeKey, message: "Choose a specific assigned business to view HR operations." }));
      return;
    }
    const controller = new AbortController();
    let current = true;
    queueMicrotask(() => { if (current) setState({ status: "loading", scopeKey }); });
    staffPortalApi<unknown>(`/api/hr/workflows/overview?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!isHrOverview(response) || response.companyId !== companyId) {
          setState({ status: "error", scopeKey, message: "We could not load the HR summary. Please try again." });
          return;
        }
        setState({ status: "ready", scopeKey, data: response });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setState({ status: "error", scopeKey, message: apiErrorMessage(error) });
      });
    return () => { current = false; controller.abort(); };
  }, [companyId, refresh, scopeKey]);
  const current = state.scopeKey === scopeKey ? state : { status: "loading" as const, scopeKey };
  if (current.status === "loading") return <Panel title="Loading HR operations"><p role="status" className="p-secondary">Loading authorized HR workload totals…</p></Panel>;
  if (current.status === "error") return <><Callout tone="neutral" title="HR operations unavailable"><p>{current.message}</p></Callout><Btn variant="outline" onClick={() => setRefresh((value) => value + 1)} disabled={!companyId}><RefreshCw size={16} />Retry</Btn></>;
  const cards = [
    { label: "Active employees", value: current.data.employees, moduleId: "people" },
    { label: "Pending leave", value: current.data.pendingLeave, moduleId: "leave" },
    { label: "Open reviews", value: current.data.openReviews, moduleId: "performance" },
    { label: "Open cases", value: current.data.openCases, moduleId: "hr-cases" },
    { label: "Active lifecycle", value: current.data.activeLifecycle, moduleId: "lifecycle" },
  ].filter((item) => canView(byId(item.moduleId), session));
  return <>
    <div className="p-hr-overview-head"><div><span className="p-kicker">HR OPERATIONS · COMPANY-SCOPED</span><h2>People work, without cross-company exposure.</h2><p>Counts come from the authorized HR workflow service and reset whenever your company, identity, role or permissions change.</p></div><Btn variant="outline" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} />Refresh</Btn></div>
    {cards.length ? <div className="p-hr-overview-grid">{cards.map((item) => <button key={item.moduleId} onClick={() => go(item.moduleId)}><span>{item.label}</span><strong>{item.value.toLocaleString("en-GB")}</strong><small>Open authorized workspace <ChevronRight size={14} /></small></button>)}</div> : <Empty title="No HR workspaces assigned" message="No authorized HR destination is available for this session." />}
    <Callout tone="neutral" title="Confidential HR Details Stay Protected"><p>This summary shows only the totals you are allowed to view. Confidential employee records are not shown here.</p></Callout>
  </>;
}
function Payslips({ rows }: { rows: RecordData[] }) {
  const [selected, setSelected] = useState(0);
  const r = rows[selected] || rows[0];
  if (!r) return <Empty title="No authorized payslips" />;
  const statement = payrollStatementPresentation(r.status);
  return (
    <div className="p-payslip-layout">
      <aside>
        <Panel title="Your statements">
          {rows.map((r, i) => (
            <button
              className={`p-statement-choice ${i === selected ? "active" : ""}`}
              key={r.id}
              onClick={() => setSelected(i)}
            >
              <FileText size={22} />
              <span>
                <strong>{payrollStatementTitle(r.title, r.status)}</strong>
                <small>{payrollStatementPresentation(r.status).archiveState}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </Panel>
      </aside>
      <Panel className="p-payslip">
        <div className="p-statement-head">
          <Logo />
          <span>
            {statement.heading}
            <br />
            <strong>{payrollStatementTitle(r.title, r.status)}</strong>
          </span>
        </div>
        <div className="p-statement-person">
          <h2>{r.owner}</h2>
          <p>DN-0104 · Production Coordinator</p>
          <Badge tone={statement.kind === "final" ? "green" : undefined}>
            {statement.kind === "final" ? "Final Demo Payslip" : "Pre-Settlement Statement"}
          </Badge>
        </div>
        <div className="p-statement-lines">
          <h3>Earnings</h3>
          <div>
            <span>Gross pay</span>
            <strong>{money(Number(r.fields["Gross Pay"] || 0))}</strong>
          </div>
          <h3>Deductions</h3>
          <div>
            <span>Approved deductions</span>
            <strong>{money(Number(r.fields.Deductions || 0))}</strong>
          </div>
          <div className="p-statement-total">
            <span>{statement.netAmountLabel}</span>
            <strong>{money(Number(r.fields["Net Pay"] || 0))}</strong>
          </div>
        </div>
        <Callout tone="neutral" title={statement.calloutTitle}>
          {statement.calloutMessage}
        </Callout>
        {statement.canDownloadFinalPayslip ? (
          <DownloadCSV rows={[r]} title={statement.downloadTitle} />
        ) : (
          <p className="p-secondary" role="status">
            Your final payslip will be available after Payroll confirms a Paid or Settled status.
          </p>
        )}
      </Panel>
    </div>
  );
}
function Board({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { go, create } = useLab();
  const [filter, setFilter] = useState("All jobs");
  const printing = m.kind === "printing",
    recruit = m.kind === "recruitment";
  const stages = printing
    ? ["Pre-production", "Production", "Finishing & QC", "Delivery"]
    : recruit
      ? ["Applied", "Screening", "Interview", "Offer"]
      : m.stages.slice(0, 4);
  return (
    <>
      <div className={`p-board-header ${printing ? "printing" : ""}`}>
        <div>
          <span className="p-kicker">
            {printing
              ? "PRINTING & TECHNOLOGY"
              : recruit
                ? "RECRUITMENT PIPELINE"
                : "WORKSTREAM"}
          </span>
          <h2>
            {printing
              ? "From approved proof to finished work."
              : recruit
                ? "A considered path to the right hire."
                : "Keep ownership clear at every stage."}
          </h2>
          <p>
            {printing
              ? "Proof approval, material use and QC remain part of the job record."
              : recruit
                ? "Review each candidate and keep the hiring handoff accountable."
                : m.purpose}
          </p>
        </div>
        <div className="p-board-stats">
          <Metric
            label={recruit ? "Candidates" : "Active work"}
            value={String(rows.length)}
          />
          <Metric
            label={recruit ? "In interview" : "Evidence required"}
            value="1"
          />
        </div>
      </div>
      {printing && (
        <div className="p-machine-strip">
          {[
            "Press 01 · Available",
            "Press 02 · Running (Demo)",
            "Finishing · 68% Load",
            "QC · Review Queue",
          ].map((s, i) => (
            <button
              key={s}
              onClick={() => (i === 3 ? open(rows[0]) : go("print-materials"))}
            >
              <Printer size={18} />
              <span>{s}</span>
              <i style={{ width: `${[30, 86, 68, 45][i]}%` }} />
            </button>
          ))}
        </div>
      )}
      {recruit && (
        <div className="p-funnel-strip">
          {[
            ["Applied", 24],
            ["Screened", 12],
            ["Interview", 6],
            ["Offer", 2],
          ].map(([s, v]) => (
            <div key={s}>
              <span>{s}</span>
              <strong>{v}</strong>
              <small>Demo pipeline volume</small>
            </div>
          ))}
        </div>
      )}
      <div className="p-board-toolbar">
        <span>{rows.length} authorized records · Demo</span>
        <Pick
          label="Board filter"
          value={filter}
          onChange={setFilter}
          options={["All jobs", "Needs evidence", "My assignments"]}
        />
        <Btn variant="outline" onClick={() => create(m)}>
          <Plus size={16} />
          Add {recruit ? "candidate" : "work"}
        </Btn>
      </div>
      <div className="p-production-board">
        {stages.map((stage, i) => (
          <section className="p-production-lane" key={stage}>
            <header>
              <span className={`lane-dot tone-${i}`} />
              <h3>{stage}</h3>
              <small>{i < rows.length ? 1 : 0}</small>
            </header>
            <div className="p-board-cards">
              {rows
                .filter(
                  (r, j) =>
                    j === i &&
                    (filter !== "Needs evidence" || !r.evidence.length),
                )
                .map((r) => (
                  <button key={r.id} onClick={() => open(r)}>
                    <small className="p-kicker">{r.id}</small>
                    <h3>{r.title}</h3>
                    <p className="p-secondary">{r.subtitle}</p>
                    <Badge>{r.status}</Badge>
                    <div className="p-card-progress">
                      <span>
                        Next:{" "}
                        {m.required && !r.fields[m.required]
                          ? m.required
                          : "Review record"}
                      </span>
                    </div>
                    <span>
                      <Avatar name={r.owner} />
                      <small>
                        {r.owner}
                        <br />
                        {r.due}
                      </small>
                      <ArrowUpRight size={17} />
                    </span>
                  </button>
                ))}
              {i >= rows.length && (
                <div className="p-lane-empty">
                  <Check size={18} />
                  <span>No work at this stage</span>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      {printing && (
        <Panel title="Complete production lifecycle">
          <div className="p-flow-strip">
            {m.stages.map((s, i) => (
              <span key={s}>
                {String(i + 1).padStart(2, "0")} <strong>{s}</strong>
                {i < m.stages.length - 1 && <ChevronRight size={13} />}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
function Bakery({
  rows,
  open,
}: {
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { go } = useLab();
  return (
    <>
      <div className="p-bakery-top">
        <div>
          <span className="p-kicker">PRODUCTION DAY · 11 SEPTEMBER</span>
          <h2>
            Know what went in.
            <br />
            Account for what came out.
          </h2>
          <p>
            Batch planning, actual yield and dispatch in one operating view.
          </p>
        </div>
        <div>
          <Metric label="Planned output · Demo" value="1,800 units" />
          <Metric
            label="Batch accountability"
            value="1 yield missing"
            detail="Required before completion"
          />
        </div>
      </div>
      <div className="p-bakery-layout">
        <Panel title="Today's production schedule" kicker="BATCH TIMELINE">
          <div className="p-production-hours">
            <span>Batch</span>
            {["06:00", "08:00", "10:00", "12:00", "14:00"].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          {rows.map((r, i) => (
            <button key={r.id} className="p-batch-row" onClick={() => open(r)}>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.fields.Recipe} · {r.fields.Oven}
                </small>
              </div>
              <div className="p-batch-track">
                <span
                  style={{ left: i * 12 + "%", width: [60, 45, 35][i] + "%" }}
                  className={`batch-${i}`}
                >
                  {r.status}
                </span>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
          <div className="p-button-row">
            <Btn variant="outline" onClick={() => go("bakery-recipes")}>
              Recipes & ingredients
            </Btn>
            <Btn variant="outline" onClick={() => go("bakery-sales")}>
              Dispatch & remittance
            </Btn>
          </div>
        </Panel>
        <Panel title="Yield reconciliation" kicker="ACCOUNTABILITY">
          <Metric label="Actual vs expected · Demo" value="97.3%" />
          <Bars
            items={[
              { label: "Expected yield", value: 600, max: 600 },
              { label: "Recorded actual", value: 584, max: 600 },
              { label: "Waste", value: 16, max: 600, color: "#cc8a44" },
            ]}
            unit=" units"
          />
          <Callout title="Actual yield required">
            The morning batch cannot close until actual output is recorded.
          </Callout>
          <Btn className="p-full" onClick={() => open(rows[0])}>
            Open batch record
            <ArrowRight size={16} />
          </Btn>
        </Panel>
      </div>
      <div className="p-two">
        <Panel title="Ingredient consumption" kicker="ISSUE & ACTUAL">
          <Viz
            type="bar"
            unit="kg · Demo batches"
            data={[
              { name: "Flour", revenue: 240, cost: 236 },
              { name: "Sugar", revenue: 48, cost: 46 },
              { name: "Butter", revenue: 32, cost: 31 },
              { name: "Yeast", revenue: 6, cost: 6 },
            ]}
          />
        </Panel>
        <Panel title="Expiry & dispatch attention">
          <div className="p-service-links">
            {[
              ["Signature loaves", "Dispatch by 02:00 PM", "bakery-sales"],
              ["Premium flour", "Reorder level reached", "inventory"],
              [
                "Wholesale remittance",
                "Reconciliation required",
                "bakery-sales",
              ],
            ].map(([a, b, c]) => (
              <button key={a} onClick={() => go(c)}>
                <span>
                  {a}
                  <Badge>{b}</Badge>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
function Autos({
  rows,
  open,
}: {
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { go } = useLab();
  const [selected, setSelected] = useState(0),
    [view, setView] = useState("Inventory");
  const r = rows[selected] || rows[0];
  return (
    <>
      <div className="p-auto-heading">
        <div>
          <span className="p-kicker">DAENEM AUTOS / VEHICLE SALES</span>
          <h2>A considered view of your inventory.</h2>
        </div>
        <Pick
          label="Vehicle view"
          value={view}
          onChange={setView}
          options={["Inventory", "Data"]}
        />
        <Btn variant="outline" onClick={() => go("auto-leads")}>
          Sales pipeline
          <ArrowUpRight size={16} />
        </Btn>
      </div>
      {view === "Data" ? (
        <RecordsTable
          rows={rows}
          onOpen={open}
          financial
          title="Vehicle inventory"
        />
      ) : (
        <div className="p-auto-layout">
          <div className="p-vehicle-list">
            {rows.map((v, i) => (
              <button
                key={v.id}
                className={i === selected ? "selected" : ""}
                onClick={() => setSelected(i)}
              >
                <div className={`p-vehicle-identity car-${i}`}>
                  <Car size={62} strokeWidth={1} />
                  <span>{v.fields["Model Year"]}</span>
                </div>
                <div>
                  <Badge>{v.status}</Badge>
                  <h3>{v.title}</h3>
                  <small>VIN {v.fields["VIN / Chassis"]}</small>
                  <strong>{money(v.amount)}</strong>
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
          {r && (
            <Panel className="p-vehicle-detail">
              <span className="p-kicker">SELECTED INVENTORY</span>
              <h2>{r.title}</h2>
              <p className="p-secondary">
                {r.fields["VIN / Chassis"]} · Demo inventory record
              </p>
              <div className="p-vehicle-price">
                <Metric label="Asking price" value={money(r.amount)} />
                <Badge>Available for sales review</Badge>
              </div>
              <Steps
                steps={[
                  "Acquisition",
                  "Documentation",
                  "Available",
                  "Sale",
                  "Delivery",
                ]}
                current={1}
              />
              <dl className="p-detail-fields">
                <div>
                  <dt>Landed cost</dt>
                  <dd>{money(Number(r.fields["Landed Cost"]))}</dd>
                </div>
                <div>
                  <dt>Potential gross margin</dt>
                  <dd>{money(r.amount - Number(r.fields["Landed Cost"]))}</dd>
                </div>
                <div>
                  <dt>Documentation</dt>
                  <dd>Review Required</dd>
                </div>
                <div>
                  <dt>Stock age</dt>
                  <dd>{[26, 42, 18][selected]} days · Demo</dd>
                </div>
              </dl>
              <Callout title="Document review before delivery">
                Review ownership and vehicle documents before completing the
                sales handoff.
              </Callout>
              <div className="p-button-row">
                <Btn onClick={() => open(r)}>Open vehicle record</Btn>
                <Btn variant="outline" onClick={() => go("auto-leads")}>
                  View prospects
                </Btn>
              </div>
            </Panel>
          )}
        </div>
      )}
      <div className="p-two">
        <Panel title="Inventory aging" kicker="SALES PRIORITIES">
          <Bars
            items={rows.map((r, i) => ({
              label: r.title,
              value: [26, 42, 18][i],
              max: 60,
              color: i === 1 ? "#af8458" : "#7d86b1",
            }))}
            unit=" days"
            onSelect={(s) => {
              const r = rows.find((r) => r.title === s);
              if (r) open(r);
            }}
          />
        </Panel>
        <Panel title="Acquisition to sale" kicker="CAPITAL & MARGIN">
          <Viz
            type="bar"
            unit="₦ millions"
            data={rows.map((r) => ({
              name: r.title.split(" ")[2],
              revenue: r.amount / 1e6,
              cost: Number(r.fields["Landed Cost"]) / 1e6,
            }))}
          />
        </Panel>
      </div>
      <Btn variant="quiet" onClick={() => go("auto-history")}>
        Historical workshop archive · Read-only
        <ArrowUpRight size={15} />
      </Btn>
    </>
  );
}
function Logistics({
  rows,
  open,
}: {
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const [selected, setSelected] = useState(0);
  const { go } = useLab();
  return (
    <>
      <div className="p-dispatch-bar">
        <div>
          <Badge>Illustrative route data</Badge>
          <h2>Dispatch with the full journey in view.</h2>
        </div>
        <div className="p-button-row">
          <Btn variant="outline" onClick={() => go("fleet")}>
            Fleet & drivers
          </Btn>
          <Btn variant="outline" onClick={() => go("trip-costs")}>
            Trip profitability
          </Btn>
        </div>
      </div>
      <div className="p-dispatch-layout">
        <Panel className="p-map-panel">
          <RouteMap
            onSelect={() => {
              if (rows[selected]) open(rows[selected]);
            }}
          />
          <div className="p-route-progress">
            <span>Booking</span>
            <i />
            <span>Dispatch</span>
            <i />
            <strong>In transit</strong>
            <i className="pending" />
            <span>POD</span>
          </div>
          {rows[selected] && (
            <div className="p-selected-trip">
              <div>
                <span className="p-kicker">SELECTED TRIP</span>
                <h2>{rows[selected].title}</h2>
                <p>
                  Ibrahim Musa · {rows[selected].fields.Vehicle} · Demo route
                  progress
                </p>
              </div>
              <Btn onClick={() => open(rows[selected])}>
                Inspect trip
                <ArrowUpRight size={15} />
              </Btn>
            </div>
          )}
        </Panel>
        <Panel title="Dispatch queue" kicker="TRIPS & EXCEPTIONS">
          <div className="p-dispatch-queue">
            {rows.map((r, i) => (
              <button
                key={r.id}
                className={i === selected ? "selected" : ""}
                onClick={() => setSelected(i)}
              >
                <span>
                  <Truck size={17} />
                  {r.id}
                </span>
                <h3>{r.title}</h3>
                <Badge>{r.status}</Badge>
                <p>
                  {r.fields.Driver} · {r.fields.Vehicle}
                </p>
                <small>
                  {!r.fields["Proof of Delivery"]
                    ? "Delivery proof required"
                    : "Evidence attached"}
                </small>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="p-two">
        <Panel title="Route events" kicker="SELECTED TRIP">
          <Timeline
            items={[
              {
                action: "Booking confirmed",
                actor: "Dispatch team",
                time: "11 Sep · 08:00 AM",
              },
              {
                action: "Assigned to Ibrahim Musa",
                actor: "Aminat Bello",
                time: "11 Sep · 08:15 AM",
              },
              {
                action: "In-transit event · Demo",
                actor: "DNG-204",
                time: "11 Sep · 09:40 AM",
              },
              {
                action: "Proof of delivery required",
                actor: "Driver action",
                time: "Before trip closure",
              },
            ]}
          />
        </Panel>
        <Panel title="Delivery accountability">
          <Callout title="POD gates trip closure">
            Proof of delivery must exist before a required trip can close. Open
            the record to attach evidence.
          </Callout>
          <Bars
            items={[
              { label: "Fuel budget used", value: 68, max: 100 },
              { label: "Planned trip progress", value: 72, max: 100 },
            ]}
            unit="%"
          />
          <small className="p-secondary">
            Progress is an illustrative fixture, not GPS telemetry.
          </small>
        </Panel>
      </div>
    </>
  );
}
function Properties({
  rows,
  open,
}: {
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { go } = useLab();
  const [selected, setSelected] = useState(0);
  return (
    <>
      <div className="p-property-banner">
        <div>
          <span className="p-kicker">PROPERTY PORTFOLIO</span>
          <h2>
            Spaces that work.
            <br />
            Returns you can understand.
          </h2>
          <p>Occupancy, collections and property health in one portfolio.</p>
        </div>
        <Metric
          label="Portfolio occupancy · Demo"
          value="87.5%"
          detail="63 occupied / 72 units"
        />
        <Metric
          label="Rent collection · Demo"
          value="₦32.4m"
          detail="Current reporting period"
        />
      </div>
      <div className="p-property-grid">
        {rows.map((r, i) => (
          <Panel key={r.id} className="p-property-card">
            <div className={`p-property-id property-${i}`}>
              <Building2 size={40} strokeWidth={1} />
              <span>{["PARKSIDE", "VICTORIA", "OAKWOOD"][i]}</span>
              <Badge>{r.status}</Badge>
            </div>
            <h2>{r.title}</h2>
            <p className="p-secondary">
              {["Ibadan", "Lagos", "Ikire"][i]} · 24 units · Demo portfolio
            </p>
            <div className="p-unit-grid">
              {Array.from({ length: 24 }, (_, n) => (
                <button
                  key={n}
                  className={n > 20 ? "vacant" : ""}
                  onClick={() => {
                    setSelected(n);
                    go("leases");
                  }}
                  aria-label={`Unit ${n + 1}, ${n > 20 ? "Available" : "Occupied"}`}
                >
                  {String(n + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <div className="p-property-legend">
              <span>21 Occupied</span>
              <span>3 Available</span>
            </div>
            <Btn className="p-full" variant="outline" onClick={() => open(r)}>
              Open property
              <ArrowUpRight size={16} />
            </Btn>
          </Panel>
        ))}
      </div>
      <div className="p-two">
        <Panel title="Collections & arrears">
          <Bars
            unit="%"
            items={[
              { label: "Parkside Residences", value: 94, max: 100 },
              { label: "Victoria Court", value: 86, max: 100 },
              { label: "Oakwood Apartments", value: 91, max: 100 },
            ]}
          />
          <Btn variant="quiet" onClick={() => go("leases")}>
            Review rent schedules
            <ArrowUpRight size={15} />
          </Btn>
        </Panel>
        <Panel title="Upcoming lease expiries">
          <Timeline
            items={[
              {
                action: "Victoria Court · Unit B-12",
                actor: "Renewal review",
                time: "30 September 2026",
              },
              {
                action: "Parkside · Unit A-04",
                actor: "Tenant follow-up",
                time: "15 October 2026",
              },
              {
                action: "Oakwood · Unit C-02",
                actor: "Agent review",
                time: "31 October 2026",
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
function Finance({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { session } = useLab();
  const [period, setPeriod] = useState("September 2026"),
    [tab, setTab] = useState("Analysis");
  const finance = m.kind === "finance",
    spend = m.kind === "spend",
    receive = m.kind === "receivables";
  const visibleCompanies = companies.filter(
    (company) =>
      company.id !== "group" &&
      authorizedCompaniesForModule(session, m).includes(company.id) &&
      (session.company === "group" || session.company === company.id),
  );
  const points =
    period === "August 2026"
      ? [
          { name: "W1", revenue: 4, cost: 3 },
          { name: "W2", revenue: 6, cost: 4 },
          { name: "W3", revenue: 5, cost: 4 },
          { name: "W4", revenue: 4.6, cost: 7.2 },
        ]
      : period === "Q3 2026"
        ? [
            { name: "Jul", revenue: 18.4, cost: 15.8 },
            { name: "Aug", revenue: 19.6, cost: 18.2 },
            { name: "Sep", revenue: 24.6, cost: 18.2 },
          ]
        : [
            { name: "W1", revenue: 5, cost: 4 },
            { name: "W2", revenue: 7, cost: 4.2 },
            { name: "W3", revenue: 6.6, cost: 5 },
            { name: "W4", revenue: 6, cost: 5 },
          ];
  const opening = period === "Q3 2026" ? 38.8 : 42.8,
    inflow = points.reduce((a, p) => a + p.revenue, 0),
    outflow = points.reduce((a, p) => a + p.cost, 0),
    closing = opening + inflow - outflow,
    bridgeMax = opening + inflow + 5;
  return (
    <>
      <div className="p-finance-toolbar">
        <div className="p-period">
          <CalendarDays size={18} />
          <Pick
            label="Financial period"
            value={period}
            onChange={setPeriod}
            options={["September 2026", "August 2026", "Q3 2026"]}
          />
        </div>
        <Badge>All amounts NGN · Demo Data</Badge>
        <DownloadCSV rows={rows} title={m.id} />
      </div>
      {finance ? (
        <div className="p-finance-ribbon">
          <Metric label="Opening balance" value={`₦${opening.toFixed(1)}m`} />
          <span>+</span>
          <Metric label="Period inflow" value={`₦${inflow.toFixed(1)}m`} />
          <span>−</span>
          <Metric label="Period outflow" value={`₦${outflow.toFixed(1)}m`} />
          <span>=</span>
          <Metric
            label="Closing balance · Demo"
            value={`₦${closing.toFixed(1)}m`}
          />
        </div>
      ) : (
        <div className="p-finance-ribbon">
          <Metric
            label={
              receive
                ? "Outstanding receivables"
                : spend
                  ? "Recorded spend exposure"
                  : m.kind === "budget"
                    ? "Budget envelope"
                    : "Reconciliation value"
            }
            value={
              receive
                ? "₦12.8m"
                : spend
                  ? "₦18.2m"
                  : m.kind === "budget"
                    ? "₦32.5m"
                    : "₦688,000"
            }
          />
          <Metric
            label="Evidence / review exceptions"
            value={String(rows.filter((r) => !r.evidence.length).length)}
          />
          <Metric
            label="Reporting period"
            value={period}
            detail="Illustrative operating values"
          />
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="p-tabs">
          <TabsTrigger value="Analysis">
            {finance
              ? "Cash movement"
              : receive
                ? "Aging analysis"
                : spend
                  ? "Spend composition"
                  : "Variance analysis"}
          </TabsTrigger>
          <TabsTrigger value="Records">
            {finance ? "General ledger" : "Source records"}
          </TabsTrigger>
          <TabsTrigger value="Trace">Traceability</TabsTrigger>
        </TabsList>
        <TabsContent value="Analysis">
          <div className="p-two">
            <Panel
              title={
                finance
                  ? "Inflow & outflow"
                  : receive
                    ? "Receivable aging"
                    : spend
                      ? "Spend by company"
                      : "Budget vs actual"
              }
            >
              {receive ? (
                <Bars
                  items={[
                    { label: "Current", value: 6.8, max: 8 },
                    {
                      label: "1–30 days",
                      value: 3.2,
                      max: 8,
                      color: "#80a590",
                    },
                    {
                      label: "31–60 days",
                      value: 1.9,
                      max: 8,
                      color: "#d8a04b",
                    },
                    { label: "61+ days", value: 0.9, max: 8, color: "#bb6554" },
                  ]}
                  unit="m NGN"
                  onSelect={() => rows[0] && open(rows[0])}
                />
              ) : spend ? (
                <div className="p-treemap">
                  {visibleCompanies.map((c, i) => (
                    <button
                      key={c.id}
                      style={{ background: c.color }}
                      onClick={() => rows[0] && open(rows[0])}
                    >
                      <strong>{c.short}</strong>
                      <span>{[6.2, 4.8, 3.1, 2.7, 1.4][i]}m NGN</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Viz
                  type={finance ? "area" : "bar"}
                  unit="₦ millions"
                  data={points}
                />
              )}
            </Panel>
            {spend ? (
              <Panel title="Payment & reconciliation" kicker="RECORDED SPEND">
                <Callout
                  tone="neutral"
                  title="Recorded spend is not confirmed payment"
                >
                  An approved or recorded expense does not confirm that money
                  left a bank account. Payment, refund, reversal and
                  reconciliation details appear only when they are supplied by
                  the payment record.
                </Callout>
                <dl className="p-detail-fields single">
                  <div>
                    <dt>Records in this view</dt>
                    <dd>{rows.length}</dd>
                  </div>
                  <div>
                    <dt>Payment confirmation</dt>
                    <dd>Not available in this review</dd>
                  </div>
                </dl>
              </Panel>
            ) : (
              <Panel title="Period bridge" kicker="RECONCILIATION">
                <div className="p-waterfall">
                  {[
                    { n: "Opening", v: opening, b: 0, c: "base" },
                    { n: "Inflow", v: inflow, b: opening, c: "positive" },
                    { n: "Outflow", v: outflow, b: closing, c: "negative" },
                    { n: "Closing", v: closing, b: 0, c: "base" },
                  ].map((x) => (
                    <div key={x.n}>
                      <div className="p-waterfall-col">
                        <i
                          className={x.c}
                          style={{
                            height: (x.v / bridgeMax) * 100 + "%",
                            bottom: (x.b / bridgeMax) * 100 + "%",
                          }}
                        >
                          <span>{x.v.toFixed(1)}</span>
                        </i>
                      </div>
                      <strong>{x.n}</strong>
                    </div>
                  ))}
                </div>
                <p className="p-secondary">
                  ₦ millions · Illustrative cash bridge for {period}. Opening +
                  inflow − outflow = closing.
                </p>
              </Panel>
            )}
          </div>
        </TabsContent>
        <TabsContent value="Records">
          <RecordsTable
            rows={rows}
            onOpen={open}
            financial
            title={finance ? "General ledger" : m.title + " records"}
          />
        </TabsContent>
        <TabsContent value="Trace">
          <Panel title="Source record → posting → review">
            <Callout tone="neutral" title="Posting truth stays explicit">
              Queued and validation-failed records are not shown as posted.
              Inspect the recorded state and its source history.
            </Callout>
            <Timeline
              items={rows.map((r) => ({
                action: r.title,
                actor: r.owner,
                time: r.status + " · " + r.id,
              }))}
            />
          </Panel>
        </TabsContent>
      </Tabs>
      {tab !== "Records" && (
        <RecordsTable
          rows={rows}
          onOpen={open}
          financial
          title={finance ? "Ledger entries" : "Source records"}
        />
      )}
    </>
  );
}
function Approvals({
  rows,
  open,
}: {
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { mutate, session } = useLab();
  const [view, setView] = useState("Pending review"),
    [selected, setSelected] = useState(""),
    [reason, setReason] = useState("");
  const visible =
    view === "Pending review"
      ? rows.filter((r) => r.status === "Submitted")
      : rows;
  const r = visible.find((r) => r.id === selected) || visible[0];
  const eligible =
    !!r &&
    r.status === "Submitted" &&
    r.owner !== personFor(session) &&
    canAct(byId("expense-approvals")!, session, "approve") &&
    canAct(byId("expenses")!, session, "approve");
  function decide(status: string) {
    if (!r || !eligible) return;
    if (!reason.trim()) return toast.error("Enter a decision reason.");
    if (
      mutate(
        r,
        { "Decision Reason": reason },
        status,
        "Request " + status.toLowerCase(),
      )
    )
      setReason("");
  }
  return (
    <>
      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(v);
          setSelected("");
          setReason("");
        }}
      >
        <TabsList className="p-tabs">
          <TabsTrigger value="Pending review">
            Pending review ·{" "}
            {rows.filter((r) => r.status === "Submitted").length}
          </TabsTrigger>
          <TabsTrigger value="All requests">
            All authorized requests
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {!r ? (
        <Empty
          title="No requests awaiting review"
          message="Submitted requests will appear here. Drafts stay with their maker until submission."
          action={
            <Btn variant="outline" onClick={() => setView("All requests")}>
              View authorized request history
            </Btn>
          }
        />
      ) : (
        <div className="p-approval-desk">
          <Panel title="Assigned decisions" kicker="REVIEW QUEUE">
            <div className="p-approval-queue">
              {visible.map((row) => (
                <button
                  key={row.id}
                  className={row.id === r.id ? "selected" : ""}
                  onClick={() => {
                    setSelected(row.id);
                    setReason("");
                  }}
                >
                  <span>
                    <small>{row.id}</small>
                    <strong>{money(row.amount)}</strong>
                  </span>
                  <h3>{row.title}</h3>
                  <p>
                    {row.owner} · {row.subtitle}
                  </p>
                  <Badge>{row.status}</Badge>
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="p-approval-evidence">
            <span className="p-kicker">SELECTED REQUEST · {r.id}</span>
            <h2>{r.title}</h2>
            <p className="p-secondary">Submitted by {r.owner}</p>
            <div className="p-approval-amount">
              {money(r.amount)}
              <small>
                {r.fields.Category} · {r.fields["Cost Centre"]}
              </small>
            </div>
            <h3>Business purpose</h3>
            <p className="p-secondary">{r.fields.Purpose}</p>
            <div className="p-document-paper">
              <Receipt size={30} />
              <h3>
                {r.evidence.length
                  ? "Supporting evidence attached"
                  : "Evidence is missing"}
              </h3>
              <p>
                {r.evidence.length
                  ? "Review the attachment and full record before making a decision."
                  : "A receipt is required by this expense category. Return the submitted request for evidence."}
              </p>
              <Btn variant="outline" onClick={() => open(r)}>
                Inspect full record
                <ArrowUpRight size={15} />
              </Btn>
            </div>
          </Panel>
          <Panel title="Decision" kicker="MAKER–CHECKER">
            <dl className="p-detail-fields single">
              <div>
                <dt>Reviewer</dt>
                <dd>{personFor(session)}</dd>
              </div>
              <div>
                <dt>Request owner</dt>
                <dd>{r.owner}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  <Badge>{r.evidence.length ? "Attached" : "Required"}</Badge>
                </dd>
              </div>
            </dl>
            {eligible ? (
              <>
                <label className="p-field">
                  Decision reason
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain the decision…"
                  />
                </label>
                <div className="p-decision-buttons">
                  <Btn
                    disabled={!r.evidence.length || !r.fields.Receipt?.trim()}
                    onClick={() => decide("Approved")}
                  >
                    Approve request
                    <Check size={16} />
                  </Btn>
                  <Btn variant="outline" onClick={() => decide("Returned")}>
                    Return for information
                  </Btn>
                  <Btn variant="quiet" onClick={() => decide("Rejected")}>
                    Reject request
                  </Btn>
                </div>
              </>
            ) : (
              <Callout tone="neutral" title="Review is unavailable">
                {r.owner === personFor(session)
                  ? "A different authorized reviewer must decide your request."
                  : r.status !== "Submitted"
                    ? "Only submitted requests are eligible for a decision."
                    : "Your current permission permits viewing this request."}
              </Callout>
            )}
            <p className="p-secondary">
              All decisions are simulated and retained in this record’s local
              audit history.
            </p>
          </Panel>
        </div>
      )}
    </>
  );
}
function Operations({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const [filter, setFilter] = useState("All");
  return (
    <>
      {m.kind === "projects" ? (
        <Panel
          title="Project delivery schedule"
          kicker="MILESTONES / SEPTEMBER–DECEMBER"
        >
          <div className="p-gantt">
            <div className="p-gantt-head">
              <span>Project & owner</span>
              {["Sep", "Oct", "Nov", "Dec"].map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            {rows.map((r, i) => (
              <button key={r.id} onClick={() => open(r)}>
                <div>
                  <strong>{r.title}</strong>
                  <small>{r.owner}</small>
                </div>
                <div className="p-gantt-track">
                  <i
                    style={{ left: i * 8 + "%", width: [65, 50, 70][i] + "%" }}
                  >
                    {[70, 45, 28][i]}% · {r.status}
                  </i>
                  <span
                    className="p-milestone"
                    style={{ left: [65, 58, 86][i] + "%" }}
                  />
                </div>
              </button>
            ))}
          </div>
        </Panel>
      ) : m.kind === "inventory" ? (
        <div className="p-stock-ribbon">
          <Package size={38} />
          <div>
            <h2>Stock accountability, by location.</h2>
            <p>One movement trail from goods received to issue and transfer.</p>
          </div>
          <Metric
            label="Items below reorder"
            value="1"
            detail="Demo inventory"
          />
        </div>
      ) : m.kind === "fleet" ? (
        <Panel title="Fleet readiness matrix">
          <div className="p-fleet-matrix">
            <div>
              <strong>Vehicle</strong>
              <span>Driver</span>
              <span>Fuel</span>
              <span>Documents</span>
              <span>Maintenance</span>
            </div>
            {rows.map((r, i) => (
              <button key={r.id} onClick={() => open(r)}>
                <strong>{r.title}</strong>
                {[
                  "Assigned",
                  "72%",
                  i === 1 ? "Due" : "Valid",
                  i === 2 ? "Due" : "Ready",
                ].map((s, n) => (
                  <Badge key={n}>{s} · Demo</Badge>
                ))}
              </button>
            ))}
          </div>
        </Panel>
      ) : (
        <div className="p-facility-top">
          <div>
            <Monitor size={36} />
            <h2>Healthy assets. Fewer interruptions.</h2>
            <p>
              Prioritize open defects and preventive work by operational impact.
            </p>
          </div>
          <div className="p-asset-health">
            {["Power", "Cooling", "Water", "Safety"].map((s, i) => (
              <button
                key={s}
                onClick={() =>
                  rows[i % rows.length] && open(rows[i % rows.length])
                }
              >
                <span>{s}</span>
                <Badge>{i === 0 ? "Review Due" : "Ready · Demo"}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="p-two">
        <Panel
          title={
            m.kind === "projects"
              ? "Budget vs actual"
              : m.kind === "inventory"
                ? "Stock availability"
                : m.kind === "fleet"
                  ? "Vehicle utilization"
                  : "Work order priorities"
          }
        >
          <Bars
            items={rows.map((r, i) => ({
              label: r.title,
              value: [72, 45, 86][i],
              max: 100,
              color: i === 1 ? "#d5a257" : "#6e9f83",
            }))}
            unit="%"
            onSelect={(s) => {
              const r = rows.find((r) => r.title === s);
              if (r) open(r);
            }}
          />
        </Panel>
        <Panel
          title={
            m.kind === "projects"
              ? "Upcoming milestones"
              : m.kind === "inventory"
                ? "Movement history"
                : "Due next"
          }
        >
          <Timeline
            items={rows.map((r) => ({
              action: r.title,
              actor: r.owner,
              time: r.due + " · " + r.status,
            }))}
          />
        </Panel>
      </div>
      <RecordsTable
        rows={rows}
        onOpen={open}
        title={m.title + " records"}
        financial={m.kind === "projects"}
      />
    </>
  );
}
function StaffWork({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { go, mutate } = useLab();
  const [checked, setChecked] = useDeviceState<string[]>(
    "lifecycle-" + m.id,
    [],
  );
  const publishedFormCards = <PublishedForms />;
  return (
    <>
      {m.kind === "lifecycle" ? (
        <div className="p-lifecycle-layout">
          <Panel title="Lifecycle readiness" kicker="OWNERS & REQUIRED TASKS">
            <Steps steps={m.stages} current={1} />
            <div className="p-lifecycle-checks">
              {[
                "Identity & contact verified",
                "Role and company assigned",
                "Payroll & statutory reviewed",
                "Policies acknowledged",
                "Equipment and access issued",
                "Manager handoff accepted",
              ].map((s, i) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={checked.includes(s)}
                    onChange={() =>
                      setChecked((x) =>
                        x.includes(s) ? x.filter((a) => a !== s) : [...x, s],
                      )
                    }
                  />
                  <span>
                    <strong>{s}</strong>
                    <small>
                      {
                        [
                          "HR team",
                          "Group admin",
                          "Payroll team",
                          "Employee",
                          "IT support",
                          "Manager",
                        ][i]
                      }{" "}
                      · Due 15 Sep
                    </small>
                  </span>
                  <Badge>
                    {checked.includes(s) ? "Complete" : "Action Required"}
                  </Badge>
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Employee handoff">
            <div className="p-action-list">
              {rows.map((r) => (
                <button key={r.id} onClick={() => open(r)}>
                  <Avatar name={r.title} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>{r.status}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </Panel>
        </div>
      ) : m.kind === "reviews" ? (
        <>
          <div className="p-review-banner">
            <div>
              <span className="p-kicker">SEPTEMBER 2026 REVIEW CYCLE</span>
              <h2>
                A useful conversation,
                <br />
                grounded in the work.
              </h2>
              <p>Employee input → Manager commentary → Acknowledgement</p>
            </div>
            <div className="p-review-cycle">
              <Metric
                label="Current phase"
                value="Self review"
                detail="Due 18 September"
              />
            </div>
          </div>
          <div className="p-two">
            <Panel title="Review dimensions">
              <Bars
                unit=" / 5"
                items={[
                  { label: "Quality of work", value: 4, max: 5 },
                  { label: "Accountability", value: 3, max: 5 },
                  { label: "Team collaboration", value: 4, max: 5 },
                  { label: "Delivery", value: 4, max: 5 },
                ]}
              />
              <p className="p-secondary">
                Illustrative ratings. Open the review to add your commentary.
              </p>
            </Panel>
            <Panel title="Review milestones">
              <Timeline
                items={[
                  {
                    action: "Employee self-review",
                    actor: "Daniel Obi",
                    time: "Due 18 Sep",
                  },
                  {
                    action: "Manager commentary",
                    actor: "Aminat Bello",
                    time: "Due 22 Sep",
                  },
                  {
                    action: "Employee acknowledgement",
                    actor: "Daniel Obi",
                    time: "Due 25 Sep",
                  },
                ]}
              />
            </Panel>
          </div>
        </>
      ) : m.kind === "cases" ? (
        <Callout tone="neutral" title="Confidential case workspace">
          Only authorized HR roles and company scopes are represented. Case
          evidence and audit history remain attached to the record.
        </Callout>
      ) : m.kind === "recipes" ? (
        <div className="p-recipe-grid">
          {rows.map((r, i) => (
            <Panel
              key={r.id}
              title={r.title}
              kicker="RECIPE / BILL OF MATERIALS"
            >
              <BookOpen size={28} />
              <dl className="p-detail-fields">
                <div>
                  <dt>Expected yield</dt>
                  <dd>600 units · Demo</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>Reviewed recipe 1.2</dd>
                </div>
              </dl>
              <Bars
                items={[
                  { label: "Flour", value: 100, max: 100 },
                  { label: "Water", value: 62, max: 100 },
                  { label: "Sugar", value: 8, max: 100 },
                  { label: "Butter", value: 5, max: 100 },
                ]}
                unit=" kg"
              />
              <Btn onClick={() => open(r)}>Inspect recipe & ingredients</Btn>
            </Panel>
          ))}
        </div>
      ) : (
        <div className="p-form-shelf">
          {publishedFormCards}
          {rows.map((r, i) => (
            <button key={r.id} onClick={() => open(r)}>
              <div className="p-form-paper">
                <FileText size={35} />
                <span>DAENEM</span>
                <i />
                <i />
                <i />
                <i />
              </div>
              <h3>{r.title}</h3>
              <p>
                {r.status} · Due {r.due}
              </p>
              <span>
                Open form
                <ArrowUpRight size={16} />
              </span>
            </button>
          ))}
        </div>
      )}
      {m.kind === "reviews" && (
        <AdaptiveRecordWorkspace
          module={m}
          rows={rows}
          onOpen={open}
          recordNoun="Review"
          identityFacts={(row) => [
            {
              label: "Employee",
              value: row.fields.Employee || row.title.split(" · ").at(-1) || row.title,
            },
            { label: "Responsible Person", value: row.owner },
            { label: "Due Date", value: row.due || "Not Recorded" },
          ]}
        />
      )}
      {!["forms", "recipes", "lifecycle", "reviews"].includes(m.kind) && (
        <RecordsTable rows={rows} onOpen={open} title={m.title} />
      )}
    </>
  );
}
function Communications({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { go, notice, session, records } = useLab();
  const [publishedRules] = useDeviceState<ConfigVersion[]>(
    "governed-notification-rules-" + session.company,
    [],
  );
  const [selected, setSelected] = useState(0),
    [text, setText] = useDeviceState(
      m.id + "-" + session.personId + "-text",
      "",
    ),
    [stage, setStage] = useDeviceState(
      m.id + "-" + session.personId + "-stage",
      "Draft",
    ),
    [push, setPush] = useDeviceState(
      m.id + "-" + session.personId + "-push",
      false,
    ),
    [ack, setAck] = useDeviceState(
      m.id + "-" + session.personId + "-ack",
      false,
    ),
    [audience, setAudience] = useDeviceState(
      m.id + "-" + session.personId + "-audience",
      "Assigned company",
    ),
    [reply, setReply] = useDeviceState(
      m.id + "-" + session.personId + "-reply",
      "",
    );
  if (m.kind === "notifications") {
    const allowed = modules.filter((a) => canView(a, session));
    const activeRules = activeConfigurations(publishedRules, session);
    const notices = attentionRecords(records, session).filter((r) => {
      const targeted = activeRules.filter((v) => v.target === r.module);
      return (
        !targeted.length ||
        targeted.some(
          (v) =>
            v.definition.channel === "In-app" &&
            (!v.definition.event || r.status === v.definition.event),
        )
      );
    });
    return (
      <Panel title="Your action queue">
        <div className="p-action-list">
          {notices.map((r) => (
            <button
              key={r.module + r.id}
              onClick={() => go(r.module + "/" + encodeURIComponent(r.id))}
            >
              <AlertTriangle size={19} />
              <span>
                <strong>{r.title}</strong>
                <small>
                  {r.status} · {r.owner}
                </small>
              </span>
              <Badge>Action required</Badge>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
        {activeConfigurations(publishedRules, session).length > 0 && (
          <Callout tone="neutral" title="Published notification policy">
            Local notification behavior is using the authorized demo rule:{" "}
            {activeConfigurations(publishedRules, session)[0]?.name ||
              "Published rule"}
            .
          </Callout>
        )}
      </Panel>
    );
  }
  if (m.kind === "broadcast" || m.kind === "encouragement") {
    const encourage = m.kind === "encouragement";
    return (
      <div className="p-compose-layout">
        <Panel
          title={encourage ? "Daily encouragement" : "Broadcast composer"}
          kicker="HUMAN REVIEW REQUIRED"
        >
          <Steps
            steps={
              encourage
                ? ["Generate", "Preview", "Approve", "Publish"]
                : ["Draft", "Preview", "Approve", "Publish"]
            }
            current={[
              "Draft",
              "Preview",
              "Approved",
              "Published (Demo)",
            ].indexOf(stage)}
          />
          {encourage && (
            <Btn
              variant="outline"
              onClick={() => {
                setText(
                  "Good work grows through care, clarity and follow-through. Thank you for the attention you bring to your team today.",
                );
                setStage("Preview");
              }}
            >
              <Plus size={16} />
              {text ? "Regenerate demo draft" : "Generate demo encouragement"}
            </Btn>
          )}
          <label className="p-field p-spaced">
            Audience
            <Pick
              label="Broadcast audience"
              value={audience}
              onChange={setAudience}
              options={
                session.role === "Owner"
                  ? [
                      "Entire group",
                      "Assigned company",
                      "Location",
                      "Department",
                      "Role",
                      "Selected employees",
                    ]
                  : [
                      "Assigned company",
                      "Assigned department",
                      "Selected employees",
                    ]
              }
            />
          </label>
          <label className="p-field">
            Message
            <textarea
              rows={8}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setStage("Draft");
              }}
              placeholder="Write a clear, useful message…"
            />
          </label>
          <div className="p-button-row">
            <label className="p-check">
              <input
                type="checkbox"
                checked={push}
                onChange={(e) => setPush(e.target.checked)}
              />
              Request push notification
            </label>
            <label className="p-check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              Require acknowledgement
            </label>
          </div>
          <div className="p-button-row">
            <Btn
              variant="outline"
              disabled={!text.trim()}
              onClick={() => setStage("Preview")}
            >
              Preview
            </Btn>
            <Btn
              disabled={stage !== "Preview"}
              onClick={() => setStage("Approved")}
            >
              Approve draft
            </Btn>
            <Btn
              disabled={stage !== "Approved"}
              onClick={() => {
                setStage("Published (Demo)");
                notice("Publication simulated. Nothing sent.");
              }}
            >
              Publish simulation
            </Btn>
            {encourage && (
              <Btn
                variant="quiet"
                onClick={() => {
                  setText("");
                  setStage("Draft");
                  notice("Encouragement skipped");
                }}
              >
                Skip today
              </Btn>
            )}
          </div>
        </Panel>
        <aside>
          <Panel title="Audience preview">
            <Badge>{stage}</Badge>
            <h3 className="p-spaced">{audience}</h3>
            <div className="p-message-preview">
              {text || "Your message preview will appear here."}
            </div>
            <div className="p-service-row">
              <span>Push notification</span>
              <strong>{push ? "Requested" : "Not requested"}</strong>
            </div>
            <div className="p-service-row">
              <span>Acknowledgement</span>
              <strong>{ack ? "Required" : "Not required"}</strong>
            </div>
            <Callout tone="neutral" title="Private simulation">
              This preview never sends email, push notifications or real
              broadcasts.
            </Callout>
          </Panel>
          {stage === "Published (Demo)" && (
            <Panel title="Acknowledgements">
              <Metric
                label="Demo recipients"
                value="0 / 12"
                detail="Waiting for simulated acknowledgement"
              />
              <Btn
                variant="outline"
                onClick={() => notice("Demo acknowledgement received")}
              >
                Simulate acknowledgement
              </Btn>
            </Panel>
          )}
        </aside>
      </div>
    );
  }
  if (m.kind === "inbox")
    return (
      <div className="p-inbox-layout">
        <Panel title="Conversations">
          <div className="p-inbox-list">
            {rows.map((r, i) => (
              <button
                key={r.id}
                className={i === selected ? "selected" : ""}
                onClick={() => setSelected(i)}
              >
                <Avatar name={r.title} />
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.status} · Demo channel</small>
                </span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title={rows[selected]?.title || "Conversation"}
          action={<Badge>{stage === "Draft" ? "Assigned" : stage}</Badge>}
        >
          <div className="p-chat-thread">
            <div className="incoming">
              Good morning. Could you help me with an update on my request?
              <small>09:41 AM · Demo message</small>
            </div>
            <div className="outgoing">
              Thanks for reaching out. I’m reviewing the request and will
              confirm the next step.<small>09:44 AM · Demo response</small>
            </div>
            {reply && (
              <div className="outgoing">
                {reply}
                <small>Saved as demo reply</small>
              </div>
            )}
          </div>
          <label className="p-field">
            Reply
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Draft a response…"
            />
          </label>
          <div className="p-button-row">
            <Btn
              disabled={!text.trim()}
              onClick={() => {
                setReply(text);
                setText("");
                setStage("Replied (Demo)");
              }}
            >
              Save demo reply
              <Send size={15} />
            </Btn>
            <Btn variant="outline" onClick={() => setStage("Escalated")}>
              Escalate
            </Btn>
            <Btn
              variant="quiet"
              onClick={() => rows[selected] && open(rows[selected])}
            >
              Conversation record
            </Btn>
          </div>
        </Panel>
      </div>
    );
  if (m.kind === "website")
    return (
      <div className="p-website-layout">
        <Panel title="Page tree">
          <div className="p-page-tree">
            {rows.map((r, i) => (
              <button
                key={r.id}
                className={i === selected ? "selected" : ""}
                onClick={() => setSelected(i)}
              >
                <FileText size={17} />
                {r.title}
              </button>
            ))}
          </div>
          <Btn
            variant="quiet"
            onClick={() => rows[selected] && open(rows[selected])}
          >
            Revision history
          </Btn>
        </Panel>
        <Panel title="Page draft workspace" action={<Badge>{stage}</Badge>}>
          <div className="p-website-canvas">
            <span className="p-kicker">DAENEM GROUP</span>
            <h2>{rows[selected]?.title}</h2>
            <p>
              Draft content and media remain subject to publishing approval.
            </p>
            <label className="p-field">
              Page body
              <textarea
                rows={7}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setStage("Draft");
                }}
                placeholder="Edit the draft page content…"
              />
            </label>
          </div>
          <div className="p-button-row">
            <Btn
              onClick={() => {
                setStage("In Review");
                notice("Demo revision saved");
              }}
            >
              Save & request review
            </Btn>
            <Btn
              variant="outline"
              onClick={() => rows[selected] && open(rows[selected])}
            >
              Open page record
            </Btn>
          </div>
        </Panel>
      </div>
    );
  if (m.kind === "marketing")
    return (
      <>
        <div className="p-marketing-lead">
          <span className="p-kicker">CAMPAIGN INTELLIGENCE</span>
          <h2>
            Follow the audience
            <br />
            all the way to the outcome.
          </h2>
          <p>Demo campaign data · September 2026</p>
        </div>
        <div className="p-two">
          <Panel title="Audience conversion" kicker="CAMPAIGN FUNNEL">
            <div className="p-conversion-funnel">
              {[
                ["Reach", 48000],
                ["Engaged", 12000],
                ["Leads", 1200],
                ["Converted", 180],
              ].map(([a, b], i) => (
                <button
                  key={a}
                  style={{ width: [100, 82, 62, 42][i] + "%" }}
                  onClick={() => rows[0] && open(rows[0])}
                >
                  <span>{a}</span>
                  <strong>{Number(b).toLocaleString()}</strong>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Campaign spend vs response">
            <Viz
              type="scatter"
              unit="Spend & response index (demo)"
              data={[
                { name: "Wholesale", revenue: 12, cost: 18, target: 30 },
                { name: "Vehicle", revenue: 26, cost: 22, target: 40 },
                { name: "Property", revenue: 18, cost: 15, target: 25 },
              ]}
            />
          </Panel>
        </div>
        <RecordsTable rows={rows} onOpen={open} title="Campaigns" />
      </>
    );
  if (m.kind === "communications")
    return (
      <div className="p-notice-board">
        {rows.map((r, i) => (
          <Panel key={r.id} className={i === 0 ? "featured" : ""}>
            <span className="p-kicker">
              {i === 0 ? "GROUP UPDATE" : "TEAM NOTICE"} · DEMO
            </span>
            <h2>{r.title}</h2>
            <p>{r.fields.Message}</p>
            <div>
              <Avatar name="Aminat Bello" />
              <span>Aminat Bello · 11 September</span>
            </div>
            <Btn
              variant={i === 0 ? "light" : "outline"}
              onClick={() => open(r)}
            >
              Read announcement
              <ArrowUpRight size={16} />
            </Btn>
          </Panel>
        ))}
      </div>
    );
  return (
    <>
      <div className="p-social-week">
        <span className="p-kicker">EDITORIAL CALENDAR · SEPTEMBER</span>
        <div className="p-social-days">
          {[
            "MON 7",
            "TUE 8",
            "WED 9",
            "THU 10",
            "FRI 11",
            "SAT 12",
            "SUN 13",
          ].map((s, i) => (
            <section key={s}>
              <strong>{s}</strong>
              {rows[i % 4] && (
                <button onClick={() => open(rows[i % 4])}>
                  <span>{rows[i % 4].fields.Channel || "LinkedIn"}</span>
                  <h3>{rows[i % 4].title}</h3>
                  <Badge>{rows[i % 4].status}</Badge>
                </button>
              )}
            </section>
          ))}
        </div>
      </div>
      <RecordsTable rows={rows} onOpen={open} title="Content & approvals" />
    </>
  );
}
function Audit({
  module: m,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (r: RecordData) => void;
}) {
  const { session } = useLab();
  const canSeeSecurityRisk =
    m.kind === "security" && canAct(m, session, "investigate");
  const presentations = rows.map((row) => ({
    row,
    detail: auditPresentation(row, m.kind, canSeeSecurityRisk),
  }));
  const severityOptions = [
    "All Severity",
    ...new Set(
      presentations
        .map(({ detail }) => detail.risk)
        .filter((risk): risk is string => Boolean(risk)),
    ),
  ];
  const [severity, setSeverity] = useState("All Severity");
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const visibleRows = presentations.filter(
    ({ detail }) => severity === "All Severity" || detail.risk === severity,
  );
  const selectedAudit = visibleRows.find(
    ({ row }) => row.id === selectedAuditId,
  );
  return (
    <>
      {m.kind === "security" && (
        <div className="p-security-layout">
          <Panel title="Security Signals" kicker="AUTHORIZED RECORDS">
            <div className="p-security-metrics">
              <Metric label="Review Queue" value={String(rows.length)} />
              <Metric
                label="Provider Telemetry"
                value="Unavailable"
                detail="No live provider feed is connected"
              />
            </div>
            <Callout tone="neutral" title="Source Boundary">
              This view shows permission-composed records only. Each event states
              whether it is a formal record, client telemetry or a demonstration
              fixture.
            </Callout>
          </Panel>
          <Panel title="Risk And Severity" kicker="AUTHORIZED CONTEXT ONLY">
            {canSeeSecurityRisk && severityOptions.length > 1 ? (
              <>
                <Pick
                  label="Severity"
                  value={severity}
                  onChange={(value) => {
                    setSeverity(value);
                    setSelectedAuditId("");
                  }}
                  options={severityOptions}
                />
                <div className="p-risk-matrix">
                  {severityOptions.slice(1).map((risk) => (
                    <button
                      key={risk}
                      type="button"
                      className={
                        /high|critical/i.test(risk)
                          ? "risk-2"
                          : /medium|review/i.test(risk)
                            ? "risk-1"
                            : "risk-0"
                      }
                      aria-pressed={severity === risk}
                      onClick={() => {
                        setSeverity((current) =>
                          current === risk ? "All Severity" : risk,
                        );
                        setSelectedAuditId("");
                      }}
                    >
                      <strong>
                        {
                          presentations.filter(
                            ({ detail }) => detail.risk === risk,
                          ).length
                        }
                      </strong>
                      <span>{risk}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="p-secondary">
                {canSeeSecurityRisk
                  ? "No recorded risk context is available."
                  : "Risk context requires explicit investigation permission."}
              </p>
            )}
          </Panel>
        </div>
      )}
      <div
        className="p-audit-workspace"
        data-record-open={selectedAudit ? "true" : "false"}
      >
        <Panel
          className="p-audit-master"
          title={
            m.kind === "security"
              ? "Security Event Stream"
              : "Business Audit Trail"
          }
          kicker={
            m.kind === "security"
              ? "SOURCE / ACTOR / OBJECT / RESULT"
              : "ACTOR / OBJECT / ACTION / RESULT"
          }
        >
          <div className="p-audit-stream">
            {visibleRows.map(({ row, detail }) => (
              <button
                key={row.id}
                type="button"
                className={selectedAuditId === row.id ? "selected" : ""}
                onClick={() => setSelectedAuditId(row.id)}
                aria-label={"Inspect " + detail.action}
                aria-pressed={selectedAuditId === row.id}
              >
                <time>{detail.time}</time>
                <span className="p-audit-symbol">
                  <ShieldCheck size={18} />
                </span>
                <div className="p-audit-copy">
                  <span className="p-audit-provenance">{detail.provenance}</span>
                  <strong>{detail.action}</strong>
                  <p>{detail.actor} · {detail.object} · {detail.result}</p>
                  {detail.reason && <p><b>Reason:</b> {detail.reason}</p>}
                  {(detail.before || detail.after) && (
                    <p>
                      <b>Change:</b> {detail.before || "Not Recorded"} →{" "}
                      {detail.after || "Not Recorded"}
                    </p>
                  )}
                </div>
                <Badge>{detail.risk || detail.result}</Badge>
                <ChevronRight size={15} />
              </button>
            ))}
            {!visibleRows.length && (
              <Empty
                title="No Matching Events"
                message="Change the severity filter to review another available event."
              />
            )}
          </div>
        </Panel>
        <Panel
          className="p-audit-detail"
          title={selectedAudit ? "Event Detail" : "Select An Event"}
          kicker={selectedAudit?.detail.provenance || "RECORDED CONTEXT"}
        >
          {selectedAudit ? (
            <>
              <Btn
                variant="quiet"
                className="p-audit-back"
                onClick={() => setSelectedAuditId("")}
              >
                <ChevronLeft size={15} />
                Back To Audit List
              </Btn>
              <dl className="p-detail-fields single">
                <div><dt>Action</dt><dd>{selectedAudit.detail.action}</dd></div>
                <div><dt>Source</dt><dd>{selectedAudit.detail.provenance}</dd></div>
                <div><dt>Actor</dt><dd>{selectedAudit.detail.actor}</dd></div>
                <div><dt>Record</dt><dd>{selectedAudit.detail.object}</dd></div>
                <div><dt>Result</dt><dd>{selectedAudit.detail.result}</dd></div>
                <div><dt>Time</dt><dd>{selectedAudit.detail.time}</dd></div>
                {selectedAudit.detail.reason && (
                  <div><dt>Reason</dt><dd>{selectedAudit.detail.reason}</dd></div>
                )}
                {(selectedAudit.detail.before || selectedAudit.detail.after) && (
                  <>
                    <div><dt>Before</dt><dd>{selectedAudit.detail.before || "Not Recorded"}</dd></div>
                    <div><dt>After</dt><dd>{selectedAudit.detail.after || "Not Recorded"}</dd></div>
                  </>
                )}
                {selectedAudit.detail.risk && (
                  <div><dt>Risk</dt><dd>{selectedAudit.detail.risk}</dd></div>
                )}
              </dl>
              <div className="p-audit-history">
                <h3>Record Timeline</h3>
                {selectedAudit.row.history.length ? (
                  <Timeline
                    items={selectedAudit.row.history.map((entry) => ({
                      action: entry.action,
                      actor: entry.actor,
                      time: entry.time,
                    }))}
                  />
                ) : (
                  <p className="p-secondary">No additional timeline entries are available.</p>
                )}
              </div>
              <Btn variant="outline" onClick={() => open(selectedAudit.row)}>
                Open Full Record
                <ArrowRight size={15} />
              </Btn>
            </>
          ) : (
            <p className="p-secondary">
              Choose an event to review its source, reason, recorded change and timeline.
            </p>
          )}
        </Panel>
      </div>
      <RecordsTable rows={rows} onOpen={open} title={m.title + " explorer"} />
    </>
  );
}

function SelfService() {
  const { session, go, records } = useLab();
  const ids = [
    "profile",
    "attendance",
    "leave",
    "payslips",
    "expenses",
    "forms",
    "files",
    "tasks",
    "performance",
  ];
  const available = ids
    .map(byId)
    .filter((m): m is ModuleDef => !!m && canView(m, session));
  return (
    <div className="p-service-links">
      {available.map((m) => (
        <Panel key={m.id} title={m.title}>
          <p className="p-secondary">{m.purpose}</p>
          <Btn variant="outline" onClick={() => go(m.id)}>
            Open {m.title}
            <ArrowRight size={16} />
          </Btn>
        </Panel>
      ))}
    </div>
  );
}
