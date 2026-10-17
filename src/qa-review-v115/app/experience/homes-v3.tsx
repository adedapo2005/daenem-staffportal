"use client";
import { PublishedWidgets, RecordChart } from "./analytics";
import { PersonalizedDashboard, LocationWeather } from "./technology";
import { useState, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Shield,
  Layers,
  Activity,
} from "lucide-react";
import { useLab } from "./lab-context";
import {
  modules,
  companies,
  canView,
  byId,
  resolveLayout,
  authorizedRecords,
  attentionRecords,
  sessionScopeKey,
} from "./model";
import {
  Panel,
  Btn,
  Metric,
  Badge,
  RouteMap,
  Pick,
  Bars,
  Timeline,
  Empty,
} from "./ui";
import { WorldClockCenter } from "./auth-v3";
import { WorkspaceScenery } from "./scenery-v3";
import { personFor } from "./model";
import { apiErrorMessage, staffPortalApi } from "./staffportal-api";

type MyDayAction = "attendance" | "forms" | "reviews" | "notifications";
type MyDayResponse = {
  date: string;
  attendance: null | {
    status: string;
    workDate: string;
  };
  counts: {
    assignedForms: number;
    requiredSubmissions: number;
    unreadNotices: number;
    activeDocumentRequests: number;
    reviewsToAcknowledge: number;
  };
  upcomingLeave: unknown[];
  obligations: Array<{
    type: string;
    title: string;
    severity: string;
    detail: string;
    action?: MyDayAction;
  }>;
};

type MyDayState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: MyDayResponse }
  | { status: "error"; message: string };

type DashboardSummaryResponse = {
  workDate: string;
  refreshedAt: string;
  scope: "aggregate" | "personal";
  employees?: number;
  present?: number;
  incompleteAttendance?: number;
  pendingApprovals?: number;
  securityAlerts?: number;
  overdueRequirements?: number;
  maintenanceAlerts?: number;
  attendanceRule: string;
};

type DashboardSummaryState =
  | { status: "idle" }
  | { status: "loading"; scopeKey: string }
  | { status: "ready"; scopeKey: string; data: DashboardSummaryResponse }
  | { status: "error"; scopeKey: string; message: string };

const MY_DAY_DESTINATIONS: Record<MyDayAction, string> = {
  attendance: "attendance",
  forms: "forms",
  reviews: "performance",
  notifications: "notifications",
};

function isNonNegativeCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isMyDayResponse(value: unknown): value is MyDayResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<MyDayResponse>;
  const counts = response.counts as Partial<MyDayResponse["counts"]> | undefined;
  const attendance = response.attendance;
  return Boolean(
    typeof response.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(response.date) &&
      counts &&
      [
        counts.assignedForms,
        counts.requiredSubmissions,
        counts.unreadNotices,
        counts.activeDocumentRequests,
        counts.reviewsToAcknowledge,
      ].every(isNonNegativeCount) &&
      (attendance === null ||
        (typeof attendance === "object" &&
          typeof attendance.status === "string" &&
          typeof attendance.workDate === "string")) &&
      Array.isArray(response.upcomingLeave) &&
      Array.isArray(response.obligations) &&
      response.obligations.every(
        (item) =>
          item &&
          typeof item.type === "string" &&
          typeof item.title === "string" &&
          typeof item.severity === "string" &&
          typeof item.detail === "string" &&
          (item.action === undefined ||
            (typeof item.action === "string" &&
              Object.prototype.hasOwnProperty.call(MY_DAY_DESTINATIONS, item.action))),
      ),
  );
}

const DASHBOARD_COUNT_FIELDS = [
  "employees",
  "present",
  "incompleteAttendance",
  "pendingApprovals",
  "securityAlerts",
  "overdueRequirements",
  "maintenanceAlerts",
] as const;

function isDashboardSummaryResponse(value: unknown): value is DashboardSummaryResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<DashboardSummaryResponse>;
  return Boolean(
    typeof response.workDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(response.workDate) &&
      typeof response.refreshedAt === "string" &&
      !Number.isNaN(Date.parse(response.refreshedAt)) &&
      (response.scope === "aggregate" || response.scope === "personal") &&
      typeof response.attendanceRule === "string" &&
      DASHBOARD_COUNT_FIELDS.every(
        (field) => response[field] === undefined || isNonNegativeCount(response[field]),
      ),
  );
}

