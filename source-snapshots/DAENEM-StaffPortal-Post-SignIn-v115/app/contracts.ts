export type ContractRow = {
  route: string;
  page: string;
  scope: string;
  authorizedUsers: string;
  currentPurpose: string;
  functionalRequirements: string;
  primaryActions: string;
  secondaryActions: string;
  dataRequired: string;
  emptyState: string;
  loadingState: string;
  errorState: string;
  offlineState: string;
  permissionDeniedState: string;
  unavailableIntegrationState: string;
  uniqueDesignArchetype: string;
  uniqueHero: string;
  uniqueInformationStructure: string;
  uniqueDataVisualization: string;
  uniqueInteractionSignature: string;
  techieGoodie: string;
  mobileComposition: string;
  tabletComposition: string;
  desktop4kComposition: string;
};

type ContractSeed = Partial<ContractRow> & Pick<ContractRow, "route" | "page" | "scope">;

const stateDefaults = {
  emptyState: "No authorized records; explain the scope and the next allowed action.",
  loadingState: "Skeleton only in the active region; keep navigation and context stable.",
  errorState: "Inline retry with endpoint-level messaging; never replace an error with fixture truth.",
  offlineState: "Show cached/stale state and open Sync Activity; preserve only the source-approved local work.",
  permissionDeniedState: "No menu, route, API data, or action; retained shell references say Permission Required.",
  unavailableIntegrationState: "Name the unavailable integration and disable dependent actions without implying success.",
};

const globalDefaults = {
  authorizedUsers: "Server-authorized session; visibility follows company, role, scope, and individual override.",
  currentPurpose: "Source-defined purpose retained; this lab adjusts presentation only.",
  functionalRequirements: "Preserve server-derived auth, RBAC, navigation, API contracts, responsive behavior, and honest data states.",
  primaryActions: "Use the existing primary action for the surface; keep it reachable at every breakpoint.",
  secondaryActions: "Contextual help, refresh, filters, and existing secondary actions only.",
  dataRequired: "Only authorized Staff Portal data; design fixture values are labeled and never runtime truth.",
  uniqueInformationStructure: "A purpose-built composition with progressive disclosure instead of a repeated KPI/card/table template.",
  mobileComposition: "Priority-first stack; bottom sheet or drill-down for secondary context; no horizontal overflow.",
  tabletComposition: "Two-column working canvas with a collapsible context rail.",
  desktop4kComposition: "Use the additional width for context, comparison, and inspection without creating a narrow island.",
};

function makeContract(seed: ContractSeed): ContractRow {
  return {
    ...globalDefaults,
    ...stateDefaults,
    uniqueDesignArchetype: "Purpose-built workspace",
    uniqueHero: "Contextual status strip tied to the user's current job",
    uniqueDataVisualization: "Use the visualization already supported by the source data; show Not Available when disconnected.",
    uniqueInteractionSignature: "Contextual drill-down with visible focus and reversible state",
    techieGoodie: "Data freshness, cached/live state, and keyboard-accessible command affordance",
    ...seed,
  };
}

