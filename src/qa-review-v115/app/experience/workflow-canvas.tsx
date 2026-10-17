"use client";
import { useState } from "react";
import { Plus, GitBranch, X, ArrowDown, ShieldCheck } from "lucide-react";
import { useLab } from "./lab-context";
import { useDeviceState } from "./device-state";
import {
  modules,
  canView,
  canAct,
  personFor,
  recordsFor,
  byId,
  type ModuleDef,
} from "./model";
import { fixtureId } from "./fixture-id";
import { validateConfig, type ConfigVersion } from "./enterprise-contract";
import { configurationGuard } from "./config-runtime";
import { Panel, Btn, Pick, Badge, Empty } from "./ui";
export interface WorkflowEdge {
  from: string;
  to: string;
  condition: string;
}
const conditions = [
  "Evidence present",
  "Different authorized reviewer",
  "All required fields valid",
  "No unexplained variance",
];
export function WorkflowCanvas({ module: m }: { module: ModuleDef }) {
  const { session, records, audit } = useLab();
  const sources = modules.filter(
    (x) =>
      canView(x, session) &&
      x.stages.length > 1 &&
      !["builder", "studio"].includes(x.kind),
  );
  const [draft, setDraft] = useDeviceState<{
    id: string;
    name: string;
    target: string;
    edges: WorkflowEdge[];
  }>("workflow-canvas-" + session.personId, {
    id: fixtureId(),
    name: "",
    target: "expenses",
    edges: [],
  });
  const [versions, setVersions] = useDeviceState<ConfigVersion[]>(
    "governed-workflow-builder-" + session.company,
    [],
  );
  const [stage, setStage] = useState("Draft"),
    [reason, setReason] = useState(""),
    [errors, setErrors] = useState<string[]>([]),
    [simulation, setSimulation] = useState<{ id: string; result: string }[]>(
      [],
    );
  const effectiveTarget = sources.some((item) => item.id === draft.target)
      ? draft.target
      : sources[0]?.id || "",
    source = byId(effectiveTarget),
    rows = source ? recordsFor(records, source, session) : [],
    edit = canAct(m, session);
  function change(patch: Partial<typeof draft>) {
    if (!edit) return;
    setDraft((v) => ({ ...v, ...patch }));
    setStage("Draft");
    setSimulation([]);
    setErrors([]);
  }
  function update(i: number, patch: Partial<WorkflowEdge>) {
    change({
      edges: draft.edges.map((e, n) => (n === i ? { ...e, ...patch } : e)),
    });
  }
  function validate() {
    const config: ConfigVersion = {
      id: draft.id,
      kind: m.id,
      name: draft.name,
      target: effectiveTarget,
      state: "Draft",
      version: 1,
      scope: "Company",
      definition: { edges: JSON.stringify(draft.edges) },
      history: [],
    };
    const invalid = validateConfig(
      config,
      sources.map((m) => m.id),
    );
    if (!draft.edges.length)
      invalid.push("Add at least one guarded transition.");
    if (
      draft.edges.some(
        (e) =>
          e.from === e.to ||
          !source?.stages.includes(e.from) ||
          !source.stages.includes(e.to),
      )
    )
      invalid.push("Choose distinct existing workflow stages.");
    if (
      new Set(draft.edges.map((e) => e.from + "→" + e.to)).size !==
      draft.edges.length
    )
      invalid.push("Each transition must be unique.");
    setErrors(invalid);
    if (invalid.length) return false;
    setStage("Validated");
    return true;
  }
  return (
    <>
      <div className="v3-builder-toolbar">
        <div>
          <GitBranch />
          <strong>Workflow policy canvas</strong>
          <Badge>{stage}</Badge>
        </div>
        <Btn
          variant="outline"
          disabled={!edit}
          onClick={() =>
            change({
              edges: [
                ...draft.edges,
                {
                  from: source?.stages[0] || "",
                  to: source?.stages[1] || "",
                  condition: conditions[0],
                },
              ],
            })
          }
        >
          <Plus size={16} />
          Add transition
        </Btn>
      </div>
      <div className="v3-builder-grid">
        <Panel title="Workflow definition">
          <label className="p-field">
            Workflow name
            <input
              value={draft.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label className="p-field">
            Target workflow
            <Pick
              label="Workflow target"
              value={effectiveTarget}
              onChange={(target) => change({ target, edges: [] })}
              options={sources.map((m) => ({ value: m.id, label: m.title }))}
            />
          </label>
          <p className="p-secondary">
            Policies add checks to existing transitions. Core approval,
            evidence, inventory and access rules remain mandatory.
          </p>
          <label className="p-field">
            Change reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="v3-vertical-actions">
            <Btn variant="outline" disabled={!edit} onClick={validate}>
              Validate workflow
            </Btn>
            <Btn
              variant="outline"
              disabled={stage !== "Validated"}
              onClick={() => {
                const result = draft.edges.flatMap((edge) =>
                  rows
                    .filter((r) => r.status === edge.from)
                    .map((row) => ({
                      id: row.id + " → " + edge.to,
                      result:
                        configurationGuard(
                          { definition: edge } as unknown as ConfigVersion,
                          row,
                          personFor(session),
                        ) ||
                        "Configured guard passes; core transition checks remain",
                    })),
                );
                setSimulation(
                  result.length
                    ? result
                    : [
                        {
                          id: "No matching fixture",
                          result:
                            "Create a source record in the from-state to exercise this transition.",
                        },
                      ],
                );
                setStage("Simulated");
              }}
            >
              Simulate current fixtures
            </Btn>
            {canAct(m, session, "publish") && (
              <Btn
                disabled={stage !== "Simulated" || !reason.trim()}
                onClick={() => {
                  const version: ConfigVersion = {
                    id: draft.id,
                    name: draft.name,
                    kind: m.id,
                    target: effectiveTarget,
                    scope: "Company",
                    version: versions.length + 1,
                    state: "Published",
                    definition: { edges: JSON.stringify(draft.edges) },
                    history: [
                      {
                        action: "Published",
                        actor: personFor(session),
                        time: new Date().toISOString(),
                        reason,
                      },
                    ],
                  };
                  setVersions((v) => [...v, version]);
                  setStage("Published");
                  audit("Workflow published", m.id, "", draft.name, reason);
                }}
              >
                Publish local policy
              </Btn>
            )}
          </div>
          {errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
        </Panel>
        <Panel title="Guarded transitions" kicker="DECLARATIVE · NO SCRIPTS">
          <div className="tech-workflow-canvas">
            {draft.edges.map((edge, i) => (
              <article key={i}>
                <div>
                  <Pick
                    label={"Transition " + (i + 1) + " from"}
                    value={edge.from}
                    onChange={(from) => update(i, { from })}
                    options={source?.stages || []}
                  />
                  <Btn
                    variant="quiet"
                    aria-label={"Remove transition " + (i + 1)}
                    onClick={() =>
                      change({ edges: draft.edges.filter((_, n) => n !== i) })
                    }
                  >
                    <X size={15} />
                  </Btn>
                </div>
                <ArrowDown size={18} />
                <div className="tech-workflow-guard">
                  <ShieldCheck size={17} />
                  <Pick
                    label={"Transition " + (i + 1) + " condition"}
                    value={edge.condition}
                    onChange={(condition) => update(i, { condition })}
                    options={conditions}
                  />
                </div>
                <ArrowDown size={18} />
                <Pick
                  label={"Transition " + (i + 1) + " to"}
                  value={edge.to}
                  onChange={(to) => update(i, { to })}
                  options={source?.stages || []}
                />
              </article>
            ))}
            {!draft.edges.length && <Empty title="Add a guarded transition" />}
          </div>
        </Panel>
        <Panel title="Simulation & history">
          {simulation.map((s) => (
            <div key={s.id} className="tech-smart-note">
              <strong>{s.id}</strong>
              <span>{s.result}</span>
            </div>
          ))}
          {versions
            .filter((v) => canView(byId(v.target), session))
            .map((v) => (
              <div key={v.id + v.version} className="v3-version-row">
                <span>
                  <strong>
                    {v.name} · v{v.version}
                  </strong>
                  <small>{v.history.at(-1)?.time}</small>
                </span>
                <Badge>{v.state}</Badge>
                {canAct(m, session, "override") && (
                  <Btn
                    variant="outline"
                    disabled={!reason.trim()}
                    onClick={() => {
                      setVersions((all) => [
                        ...all,
                        {
                          ...v,
                          version: all.length + 1,
                          state: "Rolled Back",
                          history: [
                            ...v.history,
                            {
                              action: "Restored version " + v.version,
                              actor: personFor(session),
                              time: new Date().toISOString(),
                              reason,
                            },
                          ],
                        },
                      ]);
                      audit(
                        "Workflow version restored",
                        m.id,
                        String(v.version),
                        "restored",
                        reason,
                      );
                    }}
                  >
                    Restore this policy
                  </Btn>
                )}
              </div>
            ))}
        </Panel>
      </div>
    </>
  );
}
