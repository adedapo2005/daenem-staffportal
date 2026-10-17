"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { SignInExperience } from "./staffportal-import/signin-experience";
import {
  DEFAULT_SIGNIN_PREFERENCES,
  normalizeSignInPreferences,
} from "./staffportal-import/signin-preferences";
import { themeById } from "./staffportal-import/theme-system";
import {
  SignInRuntimeRenderer,
  defaultThemeDefinition,
  type SignInThemeDefinition,
} from "./signin-theme-runtime";
import {
  staffPortalThemeId,
  type UnifiedSignInThemeRecord,
} from "./signin-unified-registry";
import "./staffportal-import/signin-experience.css";
import "./unified-signin-renderer.css";
import { WebflowHomeSignIn } from "./webflow-home-signin";

declare const __DAENEM_SOURCE_COMMIT__: string;
export const RENDERED_SOURCE_COMMIT =
  typeof __DAENEM_SOURCE_COMMIT__ === "string"
    ? __DAENEM_SOURCE_COMMIT__
    : "SOURCE_COMMIT_UNAVAILABLE";

function productionPreferences(record: UnifiedSignInThemeRecord) {
  return normalizeSignInPreferences({
    ...structuredClone(DEFAULT_SIGNIN_PREFERENCES),
    backgroundId: record.BACKGROUND.assetId,
    themeMode:
      record.SOURCE_THEME_ID === "auto-showroom-night" ? "night" : "day",
    globalOperations: {
      ...DEFAULT_SIGNIN_PREFERENCES.globalOperations,
      visible: true,
      showAnalog: true,
      showDigital: true,
      showWeather: true,
    },
  });
}

function productionVars(record: UnifiedSignInThemeRecord): CSSProperties {
  const theme = themeById(staffPortalThemeId(record));
  const palette =
    record.SOURCE_THEME_ID === "auto-showroom-night" ? theme.night : theme.day;
  return {
    "--font-heading": `"${record.TYPOGRAPHY.heading}"`,
    "--font-body": `"${record.TYPOGRAPHY.body}"`,
    "--usp-blue": palette.primary,
    "--usp-cyan": palette.secondary,
    "--usp-coral": palette.accent,
    "--usp-green": palette.success,
    "--usp-ink": palette.text,
    "--usp-muted": palette.muted,
  } as CSSProperties;
}

export function UnifiedSignInRenderer({
  record,
  runtimeTheme,
  now,
  auth,
  search,
  preview = false,
  onInstall = () => undefined,
}: {
  record: UnifiedSignInThemeRecord;
  runtimeTheme?: SignInThemeDefinition;
  now: Date;
  auth: ReactNode;
  search: ReactNode;
  preview?: boolean;
  onInstall?: () => void;
}) {
  const preferences = useMemo(() => productionPreferences(record), [record]);
  if (record.RENDERER_FAMILY === "WEBFLOW_HOME")
    return <WebflowHomeSignIn now={now} auth={auth} record={record} onInstall={onInstall} />;
  if (record.RENDERER_FAMILY === "STAFFPORTAL_EXACT") {
    return (
      <div
        className={`unified-staffportal-renderer ${preview ? "is-preview" : ""} layout-${record.LAYOUT_FAMILY}`}
        data-unified-theme-id={record.THEME_ID}
        data-theme-id={record.THEME_ID}
        data-theme-source={record.SOURCE_PROVENANCE}
        data-theme-display-name={record.DISPLAY_NAME}
        data-source-commit={RENDERED_SOURCE_COMMIT}
        data-source-provenance={record.SOURCE_PROVENANCE}
        data-source-version={record.SOURCE_VERSION}
        data-default-theme={record.IS_DEFAULT ? "true" : "false"}
        style={productionVars(record)}
      >
        <SignInExperience
          authPanel={auth}
          themeId={staffPortalThemeId(record)}
          onInstall={onInstall}
          preferencesOverride={preferences}
          suppressDocumentTheme={preview}
        />
      </div>
    );
  }
  const definition =
    runtimeTheme ||
    record.RUNTIME_DEFINITION ||
    defaultThemeDefinition(record.SOURCE_THEME_ID);
  return (
    <div
      className="unified-sites-renderer"
      data-unified-theme-id={record.THEME_ID}
      data-theme-id={record.THEME_ID}
      data-theme-source={record.SOURCE_PROVENANCE}
      data-theme-display-name={record.DISPLAY_NAME}
      data-source-commit={RENDERED_SOURCE_COMMIT}
      data-source-provenance={record.SOURCE_PROVENANCE}
      data-source-version={record.SOURCE_VERSION}
    >
      <SignInRuntimeRenderer
        theme={definition}
        now={now}
        auth={auth}
        search={search}
        preview={preview}
      />
    </div>
  );
}

export function UnifiedPreviewAuth() {
  return (
    <section
      className="usp-auth-panel usp-auth-panel-signin usp-auth-density-comfortable"
      data-auth-mode="signin"
      aria-label="Authentication preview"
    >
      <div className="usp-panel-heading">
        <div>
          <span className="usp-panel-eyebrow">SECURE STAFF ACCESS</span>
          <h1>Sign In</h1>
          <p>
            Use your employee email or username to enter the live ERP workspace.
          </p>
        </div>
        <span className="usp-mfa-chip">EXTRA VERIFICATION</span>
      </div>
      <div
        className="usp-tabs usp-tabs-signin"
        role="tablist"
        aria-label="Authentication options"
      >
        <button type="button" className="active">
          Sign In
        </button>
        <button type="button">Create Account</button>
      </div>
      <form
        className="usp-auth-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="usp-field">
          <span className="usp-field-label">Username or Email</span>
          <input readOnly value="" />
        </label>
        <div className="usp-password-block">
          <label className="usp-field">
            <span className="usp-field-label">Password</span>
            <span className="usp-password-field">
              <input readOnly type="password" value="" />
            </span>
          </label>
          <button type="button" className="usp-forgot-link">
            Forgot Password?
          </button>
        </div>
        <label className="usp-remember-row">
          <input type="checkbox" readOnly />
          <span className="usp-check-ui" />
          <span>
            Remember Me<small>Trusted devices only</small>
          </span>
        </label>
        <button className="usp-primary-button" type="submit">
          Sign In
        </button>
      </form>
      <div className="usp-or-divider">
        <span />
        OR
        <span />
      </div>
      <div className="usp-social-buttons">
        <button type="button">Microsoft</button>
        <button type="button">Google</button>
      </div>
      <p className="usp-social-note">
        Other sign-in options are not connected yet.
      </p>
      <p className="usp-legal-copy">
        By continuing to login, you agree to Daenem Group&apos;s Terms and Conditions.
      </p>
      <div className="usp-panel-footer">
        <span className="usp-operational-pill">
          <i /> Other sign-in options unavailable
        </span>
      </div>
    </section>
  );
}
