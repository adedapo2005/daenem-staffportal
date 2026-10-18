"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, Printer } from "lucide-react";
import type { ModuleDef, RecordData } from "./model";
import {
  printingAuthorityCopy,
  printingBoardLanes,
  printingLaneForStatus,
} from "./printing-workflow-contract";
import { Badge, Metric, Panel } from "./ui";

export default function PrintingWorkspace({
  module,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (row: RecordData) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;
    return rows.filter((row) =>
      [row.id, row.title, row.owner, row.status, row.fields.Customer]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rows]);

  return (
    <section data-printing-surface="production-workspace">
      <div className="p-board-header printing">
        <div>
          <span className="p-kicker">PRINTING &amp; TECHNOLOGY</span>
          <h2>From enquiry to accountable completion.</h2>
          <p>
            Commercial approval, authoritative payment, production, QC,
            delivery and reconciliation remain distinct parts of the job
            record.
          </p>
        </div>
        <div className="p-board-stats">
          <Metric label="Authorized jobs" value={String(rows.length)} />
          <Metric
            label="Payment confirmed"
            value="Not available"
            detail="Authoritative source required"
          />
        </div>
      </div>

      <div className="p-printing-capacity" data-printing-operational-fixture="true">
        {[
          ["Press 01", "Fixture availability"],
          ["Press 02", "Fixture schedule"],
          ["Finishing", "Fixture capacity"],
          ["QC", "Fixture queue"],
        ].map(([label, detail]) => (
          <section key={label}>
            <Printer size={18} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </section>
        ))}
      </div>

      <div
        className="p-printing-authority"
        data-printing-workflow="authoritative-source-required"
        data-payment-confirmation="unavailable"
        data-reconciliation="unavailable"
        data-production-gate="not-claimed"
        data-authority-copy="payment-unavailable|reconciliation-unavailable"
      >
        <div className="p-printing-authority-copy">
          <span className="p-kicker">COMMERCIAL · PAYMENT · RECONCILIATION</span>
          <h3>{printingAuthorityCopy.title}</h3>
          <p>{printingAuthorityCopy.body}</p>
        </div>
        <dl>
          <div>
            <dt>Commercial / Invoice</dt>
            <dd>{printingAuthorityCopy.commercial}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{printingAuthorityCopy.payment}</dd>
          </div>
          <div>
            <dt>Reconciliation</dt>
            <dd>{printingAuthorityCopy.reconciliation}</dd>
          </div>
        </dl>
      </div>

      <div className="p-board-toolbar">
        <span>{filteredRows.length} authorized jobs · QA fixture</span>
        <label className="p-printing-search">
          <span>Find job</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Customer, job, owner or stage"
          />
        </label>
      </div>

      <div className="p-production-board">
        {printingBoardLanes.map((lane, laneIndex) => {
          const laneRows = filteredRows.filter(
            (row) => printingLaneForStatus(row.status) === laneIndex,
          );
          return (
            <section
              className="p-production-lane"
              data-printing-lane={lane.id}
              key={lane.id}
            >
              <header>
                <span className={`lane-dot tone-${laneIndex}`} />
                <h3>{lane.label}</h3>
                <small>{laneRows.length}</small>
              </header>
              <div className="p-board-cards">
                {laneRows.map((row) => (
                  <button
                    key={row.id}
                    data-recorded-stage={row.status}
                    onClick={() => open(row)}
                  >
                    <small className="p-kicker">{row.id}</small>
                    <h3>{row.title}</h3>
                    <p className="p-secondary">
                      {row.fields.Customer} · {row.owner}
                    </p>
                    <Badge>{row.status}</Badge>
                    <div className="p-card-progress">
                      <span>Recorded stage: {row.status}</span>
                    </div>
                    <span className="p-printing-card-action">
                      <small>Open authorized job record</small>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </span>
                  </button>
                ))}
                {!laneRows.length && (
                  <div className="p-lane-empty">
                    <Check size={18} aria-hidden="true" />
                    <span>{lane.empty}</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Panel
        title="Approved job lifecycle"
        kicker="REQUIRED SEQUENCE · STATUS MUST COME FROM THE JOB RECORD"
      >
        <div
          className="p-flow-strip"
          data-printing-lifecycle={module.stages.join("|")}
        >
          {module.stages.map((stage, index) => (
            <span key={stage}>
              {String(index + 1).padStart(2, "0")} <strong>{stage}</strong>
            </span>
          ))}
        </div>
        <p className="p-printing-lifecycle-note">
          This sequence explains the required handoffs. It does not prove that
          payment, production release, delivery or reconciliation has happened.
        </p>
      </Panel>
    </section>
  );
}
