"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  FileCheck2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { ModuleDef, RecordData } from "./model";
import {
  propertyAuthorityCopy,
  propertyLaneForStatus,
  propertyPortfolioLanes,
} from "./property-portfolio-contract";
import { Badge, Metric, Panel } from "./ui";

function recordedNumber(row: RecordData, field: string) {
  const value = row.fields[field]?.trim() || "";
  if (field === "Occupancy") {
    const match = /^(\d+)\s+of\s+(\d+)$/.exec(value);
    return match ? Number(match[1]) : null;
  }
  return value && Number.isFinite(Number(value)) ? Number(value) : null;
}

export default function PropertyWorkspace({
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
      [row.id, row.title, row.owner, row.status, row.fields.Property]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rows]);
  const totals = rows.reduce(
    (result, row) => {
      const units = recordedNumber(row, "Units");
      const occupied = recordedNumber(row, "Occupancy");
      if (units === null || occupied === null) return result;
      result.units += units;
      result.occupied += occupied;
      result.complete += 1;
      return result;
    },
    { units: 0, occupied: 0, complete: 0 },
  );
  const occupancyKnown = totals.complete === rows.length && totals.units > 0;

  return (
    <section data-property-surface="portfolio-workspace">
      <div className="p-board-header property">
        <div>
          <span className="p-kicker">HOMES &amp; PROPERTIES</span>
          <h2>Portfolio truth before rent conclusions.</h2>
          <p>
            Inspect recorded occupancy and maintenance state while keeping rent,
            receipts and settlement tied to their own authoritative records.
          </p>
        </div>
        <div className="p-board-stats">
          <Metric label="Authorized properties" value={String(rows.length)} />
          <Metric
            label="Recorded occupancy"
            value={
              occupancyKnown
                ? `${Math.round((totals.occupied / totals.units) * 100)}%`
                : "Not complete"
            }
            detail={
              occupancyKnown
                ? `${totals.occupied} of ${totals.units} units`
                : "Complete unit and occupancy records"
            }
          />
        </div>
      </div>

      <div
        className="p-property-authority"
        data-property-workflow="authoritative-records-required"
        data-rent-payment-confirmation="unavailable"
        data-receipt-truth="not-claimed"
        data-reconciliation="unavailable"
        data-occupancy-source="recorded-aggregate-only"
        data-authority-copy="occupancy-recorded|payment-unavailable|receipt-reconciliation-unavailable"
      >
        <div className="p-property-authority-copy">
          <span className="p-kicker">OCCUPANCY · RENT · RECEIPTS</span>
          <h3>{propertyAuthorityCopy.title}</h3>
          <p>{propertyAuthorityCopy.body}</p>
        </div>
        <dl>
          <div>
            <dt>
              <Building2 size={15} aria-hidden="true" /> Occupancy
            </dt>
            <dd>{propertyAuthorityCopy.occupancy}</dd>
          </div>
          <div>
            <dt>
              <ShieldCheck size={15} aria-hidden="true" /> Rent payment
            </dt>
            <dd>{propertyAuthorityCopy.payment}</dd>
          </div>
          <div>
            <dt>
              <FileCheck2 size={15} aria-hidden="true" /> Receipts
            </dt>
            <dd>{propertyAuthorityCopy.reconciliation}</dd>
          </div>
        </dl>
      </div>

      <div className="p-board-toolbar">
        <span>{filteredRows.length} authorized properties · QA fixture</span>
        <label className="p-property-search">
          <span>Find property</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Property, record or state"
          />
        </label>
      </div>

      <div className="p-property-board">
        {propertyPortfolioLanes.map((lane, laneIndex) => {
          const laneRows = filteredRows.filter(
            (row) => propertyLaneForStatus(row.status) === laneIndex,
          );
          return (
            <section
              className="p-property-lane"
              data-property-lane={lane.id}
              key={lane.id}
            >
              <header>
                <span className={`lane-dot tone-${laneIndex}`} />
                <h3>{lane.label}</h3>
                <small>{laneRows.length}</small>
              </header>
              <div className="p-property-cards">
                {laneRows.map((row) => {
                  const units = recordedNumber(row, "Units");
                  const occupied = recordedNumber(row, "Occupancy");
                  return (
                    <button
                      key={row.id}
                      data-recorded-property-state={row.status}
                      onClick={() => open(row)}
                    >
                      <div className="p-property-card-heading">
                        <span className="p-property-card-icon">
                          {row.status === "Maintenance" ? (
                            <Wrench size={17} aria-hidden="true" />
                          ) : (
                            <Building2 size={17} aria-hidden="true" />
                          )}
                        </span>
                        <span>
                          <small className="p-kicker">{row.id}</small>
                          <h3>{row.title}</h3>
                        </span>
                        <Badge>{row.status}</Badge>
                      </div>
                      <dl className="p-property-card-facts">
                        <div>
                          <dt>Units</dt>
                          <dd>{units === null ? "Not recorded" : units}</dd>
                        </div>
                        <div>
                          <dt>Occupied</dt>
                          <dd>{occupied === null ? "Not recorded" : occupied}</dd>
                        </div>
                        <div>
                          <dt>Rent payment</dt>
                          <dd>Not confirmed here</dd>
                        </div>
                      </dl>
                      <span className="p-property-card-action">
                        <small>Open authorized property record</small>
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </span>
                    </button>
                  );
                })}
                {!laneRows.length && (
                  <div className="p-property-lane-empty">
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
        title="Approved portfolio states"
        kicker="STATUS MUST COME FROM THE PROPERTY RECORD"
      >
        <div
          className="p-flow-strip p-property-state-strip"
          data-property-states={module.stages.join("|")}
        >
          {module.stages.map((stage, index) => (
            <span key={stage}>
              {String(index + 1).padStart(2, "0")} <strong>{stage}</strong>
            </span>
          ))}
        </div>
        <p className="p-property-state-note">
          These states describe the property record. They do not prove rent
          payment, receipt issue, bank settlement or reconciliation.
        </p>
      </Panel>
    </section>
  );
}
