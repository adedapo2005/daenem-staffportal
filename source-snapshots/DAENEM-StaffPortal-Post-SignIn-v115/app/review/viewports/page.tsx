"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  byId,
  canAct,
  canView,
  layouts,
  recordsFor,
  seedRecords,
  type Session,
} from "../../experience/model";
import {
  sessionForProfile,
  testProfiles,
} from "../../experience/security-contract";
import {
  CANONICAL_SIGNIN_THEME_REGISTRY,
  STAFFPORTAL_DEFAULT_THEME_ID,
} from "../../experience/signin-unified-registry";
import {
  CURRENT_SAVED_SITE_VERSION,
  CURRENT_SIGNIN_STUDIO_VERSION,
} from "../../experience/site-version";

const sizes = [
  [390, 844],
  [430, 932],
  [768, 1024],
  [991, 1366],
  [992, 1366],
  [1024, 1366],
  [1275, 900],
  [1276, 900],
  [1280, 800],
  [1315, 900],
  [1316, 900],
  [1365, 900],
  [1366, 768],
  [1672, 941],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
] as const;
const signinThemes = CANONICAL_SIGNIN_THEME_REGISTRY.map(
  (theme) => theme.THEME_ID,
);
const scenes = [
  "signin",
  "home",
  "cockpit",
  "profile",
  "attendance",
  "leave",
  "people",
  "lifecycle",
  "payroll",
  "salary-adjustments",
  "payslips",
  "applications",
  "printing",
  "bakery",
  "bakery-accountability",
  "autos",
  "logistics",
  "properties",
  "finance",
  "expenses",
  "expense-approvals",
  "inventory",
  "procurement",
  "purchase-orders",
  "projects",
  "facilities",
  "technology-services",
  "social",
  "communications",
  "customer-communications",
  "communication-queues",
  "whatsapp-numbers",
  "communication-analytics",
  "communication-preferences",
  "communication-automation",
  "communication-templates",
  "letterheads",
  "ai-letterhead-generator",
  "communication-audit",
  "unified-inbox",
  "banking-operations",
  "treasury",
  "payment-verification",
  "transfers",
  "beneficiaries",
  "payroll-execution",
  "reconciliation",
  "financial-reports",
  "construction-command",
  "construction-portfolio",
  "construction-project",
  "construction-building",
  "construction-area",
  "construction-boq",
  "construction-materials",
  "construction-procurement",
  "construction-consumption",
  "construction-work-orders",
  "construction-contracts",
  "construction-contractors",
  "construction-progress",
  "construction-inspections",
  "construction-finance",
  "construction-payments",
  "construction-reconciliation",
  "construction-whatsapp",
  "construction-risk",
  "construction-ai",
  "construction-reports",
  "security",
  "access",
  "theme",
  "layout",
  "form-builder",
  "workflow-builder",
  "report-builder",
  "admin",
  "signin-design",
  "files",
  "data-import",
  "widget-builder",
  "business-rules",
  "staff-messaging",
  "notifications",
  "tasks",
];
type ReviewTarget =
  | "signin"
  | "portal-home"
  | "communications-control"
  | "meta-vault"
  | "global-shell"
  | "cloud-storage"
  | "authorized-records"
  | "employee-reviews"
  | "expense-requests"
  | "staff-conversations"
  | "dedicated-expense-record"
  | "printing-production"
  | "logistics-dispatch"
  | "property-portfolio"
  | "bakery-settlement"
  | "offboarding-access"
  | "authenticated-time"
  | "autos-sales"
  | "studio-overview"
  | "studio-layout"
  | "studio-widgets"
  | "studio-brand";
const reviewTargets: ReviewTarget[] = [
  "signin",
  "portal-home",
  "communications-control",
  "meta-vault",
  "global-shell",
  "cloud-storage",
  "authorized-records",
  "employee-reviews",
  "expense-requests",
  "staff-conversations",
  "dedicated-expense-record",
  "printing-production",
  "logistics-dispatch",
  "property-portfolio",
  "bakery-settlement",
  "offboarding-access",
  "authenticated-time",
  "autos-sales",
  "studio-overview",
  "studio-layout",
  "studio-widgets",
  "studio-brand",
];
const studioTargetSections: Partial<Record<ReviewTarget, string>> = {
  "studio-overview": "Home",
  "studio-layout": "Editor",
  "studio-widgets": "Widgets",
  "studio-brand": "Brand",
};
const portalTargetRoutes: Partial<Record<ReviewTarget, string>> = {
  "portal-home": "/home",
  "communications-control": "/communication-settings",
  "meta-vault": "/meta-credential-vault",
  "global-shell": "/admin/experience/global-shell",
  "cloud-storage": "/admin/platform/storage",
  "authorized-records": "/print-orders",
  "employee-reviews": "/performance",
  "expense-requests": "/expenses",
  "staff-conversations": "/staff-messaging",
  "dedicated-expense-record": "/expenses/EXP-2048",
  "printing-production": "/printing",
  "logistics-dispatch": "/logistics",
  "property-portfolio": "/properties",
  "bakery-settlement": "/bakery-accountability",
  "offboarding-access": "/lifecycle",
  "authenticated-time": "/expenses/EXP-2048",
  "autos-sales": "/auto-leads",
};
const recordTargetModules: Partial<Record<ReviewTarget, string>> = {
  "authorized-records": "print-orders",
  "employee-reviews": "performance",
  "expense-requests": "expenses",
  "staff-conversations": "staff-messaging",
  "dedicated-expense-record": "expenses",
  "autos-sales": "auto-leads",
};
const recordTargetInteractions: Partial<Record<ReviewTarget, string>> = {
  "authorized-records": "adaptive-master-detail",
  "employee-reviews": "adaptive-master-detail",
  "expense-requests": "adaptive-master-detail",
  "staff-conversations": "communications-master-detail",
  "dedicated-expense-record": "dedicated-record-page",
  "autos-sales": "adaptive-master-detail",
};
const recordTargetIds: Partial<Record<ReviewTarget, string>> = {
  "dedicated-expense-record": "EXP-2048",
};
const canonicalReviewRecords = seedRecords();
const closureProfiles = ["Owner", "Manager", "Employee", "No permission"] as const;
const closureSizes = [
  "390×844",
  "430×932",
  "768×1024",
  "1024×1366",
  "1366×768",
  "1672×941",
  "1920×1080",
  "2560×1440",
  "3840×2160",
] as const;
const MATRIX_CAPTURE_TIMEOUT_MS = 45000;
const matrixTargets = [
  "signin",
  "portal-home",
  "communications-control",
  "meta-vault",
  "global-shell",
  "cloud-storage",
  "authorized-records",
  "employee-reviews",
  "expense-requests",
  "staff-conversations",
  "dedicated-expense-record",
  "printing-production",
  "logistics-dispatch",
  "property-portfolio",
  "bakery-settlement",
  "offboarding-access",
  "authenticated-time",
  "autos-sales",
] as const;
type MatrixTarget = (typeof matrixTargets)[number];
type MatrixScope = MatrixTarget | "all";
type MatrixProfile = (typeof closureProfiles)[number] | "Public";

function profilesForMatrixTarget(
  target: MatrixTarget,
): readonly MatrixProfile[] {
  return target === "signin" ? ["Public"] : closureProfiles;
}

function profilesForMatrixScope(scope: MatrixScope): readonly MatrixProfile[] {
  return scope === "signin"
    ? ["Public"]
    : scope === "all"
      ? ["Public", ...closureProfiles]
      : closureProfiles;
}
type CaptureConfig = {
  size: string;
  theme: string;
  authState: string;
  capture: boolean;
  windowed: boolean;
  matrix: boolean;
  autorun: boolean;
  autoRetry: boolean;
  target: ReviewTarget;
  matrixTarget: MatrixScope;
  profile: string;
  motion: "default" | "off";
};

function readCaptureConfig(): CaptureConfig {
  const query = new URLSearchParams(window.location.search);
  const requestedSize = query.get("size") || "390×844";
  const requestedTheme = query.get("theme") || STAFFPORTAL_DEFAULT_THEME_ID;
  const requestedTarget = query.get("target") || "signin";
  const requestedMatrixTarget = query.get("matrixTarget") || requestedTarget;
  const requestedProfile = query.get("profile") || "Owner";
  return {
    size: sizes.some(([w, h]) => `${w}×${h}` === requestedSize)
      ? requestedSize
      : "390×844",
    theme:
      signinThemes.includes(requestedTheme) ||
      requestedTheme.startsWith("custom:")
        ? requestedTheme
        : STAFFPORTAL_DEFAULT_THEME_ID,
    authState: ["signin", "signup", "recovery", "verify", "password"].includes(
      query.get("authState") || "",
    )
      ? query.get("authState")!
      : "signin",
    capture: query.get("capture") === "1",
    windowed: query.get("windowed") === "1",
    matrix: query.get("matrix") === "1",
    autorun: query.get("autorun") === "1",
    autoRetry: query.get("autoRetry") === "1",
    target: reviewTargets.includes(requestedTarget as ReviewTarget)
      ? (requestedTarget as ReviewTarget)
      : "signin",
    matrixTarget:
      requestedMatrixTarget === "all" ||
      matrixTargets.includes(requestedMatrixTarget as MatrixTarget)
        ? (requestedMatrixTarget as MatrixScope)
        : "portal-home",
    profile:
      requestedProfile === "Public" || testProfiles.includes(requestedProfile)
        ? requestedProfile
        : "Owner",
    motion: query.get("motion") === "off" ? "off" : "default",
  };
}

type MatrixResult = {
  key: string;
  target: MatrixTarget;
  profile: string;
  size: string;
  assertion: "PASS" | "FAIL";
  error: string;
  accessibility: string;
  keyboard: string;
  targetSize: string;
  signInContract: string;
  landmarks: string;
  motion: string;
  overflow: string;
  performance: string;
  projection: string;
  providerTruth: string;
  recordContract: string;
  navigationDurationMs: string;
  resourceCount: string;
  domNodeCount: string;
  focusableCount: string;
};

