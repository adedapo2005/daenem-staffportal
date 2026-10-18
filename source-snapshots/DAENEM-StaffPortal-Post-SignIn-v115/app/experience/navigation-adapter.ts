import {
  Activity,
  BrainCircuit,
  Building2,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Monitor,
  Package,
  PanelTop,
  PencilRuler,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Users,
  WandSparkles,
  Wrench,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  byId,
  canViewStudioSection,
  canViewStudioCapability,
  STUDIO_SECTION_CAPABILITIES,
  type Session,
  type StudioCapabilityId,
  type StudioCapabilitySection,
} from "./model";

/**
 * Presentation adapter only. The canonical module/function registry is
 * model.ts. These definitions provide adaptive-hybrid grouping and icons;
 * identity, ownership, route and permission identity are always materialized
 * from the canonical module definitions.
 */
export type GlobalNavigationId =
  | "home"
  | "my-work"
  | "people"
  | "businesses"
  | "finance"
  | "communications"
  | "intelligence"
  | "tools"
  | "admin";

export type ContextNavigationItem = {
  id: string;
  label: string;
  route: string;
  moduleId?: string;
  permissionModuleId: string;
  description?: string;
  kind: "module" | "hub";
};

export type GlobalNavigationItem = {
  id: GlobalNavigationId;
  label: string;
  icon: LucideIcon;
  route: string;
  moduleId: string;
  permissionModuleId: string;
  description: string;
  pinned?: boolean;
  context: ContextNavigationItem[];
};

export type StudioSectionId =
  | "Home"
  | "Themes"
  | "Preview"
  | "Editor"
  | "Widgets"
  | "Variants"
  | "Custom"
  | "Brand"
  | "AI"
  | "Copy"
  | "Style"
  | "Motion"
  | "History"
  | "Compare"
  | "Devices"
  | "Contract";

export type StudioNavigationItem = {
  id: StudioSectionId;
  label: string;
  icon: LucideIcon;
  group: "Design" | "Content" | "Behavior" | "Intelligence" | "Governance" | "Advanced";
  description: string;
  capability?: StudioCapabilityId;
};

const canonical = (moduleId: string, visualLabel?: string): ContextNavigationItem => {
  const definition = byId(moduleId);
  if (!definition) throw new Error("Missing canonical module definition: " + moduleId);
  return {
    id: definition.id,
    label: visualLabel || definition.title,
    route: definition.canonicalPath,
    moduleId: definition.id,
    permissionModuleId: definition.id,
    description: definition.purpose,
    kind: "module",
  };
};

const group = (
  id: GlobalNavigationId,
  label: string,
  icon: LucideIcon,
  rootModuleId: string,
  context: ContextNavigationItem[],
  description: string,
): GlobalNavigationItem => {
  const root = canonical(rootModuleId);
  return {
    id,
    label,
    icon,
    route: root.route,
    moduleId: root.moduleId || root.permissionModuleId,
    permissionModuleId: root.permissionModuleId,
    description,
    context,
  };
};

const studioModule = byId("signin-design");
if (!studioModule) throw new Error("Missing canonical Sign-In Studio module definition");
export const SIGNIN_STUDIO_ROUTE = studioModule.canonicalPath;
export const ADMIN_EXPERIENCE_ROUTE = "/admin/experience";
export const CLOUD_STORAGE_ROUTE = "/admin/platform/storage";

const capabilityFor = (section: StudioCapabilitySection): StudioCapabilityId => {
  const definition = STUDIO_SECTION_CAPABILITIES.find(item => item.section === section);
  if (!definition) throw new Error("Missing canonical Studio capability definition: " + section);
  return definition.id;
};

const studio = (
  id: StudioSectionId,
  label: string,
  icon: LucideIcon,
  groupName: StudioNavigationItem["group"],
  capability: StudioCapabilitySection | undefined,
  description: string,
): StudioNavigationItem => ({
  id,
  label,
  icon,
  group: groupName,
  description,
  ...(capability ? { capability: capabilityFor(capability) } : {}),
});

