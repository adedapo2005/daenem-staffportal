export const propertyPortfolioStates = [
  "Occupied",
  "Available",
  "Maintenance",
] as const;

export type PropertyPortfolioState = (typeof propertyPortfolioStates)[number];

export const propertyPortfolioLanes = [
  {
    id: "occupied",
    label: "Occupied",
    states: ["Occupied"],
    empty: "No authorized property is recorded as occupied.",
  },
  {
    id: "available",
    label: "Available",
    states: ["Available"],
    empty: "No authorized property is recorded as available.",
  },
  {
    id: "maintenance",
    label: "Maintenance",
    states: ["Maintenance"],
    empty: "No authorized property is recorded for maintenance.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  states: readonly PropertyPortfolioState[];
  empty: string;
}>;

export const propertyAuthorityCopy = {
  title: "Occupancy, rent and receipts need separate source records",
  body:
    "This workspace shows the recorded property state and aggregate occupancy. A rent schedule, amount due or lease status does not confirm payment, receipt issue, bank settlement or reconciliation.",
  occupancy: "Aggregate property record",
  payment: "Payment confirmation not connected",
  reconciliation: "Receipt and reconciliation source not connected",
} as const;

export function propertyLaneForStatus(status: string) {
  return propertyPortfolioLanes.findIndex((lane) =>
    (lane.states as readonly string[]).includes(status),
  );
}

export function isAuthoritativePropertyStatus(status: string) {
  return propertyPortfolioStates.includes(status as PropertyPortfolioState);
}
