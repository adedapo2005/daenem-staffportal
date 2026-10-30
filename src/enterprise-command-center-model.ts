import {
  authorizedCompaniesForModule,
  companies,
  modules,
  type ModuleDef,
  type Session,
} from "../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model";
import {
  GLOBAL_NAVIGATION,
  type ContextNavigationItem,
  type GlobalNavigationId,
  type GlobalNavigationItem,
} from "../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/navigation-adapter";

/** Presentation only: module identity, paths and authority remain canonical. */
export interface CommandCenterPage {
  kind: "page";
  id: string;
  label: string;
  route: string;
  moduleId: string;
  permissionModuleId: string;
  description?: string;
  globalId: GlobalNavigationId;
  breadcrumb: string[];
  context?: ContextNavigationItem;
}

export interface CommandCenterGroup {
  kind: "group";
  id: string;
  label: string;
  globalId: GlobalNavigationId;
  children: CommandCenterNode[];
  source?: GlobalNavigationItem;
}

export type CommandCenterNode = CommandCenterPage | CommandCenterGroup;
export type CommandCenterPermissionCheck = (module: ModuleDef | undefined, session: Session) => boolean;
export interface CommandCenterModelOptions {
  session: Session;
  canView: CommandCenterPermissionCheck;
  contextVisible: (entry: ContextNavigationItem) => boolean;
}

const definitions = new Map(modules.map((module) => [module.id, module]));
const globals = new Map(GLOBAL_NAVIGATION.map((item) => [item.id, item]));
export function canViewCommandNavigationModule(
  definition: ModuleDef | undefined,
  session: Session,
  canView: CommandCenterPermissionCheck,
): boolean {
  if (!definition) return false;
  if (session.role !== "Owner") return canView(definition, session);
  return authorizedCompaniesForModule(session, definition).length > 0;
}

export function commandNavigationTargetSession(
  definition: ModuleDef | undefined,
  session: Session,
  canView: CommandCenterPermissionCheck,
): Session {
  if (!definition || session.role !== "Owner" || canView(definition, session)) return session;
  const authorized = authorizedCompaniesForModule(session, definition);
  const company = definition.company && authorized.includes(definition.company)
    ? definition.company
    : authorized.find((candidate) => candidate !== "group")
      || (authorized.includes("group") ? "group" : undefined);
  return company ? { ...session, company } : session;
}

const personalWork = new Set(["files", "saved-views"]);
const businessFamilies = new Set([
  "Jobs ERP", "Printing & Technology", "Bakery ERP", "Autos ERP",
  "Logistics ERP", "Homes & Properties", "Construction & Capital Projects",
]);

/** Resolves breadcrumbs for deep modules missing from the original short menu. */
export function resolveGlobalNavigationOwner(moduleId: string): GlobalNavigationItem | undefined {
  const definition = definitions.get(moduleId);
  if (!definition) return undefined;
  const explicit = GLOBAL_NAVIGATION.find((item) =>
    item.moduleId === moduleId || item.context.some((entry) =>
      entry.moduleId === moduleId || entry.permissionModuleId === moduleId,
    ),
  );
  if (explicit) return explicit;
  let owner: GlobalNavigationId;
  if (personalWork.has(moduleId)) owner = "my-work";
  else if (businessFamilies.has(definition.family)) owner = "businesses";
  else if (definition.family === "Staff ERP") owner = "people";
  else if (definition.family === "Finance & Operations") owner = "finance";
  else if (definition.family === "Communications" || definition.family === "Social & Web") owner = "communications";
  else if (definition.family === "Security, Access & Admin" || definition.family === "Admin / Experience") owner = "admin";
  else if (definition.family === "Global") owner = "home";
  else owner = "tools";
  return globals.get(owner);
}

type GroupLabel = readonly [id: string, label: string];
const companyLabels: Record<string, string> = Object.fromEntries(companies.map((company) => [company.id, company.name]));
const constructionGroups: Record<string, GroupLabel> = {
  "construction-command": ["dashboard", "Dashboard"],
  "construction-portfolio": ["projects", "Projects"],
  "construction-project": ["projects", "Projects"],
  "construction-building": ["projects", "Projects"],
  "construction-area": ["projects", "Projects"],
  "construction-work-orders": ["projects", "Projects"],
  "construction-progress": ["projects", "Projects"],
  "construction-inspections": ["projects", "Projects"],
  "construction-boq": ["costs-payments", "Costs & Payments"],
  "construction-materials": ["costs-payments", "Costs & Payments"],
  "construction-procurement": ["costs-payments", "Costs & Payments"],
  "construction-consumption": ["costs-payments", "Costs & Payments"],
  "construction-contracts": ["costs-payments", "Costs & Payments"],
  "construction-finance": ["costs-payments", "Costs & Payments"],
  "construction-payments": ["costs-payments", "Costs & Payments"],
  "construction-contractors": ["people-suppliers", "People & Suppliers"],
  "construction-whatsapp": ["people-suppliers", "People & Suppliers"],
  "construction-reconciliation": ["reconciliation-alerts", "Reconciliation & Alerts"],
  "construction-risk": ["reconciliation-alerts", "Reconciliation & Alerts"],
  "construction-ai": ["dashboard", "Dashboard"],
  "construction-reports": ["dashboard", "Dashboard"],
};

