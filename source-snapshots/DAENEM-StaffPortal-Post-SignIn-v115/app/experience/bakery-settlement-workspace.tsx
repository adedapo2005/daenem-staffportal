"use client";

import { useState } from "react";
import { ArrowUpRight, Check, FileCheck2, ShieldAlert, WalletCards } from "lucide-react";
import { useLab } from "./lab-context";
import { bakeryBalance } from "./enterprise-contract";
import {
  bakeryDisplayStatus,
  bakerySettlementAuthority,
  bakerySettlementMarkers,
  canPresentBakeryFinancialClose,
} from "./bakery-settlement-contract";
import {
  bakeryReportLabels,
  canViewBakeryFlourUsage,
} from "./bakery-report-contract";
import { canRecordAct, money, personFor, type ModuleDef, type RecordData } from "./model";
import { Badge, Btn, Callout, Metric, Panel, Steps } from "./ui";

type MutateFn = (
  row: RecordData,
  fields: Record<string, string>,
  status?: string,
  action?: string,
) => boolean;

export default function BakerySettlementWorkspace({
  module,
  rows,
  row,
  setSelected,
  open,
  mutate,
}: {
  module: ModuleDef;
  rows: RecordData[];
  row: RecordData;
  setSelected: (id: string) => void;
  open: (row: RecordData, module?: ModuleDef) => void;
  mutate: MutateFn;
}) {
  const { session } = useLab();
  const [reason, setReason] = useState("");
  const balance = bakeryBalance(row.fields);
  const needsInvestigation =
    balance.quantityVariance !== 0 ||
    balance.cashVariance !== 0 ||
    balance.dispatchVariance !== 0;
  const canSubmitInvestigation =
    needsInvestigation &&
    row.status !== "Investigating" &&
    canRecordAct(row, module, session, "approve");
  const reportLabels = bakeryReportLabels(canViewBakeryFlourUsage(session));
  const financialCloseAvailable = canPresentBakeryFinancialClose();
  const visibleStages = module.stages.map((stage) =>
    stage === "Resolved"
      ? "Variance classified"
      : stage === "Reconciled"
        ? "Settlement verification"
        : stage,
  );

  return (
    <section
      data-bakery-surface="settlement-boundary"
      data-bakery-settlement-workflow={bakerySettlementMarkers.workflow}
      data-received-money={bakerySettlementMarkers.receivedMoney}
      data-receipt-truth={bakerySettlementMarkers.receiptTruth}
      data-financial-close={bakerySettlementMarkers.financialClose}
      data-authority-copy={bakerySettlementMarkers.authorityCopy}
    >
      <div className="v3-domain-hero bakery bakery-settlement-hero">
        <div>
          <span className="p-kicker">EVERY LOAF · EVERY NAIRA · EVERY CUSTODIAN</span>
          <h2>Accountability stays open until settlement is proven.</h2>
          <p>
            Production and custody remain visible without treating money still
            owed as money received or a reasoned variance as financial closure.
          </p>
        </div>
        <Metric
          label="Financial close"
          value="Unavailable"
          detail="Awaiting received-only settlement authority"
        />
      </div>

      <div className="bakery-settlement-authority">
        <div>
          <span className="p-kicker">REMITTANCE · RECEIPTS · SETTLEMENT</span>
          <h3>{bakerySettlementAuthority.title}</h3>
          <p>{bakerySettlementAuthority.body}</p>
        </div>
        <dl>
          <div>
            <dt><WalletCards size={15} aria-hidden="true" /> Money received</dt>
            <dd>{bakerySettlementAuthority.receivedMoney}</dd>
          </div>
          <div>
            <dt><ShieldAlert size={15} aria-hidden="true" /> Open obligation</dt>
            <dd>{bakerySettlementAuthority.openObligation}</dd>
          </div>
          <div>
            <dt><FileCheck2 size={15} aria-hidden="true" /> Receipt and close</dt>
            <dd>{bakerySettlementAuthority.receipt}. {bakerySettlementAuthority.close}.</dd>
          </div>
        </dl>
      </div>

      <div className="v3-specialized-layout bakery-settlement-layout">
        <Panel title="Authorized work queue" kicker="CURRENT BAKERY SCOPE">
          <div className="v3-desk-rail">
            {rows.map((item) => (
              <button
                key={item.id}
                className={item.id === row.id ? "active" : ""}
                onClick={() => setSelected(item.id)}
              >
                <small>{item.id}</small>
                <strong>{item.title}</strong>
                <Badge>{bakeryDisplayStatus(item.status)}</Badge>
              </button>
            ))}
          </div>
        </Panel>

        <div className="v3-specialized-main">
          <Panel title={row.title} kicker={`${row.id} · BAKERY ACCOUNTABILITY`}>
            <Steps
              steps={visibleStages}
              current={Math.max(0, module.stages.indexOf(row.status))}
            />
            <div className="v3-balance-grid bakery-settlement-metrics">
              <Metric label="Produced" value={String(balance.produced)} />
              <Metric label="Dispatched" value={String(balance.dispatched)} />
              <Metric label="Custody accounted" value={String(balance.assigned)} />
              <Metric
                label="Quantity variance"
                value={String(balance.quantityVariance)}
                detail="Physical accountability only"
              />
              <Metric
                label="Expected from recorded sales"
                value={money(balance.expectedRemittance)}
              />
              <Metric
                label="Accounted money"
                value={money(Number(row.fields.Remittance || 0))}
                detail="May include money still owed"
              />
              <Metric
                label="Unclassified difference"
                value={money(balance.cashVariance)}
                detail="Not proof of debt collected"
              />
              <Metric label="Record status" value={bakeryDisplayStatus(row.status)} />
            </div>

            <div className="v3-accountability-ledger bakery-settlement-ledger">
              <section>
                <h3>Quantity classifications</h3>
                {[
                  "Store Balance",
                  "Agent Sold",
                  "Returns",
                  "Damaged",
                  "Promo",
                  "Staff",
                  "In Transit",
                ].map((key) => (
                  <div key={key}><span>{key}</span><strong>{row.fields[key] || "0"}</strong></div>
                ))}
              </section>
              <section>
                <h3>Recorded money classifications</h3>
                {["Unit Price", "Remittance", "Resolution Amount"].map((key) => (
                  <div key={key}><span>{key === "Remittance" ? "Accounted money" : key}</span><strong>{money(Number(row.fields[key] || 0))}</strong></div>
                ))}
                <p>
                  These figures do not identify cash, POS or transfer actually
                  received. Outstanding debt remains an open obligation.
                </p>
              </section>
            </div>

            {canSubmitInvestigation && (
              <label className="p-field">
                Investigation reason
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain the variance and evidence to review…"
                />
              </label>
            )}

            <Callout tone="amber" title="Financial closure remains blocked">
              A variance explanation can support investigation, but it does not
              confirm collection, issue a receipt, settle an obligation or close
              this dispatch financially.
            </Callout>

            <div className="p-button-row">
              <Btn variant="outline" onClick={() => open(row, module)}>
                Open accountability record <ArrowUpRight size={15} />
              </Btn>
              {canSubmitInvestigation && (
                <Btn
                  disabled={!reason.trim()}
                  onClick={() =>
                    mutate(
                      row,
                      {
                        "Decision Reason": reason,
                        "Resolution Maker": personFor(session),
                      },
                      "Investigating",
                      "Variance submitted for investigation",
                    )
                  }
                >
                  Submit investigation <Check size={15} />
                </Btn>
              )}
            </div>

            {!financialCloseAvailable && (
              <p className="bakery-settlement-close-note" role="status">
                Approve and close is unavailable until an authoritative
                received-only settlement projection is connected.
              </p>
            )}
          </Panel>

          <Panel title="Authorized reports" kicker="PERMISSION-COMPOSED">
            <div className="p-report-links">
              {reportLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}
