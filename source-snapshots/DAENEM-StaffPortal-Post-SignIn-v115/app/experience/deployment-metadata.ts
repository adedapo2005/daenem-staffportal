import { CURRENT_SAVED_SITE_VERSION } from "./site-version";

// Staff-facing release truth comes from the same source as the authenticated
// shell. Deployment identifiers and timestamps remain outside ordinary user
// surfaces so an older retained build cannot present a competing release.
export const publishedBuildMetadata = {
  releaseLabel: CURRENT_SAVED_SITE_VERSION,
} as const;

export function publishedLabel() {
  return `Staff Portal Release ${publishedBuildMetadata.releaseLabel}`;
}