const authContracts: ContractSeed[] = [
  {
    route: "/ (auth:signin)",
    page: "Secure Sign In",
    scope: "Global / Auth",
    authorizedUsers: "Unauthenticated users with a valid account or approved trusted-device path.",
    currentPurpose: "Authenticate a Staff Portal session before any workspace is exposed.",
    functionalRequirements: "Identifier/password, remember/trusted device, password visibility, password policy, unavailable social sign-in message, legal links, and server-derived session creation.",
    primaryActions: "Sign in",
    secondaryActions: "Forgot password, create account, show password, Microsoft/Google unavailable notice.",
    dataRequired: "Auth response and server session only; no business data.",
    uniqueDesignArchetype: "Secure daylight entryway",
    uniqueHero: "Sunlit identity rail with clear trust and session posture",
    uniqueInformationStructure: "One focused credential task with reassurance and recovery beside it",
    uniqueDataVisualization: "Password strength and policy meter",
    uniqueInteractionSignature: "Progressive reveal from identifier to trusted session",
    techieGoodie: "Device identity and no-store session boundary shown as a trust chip",
    mobileComposition: "Single-column credential card with reachable recovery actions.",
    tabletComposition: "Credential card plus compact identity rail.",
    desktop4kComposition: "Split identity narrative and focused sign-in surface with generous reading width.",
  },
  {
    route: "/ (auth:signup)",
    page: "Create Account",
    scope: "Global / Auth",
    authorizedUsers: "Unauthenticated users allowed to start the server-defined signup flow.",
    currentPurpose: "Start, verify, and complete an employee account request.",
    functionalRequirements: "Identity, account, work, and email verification steps; password strength; department/job title/role fields; server validation.",
    primaryActions: "Continue signup step",
    secondaryActions: "Back, show password, return to sign in.",
    dataRequired: "Signup challenge, password policy, and submitted identity/work fields.",
    uniqueDesignArchetype: "Guided onboarding ribbon",
    uniqueHero: "Four-step daylight progress ribbon",
    uniqueInformationStructure: "One step at a time with preserved context and explicit verification",
    uniqueDataVisualization: "Step completion and password-strength state",
    uniqueInteractionSignature: "Keyboard-friendly step transition with validation before advance",
    techieGoodie: "Trust-aware field status and resumable verification context",
    mobileComposition: "Step card with bottom-fixed continuation action.",
    tabletComposition: "Step card with visible progress rail.",
    desktop4kComposition: "Wide progress rail and focused form canvas; no decorative dashboard density.",
  },
  {
    route: "/ (auth:forgot-password)",
    page: "Recover Access",
    scope: "Global / Auth",
    authorizedUsers: "Unauthenticated users who can provide a recognized recovery identifier.",
    currentPurpose: "Verify identity and reset a password without exposing account truth.",
    functionalRequirements: "Identity, verification, reset steps; password policy/status; safe error messaging; no account enumeration.",
    primaryActions: "Verify recovery code / reset password",
    secondaryActions: "Back, return to sign in, show password.",
    dataRequired: "Recovery challenge and password policy only.",
    uniqueDesignArchetype: "Recovery checkpoint",
    uniqueHero: "Calm recovery status line with explicit security posture",
    uniqueInformationStructure: "Three controlled checkpoints with no business context leakage",
    uniqueDataVisualization: "Reset readiness meter",
    uniqueInteractionSignature: "Masked verification and clear checkpoint transitions",
    techieGoodie: "Security-safe state copy and retry affordance",
    mobileComposition: "Single checkpoint card; code fields use large touch targets.",
    tabletComposition: "Checkpoint card with security guidance column.",
    desktop4kComposition: "Focused recovery workbench centered in an airy trust frame.",
  },
];

