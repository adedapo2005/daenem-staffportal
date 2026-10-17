"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Check, MapPin, ShieldCheck, Truck } from "lucide-react";
import type { ModuleDef, RecordData } from "./model";
import {
  logisticsAuthorityCopy,
  logisticsBoardLanes,
  logisticsLaneForStatus,
} from "./logistics-workflow-contract";
import { Badge, Metric, Panel } from "./ui";

export default function LogisticsWorkspace({
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
      [
        row.id,
        row.title,
        row.owner,
        row.status,
        row.fields.Driver,
        row.fields.Vehicle,
        row.fields.Origin,
        row.fields.Destination,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, rows]);

  return (
    <section data-logistics-surface="dispatch-workspace">
      <div className="p-board-header logistics">
        <div>
          <span className="p-kicker">LOGISTICS DISPATCH</span>
          <h2>Dispatch without invented tracking.</h2>
          <p>
            Plan the journey, inspect the recorded handoffs and require proof
            before delivery or close-out is represented as complete.
          </p>
        </div>
        <div className="p-board-stats">
          <Metric label="Authorized trips" value={String(rows.length)} />
          <Metric
            label="Live tracking"
            value="Not available"
            detail="Authoritative device session required"
          />
        </div>
      </div>

      <div className="p-logistics-route-rail" data-route-presentation="schematic-only">
        {rows.map((row) => (
          <button key={row.id} onClick={() => open(row)}>
            <span className="p-logistics-route-icon">
              <Truck size={17} aria-hidden="true" />
            </span>
            <span>
              <small>{row.id}</small>
              <strong>
                {row.fields.Origin || "Origin not recorded"} →{" "}
                {row.fields.Destination || "Destination not recorded"}
              </strong>
            </span>
            <Badge>{row.status}</Badge>
          </button>
        ))}
      </div>

      <div
        className="p-logistics-authority"
        data-logistics-workflow="authoritative-evidence-required"
        data-live-tracking="unavailable"
        data-delivery-confirmation="unavailable"
        data-reconciliation="unavailable"
        data-location-state="not-claimed"
        data-authority-copy="tracking-unavailable|delivery-evidence-required|reconciliation-unavailable"
      >
        <div className="p-logistics-authority-copy">
          <span className="p-kicker">LOCATION · DELIVERY · CLOSE-OUT</span>
          <h3>{logisticsAuthorityCopy.title}</h3>
          <p>{logisticsAuthorityCopy.body}</p>
        </div>
        <dl>
          <div>
            <dt>
              <MapPin size={15} aria-hidden="true" /> Location
            </dt>
            <dd>{logisticsAuthorityCopy.tracking}</dd>
          </div>
          <div>
            <dt>
              <ShieldCheck size={15} aria-hidden="true" /> Delivery
            </dt>
            <dd>{logisticsAuthorityCopy.delivery}</dd>
          </div>
          <div>
            <dt>Collections</dt>
            <dd>{logisticsAuthorityCopy.reconciliation}</dd>
          </div>
        </dl>
      </div>

      <div className="p-board-toolbar">
        <span>{filteredRows.length} authorized trips · QA fixture</span>
        <label className="p-logistics-search">
          <span>Find trip</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Trip, driver, vehicle or stage"
          />
        </label>
      </div>

      <div className="p-logistics-board">
        {logisticsBoardLanes.map((lane, laneIndex) => {
          const laneRows = filteredRows.filter(
            (row) => logisticsLaneForStatus(row.status) === laneIndex,
          );
          return (
            <section
              className="p-logistics-lane"
              data-logistics-lane={lane.id}
              key={lane.id}
            >
              <header>
                <span className={`lane-dot tone-${laneIndex}`} />
                <h3>{lane.label}</h3>
                <small>{laneRows.length}</small>
              </header>
              <div className="p-logistics-cards">
                {laneRows.map((row) => (
                  <button
                    key={row.id}
                    data-recorded-stage={row.status}
                    onClick={() => open(row)}
                  >
                    <small className="p-kicker">{row.id}</small>
                    <h3>{row.title}</h3>
                    <p className="p-secondary">
                      {row.fields.Driver} · {row.fields.Vehicle}
                    </p>
                    <Badge>{row.status}</Badge>
                    <div className="p-logistics-card-facts">
                      <span>Recorded stage: {row.status}</span>
                      <span>
                        Delivery evidence:{" "}
                        {row.fields["Proof of Delivery"] && row.evidence.length
                          ? "Attached"
                          : "Required"}
                      </span>
                    </div>
                    <span className="p-logistics-card-action">
                      <small>Open authorized trip record</small>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </span>
                  </button>
                ))}
                {!laneRows.length && (
                  <div className="p-logistics-lane-empty">
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
        title="Approved dispatch lifecycle"
        kicker="REQUIRED SEQUENCE · STATUS MUST COME FROM THE TRIP RECORD"
      >
        <div
          className="p-flow-strip"
          data-logistics-lifecycle={module.stages.join("|")}
        >
          {module.stages.map((stage, index) => (
            <span key={stage}>
              {String(index + 1).padStart(2, "0")} <strong>{stage}</strong>
            </span>
          ))}
        </div>
        <p className="p-logistics-lifecycle-note">
          This sequence explains the required handoffs. It does not prove live
          location, delivery, collected funds or reconciliation.
        </p>
      </Panel>
    </section>
  );
}
