"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  KeyRound,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import {
  accessRemovalState,
  canClaimVerifiedAccessRemoval,
  isOffboardingRecord,
  offboardingAccessAuthority,
  offboardingAccessCopy,
} from "./offboarding-access-contract";
import type { ModuleDef, RecordData } from "./model";
import { Badge, Btn, Callout, Metric, Panel, Steps } from "./ui";

export default function LifecycleWorkspace({
  module,
  rows,
  open,
}: {
  module: ModuleDef;
  rows: RecordData[];
  open: (row: RecordData) => void;
}) {
  const [selectedId, setSelectedId] = useState(
    rows.find(isOffboardingRecord)?.id || rows[0]?.id || "",
  );
  const selected =
    rows.find((row) => row.id === selectedId) || rows[0];
  const offboarding = selected ? isOffboardingRecord(selected) : false;
  const exitCount = useMemo(
    () => rows.filter(isOffboardingRecord).length,
    [rows],
  );

  if (!selected) return null;

  return (
    <section
      data-lifecycle-surface="onboarding-offboarding"
      data-offboarding-access-workflow={offboardingAccessAuthority.workflow}
      data-access-removal={offboardingAccessAuthority.accessRemoval}
      data-self-reported-completion={
        offboardingAccessAuthority.selfReportedCompletion
      }
      data-not-applicable={offboardingAccessAuthority.notApplicable}
      data-revocation-scope={offboardingAccessAuthority.scope}
      data-identity-source={offboardingAccessAuthority.source}
    >
      <div className="p-board-header lifecycle-truth">
        <div>
          <span className="p-kicker">ONBOARDING &amp; OFFBOARDING</span>
          <h2>Checklist progress is not access removal.</h2>
          <p>
            Keep employee lifecycle work clear while identity, session and
            company authority remain separate verified outcomes.
          </p>
        </div>
        <div className="p-board-stats">
          <Metric label="Authorized records" value={String(rows.length)} />
          <Metric label="Exit checklists" value={String(exitCount)} />
        </div>
      </div>

      <div className="lifecycle-truth-layout">
        <Panel title="Authorized lifecycle queue" kicker="CURRENT COMPANY SCOPE">
          <div className="lifecycle-truth-rail">
            {rows.map((row) => (
              <button
                key={row.id}
                className={row.id === selected.id ? "active" : ""}
                onClick={() => setSelectedId(row.id)}
                aria-pressed={row.id === selected.id}
              >
                <span>
                  <small>{row.id}</small>
                  <strong>{row.title}</strong>
                </span>
                <Badge>
                  {isOffboardingRecord(row)
                    ? "Verification required"
                    : row.status}
                </Badge>
              </button>
            ))}
          </div>
        </Panel>

        <div className="lifecycle-truth-main">
          <Panel
            title={selected.title}
            kicker={`${selected.id} · ${offboarding ? "OFFBOARDING" : "ONBOARDING"}`}
          >
            {offboarding ? (
              <>
                <div className="lifecycle-authority-callout">
                  <span className="lifecycle-authority-icon">
                    <ShieldAlert size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <span className="p-kicker">IDENTITY AUTHORITY REQUIRED</span>
                    <h3>{offboardingAccessCopy.title}</h3>
                    <p>{offboardingAccessCopy.body}</p>
                  </div>
                  <Badge>Verification required</Badge>
                </div>
                <div className="lifecycle-authority-grid">
                  <article>
                    <KeyRound size={19} aria-hidden="true" />
                    <span>
                      <small>Sessions and temporary access</small>
                      <strong>Not verified</strong>
                    </span>
                  </article>
                  <article>
                    <Building2 size={19} aria-hidden="true" />
                    <span>
                      <small>Revocation scope</small>
                      <strong>Selected company only</strong>
                    </span>
                  </article>
                  <article>
                    <UserRoundCheck size={19} aria-hidden="true" />
                    <span>
                      <small>Completion claim</small>
                      <strong>Blocked pending authority</strong>
                    </span>
                  </article>
                </div>
                <Callout tone="neutral" title="Company access stays precise">
                  {offboardingAccessCopy.companyExit} {offboardingAccessCopy.fullTermination}
                </Callout>
                <Callout tone="amber" title="No self-reported exemption">
                  {offboardingAccessCopy.exemption}
                </Callout>
                <div className="p-button-row">
                  <Btn variant="outline" onClick={() => open(selected)}>
                    Open lifecycle record <ArrowUpRight size={15} />
                  </Btn>
                </div>
                <p className="p-secondary" role="status">
                  Access removal state: {accessRemovalState(selected)}. A
                  “Complete” or “Not applicable” action is intentionally absent.
                </p>
              </>
            ) : (
              <>
                <Steps
                  steps={module.stages}
                  current={Math.max(0, module.stages.indexOf(selected.status))}
                />
                <Callout tone="neutral" title="Onboarding record">
                  This record is not an offboarding access-removal claim. Open
                  it to review its authorized fields and evidence.
                </Callout>
                <Btn variant="outline" onClick={() => open(selected)}>
                  Open lifecycle record <ArrowUpRight size={15} />
                </Btn>
              </>
            )}
          </Panel>

          <Panel title="Access-removal boundary" kicker="FAIL-CLOSED FRONTEND">
            <dl className="lifecycle-boundary-list">
              <div>
                <dt>Identity authority</dt>
                <dd>Not connected</dd>
              </div>
              <div>
                <dt>Verified revocation</dt>
                <dd>{canClaimVerifiedAccessRemoval() ? "Verified" : "Unavailable"}</dd>
              </div>
              <div>
                <dt>Unrelated company access</dt>
                <dd>Preserved</dd>
              </div>
              <div>
                <dt>Audit exemption reason</dt>
                <dd>Backend authority required</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </section>
  );
}