export const SIGNIN_STUDIO_NAVIGATION: StudioNavigationItem[] = [
  studio("Home", "Overview", PanelTop, "Design", undefined, "Studio status and assigned experience capabilities"),
  studio("Themes", "Themes", LayoutGrid, "Design", "Themes", "Browse the governed theme library"),
  studio("Preview", "Live Preview", Monitor, "Design", "Responsive", "Inspect the shared sign-in renderer"),
  studio("Editor", "Layout Editor", PencilRuler, "Design", "Layout", "Select, move, resize and align objects"),
  studio("Widgets", "Widget Library", Package, "Design", "Widgets", "Add governed public-safe widgets"),
  studio("Variants", "Widget Variants", LayoutGrid, "Design", "Widgets", "Choose a visual form for a widget purpose"),
  studio("Custom", "Custom Widget Builder", WandSparkles, "Design", "Custom Widgets", "Compose safe declarative widget drafts"),
  studio("Brand", "Logo & Brand", ImageIcon, "Design", "Brand", "Edit approved logo instances"),
  studio("Copy", "Wording", FileText, "Content", "Wording", "Review governed public copy"),
  studio("Style", "Style Controls", SlidersHorizontal, "Behavior", "Style", "Open live style controls"),
  studio("Motion", "Motion", WandSparkles, "Behavior", "Motion", "Configure governed motion"),
  studio("Devices", "Responsive Preview", Smartphone, "Behavior", "Responsive", "Inspect independent breakpoints"),
  studio("AI", "AI Design Copilot", Sparkles, "Intelligence", "AI Copilot", "Generate and accept local proposals"),
  studio("History", "Versions", Workflow, "Governance", "Versions", "Review reversible local versions"),
  studio("Compare", "Compare", ChartNoAxesCombined, "Governance", "Compare", "Compare canonical theme records"),
  studio("Contract", "Integration", Link2, "Advanced", "Integration", "Review the production handoff contract"),
];

const experienceHub: ContextNavigationItem = {
  id: "experience",
  label: "Experience",
  route: ADMIN_EXPERIENCE_ROUTE,
  permissionModuleId: "signin-design",
  description: "Assigned Sign-In Studio capabilities",
  kind: "hub",
};

const cloudStorageHub: ContextNavigationItem = {
  id: "cloud-storage",
  label: "Cloud Storage & Backup",
  route: CLOUD_STORAGE_ROUTE,
  moduleId: "admin",
  permissionModuleId: "admin",
  description: "Primary operational storage and governed secondary backup",
  kind: "hub",
};