type EvidenceVerification = {
  state: "IDLE" | "VERIFYING" | "VALID" | "INVALID";
  message: string;
  digest: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatEvidenceTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(value));
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function MatrixRunner({
  scope,
  motion,
  autorun,
  autoRetry,
}: {
  scope: MatrixScope;
  motion: CaptureConfig["motion"];
  autorun: boolean;
  autoRetry: boolean;
}) {
  const cases = useMemo(() => {
    const targets: readonly MatrixTarget[] =
      scope === "all" ? matrixTargets : [scope];
    return targets.flatMap((target) =>
      profilesForMatrixTarget(target).flatMap((profile) =>
        closureSizes.map((size) => ({
          key: `${target}:${profile}:${size}:${motion}`,
          target,
          profile,
          size,
        })),
      ),
    );
  }, [motion, scope]);
  const [status, setStatus] = useState<"IDLE" | "RUNNING" | "PASS" | "FAIL">(
    "IDLE",
  );
  const [runCases, setRunCases] = useState(cases);
  const [runMode, setRunMode] = useState<"full" | "retry">("full");
  const [retryRounds, setRetryRounds] = useState(0);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<MatrixResult[]>([]);
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [reportDigest, setReportDigest] = useState("");
  const [reportPreparing, setReportPreparing] = useState(false);
  const [verification, setVerification] = useState<EvidenceVerification>({
    state: "IDLE",
    message: "Choose a completed Slice I JSON report to verify it locally.",
    digest: "",
  });
  const matrixFrameRef = useRef<HTMLIFrameElement>(null);
  const completedKeyRef = useRef("");
  const activeCase = runCases[index];
  const passed = results.filter((result) => result.assertion === "PASS").length;
  const failed = results.length - passed;
  const reportReady =
    (status === "PASS" || status === "FAIL") && results.length === cases.length;
  const evidenceReport = useMemo(
    () => ({
      schemaVersion: "1.7",
      reportType: "DAENEM_STAFF_PORTAL_SLICE_I_ACCEPTANCE",
      savedSiteVersion: CURRENT_SAVED_SITE_VERSION,
      scope,
      motion,
      status,
      startedAt,
      completedAt,
      manifest: {
        expectedCaseCount: cases.length,
        targets: scope === "all" ? matrixTargets : [scope],
        profiles: profilesForMatrixScope(scope),
        viewportClasses: closureSizes,
        caseKeys: cases.map((item) => item.key),
      },
      summary: {
        total: cases.length,
        completed: results.length,
        passed,
        failed,
      },
      recovery: {
        autoRetry,
        retryRounds,
        lastRunMode: runMode,
      },
      results,
    }),
    [autoRetry, cases, completedAt, failed, motion, passed, results, retryRounds, runMode, scope, startedAt, status],
  );

  const start = useCallback(() => {
    completedKeyRef.current = "";
    setRunCases(cases);
    setRunMode("full");
    setRetryRounds(0);
    setResults([]);
    setIndex(0);
    setStartedAt(new Date().toISOString());
    setCompletedAt("");
    setReportNotice("");
    setReportDigest("");
    setReportPreparing(false);
    setStatus("RUNNING");
  }, [cases]);

  useEffect(() => {
    if (!autorun) return;
    const timer = window.setTimeout(start, 0);
    return () => window.clearTimeout(timer);
  }, [autorun, start]);

  const beginRetry = (retryCases: typeof cases) => {
    completedKeyRef.current = "";
    setRunCases(retryCases);
    setRunMode("retry");
    setRetryRounds((current) => current + 1);
    setIndex(0);
    setCompletedAt("");
    setReportNotice("");
    setReportDigest("");
    setReportPreparing(false);
    setStatus("RUNNING");
  };

  const completeCase = (result: MatrixResult) => {
    if (completedKeyRef.current === result.key) return;
    completedKeyRef.current = result.key;
    const order = new Map(cases.map((item, position) => [item.key, position]));
    const next = [
      ...results.filter((item) => item.key !== result.key),
      result,
    ].sort(
      (left, right) =>
        (order.get(left.key) ?? cases.length) -
        (order.get(right.key) ?? cases.length),
    );
    setResults(next);
    if (index + 1 < runCases.length) {
      setIndex(index + 1);
      completedKeyRef.current = "";
    } else {
      const nextFailedKeys = new Set(
        next
          .filter((item) => item.assertion === "FAIL")
          .map((item) => item.key),
      );
      const autoRetryCases = cases.filter((item) =>
        nextFailedKeys.has(item.key),
      );
      if (
        autoRetry &&
        next.length === cases.length &&
        retryRounds === 0 &&
        autoRetryCases.length
      ) {
        beginRetry(autoRetryCases);
        return;
      }
      setCompletedAt(new Date().toISOString());
      setStatus(
        next.length === cases.length &&
          next.every((item) => item.assertion === "PASS")
          ? "PASS"
          : "FAIL",
      );
    }
  };

  const retryFailedCases = () => {
    if (status !== "FAIL") return;
    const failedKeys = new Set(
      results
        .filter((result) => result.assertion === "FAIL")
        .map((result) => result.key),
    );
    const retryCases = cases.filter((item) => failedKeys.has(item.key));
    if (!retryCases.length) return;
    beginRetry(retryCases);
  };

  const downloadEvidenceReport = async () => {
    if (!reportReady || reportPreparing) return;
    setReportPreparing(true);
    setReportDigest("");
    setReportNotice("Preparing evidence integrity fingerprint…");
    try {
      const canonicalPayload = JSON.stringify(evidenceReport);
      const payloadSha256 = await sha256Hex(canonicalPayload);
      const verifiedReport = {
        ...evidenceReport,
        integrity: {
          algorithm: "SHA-256",
          canonicalization:
            "UTF-8 compact JSON of this report with the integrity property omitted",
          payloadSha256,
        },
      };
      const blob = new Blob([JSON.stringify(verifiedReport, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `daenem-slice-i-${scope}-${completedAt.replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setReportDigest(payloadSha256);
      setReportNotice(
        `Acceptance evidence downloaded with SHA-256 ${payloadSha256}.`,
      );
    } catch {
      setReportNotice(
        "Evidence download stopped because its SHA-256 fingerprint could not be created.",
      );
    } finally {
      setReportPreparing(false);
    }
  };

  const verifyEvidenceReport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setVerification({
      state: "VERIFYING",
      message: "Verifying report fingerprint and case manifest…",
      digest: "",
    });
    try {
      if (file.size > 5_000_000) throw new Error("FILE_TOO_LARGE");
      const parsed: unknown = JSON.parse(await file.text());
      if (!isRecord(parsed) || !isRecord(parsed.integrity))
        throw new Error("INTEGRITY_MISSING");
      const { integrity, ...payload } = parsed;
      const expectedDigest = integrity.payloadSha256;
      if (
        integrity.algorithm !== "SHA-256" ||
        typeof expectedDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(expectedDigest)
      )
        throw new Error("INTEGRITY_INVALID");
      const actualDigest = await sha256Hex(JSON.stringify(payload));
      if (actualDigest !== expectedDigest) throw new Error("DIGEST_MISMATCH");
      if (
        payload.schemaVersion !== "1.7" ||
        payload.reportType !== "DAENEM_STAFF_PORTAL_SLICE_I_ACCEPTANCE" ||
        payload.savedSiteVersion !== CURRENT_SAVED_SITE_VERSION ||
        !isRecord(payload.manifest) ||
        !isRecord(payload.summary) ||
        !Array.isArray(payload.results)
      )
        throw new Error("REPORT_CONTRACT_INVALID");
      const caseKeys = payload.manifest.caseKeys;
      const expectedCaseCount = payload.manifest.expectedCaseCount;
      const reportScope = payload.scope;
      const reportMotion = payload.motion;
      if (
        (reportScope !== "all" &&
          !matrixTargets.includes(reportScope as MatrixTarget)) ||
        (reportMotion !== "default" && reportMotion !== "off")
      )
        throw new Error("MATRIX_SCOPE_INVALID");
      const expectedTargets: readonly MatrixTarget[] =
        reportScope === "all" ? matrixTargets : [reportScope as MatrixTarget];
      const expectedResultDimensions = expectedTargets.flatMap((target) =>
        profilesForMatrixTarget(target).flatMap((profile) =>
          closureSizes.map((size) => ({
            key: `${target}:${profile}:${size}:${reportMotion}`,
            target,
            profile,
            size,
          })),
        ),
      );
      const expectedManifestKeys = expectedResultDimensions.map(
        (item) => item.key,
      );
      if (
        typeof expectedCaseCount !== "number" ||
        !Array.isArray(caseKeys) ||
        !caseKeys.every((key) => typeof key === "string") ||
        expectedCaseCount !== expectedManifestKeys.length ||
        caseKeys.length !== expectedManifestKeys.length ||
        new Set(caseKeys).size !== expectedCaseCount ||
        caseKeys.some((key, index) => key !== expectedManifestKeys[index]) ||
        payload.results.length !== expectedCaseCount ||
        JSON.stringify(payload.manifest.targets) !==
          JSON.stringify(expectedTargets) ||
        JSON.stringify(payload.manifest.profiles) !==
          JSON.stringify(profilesForMatrixScope(reportScope as MatrixScope)) ||
        JSON.stringify(payload.manifest.viewportClasses) !==
          JSON.stringify(closureSizes)
      )
        throw new Error("MANIFEST_INVALID");
      const verifiedResults = payload.results.filter(isRecord);
      const resultKeys = verifiedResults.map((result) => result.key);
      const evidenceFields = [
        "accessibility",
        "keyboard",
        "targetSize",
        "landmarks",
        "motion",
        "overflow",
        "performance",
        "projection",
      ] as const;
      const evidenceStates = new Set([
        "PASS",
        "FAIL",
        "WAITING",
        "NOT_APPLICABLE",
      ]);
      const metricFields = [
        "navigationDurationMs",
        "resourceCount",
        "domNodeCount",
        "focusableCount",
      ] as const;
      const expectedProviderTruth = (
        target: MatrixTarget,
        profile: MatrixProfile,
      ) => {
        if (target === "signin") return "NOT_APPLICABLE";
        const profileSession = sessionForProfile(profile);
        if (target === "portal-home") {
          const helpModule = byId("help");
          return helpModule && canView(helpModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "communications-control") {
          const communicationsControlModule = byId("communication-settings");
          return communicationsControlModule &&
            canView(communicationsControlModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "meta-vault") {
          const metaVaultModule = byId("meta-credential-vault");
          return metaVaultModule && canView(metaVaultModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "global-shell" || target === "cloud-storage") {
          const adminModule = byId("admin");
          return adminModule && canAct(adminModule, profileSession, "manage")
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "printing-production") {
          const printingModule = byId("printing");
          return printingModule && canView(printingModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "logistics-dispatch") {
          const logisticsModule = byId("logistics");
          return logisticsModule && canView(logisticsModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "property-portfolio") {
          const propertyModule = byId("properties");
          return propertyModule && canView(propertyModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "bakery-settlement") {
          const bakeryModule = byId("bakery-accountability");
          return bakeryModule && canView(bakeryModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "offboarding-access") {
          const lifecycleModule = byId("lifecycle");
          return lifecycleModule && canView(lifecycleModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "authenticated-time") {
          const expensesModule = byId("expenses");
          return expensesModule &&
            canView(expensesModule, profileSession) &&
            recordsFor(canonicalReviewRecords, expensesModule, profileSession).some(
              (row) => row.id === "EXP-2048",
            )
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        if (target === "autos-sales") {
          const autosSalesModule = byId("auto-leads");
          return autosSalesModule && canView(autosSalesModule, profileSession)
            ? "PASS"
            : "NOT_APPLICABLE";
        }
        return "NOT_APPLICABLE";
      };
      if (
        verifiedResults.length !== expectedCaseCount ||
        resultKeys.some((key, index) => key !== caseKeys[index]) ||
        verifiedResults.some((result, index) => {
          const expected = expectedResultDimensions[index];
          const terminalAssertion =
            result.assertion === "PASS" || result.assertion === "FAIL";
          const dimensionsMatch =
            result.target === expected.target &&
            result.profile === expected.profile &&
            result.size === expected.size;
          const evidenceIsRecognized =
            evidenceFields.every((field) =>
              evidenceStates.has(result[field] as string),
            ) &&
            evidenceStates.has(result.signInContract as string) &&
            evidenceStates.has(result.providerTruth as string) &&
            evidenceStates.has(result.recordContract as string);
          const metricsAreNonNegativeIntegers = metricFields.every(
            (field) =>
              typeof result[field] === "string" &&
              /^(0|[1-9]\d*)$/.test(result[field] as string),
          );
          if (
            !terminalAssertion ||
            !dimensionsMatch ||
            !evidenceIsRecognized ||
            !metricsAreNonNegativeIntegers
          )
            return true;
          if (result.assertion === "FAIL")
            return typeof result.error !== "string" || !result.error.trim();
          return (
            result.error !== "" ||
            evidenceFields.some((field) => result[field] !== "PASS") ||
            result.signInContract !==
              (expected.target === "signin" ? "PASS" : "NOT_APPLICABLE") ||
            result.recordContract !==
              (recordTargetInteractions[expected.target]
                ? "PASS"
                : "NOT_APPLICABLE") ||
            result.providerTruth !==
              expectedProviderTruth(
                expected.target,
                expected.profile,
              ) ||
            Number(result.navigationDurationMs) <= 0 ||
            Number(result.domNodeCount) <= 0
          );
        })
      )
        throw new Error("RESULT_SET_INVALID");
      const verifiedPassed = verifiedResults.filter(
        (result) => result.assertion === "PASS",
      ).length;
      const verifiedFailed = expectedCaseCount - verifiedPassed;
      if (
        payload.summary.total !== expectedCaseCount ||
        payload.summary.completed !== expectedCaseCount ||
        payload.summary.passed !== verifiedPassed ||
        payload.summary.failed !== verifiedFailed ||
        payload.status !== (verifiedFailed === 0 ? "PASS" : "FAIL")
      )
        throw new Error("SUMMARY_INVALID");
      setVerification({
        state: "VALID",
        message: `Verified ${file.name}: ${expectedCaseCount} cases, ${verifiedPassed} passed and ${verifiedFailed} failed.`,
        digest: actualDigest,
      });
    } catch {
      setVerification({
        state: "INVALID",
        message:
          "This file could not be verified. Its fingerprint, manifest, results or totals are invalid.",
        digest: "",
      });
    }
  };

  const inspectMatrixCapture = () => {
    if (status !== "RUNNING" || !activeCase) return;
    const started = Date.now();
    const inspect = () => {
      const root = matrixFrameRef.current?.contentDocument?.querySelector<HTMLElement>(
        "[data-capture-assertion]",
      );
      const assertion = root?.dataset.captureAssertion;
      if (assertion !== "PASS" && assertion !== "FAIL") {
        if (Date.now() - started < MATRIX_CAPTURE_TIMEOUT_MS) {
          window.setTimeout(inspect, 100);
          return;
        }
        completeCase({
          key: activeCase.key,
          target: activeCase.target,
          profile: activeCase.profile,
          size: activeCase.size,
          assertion: "FAIL",
          error: "MATRIX_CAPTURE_TIMEOUT",
          accessibility: "WAITING",
          keyboard: "WAITING",
          targetSize: "WAITING",
          signInContract: "WAITING",
          landmarks: "WAITING",
          motion: "WAITING",
          overflow: "WAITING",
          performance: "WAITING",
          projection: "WAITING",
          providerTruth: "WAITING",
          recordContract: "WAITING",
          navigationDurationMs: "0",
          resourceCount: "0",
          domNodeCount: "0",
          focusableCount: "0",
        });
        return;
      }
      completeCase({
        key: activeCase.key,
        target: activeCase.target,
        profile: activeCase.profile,
        size: activeCase.size,
        assertion,
        error: root?.dataset.captureError || "",
        accessibility: root?.dataset.accessibilityAssertion || "WAITING",
        keyboard: root?.dataset.keyboardAssertion || "WAITING",
        targetSize: root?.dataset.targetSizeAssertion || "WAITING",
        signInContract: root?.dataset.signinContractAssertion || "WAITING",
        landmarks: root?.dataset.landmarkAssertion || "WAITING",
        motion: root?.dataset.motionAssertion || "WAITING",
        overflow: root?.dataset.overflowAssertion || "WAITING",
        performance: root?.dataset.performanceSanityAssertion || "WAITING",
        projection: root?.dataset.projectionAssertion || "WAITING",
        providerTruth: root?.dataset.providerTruthAssertion || "WAITING",
        recordContract: root?.dataset.recordContractAssertion || "WAITING",
        navigationDurationMs: root?.dataset.navigationDurationMs || "0",
        resourceCount: root?.dataset.resourceCount || "0",
        domNodeCount: root?.dataset.domNodeCount || "0",
        focusableCount: root?.dataset.focusableCount || "0",
      });
    };
    window.setTimeout(inspect, 0);
  };

  const captureSource = activeCase
    ? `/review/viewports?capture=1&target=${encodeURIComponent(activeCase.target)}&profile=${encodeURIComponent(activeCase.profile)}&size=${encodeURIComponent(activeCase.size)}&motion=${motion}`
    : "";

  return (
    <main
      data-matrix-state={status}
      data-matrix-target={scope}
      data-matrix-motion={motion}
      data-matrix-total={String(cases.length)}
      data-matrix-completed={String(results.length)}
      data-matrix-passed={String(passed)}
      data-matrix-failed={String(failed)}
      data-matrix-run-mode={runMode}
      data-matrix-active-run-total={String(runCases.length)}
      data-matrix-retry-rounds={String(retryRounds)}
      data-matrix-auto-retry={autoRetry ? "enabled" : "disabled"}
      data-matrix-report-ready={reportReady ? "true" : "false"}
      data-matrix-report-integrity={reportDigest ? "SHA-256" : "pending"}
      data-matrix-report-sha256={reportDigest || undefined}
      data-evidence-verification-state={verification.state}
      data-evidence-verification-sha256={verification.digest || undefined}
      data-matrix-started-at={startedAt || undefined}
      data-matrix-completed-at={completedAt || undefined}
      style={{ minHeight: "100vh", padding: 24, background: "#e9eef6", color: "#172337", fontFamily: "Arial,sans-serif" }}
    >
      <h1 style={{ margin: 0, fontSize: 24 }}>Slice I closure matrix runner</h1>
      <p style={{ maxWidth: 820, lineHeight: 1.6 }}>
        Runs one truthful capture at a time across public Sign-In plus the selected authenticated surfaces, supported permission profiles and nine viewport classes. Results remain idle or running until each rendered assertion returns PASS or FAIL.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, margin: "18px 0" }}>
        <button type="button" onClick={start} disabled={status === "RUNNING"}>
          {status === "RUNNING" ? "Matrix running…" : results.length ? "Run matrix again" : `Run ${cases.length}-case matrix`}
        </button>
        <button
          type="button"
          onClick={retryFailedCases}
          disabled={status !== "FAIL" || failed === 0}
        >
          Retry {failed} failed {failed === 1 ? "case" : "cases"}
        </button>
        <button
          type="button"
          onClick={downloadEvidenceReport}
          disabled={!reportReady || reportPreparing}
          aria-describedby="matrix-report-guidance"
        >
          {reportPreparing ? "Preparing fingerprint…" : "Download verified JSON evidence"}
        </button>
        <strong>Target: {scope === "all" ? "All representative surfaces" : scope}</strong>
        <span>Motion: {motion === "off" ? "Off" : "User preference"}</span>
        <span>Status: {status}</span>
        <span>Completed: {results.length}/{cases.length}</span>
        <span>Passed: {passed}</span>
        <span>Failed: {failed}</span>
        <span>Retry rounds: {retryRounds}</span>
        <span>Automatic retry: {autoRetry ? "One bounded round" : "Off"}</span>
      </div>
      <p id="matrix-report-guidance" style={{ color: "#52647e", fontSize: 13 }}>
        Evidence export unlocks only after every rendered case returns PASS or FAIL.
        The download includes the expected case manifest and a SHA-256 fingerprint.
        {completedAt ? ` Completed ${formatEvidenceTime(completedAt)}.` : ""}
      </p>
      {reportNotice && <p role="status" aria-live="polite">{reportNotice}</p>}
      <section
        aria-labelledby="evidence-verifier-title"
        style={{ margin: "18px 0", padding: 16, border: "1px solid #c8d4e4", borderRadius: 14, background: "#f7f9fc" }}
      >
        <h2 id="evidence-verifier-title" style={{ margin: "0 0 8px", fontSize: 17 }}>
          Verify downloaded evidence
        </h2>
        <p style={{ margin: "0 0 12px", color: "#52647e", fontSize: 13 }}>
          Verification happens only in this browser. The selected report is not uploaded or stored.
        </p>
        <label htmlFor="slice-i-evidence-file" style={{ display: "inline-flex", flexDirection: "column", gap: 6, fontWeight: 700 }}>
          Slice I JSON report
          <input
            id="slice-i-evidence-file"
            type="file"
            accept="application/json,.json"
            onChange={verifyEvidenceReport}
            disabled={verification.state === "VERIFYING"}
          />
        </label>
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: "12px 0 0",
            color:
              verification.state === "VALID"
                ? "#08735f"
                : verification.state === "INVALID"
                  ? "#a22b2b"
                  : "#52647e",
          }}
        >
          {verification.message}
        </p>
      </section>
      {status === "RUNNING" && activeCase && (
        <p role="status" aria-live="polite">
          {runMode === "retry" ? "Rechecking" : "Checking"} {activeCase.target}, {activeCase.profile} at {activeCase.size}. Active run {index + 1}/{runCases.length}.
        </p>
      )}
      <div data-matrix-results style={{ overflowX: "auto", border: "1px solid #c8d4e4", borderRadius: 14, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Target", "Profile", "Viewport", "Result", "Accessibility", "Keyboard", "Target Size", "Sign-In", "Projection", "Provider", "Motion", "Performance", "Observed", "Error"].map((label) => (
                <th key={label} scope="col" style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #d7e0ec" }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.key}
                data-matrix-case={result.key}
                data-matrix-case-target={result.target}
                data-matrix-case-result={result.assertion}
                data-matrix-case-error={result.error || undefined}
              >
                <td style={{ padding: 10 }}>{result.target}</td>
                <td style={{ padding: 10 }}>{result.profile}</td>
                <td style={{ padding: 10 }}>{result.size}</td>
                <td style={{ padding: 10 }}>{result.assertion}</td>
                <td style={{ padding: 10 }}>{result.accessibility}</td>
                <td style={{ padding: 10 }}>{result.keyboard}</td>
                <td style={{ padding: 10 }}>{result.targetSize}</td>
                <td style={{ padding: 10 }}>{result.signInContract}</td>
                <td style={{ padding: 10 }}>{result.projection}</td>
                <td style={{ padding: 10 }}>{result.providerTruth}</td>
                <td style={{ padding: 10 }}>{result.motion}</td>
                <td style={{ padding: 10 }}>{result.performance}</td>
                <td style={{ padding: 10 }}>{result.navigationDurationMs} ms · {result.resourceCount} resources · {result.domNodeCount} nodes · {result.focusableCount} controls</td>
                <td style={{ padding: 10 }}>{result.error || "—"}</td>
              </tr>
            ))}
            {!results.length && (
              <tr><td colSpan={14} style={{ padding: 18, color: "#52647e" }}>No capture has run. No acceptance result is claimed.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {status === "RUNNING" && activeCase && (
        <iframe
          ref={matrixFrameRef}
          key={activeCase.key}
          src={captureSource}
          title={`Automated ${activeCase.target} capture for ${activeCase.profile} at ${activeCase.size}`}
          aria-hidden="true"
          tabIndex={-1}
          onLoad={inspectMatrixCapture}
          style={{ position: "absolute", left: -10000, top: 0, width: 420, height: 300, border: 0 }}
        />
      )}
    </main>
  );
}

export default function Viewports() {
  const [configured, setConfigured] = useState(false);
  const [config, setConfig] = useState<CaptureConfig>({
    size: "390×844",
    theme: STAFFPORTAL_DEFAULT_THEME_ID,
    authState: "signin",
    capture: false,
    windowed: false,
    matrix: false,
    autorun: false,
    autoRetry: false,
    target: "signin",
    matrixTarget: "portal-home",
    profile: "Owner",
    motion: "default",
  });
  const [appearance, setAppearance] = useState("Daylight");
  const [profile, setProfile] = useState("Owner");
  const [scene, setScene] = useState("signin");
  const [layout, setLayout] = useState("0");
  const [scale, setScale] = useState(false);
  const [revision, setRevision] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [captureState, setCaptureState] = useState<"WAITING" | "PASS" | "FAIL">(
    "WAITING",
  );
  const [captureError, setCaptureError] = useState("");
  const [windowLaunchState, setWindowLaunchState] = useState<
    "IDLE" | "OPENED" | "BLOCKED"
  >("IDLE");
  const [renderedIdentity, setRenderedIdentity] = useState({
    themeId: "",
    source: "",
    displayName: "",
    sourceCommit: "",
    studioVersion: "",
    ready: "false",
  });
  const [renderedViewport, setRenderedViewport] = useState({
    width: 0,
    height: 0,
  });
  const [captureEvidence, setCaptureEvidence] = useState({
    overflow: "WAITING",
    landmarks: "WAITING",
    accessibility: "WAITING",
    keyboard: "WAITING",
    targetSize: "WAITING",
    signInContract: "NOT_APPLICABLE",
    providerTruth: "NOT_APPLICABLE",
    projection: "WAITING",
    recordContract: "NOT_APPLICABLE",
    motion: "WAITING",
    performance: "WAITING",
  });
  const [runtimeEvidence, setRuntimeEvidence] = useState({
    navigationDurationMs: 0,
    resourceCount: 0,
    domNodeCount: 0,
    focusableCount: 0,
  });
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setConfig(readCaptureConfig());
      setProfile(readCaptureConfig().profile);
      setConfigured(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && /^daenem-draft-(record-selection-|conversation-workspace-)/.test(key))
          localStorage.removeItem(key);
      }
      const next = sessionForProfile(profile);
      sessionStorage.setItem("daenem-demo-session-v3", JSON.stringify(next));
      setSession(next);
      setRevision((value) => value + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile]);

  const safeScene = scenes.includes(scene) ? scene : "signin";
  const [width, height] = config.size.split("×").map(Number);
  const frameSource = useMemo(() => {
    const portalRoute = portalTargetRoutes[config.target];
    if (portalRoute) return `${portalRoute}?reviewHarness=1&reviewMotion=${config.motion}`;
    const studioSection = studioTargetSections[config.target];
    if (studioSection)
      return `/admin/experience/sign-in-studio?studioSection=${studioSection}&reviewHarness=1&reviewMotion=${config.motion}`;
    if (safeScene !== "signin")
      return `/${safeScene}${safeScene === "home" ? `?reviewLayout=${layout}` : ""}`;
    return `/signin?reviewTheme=${appearance}&experience=${encodeURIComponent(config.theme)}&authState=${config.authState}&sourceTheme=canonical&captureRequested=1&reviewMotion=${config.motion}`;
  }, [appearance, config, layout, safeScene]);
  const frameNeedsValidation =
    config.target !== "signin" || safeScene === "signin";

  function openExactReviewWindow() {
    const separator = frameSource.includes("?") ? "&" : "?";
    const popupSource = `${frameSource}${separator}reviewPopup=1&reviewWidth=${width}&reviewHeight=${height}`;
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
    const reviewWindow = window.open(
      popupSource,
      `daenem-review-${config.target}-${width}-${height}`,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );
    setWindowLaunchState(reviewWindow ? "OPENED" : "BLOCKED");
    reviewWindow?.focus();
  }

  function validateFrame() {
    setCaptureState("WAITING");
    setCaptureError("");
    setCaptureEvidence({
      overflow: "WAITING",
      landmarks: "WAITING",
      accessibility: "WAITING",
      keyboard: "WAITING",
      targetSize: "WAITING",
      signInContract: "NOT_APPLICABLE",
      providerTruth: "NOT_APPLICABLE",
      projection: "WAITING",
      recordContract: "NOT_APPLICABLE",
      motion: "WAITING",
      performance: "WAITING",
    });
    setRuntimeEvidence({
      navigationDurationMs: 0,
      resourceCount: 0,
      domNodeCount: 0,
      focusableCount: 0,
    });
    const started = Date.now();
    const inspect = async () => {
      const documentRoot = frameRef.current?.contentDocument;
      const waitForFrameUpdate = () =>
        new Promise<void>((resolve) => {
          const frameWindow = frameRef.current?.contentWindow;
          if (!frameWindow) {
            window.setTimeout(resolve, 0);
            return;
          }
          frameWindow.requestAnimationFrame(() =>
            frameWindow.requestAnimationFrame(() => resolve()),
          );
        });
      const waitForFramePath = async (expectedPath: string) => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          await waitForFrameUpdate();
          if (frameRef.current?.contentWindow?.location.pathname === expectedPath)
            return true;
        }
        return false;
      };
      const waitForFrameSelector = async <T extends Element>(selector: string) => {
        for (let attempt = 0; attempt < 24; attempt += 1) {
          await waitForFrameUpdate();
          const element = documentRoot?.querySelector<T>(selector);
          if (element) return element;
        }
        return null;
      };
      const waitForDedicatedRecordState = async (
        matches: (identifier: string, path: string) => boolean,
      ) => {
        for (let attempt = 0; attempt < 36; attempt += 1) {
          await waitForFrameUpdate();
          const record = documentRoot?.querySelector<HTMLElement>(
            '[data-record-interaction="dedicated-record-page"]',
          );
          const identifier =
            record
              ?.querySelector('[aria-label="Record Identity"] div:nth-child(3) dd')
              ?.textContent?.trim() || "";
          const path = frameRef.current?.contentWindow?.location.pathname || "";
          if (record && matches(identifier, path))
            return { record, identifier, path };
        }
        return null;
      };
      type FrameValueControl = HTMLElement & { value: string };
      const setFrameControlValue = (
        control: FrameValueControl,
        value: string,
      ) => {
        const prototype = Object.getPrototypeOf(control);
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (!setter) return false;
        setter.call(control, value);
        const event = control.ownerDocument.createEvent("Event");
        event.initEvent(control.tagName === "SELECT" ? "change" : "input", true, false);
        control.dispatchEvent(event);
        return true;
      };
      const signInCapture =
        config.target === "signin" && safeScene === "signin";
      const studioCapture = Boolean(studioTargetSections[config.target]);
      const restrictedSurface =
        config.target === "communications-control" ||
        config.target === "meta-vault" ||
        config.target === "global-shell" ||
        config.target === "cloud-storage";
      const recordModuleId = recordTargetModules[config.target];
      const recordInteraction = recordTargetInteractions[config.target];
      const recordSurface = Boolean(recordModuleId && recordInteraction);
      const printingSurface = config.target === "printing-production";
      const logisticsSurface = config.target === "logistics-dispatch";
      const propertySurface = config.target === "property-portfolio";
      const bakerySettlementSurface = config.target === "bakery-settlement";
      const offboardingAccessSurface = config.target === "offboarding-access";
      const authenticatedTimeSurface = config.target === "authenticated-time";
      const autosSalesSurface = config.target === "autos-sales";
      const requestedSurface =
        config.target === "communications-control"
          ? "communications-control"
          : config.target === "meta-vault"
            ? "meta-vault"
            : config.target === "global-shell"
              ? "global-shell"
              : "cloud-storage";
      const profileSession = sessionForProfile(
        config.profile === "Public" ? "Owner" : config.profile,
      );
      const adminModule = byId("admin");
      const communicationsControlModule = byId("communication-settings");
      const metaVaultModule = byId("meta-credential-vault");
      const helpModule = byId("help");
      const printingModule = byId("printing");
      const logisticsModule = byId("logistics");
      const propertyModule = byId("properties");
      const bakeryModule = byId("bakery-accountability");
      const lifecycleModule = byId("lifecycle");
      const expensesModule = byId("expenses");
      const globalUtilitiesAuthorized = Boolean(
        helpModule && canView(helpModule, profileSession),
      );
      const restrictedAuthorized = Boolean(
        restrictedSurface &&
          (config.target === "communications-control"
            ? communicationsControlModule &&
              canView(communicationsControlModule, profileSession)
            : config.target === "meta-vault"
              ? metaVaultModule && canView(metaVaultModule, profileSession)
              : adminModule && canAct(adminModule, profileSession, "manage")),
      );
      const recordModule = recordModuleId ? byId(recordModuleId) : undefined;
      const recordTargetId = recordTargetIds[config.target];
      const recordModuleAuthorized = Boolean(
        recordSurface && recordModule && canView(recordModule, profileSession),
      );
      const recordAuthorized = Boolean(
        recordModuleAuthorized &&
          recordModule &&
          (!recordTargetId ||
            recordsFor(canonicalReviewRecords, recordModule, profileSession).some(
              (row) => row.id === recordTargetId,
            )),
      );
      const printingAuthorized = Boolean(
        printingSurface && printingModule && canView(printingModule, profileSession),
      );
      const logisticsAuthorized = Boolean(
        logisticsSurface &&
          logisticsModule &&
          canView(logisticsModule, profileSession),
      );
      const propertyAuthorized = Boolean(
        propertySurface &&
          propertyModule &&
          canView(propertyModule, profileSession),
      );
      const bakerySettlementAuthorized = Boolean(
        bakerySettlementSurface &&
          bakeryModule &&
          canView(bakeryModule, profileSession),
      );
      const offboardingAccessAuthorized = Boolean(
        offboardingAccessSurface &&
          lifecycleModule &&
          canView(lifecycleModule, profileSession),
      );
      const authenticatedTimeAuthorized = Boolean(
        authenticatedTimeSurface &&
          expensesModule &&
          canView(expensesModule, profileSession) &&
          recordsFor(canonicalReviewRecords, expensesModule, profileSession).some(
            (row) => row.id === "EXP-2048",
          ),
      );
      const authorizedRecordCount =
        recordModuleAuthorized && recordModule
          ? recordsFor(canonicalReviewRecords, recordModule, profileSession).length
          : 0;
      const rootSelector = signInCapture
        ? "[data-signin-ready]"
        : studioCapture
          ? "[data-studio-ready], [data-no-authorized-workspace]"
          : authenticatedTimeSurface && authenticatedTimeAuthorized
            ? '[data-record-interaction="dedicated-record-page"]'
            : authenticatedTimeSurface
              ? "[data-record-denied='true'], [data-no-authorized-workspace]"
          : recordSurface && recordAuthorized
            ? `[data-record-interaction="${recordInteraction}"]`
            : recordSurface
              ? "[data-record-denied='true'], [data-no-authorized-workspace]"
          : printingSurface && printingAuthorized
            ? '[data-printing-workflow="authoritative-source-required"]'
            : printingSurface
              ? "[data-review-ready='true'], [data-no-authorized-workspace]"
          : logisticsSurface && logisticsAuthorized
            ? '[data-logistics-workflow="authoritative-evidence-required"]'
            : logisticsSurface
              ? "[data-review-ready='true'], [data-no-authorized-workspace]"
          : propertySurface && propertyAuthorized
            ? '[data-property-workflow="authoritative-records-required"]'
            : propertySurface
              ? "[data-review-ready='true'], [data-no-authorized-workspace]"
          : bakerySettlementSurface && bakerySettlementAuthorized
            ? '[data-bakery-settlement-workflow="received-only-authority-required"]'
            : bakerySettlementSurface
              ? "[data-review-ready='true'], [data-no-authorized-workspace]"
          : offboardingAccessSurface && offboardingAccessAuthorized
            ? '[data-offboarding-access-workflow="authoritative-access-verification-required"]'
            : offboardingAccessSurface
              ? "[data-review-ready='true'], [data-no-authorized-workspace]"
          : restrictedSurface && restrictedAuthorized
            ? `[data-review-surface="${requestedSurface}"]`
            : "[data-review-ready='true'], [data-no-authorized-workspace]";
      const root = documentRoot?.querySelector<HTMLElement>(rootSelector);
      const noAuthorizedWorkspace =
        !signInCapture && root?.dataset.noAuthorizedWorkspace === "true";
      const recordDenied =
        recordSurface && root?.dataset.recordDenied === "true";
      const ready = signInCapture
        ? root?.dataset.signinReady === "true"
        : studioCapture
          ? noAuthorizedWorkspace || root?.dataset.studioReady === "true"
          : authenticatedTimeSurface
            ? authenticatedTimeAuthorized ||
              root?.dataset.recordDenied === "true" ||
              noAuthorizedWorkspace
          : recordSurface
            ? recordAuthorized || recordDenied || noAuthorizedWorkspace
          : printingSurface
            ? printingAuthorized
              ? root?.dataset.printingWorkflow === "authoritative-source-required"
              : noAuthorizedWorkspace || root?.dataset.reviewReady === "true"
          : logisticsSurface
            ? logisticsAuthorized
              ? root?.dataset.logisticsWorkflow ===
                "authoritative-evidence-required"
              : noAuthorizedWorkspace || root?.dataset.reviewReady === "true"
          : propertySurface
            ? propertyAuthorized
              ? root?.dataset.propertyWorkflow === "authoritative-records-required"
              : noAuthorizedWorkspace || root?.dataset.reviewReady === "true"
          : bakerySettlementSurface
            ? bakerySettlementAuthorized
              ? root?.dataset.bakerySettlementWorkflow ===
                "received-only-authority-required"
              : noAuthorizedWorkspace || root?.dataset.reviewReady === "true"
          : offboardingAccessSurface
            ? offboardingAccessAuthorized
              ? root?.dataset.offboardingAccessWorkflow ===
                "authoritative-access-verification-required"
              : noAuthorizedWorkspace || root?.dataset.reviewReady === "true"
          : noAuthorizedWorkspace || root?.dataset.reviewReady === "true";
      if (!root || !ready) {
        if (Date.now() - started < 15000) window.setTimeout(inspect, 100);
        else {
          setCaptureError("SIGNIN_READY_TIMEOUT");
          setCaptureState("FAIL");
        }
        return;
      }
      setRenderedIdentity({
        themeId: root.dataset.themeId || "",
        source: root.dataset.themeSource || "",
        displayName: root.dataset.themeDisplayName || "",
        sourceCommit: root.dataset.sourceCommit || "",
        studioVersion: root.dataset.studioVersion || "",
        ready: signInCapture
          ? root.dataset.signinReady || "false"
          : root.dataset.studioReady || "false",
      });
      const childWidth = frameRef.current?.contentWindow?.innerWidth || 0;
      const childHeight = frameRef.current?.contentWindow?.innerHeight || 0;
      setRenderedViewport({ width: childWidth, height: childHeight });
      if (childWidth !== width || childHeight !== height) {
        setCaptureError(
          `CHILD_VIEWPORT_MISMATCH:${width}×${height}:${childWidth}×${childHeight}`,
        );
        setCaptureState("FAIL");
        return;
      }
      const bodyText = documentRoot?.body.innerText || "";
      // CSS text transforms are presentation-only and can change innerText
      // casing across browsers. Provider-truth checks must bind the words and
      // machine-readable boundaries, not a browser's rendered capitalization.
      const bodyTextNormalized = bodyText.toLocaleLowerCase("en-US");
      const documentWidth = documentRoot?.documentElement.scrollWidth || 0;
      const documentHeight = documentRoot?.documentElement.scrollHeight || 0;
      if (documentWidth > childWidth + 1) {
        setCaptureEvidence((current) => ({ ...current, overflow: "FAIL" }));
        setCaptureError(`HORIZONTAL_OVERFLOW:${childWidth}:${documentWidth}`);
        setCaptureState("FAIL");
        return;
      }
      if (signInCapture) {
        const requiredSignInCopy = [
          "Email or Username",
          "Password",
          "Remember Me",
          "Forgot Password?",
          "Sign In with Microsoft",
          "Sign In with Google",
          "Sign In with WhatsApp",
          "Install App",
          "Terms of Use",
          "Privacy Notice",
          "Other sign-in options unavailable",
        ];
        const missingSignInCopy = requiredSignInCopy.filter(
          (term) => !bodyText.includes(term),
        );
        const rememberControl = documentRoot?.querySelector<HTMLInputElement>(
          '.usp-remember-row input[type="checkbox"]',
        );
        const passwordControl = documentRoot?.querySelector<HTMLInputElement>(
          ".usp-password-field input",
        );
        const passwordToggle = documentRoot?.querySelector<HTMLButtonElement>(
          '.usp-password-toggle[aria-label="Show Password"]',
        );
        const authTabList = documentRoot?.querySelector<HTMLElement>(
          '[role="tablist"][aria-label="Authentication options"]',
        );
        const authTabs = [
          ...(authTabList?.querySelectorAll<HTMLButtonElement>(
            'button[role="tab"]',
          ) || []),
        ];
        const selectedAuthTabs = authTabs.filter(
          (tab) => tab.getAttribute("aria-selected") === "true",
        );
        const tabbableAuthTabs = authTabs.filter((tab) => tab.tabIndex === 0);
        const authTabOrderValid =
          authTabs.length === 2 &&
          selectedAuthTabs.length === 1 &&
          tabbableAuthTabs.length === 1 &&
          selectedAuthTabs[0] === tabbableAuthTabs[0] &&
          authTabs.every((tab) => tab === tabbableAuthTabs[0] || tab.tabIndex === -1);
        const namedButton = (selector: string, label: string) =>
          [...(documentRoot?.querySelectorAll<HTMLButtonElement>(selector) || [])].find(
            (button) =>
              (button.getAttribute("aria-label") || button.textContent || "")
                .replace(/\s+/g, " ")
                .trim()
                .includes(label) && button.type === "button",
          );
        const publicActionControls = [
          namedButton(".usp-whatsapp-button", "Sign In with WhatsApp"),
          namedButton(".install-pill", "Install App"),
          namedButton(".usp-legal-actions button", "Terms of Use"),
          namedButton(".usp-legal-actions button", "Privacy Notice"),
        ];
        let passwordToggleInteractionValid = false;
        if (passwordControl && passwordToggle) {
          passwordToggle.click();
          await waitForFrameUpdate();
          const revealedPasswordControl =
            documentRoot?.querySelector<HTMLInputElement>(
              ".usp-password-field input",
            );
          const hidePasswordToggle =
            documentRoot?.querySelector<HTMLButtonElement>(
              '.usp-password-toggle[aria-label="Hide Password"]',
            );
          const revealed =
            revealedPasswordControl?.type === "text" &&
            hidePasswordToggle?.type === "button";
          hidePasswordToggle?.click();
          await waitForFrameUpdate();
          const restoredPasswordControl =
            documentRoot?.querySelector<HTMLInputElement>(
              ".usp-password-field input",
            );
          const restoredPasswordToggle =
            documentRoot?.querySelector<HTMLButtonElement>(
              '.usp-password-toggle[aria-label="Show Password"]',
            );
          passwordToggleInteractionValid = Boolean(
            revealed &&
              restoredPasswordControl?.type === "password" &&
              restoredPasswordToggle?.type === "button",
          );
        }
        const dispatchAuthTabKey = async (tabId: string, key: string) => {
          const tab = documentRoot?.getElementById(tabId);
          if (!tab) return false;
          tab.focus({ preventScroll: true });
          tab.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true }),
          );
          await waitForFrameUpdate();
          return true;
        };
        const endDispatched = await dispatchAuthTabKey("auth-tab-signin", "End");
        const signupTabAfterEnd = documentRoot?.getElementById("auth-tab-signup");
        const endMovedToSignup = Boolean(
          endDispatched &&
            signupTabAfterEnd?.getAttribute("aria-selected") === "true" &&
            signupTabAfterEnd.tabIndex === 0 &&
            documentRoot?.activeElement === signupTabAfterEnd,
        );
        const homeDispatched = await dispatchAuthTabKey("auth-tab-signup", "Home");
        const signinTabAfterHome = documentRoot?.getElementById("auth-tab-signin");
        const authTabKeyboardValid = Boolean(
          endMovedToSignup &&
            homeDispatched &&
            signinTabAfterHome?.getAttribute("aria-selected") === "true" &&
            signinTabAfterHome.tabIndex === 0 &&
            documentRoot?.activeElement === signinTabAfterHome,
        );
        const desktopOrTabletPageScroll =
          childWidth >= 768 && documentHeight > childHeight + 1;
        const signInContractError = missingSignInCopy.length
          ? `SIGNIN_REQUIRED_COPY_MISSING:${missingSignInCopy.join("|")}`
          : !rememberControl
            ? "SIGNIN_REMEMBER_CONTROL_MISSING"
            : rememberControl.checked
              ? "SIGNIN_REMEMBER_DEFAULT_CHECKED"
              : !passwordControl || passwordControl.type !== "password"
                ? "SIGNIN_PASSWORD_CONTROL_MISSING"
                : !passwordToggle || passwordToggle.type !== "button"
                  ? "SIGNIN_PASSWORD_TOGGLE_MISSING"
                  : !passwordToggleInteractionValid
                    ? "SIGNIN_PASSWORD_TOGGLE_INTERACTION_FAILED"
                  : !authTabOrderValid
                    ? "SIGNIN_AUTH_TAB_ORDER_INVALID"
                    : !authTabKeyboardValid
                      ? "SIGNIN_AUTH_TAB_KEYBOARD_FAILED"
                    : publicActionControls.some((control) => !control)
                      ? "SIGNIN_PUBLIC_ACTIONS_MISSING"
                      : desktopOrTabletPageScroll
                        ? `SIGNIN_PAGE_VERTICAL_SCROLL:${childHeight}:${documentHeight}`
                        : null;
        if (
          signInContractError
        ) {
          setCaptureEvidence((current) => ({
            ...current,
            signInContract: "FAIL",
          }));
          setCaptureError(signInContractError);
          setCaptureState("FAIL");
          return;
        }
      }
      const skipLink = documentRoot?.querySelector<HTMLAnchorElement>(
        'a[href="#main-content"]',
      );
      const hasSkipLink = signInCapture || Boolean(skipLink);
      if (!hasSkipLink) {
        setCaptureEvidence((current) => ({ ...current, landmarks: "FAIL" }));
        setCaptureError("MISSING_SKIP_LINK");
        setCaptureState("FAIL");
        return;
      }
      const hasMainLandmark = Boolean(documentRoot?.querySelector("main, [role='main']"));
      const skipTarget = documentRoot?.querySelector<HTMLElement>("#main-content");
      const skipTargetExists = signInCapture || Boolean(skipTarget);
      if (!hasMainLandmark || !skipTargetExists) {
        setCaptureEvidence((current) => ({ ...current, landmarks: "FAIL" }));
        setCaptureError(!hasMainLandmark ? "MISSING_MAIN_LANDMARK" : "MISSING_SKIP_TARGET");
        setCaptureState("FAIL");
        return;
      }
      const previousFocus = documentRoot?.activeElement;
      const positiveTabOrder = [
        ...(documentRoot?.querySelectorAll<HTMLElement>("[tabindex]") || []),
      ].filter((element) => element.tabIndex > 0);
      if (signInCapture) {
        const signInFocusScope =
          documentRoot?.querySelector<HTMLElement>(
            '[data-home-auth-card="true"]',
          ) || root;
        const firstSignInControl = [
          ...(signInFocusScope.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
          ) || []),
        ].find((element) => {
          const style = frameRef.current?.contentWindow?.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style?.display !== "none" &&
            style?.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        });
        firstSignInControl?.focus({ preventScroll: true });
        const firstSignInControlFocused =
          Boolean(firstSignInControl) &&
          documentRoot?.activeElement === firstSignInControl;
        if (previousFocus && "focus" in previousFocus && previousFocus.isConnected)
          (previousFocus as HTMLElement).focus({ preventScroll: true });
        if (positiveTabOrder.length || !firstSignInControlFocused) {
          setCaptureEvidence((current) => ({ ...current, keyboard: "FAIL" }));
          setCaptureError(
            positiveTabOrder.length
              ? `POSITIVE_TABINDEX:${positiveTabOrder.length}`
              : firstSignInControl
                ? "SIGNIN_FIRST_CONTROL_FOCUS_FAILED"
                : "SIGNIN_FIRST_CONTROL_MISSING",
          );
          setCaptureState("FAIL");
          return;
        }
      } else if (skipLink && skipTarget) {
        skipLink.focus({ preventScroll: true });
        const skipLinkFocused = documentRoot?.activeElement === skipLink;
        skipTarget.focus({ preventScroll: true });
        const skipTargetFocused = documentRoot?.activeElement === skipTarget;
        if (previousFocus && "focus" in previousFocus && previousFocus.isConnected)
          (previousFocus as HTMLElement).focus({ preventScroll: true });
        if (
          positiveTabOrder.length ||
          !skipLinkFocused ||
          !skipTargetFocused ||
          skipTarget.getAttribute("tabindex") !== "-1"
        ) {
          setCaptureEvidence((current) => ({ ...current, keyboard: "FAIL" }));
          setCaptureError(
            positiveTabOrder.length
              ? `POSITIVE_TABINDEX:${positiveTabOrder.length}`
              : !skipLinkFocused
                ? "SKIP_LINK_FOCUS_FAILED"
                : !skipTargetFocused
                  ? "SKIP_TARGET_FOCUS_FAILED"
                  : "SKIP_TARGET_NOT_PROGRAMMATIC",
          );
          setCaptureState("FAIL");
          return;
        }
      }
      const ids = [...(documentRoot?.querySelectorAll<HTMLElement>("[id]") || [])]
        .map((element) => element.id)
        .filter(Boolean);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
      const interactiveElements = [...(documentRoot?.querySelectorAll<HTMLElement>(
        "a[href], button, input:not([type='hidden']), select, textarea, [role='button'], [role='link']",
      ) || [])];
      const hasAccessibleName = (element: HTMLElement) => {
        const labelledBy = element.getAttribute("aria-labelledby")
          ?.split(/\s+/)
          .filter(Boolean)
          .some((id) => Boolean(documentRoot?.getElementById(id)?.textContent?.trim()));
        const formLabels = ["INPUT", "SELECT", "TEXTAREA"].includes(
          element.tagName,
        )
          ? Boolean((element as HTMLInputElement).labels?.length)
          : false;
        return Boolean(
          element.getAttribute("aria-label")?.trim() ||
          labelledBy ||
          formLabels ||
          element.textContent?.trim() ||
          element.getAttribute("title")?.trim() ||
          element.querySelector("img[alt]")?.getAttribute("alt")?.trim(),
        );
      };
      const unnamedInteractiveElements = interactiveElements.filter(
        (element) => !hasAccessibleName(element),
      );
      if (duplicateIds.length || unnamedInteractiveElements.length) {
        setCaptureEvidence((current) => ({ ...current, accessibility: "FAIL" }));
        setCaptureError(
          duplicateIds.length
            ? `DUPLICATE_IDS:${[...new Set(duplicateIds)].join(",")}`
            : `UNNAMED_INTERACTIVE_CONTROLS:${unnamedInteractiveElements.length}`,
        );
        setCaptureState("FAIL");
        return;
      }
      const targetSizeElements = [...(documentRoot?.querySelectorAll<HTMLElement>(
        "button, select, textarea, input:not([type='hidden']):not([type='checkbox']):not([type='radio']), [role='button']",
      ) || [])].filter((element) => {
        const style = frameRef.current?.contentWindow?.getComputedStyle(element);
        const disabled =
          element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
        const rect = element.getBoundingClientRect();
        return !disabled && style?.display !== "none" && style?.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      const undersizedTargets = targetSizeElements.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 24 || rect.height < 24;
      });
      if (undersizedTargets.length) {
        setCaptureEvidence((current) => ({ ...current, targetSize: "FAIL" }));
        setCaptureError(`TARGET_SIZE_BELOW_24PX:${undersizedTargets.length}`);
        setCaptureState("FAIL");
        return;
      }
      const motionOffApplied = config.motion !== "off" || Boolean(documentRoot?.querySelector(".motion-off"));
      if (!motionOffApplied) {
        setCaptureEvidence((current) => ({ ...current, motion: "FAIL" }));
        setCaptureError("MOTION_OFF_OVERRIDE_MISSING");
        setCaptureState("FAIL");
        return;
      }
      if (restrictedSurface && !restrictedAuthorized) {
        const protectedTerms =
          config.target === "communications-control"
            ? [
                "One policy surface. Every authorized scope.",
                "Emergency communications kill switch",
                "Live WhatsApp provider release gate",
              ]
            : config.target === "meta-vault"
              ? [
                  "Meta Credential Vault",
                  "No Credential Material Is Available",
                  "WABA identifiers",
                ]
              : config.target === "global-shell"
                ? [
                    "Global Shell configuration",
                    "Google Weather API",
                    "Organization motion level",
                  ]
                : [
                    "Cloud Storage & Backup",
                    "Microsoft OneDrive",
                    "Cloudflare R2",
                  ];
        if (protectedTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_TEXT_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (recordSurface && !recordAuthorized) {
        const protectedRecordTerms =
          config.target === "authorized-records"
            ? ["Customers & Print Orders Record Workspace", "Authorized Records"]
            : config.target === "employee-reviews"
              ? ["Performance Reviews Record Workspace", "Authorized Reviews"]
              : config.target === "expense-requests"
              ? ["Request Register & Evidence Composer", "Every request, backed by evidence."]
              : config.target === "staff-conversations"
                ? ["Conversation List", "Conversation Detail"]
                : config.target === "autos-sales"
                  ? [
                      "Auto Leads & Sales Record Workspace",
                      "Recorded amounts are not confirmed payments",
                      "Payment Status",
                      "Not Confirmed",
                    ]
                : [
                    "Back To Record List",
                    "Record Identity",
                    "EXP-2048",
                    "Paper stock replenishment",
                    "Meridian Supplies",
                    "Replenish paper stock for approved September jobs",
                  ];
        if (protectedRecordTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({
            ...current,
            projection: "FAIL",
            recordContract: "FAIL",
          }));
          setCaptureError("ZERO_DISCLOSURE_RECORD_LEAK");
          setCaptureState("FAIL");
          return;
        }
        if (
          config.target === "dedicated-expense-record" &&
          recordModuleAuthorized &&
          (root?.dataset.recordDenied !== "true" ||
            root.dataset.recordDenialState !== "neutral-not-found" ||
            !bodyText.includes("Page not found") ||
            !bodyText.includes(
              "This page is unavailable. Return to your workspace.",
            ))
        ) {
          setCaptureEvidence((current) => ({
            ...current,
            projection: "FAIL",
            recordContract: "FAIL",
          }));
          setCaptureError("DEDICATED_RECORD_DENIAL_CONTRACT_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (printingSurface && !printingAuthorized) {
        const protectedPrintingTerms = [
          "From enquiry to accountable completion.",
          "Payment and reconciliation need authoritative records",
          "Approved job lifecycle",
          "Meridian Group · Launch Brochure",
        ];
        if (protectedPrintingTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_PRINTING_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (logisticsSurface && !logisticsAuthorized) {
        const protectedLogisticsTerms = [
          "Dispatch without invented tracking.",
          "Route, delivery and close-out need authoritative records",
          "Approved dispatch lifecycle",
          "Lagos → Ibadan · TRP-208",
        ];
        if (protectedLogisticsTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_LOGISTICS_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (propertySurface && !propertyAuthorized) {
        const protectedPropertyTerms = [
          "Portfolio truth before rent conclusions.",
          "Occupancy, rent and receipts need separate source records",
          "Approved portfolio states",
          "Parkside Residences",
        ];
        if (protectedPropertyTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_PROPERTY_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (bakerySettlementSurface && !bakerySettlementAuthorized) {
        const protectedBakeryTerms = [
          "Accountability stays open until settlement is proven.",
          "Accounted money is not confirmed money received",
          "Financial closure remains blocked",
          "Morning batch · Balogun distribution",
        ];
        if (protectedBakeryTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_BAKERY_SETTLEMENT_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (offboardingAccessSurface && !offboardingAccessAuthorized) {
        const protectedOffboardingTerms = [
          "Checklist progress is not access removal.",
          "Access removal still needs authoritative verification",
          "Samuel Okeke · exit checklist",
          "Sessions and temporary access",
        ];
        if (protectedOffboardingTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_OFFBOARDING_ACCESS_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (authenticatedTimeSurface && !authenticatedTimeAuthorized) {
        const protectedTimeRecordTerms = [
          "EXP-2048",
          "Paper stock replenishment",
          "Meridian Supplies",
          "Replenish paper stock for approved September jobs",
        ];
        if (protectedTimeRecordTerms.some((term) => bodyText.includes(term))) {
          setCaptureEvidence((current) => ({ ...current, projection: "FAIL" }));
          setCaptureError("ZERO_DISCLOSURE_AUTHENTICATED_TIME_RECORD_LEAK");
          setCaptureState("FAIL");
          return;
        }
      }
      if (recordSurface && recordAuthorized) {
        let recordRoot = documentRoot?.querySelector<HTMLElement>(
          `[data-record-interaction="${recordInteraction}"]`,
        );
        const authorizedRecordListEmpty =
          config.target === "expense-requests" && authorizedRecordCount === 0;
        const recordContractValid =
          config.target === "staff-conversations"
            ? Boolean(
                recordRoot?.querySelector('[aria-label="Conversation List"]') &&
                  recordRoot.querySelector('[aria-label="Conversation Detail"]'),
              )
            : config.target === "dedicated-expense-record"
              ? Boolean(
                  recordRoot?.querySelector(".dr-identity-bar") &&
                    recordRoot.querySelector('[aria-label="Record Identity"]') &&
                    recordRoot.querySelector('[role="tablist"]') &&
                    recordRoot.querySelector(".dr-back") &&
                    recordRoot.querySelector(".dr-more-actions summary") &&
                    recordRoot.querySelector(
                      '.dr-more-actions-menu button:last-child',
                    )?.textContent?.includes("Copy Record Link"),
                )
              : Boolean(
                  recordRoot?.querySelector(".ri-master") &&
                    recordRoot.querySelector(".ri-detail") &&
                    (authorizedRecordListEmpty
                      ? !recordRoot.querySelector(".ri-record-select") &&
                        !recordRoot.querySelector('[role="tablist"]') &&
                        recordRoot
                          .querySelector(".ri-master h3")
                          ?.textContent?.includes("No Records Found")
                      : recordRoot.querySelector(
                            '.ri-record-select[aria-current="true"]',
                          ) && recordRoot.querySelector('[role="tablist"]')),
                );
        if (!recordContractValid) {
          setCaptureEvidence((current) => ({
            ...current,
            recordContract: "FAIL",
          }));
          setCaptureError("RECORD_INTERACTION_CONTRACT_FAILED");
          setCaptureState("FAIL");
          return;
        }

        const listStatusSelector =
          config.target === "staff-conversations"
            ? "[data-conversation-list-status]"
            : "[data-record-list-status]";
        const listStatus =
          config.target === "dedicated-expense-record"
            ? null
            : recordRoot?.querySelector<HTMLElement>(listStatusSelector);
        if (
          config.target !== "dedicated-expense-record" &&
          (!listStatus || listStatus.getAttribute("aria-live") !== "polite")
        ) {
          setCaptureEvidence((current) => ({
            ...current,
            accessibility: "FAIL",
            recordContract: "FAIL",
          }));
          setCaptureError("RECORD_LIST_STATUS_MISSING");
          setCaptureState("FAIL");
          return;
        }

        if (
          config.target !== "dedicated-expense-record" &&
          !authorizedRecordListEmpty
        ) {
          const listSelectionSelector =
            config.target === "staff-conversations"
              ? ".ci-channel-select"
              : ".ri-record-select";
          const listSelections = [
            ...(recordRoot?.querySelectorAll<HTMLButtonElement>(
              listSelectionSelector,
            ) || []),
          ];
          const firstListSelection = listSelections[0];
          const lastListSelection = listSelections.at(-1);
          firstListSelection?.focus({ preventScroll: true });
          firstListSelection?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "End", bubbles: true }),
          );
          await waitForFrameUpdate();
          const endListFocusValid = Boolean(
            firstListSelection &&
              lastListSelection &&
              documentRoot?.activeElement === lastListSelection,
          );
          lastListSelection?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
          );
          await waitForFrameUpdate();
          const homeListFocusValid = Boolean(
            firstListSelection &&
              documentRoot?.activeElement === firstListSelection,
          );
          if (!endListFocusValid || !homeListFocusValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("RECORD_LIST_KEYBOARD_FAILED");
            setCaptureState("FAIL");
            return;
          }

          if (config.target === "employee-reviews") {
            const notesTab = [
              ...(recordRoot?.querySelectorAll<HTMLButtonElement>(
                '[role="tablist"][aria-label="Record Sections"] button[role="tab"]',
              ) || []),
            ].find((button) => button.textContent?.trim() === "Notes");
            if (!notesTab) {
              setCaptureEvidence((current) => ({
                ...current,
                recordContract: "FAIL",
              }));
              setCaptureError("RECORD_RELEVANT_NOTES_FAILED");
              setCaptureState("FAIL");
              return;
            }
          }

          const quickSelector =
            config.target === "staff-conversations"
              ? ".ci-quick-button"
              : ".ri-quick-button";
          const quickTrigger =
            recordRoot?.querySelector<HTMLButtonElement>(quickSelector) || null;
          quickTrigger?.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const quickPanel =
            recordRoot?.querySelector<HTMLElement>(".ri-quick-inspection");
          const quickTitle =
            quickPanel?.querySelector<HTMLElement>("#quick-inspection-title");
          const quickClose = quickPanel?.querySelector<HTMLButtonElement>(
            'button[aria-label="Close Quick Inspection"]',
          );
          const quickOpenValid = Boolean(
            quickTrigger &&
              quickPanel &&
              quickTitle?.tabIndex === -1 &&
              documentRoot?.activeElement === quickTitle &&
              quickClose &&
              !recordRoot?.classList.contains("is-mobile-detail"),
          );
          quickTitle?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const restoredQuickTrigger =
            recordRoot?.querySelector<HTMLButtonElement>(quickSelector);
          const quickEscapeValid = Boolean(
            !recordRoot?.querySelector(".ri-quick-inspection") &&
              restoredQuickTrigger &&
              documentRoot?.activeElement === restoredQuickTrigger,
          );
          restoredQuickTrigger?.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const reopenedQuickClose = recordRoot?.querySelector<HTMLButtonElement>(
            '.ri-quick-inspection button[aria-label="Close Quick Inspection"]',
          );
          reopenedQuickClose?.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const quickCloseValid = Boolean(
            !recordRoot?.querySelector(".ri-quick-inspection") &&
              documentRoot?.activeElement ===
                recordRoot?.querySelector<HTMLButtonElement>(quickSelector),
          );
          if (!quickOpenValid || !quickEscapeValid || !quickCloseValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("QUICK_INSPECTION_INTERACTION_FAILED");
            setCaptureState("FAIL");
            return;
          }

          recordRoot?.querySelector<HTMLButtonElement>(quickSelector)?.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const quickOpenAction = [
            ...(recordRoot?.querySelectorAll<HTMLButtonElement>(
              ".ri-quick-inspection button",
            ) || []),
          ].find((button) =>
            button.textContent?.includes("Open Record Workspace"),
          );
          quickOpenAction?.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const quickHandoffBackSelector =
            config.target === "staff-conversations"
              ? ".ci-mobile-back"
              : ".ri-mobile-back";
          const quickHandoffTitleSelector =
            config.target === "staff-conversations"
              ? ".ci-detail-title h2"
              : ".ri-detail-title h2";
          const quickHandoffTarget = recordRoot?.querySelector<HTMLElement>(
            childWidth < 760
              ? quickHandoffBackSelector
              : quickHandoffTitleSelector,
          );
          const quickHandoffValid = Boolean(
            quickOpenAction &&
              !recordRoot?.querySelector(".ri-quick-inspection") &&
              quickHandoffTarget?.tabIndex === (childWidth < 760 ? 0 : -1) &&
              documentRoot?.activeElement === quickHandoffTarget &&
              (childWidth >= 760 ||
                recordRoot?.classList.contains("is-mobile-detail")),
          );
          let quickMobileReturnValid = true;
          if (childWidth < 760) {
            recordRoot
              ?.querySelector<HTMLButtonElement>(quickHandoffBackSelector)
              ?.click();
            await waitForFrameUpdate();
            recordRoot = documentRoot?.querySelector<HTMLElement>(
              `[data-record-interaction="${recordInteraction}"]`,
            );
            const quickHandoffSelection = recordRoot?.querySelector<HTMLButtonElement>(
              config.target === "staff-conversations"
                ? '.ci-channel-select[aria-current="true"]'
                : '.ri-record-select[aria-current="true"]',
            );
            quickMobileReturnValid = Boolean(
              !recordRoot?.classList.contains("is-mobile-detail") &&
                quickHandoffSelection &&
                documentRoot?.activeElement === quickHandoffSelection,
            );
          }
          if (!quickHandoffValid || !quickMobileReturnValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("QUICK_INSPECTION_HANDOFF_FAILED");
            setCaptureState("FAIL");
            return;
          }

          const filterQuerySelector =
            config.target === "staff-conversations"
              ? ".ci-search input"
              : '.ri-search input[type="search"]';
          const filterResetSelector =
            config.target === "staff-conversations"
              ? ".ci-reset-filters"
              : ".ri-reset-filters";
          const filterSelectSelector =
            config.target === "staff-conversations"
              ? ".ci-list-controls select"
              : ".ri-list-controls select";
          const filterQuery = recordRoot?.querySelector<HTMLInputElement>(
            filterQuerySelector,
          );
          const filterMutationReady = Boolean(
            filterQuery &&
              setFrameControlValue(filterQuery, "__reset-filter-proof__"),
          );
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const resetFilters = recordRoot?.querySelector<HTMLButtonElement>(
            filterResetSelector,
          );
          resetFilters?.click();
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const resetQuery = recordRoot?.querySelector<HTMLInputElement>(
            filterQuerySelector,
          );
          const resetSelects = [
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              filterSelectSelector,
            ) || []),
          ] as FrameValueControl[];
          const filterResetValid = Boolean(
            filterMutationReady &&
              resetFilters &&
              resetQuery?.value === "" &&
              resetSelects[0]?.value === "All" &&
              (config.target !== "staff-conversations" ||
                resetSelects[1]?.value === "Recent") &&
              !recordRoot?.querySelector(filterResetSelector),
          );
          if (!filterResetValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("RECORD_FILTER_RESET_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }

        if (
          !authorizedRecordListEmpty &&
          (config.target === "authorized-records" ||
            config.target === "employee-reviews" ||
            config.target === "expense-requests")
        ) {
          const frameWindow = frameRef.current?.contentWindow;
          const listPath = portalTargetRoutes[config.target] || "";
          const queryInput = recordRoot?.querySelector<HTMLInputElement>(
            '.ri-search input[type="search"]',
          );
          const listControls = [
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              ".ri-list-controls select",
            ) || []),
          ] as FrameValueControl[];
          const statusSelect = listControls[0];
          const sortSelect = listControls[1];
          const contextQuery =
            config.target === "employee-reviews" ? "September" : "Printing";
          const singleAuthorizedRecord = authorizedRecordCount === 1;
          const filterStatus =
            statusSelect?.querySelectorAll("option")[1]?.getAttribute("value") ||
            statusSelect?.querySelectorAll("option")[1]?.textContent ||
            "";
          const controlsReady = Boolean(
            queryInput &&
              statusSelect &&
              sortSelect &&
              filterStatus &&
              setFrameControlValue(queryInput!, "") &&
              setFrameControlValue(statusSelect!, "All") &&
              setFrameControlValue(sortSelect!, "Title"),
          );
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const sortedTitles = [
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              ".ri-record-copy strong",
            ) || []),
          ].map((element) => element.textContent?.trim() || "");
          const titleSortValid =
            sortedTitles.length > (singleAuthorizedRecord ? 0 : 1) &&
            sortedTitles.every(
              (title, index) =>
                index === 0 ||
                sortedTitles[index - 1].localeCompare(title) <= 0,
            );

          const currentStatusSelect = ([
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              ".ri-list-controls select",
            ) || []),
          ] as FrameValueControl[])[0];
          const statusChanged = Boolean(
            currentStatusSelect &&
              setFrameControlValue(currentStatusSelect, filterStatus),
          );
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const filteredStates = [
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              ".ri-record-state",
            ) || []),
          ];
          const statusFilterValid =
            filteredStates.length > 0 &&
            filteredStates.every((element) =>
              element.textContent?.includes(filterStatus),
            );

          const resetStatusSelect = ([
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              ".ri-list-controls select",
            ) || []),
          ] as FrameValueControl[])[0];
          const activeQueryInput = recordRoot?.querySelector<HTMLInputElement>(
            '.ri-search input[type="search"]',
          );
          const searchChanged = Boolean(
            resetStatusSelect &&
              activeQueryInput &&
              setFrameControlValue(resetStatusSelect, "All") &&
              setFrameControlValue(activeQueryInput, contextQuery),
          );
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const searchedRows = [
            ...(recordRoot?.querySelectorAll<HTMLButtonElement>(
              ".ri-record-select",
            ) || []),
          ];
          const targetRow = searchedRows.at(-1);
          const targetId = targetRow
            ?.querySelector(".ri-record-copy small")
            ?.textContent?.trim();
          const searchValid =
            searchedRows.length > (singleAuthorizedRecord ? 0 : 1) &&
            recordRoot?.querySelector<HTMLInputElement>(
              '.ri-search input[type="search"]',
            )?.value === contextQuery;
          const recordList = recordRoot?.querySelector<HTMLElement>(
            ".ri-record-list",
          );
          if (recordList && frameWindow) {
            recordList.scrollTop = Math.max(
              0,
              recordList.scrollHeight - recordList.clientHeight,
            );
            const scrollEvent = recordList.ownerDocument.createEvent("Event");
            scrollEvent.initEvent("scroll", true, false);
            recordList.dispatchEvent(scrollEvent);
          }
          await waitForFrameUpdate();
          const rememberedScrollTop = recordList?.scrollTop || 0;
          targetRow?.click();
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const selectedBeforeNavigation = recordRoot?.querySelector<HTMLElement>(
            '.ri-record-select[aria-current="true"]',
          );
          const openFullRecord = [
            ...(recordRoot?.querySelectorAll<HTMLButtonElement>(
              ".ri-detail-actions button",
            ) || []),
          ].find((button) => button.textContent?.includes("Open Full"));
          openFullRecord?.click();
          const dedicatedPath = `${listPath}/${encodeURIComponent(targetId || "")}`;
          const dedicatedOpened = await waitForFramePath(dedicatedPath);
          if (dedicatedOpened) frameWindow?.history.back();
          const listReturned = await waitForFramePath(listPath);
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const restoredQuery = recordRoot?.querySelector<HTMLInputElement>(
            '.ri-search input[type="search"]',
          );
          const restoredSelects = [
            ...(recordRoot?.querySelectorAll<HTMLElement>(
              ".ri-list-controls select",
            ) || []),
          ] as FrameValueControl[];
          const restoredSelection = recordRoot?.querySelector<HTMLElement>(
            '.ri-record-select[aria-current="true"]',
          );
          const restoredList = recordRoot?.querySelector<HTMLElement>(
            ".ri-record-list",
          );
          const contextRestored = Boolean(
            controlsReady &&
              titleSortValid &&
              statusChanged &&
              statusFilterValid &&
              searchChanged &&
              searchValid &&
              targetId &&
              selectedBeforeNavigation?.textContent?.includes(targetId) &&
              openFullRecord &&
              dedicatedOpened &&
              listReturned &&
              restoredQuery?.value === contextQuery &&
              restoredSelects[0]?.value === "All" &&
              restoredSelects[1]?.value === "Title" &&
              restoredSelection?.textContent?.includes(targetId) &&
              (restoredList?.scrollTop || 0) === rememberedScrollTop,
          );
          if (!contextRestored) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("RECORD_LIST_CONTEXT_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }

        if (config.target === "dedicated-expense-record") {
          const frameWindow = frameRef.current?.contentWindow;
          const startingIdentifier = recordRoot
            ?.querySelector('[aria-label="Record Identity"] div:nth-child(3) dd')
            ?.textContent?.trim();
          const startingPath = frameWindow?.location.pathname || "";
          const previousRecord = recordRoot?.querySelector<HTMLButtonElement>(
            '.dr-record-pager button[aria-label="Previous Record"]',
          );
          const nextRecord = recordRoot?.querySelector<HTMLButtonElement>(
            '.dr-record-pager button[aria-label="Next Record"]',
          );
          const moveControl = !nextRecord?.disabled
            ? nextRecord
            : !previousRecord?.disabled
              ? previousRecord
              : null;
          const singleRecordPagerValid = Boolean(
            authorizedRecordCount === 1 &&
              previousRecord?.disabled &&
              nextRecord?.disabled &&
              recordRoot
                ?.querySelector<HTMLElement>(".dr-record-pager span")
                ?.textContent?.trim() === "1 / 1",
          );
          const returnLabel =
            moveControl === nextRecord ? "Previous Record" : "Next Record";
          let pagerValid = singleRecordPagerValid;
          if (authorizedRecordCount > 1) {
            moveControl?.click();
            const movedState = await waitForDedicatedRecordState(
              (identifier, path) =>
                Boolean(
                  identifier &&
                    identifier !== startingIdentifier &&
                    path === `/expenses/${encodeURIComponent(identifier)}`,
                ),
            );
            recordRoot = movedState?.record || recordRoot;
            const returnControl = movedState?.record.querySelector<HTMLButtonElement>(
              `.dr-record-pager button[aria-label="${returnLabel}"]`,
            );
            const movedValid = Boolean(
              moveControl &&
                movedState &&
                returnControl &&
                !returnControl.disabled,
            );
            returnControl?.click();
            const returnedState = await waitForDedicatedRecordState(
              (identifier, path) =>
                identifier === startingIdentifier && path === startingPath,
            );
            recordRoot = returnedState?.record || recordRoot;
            const returnValid = Boolean(returnedState);
            pagerValid = movedValid && returnValid;
          }
          if (!pagerValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("DEDICATED_RECORD_PAGER_FAILED");
            setCaptureState("FAIL");
            return;
          }

          const currentBreadcrumb = documentRoot?.querySelector<HTMLElement>(
            '.p-shell-breadcrumb [aria-current="page"]',
          );
          const breadcrumbButtons = [
            ...(recordRoot?.ownerDocument.querySelectorAll<HTMLButtonElement>(
              ".p-shell-breadcrumb-item > button",
            ) || []),
          ];
          const moduleBreadcrumb = breadcrumbButtons.at(-1);
          const breadcrumbStructureValid = Boolean(
            currentBreadcrumb?.textContent?.trim() &&
              moduleBreadcrumb &&
              moduleBreadcrumb.textContent?.trim() !==
                currentBreadcrumb.textContent?.trim(),
          );
          moduleBreadcrumb?.click();
          const breadcrumbListPathValid = await waitForFramePath("/expenses");
          const breadcrumbListRoot = await waitForFrameSelector<HTMLElement>(
            '[data-record-interaction="adaptive-master-detail"]',
          );

          frameWindow?.history.back();
          const browserBackValid = await waitForFramePath(startingPath);
          recordRoot = await waitForFrameSelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const backIdentifier = recordRoot
            ?.querySelector('[aria-label="Record Identity"] div:nth-child(3) dd')
            ?.textContent?.trim();

          frameWindow?.history.forward();
          const browserForwardValid = await waitForFramePath("/expenses");
          const forwardListRoot = await waitForFrameSelector<HTMLElement>(
            '[data-record-interaction="adaptive-master-detail"]',
          );

          frameWindow?.history.back();
          const dedicatedReturnValid = await waitForFramePath(startingPath);
          recordRoot = await waitForFrameSelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const restoredIdentifier = recordRoot
            ?.querySelector('[aria-label="Record Identity"] div:nth-child(3) dd')
            ?.textContent?.trim();
          const historyNavigationValid = Boolean(
            breadcrumbStructureValid &&
              breadcrumbListPathValid &&
              breadcrumbListRoot &&
              browserBackValid &&
              backIdentifier === startingIdentifier &&
              browserForwardValid &&
              forwardListRoot &&
              dedicatedReturnValid &&
              restoredIdentifier === startingIdentifier,
          );
          if (!historyNavigationValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("DEDICATED_RECORD_HISTORY_NAVIGATION_FAILED");
            setCaptureState("FAIL");
            return;
          }

          const moreActions = recordRoot?.querySelector<HTMLDetailsElement>(
            ".dr-more-actions",
          );
          const moreActionsSummary =
            moreActions?.querySelector<HTMLElement>("summary");
          moreActionsSummary?.click();
          await waitForFrameUpdate();
          const firstSectionAction = [
            ...(moreActions?.querySelectorAll<HTMLButtonElement>(
              ".dr-more-actions-menu button",
            ) || []),
          ].find((button) => button.textContent?.startsWith("Review "));
          const menuOpenValid = Boolean(
            moreActions?.open && firstSectionAction,
          );
          firstSectionAction?.focus({ preventScroll: true });
          firstSectionAction?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const moreActionsAfterEscape =
            recordRoot?.querySelector<HTMLDetailsElement>(".dr-more-actions");
          const summaryAfterEscape =
            moreActionsAfterEscape?.querySelector<HTMLElement>("summary");
          const menuEscapeValid = Boolean(
            !moreActionsAfterEscape?.open &&
              summaryAfterEscape &&
              documentRoot?.activeElement === summaryAfterEscape,
          );

          summaryAfterEscape?.click();
          await waitForFrameUpdate();
          const sectionAction = [
            ...(moreActionsAfterEscape?.querySelectorAll<HTMLButtonElement>(
              ".dr-more-actions-menu button",
            ) || []),
          ].find((button) => button.textContent?.startsWith("Review "));
          const sectionName = sectionAction?.textContent
            ?.replace(/^Review\s+/, "")
            .trim();
          sectionAction?.click();
          await waitForFrameUpdate();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const sectionTab = sectionName
            ? recordRoot?.querySelector<HTMLButtonElement>(
                `#dedicated-record-tab-${sectionName.toLowerCase().replace(/\s+/g, "-")}`,
              )
            : null;
          const sectionActionValid = Boolean(
            sectionAction &&
              sectionTab?.getAttribute("aria-selected") === "true" &&
              sectionTab.tabIndex === 0 &&
              documentRoot?.activeElement === sectionTab &&
              !recordRoot?.querySelector<HTMLDetailsElement>(".dr-more-actions")
                ?.open,
          );
          if (!menuOpenValid || !menuEscapeValid || !sectionActionValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("DEDICATED_RECORD_ACTIONS_KEYBOARD_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }

        const mobileRecordFlow =
          childWidth < 760 &&
          config.target !== "dedicated-expense-record" &&
          !authorizedRecordListEmpty;
        let mobileBackControl: HTMLButtonElement | null = null;
        let mobileListScrollTop = 0;
        if (mobileRecordFlow) {
          const selectSelector =
            config.target === "staff-conversations"
              ? '.ci-channel-select[aria-current="true"]'
              : '.ri-record-select[aria-current="true"]';
          const listSelector =
            config.target === "staff-conversations"
              ? ".ci-channel-list"
              : ".ri-record-list";
          const backSelector =
            config.target === "staff-conversations"
              ? ".ci-mobile-back"
              : ".ri-mobile-back";
          const mobileList = recordRoot?.querySelector<HTMLElement>(listSelector);
          mobileListScrollTop = mobileList?.scrollTop || 0;
          recordRoot
            ?.querySelector<HTMLButtonElement>(selectSelector)
            ?.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          mobileBackControl =
            recordRoot?.querySelector<HTMLButtonElement>(backSelector) || null;
          if (
            !recordRoot?.classList.contains("is-mobile-detail") ||
            !mobileBackControl ||
            documentRoot?.activeElement !== mobileBackControl
          ) {
            setCaptureEvidence((current) => ({
              ...current,
              recordContract: "FAIL",
            }));
            setCaptureError("RECORD_MOBILE_FLOW_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }

        if (
          !authorizedRecordListEmpty &&
          (config.target === "authorized-records" ||
            config.target === "employee-reviews" ||
            config.target === "expense-requests" ||
            config.target === "dedicated-expense-record")
        ) {
          const tabList = recordRoot?.querySelector<HTMLElement>(
            '[role="tablist"][aria-label="Record Sections"]',
          );
          const tabs = [
            ...(tabList?.querySelectorAll<HTMLButtonElement>(
              'button[role="tab"]',
            ) || []),
          ];
          const firstTab = tabs[0];
          firstTab?.focus({ preventScroll: true });
          firstTab?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "End", bubbles: true }),
          );
          await waitForFrameUpdate();
          const tabsAfterEnd = [
            ...(recordRoot?.querySelectorAll<HTMLButtonElement>(
              '[role="tablist"][aria-label="Record Sections"] button[role="tab"]',
            ) || []),
          ];
          const lastTabAfterEnd = tabsAfterEnd.at(-1);
          const endValid = Boolean(
            firstTab &&
              lastTabAfterEnd?.getAttribute("aria-selected") === "true" &&
              lastTabAfterEnd.tabIndex === 0 &&
              documentRoot?.activeElement === lastTabAfterEnd,
          );
          lastTabAfterEnd?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
          );
          await waitForFrameUpdate();
          const firstTabAfterHome = recordRoot?.querySelector<HTMLButtonElement>(
            '[role="tablist"][aria-label="Record Sections"] button[role="tab"]',
          );
          const homeValid = Boolean(
            firstTabAfterHome?.getAttribute("aria-selected") === "true" &&
              firstTabAfterHome.tabIndex === 0 &&
              documentRoot?.activeElement === firstTabAfterHome,
          );
          if (!endValid || !homeValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("RECORD_TAB_KEYBOARD_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }

        if (config.target === "dedicated-expense-record") {
          const frameWindow = frameRef.current?.contentWindow;
          const startingPath = frameWindow?.location.pathname || "";
          const startingIdentifier = recordRoot
            ?.querySelector('[aria-label="Record Identity"] div:nth-child(3) dd')
            ?.textContent?.trim();
          const backToList =
            recordRoot?.querySelector<HTMLButtonElement>(".dr-back");
          const routeContractValid = Boolean(
            startingPath === `/expenses/${encodeURIComponent(startingIdentifier || "")}` &&
              startingIdentifier &&
              backToList,
          );
          backToList?.click();
          const listPathValid = await waitForFramePath("/expenses");
          const listRoot = await waitForFrameSelector<HTMLElement>(
            '[data-record-interaction="adaptive-master-detail"]',
          );
          const selectedListRecord = listRoot?.querySelector<HTMLElement>(
            '.ri-record-select[aria-current="true"]',
          );
          const listReturnValid = Boolean(
            listPathValid &&
              frameWindow?.location.pathname === "/expenses" &&
              listRoot &&
              startingIdentifier &&
              selectedListRecord?.textContent?.includes(startingIdentifier),
          );
          if (!routeContractValid || !listReturnValid) {
            setCaptureEvidence((current) => ({
              ...current,
              keyboard: "FAIL",
              recordContract: "FAIL",
            }));
            setCaptureError("DEDICATED_RECORD_ROUTE_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }

        if (mobileRecordFlow && mobileBackControl) {
          mobileBackControl.click();
          await waitForFrameUpdate();
          recordRoot = documentRoot?.querySelector<HTMLElement>(
            `[data-record-interaction="${recordInteraction}"]`,
          );
          const selectedSelector =
            config.target === "staff-conversations"
              ? '.ci-channel-select[aria-current="true"]'
              : '.ri-record-select[aria-current="true"]';
          const listSelector =
            config.target === "staff-conversations"
              ? ".ci-channel-list"
              : ".ri-record-list";
          const restoredSelection =
            recordRoot?.querySelector<HTMLButtonElement>(selectedSelector);
          const restoredList = recordRoot?.querySelector<HTMLElement>(listSelector);
          if (
            recordRoot?.classList.contains("is-mobile-detail") ||
            !restoredSelection ||
            documentRoot?.activeElement !== restoredSelection ||
            (restoredList?.scrollTop || 0) !== mobileListScrollTop
          ) {
            setCaptureEvidence((current) => ({
              ...current,
              recordContract: "FAIL",
            }));
            setCaptureError("RECORD_MOBILE_FLOW_FAILED");
            setCaptureState("FAIL");
            return;
          }
        }
      }
      let providerTruth = "NOT_APPLICABLE";
      if (config.target === "portal-home" && globalUtilitiesAuthorized) {
        let weatherChip = documentRoot?.querySelector<HTMLButtonElement>(
          '[data-provider-state="required"][data-weather-unit]',
        );
        const versionChip = documentRoot?.querySelector<HTMLElement>(
          `[data-version-state="saved"][data-saved-version="${CURRENT_SAVED_SITE_VERSION}"]`,
        );
        const initialUnit = weatherChip?.dataset.weatherUnit;
        const alternateUnit = initialUnit === "F" ? "C" : "F";
        weatherChip?.click();
        await waitForFrameUpdate();
        const unitButtons = [
          ...(documentRoot?.querySelectorAll<HTMLButtonElement>(
            '[aria-label="Temperature unit"] button',
          ) || []),
        ];
        const alternateUnitButton = unitButtons.find((button) =>
          button.textContent?.includes(
            alternateUnit === "F" ? "Fahrenheit" : "Celsius",
          ),
        );
        alternateUnitButton?.click();
        await waitForFrameUpdate();
        weatherChip = documentRoot?.querySelector<HTMLButtonElement>(
          '[data-provider-state="required"][data-weather-unit]',
        );
        const organizationDefaultButton = [
          ...(documentRoot?.querySelectorAll<HTMLButtonElement>(
            '[aria-label="Temperature unit"] button',
          ) || []),
        ].find((button) => button.textContent?.includes("Use Organization Default"));
        const unitSwitchValid = Boolean(
          (initialUnit === "F" || initialUnit === "C") &&
            alternateUnitButton &&
            weatherChip?.dataset.weatherUnit === alternateUnit &&
            weatherChip.textContent?.includes(`—°${alternateUnit}`) &&
            organizationDefaultButton,
        );
        organizationDefaultButton?.click();
        await waitForFrameUpdate();
        weatherChip = documentRoot?.querySelector<HTMLButtonElement>(
          '[data-provider-state="required"][data-weather-unit]',
        );
        const organizationDefaultRestored = Boolean(
          weatherChip &&
            ["F", "C"].includes(weatherChip.dataset.weatherUnit || "") &&
            !documentRoot?.querySelector(".p-temperature-default"),
        );
        providerTruth =
          unitSwitchValid &&
          organizationDefaultRestored &&
          versionChip?.textContent?.includes(CURRENT_SAVED_SITE_VERSION)
            ? "PASS"
            : "FAIL";
      }
      if (config.target === "meta-vault" && restrictedAuthorized) {
        const vault = documentRoot?.querySelector<HTMLElement>(
          '[data-review-surface="meta-vault"]',
        );
        const secretInputs = vault?.querySelectorAll(
          'input, textarea, [contenteditable="true"]',
        );
        providerTruth =
          vault?.dataset.providerState === "configuration-required" &&
          bodyText.includes("No Credential Material Is Available") &&
          bodyText.includes("No connection, freshness or quota state is claimed here") &&
          secretInputs?.length === 0
            ? "PASS"
            : "FAIL";
      }
      if (
        config.target === "communications-control" &&
        restrictedAuthorized
      ) {
        const communicationsControl = documentRoot?.querySelector<HTMLElement>(
          '[data-review-surface="communications-control"]',
        );
        const secretInputs = [
          ...(communicationsControl?.querySelectorAll<HTMLElement>(
            'input, textarea, [contenteditable="true"]',
          ) || []),
        ].filter((control) => {
          const privateMarkers = `${control.getAttribute("type") || ""} ${
            control.getAttribute("name") || ""
          }`.toLowerCase();
          return ["password", "secret", "token", "credential"].some((marker) =>
            privateMarkers.includes(marker),
          );
        });
        const emergencyBoundary =
          communicationsControl?.querySelector<HTMLElement>(
            '[data-safety-boundary="emergency-communications"]',
          );
        const providerReleaseBoundary =
          communicationsControl?.querySelector<HTMLElement>(
            '[data-safety-boundary="whatsapp-provider-release"]',
          );
        const safetyBoundaryControls = [
          ...(communicationsControl?.querySelectorAll<HTMLElement>(
            "[data-safety-boundary] button, [data-safety-boundary] input, [data-safety-boundary] select, [data-safety-boundary] textarea, [data-safety-boundary] [role='button']",
          ) || []),
        ];
        const mutationSurface =
          communicationsControl?.querySelector<HTMLElement>(
            "[data-mutation-state]",
          );
        const mutationActions = [
          ...(mutationSurface?.querySelectorAll<HTMLButtonElement>("button") || []),
        ];
        const closedMutationsDisabled =
          communicationsControl?.dataset.loadState === "ready" ||
          (mutationSurface?.dataset.mutationState ===
            "closed-until-authoritative" &&
            mutationActions.length === 3 &&
            mutationActions.every((button) => button.disabled));
        const liveProviderActions = [
          ...(communicationsControl?.querySelectorAll<HTMLButtonElement>("button") || []),
        ].filter((button) =>
          /(?:send|release|connect)\s+(?:whatsapp|provider|meta)/i.test(
            button.textContent || "",
          ),
        );
        providerTruth =
          communicationsControl?.dataset.providerState === "release-gated" &&
          communicationsControl.dataset.authority === "owner-only" &&
          communicationsControl.dataset.actorRole === "Owner" &&
          communicationsControl.dataset.backendContract ===
            "scoped-settings-v44" &&
          bodyTextNormalized.includes("live whatsapp provider release gate") &&
          bodyTextNormalized.includes(
            "eligibility does not release live provider sending or change meta credentials",
          ) &&
          emergencyBoundary?.dataset.controlState === "backend-controlled" &&
          providerReleaseBoundary?.dataset.controlState === "release-closed" &&
          safetyBoundaryControls.length === 0 &&
          secretInputs.length === 0 &&
          closedMutationsDisabled &&
          liveProviderActions.length === 0
            ? "PASS"
            : "FAIL";
      }
      if (config.target === "global-shell" && restrictedAuthorized) {
        providerTruth = documentRoot?.querySelector('[data-provider-state="configuration-required"]') &&
          bodyText.includes("No observation available") && bodyText.includes("No authoritative quota data")
          ? "PASS"
          : "FAIL";
      }
      if (config.target === "cloud-storage" && restrictedAuthorized) {
        const storageActions = [...(documentRoot?.querySelectorAll<HTMLButtonElement>(".cs-actions button, .cs-card > button") || [])];
        providerTruth = bodyText.includes("Runtime unverified") &&
          bodyText.includes("No authoritative sync audit available") &&
          storageActions.length >= 4 && storageActions.every((button) => button.disabled)
          ? "PASS"
          : "FAIL";
      }
      if (printingSurface && printingAuthorized) {
        const printingTruth = documentRoot?.querySelector<HTMLElement>(
          '[data-printing-workflow="authoritative-source-required"]',
        );
        const lifecycle = documentRoot?.querySelector<HTMLElement>(
          "[data-printing-lifecycle]",
        );
        const visibleStatuses = [
          ...(documentRoot?.querySelectorAll<HTMLElement>(
            ".p-production-board [data-recorded-stage]",
          ) || []),
        ].map((element) =>
          (element.dataset.recordedStage || "").toLocaleLowerCase("en-US"),
        );
        const printingTruthPredicates = [
          printingTruth?.dataset.paymentConfirmation === "unavailable",
          printingTruth?.dataset.reconciliation === "unavailable",
          printingTruth?.dataset.productionGate === "not-claimed",
          printingTruth?.dataset.authorityCopy ===
            "payment-unavailable|reconciliation-unavailable",
          lifecycle?.dataset.printingLifecycle ===
            "Enquiry|Quote|Customer Approval|Invoice|Customer Payment|Payment Confirmed|Production|QC|Ready/Delivered|Reconciliation|Complete",
          visibleStatuses.length === 3,
          visibleStatuses.every((status) =>
            ["customer approval", "quote", "invoice"].includes(status),
          ),
        ];
        providerTruth = printingTruthPredicates.every(Boolean) ? "PASS" : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("PRINTING_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (logisticsSurface && logisticsAuthorized) {
        const logisticsTruth = documentRoot?.querySelector<HTMLElement>(
          '[data-logistics-workflow="authoritative-evidence-required"]',
        );
        const lifecycle = documentRoot?.querySelector<HTMLElement>(
          "[data-logistics-lifecycle]",
        );
        const visibleStatuses = [
          ...(documentRoot?.querySelectorAll<HTMLElement>(
            ".p-logistics-board [data-recorded-stage]",
          ) || []),
        ].map((element) =>
          (element.dataset.recordedStage || "").toLocaleLowerCase("en-US"),
        );
        const logisticsTruthPredicates = [
          logisticsTruth?.dataset.liveTracking === "unavailable",
          logisticsTruth?.dataset.deliveryConfirmation === "unavailable",
          logisticsTruth?.dataset.reconciliation === "unavailable",
          logisticsTruth?.dataset.locationState === "not-claimed",
          logisticsTruth?.dataset.authorityCopy ===
            "tracking-unavailable|delivery-evidence-required|reconciliation-unavailable",
          lifecycle?.dataset.logisticsLifecycle ===
            "Booked|Assigned|In Transit|POD Required|Delivered|Closed",
          visibleStatuses.length === 3,
          visibleStatuses.every((status) =>
            ["pod required", "assigned", "in transit"].includes(status),
          ),
        ];
        providerTruth = logisticsTruthPredicates.every(Boolean) ? "PASS" : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("LOGISTICS_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (propertySurface && propertyAuthorized) {
        const propertyTruth = documentRoot?.querySelector<HTMLElement>(
          '[data-property-workflow="authoritative-records-required"]',
        );
        const portfolioStates = documentRoot?.querySelector<HTMLElement>(
          "[data-property-states]",
        );
        const visibleStatuses = [
          ...(documentRoot?.querySelectorAll<HTMLElement>(
            ".p-property-board [data-recorded-property-state]",
          ) || []),
        ].map((element) =>
          (element.dataset.recordedPropertyState || "").toLocaleLowerCase("en-US"),
        );
        const propertyTruthPredicates = [
          propertyTruth?.dataset.rentPaymentConfirmation === "unavailable",
          propertyTruth?.dataset.receiptTruth === "not-claimed",
          propertyTruth?.dataset.reconciliation === "unavailable",
          propertyTruth?.dataset.occupancySource === "recorded-aggregate-only",
          propertyTruth?.dataset.authorityCopy ===
            "occupancy-recorded|payment-unavailable|receipt-reconciliation-unavailable",
          portfolioStates?.dataset.propertyStates ===
            "Occupied|Available|Maintenance",
          visibleStatuses.length === 3,
          ["occupied", "available", "maintenance"].every(
            (status) =>
              visibleStatuses.filter((visibleStatus) => visibleStatus === status)
                .length === 1,
          ),
        ];
        providerTruth = propertyTruthPredicates.every(Boolean) ? "PASS" : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("PROPERTY_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (bakerySettlementSurface && bakerySettlementAuthorized) {
        const bakeryTruth = documentRoot?.querySelector<HTMLElement>(
          '[data-bakery-settlement-workflow="received-only-authority-required"]',
        );
        const financialCloseActions = [
          ...(bakeryTruth?.querySelectorAll<HTMLButtonElement>(
            ".p-button-row button",
          ) || []),
        ].filter((button) =>
          /approve.*close|close.*ledger|reconcile/i.test(
            button.textContent || "",
          ),
        );
        const bakeryTruthPredicates = [
          bakeryTruth?.dataset.receivedMoney === "unavailable",
          bakeryTruth?.dataset.receiptTruth === "not-claimed",
          bakeryTruth?.dataset.financialClose === "blocked",
          bakeryTruth?.dataset.authorityCopy ===
            "accounted-not-received|settlement-unavailable|close-blocked",
          bodyText.toLocaleLowerCase("en-US").includes(
            "may include money still owed",
          ),
          bodyText.includes(
            "Approve and close is unavailable until an authoritative received-only settlement projection is connected.",
          ),
          !bodyText.includes("Actual remittance"),
          !bodyText.includes("Reconciled"),
          financialCloseActions.length === 0,
        ];
        providerTruth = bakeryTruthPredicates.every(Boolean) ? "PASS" : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("BAKERY_SETTLEMENT_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (offboardingAccessSurface && offboardingAccessAuthorized) {
        const offboardingTruth = documentRoot?.querySelector<HTMLElement>(
          '[data-offboarding-access-workflow="authoritative-access-verification-required"]',
        );
        const unsafeActions = [
          ...(offboardingTruth?.querySelectorAll<HTMLButtonElement>("button") || []),
        ].filter((button) =>
          /^(complete|not applicable)$/i.test((button.textContent || "").trim()),
        );
        const offboardingTruthPredicates = [
          offboardingTruth?.dataset.accessRemoval === "verification-required",
          offboardingTruth?.dataset.selfReportedCompletion === "blocked",
          offboardingTruth?.dataset.notApplicable === "audited-exemption-required",
          offboardingTruth?.dataset.revocationScope === "company-specific",
          offboardingTruth?.dataset.identitySource === "identity-authority-not-connected",
          bodyTextNormalized.includes(
            "completing a checklist does not revoke sessions",
          ),
          bodyTextNormalized.includes("unrelated company access"),
          bodyTextNormalized.includes("preserved"),
          unsafeActions.length === 0,
        ];
        providerTruth = offboardingTruthPredicates.every(Boolean) ? "PASS" : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("OFFBOARDING_ACCESS_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (authenticatedTimeSurface && authenticatedTimeAuthorized) {
        const primaryClock = documentRoot?.querySelector<HTMLElement>(
          '[data-authenticated-time-primary="true"]',
        );
        const historyTab = [
          ...(documentRoot?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || []),
        ].find((button) => button.textContent?.trim() === "History");
        historyTab?.click();
        let historyReady = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await waitForFrameUpdate();
          const selectedHistoryTab = [
            ...(documentRoot?.querySelectorAll<HTMLButtonElement>('[role="tab"]') || []),
          ].find((button) => button.textContent?.trim() === "History");
          historyReady = Boolean(
            selectedHistoryTab?.getAttribute("aria-selected") === "true" &&
              documentRoot?.querySelector(".dr-section-panel .p-timeline"),
          );
          if (historyReady) break;
        }
        const renderedTimes = [
          ...(documentRoot?.querySelectorAll<HTMLElement>(
            ".dr-section-panel .p-timeline small",
          ) || []),
        ].map((element) => element.textContent?.trim() || "");
        const expectedZone =
          config.profile === "Manager" ? "America/Toronto" : "Africa/Lagos";
        const expectedFirstTime =
          config.profile === "Owner"
            ? "Sep 10, 2026, 9:20 AM · Africa/Lagos | Sep 10, 2026, 4:20 AM · America/New_York"
            : config.profile === "Manager"
              ? "Sep 10, 2026, 4:20 AM · America/Toronto"
              : "Sep 10, 2026, 9:20 AM · Africa/Lagos";
        const renderedTimeCountValid =
          config.profile === "Employee"
            ? renderedTimes.length === 0 || renderedTimes.length === 2
            : renderedTimes.length === 2;
        const renderedFirstTimeValid =
          config.profile === "Employee" && renderedTimes.length === 0
            ? true
            : renderedTimes[0] === expectedFirstTime;
        const ownerRecordTruth =
          config.profile !== "Owner" ||
          renderedTimes.every(
            (time) =>
              time.includes("Africa/Lagos") &&
              time.includes("America/New_York") &&
              time.includes(" | "),
          );
        const employeeRecordTruth =
          config.profile === "Owner" ||
          renderedTimes.every(
            (time) =>
              time.includes(expectedZone) &&
              !time.includes("America/New_York") &&
              !time.includes(" | "),
          );
        const authenticatedTimePredicates = [
          primaryClock?.dataset.timeZone === expectedZone,
          /\d{1,2}:\d{2}\s(?:AM|PM)/.test(primaryClock?.textContent || ""),
          Boolean(historyTab),
          historyReady,
          renderedTimeCountValid,
          renderedTimes.every((time) => /\b(?:AM|PM)\b/.test(time)),
          renderedFirstTimeValid,
          ownerRecordTruth,
          employeeRecordTruth,
        ];
        providerTruth = authenticatedTimePredicates.every(Boolean)
          ? "PASS"
          : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("AUTHENTICATED_TIME_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (autosSalesSurface && recordAuthorized) {
        const autosTruth = documentRoot?.querySelector<HTMLElement>(
          '[data-autos-sales-workflow="bank-confirmation-required"]',
        );
        const unsafeActions = [
          ...(documentRoot?.querySelectorAll<HTMLButtonElement>("button") || []),
        ].filter((button) =>
          /(?:record|mark|confirm).*(?:paid|payment|settled)|(?:open|create).*workshop/i.test(
            button.textContent || "",
          ),
        );
        const autosTruthPredicates = [
          autosTruth?.dataset.paymentConfirmation === "not-confirmed",
          autosTruth?.dataset.workshopState === "historical-read-only",
          autosTruth?.dataset.settlementSource ===
            "authoritative-provider-required",
          bodyTextNormalized.includes(
            "recorded amounts are not confirmed payments",
          ),
          bodyTextNormalized.includes(
            "a bank or payment provider must confirm settlement",
          ),
          width < 768 ||
            (bodyText.includes("Payment Status") &&
              bodyText.includes("Not Confirmed")),
          !bodyTextNormalized.includes("total paid"),
          !bodyTextNormalized.includes("workshop revenue"),
          !bodyTextNormalized.includes("workshop queue"),
          unsafeActions.length === 0,
        ];
        providerTruth = autosTruthPredicates.every(Boolean) ? "PASS" : "FAIL";
        if (providerTruth === "FAIL") {
          setCaptureEvidence((current) => ({ ...current, providerTruth }));
          setCaptureError("AUTOS_SALES_TRUTH_ASSERTION_FAILED");
          setCaptureState("FAIL");
          return;
        }
      }
      if (providerTruth === "FAIL") {
        setCaptureEvidence((current) => ({ ...current, providerTruth }));
        setCaptureError("PROVIDER_TRUTH_ASSERTION_FAILED");
        setCaptureState("FAIL");
        return;
      }
      if (signInCapture && root.dataset.themeId !== config.theme) {
        setCaptureError(
          `THEME_MISMATCH:${config.theme}:${root.dataset.themeId || "MISSING"}`,
        );
        setCaptureState("FAIL");
        return;
      }
      if (
        studioCapture &&
        !noAuthorizedWorkspace &&
        root.dataset.studioVersion !== CURRENT_SIGNIN_STUDIO_VERSION
      ) {
        setCaptureError(
          `STUDIO_VERSION_MISMATCH:${CURRENT_SIGNIN_STUDIO_VERSION}:${root.dataset.studioVersion || "MISSING"}`,
        );
        setCaptureState("FAIL");
        return;
      }
      const loadingShellPresent = Boolean(
        documentRoot?.querySelector(".p-start, .p-skeleton"),
      );
      if (
        (signInCapture && root.dataset.loadingShellAbsent !== "true") ||
        loadingShellPresent
      ) {
        if (Date.now() - started < 15000) window.setTimeout(inspect, 100);
        else {
          setCaptureError("LOADING_SHELL_PRESENT");
          setCaptureState("FAIL");
        }
        return;
      }
      const childPerformance = frameRef.current?.contentWindow?.performance;
      const navigationEntry = childPerformance?.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming | undefined;
      const navigationDurationMs = Math.round(navigationEntry?.duration || 0);
      const resourceCount = childPerformance?.getEntriesByType("resource").length || 0;
      const domNodeCount = documentRoot?.querySelectorAll("*").length || 0;
      setRuntimeEvidence({
        navigationDurationMs,
        resourceCount,
        domNodeCount,
        focusableCount: interactiveElements.length,
      });
      if (!navigationDurationMs || navigationDurationMs > 15000 || domNodeCount > 5000) {
        setCaptureEvidence((current) => ({ ...current, performance: "FAIL" }));
        setCaptureError(
          !navigationDurationMs
            ? "NAVIGATION_TIMING_UNAVAILABLE"
            : navigationDurationMs > 15000
              ? `NAVIGATION_SANITY_LIMIT:${navigationDurationMs}`
              : `DOM_NODE_SANITY_LIMIT:${domNodeCount}`,
        );
        setCaptureState("FAIL");
        return;
      }
      setCaptureEvidence({
        overflow: "PASS",
        landmarks: "PASS",
        accessibility: "PASS",
        keyboard: "PASS",
        targetSize: "PASS",
        signInContract: signInCapture ? "PASS" : "NOT_APPLICABLE",
        providerTruth,
        projection: "PASS",
        recordContract: recordSurface ? "PASS" : "NOT_APPLICABLE",
        motion: "PASS",
        performance: "PASS",
      });
      setCaptureState("PASS");
    };
    window.setTimeout(inspect, 0);
  }

  if (!configured) return <main data-capture-configured="false" />;
  if (config.matrix) {
    return (
      <MatrixRunner
        scope={config.matrixTarget}
        motion={config.motion}
        autorun={config.autorun}
        autoRetry={config.autoRetry}
      />
    );
  }
  if (config.windowed)
    return (
      <main
        data-exact-window-launch={`${width}×${height}`}
        data-review-target={config.target}
        data-window-launch-state={windowLaunchState}
        style={{
          minHeight: "100vh",
          padding: 32,
          background: "#e9eef6",
          color: "#172337",
          fontFamily: "Arial,sans-serif",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24 }}>Exact Viewport Review</h1>
        <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
          Open the authenticated review surface in a top-level window so the
          owner-private Sites boundary remains intact.
        </p>
        <button type="button" onClick={openExactReviewWindow}>
          Open {config.target} at {width} × {height}
        </button>
        <p role="status" aria-live="polite">
          {windowLaunchState === "IDLE"
            ? "Ready to open the exact review window."
            : windowLaunchState === "OPENED"
              ? "Exact review window opened."
              : "The browser blocked the review window."}
        </p>
      </main>
    );
  if (config.capture)
    return (
      <main
        data-exact-viewport-capture={`${width}×${height}`}
        data-review-target={config.target}
        data-requested-theme-id={
          config.target === "signin" ? config.theme : undefined
        }
        data-capture-assertion={captureState}
        data-capture-ready={captureState === "PASS" ? "true" : "false"}
        data-capture-error={captureError || undefined}
        data-rendered-theme-id={renderedIdentity.themeId || undefined}
        data-rendered-theme-source={renderedIdentity.source || undefined}
        data-rendered-theme-display-name={
          renderedIdentity.displayName || undefined
        }
        data-rendered-source-commit={renderedIdentity.sourceCommit || undefined}
        data-child-inner-width={String(renderedViewport.width)}
        data-child-inner-height={String(renderedViewport.height)}
        data-child-viewport={`${renderedViewport.width}×${renderedViewport.height}`}
        data-ready-state={renderedIdentity.ready}
        data-rendered-studio-version={
          renderedIdentity.studioVersion || undefined
        }
        data-overflow-assertion={captureEvidence.overflow}
        data-landmark-assertion={captureEvidence.landmarks}
        data-accessibility-assertion={captureEvidence.accessibility}
        data-keyboard-assertion={captureEvidence.keyboard}
        data-target-size-assertion={captureEvidence.targetSize}
        data-signin-contract-assertion={captureEvidence.signInContract}
        data-provider-truth-assertion={captureEvidence.providerTruth}
        data-projection-assertion={captureEvidence.projection}
        data-record-contract-assertion={captureEvidence.recordContract}
        data-motion-assertion={captureEvidence.motion}
        data-performance-sanity-assertion={captureEvidence.performance}
        data-navigation-duration-ms={String(runtimeEvidence.navigationDurationMs)}
        data-resource-count={String(runtimeEvidence.resourceCount)}
        data-dom-node-count={String(runtimeEvidence.domNodeCount)}
        data-focusable-count={String(runtimeEvidence.focusableCount)}
        style={{
          width,
          height,
          margin: 0,
          padding: 0,
          overflow: "hidden",
          background: "#020817",
        }}
      >
        <iframe
          ref={frameRef}
          id="review-frame"
          title={`${config.target} at ${config.size}`}
          key={`${config.target}-${config.theme}-${config.authState}-${config.size}-${revision}`}
          src={frameSource}
          onLoad={frameNeedsValidation ? validateFrame : undefined}
          style={{ display: "block", border: 0, width, height }}
        />
      </main>
    );

  return (
    <main
      style={{
        fontFamily: "Arial,sans-serif",
        padding: 24,
        background: "#e9eef6",
        minWidth: scale ? 0 : width + 48,
        minHeight: "100vh",
        color: "#172337",
      }}
    >
      <h1 style={{ fontSize: 24 }}>Daenem responsive review workbench</h1>
      <p style={{ fontSize: 14, margin: "10px 0 20px" }}>
        Embedded Chromium viewport review. Captures verify exact viewport,
        deterministic readiness, permission projection, horizontal overflow,
        keyboard landmarks, accessible control names, runtime performance sanity
        and truthful provider states where applicable.
      </p>
      <section
        aria-labelledby="closure-matrix-title"
        style={{
          display: "grid",
          gap: 10,
          marginBottom: 20,
          padding: 16,
          border: "1px solid #c8d4e4",
          borderRadius: 16,
          background: "#f8fbff",
        }}
      >
        <div>
          <strong id="closure-matrix-title">Slice I acceptance matrix</strong>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "#52647e" }}>
            Four role projections × nine representative viewport classes. A
            capture is evidence only after its rendered assertions report PASS.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {closureProfiles.map((value) => (
            <span key={value} style={{ padding: "5px 9px", borderRadius: 999, background: "#e9f1fc", fontSize: 12 }}>{value}</span>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {closureSizes.map((value) => (
            <span key={value} style={{ padding: "5px 9px", borderRadius: 999, background: "#eef2f7", fontSize: 12 }}>{value}</span>
          ))}
        </div>
      </section>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <label>
          Target{" "}
          <select
            aria-label="Review target"
            value={config.target}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                target: event.target.value as ReviewTarget,
              }))
            }
          >
            {reviewTargets.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Viewport{" "}
          <select
            aria-label="Review viewport"
            value={config.size}
            onChange={(event) =>
              setConfig((current) => ({ ...current, size: event.target.value }))
            }
          >
            {sizes.map(([w, h]) => (
              <option key={w} value={`${w}×${h}`}>
                {w}×{h}
              </option>
            ))}
          </select>
        </label>
        <label>
          Appearance{" "}
          <select
            aria-label="Review appearance"
            value={appearance}
            onChange={(event) => setAppearance(event.target.value)}
          >
            <option>Daylight</option>
            <option>Midnight</option>
          </select>
        </label>
        <label>
          Profile{" "}
          <select
            aria-label="Review profile"
            value={profile}
            onChange={(event) => {
              const nextProfile = event.target.value;
              setProfile(nextProfile);
              setConfig((current) => ({ ...current, profile: nextProfile }));
            }}
          >
            {testProfiles.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {config.target === "signin" && (
          <label>
            Screen{" "}
            <select
              aria-label="Review screen"
              value={safeScene}
              onChange={(event) => setScene(event.target.value)}
            >
              {scenes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
        {config.target === "signin" && safeScene === "signin" && (
          <label>
            Composition{" "}
            <select
              aria-label="Review composition"
              value={config.theme}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  theme: event.target.value,
                }))
              }
            >
              {CANONICAL_SIGNIN_THEME_REGISTRY.map((item) => (
                <option key={item.THEME_ID} value={item.THEME_ID}>
                  {item.DISPLAY_NAME} · {item.SOURCE_PROVENANCE}
                </option>
              ))}
            </select>
          </label>
        )}
        {config.target === "signin" && safeScene === "signin" && (
          <label>
            Authentication State{" "}
            <select
              aria-label="Review authentication state"
              value={config.authState}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  authState: event.target.value,
                }))
              }
            >
              <option value="signin">Sign In</option>
              <option value="signup">Create Account</option>
              <option value="recovery">Password Recovery</option>
              <option value="verify">OTP / Verification</option>
              <option value="password">Password Reset</option>
            </select>
          </label>
        )}
        {safeScene === "home" && (
          <label>
            Workspace{" "}
            <select
              aria-label="Review workspace layout"
              value={layout}
              onChange={(event) => setLayout(event.target.value)}
            >
              {layouts.map((value, index) => (
                <option key={value} value={index}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={scale}
            onChange={(event) => setScale(event.target.checked)}
          />
          Fit capture to 1200px
        </label>
        <label>
          Motion{" "}
          <select
            aria-label="Review motion"
            value={config.motion}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                motion: event.target.value as CaptureConfig["motion"],
              }))
            }
          >
            <option value="default">User preference</option>
            <option value="off">Motion Off</option>
          </select>
        </label>
        <button onClick={() => setRevision((value) => value + 1)}>
          Reload reviewed screen
        </button>
        {session && canView(byId("toolbox"), session) && (
          <Link href="/toolbox">Return to review tools</Link>
        )}
      </div>
      <div
        style={{
          width: scale ? Math.min(width, 1200) : width,
          height: scale ? height * Math.min(1, 1200 / width) : height,
          background: "#fff",
          boxShadow: "0 10px 50px #11243c20",
        }}
      >
        <iframe
          ref={frameRef}
          id="review-frame"
          title={`${config.target === "signin" ? safeScene : config.target} at ${config.size}`}
          key={`${config.target}${safeScene}${config.theme}${config.authState}${layout}${appearance}${revision}`}
          src={frameSource}
          onLoad={frameNeedsValidation ? validateFrame : undefined}
          style={{
            display: "block",
            border: 0,
            width,
            height,
            transform: scale
              ? `scale(${Math.min(1, 1200 / width)})`
              : undefined,
            transformOrigin: "top left",
          }}
        />
      </div>
      <p style={{ fontSize: 13, marginTop: 16 }}>
        Target: {config.target}. Requested viewport: {width} × {height} CSS
        pixels. Child inner viewport: {renderedViewport.width || "—"} ×{" "}
        {renderedViewport.height || "—"}. Capture assertion: {captureState}
        {captureError ? ` · ${captureError}` : ""}
      </p>
      <p style={{ fontSize: 13, marginTop: 6 }}>
        Overflow: {captureEvidence.overflow} · Landmarks: {captureEvidence.landmarks} · Accessibility: {captureEvidence.accessibility} · Keyboard: {captureEvidence.keyboard} · Target size: {captureEvidence.targetSize} · Sign-In contract: {captureEvidence.signInContract} · Permission projection: {captureEvidence.projection} · Record contract: {captureEvidence.recordContract} · Provider truth: {captureEvidence.providerTruth} · Motion override: {captureEvidence.motion} · Performance sanity: {captureEvidence.performance}
      </p>
      <p style={{ fontSize: 13, marginTop: 6 }}>
        Observed runtime: {runtimeEvidence.navigationDurationMs || "—"} ms navigation · {runtimeEvidence.resourceCount || "—"} resources · {runtimeEvidence.domNodeCount || "—"} DOM nodes · {runtimeEvidence.focusableCount || "—"} interactive controls
      </p>
    </main>
  );
}
