import {
  byId,
  canAct,
  canRecordAct,
  fieldAccess,
  mutationError,
  personFor,
  type RecordData,
  type Session,
} from "./model";
export function defaultImportMapping(
  headers: string[],
  authorizedFields: string[],
) {
  const available = new Map(
      authorizedFields.map((field) => [field.trim().toLowerCase(), field]),
    ),
    used = new Set<string>();
  return Object.fromEntries(
    headers.map((header) => {
      const match = available.get(header.trim().toLowerCase()) || "";
      if (!match || used.has(match)) return [header, ""];
      used.add(match);
      return [header, match];
    }),
  );
}
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === "") quoted = !quoted;
      else throw new Error("Unexpected quote in CSV.");
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("An enclosed CSV field is not closed.");
  row.push(value);
  if (row.some((v) => v !== "")) rows.push(row);
  if (rows.length > 501)
    throw new Error("Import at most 500 rows per local batch.");
  if (rows.length && rows.some((r) => r.length !== rows[0].length))
    throw new Error("Every row must have the same number of columns.");
  if (rows[0] && new Set(rows[0]).size !== rows[0].length)
    throw new Error("Column headers must be unique.");
  return rows;
}
export function importRows(
  data: string[][],
  mapping: Record<string, string>,
  moduleId: string,
  company: string,
  session: Session,
  existing: RecordData[],
) {
  const m = byId(moduleId);
  if (
    !m ||
    !canAct(m, session, "create") ||
    !canAct(byId("data-import")!, session, "edit")
  )
    throw new Error("Import action unavailable.");
  if (!data.length) return [];
  if (data.length > 501 || !data[0].length || data[0].length > 200)
    throw new Error("Import at most 500 data rows and 200 columns.");
  if (data.some((r) => r.length !== data[0].length))
    throw new Error("Every row must have the same number of columns.");
  const headers = data[0].map((h) => h.trim().toLowerCase());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("Column headers must be nonempty and unique.");
  const mapped = Object.values(mapping).filter(Boolean);
  if (new Set(mapped).size !== mapped.length)
    throw new Error("Each target field may be mapped only once.");
  const seen = new Set(
    existing
      .filter((r) => r.module === moduleId && r.company === company)
      .map((r) => r.title.toLowerCase()),
  );
  return data.slice(1).map((values, i) => {
    const fields: Record<string, string> = {};
    let title = "";
    data[0].forEach((header, j) => {
      const target = mapping[header];
      if (target === "Title") title = values[j].trim();
      else if (target) {
        if (
          !m.fields.includes(target) ||
          fieldAccess(moduleId, target, session) !== "edit"
        )
          throw new Error("Mapped field unavailable.");
        fields[target] = values[j];
      }
    });
    const row: RecordData = {
      id: "IMP-" + moduleId + "-" + Date.now() + "-" + i,
      module: moduleId,
      title,
      subtitle: "Imported local fixture",
      company: company as RecordData["company"],
      status: m.stages[0],
      owner: personFor(session),
      amount: Number(fields.Amount || 0),
      due: new Date().toISOString().slice(0, 10),
      fields,
      evidence: [],
      history: [],
    };
    let error = !title
      ? "Title is required."
      : seen.has(title.toLowerCase())
        ? "Duplicate title in this company."
        : mutationError(row, fields, row.status, session, true);
    if (!error && !canRecordAct(row, m, session, "create"))
      error = "Company scope unavailable.";
    if (!error) {
      for (const f of m.fields.filter((f) =>
        /^(Quantity|Amount|On Hand|Reserved|Reorder Level|Unit Cost)$/.test(f),
      )) {
        if (
          fields[f] !== undefined &&
          (!Number.isFinite(Number(fields[f])) || Number(fields[f]) < 0)
        )
          error = f + " must be nonnegative.";
      }
    }
    seen.add(title.toLowerCase());
    return { row, error, line: i + 2 };
  });
}
export function validateImportBatch(
  batch: RecordData[],
  session: Session,
  current: RecordData[],
): string | null {
  if (
    !batch.length ||
    batch.length > 500 ||
    !canAct(byId("data-import")!, session, "edit")
  )
    return "Import unavailable.";
  const allowed = [
    "inventory",
    "people",
    "tasks",
    "procurement",
    "expenses",
    "auto-leads",
    "property-leads",
  ];
  const moduleId = batch[0].module,
    company = batch[0].company,
    m = byId(moduleId);
  if (!m || !allowed.includes(moduleId)) return "Unsupported import target.";
  const seen = new Set(
    current.map(
      (r) => r.module + ":" + r.company + ":" + r.title.trim().toLowerCase(),
    ),
  );
  const ids = new Set(current.map((r) => r.module + ":" + r.id));
  for (const row of batch) {
    const key =
      row.module + ":" + row.company + ":" + row.title.trim().toLowerCase();
    if (
      row.module !== moduleId ||
      row.company !== company ||
      row.status !== m.stages[0] ||
      !row.title.trim() ||
      seen.has(key) ||
      ids.has(row.module + ":" + row.id)
    )
      return "Duplicate, missing title or inconsistent batch.";
    if (
      Object.keys(row.fields).some(
        (f) =>
          !m.fields.includes(f) || fieldAccess(moduleId, f, session) !== "edit",
      )
    )
      return "Field unavailable.";
    const error = mutationError(row, row.fields, row.status, session, true);
    if (error) return error;
    for (const f of m.fields.filter((f) =>
      /^(Quantity|Amount|On Hand|Reserved|Reorder Level|Unit Cost)$/.test(f),
    ))
      if (
        row.fields[f] !== undefined &&
        (!Number.isFinite(Number(row.fields[f])) || Number(row.fields[f]) < 0)
      )
        return "Invalid numeric value.";
    seen.add(key);
    ids.add(row.module + ":" + row.id);
  }
  return null;
}