const familyCompany: Record<string, string> = {
  "Printing & Technology": "printing", "Bakery ERP": "bakery", "Autos ERP": "autos",
  "Logistics ERP": "logistics", "Homes & Properties": "properties",
};

const contains = (ids: string, id: string) => ids.split(" ").includes(id);

function groupingFor(page: CommandCenterPage): GroupLabel[] {
  const definition = definitions.get(page.moduleId);
  const id = page.moduleId;
  if (page.globalId === "businesses") {
    if (definition?.family === "Construction & Capital Projects") {
      // The five approved sections remain headings, never invented destinations.
      return [["construction", "Construction"], constructionGroups[id] || ["projects", "Projects"]];
    }
    const company = definition?.company || (definition && familyCompany[definition.family]);
    if (company && company !== "group") return [[company, companyLabels[company] || company]];
    if (definition?.family === "Jobs ERP") return [["recruitment", "Group Recruitment"]];
    return [["group", "Group Workspaces"]];
  }
  if (page.globalId === "people") {
    if (contains("people profile hr-records lifecycle hr-cases", id)) return [["directory-records", "Directory & Records"]];
    if (contains("attendance leave performance productivity", id)) return [["time-development", "Time & Development"]];
    if (contains("payslips payroll payroll-batches salary-adjustments", id)) return [["pay-benefits", "Pay & Benefits"]];
  }
  if (page.globalId === "finance") {
    if (id === "finance") return [];
    if (contains("banking-operations treasury payment-verification transfers beneficiaries payroll-execution reconciliation financial-reports", id)) return [["banking-payments", "Banking & Payments"]];
    if (contains("inventory procurement purchase-orders goods-receipts stock-transfers stock-borrowing", id)) return [["procurement-stock", "Procurement & Stock"]];
    if (contains("projects facilities trip-costs", id)) return [["operating-controls", "Operating Controls"]];
    if (contains("cost-admin data-import", id)) return [["configuration", "Finance Configuration"]];
    return [["accounting", "Accounting & Approvals"]];
  }
  if (page.globalId === "communications") {
    if (contains("communications broadcasts encouragement staff-messaging", id)) return [["staff", "Notices & Staff"]];
    if (contains("inbox customer-communications unified-inbox", id)) return [["inboxes", "Customer Inboxes"]];
    if (contains("social communication-templates letterheads ai-letterhead-generator", id)) return [["content", "Content & Documents"]];
    if (contains("communication-analytics communication-audit", id)) return [["insights", "Insights & Audit"]];
    return [["delivery", "Delivery & Governance"]];
  }
  if (page.globalId === "tools") {
    if (contains("theme navigation layout dashboard-personalization", id)) return [["preferences", "Workspace Preferences"]];
    if (contains("integrations resources website social-accounts social-sync", id)) return [["connected", "Connected Tools"]];
    if (id === "help" || id === "sync") return [];
    return [["advanced", "Advanced Tools"]];
  }
  if (page.globalId === "admin") {
    if (page.context?.id === "experience" || id === "signin-design") return [["experience", "Experience"]];
    if (page.context?.id === "cloud-storage") return [["platform", "Platform"]];
    if (id === "admin") return [];
    if (contains("field-builder form-builder workflow-builder report-builder widget-builder theme-builder", id)) return [["builders", "Builders & Configuration"]];
    if (contains("social-controls business-rules notification-rules work-location", id)) return [["governance", "Policies & Governance"]];
    return [["security", "Security & Access"]];
  }
  return [];
}

function appendPage(area: CommandCenterGroup, page: CommandCenterPage) {
  let parent = area;
  const breadcrumbs = [area.label];
  for (const [localId, label] of groupingFor(page)) {
    const id = `${parent.id}/${localId}`;
    let group = parent.children.find((node): node is CommandCenterGroup => node.kind === "group" && node.id === id);
    if (!group) {
      group = { kind: "group", id, label, globalId: area.globalId, children: [] };
      parent.children.push(group);
    }
    breadcrumbs.push(label);
    parent = group;
  }
  parent.children.push({ ...page, breadcrumb: breadcrumbs });
}

function sortConstructionSections(group: CommandCenterGroup) {
  if (group.id === "area:businesses/construction") {
    const order = ["dashboard", "projects", "costs-payments", "people-suppliers", "reconciliation-alerts"];
    group.children.sort((a, b) => order.indexOf(a.id.split("/").at(-1) || "") - order.indexOf(b.id.split("/").at(-1) || ""));
  }
  for (const child of group.children) if (child.kind === "group") sortConstructionSections(child);
}

