"use client";
import { sessionForProfile } from "./security-contract";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
  LockKeyhole,
  Globe2,
  Check,
  Minus,
  Download,
  MessageCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo, type Preferences } from "./Portal";
import { Btn, Pick, Callout, Badge } from "./ui";
import { type Session, type Role } from "./model";
import {
  fixturePasswordPolicy,
  passwordRequirements,
  passwordError,
  issueDemoCode,
  verifyDemoCode,
  canResetPassword,
  authenticationScenarios,
  signInPresets,
  imageRuntimeFallback,
  type CodeState,
} from "./auth-contract";
import "./auth-v3.css";
import "./signin-flagship.css";
import "./signin-v13.css";
import "./signin-v15.css";
import "./signin-v16.css";
import {
  SafeSpotlight,
  PublicStatus,
  PublishFreshness,
} from "./signin-flagship";
import {
  defaultThemeDefinition,
  loadRuntimeTheme,
  type SignInThemeDefinition,
} from "./signin-theme-runtime";
import {
  RENDERED_SOURCE_COMMIT,
  UnifiedSignInRenderer,
} from "./unified-signin-renderer";
import {
  requestedUnifiedThemeId,
  unifiedThemeById,
  type UnifiedSignInThemeRecord,
} from "./signin-unified-registry";
import "./signin-closure.css";
import "./signin-v19.css";
import "./auth-recovery-v43.css";

type Stage =
  | "signin"
  | "recovery"
  | "verify"
  | "password"
  | "signup"
  | "activation"
  | "success"
  | "provisional";
type RecoveryMethod = "email" | "whatsapp";
type RecoveryStep = "company" | "identifier" | "method" | "verify";
type RecoveryPolicy = "email-only" | "whatsapp-only" | "email-whatsapp";
const RECOVERY_COMPANIES = [
  { id: "printing", label: "Daenem Printing & Technology" },
  { id: "bakery", label: "Daenem Bakery" },
  { id: "autos", label: "Daenem Autos" },
  { id: "properties", label: "Daenem Homes & Properties" },
  { id: "logistics", label: "Daenem Logistics" },
] as const;
const recoveryPolicyLabel: Record<RecoveryPolicy, string> = {
  "email-only": "Email only",
  "whatsapp-only": "WhatsApp only",
  "email-whatsapp": "Email + WhatsApp",
};
type AvailabilityState =
  | "idle"
  | "typing"
  | "checking"
  | "available"
  | "unavailable"
  | "invalid"
  | "rate-limited"
  | "service-unavailable"
  | "error";
type InstallPromptEvent = Event & { prompt: () => Promise<void> };
export { AnalogClock, WorldClockCenter } from "./technology";