const globalViewContracts: ContractSeed[] = [
  {
    route: "view:overview",
    page: "Group Overview / Staff Home",
    scope: "Global / Business-aware",
    currentPurpose: "Owner-first and role-aware command view for workforce health, attention, and next actions.",
    functionalRequirements: "Canonical dashboard adapter, summary refresh, weather/context, widget ordering, command palette, notifications, AI entry point, company scope, and online/offline state.",
    primaryActions: "Open the highest-priority authorized next action",
    secondaryActions: "Switch workspace, customize widgets, open tasks/approvals, ask AI, open Sync Activity.",
    uniqueDesignArchetype: "Executive Command",
    uniqueHero: "Daylight command halo that frames attention, scope, and data freshness",
    uniqueInformationStructure: "Priority orbit → attention queue → cross-business context → optional detail",
    uniqueDataVisualization: "Attendance trend, workspace health bands, attention queue, and summary status",
    uniqueInteractionSignature: "Select a priority signal to expand the supporting evidence rail",
    techieGoodie: "Command palette plus live/cached/stale freshness ribbon",
    mobileComposition: "Priority signal first; trends become swipe-free stacked mini-panels; bottom action dock.",
    tabletComposition: "Command halo with two-column attention and work context.",
    desktop4kComposition: "Expand the command field into a wide decision surface with a persistent evidence rail.",
  },
  {
    route: "view:people",
    page: "People & Payroll",
    scope: "Global / Staff ERP",
    currentPurpose: "Entry surface for authorized employee, attendance, payroll, and self-service workspaces.",
    functionalRequirements: "Permission-filtered navigation and module launch; no unauthorized people or payroll fields.",
    primaryActions: "Open the relevant people or payroll workspace",
    secondaryActions: "Search authorized modules, profile/help, notifications.",
    uniqueDesignArchetype: "People operations atlas",
    uniqueHero: "Human-centered roster horizon with scoped workforce status",
    uniqueInformationStructure: "People scope → operational queues → self-service shortcuts",
    uniqueDataVisualization: "Role/scope bands and queue counts only when authorized",
    uniqueInteractionSignature: "Contextual module reveal from the roster horizon",
    techieGoodie: "Scope chip explains why a module or record is visible",
  },
  {
    route: "view:forms",
    page: "Forms Center",
    scope: "Global / Staff ERP",
    currentPurpose: "Find, assign, submit, and track authorized forms and submissions.",
    functionalRequirements: "Forms catalog, assignment, dynamic fields, submission, and offline draft behavior.",
    primaryActions: "Start or resume an authorized form",
    secondaryActions: "Filter, inspect assignment, save draft, open submission history.",
    uniqueDesignArchetype: "Document workspace",
    uniqueHero: "Form stack with completion and sync provenance",
    uniqueInformationStructure: "Assigned forms → in-progress drafts → submissions",
    uniqueDataVisualization: "Completion rings and draft/synced state markers",
    uniqueInteractionSignature: "Field-level progress with safe resume",
    techieGoodie: "Offline draft badge with Sync Activity link",
  },
  {
    route: "view:facilities",
    page: "Facilities",
    scope: "Global / Finance & Operations",
    currentPurpose: "Monitor authorized assets, readings, maintenance, and work orders.",
    functionalRequirements: "Facilities overview/catalog/assets/readings/work orders/update with permission gates.",
    primaryActions: "Inspect an asset or update a work order",
    secondaryActions: "Add asset, filter by status, open readings, refresh.",
    uniqueDesignArchetype: "Resource explorer",
    uniqueHero: "Asset condition ribbon over a daylight maintenance field",
    uniqueInformationStructure: "Condition → active work → asset detail",
    uniqueDataVisualization: "Condition bands and maintenance timeline",
    uniqueInteractionSignature: "Asset hover/selection opens contextual inspection rail",
    techieGoodie: "Data freshness and maintenance dependency badges",
  },
  {
    route: "view:broadcasts",
    page: "Broadcast Center",
    scope: "Global / Communications",
    currentPurpose: "Draft, approve, schedule, deliver, and acknowledge scoped notices and emergencies.",
    functionalRequirements: "Draft-first communication, audience/company/location/department/role targeting, WAT schedule/expiry, approval, push/ack behavior, AI Daily Word.",
    primaryActions: "Draft a scoped notice",
    secondaryActions: "Review, schedule, acknowledge, edit/regenerate, open delivery status.",
    uniqueDesignArchetype: "Communication center",
    uniqueHero: "Audience lens showing who can receive a message",
    uniqueInformationStructure: "Draft → audience → approval/delivery → acknowledgement",
    uniqueDataVisualization: "Delivery funnel and acknowledgement pulse",
    uniqueInteractionSignature: "Audience preview before the send decision",
    techieGoodie: "AI draft sidecar with explicit preview/approve boundary",
  },
  {
    route: "view:security",
    page: "Security Center",
    scope: "Global / Controls",
    currentPurpose: "Entry surface for access, sessions, monitoring, audit, and owner controls.",
    functionalRequirements: "Permission-filtered security modules, separated audit/security logs, safe support actions, and no secret exposure.",
    primaryActions: "Open the relevant security or access workspace",
    secondaryActions: "Review activity, inspect session status, open support/help.",
    uniqueDesignArchetype: "Trust observatory",
    uniqueHero: "Layered trust posture with clean authorization boundaries",
    uniqueInformationStructure: "Threat/health posture → control families → evidence",
    uniqueDataVisualization: "Activity timeline and connection health strip",
    uniqueInteractionSignature: "Evidence drill-down with redacted and scoped fields",
    techieGoodie: "Audit provenance and session freshness indicators",
  },
  {
    route: "view:help",
    page: "AI Guide",
    scope: "Global / Guidance",
    currentPurpose: "Search authorized product functions, answer contextual questions, and guide next steps.",
    functionalRequirements: "Guide catalog, history, progress, related help, contextual AI answers, and honest unavailable-data messaging.",
    primaryActions: "Ask for guidance about the current workspace",
    secondaryActions: "Search catalog, open history, inspect related guidance.",
    uniqueDesignArchetype: "Workflow guidance studio",
    uniqueHero: "Context-aware guidance beam anchored to the current task",
    uniqueInformationStructure: "Question → answer → next allowed action → related help",
    uniqueDataVisualization: "Progress map of learned/visited functions",
    uniqueInteractionSignature: "Explain-this-workflow action beside the relevant control",
    techieGoodie: "AI sidecar explicitly distinguishes guidance from authoritative data",
  },
  {
    route: "/__canonical_baseline",
    page: "Canonical Baseline Fixture",
    scope: "Development-only / Canonical",
    authorizedUsers: "Only when VITE_CANONICAL_BASELINE=true; not a production route.",
    currentPurpose: "Render the exact approved baseline fixture for visual comparison.",
    functionalRequirements: "Preserve the source's dev-only guard and canonical visual checkpoint.",
    primaryActions: "Compare baseline zones",
    secondaryActions: "Return to the design lab.",
    dataRequired: "Design fixture only.",
    uniqueDesignArchetype: "Reference comparison board",
    uniqueHero: "Frozen checkpoint frame",
    uniqueInformationStructure: "Baseline zones with explicit comparison notes",
    uniqueDataVisualization: "Reference-only zone map",
    uniqueInteractionSignature: "Side-by-side compare without mutating app logic",
    techieGoodie: "Checkpoint label and source SHA provenance",
  },
];

