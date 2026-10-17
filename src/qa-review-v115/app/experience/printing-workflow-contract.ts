export const printingLifecycle = [
  "Enquiry",
  "Quote",
  "Customer Approval",
  "Invoice",
  "Customer Payment",
  "Payment Confirmed",
  "Production",
  "QC",
  "Ready/Delivered",
  "Reconciliation",
  "Complete",
] as const;

export type PrintingLifecycleStage = (typeof printingLifecycle)[number];

export const printingBoardLanes = [
  {
    id: "commercial",
    label: "Commercial",
    stages: ["Enquiry", "Quote", "Customer Approval", "Invoice"],
    empty: "No commercial job is available in this authorized view.",
  },
  {
    id: "payment",
    label: "Payment authority",
    stages: ["Customer Payment", "Payment Confirmed"],
    empty: "No authoritative customer-payment state is available.",
  },
  {
    id: "production",
    label: "Production & QC",
    stages: ["Production", "QC"],
    empty: "No job is shown in production or QC.",
  },
  {
    id: "closeout",
    label: "Delivery & close-out",
    stages: ["Ready/Delivered", "Reconciliation", "Complete"],
    empty: "No authoritative delivery or reconciliation state is available.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  stages: readonly PrintingLifecycleStage[];
  empty: string;
}>;

export const printingAuthorityCopy = {
  title: "Payment and reconciliation need authoritative records",
  body:
    "This QA workspace does not confirm customer payment, release production, or close reconciliation from an editable amount. Those states must come from the approved payment and reconciliation records.",
  commercial: "Job record available",
  payment: "Authoritative payment source not connected",
  reconciliation: "Authoritative reconciliation source not connected",
} as const;

export function printingLaneForStatus(status: string) {
  return printingBoardLanes.findIndex((lane) =>
    (lane.stages as readonly string[]).includes(status),
  );
}

export function isAuthoritativePrintingFixtureStatus(status: string) {
  return printingLifecycle.includes(status as PrintingLifecycleStage);
}
