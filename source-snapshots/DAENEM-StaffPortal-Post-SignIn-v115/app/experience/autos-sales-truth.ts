import type { ModuleDef, RecordData } from "./model";
import type { RecordIdentityFact } from "./record-workspace";

export const AUTOS_SALES_STAGES = [
  "New Lead",
  "Viewing",
  "Test Drive",
  "Deposit Review",
  "Sale Review",
  "Delivery Review",
];

const LEGACY_STAGE_LABELS: Record<string, string> = {
  Showing: "Viewing",
  Deposit: "Deposit Review",
  Sale: "Sale Review",
  Delivery: "Delivery Review",
};

export function autosSalesPresentation(
  module: ModuleDef,
  rows: RecordData[],
): { module: ModuleDef; rows: RecordData[] } {
  const presentedModule: ModuleDef = {
    ...module,
    purpose:
      "Track prospects, vehicle interest and recorded sales amounts. Payment stays unconfirmed until bank reconciliation.",
    archetype: "Vehicle Sales Review Workspace",
    kind: "records",
    stages: AUTOS_SALES_STAGES,
    fields: [
      "Prospect",
      "Vehicle",
      "Test Drive",
      "Recorded Deposit Request",
      "Recorded Balance",
      "Payment Confirmation",
    ],
  };

  const presentedRows = rows.map((row) => {
    const {
      Deposit: legacyDeposit,
      "Outstanding Balance": legacyBalance,
      ...safeFields
    } = row.fields;

    return {
      ...row,
      amount: 0,
      status: LEGACY_STAGE_LABELS[row.status] || row.status,
      fields: {
        ...safeFields,
        "Recorded Deposit Request":
          safeFields["Recorded Deposit Request"] ||
          legacyDeposit ||
          "Not Recorded",
        "Recorded Balance":
          safeFields["Recorded Balance"] || legacyBalance || "Not Recorded",
        "Payment Confirmation": "Not Confirmed",
      },
    };
  });

  return { module: presentedModule, rows: presentedRows };
}

export function autosSalesIdentityFacts(
  row: RecordData,
): RecordIdentityFact[] {
  return [
    { label: "Sales Contact", value: row.owner },
    { label: "Next Review", value: row.due || "Not Recorded" },
    { label: "Payment Status", value: "Not Confirmed" },
  ];
}
