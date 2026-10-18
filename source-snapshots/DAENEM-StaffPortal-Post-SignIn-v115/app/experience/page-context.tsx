"use client";

import { ArrowUpRight, Bookmark, Clock3, Search, Sparkles } from "lucide-react";
import { useLab } from "./lab-context";
import {
  authorizedRecords,
  byId,
  canAct,
  canView,
  recordsAreRelated,
  type ModuleDef,
  type RecordData,
} from "./model";
import { Badge, Btn, Panel } from "./ui";

const domainValue: Record<string, string> = {
  people:
    "Keeps employment identity, assignments, payroll eligibility, attendance, performance and documents connected.",
  attendance:
    "Protects payroll and workforce decisions with complete, reviewable clock events and corrections.",
  payroll:
    "Turns approved earnings, deductions and evidence into controlled payroll preparation—not an assumed payment.",
  recruitment:
    "Moves each authorized candidate from application through interviews, decisions, offer and onboarding.",
  printing:
    "Connects enquiry, quotation, artwork, proof, material custody, production, quality control, delivery and billing.",
  bakery:
    "Reconciles ingredients, output, dispatch custody, bread movement, collections, remittance and investigated variance.",
  logistics:
    "Keeps bookings, vehicle and driver assignment, dispatch, fuel, proof of delivery and remittance in one chain.",
  properties:
    "Connects owners, properties, units, listings, leads, leases, rent schedules and maintenance accountability.",
  finance:
    "Provides governed financial truth across journals, receivables, expenses, budgets, payments and reporting.",
  communications:
    "Coordinates authorized customer conversations, queues, consent, provider lifecycle and audited human approval.",
  "banking-operations":
    "Projects assigned accounts, balances, transactions, transfer controls and reconciliation without moving real money.",
  "payroll-operations":
    "Tracks payroll authorization through per-employee processing, exceptions and authoritative reconciliation.",
  builder:
    "Creates governed configuration versions that require preview, review, approval and publication before use.",
  files:
    "Applies record scope, file-class policy, versioning, retention and separate download authority to every document.",
  security:
    "Explains and investigates authorized security signals without exposing unassigned users, systems or records.",
};

function valueFor(module: ModuleDef) {
  return domainValue[module.id] || domainValue[module.kind] || module.purpose;
}

export function PageContext({
  module,
  selected,
}: {
  module: ModuleDef;
  selected?: RecordData;
}) {
  const { session, records, create, open, go } = useLab();
  const rows = records.filter((row) => row.module === module.id);
  const canCreate = canAct(module, session, "create");
  const canSaved = canView(byId("saved-views"), session);
  const actions = [
    canCreate ? module.primary : rows[0] ? `Inspect ${module.title}` : "",
    rows.length ? `Search ${module.title}` : "",
    canSaved ? "Open Saved Views" : "",
  ].filter(Boolean);
  const primary = () =>
    canCreate ? create(module) : rows[0] ? open(rows[0], module) : undefined;
  const search = () => {
    const field = document.querySelector<HTMLElement>(
      '#main-content input[type="search"], #main-content input[placeholder*="Search"], #main-content input[placeholder*="Find"]',
    );
    if (field) {
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    } else
      document
        .querySelector<HTMLElement>(
          '#main-content [role="table"], #main-content table',
        )
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return (
    <section
      className="v14-page-context"
      aria-label={`${module.title} page overview`}
    >
      <div className="v14-context-copy">
        <span>
          <Sparkles size={15} />
          Overview
        </span>
        <p>
          {selected
            ? `Inspect ${selected.title}, its current state, evidence, related authorized records and accountable history.`
            : module.purpose}
        </p>
      </div>
      <div className="v14-context-value">
        <strong>Business Value</strong>
        <p>{valueFor(module)}</p>
      </div>
      <div className="v14-context-actions">
        <strong>Available Actions</strong>
        <div>
          {actions.map((action, index) => (
            <button
              key={action}
              onClick={
                index === 0
                  ? primary
                  : index === 1
                    ? search
                    : () => go("saved-views")
              }
            >
              <span>
                {index === 0 ? (
                  <ArrowUpRight />
                ) : index === 1 ? (
                  <Search />
                ) : (
                  <Bookmark />
                )}
              </span>
              {action}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const entityRoutes: Record<string, string[]> = {
  people: ["attendance", "payroll", "payslips", "performance", "files"],
  customers: ["orders", "invoices", "receivables", "customer-communications"],
  suppliers: ["procurement", "purchase-orders", "finance"],
  "banking-operations": ["treasury", "financial-reports", "reconciliation"],
  "payroll-execution": [
    "payroll",
    "payroll-batches",
    "financial-reports",
    "reconciliation",
  ],
  invoices: ["receivables", "payments", "customer-communications"],
  orders: ["invoices", "logistics", "customer-communications"],
  "purchase-orders": ["goods-receipts", "inventory", "finance"],
  inventory: ["stock-transfers", "stock-borrowing", "procurement"],
  autos: ["logistics", "files"],
  logistics: ["autos", "files", "finance"],
  properties: ["leases", "maintenance", "files"],
  leases: ["properties", "receivables", "files"],
  "customer-communications": [
    "communication-audit",
    "communication-preferences",
    "invoices",
    "orders",
  ],
};

export function EntityQuickAccess({
  row,
  module,
}: {
  row: RecordData;
  module: ModuleDef;
}) {
  const { session, records, go } = useLab();
  const routeIds = (entityRoutes[module.id] || entityRoutes[module.kind] || [])
    .filter((id) => canView(byId(id), session))
    .slice(0, 5);
  const related = authorizedRecords(records, session)
    .filter((candidate) => recordsAreRelated(row, candidate))
    .slice(0, 4);
  if (!routeIds.length && !related.length) return null;
  return (
    <Panel
      className="v14-entity-access"
      title="Entity Quick Access"
      kicker="AUTHORIZED RELATIONSHIPS ONLY"
    >
      <div className="v14-entity-routes">
        {routeIds.map((id) => (
          <button key={id} onClick={() => go(id)}>
            <span>{byId(id)?.title}</span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
      {related.length > 0 && (
        <div className="v14-related">
          <strong>Related Records</strong>
          {related.map((item) => (
            <button
              key={item.module + item.id}
              onClick={() =>
                go(`${item.module}/${encodeURIComponent(item.id)}`)
              }
            >
              <span>
                <b>{item.title}</b>
                <small>
                  {byId(item.module)?.title} · {item.id}
                </small>
              </span>
              <Badge>{item.status}</Badge>
            </button>
          ))}
        </div>
      )}
      <p>
        <Clock3 size={13} />
        Relationships are calculated only from the current authorized
        projection.
      </p>
    </Panel>
  );
}
