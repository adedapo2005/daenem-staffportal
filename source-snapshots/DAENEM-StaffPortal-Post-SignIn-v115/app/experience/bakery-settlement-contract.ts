export const bakerySettlementAuthority = {
  title: "Accounted money is not confirmed money received",
  body:
    "The current bakery projection can include money still owed. It cannot prove cash received, POS received, transfer received, receipt issue, bank settlement or reconciliation.",
  receivedMoney: "Received-only settlement source not connected",
  openObligation: "Keep open until an authoritative settlement record arrives",
  receipt: "Receipt issue is not claimed",
  close: "Financial close is unavailable",
} as const;

export const bakerySettlementMarkers = {
  workflow: "received-only-authority-required",
  receivedMoney: "unavailable",
  receiptTruth: "not-claimed",
  financialClose: "blocked",
  authorityCopy:
    "accounted-not-received|settlement-unavailable|close-blocked",
} as const;

export function bakeryDisplayStatus(status: string) {
  if (status === "Resolved") return "Variance classified · settlement open";
  if (status === "Reconciled") return "Legacy reconciliation · verify settlement";
  return status;
}

export function canPresentBakeryFinancialClose() {
  return false;
}