/** Every visible canonical module has a destination, including newly registered modules. */
export function buildEnterpriseCommandNavigation({ session, canView, contextVisible }: CommandCenterModelOptions): CommandCenterGroup[] {
  const areas: CommandCenterGroup[] = GLOBAL_NAVIGATION.map((item) => ({
    kind: "group", id: `area:${item.id}`, label: item.label, globalId: item.id, children: [], source: item,
  }));
  const represented = new Set<string>();
  for (const area of areas) {
    for (const entry of area.source!.context) {
      if (!contextVisible(entry)) continue;
      const moduleId = entry.moduleId || entry.permissionModuleId;
      appendPage(area, {
        kind: "page", id: `context:${area.globalId}:${entry.id}`, label: entry.label,
        route: entry.route, moduleId, permissionModuleId: entry.permissionModuleId,
        description: entry.description, globalId: area.globalId, breadcrumb: [], context: entry,
      });
      represented.add(`${moduleId}\n${entry.route}`);
    }
  }
  for (const definition of modules) {
    if (represented.has(`${definition.id}\n${definition.canonicalPath}`) || !canView(definition, session)) continue;
    // A canonical Studio route must still pass the existing special entry gate.
    const studioEntry = definition.id === "signin-design"
      ? GLOBAL_NAVIGATION.find((item) => item.id === "admin")?.context.find((entry) => entry.id === "experience")
      : undefined;
    if (studioEntry && !contextVisible(studioEntry)) continue;
    const owner = resolveGlobalNavigationOwner(definition.id);
    const area = areas.find((item) => item.globalId === owner?.id);
    if (!area) continue;
    appendPage(area, {
      kind: "page", id: `module:${definition.id}`, label: definition.title,
      route: definition.canonicalPath, moduleId: definition.id, permissionModuleId: definition.id,
      description: definition.purpose, globalId: area.globalId, breadcrumb: [],
    });
  }
  for (const area of areas) sortConstructionSections(area);
  return areas.filter((area) => area.children.length > 0);
}

export function flattenCommandNavigation(nodes: readonly CommandCenterNode[]): CommandCenterPage[] {
  return nodes.flatMap((node) => node.kind === "page" ? [node] : flattenCommandNavigation(node.children));
}

export function commandAncestorIds(nodes: readonly CommandCenterNode[], isActive: (page: CommandCenterPage) => boolean): string[] {
  return nodes.flatMap((node) => {
    if (node.kind === "page") return [];
    const descendants = commandAncestorIds(node.children, isActive);
    return node.children.some((child) => child.kind === "page" && isActive(child)) || descendants.length
      ? [node.id, ...descendants]
      : [];
  });
}

/**
 * Keeps navigation calm on route changes: the new active workspace opens,
 * previously open top-level workspaces close, and nested disclosure memory is
 * retained so returning to a workspace restores the user's local context.
 */
export function reconcileCommandExpansion(
  expanded: Readonly<Record<string, boolean>>,
  topAreaIds: readonly string[],
  activeAncestorIds: readonly string[],
  routeChanged: boolean,
): Readonly<Record<string, boolean>> {
  let next = expanded;
  const set = (id: string, value: boolean) => {
    if (next[id] === value) return;
    if (next === expanded) next = { ...expanded };
    (next as Record<string, boolean>)[id] = value;
  };

  if (routeChanged && activeAncestorIds.length) {
    const activeAreaId = activeAncestorIds[0];
    for (const areaId of topAreaIds) set(areaId, areaId === activeAreaId);
  }
  for (const id of activeAncestorIds) set(id, true);
  return next;
}

/** Uses the host fallback first; handles a deep-only grant without exposing a denied root. */
export function commandAreaDestination(
  area: CommandCenterGroup,
  destinationForGlobalItem: (item: GlobalNavigationItem) => { route: string; capabilityModuleId?: string },
): { page: CommandCenterPage; route: string; capabilityModuleId: string } | undefined {
  const pages = flattenCommandNavigation(area.children);
  const preferred = area.source && destinationForGlobalItem(area.source);
  const matched = preferred && pages.find((page) => page.route === preferred.route);
  const page = matched || pages[0];
  if (!page) return undefined;
  return {
    page, route: matched && preferred ? preferred.route : page.route,
    capabilityModuleId: matched && preferred?.capabilityModuleId ? preferred.capabilityModuleId : page.permissionModuleId,
  };
}

export function searchCommandNavigation(pages: readonly CommandCenterPage[], query: string): CommandCenterPage[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return pages.filter((page) => {
    const text = [...page.breadcrumb, page.label, page.moduleId, page.description || ""].join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => {
    const exactA = a.label.toLocaleLowerCase().startsWith(terms.join(" ")) ? 0 : 1;
    const exactB = b.label.toLocaleLowerCase().startsWith(terms.join(" ")) ? 0 : 1;
    return exactA - exactB || a.label.localeCompare(b.label, "en-NG");
  });
}