export default function Homes({
  cockpit = false,
  work = false,
}: {
  cockpit?: boolean;
  work?: boolean;
}) {
  const { session, records, go, open, prefs } = useLab();
  const employee = session.role === "Employee" || work;
  const [period, setPeriod] = useState("All open records");
  const [reviewLayout, setReviewLayout] = useState<number | null>(null);
  const [myDayRefresh, setMyDayRefresh] = useState(0);
  const [myDayState, setMyDayState] = useState<MyDayState>({ status: "idle" });
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const [dashboardState, setDashboardState] = useState<DashboardSummaryState>({ status: "idle" });
  const dashboardScopeKey = sessionScopeKey(session);
  useEffect(() => {
    let current = true;
    const p = new URLSearchParams(window.location.search).get("reviewLayout");
    queueMicrotask(() => {
      if (current) setReviewLayout(p !== null && /^[0-9]$/.test(p) ? Number(p) : null);
    });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!employee) return;
    const controller = new AbortController();
    let current = true;
    queueMicrotask(() => {
      if (current) setMyDayState({ status: "loading" });
    });
    staffPortalApi<unknown>("/api/ess/my-day", { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!isMyDayResponse(response)) {
          setMyDayState({
            status: "error",
            message: "The Staff Portal service returned an invalid response.",
          });
          return;
        }
        setMyDayState({ status: "ready", data: response });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setMyDayState({ status: "error", message: apiErrorMessage(error) });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [employee, myDayRefresh, session.company, session.personId, session.role]);
  useEffect(() => {
    if (employee) return;
    const controller = new AbortController();
    let current = true;
    queueMicrotask(() => {
      if (current) setDashboardState({ status: "loading", scopeKey: dashboardScopeKey });
    });
    staffPortalApi<unknown>("/api/dashboard/summary", { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!isDashboardSummaryResponse(response)) {
          setDashboardState({
            status: "error",
            scopeKey: dashboardScopeKey,
            message: "The Staff Portal service returned an invalid response.",
          });
          return;
        }
        setDashboardState({ status: "ready", scopeKey: dashboardScopeKey, data: response });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setDashboardState({ status: "error", scopeKey: dashboardScopeKey, message: apiErrorMessage(error) });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [dashboardRefresh, dashboardScopeKey, employee]);
  const allowed = modules.filter((m) => canView(m, session)),
    perm = (id: string) => allowed.some((m) => m.id === id);
  const myDayData = myDayState.status === "ready" ? myDayState.data : null;
  const currentDashboardState: DashboardSummaryState = dashboardState.status !== "idle" && dashboardState.scopeKey === dashboardScopeKey
    ? dashboardState
    : { status: "loading", scopeKey: dashboardScopeKey };
  const dashboardData = currentDashboardState.status === "ready" ? currentDashboardState.data : null;
  const myDayDestination = (item: MyDayResponse["obligations"][number]) =>
    item.action ? MY_DAY_DESTINATIONS[item.action] : undefined;
  const canOpenMyDayItem = (item: MyDayResponse["obligations"][number]) => {
    const destination = myDayDestination(item);
    return destination ? perm(destination) : false;
  };
  const dashboardAttention = [
    dashboardData?.securityAlerts !== undefined && dashboardData.securityAlerts > 0 && perm("security")
      ? { id: "security", title: "Security signals", detail: `${dashboardData.securityAlerts} high-priority ${dashboardData.securityAlerts === 1 ? "signal needs" : "signals need"} review.`, destination: "security" }
      : null,
    dashboardData?.pendingApprovals !== undefined && dashboardData.pendingApprovals > 0 && perm("forms")
      ? { id: "approvals", title: "Pending approvals", detail: `${dashboardData.pendingApprovals} ${dashboardData.pendingApprovals === 1 ? "item awaits" : "items await"} authorized review.`, destination: "forms" }
      : null,
    dashboardData?.incompleteAttendance !== undefined && dashboardData.incompleteAttendance > 0 && perm("attendance")
      ? { id: "attendance", title: "Incomplete attendance", detail: `${dashboardData.incompleteAttendance} ${dashboardData.incompleteAttendance === 1 ? "day requires" : "days require"} review.`, destination: "attendance" }
      : null,
    dashboardData?.overdueRequirements !== undefined && dashboardData.overdueRequirements > 0 && perm("forms")
      ? { id: "requirements", title: "Overdue requirements", detail: `${dashboardData.overdueRequirements} ${dashboardData.overdueRequirements === 1 ? "requirement is" : "requirements are"} overdue.`, destination: "forms" }
      : null,
    dashboardData?.maintenanceAlerts !== undefined && dashboardData.maintenanceAlerts > 0 && perm("facilities")
      ? { id: "maintenance", title: "Maintenance alerts", detail: `${dashboardData.maintenanceAlerts} high-priority ${dashboardData.maintenanceAlerts === 1 ? "order needs" : "orders need"} attention.`, destination: "facilities" }
      : null,
  ].filter((item): item is { id: string; title: string; detail: string; destination: string } => Boolean(item));
  const rows = authorizedRecords(records, session),
    active = rows.filter(
      (r) =>
        !/Complete|Closed|Archived|Reconciled|Paid|Resolved/.test(r.status),
    );
  const evidence = rows.filter((r) => {
    const m = byId(r.module);
    return !!m?.required && !r.fields[m.required]?.trim();
  });
  const attention = attentionRecords(records, session);
  const keyOf = (r: { module: string; id: string }) => `${r.module}:${r.id}`;
  const evidenceKeys = new Set(evidence.map(keyOf)),
    attentionKeys = new Set(attention.map(keyOf));
  const selectedRows = period === "Needs attention" ? attention : active;
  const companyRows = companies
    .filter((c) => c.id !== "group")
    .map((c) => ({
      company: c,
      rows: selectedRows.filter((r) => r.company === c.id),
    }))
    .filter((c) => c.rows.length);
  const layout = resolveLayout({
    forced: prefs.forced,
    personal: reviewLayout ?? (prefs.personalLayout ? prefs.layout : null),
    roleDefault: session.role === "Manager" ? 2 : employee ? 7 : null,
    organizationDefault: prefs.orgLayout,
  });
  const dashboardQueue = (
    <Panel
      title="Needs Your Attention"
      kicker="YOUR WORK SUMMARY"
      className="home-queue"
    >
      <div className="p-attention-list" aria-live="polite" aria-busy={currentDashboardState.status === "loading"}>
        {currentDashboardState.status === "loading" && <p className="p-secondary" role="status">Loading your work summary…</p>}
        {currentDashboardState.status === "error" && <Empty title="Dashboard Summary Is Temporarily Unavailable" message={currentDashboardState.message} action={<Btn variant="outline" onClick={() => setDashboardRefresh((value) => value + 1)}>Try Again</Btn>} />}
        {dashboardAttention.slice(0, 5).map((item, index) => (
          <button key={item.id} onClick={() => go(item.destination)}>
            <span className={`p-priority-number n${index}`}>{String(index + 1).padStart(2, "0")}</span>
            <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
      {currentDashboardState.status === "ready" && !dashboardAttention.length && (
        <Empty
          title="Nothing Needs Attention"
          message="No work items need your attention right now."
        />
      )}
    </Panel>
  );
  const employeeQueue = (
    <Panel
      title="Your Next Actions"
      kicker="YOUR WORK"
      className="home-queue"
      action={
        myDayData && myDayData.counts.unreadNotices > 0 && perm("notifications") ? (
          <button className="p-inline-link" onClick={() => go("notifications")}>
            Action Center
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ) : undefined
      }
    >
      <div
        className="p-attention-list"
        aria-live="polite"
        aria-busy={myDayState.status === "loading" || myDayState.status === "idle"}
      >
        {(myDayState.status === "idle" || myDayState.status === "loading") && (
          <p className="p-secondary" role="status">
            Loading your assigned actions…
          </p>
        )}
        {myDayState.status === "error" && (
          <p className="p-secondary">Your action queue is temporarily unavailable.</p>
        )}
        {myDayData?.obligations.slice(0, 5).map((item, index) => {
          const destination = myDayDestination(item);
          const canOpen = canOpenMyDayItem(item);
          const content = (
            <>
              <span className={`p-priority-number n${index}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              {canOpen && <ChevronRight size={17} aria-hidden="true" />}
            </>
          );
          return canOpen && destination ? (
            <button key={`${item.type}:${index}`} onClick={() => go(destination)}>
              {content}
            </button>
          ) : (
            <div className="p-attention-static" key={`${item.type}:${index}`}>
              {content}
            </div>
          );
        })}
      </div>
      {myDayData && !myDayData.obligations.length && (
        <Empty
          title="Nothing Needs Attention"
          message="No work actions need your attention right now."
        />
      )}
    </Panel>
  );
  const queue = employee ? employeeQueue : dashboardQueue;
  const recordPulse = (
    <Panel
      title="Work in Perspective"
      kicker="WORK RECORDS"
      className="home-pulse"
      action={
        <Pick
          label="Work filter"
          value={period}
          onChange={setPeriod}
          options={["All open records", "Needs attention"]}
        />
      }
    >
      <div className="p-chart-summary">
        <strong>
          {selectedRows.length}
          <span> records</span>
        </strong>
        <Badge>Preview Records</Badge>
      </div>
      <Bars
        items={companyRows.map((c) => ({
          label: c.company.name,
          value: c.rows.length,
          max: Math.max(...companyRows.map((c) => c.rows.length), 1),
          color: c.company.color,
        }))}
        unit=" records"
        onSelect={(name) => {
          const row = companyRows.find((c) => c.company.name === name)?.rows[0];
          if (row) open(row);
        }}
      />
      <p className="p-secondary">
        Counts, queues and details use the same work records you can access.
      </p>
    </Panel>
  );
  const dashboardPulseItems = [
    ...(dashboardData?.employees !== undefined && perm("people")
      ? [{ label: "Team members", value: dashboardData.employees, destination: "people" }]
      : []),
    ...(dashboardData?.present !== undefined && perm("attendance")
      ? [{ label: "Present today", value: dashboardData.present, destination: "attendance" }]
      : []),
    ...(dashboardData?.incompleteAttendance !== undefined && perm("attendance")
      ? [{ label: "Incomplete attendance", value: dashboardData.incompleteAttendance, destination: "attendance" }]
      : []),
    ...(dashboardData?.pendingApprovals !== undefined && perm("forms")
      ? [{ label: "Pending approvals", value: dashboardData.pendingApprovals, destination: "forms" }]
      : []),
    ...(dashboardData?.securityAlerts !== undefined && perm("security")
      ? [{ label: "Security alerts", value: dashboardData.securityAlerts, destination: "security" }]
      : []),
    ...(dashboardData?.overdueRequirements !== undefined && perm("forms")
      ? [{ label: "Overdue requirements", value: dashboardData.overdueRequirements, destination: "forms" }]
      : []),
    ...(dashboardData?.maintenanceAlerts !== undefined && perm("facilities")
      ? [{ label: "Maintenance alerts", value: dashboardData.maintenanceAlerts, destination: "facilities" }]
      : []),
  ];
  const dashboardPulse = (
    <Panel title="Operational Pulse" kicker="YOUR WORK SUMMARY" className="home-pulse">
      <div aria-live="polite" aria-busy={currentDashboardState.status === "loading"}>
        {currentDashboardState.status === "loading" && <p className="p-secondary" role="status">Loading your work summary…</p>}
        {currentDashboardState.status === "error" && <Empty title="Operational Pulse Is Temporarily Unavailable" message={currentDashboardState.message} action={<Btn variant="outline" onClick={() => setDashboardRefresh((value) => value + 1)}>Try Again</Btn>} />}
        {currentDashboardState.status === "ready" && dashboardPulseItems.length > 0 && (
          <>
            <div className="p-chart-summary">
              <strong>Your Current Work</strong>
              <Badge>{dashboardData?.scope === "aggregate" ? "Company Summary" : "Personal View"}</Badge>
            </div>
            <Bars
              items={dashboardPulseItems.map((item) => ({
                label: item.label,
                value: item.value,
                max: Math.max(...dashboardPulseItems.map((entry) => entry.value), 1),
              }))}
              unit=""
              onSelect={(label) => {
                const item = dashboardPulseItems.find((entry) => entry.label === label);
                if (item) go(item.destination);
              }}
            />
            {dashboardPulseItems.some((item) => item.destination === "attendance") && dashboardData?.attendanceRule && <p className="p-secondary">{dashboardData.attendanceRule}</p>}
          </>
        )}
        {currentDashboardState.status === "ready" && !dashboardPulseItems.length && <Empty title="No Summary Available" message="There is no summary to show for the work assigned to you." />}
      </div>
    </Panel>
  );
  const pulse = employee ? recordPulse : dashboardPulse;
  const portfolio =
    session.role === "Owner" ? (
      <Panel
        title="Across your businesses"
        kicker="ASSIGNED PORTFOLIO"
        className="home-company"
      >
        <Empty
          title="Portfolio details are unavailable"
          message="Business records are not available for this view."
        />
      </Panel>
    ) : perm("people") ? (
      <Panel title="Your team" className="home-company">
        <Empty
          title="Team details are unavailable"
          message="Team records are not available for this view."
        />
      </Panel>
    ) : null;
  const map = perm("logistics") ? (
    <Panel
      title="Operational routes"
      kicker="SCHEMATIC · NOT LIVE GPS"
      className="home-map"
    >
      <RouteMap compact onSelect={() => go("logistics")} />
    </Panel>
  ) : null;
  const weather = (
    <Panel className="home-weather">
      <LocationWeather compact />
    </Panel>
  );
  const feed = (
    <Panel
      title="Recent record activity"
      kicker="ACTIVITY FEED · NOT THE AUDIT LOG"
      className="home-feed"
    >
      <Timeline
        items={rows
          .flatMap((r) =>
            r.history
              .slice(-1)
              .map((h) => ({ action: h.action, actor: r.title, time: h.time })),
          )
          .slice(0, 4)}
      />
    </Panel>
  );
  const services = perm("integrations") ? (
    <Panel
      title="Connection status"
      kicker="SOURCE AVAILABILITY"
      className="home-services"
    >
      <div className="p-service-row">
        <span>
          <Shield size={16} />
          Production adapters
        </span>
        <Badge>Not connected</Badge>
      </div>
      <p className="p-secondary">
        Provider data is unavailable. No healthy-state values are invented.
      </p>
      <Btn variant="quiet" onClick={() => go("integrations")}>
        Inspect metadata
      </Btn>
    </Panel>
  ) : null;
  const firstDashboardItem = dashboardAttention[0];
  const dashboardFocus = (
    <Panel className="home-focus">
      <span className="p-kicker">TODAY&apos;S FOCUS</span>
      <h2>{currentDashboardState.status === "ready" ? firstDashboardItem?.title || "Everything assigned to you is clear." : currentDashboardState.status === "error" ? "Priorities are unavailable." : "Getting your priorities…"}</h2>
      <p>
        {currentDashboardState.status === "ready" ? firstDashboardItem?.detail || "No work items need your attention right now." : currentDashboardState.status === "error" ? "Try again from the priority queue. No counts are shown until Staff Portal responds." : "Loading your work summary."}
      </p>
      {firstDashboardItem && (
        <Btn onClick={() => go(firstDashboardItem.destination)}>
          Open next action
          <ArrowRight size={16} aria-hidden="true" />
        </Btn>
      )}
    </Panel>
  );
  const firstMyDayItem = myDayData?.obligations[0];
  const firstMyDayDestination = firstMyDayItem ? myDayDestination(firstMyDayItem) : undefined;
  const firstMyDayCanOpen = firstMyDayItem ? canOpenMyDayItem(firstMyDayItem) : false;
  const employeeFocus = (
    <Panel className="home-focus">
      <span className="p-kicker">TODAY&apos;S FOCUS</span>
      <h2>
        {myDayState.status === "ready"
          ? firstMyDayItem?.title || "You are clear for now."
          : myDayState.status === "error"
            ? "Priorities are unavailable."
            : "Getting your priorities…"}
      </h2>
      <p>
        {myDayState.status === "ready"
          ? firstMyDayItem?.detail || "No work actions need your attention right now."
          : myDayState.status === "error"
            ? "Try again in My Day. No tasks are shown until Staff Portal responds."
            : "Loading your assigned work."}
      </p>
      {firstMyDayItem && firstMyDayCanOpen && firstMyDayDestination && (
        <Btn onClick={() => go(firstMyDayDestination)}>
          Open next action
          <ArrowRight size={16} aria-hidden="true" />
        </Btn>
      )}
    </Panel>
  );
  const focus = employee ? employeeFocus : dashboardFocus;
  const myday = employee ? (
    <Panel
      title="My day"
      kicker={myDayState.status === "ready" ? myDayState.data.date : "YOUR WORK"}
      className="home-myday"
    >
      <div aria-live="polite" aria-busy={myDayState.status === "loading"}>
        {(myDayState.status === "idle" || myDayState.status === "loading") && (
          <div className="p-secondary" role="status">
            Loading your assigned work…
          </div>
        )}
        {myDayState.status === "error" && (
          <Empty
            title="My day is temporarily unavailable"
            message={myDayState.message}
            action={
              <Btn variant="outline" onClick={() => setMyDayRefresh((value) => value + 1)}>
                Try again
              </Btn>
            }
          />
        )}
        {myDayState.status === "ready" && !myDayState.data.obligations.length && (
          <Empty
            title={"You're up to date"}
            message="No work actions need your attention right now."
          />
        )}
        {myDayState.status === "ready" &&
          myDayState.data.obligations.map((item, index) => {
            const destination = myDayDestination(item);
            const canOpen = canOpenMyDayItem(item);
            const content = (
              <>
                <span>{item.severity === "urgent" ? "NOW" : item.severity === "warning" ? "DUE" : "INFO"}</span>
                <strong>
                  {item.title}
                  <small>{item.detail}</small>
                </strong>
                {canOpen && <ChevronRight size={17} aria-hidden="true" />}
              </>
            );
            return canOpen && destination ? (
              <button
                className="p-day-task"
                key={`${item.type}:${index}`}
                onClick={() => go(destination)}
              >
                {content}
              </button>
            ) : (
              <div className="p-day-task" key={`${item.type}:${index}`}>
                {content}
              </div>
            );
          })}
      </div>
    </Panel>
  ) : null;
  const clocks = (
    <Panel title="Connected across time zones">
      <WorldClockCenter
        compact
        ids={["ibadan", "toronto", "london", "new-york"]}
      />
    </Panel>
  );
  const hasExecutiveContractPermission =
    perm("banking-operations") ||
    perm("treasury") ||
    perm("payroll-execution") ||
    perm("transfers") ||
    perm("reconciliation");
  const executive =
    session.role === "Owner" && hasExecutiveContractPermission ? (
      <section
        className="v14-executive"
        aria-label="Executive Financial Command Center"
      >
        <header className="v14-executive-head">
          <div>
            <span className="p-kicker">
              EXECUTIVE COMMAND CENTER · CURRENT DATA REQUIRED
            </span>
            <h2>Financial Position and Operating Control</h2>
            <p>
              Financial information remains hidden until current records for
              your assigned companies are available.
            </p>
          </div>
          <Badge>Data unavailable</Badge>
        </header>
        <Empty
          title="Financial command data is unavailable"
          message="No financial totals, records or provider states are shown from design fixtures."
        />
      </section>
    ) : null;
  const employeeMetricDetail =
    myDayState.status === "ready"
      ? "From My Day"
      : myDayState.status === "error"
        ? "Current information unavailable"
        : "Loading current information";
  const employeeOverviewMetrics = [
    {
      id: "attention",
      icon: <Shield />,
      label: "Needs attention",
      value: myDayData ? String(myDayData.obligations.length) : "—",
    },
    ...(perm("forms")
      ? [
          {
            id: "forms",
            icon: <Layers />,
            label: "Assigned forms",
            value: myDayData ? String(myDayData.counts.assignedForms) : "—",
          },
        ]
      : []),
    ...(perm("notifications")
      ? [
          {
            id: "notices",
            icon: <ArrowUpRight />,
            label: "Unread notices",
            value: myDayData ? String(myDayData.counts.unreadNotices) : "—",
          },
        ]
      : []),
    ...(perm("performance")
      ? [
          {
            id: "reviews",
            icon: <ArrowUpRight />,
            label: "Reviews to acknowledge",
            value: myDayData ? String(myDayData.counts.reviewsToAcknowledge) : "—",
          },
        ]
      : []),
  ].slice(0, 3);
  const dashboardMetricDetail =
    currentDashboardState.status === "ready"
      ? `Your work · ${currentDashboardState.data.workDate}`
      : currentDashboardState.status === "error"
        ? "Current information unavailable"
        : "Loading current information";
  const dashboardOverviewMetrics = [
    ...(dashboardData?.employees !== undefined && perm("people")
      ? [{ id: "employees", icon: <Layers />, label: "Team members", value: String(dashboardData.employees) }]
      : []),
    ...(dashboardData?.present !== undefined && perm("attendance")
      ? [{ id: "present", icon: <Activity />, label: "Present today", value: String(dashboardData.present) }]
      : []),
    ...(dashboardData?.pendingApprovals !== undefined && perm("forms")
      ? [{ id: "approvals", icon: <Shield />, label: "Pending approvals", value: String(dashboardData.pendingApprovals) }]
      : []),
    ...(dashboardData?.securityAlerts !== undefined && perm("security")
      ? [{ id: "security", icon: <Shield />, label: "Security alerts", value: String(dashboardData.securityAlerts) }]
      : []),
    ...(dashboardData?.incompleteAttendance !== undefined && perm("attendance")
      ? [{ id: "attendance", icon: <Activity />, label: "Incomplete attendance", value: String(dashboardData.incompleteAttendance) }]
      : []),
    ...(dashboardData?.maintenanceAlerts !== undefined && perm("facilities")
      ? [{ id: "maintenance", icon: <Layers />, label: "Maintenance alerts", value: String(dashboardData.maintenanceAlerts) }]
      : []),
  ].slice(0, 3);
  const ribbon = (
    <>
      <PublishedWidgets />
      <WorkspaceScenery
        layout={cockpit ? 2 : layout}
        name={personFor(session)}
        employee={employee}
      />
      {employee ? (
        <div className="v3-overview-metrics employee-metrics">
          {employeeOverviewMetrics.map((metric) => (
            <div key={metric.id}>
              {metric.icon}
              <Metric
                label={metric.label}
                value={metric.value}
                detail={employeeMetricDetail}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="v3-overview-metrics employee-metrics" aria-live="polite" aria-busy={currentDashboardState.status === "loading"}>
          {dashboardOverviewMetrics.map((metric) => (
            <div key={metric.id}>{metric.icon}<Metric label={metric.label} value={metric.value} detail={dashboardMetricDetail} /></div>
          ))}
          {currentDashboardState.status === "loading" && <p className="p-secondary" role="status">Loading your work summary…</p>}
          {currentDashboardState.status === "error" && <p className="p-secondary">Dashboard metrics are temporarily unavailable.</p>}
        </div>
      )}
      {executive}
    </>
  );
  if (layout === 0 && !cockpit)
    return (
      <>
        {ribbon}
        <PersonalizedDashboard
          widgets={[
            { id: "pulse", title: "Work in perspective", content: pulse },
            {
              id: "chart",
              title: "Status distribution",
              content: (
                <Panel
                  title="Work across the group"
                  kicker="AUTHORIZED RECORDS · SELECT TO INSPECT"
                >
                  <RecordChart
                    rows={selectedRows}
                    kind="Donut"
                    group="company"
                    onSelect={(r) => r[0] && open(r[0])}
                  />
                </Panel>
              ),
            },
            {
              id: "queue",
              title: "Priority queue",
              content: queue,
              required: true,
            },
            {
              id: "portfolio",
              title: "Assigned portfolio",
              content: portfolio,
            },
            { id: "clock", title: "World clocks", content: clocks },
            { id: "weather", title: "Location command", content: weather },
            { id: "activity", title: "Recent activity", content: feed },
            { id: "services", title: "Connection status", content: services },
          ].filter((w) => !!w.content)}
        />
      </>
    );
  if (cockpit || layout === 2)
    return (
      <>
        {ribbon}
        <div className="p-cockpit-grid">
          {map}
          {queue}
          {pulse}
          {weather}
          {portfolio}
          {services}
          {feed}
        </div>
      </>
    );
  if (layout === 3)
    return (
      <>
        {ribbon}
        <div className="p-magazine-home">
          {pulse}
          {portfolio}
          {queue}
          {weather}
          {feed}
        </div>
      </>
    );
  if (layout === 4)
    return (
      <>
        {ribbon}
        <div className="p-home-master">
          {queue}
          <div>
            {focus}
            {pulse}
            {portfolio}
          </div>
        </div>
      </>
    );
  if (layout === 5)
    return (
      <>
        {ribbon}
        <div className="p-home-horizon">
          {pulse}
          {portfolio}
          {queue}
        </div>
        <div className="p-two">
          {map || clocks}
          {feed}
        </div>
      </>
    );
  if (layout === 7)
    return (
      <>
        {ribbon}
        <div className="p-home-focus-layout">
          {focus}
          {queue}
          {myday}
          <div>
            {weather}
            {clocks}
            {services}
          </div>
        </div>
      </>
    );
  if (layout === 8)
    return (
      <div className="p-home-studio">
        <nav className="p-tool-rail" aria-label="Studio shortcuts">
          {["hub", "tasks", "notifications", "layout"]
            .filter(perm)
            .map((id) => (
              <button
                key={id}
                onClick={() => go(id)}
                aria-label={byId(id)!.title}
              >
                <Layers />
              </button>
            ))}
        </nav>
        <div>
          {ribbon}
          {pulse}
          {portfolio}
        </div>
        <aside>
          {queue}
          {services}
          {clocks}
        </aside>
      </div>
    );
  if (layout === 9)
    return (
      <>
        {ribbon}
        <div className="p-home-board">
          {["Needs evidence", "Ready for review", "Other active work"].map(
            (title, i) => {
              const cards =
                i === 0
                  ? evidence
                  : i === 1
                    ? attention.filter((r) => !evidenceKeys.has(keyOf(r)))
                    : active.filter(
                        (r) =>
                          !attentionKeys.has(keyOf(r)) &&
                          !evidenceKeys.has(keyOf(r)),
                      );
              return (
                <Panel
                  key={title}
                  title={title}
                  kicker={`${cards.length} AUTHORIZED RECORDS`}
                >
                  <div className="p-board-cards">
                    {cards.slice(0, 4).map((r) => (
                      <button key={r.module + r.id} onClick={() => open(r)}>
                        <Badge>{r.status}</Badge>
                        <h3>{r.title}</h3>
                        <span>
                          {r.owner}
                          <ArrowUpRight size={16} />
                        </span>
                      </button>
                    ))}
                  </div>
                </Panel>
              );
            },
          )}
        </div>
        {pulse}
      </>
    );
  return (
    <>
      {ribbon}
      <div className={`p-home-grid layout-${layout}`}>
        {layout === 1 ? (
          <>
            {focus}
            {pulse}
            {queue}
            {portfolio}
            {map}
            {weather}
            {feed}
          </>
        ) : layout === 6 ? (
          <>
            {queue}
            {pulse}
            {weather}
            {portfolio}
            {focus}
            {services}
            {feed}
          </>
        ) : (
          <>
            {pulse}
            {queue}
            {portfolio}
            {weather}
            {feed}
            {services}
          </>
        )}
      </div>
    </>
  );
}