const moduleSeeds: Array<ContractSeed & {
  id: string;
  modulePurpose: string;
  action: string;
  archetype: string;
  hero: string;
  visualization: string;
  interaction: string;
  techie: string;
}> = [
  { id: "employee", route: "module:employee", page: "My Workspace", scope: "Staff / People", modulePurpose: "Profile, requests and employee self-service", action: "Open My Day or a self-service request", archetype: "Focus & Flow", hero: "Personal work runway with next-action focus", visualization: "Task progress and request status", interaction: "Resume the next unfinished work item", techie: "Contextual AI next-action suggestion" },
  { id: "profile", route: "module:profile", page: "My Profile", scope: "Staff / People", modulePurpose: "Personal details and profile completion", action: "Complete or review profile details", archetype: "Profile workbench", hero: "Identity card with completion perimeter", visualization: "Profile completion ring", interaction: "Inline edit with completion feedback", techie: "Field-level provenance and save state" },
  { id: "attendance", route: "module:attendance", page: "Attendance & GPS", scope: "Staff / Time & Attendance", modulePurpose: "Clock in, clock out and attendance records", action: "Start or complete a valid attendance session", archetype: "Presence console", hero: "Time-and-place verification dial", visualization: "Day timeline with GPS/photo gates", interaction: "Clock action progresses through verification states", techie: "Online/offline and verification-state indicator" },
  { id: "payroll", route: "module:payroll", page: "Payroll", scope: "Staff / Payroll", modulePurpose: "Payroll preparation, approvals and records", action: "Review the authorized payroll run", archetype: "Reconciliation desk", hero: "Run control spine from draft to paid", visualization: "Gross/deductions/net bands and exception queue", interaction: "Exception-first run review", techie: "Data freshness and approval provenance" },
  { id: "mobile", route: "module:mobile", page: "App & GPS", scope: "Staff / Time & Attendance", modulePurpose: "Mobile installation and tracking controls", action: "Review device/tracking readiness", archetype: "Device readiness bench", hero: "Device posture strip", visualization: "Install and permission checklist", interaction: "Progressive device readiness check", techie: "Connection and install health chip" },
  { id: "hr-master", route: "module:hr-master", page: "HR Master Records", scope: "Staff / People & HR", modulePurpose: "Employment, emergency, pension/payroll-bank", action: "Inspect an authorized employee record", archetype: "Master-detail people atlas", hero: "Scoped people index with evidence rail", visualization: "Roster status bands", interaction: "Search-to-detail record inspection", techie: "Scope explanation for each visible field" },
  { id: "leave-management", route: "module:leave-management", page: "Leave Management", scope: "Staff / HR Workflows", modulePurpose: "Leave requests, decisions and history", action: "Review or submit a leave request", archetype: "Decision timeline", hero: "Leave balance and decision path", visualization: "Calendar duration plus decision timeline", interaction: "Request-to-decision timeline drill-down", techie: "Policy-aware next step guidance" },
  { id: "performance-reviews", route: "module:performance-reviews", page: "Performance Reviews", scope: "Staff / HR Workflows", modulePurpose: "Prepare, share and track reviews", action: "Open the next review checkpoint", archetype: "Review studio", hero: "Growth narrative canvas", visualization: "Milestone progress and acknowledgement state", interaction: "Draft/share/acknowledge sequence", techie: "AI drafting as non-authoritative assistance" },
  { id: "hr-cases", route: "module:hr-cases", page: "HR Cases", scope: "Staff / HR Workflows", modulePurpose: "Disciplinary, grievance, commendation and incident cases", action: "Inspect a scoped case", archetype: "Case evidence room", hero: "Neutral evidence spine", visualization: "Case timeline and state history", interaction: "Redacted evidence drawer", techie: "Audit trail provenance" },
  { id: "employee-lifecycle", route: "module:employee-lifecycle", page: "Onboarding & Offboarding", scope: "Staff / HR Workflows", modulePurpose: "Start and exit checklists", action: "Advance an authorized checklist", archetype: "Lifecycle runway", hero: "Start-to-exit milestone ribbon", visualization: "Checklist completion path", interaction: "Stage-based handoff", techie: "Blocked-task explanation" },
  { id: "statutory-payroll", route: "module:statutory-payroll", page: "Statutory Payroll Setup", scope: "Staff / HR Workflows", modulePurpose: "PAYE, pension, NHF, NSITF and ITF", action: "Inspect statutory setup status", archetype: "Compliance ledger", hero: "Regulatory readiness strip", visualization: "Requirement coverage matrix", interaction: "Requirement-to-evidence drill-down", techie: "Freshness and source-of-truth markers" },
  { id: "payroll-payments", route: "module:payroll-payments", page: "Payroll Bank Payments", scope: "Staff / Payroll Administration", modulePurpose: "Controlled bank payment batches and draft exports", action: "Review a controlled payment batch", archetype: "Payment control room", hero: "Maker-checker payment rail", visualization: "Batch status and exception bands", interaction: "Draft → review → approve progression", techie: "Export readiness without exposing secrets" },
  { id: "printing", route: "module:printing", page: "Printing ERP", scope: "Printing & Technology", modulePurpose: "Quotations, jobs, artwork, production, materials, QC, delivery and profit", action: "Open the job that needs attention", archetype: "Board Pulse production desk", hero: "Print job flow from enquiry to completion", visualization: "Stage flow lanes and margin bands", interaction: "Stage-aware job inspection", techie: "Material accountability and data freshness" },
  { id: "production", route: "module:production", page: "Production Control", scope: "Printing & Technology", modulePurpose: "WIP, actual materials, machine time, waste, QC and completion", action: "Advance or inspect a production job", archetype: "Operational Cockpit", hero: "WIP control strip with exception spotlight", visualization: "Production stage pipeline and waste signal", interaction: "Advance stage with evidence gate", techie: "Animated flow line tied to real status" },
  { id: "bakery", route: "module:bakery", page: "Bakery ERP", scope: "Bakery", modulePurpose: "Reconcile ingredients, batches, bread, dispatch, sales, returns, remittance and shortages", action: "Reconcile the current batch-to-money chain", archetype: "Reconciliation desk", hero: "Batch yield to cash control spine", visualization: "Yield/waste/dispatch/remittance bands", interaction: "Follow one batch through the accountability ledger", techie: "Zero-variance close pulse and exception explanation" },
  { id: "autos", route: "module:autos", page: "Autos ERP", scope: "Autos", modulePurpose: "Vehicle inventory, imports, workshop, mechanics, spares, fleet and profit", action: "Inspect a vehicle or workshop bay", archetype: "Workshop Floor", hero: "Vehicle bay panorama with landed-cost spine", visualization: "Bay occupancy and service timeline", interaction: "Vehicle-to-work-order inspection", techie: "Service dependency graph" },
  { id: "logistics", route: "module:logistics", page: "Logistics ERP", scope: "Logistics", modulePurpose: "Bookings, dispatch, routes, drivers, fleet, POD, collections and profit", action: "Dispatch or investigate an active trip", archetype: "Map + Operations Feed", hero: "Route corridor with live dispatch rail", visualization: "Route timeline, shipment flow and POD status", interaction: "Select a route node to open the operational feed", techie: "Route flow line plus connection/POD freshness" },
  { id: "properties", route: "module:properties", page: "Homes & Properties ERP", scope: "Homes & Properties", modulePurpose: "Owners, properties, units, tenants, rent, maintenance, profit and ROI", action: "Inspect an authorized property portfolio", archetype: "Resource explorer", hero: "Portfolio horizon with unit availability", visualization: "Unit/lease/maintenance bands and ROI where authorized", interaction: "Portfolio-to-property drill-down", techie: "Owner/scope provenance and unavailable-detail guard" },
  { id: "finance", route: "module:finance", page: "Finance", scope: "Finance & Operations", modulePurpose: "Ledgers, journals and receivables reporting", action: "Review a finance control surface", archetype: "Horizon Wide data studio", hero: "Ledger horizon with balanced entry spine", visualization: "Account-class bands and receivable aging", interaction: "Account → journal → evidence drill-down", techie: "Double-entry balance indicator" },
  { id: "expense-requests", route: "module:expense-requests", page: "My Expense Requests", scope: "Finance & Operations", modulePurpose: "Create, evidence and track own spend requests", action: "Resume or inspect an own expense request", archetype: "Focus & Flow capture desk", hero: "Expense capture runway", visualization: "Request status timeline", interaction: "Mobile-first evidence capture", techie: "Offline draft and attachment provenance" },
  { id: "expense-create", route: "module:expense-create", page: "Create Expense Request", scope: "Finance & Operations", modulePurpose: "Classified request with master data and evidence", action: "Create an expense request", archetype: "Guided capture workbench", hero: "Four-step spend capture rail", visualization: "Step readiness and evidence checklist", interaction: "Progressive disclosure by classification", techie: "Smart classification suggestion with human confirmation" },
  { id: "expense-approvals", route: "module:expense-approvals", page: "Expense Approval Queue", scope: "Finance & Operations", modulePurpose: "Assigned requests with maker-checker", action: "Decide the next assigned request", archetype: "Approval Desk", hero: "Decision queue with evidence-first detail", visualization: "Queue aging and exception markers", interaction: "Master-detail approval with explicit decision bar", techie: "Explain-this-request sidecar without fabricating policy" },
  { id: "spend-intelligence", route: "module:spend-intelligence", page: "Spend & Profit Intelligence", scope: "Owner-only / Finance & Operations", modulePurpose: "Owner-only exposure, treatment and evidence exceptions", action: "Inspect an authorized spend exception", archetype: "Insight Magazine", hero: "Exposure narrative with evidence anchors", visualization: "Exception comparison bands", interaction: "Anomaly → evidence → treatment path", techie: "Anomaly callout and provenance ladder" },
  { id: "spend-admin", route: "module:spend-admin", page: "Cost Intelligence Administration", scope: "Finance & Operations", modulePurpose: "Categories, suppliers, cost centres and evidence rules", action: "Configure a cost-intelligence control", archetype: "Enterprise Studio", hero: "Policy canvas with inspector rail", visualization: "Coverage matrix for control rules", interaction: "Select rule, inspect effective scope, stage change", techie: "Effective-policy preview and rollback affordance" },
  { id: "finance-posting", route: "module:finance-posting", page: "Finance Posting", scope: "Finance & Operations", modulePurpose: "Sales posting automation, exceptions and reconciliation", action: "Resolve a posting exception", archetype: "Reconciliation Desk", hero: "Posting conveyor with exception gates", visualization: "Posting flow and reconciliation balance", interaction: "Exception-first correction drawer", techie: "Source/event provenance" },
  { id: "inventory", route: "module:inventory", page: "Inventory", scope: "Finance & Supply Control", modulePurpose: "Stock, movement and item controls", action: "Inspect a stock or movement record", archetype: "Product / Inventory Matrix", hero: "Stock matrix with movement thread", visualization: "On-hand/low-stock/transfer bands", interaction: "Item-to-movement drill-down", techie: "Stale stock signal and authorized-scope chip" },
  { id: "construction", route: "module:construction", page: "Construction & Projects", scope: "Finance & Operations", modulePurpose: "Projects, sites, budgets and progress", action: "Open a project milestone or budget view", archetype: "Project horizon", hero: "Site progress horizon with budget spine", visualization: "Milestone timeline and budget burn", interaction: "Milestone-to-expense inspection", techie: "Dependency and overdue milestone callout" },
  { id: "sync-sessions", route: "module:sync-sessions", page: "Sync & Sessions", scope: "Owner-only / Controls", modulePurpose: "Offline/sync/session health", action: "Investigate sync or session health", archetype: "Sync Activity Center", hero: "Connection state ribbon with queue depth", visualization: "Sync state lanes and session freshness", interaction: "Queue item → retry/review detail", techie: "Exactly-once provenance and retry state" },
  { id: "owner-intelligence", route: "module:owner-intelligence", page: "Owner Intelligence", scope: "Owner-only / Controls", modulePurpose: "Group-level operational intelligence", action: "Read the next group-level exception", archetype: "Executive Briefing", hero: "Owner briefing field with cross-business signals", visualization: "Cross-business comparison bands", interaction: "Signal → business → source module", techie: "Explain-this-metric with source availability guard" },
  { id: "admin", route: "module:admin", page: "Admin Setup", scope: "Controls / Administration", modulePurpose: "Settings, security and tracking", action: "Inspect an effective policy", archetype: "Enterprise Studio", hero: "Policy workbench with daylight inspector", visualization: "Effective policy precedence map", interaction: "Policy → scope → affected capability", techie: "Rollback/history and effective-policy preview" },
  { id: "temporary-passwords", route: "module:temporary-passwords", page: "Temporary Password Recovery", scope: "Controls / Access Administration", modulePurpose: "One-time recovery passwords", action: "Review a governed recovery request", archetype: "Secure issue desk", hero: "Recovery issuance guardrail", visualization: "Request state timeline", interaction: "Reveal only after explicit audit step", techie: "One-time visibility and audit provenance" },
  { id: "access", route: "module:access", page: "Access Control", scope: "Controls / Access Administration", modulePurpose: "Roles, permissions and employee access", action: "Inspect an effective access profile", archetype: "Permission lattice", hero: "Role-to-resource lattice with scope lens", visualization: "Permission matrix and override bands", interaction: "Select permission to inspect source and scope", techie: "No-permission boundary shown as a hard stop" },
  { id: "user-support", route: "module:user-support", page: "User Support Centre", scope: "Controls / Support", modulePurpose: "Access, sessions, audited refresh and employee-approved support", action: "Review an audited support action", archetype: "Support console", hero: "Employee support queue with action guardrails", visualization: "Support action timeline", interaction: "Select employee → scoped action confirmation", techie: "Audit-before-action checkpoint" },
  { id: "themes", route: "module:themes", page: "Theme Studio", scope: "Controls / Personalization", modulePurpose: "Theme gallery and Group appearance policy", action: "Preview or inspect an appearance policy", archetype: "Appearance atelier", hero: "Daylight material swatch wall", visualization: "Theme token comparison", interaction: "Preview → effective policy → rollback", techie: "Accessibility contrast/focus preview" },
  { id: "navigation", route: "module:navigation", page: "Navigation Studio", scope: "Controls / Personalization", modulePurpose: "Personal layout and authorized workspace", action: "Arrange the authorized navigation", archetype: "Spatial navigation canvas", hero: "Workspace constellation", visualization: "Navigation hierarchy and group order", interaction: "Keyboard/drag reorder with preview", techie: "Effective navigation provenance" },
  { id: "layout-studio", route: "module:layout-studio", page: "Layout Studio", scope: "Controls / Personalization", modulePurpose: "Authenticated shell, density and motion", action: "Preview a layout preference", archetype: "Design systems workbench", hero: "Ten-layout gallery with live shell sample", visualization: "Density/motion comparison", interaction: "Preview → apply → rollback", techie: "Reduced-motion and policy precedence toggle" },
  { id: "monitoring", route: "module:monitoring", page: "Resource Monitoring", scope: "Owner/Admin / Observability", modulePurpose: "Service health, sessions and diagnostics", action: "Inspect a service health signal", archetype: "Operations observatory", hero: "Service health strip over diagnostic canvas", visualization: "Health timeline and dependency status", interaction: "Signal → diagnostic detail", techie: "Stale/live/unknown status semantics" },
  { id: "audit", route: "module:audit", page: "Activity & Audit", scope: "Controls / Observability", modulePurpose: "Business activity and audit explorer", action: "Trace an audited business action", archetype: "Audit timeline", hero: "Evidence timeline with source anchors", visualization: "Filterable activity timeline", interaction: "Event expansion without losing context", techie: "Immutable-looking provenance presentation" },
  { id: "toolbox", route: "module:toolbox", page: "Advanced Toolbox", scope: "Owner/Admin / Observability", modulePurpose: "DB, sessions, payroll readiness and error checks", action: "Run an authorized diagnostic check", archetype: "Diagnostic workbench", hero: "Readiness gauges with safe action affordances", visualization: "Check result matrix", interaction: "Run → inspect → acknowledge result", techie: "Explicit non-production fixture state" },
  { id: "api-integrations", route: "module:api-integrations", page: "API & Integrations", scope: "Controls / System Control", modulePurpose: "Cloudflare health, safe metadata, API catalogue, webhooks and logs", action: "Inspect an integration status or catalogue entry", archetype: "Network topology", hero: "Integration topology with trust boundaries", visualization: "Connection health and webhook flow", interaction: "Provider → endpoint → safe metadata", techie: "Secret-free integration provenance" },
  { id: "jobs-applications", route: "module:jobs-applications", page: "Job Applications", scope: "Jobs / Talent Acquisition", modulePurpose: "Candidate applications", action: "Open an authorized application", archetype: "Candidate pipeline", hero: "Candidate flow with stage context", visualization: "Stage funnel and application timeline", interaction: "Candidate-to-evidence drill-down", techie: "Scoped recruiter context" },
  { id: "jobs-interviews", route: "module:jobs-interviews", page: "Interview Pipeline", scope: "Jobs / Talent Acquisition", modulePurpose: "Interview stages and notes", action: "Prepare the next interview checkpoint", archetype: "Schedule board", hero: "Interview day lane", visualization: "Stage/calendar sequence", interaction: "Candidate → interview detail drawer", techie: "Conflict/status cues" },
  { id: "jobs-hiring", route: "module:jobs-hiring", page: "Hiring Workflow", scope: "Jobs / Talent Acquisition", modulePurpose: "Approved candidate workflow", action: "Advance an approved candidate workflow", archetype: "Process pipeline", hero: "Offer-to-onboard handoff ribbon", visualization: "Hiring stage pipeline", interaction: "Stage gate with required evidence", techie: "Next-action suggestion grounded in stage" },
  { id: "social", route: "module:social", page: "Social Engine", scope: "Social & Web", modulePurpose: "Content, publishing and campaign operations", action: "Open a content or campaign workstream", archetype: "Editorial insight canvas", hero: "Content studio with approval spine", visualization: "Content performance and workflow status", interaction: "Draft → review → schedule handoff", techie: "AI draft-first assistance" },
  { id: "social-controls", route: "module:social-controls", page: "Social Controls", scope: "Social & Web", modulePurpose: "Automation settings and approvals", action: "Inspect an automation guardrail", archetype: "Control desk", hero: "Guardrail matrix with human handoff", visualization: "Automation confidence bands", interaction: "Control → scope → approval path", techie: "Confidence threshold and quiet-hour indicators" },
  { id: "social-accounts", route: "module:social-accounts", page: "Social Accounts", scope: "Social & Web", modulePurpose: "Official provider connections", action: "Inspect connection readiness", archetype: "Connection onboarding", hero: "Provider readiness corridor", visualization: "OAuth/setup readiness steps", interaction: "Provider → consent → readiness", techie: "No-password connection language" },
  { id: "social-sync", route: "module:social-sync", page: "ERP Social Sync", scope: "Social & Web", modulePurpose: "ERP/social conversion integrations", action: "Inspect a sync route", archetype: "Integration flow map", hero: "Business-to-social conversion flow", visualization: "Sync route status", interaction: "Source event → destination record", techie: "Sync freshness and retry status" },
  { id: "marketing", route: "module:marketing", page: "Marketing Command", scope: "Social & Web", modulePurpose: "Audience, funnel and campaign intelligence", action: "Read a marketing performance signal", archetype: "Insight magazine", hero: "Funnel narrative with owned-surface emphasis", visualization: "Funnel bands and content performance", interaction: "Signal → campaign → source content", techie: "Provider availability guard" },
  { id: "community", route: "module:community", page: "Community Inbox", scope: "Social & Web", modulePurpose: "Customer messages and response workflow", action: "Resolve the next community thread", archetype: "Queue manager", hero: "Conversation queue with response context", visualization: "Queue aging and response status", interaction: "Thread → AI draft → human send decision", techie: "Draft-first AI sidecar" },
  { id: "website-admin", route: "module:website-admin", page: "Website Administration", scope: "Social & Web", modulePurpose: "Website setup, pages, images, revisions and approval publishing", action: "Review a website change before approval", archetype: "Document workspace", hero: "Revision canvas with approval rail", visualization: "Revision timeline and content coverage", interaction: "Draft → review → approve/publish gate", techie: "Safe metadata and private-preview posture",
  },
];

