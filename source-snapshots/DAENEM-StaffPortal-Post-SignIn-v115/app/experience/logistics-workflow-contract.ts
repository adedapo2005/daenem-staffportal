export const logisticsLifecycle = [
  "Booked",
  "Assigned",
  "In Transit",
  "POD Required",
  "Delivered",
  "Closed",
] as const;

export type LogisticsLifecycleStage = (typeof logisticsLifecycle)[number];

export const logisticsBoardLanes = [
  {
    id: "planning",
    label: "Planning",
    stages: ["Booked", "Assigned"],
    empty: "No authorized trip is waiting for assignment.",
  },
  {
    id: "journey",
    label: "Journey record",
    stages: ["In Transit"],
    empty: "No authorized trip has an in-transit record.",
  },
  {
    id: "delivery",
    label: "Delivery evidence",
    stages: ["POD Required", "Delivered"],
    empty: "No authorized trip is waiting for delivery evidence.",
  },
  {
    id: "closeout",
    label: "Close-out",
    stages: ["Closed"],
    empty: "No authorized trip has completed governed close-out.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  stages: readonly LogisticsLifecycleStage[];
  empty: string;
}>;

export const logisticsAuthorityCopy = {
  title: "Route, delivery and close-out need authoritative records",
  body:
    "This workspace shows the recorded dispatch journey. It does not invent live GPS, emergency tracking, confirmed delivery, collected funds or reconciliation. Those states require their approved source records.",
  tracking: "Live GPS not connected",
  delivery: "Proof of delivery required",
  reconciliation: "Collections and reconciliation source not connected",
} as const;

export function logisticsLaneForStatus(status: string) {
  return logisticsBoardLanes.findIndex((lane) =>
    (lane.stages as readonly string[]).includes(status),
  );
}

export function isAuthoritativeLogisticsStatus(status: string) {
  return logisticsLifecycle.includes(status as LogisticsLifecycleStage);
}
