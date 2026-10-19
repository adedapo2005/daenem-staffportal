import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, History, Search, Star, X } from "lucide-react";
import type { Session } from "../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model";
import type {
  ContextNavigationItem,
  GlobalNavigationId,
  GlobalNavigationItem,
} from "../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/navigation-adapter";
import {
  buildEnterpriseCommandNavigation,
  commandAncestorIds,
  commandAreaDestination,
  flattenCommandNavigation,
  searchCommandNavigation,
  type CommandCenterGroup,
  type CommandCenterNode,
  type CommandCenterPage,
  type CommandCenterPermissionCheck,
} from "./enterprise-command-center-model";

export interface EnterpriseCommandCenterNavigationProps {
  session: Session;
  sessionScopeKey: string;
  moduleId: string;
  activeGlobalId?: GlobalNavigationId;
  activeContext: (entry: ContextNavigationItem) => boolean;
  canView: CommandCenterPermissionCheck;
  contextVisible: (entry: ContextNavigationItem) => boolean;
  destinationForGlobalItem: (item: GlobalNavigationItem) => { route: string; capabilityModuleId?: string };
  goRoute: (route: string, capabilityModuleId?: string) => void;
  collapsed: boolean;
  onExpand: () => void;
  contextualRouteActive?: boolean;
  contextualTools?: ReactNode;
  contextualRecents?: ReactNode;
}

interface NavigationMemory {
  expanded: Readonly<Record<string, boolean>>;
  favorites: readonly string[];
  recentPages: readonly string[];
}

