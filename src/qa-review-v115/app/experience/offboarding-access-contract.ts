import type { RecordData } from "./model";

export const offboardingAccessAuthority = {
  workflow: "authoritative-access-verification-required",
  accessRemoval: "verification-required",
  selfReportedCompletion: "blocked",
  notApplicable: "audited-exemption-required",
  scope: "company-specific",
  source: "identity-authority-not-connected",
} as const;

export const offboardingAccessCopy = {
  title: "Access removal still needs authoritative verification",
  body:
    "Completing a checklist does not revoke sessions, temporary access or company authority. Keep this step open until the identity authority confirms the exact company scope.",
  fullTermination:
    "Full termination must verify every assigned company separately.",
  companyExit:
    "A one-company exit must preserve legitimate access to unrelated companies.",
  exemption:
    "Not applicable is unavailable without an audited exemption or transfer reason from the backend authority.",
} as const;

export function isOffboardingRecord(row: Pick<RecordData, "title" | "fields">) {
  return /offboard|exit|termination/i.test(
    `${row.title} ${row.fields["Lifecycle Type"] || ""}`,
  );
}

export function accessRemovalState(
  row: Pick<RecordData, "title" | "fields">,
) {
  if (!isOffboardingRecord(row)) return "not-applicable-to-onboarding";
  return "verification-required";
}

/**
 * The current QA source has no authoritative identity/session projection.
 * Presentation must remain fail-closed until that backend contract is wired.
 */
export function canClaimVerifiedAccessRemoval() {
  return false;
}