export const pageUniquenessMatrix: ContractRow[] = [
  ...authContracts.map(makeContract),
  ...globalViewContracts.map(makeContract),
  ...moduleSeeds.map((seed) =>
    makeContract({
      route: seed.route,
      page: seed.page,
      scope: seed.scope,
      currentPurpose: seed.modulePurpose,
      primaryActions: seed.action,
      functionalRequirements: "Preserve the source module contract for " + seed.modulePurpose + "; enforce module.resource.action permissions, company/branch/department scope, existing forms/tables/workflows, and server-derived data states.",
      authorizedUsers: "Only users with the source-defined permission scope for " + seed.id + "; Owner/Admin bypasses remain source-controlled.",
      dataRequired: "Authorized " + seed.page + " records from the existing API contracts; missing integrations say Unavailable and fixture values remain labeled.",
      uniqueDesignArchetype: seed.archetype,
      uniqueHero: seed.hero,
      uniqueDataVisualization: seed.visualization,
      uniqueInteractionSignature: seed.interaction,
      techieGoodie: seed.techie,
    }),
  ),
];

export const moduleCount = moduleSeeds.length;
export const authSurfaceCount = authContracts.length;
export const globalViewCount = globalViewContracts.length - 1;
export const routeSurfaceCount = pageUniquenessMatrix.length;
export const majorPageCount = routeSurfaceCount - 1;
export const canonicalBaselineRoute = "/__canonical_baseline";
export const excludedBusinesses = ["Excluded from this design lab"];