function createNavigationMemory() {
  let snapshot: NavigationMemory = { expanded: {}, favorites: [], recentPages: [] };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update: (change: (current: NavigationMemory) => NavigationMemory) => {
      const next = change(snapshot);
      if (next === snapshot) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}

// Both desktop and portaled Sheet use the same session memory. No browser or
// server persistence, records, labels, queries or business data are stored.
// Favorite/visit identity is a canonical module or adapter-context page ID:
// Cloud Storage and Admin Center therefore remain different destinations.
const sessionMemories = new Map<string, ReturnType<typeof createNavigationMemory>>();
function memoryFor(scope: string) {
  let memory = sessionMemories.get(scope);
  if (!memory) {
    memory = createNavigationMemory();
    sessionMemories.set(scope, memory);
  }
  return memory;
}

const isPlainActivation = (event: React.MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** A navigation overlay only. All navigation is delegated to the approved host. */
export function EnterpriseCommandCenterNavigation(props: EnterpriseCommandCenterNavigationProps) {
  // Keying this child prevents search or disclosure state from crossing a session
  // change; the outer prop belongs to the host's existing scope identity.
  return <CommandCenterSession key={props.sessionScopeKey} {...props} />;
}

function CommandCenterSession({
  session, sessionScopeKey, moduleId, activeGlobalId, activeContext, canView,
  contextVisible, destinationForGlobalItem, goRoute, collapsed, onExpand,
  contextualRouteActive = false, contextualTools, contextualRecents,
}: EnterpriseCommandCenterNavigationProps) {
  const instanceId = useId();
  const memory = useMemo(() => memoryFor(sessionScopeKey), [sessionScopeKey]);
  const navigation = useSyncExternalStore(memory.subscribe, memory.getSnapshot, memory.getSnapshot);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const areas = buildEnterpriseCommandNavigation({ session, canView, contextVisible });
  const pages = flattenCommandNavigation(areas);
  const candidatePages = pages.filter((page) => page.context ? activeContext(page.context) : page.moduleId === moduleId);
  const currentPage = candidatePages.find((page) => page.moduleId === "signin-design" && !page.context)
    || candidatePages.find((page) => page.context?.kind === "hub")
    || candidatePages[0];
  const isCurrentPage = (page: CommandCenterPage) => page.id === currentPage?.id;
  const isActivePage = (page: CommandCenterPage) => !contextualRouteActive && isCurrentPage(page);
  const activeAncestors = commandAncestorIds(areas, isCurrentPage);
  const activeAncestorKey = activeAncestors.join("|");
  const activeAncestorSet = new Set(activeAncestors);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const favorites = navigation.favorites.flatMap((id) => pagesById.has(id) ? [pagesById.get(id)!] : []);
  const recentPages = navigation.recentPages.flatMap((id) => pagesById.has(id) ? [pagesById.get(id)!] : []).slice(0, 5);
  const currentPageId = currentPage?.id;
  const results = searchCommandNavigation(pages, query);
  const searching = query.trim().length > 0;
  const searchId = `${instanceId}-search`;

  useEffect(() => {
    const ancestors = activeAncestorKey ? activeAncestorKey.split("|") : [];
    memory.update((current) => {
      const needsExpansion = ancestors.some((id) => current.expanded[id] !== true);
      const needsRecent = currentPageId && current.recentPages[0] !== currentPageId;
      if (!needsExpansion && !needsRecent) return current;
      return {
        ...current,
        expanded: needsExpansion ? { ...current.expanded, ...Object.fromEntries(ancestors.map((id) => [id, true])) } : current.expanded,
        recentPages: needsRecent ? [currentPageId, ...current.recentPages.filter((id) => id !== currentPageId)].slice(0, 8) : current.recentPages,
      };
    });
  }, [activeAncestorKey, currentPageId, memory]);

  const isExpanded = (id: string) => navigation.expanded[id] ?? activeAncestorSet.has(id);
  const setExpanded = (id: string, expanded: boolean) => memory.update((current) =>
    current.expanded[id] === expanded ? current : { ...current, expanded: { ...current.expanded, [id]: expanded } },
  );

  const toggleFavorite = (page: CommandCenterPage, trigger: HTMLButtonElement) => {
    // Operates only on the currently authorized projection, never a stale label.
    if (!pagesById.has(page.id)) return;
    const removingFromShortcuts = navigation.favorites.includes(page.id)
      && trigger.closest('[data-shortcuts="favorites"]');
    memory.update((current) => ({
      ...current,
      favorites: current.favorites.includes(page.id)
        ? current.favorites.filter((id) => id !== page.id)
        : [...current.favorites, page.id],
    }));
    if (removingFromShortcuts) requestAnimationFrame(() => searchInput.current?.focus());
  };

  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, page: CommandCenterPage, capabilityModuleId = page.permissionModuleId) => {
    if (!isPlainActivation(event)) return;
    event.preventDefault();
    setQuery("");
    goRoute(page.route, capabilityModuleId);
  };

  const activateRail = (area: CommandCenterGroup) => {
    setExpanded(area.id, true);
    onExpand();
    requestAnimationFrame(() => {
      if (window.matchMedia("(min-width: 1025px)").matches) {
        document.getElementById(`${instanceId}-${area.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-toggle`)?.focus();
      }
    });
  };

  const renderPage = (page: CommandCenterPage, keyPrefix = "page", showPath = false) => {
    const favorite = navigation.favorites.includes(page.id);
    const current = (keyPrefix === "page" || keyPrefix === "result") && isActivePage(page);
    return (
      <li key={`${keyPrefix}-${page.id}`} className="ecc-page" data-current={current || undefined}>
        <div className="ecc-page-row">
          <a className="ecc-page-link" href={page.route}
            aria-current={current ? "page" : undefined}
            onClick={(event) => navigate(event, page)}>
            <span className="ecc-page-copy">
              <span className="ecc-page-label">{page.label}</span>
              {showPath && <span className="ecc-page-path">{page.breadcrumb.join(" / ")}</span>}
            </span>
          </a>
          <button type="button" className="ecc-favorite-button" aria-pressed={favorite}
            aria-label={`${favorite ? "Remove" : "Add"} ${page.label} ${favorite ? "from" : "to"} favorites`}
            title={favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={(event) => toggleFavorite(page, event.currentTarget)}>
            <Star size={14} aria-hidden="true" fill={favorite ? "currentColor" : "none"} />
          </button>
        </div>
      </li>
    );
  };

  const renderGroup = (group: CommandCenterGroup, depth: number): ReactNode => {
    const expanded = isExpanded(group.id);
    const panelId = `${instanceId}-${group.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const current = activeAncestorSet.has(group.id)
      || (depth === 0 && group.globalId === (currentPage?.globalId || activeGlobalId));
    const Icon = group.source?.icon;
    const destination = group.source ? commandAreaDestination(group, destinationForGlobalItem) : undefined;
    return (
      <li key={group.id} className={`ecc-group ${depth === 0 ? "ecc-area" : "ecc-subgroup"}`}
        data-current-ancestor={current || undefined} data-pinned={group.source?.pinned || undefined}>
        <div className="ecc-group-row">
          <button type="button" id={`${panelId}-toggle`} className="ecc-disclosure" aria-expanded={expanded} aria-controls={panelId}
            onClick={() => setExpanded(group.id, !expanded)}>
            {Icon && <Icon className="ecc-area-icon" size={18} aria-hidden="true" strokeWidth={1.8} />}
            <span className="ecc-group-label">{group.label}</span>
            <ChevronDown className="ecc-chevron" size={14} aria-hidden="true" />
          </button>
          {destination && <a className="ecc-area-open" href={destination.route}
            aria-label={`Open ${group.label}: ${destination.page.label}`}
            title={`Open ${destination.page.label}`}
            onClick={(event) => navigate(event, destination.page, destination.capabilityModuleId)}>
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>}
        </div>
        <ul className="ecc-children" id={panelId} hidden={!expanded}>
          {group.children.map((child: CommandCenterNode) => child.kind === "page" ? renderPage(child) : renderGroup(child, depth + 1))}
        </ul>
      </li>
    );
  };

  const renderShortcuts = (label: string, id: string, shortcutPages: CommandCenterPage[], Icon: typeof Star) => {
    if (!shortcutPages.length) return null;
    const expanded = navigation.expanded[id] ?? true;
    const panelId = `${instanceId}-${id}`;
    return <section className="ecc-shortcuts" data-shortcuts={id} aria-label={label}>
      <button type="button" className="ecc-shortcuts-toggle" aria-expanded={expanded} aria-controls={panelId}
        onClick={() => setExpanded(id, !expanded)}>
        <Icon size={13} aria-hidden="true" />
        <span>{label}</span><ChevronDown className="ecc-chevron" size={13} aria-hidden="true" />
      </button>
      <ul id={panelId} className="ecc-shortcut-list" hidden={!expanded}>
        {shortcutPages.map((page) => renderPage(page, id, true))}
      </ul>
    </section>;
  };

  return (
    <nav className="ecc-navigation" data-approved-postlogin="qa-review-v115"
      data-command-center="enterprise-v1" data-collapsed={collapsed} aria-label="Enterprise command center">
      <div className="ecc-rail">
        <button type="button" className="ecc-rail-search" aria-label="Expand navigation to find a module"
          title="Find a module" onClick={() => {
            onExpand();
            requestAnimationFrame(() => {
              if (window.matchMedia("(min-width: 1025px)").matches) searchInput.current?.focus();
            });
          }}><Search size={19} aria-hidden="true" /></button>
        <ul className="ecc-rail-list">
          {areas.map((area) => {
            const Icon = area.source!.icon;
            const current = area.globalId === (currentPage?.globalId || activeGlobalId);
            return <li key={`rail-${area.id}`}>
              <button type="button" className="ecc-rail-button" data-current-ancestor={current || undefined}
                aria-label={`Open ${area.label} navigation${current ? ", current area" : ""}`}
                title={area.label} onClick={() => activateRail(area)}>
                <Icon size={20} aria-hidden="true" strokeWidth={1.8} />
                <span className="ecc-rail-label">{area.label}</span>
              </button>
            </li>;
          })}
        </ul>
      </div>
      <div className="ecc-full">
        <div className="ecc-search-section">
          <span className="ecc-eyebrow">Command center</span>
          <div className="ecc-search-box">
            <Search size={16} aria-hidden="true" />
            <label className="ecc-sr-only" htmlFor={searchId}>Find a module</label>
            <input ref={searchInput} id={searchId} type="search" value={query}
              placeholder="Find a module…" autoComplete="off" spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
                }
              }} />
            {query && <button type="button" className="ecc-clear-search" aria-label="Clear module search"
              onClick={() => { setQuery(""); searchInput.current?.focus(); }}><X size={15} aria-hidden="true" /></button>}
          </div>
        </div>
        <div className="ecc-scroll-region">
          {searching ? <section className="ecc-search-results" aria-label="Module search results">
            <p className="ecc-result-count" role="status">{results.length} {results.length === 1 ? "page" : "pages"} found</p>
            {results.length ? <ul className="ecc-result-list">{results.map((page) => renderPage(page, "result", true))}</ul>
              : <p className="ecc-no-results">No matching pages. Try a module or workspace name.</p>}
          </section> : <>
            {renderShortcuts("Favorites", "favorites", favorites, Star)}
            <span className="ecc-section-label">Workspaces</span>
            <ul className="ecc-area-list">{areas.map((area) => renderGroup(area, 0))}</ul>
            {contextualTools && <section className="ecc-contextual-tools" aria-label="Current workspace tools">{contextualTools}</section>}
            {renderShortcuts("Recently visited", "recent-pages", recentPages, History)}
            {contextualRecents && <section className="ecc-contextual-recents" aria-label="Recent records">{contextualRecents}</section>}
          </>}
        </div>
      </div>
    </nav>
  );
}
