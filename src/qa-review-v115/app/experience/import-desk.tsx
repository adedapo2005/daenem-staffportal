"use client";
import { readXlsx } from "./xlsx-reader";
import { useState } from "react";
import { UploadCloud, Check } from "lucide-react";
import { useLab } from "./lab-context";
import { defaultImportMapping, parseCSV, importRows } from "./import-contract";
import {
  modules,
  companies,
  canAct,
  fieldAccess,
  byId,
  authorizedCompaniesForModule,
} from "./model";
import { Panel, Btn, Pick, Badge, Callout } from "./ui";
export function ImportDesk() {
  const { session, records, importBatch } = useLab();
  const targets = modules.filter(
    (m) =>
      canAct(m, session, "create") &&
      [
        "inventory",
        "people",
        "tasks",
        "procurement",
        "expenses",
        "auto-leads",
        "property-leads",
      ].includes(m.id),
  );
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[]>(
      [],
    ),
    [sheet, setSheet] = useState(""),
    [target, setTarget] = useState(targets[0]?.id || ""),
    [company, setCompany] = useState<string>(
      session.company === "group" ? "printing" : session.company,
    ),
    [data, setData] = useState<string[][]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [fileName, setFileName] = useState(""),
    [error, setError] = useState(""),
    [validated, setValidated] = useState(false),
    [done, setDone] = useState(false),
    [skip, setSkip] = useState(false);
  const effectiveTarget = targets.some((item) => item.id === target)
      ? target
      : targets[0]?.id || "",
    m = byId(effectiveTarget),
    authorizedCompanyIds = authorizedCompaniesForModule(session, m),
    companyOptions = companies.filter(
      (candidate) =>
        candidate.id !== "group" &&
        authorizedCompanyIds.includes(candidate.id) &&
        (session.company === "group" || candidate.id === session.company),
    ),
    preferredCompany =
      m?.company && m.company !== "group" ? m.company : company,
    effectiveCompany = companyOptions.some(
      (candidate) => candidate.id === preferredCompany,
    )
      ? preferredCompany
      : companyOptions[0]?.id || "",
    importFields = m
      ? [
          "Title",
          ...m.fields.filter(
            (field) => fieldAccess(m.id, field, session) === "edit",
          ),
        ]
      : ["Title"];
  let candidates: ReturnType<typeof importRows> = [],
    mappingError = "";
  try {
    if (data.length)
      candidates = importRows(
        data,
        mapping,
        effectiveTarget,
        effectiveCompany,
        session,
        records,
      );
  } catch (e) {
    mappingError = (e as Error).message;
  }
  const invalid = candidates.filter((c) => c.error),
    valid = candidates.filter((c) => !c.error);
  async function load(file?: File) {
    if (!file) return;
    setDone(false);
    setValidated(false);
    if (!/^.+\.(csv|xlsx)$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
      setError(
        "Choose CSV or XLSX up to 2 MB. Macros and formula cells are not accepted.",
      );
      return;
    }
    try {
      const workbook = file.name.toLowerCase().endsWith(".xlsx")
        ? await readXlsx(await file.arrayBuffer())
        : [];
      setSheets(workbook);
      setSheet(workbook[0]?.name || "");
      const rows = workbook.length
        ? workbook[0].rows
        : parseCSV(await file.text());
      if (!rows.length) throw new Error("The file is empty.");
      setData(rows);
      setFileName(file.name);
      setMapping(defaultImportMapping(rows[0], importFields));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Panel
        title="Controlled Data Import"
        kicker="FILE → MAP → VALIDATE → DRY RUN → LOCAL COMMIT"
      >
        <div className="p-form-grid">
          <label className="p-field">
            Authorized Entity
            <Pick
              label="Import Entity"
              value={effectiveTarget}
              onChange={(v) => {
                const next = byId(v),
                  nextFields = next
                    ? [
                        "Title",
                        ...next.fields.filter(
                          (field) =>
                            fieldAccess(next.id, field, session) === "edit",
                        ),
                      ]
                    : ["Title"];
                setTarget(v);
                if (
                  session.company === "group" &&
                  next?.company &&
                  next.company !== "group"
                )
                  setCompany(next.company);
                setMapping(
                  data.length
                    ? defaultImportMapping(data[0], nextFields)
                    : {},
                );
                setValidated(false);
                setDone(false);
              }}
              options={targets.map((m) => ({ value: m.id, label: m.title }))}
            />
          </label>
          <label className="p-field">
            Company
            <Pick
              label="Import Company"
              value={effectiveCompany}
              onChange={(v) => {
                setCompany(v);
                setValidated(false);
              }}
              options={companyOptions.map((candidate) => ({
                value: candidate.id,
                label: candidate.name,
              }))}
            />
          </label>
        </div>
        <div
          className="tech-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            load(e.dataTransfer.files[0]);
          }}
        >
          <UploadCloud />
          <label className="p-field">
            Choose Or Drop CSV / XLSX
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => load(e.target.files?.[0])}
            />
          </label>
          <small>500 rows · 2 MB maximum · local batch only</small>
        </div>
        {sheets.length > 0 && (
          <label className="p-field">
            Worksheet
            <Pick
              label="Import Worksheet"
              value={sheet}
              onChange={(name) => {
                const rows = sheets.find((item) => item.name === name)!.rows;
                setSheet(name);
                setData(rows);
                setMapping(defaultImportMapping(rows[0] || [], importFields));
                setValidated(false);
                setDone(false);
              }}
              options={sheets.map((s) => s.name)}
            />
            <small>
              Raw cell values are imported. Review date serials and formats in
              the dry run.
            </small>
          </label>
        )}
        {fileName && (
          <p>
            {fileName} · {data.length - 1} rows
          </p>
        )}
        {(error || mappingError) && (
          <p role="alert" className="p-form-error">
            {error || mappingError}
          </p>
        )}
      </Panel>
      {data.length > 0 && m && (
        <>
          <Panel title="Column Mapping">
            <div className="p-form-grid">
              {data[0].map((header, i) => (
                <label key={header + i} className="p-field">
                  {header}
                  <Pick
                    label={"Map " + header}
                    value={mapping[header] || ""}
                    onChange={(v) => {
                      setMapping((x) => ({ ...x, [header]: v }));
                      setValidated(false);
                      setDone(false);
                    }}
                    options={["", ...importFields]}
                  />
                </label>
              ))}
            </div>
            <Btn
              variant="outline"
              onClick={() => {
                setValidated(true);
                setDone(false);
              }}
            >
              Validate & Dry Run
            </Btn>
          </Panel>
          {validated && (
            <Panel
              title="Dry-Run Results"
              kicker={done ? "LOCAL BATCH COMMITTED" : "NO CHANGES YET"}
            >
              <div className="p-button-row">
                <Badge>{valid.length} Valid</Badge>
                <Badge>{invalid.length} Blocked Or Duplicate</Badge>
              </div>
              <div className="tech-import-results">
                {candidates.map((c) => (
                  <div key={c.line}>
                    <span>Row {c.line}</span>
                    <strong>{c.row.title || "Untitled Row"}</strong>
                    <span>{c.error || "Ready for local import"}</span>
                  </div>
                ))}
              </div>
              {invalid.length > 0 && !done && (
                <label className="p-check">
                  <input
                    type="checkbox"
                    checked={skip}
                    onChange={(e) => setSkip(e.target.checked)}
                  />
                  Skip invalid and duplicate rows explicitly
                </label>
              )}
              {done ? (
                <Callout tone="neutral" title="Local Batch Committed">
                  Open the target workspace to inspect imported records.
                  Reimporting the same titles is rejected as duplicates.
                </Callout>
              ) : (
                <Btn
                  disabled={
                    !valid.length ||
                    (invalid.length > 0 && !skip) ||
                    !!error ||
                    !!mappingError
                  }
                  onClick={() => {
                    if (importBatch(valid.map((c) => c.row))) setDone(true);
                    else
                      setError(
                        "The batch failed revalidation. No rows were added. Review scope and duplicates, then retry.",
                      );
                  }}
                >
                  <Check size={15} />
                  Commit {valid.length} Valid Local Records
                </Btn>
              )}
            </Panel>
          )}
        </>
      )}
    </>
  );
}