const availabilityCopy: Record<AvailabilityState, string> = {
  idle: "Start typing to check",
  typing: "Typing…",
  checking: "Checking design-lab fixtures…",
  available: "Available · Design-lab result",
  unavailable: "Unavailable · Design-lab result",
  invalid: "Invalid format",
  "rate-limited": "Rate limited · Try again shortly",
  "service-unavailable": "Fixture service unavailable",
  error: "Unable to check",
};
function Availability({
  state,
  subject,
}: {
  state: AvailabilityState;
  subject: "email" | "username";
}) {
  return (
    <p
      className={`v15-availability is-${state}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" />
      {availabilityCopy[state]}
      <small>
        {subject === "email" ? "Email" : "Username"} availability is a
        preview; the production identity service is not connected.
      </small>
    </p>
  );
}

export default function AuthV3({
  onEnter,
  prefs,
}: {
  onEnter: (s: Session) => void;
  prefs: Preferences;
}) {
  const [stage, setStage] = useState<Stage>(() => {
      if (typeof window === "undefined") return "signin";
      const requested = new URLSearchParams(window.location.search).get(
        "authState",
      ) as Stage | null;
      return requested &&
        ["signin", "recovery", "verify", "password", "signup"].includes(
          requested,
        )
        ? requested
        : "signin";
    }),
    [scenario, setScenario] = useState("Normal sign-in"),
    [role, setRole] = useState<Role>("Owner"),
    [presetId, setPresetId] = useState(() => {
      if (typeof window === "undefined")
        return prefs.signin.experience || "horizon";
      const requested = new URLSearchParams(window.location.search).get(
        "experience",
      );
      return signInPresets.some((p) => p.id === requested)
        ? requested!
        : prefs.signin.experience || "horizon";
    });
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [previousPassword, setPreviousPassword] = useState(""),
    [code, setCode] = useState("");
  const [show, setShow] = useState(false),
    [remember, setRemember] = useState(false),
    [trusted, setTrusted] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState<string | null>(null);
  const [codeState, setCodeState] = useState<CodeState>(() =>
      issueDemoCode(Date.now()),
    ),
    [now, setNow] = useState(() => Date.now()),
    [signup, setSignup] = useState({
      name: "",
      phone: "",
      email: "",
      company: "",
      department: "",
      position: "",
      username: "",
      employeeId: "",
    }),
    [signupErrors, setSignupErrors] = useState<Record<string, string>>({}),
    [policyAccepted, setPolicyAccepted] = useState(false),
    [flow, setFlow] = useState<"recovery" | "signup">("recovery");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("company"),
    [recoveryCompany, setRecoveryCompany] = useState(""),
    [recoveryPolicy, setRecoveryPolicy] = useState<RecoveryPolicy | null>(null),
    [recoveryMethods, setRecoveryMethods] = useState<RecoveryMethod[]>([]),
    [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod | null>(null),
    [recoveryService, setRecoveryService] = useState<"idle" | "loading" | "unavailable" | "ready">("idle"),
    [recoveryChallenge, setRecoveryChallenge] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] =
      useState<AvailabilityState>("idle"),
    [emailAvailability, setEmailAvailability] =
      useState<AvailabilityState>("idle");
  const [busy, setBusy] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [signinReady, setSigninReady] = useState(false);
  const signupFieldRefs = useRef<Record<string, { focus: () => void } | null>>({}),
    authTabFocus = useRef<"signin" | "signup" | null>(null),
    transitionTimer = useRef<number | null>(null);
  const scheduled =
    prefs.signin.schedule === "Ibadan day/night"
      ? new Date(now).toLocaleTimeString("en-GB", {
          timeZone: "Africa/Lagos",
          hour: "2-digit",
          hour12: false,
        }) >= "18" ||
        new Date(now).toLocaleTimeString("en-GB", {
          timeZone: "Africa/Lagos",
          hour: "2-digit",
          hour12: false,
        }) < "06"
        ? prefs.signin.nightExperience
        : prefs.signin.dayExperience
      : undefined;
  const fallbackPresetId = scheduled || presetId;
  const preset =
      signInPresets.find((p) => p.id === fallbackPresetId) || signInPresets[0],
    rules = passwordRequirements(password, fixturePasswordPolicy);
  const [runtimeTheme, setRuntimeTheme] = useState<SignInThemeDefinition>(() =>
    defaultThemeDefinition(fallbackPresetId),
  );
  const [unifiedRecord, setUnifiedRecord] = useState<UnifiedSignInThemeRecord>(
    () =>
      unifiedThemeById(
        typeof window === "undefined" ? undefined : requestedUnifiedThemeId(),
      ),
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);
  useEffect(() => {
    const runtimeId =
      unifiedRecord.SOURCE_PROVENANCE === "SITES"
        ? unifiedRecord.SOURCE_THEME_ID
        : fallbackPresetId;
    const refresh = () =>
      setRuntimeTheme(
        unifiedRecord.RUNTIME_DEFINITION || loadRuntimeTheme(runtimeId),
      );
    refresh();
    window.addEventListener("daenem-signin-theme-change", refresh);
    window.addEventListener("daenem-signin-theme-published", refresh);
    return () => {
      window.removeEventListener("daenem-signin-theme-change", refresh);
      window.removeEventListener("daenem-signin-theme-published", refresh);
    };
  }, [fallbackPresetId, unifiedRecord]);
  useEffect(() => {
    const refresh = () =>
      setUnifiedRecord(unifiedThemeById(requestedUnifiedThemeId()));
    refresh();
    window.addEventListener("daenem-signin-active-v20", refresh);
    return () =>
      window.removeEventListener("daenem-signin-active-v20", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    const reset = window.setTimeout(() => setSigninReady(false), 0),
      runtimePreset =
        signInPresets.find((p) => p.id === runtimeTheme.background.presetId) ||
        preset;
    const image = new window.Image();
    image.src = imageRuntimeFallback(runtimePreset);
    const decoded =
      typeof image.decode === "function"
        ? image.decode().catch(() => undefined)
        : new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          });
    const fonts = document.fonts?.ready || Promise.resolve();
    Promise.all([decoded, fonts]).then(() =>
      requestAnimationFrame(() => {
        if (active) setSigninReady(true);
      }),
    );
    return () => {
      active = false;
      window.clearTimeout(reset);
    };
  }, [runtimeTheme.background.presetId, preset]);
  useEffect(() => {
    const value = signup.username.trim().toLowerCase();
    const initial = setTimeout(
      () => setUsernameAvailability(value ? "typing" : "idle"),
      0,
    );
    if (!value) return () => clearTimeout(initial);
    const checking = setTimeout(() => setUsernameAvailability("checking"), 260);
    const result = setTimeout(() => {
      if (!/^[a-z][a-z0-9._-]{3,31}$/i.test(value))
        setUsernameAvailability("invalid");
      else if (value.includes("limit")) setUsernameAvailability("rate-limited");
      else if (value.includes("offline"))
        setUsernameAvailability("service-unavailable");
      else if (value.includes("error")) setUsernameAvailability("error");
      else if (
        ["reviewer", "admin", "daniel.obi", "theo.adegboye"].includes(value)
      )
        setUsernameAvailability("unavailable");
      else setUsernameAvailability("available");
    }, 640);
    return () => {
      clearTimeout(initial);
      clearTimeout(checking);
      clearTimeout(result);
    };
  }, [signup.username]);
  useEffect(() => {
    const value = signup.email.trim().toLowerCase();
    const initial = setTimeout(
      () => setEmailAvailability(value ? "typing" : "idle"),
      0,
    );
    if (!value) return () => clearTimeout(initial);
    const checking = setTimeout(() => setEmailAvailability("checking"), 260);
    const result = setTimeout(() => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        setEmailAvailability("invalid");
      else if (value.includes("limit")) setEmailAvailability("rate-limited");
      else if (value.includes("offline"))
        setEmailAvailability("service-unavailable");
      else if (value.includes("error")) setEmailAvailability("error");
      else if (
        [
          "reviewer@example.test",
          "admin@example.test",
          "daniel.obi@example.test",
        ].includes(value)
      )
        setEmailAvailability("unavailable");
      else setEmailAvailability("available");
    }, 640);
    return () => {
      clearTimeout(initial);
      clearTimeout(checking);
      clearTimeout(result);
    };
  }, [signup.email]);
  function move(next: Stage) {
    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
    setBusy(false);
    setError("");
    setMessage("");
    if (next === "signin") {
      setSignupErrors({});
      resetRecovery();
    }
    setStage(next);
  }
  function resetRecovery() {
    setFlow("recovery");
    setRecoveryStep("company");
    setRecoveryCompany("");
    setRecoveryPolicy(null);
    setRecoveryMethods([]);
    setRecoveryMethod(null);
    setRecoveryService("idle");
    setRecoveryChallenge(null);
    setUsername("");
  }
  async function responseJson(response: Response): Promise<Record<string, unknown>> {
    try {
      const value: unknown = await response.json();
      if (value && typeof value === "object") return value as Record<string, unknown>;
    } catch {}
    return {};
  }
  function normalizeRecoveryMethods(value: unknown): RecoveryMethod[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((method): method is RecoveryMethod => method === "email" || method === "whatsapp"))];
  }
  async function loadRecoveryOptions() {
    if (!recoveryCompany) {
      setError("Select your company to continue.");
      return;
    }
    if (!username.trim()) {
      setError("Enter your username or email.");
      return;
    }
    setBusy(true);
    setRecoveryService("loading");
    setError("");
    setMessage("");
    try {
      const query = new URLSearchParams({ company: recoveryCompany, identifier: username.trim() });
      const response = await fetch(`/api/auth/password/recovery-options?${query.toString()}`, { headers: { Accept: "application/json" } });
      const payload = await responseJson(response);
      if (!response.ok) throw new Error("recovery-options-unavailable");
      const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
      const methods = normalizeRecoveryMethods(data.methods || data.allowedMethods || data.recoveryMethods);
      const policy = data.policy === "email-only" || data.policy === "whatsapp-only" || data.policy === "email-whatsapp" ? data.policy : null;
      const policyMethods: RecoveryMethod[] = policy === "email-only" ? ["email"] : policy === "whatsapp-only" ? ["whatsapp"] : policy === "email-whatsapp" ? ["email", "whatsapp"] : [];
      setRecoveryMethods(methods.length ? methods : policyMethods);
      setRecoveryPolicy(policy);
      setRecoveryService("ready");
      setRecoveryStep("method");
      setMessage("If the details are eligible, these are the recovery methods permitted by your company policy.");
    } catch {
      setRecoveryService("unavailable");
      setRecoveryStep("method");
      setRecoveryMethods([]);
      setRecoveryPolicy(null);
      setMessage("If an account is eligible, recovery will continue through the permitted channel. The recovery service is unavailable in this preview.");
    } finally {
      setBusy(false);
    }
  }
  async function requestRecoveryCode() {
    if (!recoveryMethod || !recoveryCompany || !username.trim()) {
      setError("Choose a recovery method to continue.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const endpoint = recoveryMethod === "whatsapp" ? "/api/auth/password/forgot-whatsapp" : "/api/auth/password/forgot";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ company: recoveryCompany, identifier: username.trim() }),
      });
      const payload = await responseJson(response);
      if (!response.ok) throw new Error("recovery-request-unavailable");
      const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
      if (typeof data.challengeId === "string") setRecoveryChallenge(data.challengeId);
      setRecoveryStep("verify");
      setStage("verify");
      setCode("");
      setMessage(`If the account is eligible, a verification code was sent through ${recoveryMethod === "whatsapp" ? "WhatsApp" : "email"}.`);
    } catch {
      setRecoveryService("unavailable");
      setMessage("If the account is eligible, a verification code will be sent through the selected channel. No account status is disclosed.");
    } finally {
      setBusy(false);
    }
  }
  async function verifyRecoveryCode() {
    if (!code.trim()) {
      setError("Enter the verification code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const endpoint = recoveryMethod === "whatsapp" ? "/api/auth/password/verify-reset-whatsapp" : "/api/auth/password/verify-reset";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ company: recoveryCompany, identifier: username.trim(), code, challengeId: recoveryChallenge }),
      });
      if (!response.ok) throw new Error("recovery-code-unavailable");
      await responseJson(response);
      setCodeState({ ...issueDemoCode(Date.now()), verified: true, resetExpiresAt: Date.now() + 300000 });
      setStage("password");
      setMessage("Verification accepted by the identity service. Choose a new password before the short-lived reset authorization expires.");
    } catch {
      setError("That code could not be verified. Request a fresh code and try again.");
    } finally {
      setBusy(false);
    }
  }
  function activateAuthTab(next: "signin" | "signup") {
    authTabFocus.current = next;
    move(next);
  }
  function handleAuthTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    activateAuthTab(
      event.key === "ArrowLeft" || event.key === "Home" ? "signin" : "signup",
    );
  }
  useEffect(() => {
    const requested = authTabFocus.current;
    if (!requested || requested !== stage) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`auth-tab-${requested}`)?.focus();
      authTabFocus.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stage]);
  function updateSignup(field: keyof typeof signup, value: string) {
    setSignup((current) => ({ ...current, [field]: value }));
    setSignupErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === "email") delete next.emailAvailability;
      if (field === "username") delete next.usernameAvailability;
      return next;
    });
  }
  function focusSignupField(field: string) {
    window.requestAnimationFrame(() => signupFieldRefs.current[field]?.focus());
  }
  function validateSignup() {
    const issues: Record<string, string> = {};
    if (!signup.name.trim()) issues.name = "Enter your legal or full name.";
    if (!signup.phone.trim())
      issues.phone = "Enter a phone number for the identity request.";
    if (!signup.email.trim()) issues.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signup.email))
      issues.email = "Enter a valid email address.";
    else if (emailAvailability === "unavailable")
      issues.email =
        "That email is already claimed. Use another email or contact an administrator.";
    else if (emailAvailability !== "available")
      issues.email =
        "Wait for the email availability check to show Available before continuing.";
    if (!signup.company) issues.company = "Select the company you are requesting access to.";
    if (!signup.department.trim())
      issues.department = "Enter your department or work area.";
    if (!signup.position.trim())
      issues.position = "Enter your job or position.";
    if (!signup.username.trim()) issues.username = "Choose a unique username.";
    else if (!/^[a-z][a-z0-9._-]{3,31}$/i.test(signup.username))
      issues.username = "Use 4–32 characters starting with a letter.";
    else if (
      usernameAvailability === "unavailable" ||
      ["reviewer", "admin", "daniel.obi", "theo.adegboye"].includes(
        signup.username.toLowerCase(),
      )
    )
      issues.username =
        "That username is already claimed. Choose another username.";
    else if (usernameAvailability !== "available")
      issues.username =
        "Wait for the username availability check to show Available before continuing.";
    if (!policyAccepted)
      issues.policy =
        "Accept the identity, privacy and acceptable-use requirements before continuing.";
    const passwordIssue = passwordError(
      password,
      confirmation,
      fixturePasswordPolicy,
    );
    if (passwordIssue) {
      issues.password = passwordIssue;
      if (password && confirmation && password !== confirmation)
        issues.confirmation = "Re-enter the same password in both fields.";
    }
    setSignupErrors(issues);
    const first = Object.keys(issues)[0];
    if (first && first !== "policy") focusSignupField(first);
    return Object.keys(issues).length === 0;
  }
  function startCode(nextFlow: "recovery" | "signup") {
    if (transitionTimer.current !== null)
      window.clearTimeout(transitionTimer.current);
    setFlow(nextFlow);
    setCode("");
    setCodeState(issueDemoCode(Date.now()));
    setError("");
    setBusy(true);
    setMessage("Preparing your verification step…");
    transitionTimer.current = window.setTimeout(() => {
      transitionTimer.current = null;
      setBusy(false);
      setStage("verify");
      setMessage(
        "If the supplied details match an eligible identity, a verification message is ready. No email is sent by this demo.",
      );
    }, 180);
  }
  function enter() {
    onEnter(sessionForProfile(role));
  }
  function selectScenario(value: string) {
    setScenario(value);
    setPassword("");
    setConfirmation("");
    setError("");
    setMessage("");
    setStage(
      value === "Recovery"
        ? "recovery"
        : value === "Employee activation"
          ? "signup"
          : value === "Provisional account"
            ? "provisional"
            : value === "Temporary password"
              ? "activation"
              : value === "Expired code"
                ? "verify"
                : "signin",
    );
    if (value === "Expired code")
      setCodeState({ ...issueDemoCode(Date.now()), expiresAt: Date.now() - 1 });
  }
  async function submit() {
    if (busy) return;
    setError("");
    if (stage === "signin") {
      const blocked: Record<string, string> = {
        "Invalid credentials": "The account details could not be verified.",
        "Locked account":
          "Sign-in is temporarily locked. Contact your Daenem administrator.",
        "Rate limited": "Too many attempts. Wait before trying again.",
        "Expired temporary password":
          "Temporary access has expired. Contact your administrator.",
        "Account unavailable":
          "Sign-in is unavailable. Contact your administrator.",
        "Network unavailable":
          "The connection is unavailable. Your entries remain on this screen.",
        "Location required":
          "Your assigned policy requires location validation. No device location is collected in this preview.",
        "Outside geofence":
          "Sign-in cannot continue from the simulated location. Contact your administrator.",
      };
      if (blocked[scenario]) {
        setError(blocked[scenario]);
        return;
      }
      if (!username.trim() || !password) {
        setError("Enter your username or email and password.");
        return;
      }
      setBusy(true);
      setMessage("Opening your fictional preview…");
      setTimeout(() => {
        setBusy(false);
        enter();
      }, 350);
      return;
    }
    if (stage === "recovery") {
      if (recoveryStep === "company") {
        if (!recoveryCompany) {
          setError("Select your company to continue.");
          return;
        }
        setRecoveryStep("identifier");
        setMessage("Company selected. Enter your username or email to load the permitted recovery methods.");
        return;
      }
      if (recoveryStep === "identifier") {
        await loadRecoveryOptions();
        return;
      }
      if (recoveryStep === "method") {
        await requestRecoveryCode();
        return;
      }
      setError("Choose a recovery channel before requesting a code.");
      return;
    }
    if (stage === "signup") {
      if (signup.employeeId.trim().toLowerCase() === "dn-0104") {
        setSignupErrors({
          employeeId:
            "That employee reference is already claimed. Confirm it with an administrator or leave it blank.",
        });
        focusSignupField("employeeId");
        return;
      }
      if (!validateSignup()) {
        setError(
          "Review the highlighted fields before continuing to verification.",
        );
        return;
      }
      startCode("signup");
      return;
    }
    if (stage === "verify") {
      if (flow === "recovery") {
        await verifyRecoveryCode();
        return;
      }
      const result = verifyDemoCode(code, codeState, Date.now());
      setCodeState(result.state);
      if (result.error) {
        setError(result.error);
        return;
      }
      move(flow === "signup" ? "provisional" : "password");
      return;
    }
    if (stage === "activation") {
      if (!username.trim() || !password) {
        setError("Enter your assigned identity and temporary password.");
        return;
      }
      setPreviousPassword(password);
      setPassword("");
      setConfirmation("");
      setCodeState({
        ...issueDemoCode(Date.now()),
        verified: true,
        resetExpiresAt: Date.now() + 300000,
      });
      move("password");
      return;
    }
    if (stage === "password") {
      if (!canResetPassword(codeState, Date.now())) {
        setError("Reset authorization has expired. Restart account recovery.");
        return;
      }
      const err = passwordError(
        password,
        confirmation,
        fixturePasswordPolicy,
        previousPassword,
      );
      if (err) {
        setError(err);
        return;
      }
      setPassword("");
      setConfirmation("");
      setPreviousPassword("");
      setCodeState({ ...codeState, verified: false });
      move("success");
      return;
    }
  }
  const newPassword = stage === "password" || stage === "signup";
  const passwordFields = (
    <>
      <label className="p-field">
        {newPassword ? "New Password" : "Password"}
        <span className="v3-password">
          <input
            ref={(element) => {
              signupFieldRefs.current.password = element;
            }}
            aria-label={newPassword ? "New Password" : "Password"}
            aria-invalid={newPassword && !!signupErrors.password}
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setSignupErrors((current) => {
                const next = { ...current };
                delete next.password;
                return next;
              });
            }}
            autoComplete="off"
            aria-describedby={
              newPassword
                ? [
                    "v3-password-requirements",
                    signupErrors.password ? "v3-signup-password-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : undefined
            }
          />
          <button
            type="button"
            aria-label={show ? "Hide Password" : "Show Password"}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
        {newPassword && signupErrors.password && (
          <small id="v3-signup-password-error" role="alert">
            {signupErrors.password}
          </small>
        )}
      </label>
      {newPassword && (
        <>
          <div
            className="v3-password-meter"
            aria-label={
              password
                ? `${rules.filter((r) => r.valid).length} of ${rules.length} requirements met`
                : "Password not entered"
            }
          >
            {rules.map((r) => (
              <i key={r.id} className={password && r.valid ? "valid" : ""} />
            ))}
          </div>
          <ul id="v3-password-requirements" className="v3-requirements">
            {rules.map((r) => (
              <li
                key={r.id}
                className={
                  password ? (r.valid ? "valid" : "invalid") : "neutral"
                }
              >
                {password && r.valid ? (
                  <Check size={14} />
                ) : (
                  <Minus size={14} />
                )}
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
          <label className="p-field">
            Confirm Password
            <input
              ref={(element) => {
                signupFieldRefs.current.confirmation = element;
              }}
              type="password"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setSignupErrors((current) => {
                  const next = { ...current };
                  delete next.confirmation;
                  return next;
                });
              }}
              autoComplete="off"
              aria-invalid={!!signupErrors.confirmation}
              aria-describedby={[
                "v3-password-match",
                signupErrors.confirmation ? "v3-signup-confirmation-error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
            {signupErrors.confirmation && (
              <small id="v3-signup-confirmation-error" role="alert">
                {signupErrors.confirmation}
              </small>
            )}
          </label>
          <p id="v3-password-match" className="v3-match" aria-live="polite">
            {confirmation
              ? password === confirmation
                ? "Passwords match."
                : "Passwords do not match."
              : "Enter the same password again."}
          </p>
        </>
      )}
    </>
  );
  const productionForm = (
    <section
      id="auth-panel-signin"
      role="tabpanel"
      aria-labelledby="auth-tab-signin"
      aria-label="Sign-in authentication"
      data-auth-mode="signin"
      className="usp-auth-panel usp-auth-panel-signin usp-auth-density-comfortable"
    >
      <div className="usp-panel-heading">
        <div>
          <span className="usp-panel-eyebrow">
            <LockKeyhole size={14} /> SECURE STAFF ACCESS
          </span>
          <h1>Sign In</h1>
          <p>
            Use your authorized email or username to enter your assigned
            workspace. Access appears only after identity and role checks.
          </p>
        </div>
        <span className="usp-mfa-chip">
          <ShieldCheck size={14} /> EXTRA VERIFICATION
        </span>
      </div>
      {message && (
        <div className="usp-auth-message success" role="status">
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="usp-auth-message error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <form
        className="usp-auth-form"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="usp-field">
          <span className="usp-field-label">Email or Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="usp-password-block">
          <label className="usp-field">
            <span className="usp-field-label">Password</span>
            <span className="usp-password-field">
              <input
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
              />
              <button
                className="usp-password-toggle"
                type="button"
                aria-label={show ? "Hide Password" : "Show Password"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <button
            type="button"
            className="usp-forgot-link"
            onClick={() => {
              resetRecovery();
              move("recovery");
            }}
          >
            Forgot Password?
          </button>
        </div>
        <label className="usp-remember-row">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span className="usp-check-ui">
            <Check size={12} />
          </span>
          <span>
            Remember Me<small>Trusted devices only</small>
          </span>
        </label>
        <button className="usp-primary-button" disabled={busy} type="submit">
          {busy ? "Signing In…" : "Sign In"}
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="usp-or-divider">
        <span />
        OR
        <span />
      </div>
      <div className="usp-social-buttons">
        <button type="button" onClick={() => setModal("Microsoft")}>
          <span className="usp-microsoft-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          Sign In with Microsoft
        </button>
        <button type="button" onClick={() => setModal("Google")}>
          <b className="usp-google-mark">G</b>Sign In with Google
        </button>
        <button
          className="usp-whatsapp-button"
          type="button"
          onClick={() => setModal("WhatsApp")}
        >
          <MessageCircle size={17} aria-hidden="true" />
          Sign In with WhatsApp
        </button>
      </div>
      <p className="usp-social-note">
        Other sign-in options are not connected yet.
      </p>
      <div className="usp-legal-copy">
        <span>By continuing, you agree to DAENEM Group&apos;s</span>
        <span className="usp-legal-actions">
          <button type="button" onClick={() => setModal("Terms")}>Terms of Use</button>
          <span aria-hidden="true">and</span>
          <button type="button" onClick={() => setModal("Privacy")}>Privacy Notice</button>
        </span>
      </div>
      <div className="usp-panel-footer">
        <span className="usp-operational-pill">
          <i /> Other sign-in options unavailable
        </span>
      </div>
    </section>
  );
  const form = (
    <section
      id={stage === "signup" ? "auth-panel-signup" : undefined}
      role={stage === "signup" ? "tabpanel" : undefined}
      aria-labelledby={stage === "signup" ? "auth-tab-signup" : undefined}
      className="v3-auth-card"
      data-auth-stage={stage}
      data-recovery-service={flow === "recovery" ? recoveryService : undefined}
      aria-label="Daenem authentication"
    >
      <div className="v3-auth-heading">
        <span className="v3-auth-symbol">
          <LockKeyhole size={23} />
        </span>
        <span className="p-kicker">DAENEM STAFF PORTAL</span>
        <h2>
          {stage === "signin"
            ? "Welcome Back."
            : stage === "recovery"
              ? recoveryStep === "verify"
                ? recoveryMethod === "whatsapp"
                  ? "Verify Your WhatsApp Contact."
                  : "Verify Your Email Address."
                : "Recover Your Account."
              : stage === "verify"
                ? "Verify Your Email."
                : stage === "password"
                  ? "A Fresh Start."
                  : stage === "signup"
                    ? "Create Your Login Identity."
                    : stage === "activation"
                      ? "Activate Your Account."
                      : stage === "provisional"
                        ? "Identity Ready. Access Pending."
                        : "Password Flow Complete."}
        </h2>
        <p>
          {stage === "signin"
            ? "Sign in to your assigned workspace."
            : stage === "recovery"
              ? recoveryStep === "company"
                ? "Choose the company that manages your account."
                : recoveryStep === "identifier"
                  ? "Enter your username or email; we will not reveal account status."
                  : recoveryStep === "method"
                    ? "Choose a permitted recovery channel for this company."
                    : recoveryMethod === "whatsapp"
                      ? "Enter the code sent to your enrolled, previously verified WhatsApp contact."
                      : "Enter the code sent to your permitted email address."
              : stage === "verify"
                ? "Enter the six-digit code from your verification message."
                : stage === "signup"
                  ? "An administrator assigns operational access after identity verification."
                  : stage === "provisional"
                    ? "Your identity is provisional. Operational workspaces appear only after authorized assignment."
                    : stage === "success"
                      ? "Prior demo sessions are considered revoked. Sign in again to continue."
                      : "Follow your configured Daenem security policy."}
        </p>
      </div>
      {stage === "provisional" ? (
        <>
          <Callout tone="neutral" title="Awaiting authorized assignment">
            Provisional identity never grants operational modules, reports,
            employee data or business metrics. Access appears only after an
            authorized assignment.
          </Callout>
          <Btn className="v3-submit" onClick={() => move("signin")}>
            Return to sign-in
          </Btn>
        </>
      ) : stage === "success" ? (
        <>
          <Badge>Local simulation · No password changed</Badge>
          <Btn className="v3-submit" onClick={() => move("signin")}>
            Sign in again
            <ArrowRight size={17} />
          </Btn>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {["signup", "password"].includes(stage) && (
            <Btn
              className="v15-signup-primary"
              type="submit"
              disabled={busy}
              aria-busy={busy}
            >
              {busy && stage === "signup"
                ? "Preparing Verification…"
                : stage === "signup"
                  ? "Continue to Verification"
                  : "Save Demo Password"}
              <ArrowRight size={17} />
            </Btn>
          )}
          {stage === "signup" && Object.keys(signupErrors).length > 0 && (
            <div
              className="v3-signup-errors"
              role="alert"
              aria-live="assertive"
            >
              <strong>Review these fields before continuing:</strong>
              <ul>
                {Object.entries(signupErrors).map(([field, text]) => (
                  <li key={field}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {stage === "recovery" && recoveryStep === "company" && (
            <label className="p-field">
              Company
              <select
                className="v43-recovery-select"
                value={recoveryCompany}
                onChange={(event) => {
                  setRecoveryCompany(event.target.value);
                  setError("");
                }}
                aria-label="Recovery company"
              >
                <option value="">Select your company</option>
                {RECOVERY_COMPANIES.map((company) => (
                  <option key={company.id} value={company.id}>{company.label}</option>
                ))}
              </select>
            </label>
          )}
          {["signin", "activation"].includes(stage) || (stage === "recovery" && recoveryStep !== "company") ? (
            <label className="p-field">
              Username or Email
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                placeholder="Your Daenem username or email"
              />
            </label>
          ) : null}
          {stage === "signup" && (
            <>
              <div className="v3-form-pair">
                <label className="p-field">
                  Legal / Full Name
                  <input
                    ref={(element) => {
                      signupFieldRefs.current.name = element;
                    }}
                    value={signup.name}
                    onChange={(e) => updateSignup("name", e.target.value)}
                    required
                    autoComplete="name"
                    aria-invalid={!!signupErrors.name}
                    aria-describedby={
                      signupErrors.name ? "v3-signup-name-error" : undefined
                    }
                  />
                  {signupErrors.name && (
                    <small id="v3-signup-name-error" role="alert">
                      {signupErrors.name}
                    </small>
                  )}
                </label>
                <label className="p-field">
                  Phone Number
                  <input
                    ref={(element) => {
                      signupFieldRefs.current.phone = element;
                    }}
                    value={signup.phone}
                    onChange={(e) => updateSignup("phone", e.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="+234 …"
                    aria-invalid={!!signupErrors.phone}
                    aria-describedby={
                      signupErrors.phone ? "v3-signup-phone-error" : undefined
                    }
                  />
                  {signupErrors.phone && (
                    <small id="v3-signup-phone-error" role="alert">
                      {signupErrors.phone}
                    </small>
                  )}
                </label>
              </div>
              <label className="p-field">
                Email
                <input
                  ref={(element) => {
                    signupFieldRefs.current.email = element;
                  }}
                  type="email"
                  value={signup.email}
                  onChange={(e) => updateSignup("email", e.target.value)}
                  required
                  autoComplete="email"
                  aria-invalid={!!signupErrors.email}
                  aria-describedby={[
                    "v15-email-availability",
                    signupErrors.email ? "v3-signup-email-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                {signupErrors.email && (
                  <small id="v3-signup-email-error" role="alert">
                    {signupErrors.email}
                  </small>
                )}
                <span id="v15-email-availability">
                  <Availability
                    state={emailAvailability}
                    subject="email"
                  />
                </span>
              </label>
              <label className="p-field">
                Requested Company
                <select
                  ref={(element) => {
                    signupFieldRefs.current.company = element;
                  }}
                  value={signup.company}
                  onChange={(event) => updateSignup("company", event.target.value)}
                  required
                  aria-invalid={!!signupErrors.company}
                  aria-describedby={
                    signupErrors.company ? "v3-signup-company-error" : undefined
                  }
                >
                  <option value="">Select A Company</option>
                  {RECOVERY_COMPANIES.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.label}
                    </option>
                  ))}
                </select>
                {signupErrors.company && (
                  <small id="v3-signup-company-error" role="alert">
                    {signupErrors.company}
                  </small>
                )}
              </label>
              <div className="v3-form-pair">
                <label className="p-field">
                  Department / Work Area
                  <input
                    ref={(element) => {
                      signupFieldRefs.current.department = element;
                    }}
                    value={signup.department}
                    onChange={(e) => updateSignup("department", e.target.value)}
                    required
                    placeholder="e.g. Operations"
                    aria-invalid={!!signupErrors.department}
                    aria-describedby={
                      signupErrors.department
                        ? "v3-signup-department-error"
                        : undefined
                    }
                  />
                  {signupErrors.department && (
                    <small id="v3-signup-department-error" role="alert">
                      {signupErrors.department}
                    </small>
                  )}
                </label>
                <label className="p-field">
                  Job / Position
                  <input
                    ref={(element) => {
                      signupFieldRefs.current.position = element;
                    }}
                    value={signup.position}
                    onChange={(e) => updateSignup("position", e.target.value)}
                    required
                    placeholder="e.g. Production Coordinator"
                    aria-invalid={!!signupErrors.position}
                    aria-describedby={
                      signupErrors.position
                        ? "v3-signup-position-error"
                        : undefined
                    }
                  />
                  {signupErrors.position && (
                    <small id="v3-signup-position-error" role="alert">
                      {signupErrors.position}
                    </small>
                  )}
                </label>
              </div>
              <label className="p-field">
                Choose Unique Username
                <input
                  ref={(element) => {
                    signupFieldRefs.current.username = element;
                  }}
                  value={signup.username}
                  onChange={(e) => updateSignup("username", e.target.value)}
                  required
                  autoComplete="username"
                  aria-describedby={[
                    "v15-username-availability",
                    signupErrors.username ? "v3-signup-username-error" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={!!signupErrors.username}
                />
                {signupErrors.username && (
                  <small id="v3-signup-username-error" role="alert">
                    {signupErrors.username}
                  </small>
                )}
                <span id="v15-username-availability">
                  <Availability
                    state={usernameAvailability}
                    subject="username"
                  />
                </span>
              </label>
              <label className="p-field">
                Existing Employee Reference <small>Optional Claim</small>
                <input
                  ref={(element) => {
                    signupFieldRefs.current.employeeId = element;
                  }}
                  value={signup.employeeId}
                  onChange={(e) => updateSignup("employeeId", e.target.value)}
                  placeholder="e.g. DN-0104"
                  aria-invalid={!!signupErrors.employeeId}
                  aria-describedby={
                    signupErrors.employeeId
                      ? "v3-signup-employee-error"
                      : undefined
                  }
                />
                {signupErrors.employeeId && (
                  <small id="v3-signup-employee-error" role="alert">
                    {signupErrors.employeeId}
                  </small>
                )}
              </label>
              <p className="v3-note">
                Employee references start a claim review; they do not grant
                access. Duplicate matching, email verification and administrator
                assignment remain separate gates. Creating an identity never
                grants operational modules.
              </p>
              <label className="p-check v3-policy-check">
                <Checkbox
                  checked={policyAccepted}
                  onCheckedChange={(v) => {
                    setPolicyAccepted(v === true);
                    setSignupErrors((current) => {
                      const next = { ...current };
                      delete next.policy;
                      return next;
                    });
                  }}
                />
                I agree to the current Daenem identity, privacy and
                acceptable-use requirements for this request.
              </label>
              {signupErrors.policy && (
                <small id="v3-signup-policy-error" role="alert">
                  {signupErrors.policy}
                </small>
              )}
            </>
          )}
          {stage === "recovery" && recoveryStep === "method" && (
            <div className="v43-recovery-methods" role="radiogroup" aria-label="Permitted account recovery methods">
              <div className="v43-recovery-policy-note">
                <ShieldCheck size={15} />
                <span><strong>{recoveryPolicy ? recoveryPolicyLabel[recoveryPolicy] : "Permitted recovery methods"}</strong><small>Only an enrolled and previously verified contact can receive a recovery code.</small></span>
              </div>
              {recoveryMethods.length ? recoveryMethods.map((method) => (
                <button
                  type="button"
                  key={method}
                  className={`v43-recovery-method ${recoveryMethod === method ? "selected" : ""}`}
                  role="radio"
                  aria-checked={recoveryMethod === method}
                  onClick={() => setRecoveryMethod(method)}
                >
                  <span className="v43-recovery-method-icon">{method === "whatsapp" ? "WA" : "@"}</span>
                  <span><strong>{method === "whatsapp" ? "WhatsApp" : "Email"}</strong><small>{method === "whatsapp" ? "Enrolled, previously verified WhatsApp contact" : "Permitted account email address"}</small></span>
                  <span className="v43-recovery-radio" aria-hidden="true" />
                </button>
              )) : (
                <Callout tone="neutral" title="Recovery options unavailable">The identity service did not return a permitted channel. No account status is disclosed, and no request was sent.</Callout>
              )}
            </div>
          )}
          {["signin", "activation", "password", "signup"].includes(stage) &&
            passwordFields}
          {stage === "verify" && (
            <>
              <div className="v3-code">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  aria-label={flow === "recovery" ? `${recoveryMethod === "whatsapp" ? "WhatsApp" : "Email"} recovery verification code` : "Email verification code"}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot index={i} key={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <p className="v3-note">
                {flow === "recovery"
                  ? `${recoveryMethod === "whatsapp" ? "WhatsApp" : "Email"} verification · codes expire according to the identity service policy.`
                  : `Local preview code: 246810 · ${Math.max(0, 3 - codeState.attempts)} attempts remaining.`}
              </p>
              <Btn
                variant="quiet"
                disabled={now < codeState.nextResendAt}
                onClick={() => {
                  if (flow === "recovery") {
                    void requestRecoveryCode();
                    return;
                  }
                  setCodeState(issueDemoCode(Date.now()));
                  setCode("");
                  setError("");
                  setMessage("A fresh local demo verification window is ready. No email was sent.");
                }}
              >
                {now < codeState.nextResendAt
                  ? `Resend in ${Math.ceil((codeState.nextResendAt - now) / 1000)}s`
                  : flow === "recovery" ? "Resend verification code" : "Resend code"}
              </Btn>
            </>
          )}
          {stage === "signin" && (
            <>
              <div className="v3-auth-options">
                <label className="p-check">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                  />
                  Remember Me
                </label>
                <button
                  type="button"
                  className="p-inline-link"
                  onClick={() => {
                    resetRecovery();
                    move("recovery");
                  }}
                >
                  Forgot Password?
                </button>
              </div>
              <label className="p-check v3-trusted">
                <Checkbox
                  checked={trusted}
                  onCheckedChange={(v) => setTrusted(v === true)}
                />
                Trust This Device <small>Demo Preference</small>
              </label>
            </>
          )}
          {message && (
            <p className="v3-form-message" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="p-form-error" role="alert">
              {error}
            </p>
          )}
          <Btn
            className="v3-submit"
            type="submit"
            disabled={busy || (stage === "recovery" && recoveryStep === "method" && !recoveryMethod)}
            aria-busy={busy}
          >
            {busy
              ? "Opening Preview…"
              : stage === "signin"
                ? "Sign In"
                : stage === "recovery"
                  ? recoveryStep === "company"
                    ? "Continue"
                    : recoveryStep === "identifier"
                      ? "Load Recovery Methods"
                      : recoveryStep === "method"
                        ? "Send Verification Code"
                        : "Continue Recovery"
                  : stage === "verify"
                    ? "Verify Code"
                    : stage === "signup"
                      ? "Continue to Verification"
                      : stage === "activation"
                        ? "Verify Temporary Access"
                        : "Save Demo Password"}
            <ArrowRight size={18} />
          </Btn>
          {stage !== "signin" && (
            <Btn
              variant="quiet"
              onClick={() => move("signin")}
              aria-label="Back To Sign In"
            >
              <ArrowLeft size={15} />
              Back To Sign In
            </Btn>
          )}
        </form>
      )}
      {stage === "signin" && (
        <>
          <div className="v3-federation">
            <span>OPTIONAL FEDERATED ACCESS</span>
            <div>
              <button onClick={() => setModal("Microsoft")}>
                <span className="v3-microsoft" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                Microsoft
              </button>
              <button onClick={() => setModal("Google")}>
                <Globe2 size={18} />
                Google
              </button>
            </div>
            <small>Configured Provider Required</small>
          </div>
          <button
            className="v3-activation-link"
            onClick={() => {
              setPassword("");
              setConfirmation("");
              move("signup");
            }}
          >
            Create Account / Claim Employee Identity
            <ArrowRight size={14} />
          </button>
        </>
      )}
      <div className="v3-security-note">
        <ShieldCheck size={16} />
        <span>Daenem identity. Assigned access. Protected information.</span>
      </div>
      <PublishFreshness />
      <details className="v3-review-controls">
        <summary>Development preview only</summary>
        <p>
          Fictional state simulator. Do not enter real credentials or personal
          information.
        </p>
        <label className="p-field">
          Sign-in experience
          <Pick
            label="Sign-in experience"
            value={presetId}
            onChange={(value) => {
              setPresetId(value);
              setUnifiedRecord(unifiedThemeById(value));
            }}
            options={signInPresets.map((p) => ({ value: p.id, label: p.name }))}
          />
        </label>
        <label className="p-field">
          Authentication scenario
          <Pick
            label="Authentication scenario"
            value={scenario}
            onChange={selectScenario}
            options={authenticationScenarios}
          />
        </label>
        <label className="p-field">
          Preview role
          <Pick
            label="Preview role"
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={["Owner", "Manager", "Employee"]}
          />
        </label>
        <Btn variant="outline" onClick={enter}>
          Open isolated {role} preview
        </Btn>
        <small>
          Bypasses only the fictional form, not the Site’s access control.
        </small>
      </details>
    </section>
  );
  const modalDialog = (
    <Dialog open={!!modal} onOpenChange={(v) => !v && setModal(null)}>
      <DialogContent className="p-modal">
        <DialogTitle>
          {modal === "Install"
            ? "Install Daenem ERP App"
            : modal === "Terms"
              ? "Terms of Use"
              : modal === "Privacy"
                ? "Privacy Notice"
                : `${modal} Authentication`}
        </DialogTitle>
        <DialogDescription>
          {modal === "Install"
            ? "Desktop, tablet and mobile installation depends on browser and platform support. This preview does not provide native background location, push delivery or production offline synchronization."
            : modal === "Terms"
              ? "Staff Portal access is limited to authorized work, assigned access and DAENEM policies. The approved Terms of Use remain the authority."
              : modal === "Privacy"
                ? "Identity and access data must be used only for authorized Staff Portal work. This page does not display personal records or replace the approved Privacy Notice."
            : modal === "WhatsApp"
              ? "WhatsApp sign-in is not connected yet and requires an enrolled, previously verified contact. This page never reveals whether an account exists."
              : "This sign-in option is not connected yet. When available, it will still use your Daenem account and assigned access."}
        </DialogDescription>
        <Callout
          tone="neutral"
          title={
            modal === "Install"
              ? "Install prompt unavailable"
              : modal === "Terms" || modal === "Privacy"
                ? "Information only"
              : modal === "WhatsApp"
                ? "WhatsApp sign-in unavailable"
              : "Sign-in option unavailable"
          }
        >
          {modal === "Terms" || modal === "Privacy"
            ? "No legal acceptance event or production account action is recorded by opening this preview notice."
            : "No external account connection, verification message, application installation or production action has been performed."}
        </Callout>
      </DialogContent>
    </Dialog>
  );
  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
    } else setModal("Install");
  };
  const identityProps = {
    "data-theme-id": unifiedRecord.THEME_ID,
    "data-theme-source": unifiedRecord.SOURCE_PROVENANCE,
    "data-theme-display-name": unifiedRecord.DISPLAY_NAME,
    "data-source-commit": RENDERED_SOURCE_COMMIT,
    "data-site-identity": "daenem-staff-portal",
    "data-auth-renderer": "staff-portal-auth-v3",
    "data-auth-route": "/signin",
    "data-brand-context": "DAENEM STAFF PORTAL",
    "data-signin-ready": signinReady ? "true" : "false",
    "data-loading-shell-absent": signinReady ? "true" : "false",
  } as const;
  const authTabs = (stage === "signin" || stage === "signup") && (
    <div
      className={`usp-tabs usp-tabs-auth ${stage === "signup" ? "usp-tabs-signup" : ""}`}
      role="tablist"
      aria-label="Authentication options"
    >
      <button
        id="auth-tab-signin"
        type="button"
        className={stage === "signin" ? "active" : undefined}
        role="tab"
        aria-selected={stage === "signin"}
        aria-controls={stage === "signin" ? "auth-panel-signin" : undefined}
        tabIndex={stage === "signin" ? 0 : -1}
        onClick={() => activateAuthTab("signin")}
        onKeyDown={handleAuthTabKeyDown}
      >
        Sign In
      </button>
      <button
        id="auth-tab-signup"
        type="button"
        className={stage === "signup" ? "active" : undefined}
        role="tab"
        aria-selected={stage === "signup"}
        aria-controls={stage === "signup" ? "auth-panel-signup" : undefined}
        tabIndex={stage === "signup" ? 0 : -1}
        onClick={() => activateAuthTab("signup")}
        onKeyDown={handleAuthTabKeyDown}
      >
        Create Account
      </button>
    </div>
  );
  const resolvedAuth = (
    <div className="usp-auth-stack">
      {authTabs}
      {stage === "signup" && (
        <button
          className="usp-whatsapp-account"
          type="button"
          onClick={() => setModal("WhatsApp")}
        >
          <MessageCircle size={17} aria-hidden="true" />
          Create Account with WhatsApp
        </button>
      )}
      {stage === "signin" ? productionForm : form}
    </div>
  );
  if (
    unifiedRecord.RENDERER_FAMILY === "STAFFPORTAL_EXACT" ||
    unifiedRecord.RENDERER_FAMILY === "WEBFLOW_HOME"
  )
    return (
      <div
        className="v3-auth usp-production-host"
        {...identityProps}
        aria-busy={!signinReady}
        data-theme-definition={unifiedRecord.THEME_ID}
        data-source-provenance={unifiedRecord.SOURCE_PROVENANCE}
        id="main-content"
      >
        <UnifiedSignInRenderer
          record={unifiedRecord}
          now={new Date(now)}
          auth={resolvedAuth}
          search={<SafeSpotlight navigate={move} />}
          onInstall={() => void install()}
        />
        {modalDialog}
      </div>
    );
  return (
    <div
      className={`v3-auth sf-immersive s17-shell sf-${runtimeTheme.baseArtDirection} ${preset.night ? "sf-night" : "sf-day"}`}
      {...identityProps}
      aria-busy={!signinReady}
      data-theme-definition={unifiedRecord.THEME_ID}
      data-theme-version={runtimeTheme.version}
      data-source-provenance={unifiedRecord.SOURCE_PROVENANCE}
      id="main-content"
    >
      <header className="v3-brand">
        <Logo large />
        <PublicStatus />
        <button
          aria-label="Install Daenem ERP App"
          onClick={() => void install()}
        >
          <Download size={16} />
          <span>Install Daenem ERP App</span>
        </button>
      </header>
      <div className="sf-composition">
        <UnifiedSignInRenderer
          record={unifiedRecord}
          runtimeTheme={runtimeTheme}
          now={new Date(now)}
          auth={form}
          search={<SafeSpotlight navigate={move} />}
        />
      </div>
      <footer className="v3-auth-footer">
        <span className="s17-footer-owner">© 2026 Daenem Group</span>
        <span className="s17-mobile-freshness">
          <PublishFreshness />
        </span>
        <span className="s17-footer-review">
          Design review · Fictional authentication
        </span>
        <a href="/signin-credits.html">Imagery & credits</a>
      </footer>
      {modalDialog}
    </div>
  );
}
