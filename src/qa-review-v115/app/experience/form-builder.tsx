"use client";
import { validateFieldValue } from "./form-validation";
import {
  buildConfiguredFormValues,
  configuredPrefillOrigin,
} from "./form-prefill";
import { useState } from "react";
import { Plus, GripVertical, ChevronUp, X, Eye, Layers } from "lucide-react";
import { useLab } from "./lab-context";
import { useDeviceState } from "./device-state";
import { fixtureId } from "./fixture-id";
import { SmartField, type FieldKind } from "./smart-forms";
import {
  modules,
  companies,
  byId,
  recordsFor,
  canView,
  canAct,
  personFor,
  type ModuleDef,
} from "./model";
import { validateConfig, type ConfigVersion } from "./enterprise-contract";
import { Panel, Btn, Pick, Badge, Empty } from "./ui";
export interface FormField {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options: string[];
  prefill: string;
  defaultValue: string;
  when: string;
  equals: string;
}
const kinds: FieldKind[] = [
  "text",
  "number",
  "email",
  "phone",
  "currency",
  "percentage",
  "date",
  "time",
  "datetime-local",
  "date-range",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "toggle",
  "textarea",
  "rich-text",
  "upload",
  "signature",
  "otp",
  "tags",
  "range",
  "address",
  "section",
  "divider",
  "repeat-group",
];
export function FormBuilder({ module: m }: { module: ModuleDef }) {
  const { session, records, audit } = useLab();
  const [versions, setVersions] = useDeviceState<ConfigVersion[]>(
    "governed-form-builder-" + session.company,
    [],
  );
  const [draft, setDraft] = useDeviceState<{
    id: string;
    name: string;
    target: string;
    fields: FormField[];
  }>("form-canvas-" + session.personId, {
    id: fixtureId(),
    name: "",
    target: "forms",
    fields: [],
  });
  const [selected, setSelected] = useState(""),
    [values, setValues] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [stage, setStage] = useState("Draft"),
    [drag, setDrag] = useState("");
  const targets = modules.filter(
    (a) => canView(a, session) && canAct(a, session, "create"),
  );
  const effectiveTarget = targets.some((item) => item.id === draft.target)
    ? draft.target
    : targets[0]?.id || "";
  const peopleModule = byId("people");
  const person = peopleModule
    ? recordsFor(records, peopleModule, session).find(
        (r) => r.title === personFor(session),
      )
    : undefined;
  const target = byId(effectiveTarget);
  const effectiveCompany = target?.company || session.company;
  const mappedContext: Record<string, string> = {
    "Current user": personFor(session),
    Company: companies.find((c) => c.id === effectiveCompany)?.name || "",
    Department: person?.fields.Department || "",
    Manager: person?.fields.Manager || "",
    Location: person?.fields.Location || "",
    "Current date": new Date().toISOString().slice(0, 10),
  };
  const previewDefaults = buildConfiguredFormValues(
    draft.fields,
    mappedContext,
  );
  const f = draft.fields.find((x) => x.id === selected),
    editable = canAct(m, session, "edit");
  function change(patch: Partial<typeof draft>) {
    if (!editable) return;
    setDraft((d) => ({ ...d, ...patch }));
    setStage("Draft");
    setError("");
  }
  function update(patch: Partial<FormField>) {
    change({
      fields: draft.fields.map((x) =>
        x.id === selected ? { ...x, ...patch } : x,
      ),
    });
  }
  function add(kind: FieldKind) {
    const id = fixtureId();
    change({
      fields: [
        ...draft.fields,
        {
          id,
          label: kind === "section" ? "New section" : "New " + kind + " field",
          kind,
          required: false,
          options: [],
          prefill: "None",
          defaultValue: "",
          when: "",
          equals: "",
        },
      ],
    });
    setSelected(id);
  }
  function reorder(id: string, index: number) {
    const fields = draft.fields.filter((f) => f.id !== id),
      field = draft.fields.find((f) => f.id === id);
    if (!field) return;
    fields.splice(Math.max(0, index), 0, field);
    change({ fields });
  }
  function advance(next: string) {
    if (!editable) return;
    const config: ConfigVersion = {
      id: draft.id,
      kind: m.id,
      name: draft.name,
      target: effectiveTarget,
      version: versions.length + 1,
      state: "Published",
      scope: "Company",
      definition: { schema: JSON.stringify(draft.fields) },
      history: [],
    };
    const invalid = validateConfig(
      config,
      targets.map((t) => t.id),
    );
    if (!draft.fields.length) invalid.push("Add at least one field.");
    if (
      new Set(draft.fields.map((f) => f.label.trim().toLowerCase())).size !==
      draft.fields.length
    )
      invalid.push("Field labels must be unique.");
    if (draft.fields.some((f) => !f.label.trim()))
      invalid.push("Every field needs a label.");
    if (
      draft.fields.some(
        (f) =>
          ["select", "multiselect", "radio", "repeat-group"].includes(f.kind) &&
          (!f.options.length ||
            f.options.some((o) => !o.trim()) ||
            new Set(f.options.map((o) => o.trim().toLowerCase())).size !==
              f.options.length),
      )
    )
      invalid.push("Choice and repeat fields need nonempty, unique options.");
    if (
      draft.fields.some(
        (f) => f.kind === "repeat-group" && f.options.length > 8,
      )
    )
      invalid.push("Repeat groups support at most eight columns.");
    if (
      draft.fields.some(
        (f) => f.when && !draft.fields.some((x) => x.id === f.when),
      )
    )
      invalid.push("A conditional field references a removed field.");
    for (const field of draft.fields) {
      if (field.defaultValue) {
        const defaultError = validateFieldValue(
          field.kind,
          field.defaultValue,
          false,
          field.options,
        );
        if (defaultError)
          invalid.push(field.label + " default: " + defaultError);
      }
    }
    if (invalid.length) {
      setError(invalid.join(" "));
      return;
    }
    if (next === "Published") {
      if (
        stage !== "Simulated" ||
        !reason.trim() ||
        !canAct(m, session, "publish")
      ) {
        setError("Simulate this version and supply a publication reason.");
        return;
      }
      config.history = [
        {
          actor: personFor(session),
          action: "Published",
          time: new Date().toISOString(),
          reason,
        },
      ];
      setVersions((v) => [...v, config]);
      audit("Form published", m.id, "", draft.name, reason);
    }
    setError("");
    setStage(next);
  }
  return (
    <>
      <div className="v3-builder-toolbar">
        <div>
          <Layers />
          <strong>Form Design Studio</strong>
          <Badge>{stage}</Badge>
        </div>
        <Btn variant="outline" onClick={() => setPreview(!preview)}>
          <Eye size={15} />
          {preview ? "Edit Canvas" : "Interactive Preview"}
        </Btn>
      </div>
      <div className="v3-builder-grid">
        <Panel title="Component Palette" kicker="BUILD FROM REAL INPUTS">
          <label className="p-field">
            Form Name
            <input
              value={draft.name}
              disabled={!editable}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label className="p-field">
            Authorized Source
            <Pick
              label="Form Target"
              value={effectiveTarget}
              onChange={(target) => {
                change({ target });
                setValues({});
              }}
              options={targets.map((t) => ({ value: t.id, label: t.title }))}
            />
          </label>
          <div className="tech-palette">
            {kinds.map((k) => (
              <button
                disabled={!editable}
                key={k}
                draggable={editable}
                onDragStart={(e) =>
                  e.dataTransfer.setData("application/daenem-field", k)
                }
                onClick={() => add(k)}
              >
                <Plus size={13} />
                {k}
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title={draft.name || "Untitled Form"}
          kicker={
            preview
              ? "INTERACTIVE LOCAL PREVIEW"
              : "DROP COMPONENTS ON THE CANVAS"
          }
          className="tech-form-canvas"
        >
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const kind = e.dataTransfer.getData("application/daenem-field");
              if (kinds.includes(kind as FieldKind)) add(kind as FieldKind);
            }}
            style={{ minHeight: 300 }}
          >
            {!draft.fields.length && (
              <Empty
                title="Start With A Field"
                message="Choose a component or drag one into this canvas."
              />
            )}
            {draft.fields.map((field, i) => {
              const previewValue =
                values[field.id] ?? previewDefaults[field.id] ?? "";
              if (
                preview &&
                field.when &&
                (values[field.when] ?? previewDefaults[field.when] ?? "") !==
                  field.equals
              )
                return null;
              return (
                <div
                  className={
                    "tech-canvas-field " +
                    (selected === field.id ? "selected" : "")
                  }
                  key={field.id}
                  draggable={!preview && editable}
                  onDragStart={() => setDrag(field.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    if (drag) {
                      e.stopPropagation();
                      reorder(drag, i);
                      setDrag("");
                    }
                  }}
                >
                  <div className="tech-form-toolbar">
                    {!preview && (
                      <>
                        <GripVertical size={15} />
                        <button
                          type="button"
                          onClick={() => setSelected(field.id)}
                        >
                          {field.label}
                        </button>
                        <Btn
                          variant="quiet"
                          aria-label={"Move " + field.label + " earlier"}
                          disabled={i === 0}
                          onClick={() => reorder(field.id, i - 1)}
                        >
                          <ChevronUp size={14} />
                        </Btn>
                        <Btn
                          variant="quiet"
                          aria-label={"Remove " + field.label}
                          onClick={() =>
                            change({
                              fields: draft.fields.filter(
                                (x) => x.id !== field.id,
                              ),
                            })
                          }
                        >
                          <X size={14} />
                        </Btn>
                      </>
                    )}
                  </div>
                  <label className="p-field">
                    {field.label}
                    {field.required ? " *" : ""}
                    <SmartField
                      name={field.label}
                      kind={field.kind}
                      value={previewValue}
                      onChange={(v) =>
                        setValues((x) => ({ ...x, [field.id]: v }))
                      }
                      required={field.required}
                      options={field.options}
                    />
                  </label>
                  {configuredPrefillOrigin(
                    field,
                    previewValue,
                    mappedContext,
                  ) && (
                    <small className="tech-field-origin">
                      Prefilled ·{" "}
                      {configuredPrefillOrigin(
                        field,
                        previewValue,
                        mappedContext,
                      )}{" "}
                      · Authorized Context
                    </small>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Field Inspector & Publication">
          {f && (
            <>
              <label className="p-field">
                Label
                <input
                  value={f.label}
                  onChange={(e) => update({ label: e.target.value })}
                />
              </label>
              <label className="p-field">
                Required
                <Pick
                  label="Required"
                  value={f.required ? "Yes" : "No"}
                  onChange={(v) => update({ required: v === "Yes" })}
                  options={["No", "Yes"]}
                />
              </label>
              <label className="p-field">
                Choices (One Per Line)
                <textarea
                  value={f.options.join("\n")}
                  onChange={(e) =>
                    update({ options: e.target.value.split("\n") })
                  }
                />
              </label>
              <label className="p-field">
                Prefill Mapping
                <Pick
                  label="Prefill Source"
                  value={f.prefill}
                  onChange={(prefill) => {
                    update({ prefill });
                    setValues((x) => {
                      const next = { ...x };
                      delete next[f.id];
                      return next;
                    });
                  }}
                  options={[
                    "None",
                    "Current user",
                    "Company",
                    "Department",
                    "Manager",
                    "Location",
                    "Current date",
                  ]}
                />
              </label>
              <label className="p-field">
                Default Value
                <input
                  value={f.defaultValue}
                  onChange={(e) => {
                    update({ defaultValue: e.target.value });
                    setValues((x) => {
                      const next = { ...x };
                      delete next[f.id];
                      return next;
                    });
                  }}
                />
              </label>
              <label className="p-field">
                Show When Field
                <Pick
                  label="Conditional Field"
                  value={f.when}
                  onChange={(when) => update({ when })}
                  options={[
                    { value: "", label: "Always" },
                    ...draft.fields
                      .filter((x) => x.id !== f.id)
                      .map((x) => ({ value: x.id, label: x.label })),
                  ]}
                />
              </label>
              {f.when && (
                <label className="p-field">
                  Equals
                  <input
                    value={f.equals}
                    onChange={(e) => update({ equals: e.target.value })}
                  />
                </label>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="p-form-error">
              {error}
            </p>
          )}
          <label className="p-field">
            Publication Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="v3-vertical-actions">
            <Btn
              variant="outline"
              disabled={!editable}
              onClick={() => advance("Validated")}
            >
              Validate Form
            </Btn>
            <Btn
              variant="outline"
              disabled={stage !== "Validated"}
              onClick={() => {
                advance("Simulated");
                setPreview(true);
              }}
            >
              Simulate Preview
            </Btn>
            {canAct(m, session, "publish") && (
              <Btn
                disabled={stage !== "Simulated"}
                onClick={() => advance("Published")}
              >
                Publish Local Form
              </Btn>
            )}
          </div>
          <p className="p-secondary">
            Published versions appear in Forms Center. Field values are stored
            only when an authorized user saves a response.
          </p>
        </Panel>
      </div>
      <Panel title="Published Versions">
        {versions
          .filter((v) =>
            canView(
              modules.find((m) => m.id === v.target),
              session,
            ),
          )
          .map((v) => (
            <div key={v.id + v.version} className="v3-version-row">
              <strong>
                {v.name} · v{v.version}
              </strong>
              <Badge>{v.state}</Badge>
              {editable && (
                <Btn
                  variant="outline"
                  onClick={() => {
                    try {
                      change({
                        id: fixtureId(),
                        name: v.name + " Copy",
                        target: v.target,
                        fields: JSON.parse(v.definition.schema || "[]"),
                      });
                      setValues({});
                    } catch {
                      setError("This version has no multi-field schema.");
                    }
                  }}
                >
                  Clone To Draft
                </Btn>
              )}
            </div>
          ))}
      </Panel>
    </>
  );
}