export const GLOBAL_NAVIGATION: GlobalNavigationItem[] = [
  {
    ...group("home", "Home", LayoutDashboard, "home", [
      canonical("home", "Overview"),
      canonical("notifications", "Action Center"),
      canonical("cockpit", "Operational View"),
      canonical("hub", "All Workspaces"),
    ], "Priorities and authorized attention"),
    pinned: true,
  },
  {
    ...group("my-work", "My Work", ClipboardCheck, "workspace", [
      canonical("workspace", "My Workspace"),
      canonical("self-service", "Self-Service"),
      canonical("tasks", "Tasks & Approvals"),
      canonical("forms", "Forms"),
      canonical("expenses", "Expense Requests"),
    ], "Personal work and requests"),
    pinned: true,
  },
  group("people", "People", Users, "people", [
    canonical("people", "Directory"),
    canonical("profile", "My Profile"),
    canonical("attendance", "Attendance"),
    canonical("leave", "Leave"),
    canonical("performance", "Performance"),
    canonical("payslips", "My Payslips"),
    canonical("payroll", "Payroll"),
    canonical("hr-records", "HR Records"),
    canonical("lifecycle", "People Lifecycle"),
    canonical("hr-cases", "HR Cases"),
    canonical("payroll-batches", "Payment Batches"),
  ], "Directory, attendance and people operations"),
  group("businesses", "Businesses", Building2, "bakery", [
    canonical("bakery", "Bakery Overview"),
    canonical("bakery-recipes", "Bakery Recipes"),
    canonical("bakery-accountability", "Bakery Accountability"),
    canonical("bakery-sales", "Bakery Orders"),
    canonical("printing", "Printing Overview"),
    canonical("print-orders", "Printing Jobs & Quotes"),
    canonical("print-materials", "Printing Materials"),
    canonical("technology-services", "Technology Services"),
    canonical("autos", "Autos Overview"),
    canonical("auto-leads", "Auto Leads"),
    canonical("auto-history", "Vehicle History"),
    canonical("properties", "Properties Overview"),
    canonical("leases", "Leases"),
    canonical("property-leads", "Property Leads"),
    canonical("logistics", "Logistics Overview"),
    canonical("fleet", "Fleet & Drivers"),
    canonical("applications", "Job Applications"),
    canonical("interviews", "Interviews"),
    canonical("hiring", "Hiring"),
    canonical("vacancies", "Vacancies"),
    canonical("construction-command", "Construction Overview"),
  ], "Authorized business workspaces"),
  group("finance", "Finance", ChartNoAxesCombined, "finance", [
    canonical("finance", "Finance Overview"),
    canonical("receivables", "Receivables"),
    canonical("finance-posting", "Posting"),
    canonical("budgets", "Budgets & Periods"),
    canonical("expense-approvals", "Expense Approvals"),
    canonical("inventory", "Inventory"),
    canonical("projects", "Projects"),
    canonical("facilities", "Facilities"),
    canonical("trip-costs", "Trip Costs"),
  ], "Money, stock and operating controls"),
  group("communications", "Communications", Activity, "communications", [
    canonical("communications", "Notices"),
    canonical("broadcasts", "Broadcasts"),
    canonical("encouragement", "Staff Encouragement"),
    canonical("inbox", "Community Inbox"),
    canonical("customer-communications", "Customer Inbox"),
    canonical("social", "Social Content"),
    canonical("communication-settings", "Communications Control"),
    canonical("meta-credential-vault", "Meta Credential Vault"),
  ], "Notices, inboxes and audience work"),
  group("intelligence", "Intelligence", BrainCircuit, "reports", [
    canonical("reports", "Reports"),
    canonical("spend", "Spend & Profit"),
    canonical("marketing", "Marketing Insights"),
    canonical("audit", "Activity & Audit"),
  ], "Authorized reporting and analysis"),
  group("tools", "Tools", Wrench, "help", [
    canonical("help", "Help & Ask DAENEM"),
    canonical("sync", "Sync & Sessions"),
    canonical("theme", "Appearance"),
    canonical("navigation", "Navigation"),
    canonical("layout", "Layout"),
    canonical("integrations", "Integrations"),
    canonical("resources", "Service Status"),
    canonical("toolbox", "Advanced Tools"),
    canonical("website", "Website"),
    canonical("social-accounts", "Social Accounts"),
    canonical("social-sync", "Social Sync"),
  ], "Help, preferences and connected tools"),
  group("admin", "Admin", Shield, "admin", [
    canonical("admin", "Admin Center"),
    experienceHub,
    cloudStorageHub,
    canonical("security", "Security"),
    canonical("access", "Access Control"),
    canonical("session-analytics", "Sessions & Usage"),
    canonical("recovery", "Password Recovery"),
    canonical("support", "User Support"),
    canonical("social-controls", "Social Controls"),
  ], "Access, experience and governance"),
];

export function studioSectionFromQuery(value: string | null): StudioSectionId {
  return SIGNIN_STUDIO_NAVIGATION.some(item => item.id === value) ? value as StudioSectionId : "Home";
}

export function studioSectionPath(section: StudioSectionId) {
  return SIGNIN_STUDIO_ROUTE + "?studioSection=" + encodeURIComponent(section);
}

/**
 * Resolve a UI section through the one navigation item that owns it. The
 * navigation item already carries the canonical capability identity; callers
 * must not compare UI ids (Editor, Custom, Devices, etc.) to capability
 * section labels.
 */
export function studioNavigationItemFor(value: string | null) {
  const id = studioSectionFromQuery(value);
  return SIGNIN_STUDIO_NAVIGATION.find(item => item.id === id);
}

/**
 * Central Studio route gate. Home uses the existing Studio entry rule; every
 * other UI destination resolves its capability from SIGNIN_STUDIO_NAVIGATION
 * before consulting the canonical authorization model.
 */
export function canViewStudioNavigationItem(value: string | null, session: Session) {
  const item = studioNavigationItemFor(value);
  if (!item) return false;
  return item.id === "Home"
    ? canViewStudioSection("Home", session)
    : Boolean(item.capability && canViewStudioCapability(item.capability, session));
}

export function studioNavigationFor(session: Session) {
  return SIGNIN_STUDIO_NAVIGATION.filter(item => canViewStudioNavigationItem(item.id, session));
}

export function globalNavigationFor(id: string) {
  return GLOBAL_NAVIGATION.find(item => item.id === id || item.moduleId === id);
}

export function studioNavigationGroupOrder() {
  return ["Design", "Content", "Behavior", "Intelligence", "Governance", "Advanced"] as const;
}
