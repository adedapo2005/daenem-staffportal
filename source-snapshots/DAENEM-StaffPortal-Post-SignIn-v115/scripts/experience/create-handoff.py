from pathlib import Path
import json,csv,re,hashlib
root=Path.cwd();out=root/'docs';mods=json.loads((out/'route-registry.json').read_text());check=json.loads((out/'contract-checks.json').read_text());by={m['id']:m for m in mods}
def csvfile(name,headers,rows):
 with (out/name).open('w',newline='') as f:
  w=csv.writer(f,lineterminator="\n");w.writerow(headers);w.writerows(rows)
csvfile('route-inventory.csv',['PAGE','SITE ROUTE','ERP FAMILY','PURPOSE','PRIMARY USER','PRIMARY ACTION','UNIQUE ARCHETYPE','STATUS'],[[m['title'],'/'+m['id'],m['family'],m['purpose'],' / '.join(m['roles']),m['primary'],m['archetype'],'Implemented prototype; browser review not performed'] for m in mods]+[['Daenem Sign-In','/signin','Authentication','Simulate Daenem-owned authentication','Provisioned staff','Sign in','Photographic environment + authentication workspace','Implemented prototype; browser review not performed'],['Prior cycle study','/review/cycle-1','Historical review','Preserve the previous design checkpoint','Owner reviewer','Compare previous study','Original cycle 1 study','Preserved, not current governing design']])
csvfile('page-archetypes.csv',['PAGE','WORKFLOW TYPE','ARCHITECTURE','WHY THIS STRUCTURE','VISUAL SIGNATURE'],[[m['title'],m['kind'],m['archetype'],m['purpose'],{'printing':'Stage lanes and machine-load strip','bakery':'Timed batch tracks and yield reconciliation','autos':'Vehicle inventory selector and acquisition/sales inspector','logistics':'Schematic route canvas and dispatch queue','properties':'Portfolio cards with unit occupancy grids','finance':'Cash reconciliation ribbon and ledger','profile':'Employee identity cover and comprehensive self-service tabs','payroll':'Sequential readiness gates and payroll worksheet','attendance':'Explicit clocking control, calendar and event timeline','approvals':'Queue / evidence / decision columns','security':'Investigative stream and severity matrix','studio':'Composition or appearance gallery with scoped inspector'}.get(m['kind'],m['archetype'])] for m in mods])
section_map={3:'signin',4:'signin',5:'theme',6:'hub',7:'all',8:'all',9:'layout',10:'layout',11:'access',12:'home',13:'cockpit',14:'profile',15:'people',16:'attendance',17:'payroll',18:'applications',19:'printing',20:'bakery',21:'autos',22:'logistics',23:'properties',24:'finance',25:'expenses',26:'inventory',27:'projects',28:'facilities',29:'social',30:'communications',31:'help',32:'security',33:'access',34:'admin',35:'integrations',36:'hub',37:'layout',38:'sync',39:'all',40:'all',41:'all',42:'all',43:'all',44:'all',45:'hub',46:'all',47:'notifications',48:'all',49:'all',50:'all'}
# Conservative feature-level source audit: literal coverage is not equivalent to tested UX.
source='\n'.join(p.read_text() for p in (root/'app/experience').glob('*.tsx'))+'\n'+(root/'app/experience/model.ts').read_text()
norm=lambda s:re.sub(r'[^a-z0-9]+',' ',s.lower()).strip()
normalized=norm(source)
features=[];section=0
for line in (out/'source-brief.md').read_text().splitlines():
 match=re.search(r'# =+\s+(\d+)\.',line)
 if match:section=int(match[1])
 if line.startswith('- ') and section in section_map:
  feature=line[2:].strip();route=section_map[section];present=norm(feature) in normalized
  if section==7:implemented='Responsive CSS declared; browser evidence missing';interactive='UNVERIFIED'
  elif section in [8,9,42,43,50]:implemented='PARTIAL / source-level representation';interactive='UNVERIFIED'
  else:implemented='Source representation found' if present else 'PARTIAL / not separately verified';interactive='Prototype controls exist; this feature is not browser-tested'
  notes='Literal source coverage is conservative and is not completion certification.'
  if section==38:notes='Device-local demo storage and simulated sync. No installable offline PWA/service worker or background tracking is implemented.'
  if section==21:notes='Vehicle sales is active. Historical workshop records are read-only.'
  if section==16:notes='Sign-in and attendance are separate. Explicit demo location/photo and both clock events are required.'
  features.append([feature,'/'+route if route!='all' else 'Cross-cutting',implemented,interactive,'Role + company + granular demo override','Fictional fixtures / device-local simulation',notes,str(section)])
csvfile('feature-coverage.csv',['FEATURE','PAGE/ROUTE','IMPLEMENTED','INTERACTIVE','ROLE/PERMISSION CONTEXT','DATA SOURCE MODE','NOTES','BRIEF SECTION'],features)
visuals=[('Overview','Area','Revenue and operating cost over time','Compare movement in a selected fixture period','Period selector; tooltip; drill-down'),('Operational Cockpit','Multi-series line','Operational performance vs comparison','Monitor operational movement','Tooltip; workspace drill-down'),('Attendance','Calendar heatmap','Complete, incomplete and no-event days','Expose temporal attendance exceptions','Day selection; explicit clock events'),('Payroll','Bullet/proportional bars','Gross, deduction and net composition','Keep preparation financially legible','Readiness stages; record review'),('Recruitment','Funnel & stage lanes','Candidate movement','Keep review stage visible','Candidate details; filtering'),('Printing','Production lanes & utilization bars','WIP and machine load','Show lifecycle and resource context','Job details; material gate'),('Bakery','Batch timeline & grouped bars','Expected/actual yield and ingredient consumption','Support accountability and production chronology','Batch selection; record edit'),('Autos','Aging bars & grouped bars','Inventory age, landed cost and asking price','Compare capital tied up and prospective margin','Vehicle selection; record drill-down'),('Logistics','Route schematic & progress timeline','Trip relationships and required POD','Join route context with queue','Route node and queue selection; trip detail'),('Properties','Unit occupancy matrix','Occupied and available units','Expose portfolio composition','Unit launch to leases'),('Finance','Area & waterfall','Opening + inflow - outflow = closing','Show cash movement and reconciliation','Period selection; tabs; records'),('Receivables','Horizontal aging bars','Outstanding receivables by aging bucket','Prioritize collection attention','Record drill-down'),('Spend','Treemap','Spend distribution by company','Compare contribution to spend exposure','Source record drill-down'),('Projects','Gantt-style timeline','Milestones and completion','Align chronology with ownership','Project selection'),('Inventory','Availability bars','Stock and movement priority','Surface inventory risks','Record drill-down'),('Marketing','Conversion funnel & scatter/bubble','Audience journey and spend/response','Show conversion and comparative results','Campaign drill-down; tooltip'),('Security','Event line & severity matrix','Sign-in events and review risk','Support investigation','Event drill-down'),('Profile','Radial-like completeness number & progress bar','Required profile completion','Prioritize missing employee information','Section links and forms')]
csvfile('visualization-inventory.csv',['PAGE','VISUALIZATION TYPE','METRIC/QUESTION','WHY APPROPRIATE','INTERACTIONS'],visuals)
viewports=[(390,844),(768,1024),(1024,1366),(1672,941),(1920,1080),(2560,1440),(3840,2160)]
required=['Sign-In','Owner Home','Employee Home','Operational Cockpit','My Profile','Expense Approval Master–Detail','Finance Data Workspace','Logistics Map Workspace','Admin / Layout Studio']
csvfile('responsive-evidence.csv',['SCREEN']+[f'{w}x{h}' for w,h in viewports],[[s]+['NOT RUN — Cloud Browser URL policy blocked local preview']*7 for s in required])
states=[('Loading','All workspaces','Skeleton + finish demo loading control'),('Empty','All workspaces','No authorized records; return control'),('Error','All workspaces','Retry copy and retained draft explanation'),('Offline','All workspaces / Sync','Device-local draft persistence and explicit demo offline mode'),('Stale','All workspaces','Stale banner with fixture update time'),('Permission denied','All workspaces','Route gate with no target content'),('No results','All workspaces / search','Filtered empty state'),('Success','Record, approval, attendance, preferences','Toast and local state/audit changes'),('Warning','Required evidence and incomplete attendance','Explanation and resolution action'),('Sync conflict','Sync & Sessions','Local vs remote fixture comparator'),('Unavailable integration','API & Integrations / Social Accounts / Resources','No invented health/credentials')]
csvfile('state-coverage.csv',['STATE','SCREENS','REPRESENTATION','BROWSER STATUS'],[list(x)+['Not tested — blocked'] for x in states])
csvfile('adapter-map.csv',['MODULE','FIXTURE SOURCE','PRODUCTION DATA BOUNDARY','EXPECTED ADAPTER','MUTATION BOUNDARY','AUTHORIZATION DEPENDENCY'],[[m['title'],'app/experience/model.ts seedRecords / explicit illustrative chart data','PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION','ProductionAdapter.list / ProductionAdapter.mutate (typed interface only)','Local React state / device storage; source mutationError for record actions','Company + role + granular override in demo; production Worker/API remains authoritative'] for m in mods])
assets=[['daenem-campus.png','/signin and Sign-In Personalization','Generated once with ImageGen','1672x941 native; NOT 4K','Photographic campus; no factual production site claim'],['DAENEM monogram','Global shell, sign-in, profile and document preview','Authored SVG logo geometry','Vector','New concept logo; owner acceptance pending'],['Lucide icons','Across application','lucide-react declared dependency','Vector','Functional icon system'],['Route schematic','Logistics and cockpit','Authored SVG diagram','Vector','Illustrative topology, not a factual live map'],['Inter Variable','Body and operational UI','Official Google Fonts repository / ofl/inter','Variable TTF: weight 100–900; optical size 14–32','Bundled with SIL OFL 1.1; exact sources and SHA-256 in font-sources.json'],['Manrope Variable','Headings and key metrics','Official Google Fonts repository / ofl/manrope','Variable TTF: weight 200–800','Bundled with SIL OFL 1.1; exact sources and SHA-256 in font-sources.json']]
csvfile('asset-manifest.csv',['ASSET','USED AT','SOURCE','RESOLUTION','NOTES'],assets)
report=f'''# Daenem Staff Portal — Experience build checkpoint

This is a private design-lab implementation built from the supplied 58-section contract. It is **not accepted, independently graded, or certified at 99%**. The previous cycle remains available at `/review/cycle-1`.

## Current status

`STAFFPORTAL_SITES_BUILD_CHECKPOINT_BROWSER_QA_BLOCKED`

- Primary workspaces registered: **{len(mods)}**.
- Additional surfaces: `/signin`, each supported record at `/workspace-id/record-id`, and the prior review study.
- Source contract checks: **{check['passed']}/{check['total']} PASS**.
- TypeScript and framework build: see final validation report; passing source checks do not prove visual quality.
- Browser / screenshot / responsive verification: **NOT RUN**. Cloud Browser rejected the internal local preview URL under its URL access policy. No alternate browser or host was used to bypass it.
- Independent owner review: **PENDING**.
- Daenem production deployment, GitHub writes, production D1 writes, production Cloudflare changes: **NONE**.
- Authentication model: **Daenem-owned authentication represented by an explicitly local demo session**. Platform access to the private Site is separate from the simulated application's business authentication.

## 1. Private interactive Site

The existing `DAENEM STAFF PORTAL — PREMIUM EXPERIENCE LAB` is reused. The final response provides a private URL only if native Sites publication succeeds. No production Daenem domain is connected.

At sign-in, expand **DEVELOPMENT PREVIEW ONLY**, choose Owner / Manager / Employee, and choose **Fill demo credentials**. The credentials are fictional and never transmitted or stored. Authentication error states can be selected in that same reviewer control. After signing in, the development strip opens role, company and data-state controls.

## 2. Route inventory

See `route-inventory.csv` for every workspace, exact Site route, ERP family, purpose, primary user, primary action, archetype and source status. Routing uses one React path dispatcher; a registered route is not a claim of browser QA or full feature acceptance.

## 3. Feature coverage

See `feature-coverage.csv` for **{len(features)} individual bullet requirements** extracted from the supplied brief. The matrix is intentionally conservative. A literal source representation is marked separately from a partial or unverified requirement. No feature is marked browser-tested without evidence.

## 4. Authentication flow map

```mermaid
flowchart TD
  A["Daenem sign-in"] --> B["Local demo session"]
  A --> C["Recovery / identity verification"]
  C --> D["Verification code"]
  D --> E["New password + confirmation"]
  E --> F["Recovery success"]
  F --> A
  G["Authorized invitation"] --> H["Activation / password setup"]
  H --> E
  A --> I["Invalid / locked / rate-limited / unavailable"]
  I --> A
  B --> J["Session expiry or secure sign-out"]
  J --> A
```

The state selector also exposes temporary password expiry, required replacement, mismatched confirmation, invalid/expired codes, location permission, geofence restriction, offline state and profile onboarding. There is no public employee registration. No actual passwords are changed. A local password challenge gates bank-detail reveal, permission-override application and recovery issuance; it includes mismatch feedback, cancel and verified continuation. It uses the fictional password DEMO-CONFIRM, never a production credential. Several invitation/activation edge cases remain state representations rather than an end-to-end lifecycle.

## 5. Role and permission matrix

| Context | Home | Navigation / records | Actions |
|---|---|---|---|
| Owner | Group command with business and exception drill-downs | All role-permitted companies; selectable company; explicit No Access override removes data and search targets | Authorized simulated management and review; maker-checker applies |
| Manager | Team and exception-oriented cockpit | Assigned company and permitted management workspaces; no Owner-only finance/security/access | Scoped simulated management and approvals |
| Employee | Own day, attendance, tasks and self-service | Own permitted records, no workforce aggregates or restricted admin registry | Own permitted creation/edits; no approvals or payslip edits |

Source checks verify company and employee filtering, View/Create/Edit distinctions, No Access, read-only historical workshop records and maker-checker restrictions. This is **frontend demo authorization, not production security certification**.

## 6. Page archetypes

See `page-archetypes.csv`. Printing uses stage lanes; Bakery uses batch tracks and yield reconciliation; Autos uses inventory selection and sales economics; Logistics combines schematic routes and dispatch; Properties uses unit occupancy; Finance uses a reconciliation ribbon and ledger; Payroll uses readiness gates; Profile uses identity and self-service sections; Security uses an investigative event stream. Shared record tables and forms are used for suitable supporting pages.

## 7. Visualization inventory

See `visualization-inventory.csv`. Implemented chart primitives include area, line, grouped bars, donut support, scatter/bubble, proportional bars, a waterfall, treemap, funnel, calendar heatmap, unit matrix, Gantt-style timeline and route schematic. Charts use fictional datasets. Finance period totals, the plotted series and the cash bridge now derive from one selected-period fixture. Other domain metrics still require a dedicated coherence review. Some domain summaries remain illustrative independent fixtures and need coherence review against editable records.

## 8. Responsive evidence

See `responsive-evidence.csv`: nine required screen classes by seven required viewport sizes. **Every browser evidence cell is explicitly NOT RUN**. No screenshots, metrics, pixel-fidelity grade, contrast audit or overflow pass is fabricated. Responsive CSS includes mobile drawers, mobile record cards, stacked master–detail, media queries for tablet, desktop and 4K, and larger rem-based type at wide resolutions. These declarations still require visual QA.

## 9. State coverage

See `state-coverage.csv`. Loading, empty, error, offline, stale, permission denied, no results, success, warning, conflict and unavailable integration are represented. Offline and conflict behavior are simulations with device-local storage, not the production synchronization engine.

## 10. Design system

- Direction: dark green organizational navigation, clear white working surfaces, restrained botanical accents, purpose-specific domain color, crisp typographic hierarchy and a photographic sign-in.
- Type: Bundled Inter Variable for body/UI and Manrope Variable for display text, licensed under SIL OFL 1.1; system fallback remains available while loading. Main type uses rem units; the new experience stylesheet has no authored font-size below 0.75rem at a 16px root.
- Spacing: 0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2rem; comfortable, standard and compact density adjust panel/table rhythm.
- Surfaces: solid operational surfaces; translucency reserved for sign-in; 7–12px interface radii and restrained shadows.
- Status: text accompanies semantic color; required / review / incomplete uses amber, approved / present uses green, failures use red.
- Icons: Lucide SVGs and an authored vector DAENEM monogram.
- Charts: visible units and Demo Data labels; tooltips and drill-downs where implemented. No schematic geography is called live GPS.
- Responsive: primary shifts around 767, 1024, 1250/1400, 2200, 2560 and 3200px. 390px uses single-column records and drawers. Seven-size validation remains blocked.
- Motion: Off / Calm / Balanced / Expressive plus `prefers-reduced-motion`; no strobing.
- Accessibility: semantic controls, labels, skip link, focus styling, Radix dialogs/sheets/tabs/select and command palette. Actual keyboard, touch, zoom and contrast testing remains outstanding.
- Layout: ten distinct home compositions. `resolveLayout` implements forced organization → permitted personal → role → ERP → organization → Executive fallback. Domain workspaces retain their functional architecture. Independent selection of theme, layout, density, motion and navigation is represented.

## 11. Assets

See `asset-manifest.csv`. The sign-in source is **1672×941**, not a native 4K image. It has not been falsely relabelled or upscaled as native 4K. A suitable higher-resolution replacement is required before accepting the 4K image requirement. No externally sourced factual employee photos or production location images are claimed.

## 12. Data / API adapter map

See `adapter-map.csv`. All major modules use fixture data and local simulations. The `ProductionAdapter` interface describes listing and mutation boundaries but is not connected. Every unknown production contract is explicitly marked **PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION**. No invented production endpoints, tokens, D1 schema or banking integration are supplied.

## 13. Component inventory

- Shell: Portal, Logo, authorized navigation, company context, development simulator, command palette, global action/help sheets, sign-out dialog.
- Primitives: Btn, IconBtn, Pick, Badge, Avatar, Panel, Empty, Callout, Steps, Timeline, RecordsTable, DownloadCSV.
- Records: RecordEditor, RecordDetail, LocalEvidence viewer for device-local PDF/image/text attachments, local record mutation and history; profile document reader and explicit policy acknowledgement.
- Charts: lazy-loaded Recharts implementation, Viz, Bars, RouteMap, Weather, timeline/matrix/domain compositions.
- Experiences: Homes (ten structural variants and role homes), Profile (ten self-service sections), Attendance, Calendar, People, Payroll, Payslips, Board, Bakery, Autos, Logistics, Properties, Finance, Approvals, Operations, StaffWork, Communications, Audit, Studio, Access, Policy, Integrations, Sync, Recovery, Support, Toolbox and Help.
- State: typed module registry, fixture records, permissions, mutation validation, device-local draft hooks and preferences.

## 14. Transfer notes

The Site uses React on the existing Vinext starter. Preserve production logic and map accepted frontend behavior through real Daenem adapters later. Recharts and business workspaces are lazy-loaded; Inter and Manrope font files and their license notices are bundled; Lucide provides icons; installed Radix/Shadcn primitives provide interaction semantics. The historical cycle-1 page and styles are preserved for comparison.

Records are local demo objects. Expense approval and employee expense views share the same request objects. Only submitted requests enter the pending decision queue; request makers cannot decide their own requests. Global search and counts use the same authorized record union as the workspace views. Returned requests can be corrected and resubmitted. Required material usage, yield, POD and receipts gate completion. Payroll values and statutory configuration are illustrative; no real statutory calculation or payment is performed. Attendance requires separate explicit clock-in and clock-out. Profile, selected draft composers and preference history use local storage. Device data is not cross-device durable and is not a substitute for the existing offline engine.

Transfer only owner-accepted designs. Do not transfer the role simulator, fake credentials, simulated consent, fixture telemetry, synthetic chart values or browser-review controls into production.

## 15. Known gaps

| Class | Gap | Consequence |
|---|---|---|
| RESPONSIVE / VISUAL / ACCESSIBILITY | Browser preview blocked by Cloud Browser URL policy | No responsive, screenshot, keyboard, contrast, zoom or motion QA can be claimed |
| VISUAL | Sign-in photo is native 1672×941 | Native crisp 4K image requirement remains unmet |
| INTERACTION | Secondary business processes use shared record forms; some detailed subflows are only represented conceptually | POS checkout, detailed stock transfers, supplier procurement, vehicle documentation, advanced table bulk/column tools, and full recruitment/HR lifecycle handoffs require deeper completion and review |
| INTERACTION | Record attachments have local PDF/image/text previews up to 2 MB; profile documents use readable fictional content | Production upload lifecycle, malware inspection, retention and real HR document integration remain unmapped |
| INTERACTION | Local reauthentication is implemented for selected sensitive actions; activation and invitation edge cases remain partial | Full provisioned-employee lifecycle and production identity integration require further review |
| INTERACTION | Ten layout selections change home composition; specialized ERP pages retain their own architecture | Ten complete compositions for every business workspace are not implemented |
| DATA | Some chart summaries and workflow demos are independent fixtures | All KPI-to-record relationships require a dedicated coherence review |
| DATA / SITE-RUNTIME | Device-local drafts and simulated sync only | No installable offline PWA, service worker, true conflict merge, continuous GPS or background tracking |
| INTEGRATION | Production APIs, identity, RBAC, payroll, provider telemetry and storage are disconnected | Intentional design-lab boundary; real contracts must be mapped later |
| PERFORMANCE | Source code splitting is implemented; no browser performance measurements | Interaction performance and high-density 4K rendering are ungraded |
| OTHER | Owner and independent reviewer have not inspected this checkpoint | This is not final acceptance or 99% certification |

## 16. Final status

```text
SITES_BUILD_STATUS:
STAFFPORTAL_SITES_BUILD_CHECKPOINT_BROWSER_QA_BLOCKED

PRODUCTION DEPLOYED: NO (Daenem production)
GITHUB MODIFIED: NO
PRODUCTION D1 WRITTEN: NO
PRODUCTION CLOUDFLARE MODIFIED: NO
AUTH MODEL: DAENEM OWN AUTHENTICATION REPRESENTED
PRIMARY WORKSPACES REGISTERED: {len(mods)}
READY FOR INDEPENDENT CHATGPT REVIEW: PARTIAL CHECKPOINT ONLY
FULL EXPERIENCE READY STATUS: NOT CLAIMED
```

The full requested ready status must not be issued until the above gaps and the required review are closed.
'''
(out/'DAENEM-STAFF-PORTAL-HANDOFF.md').write_text(report)
(out/'design-system.md').write_text(report.split('## 10. Design system')[1].split('## 11.')[0].strip())
(out/'known-gaps.md').write_text('# Known gaps\n\n'+report.split('## 15. Known gaps')[1].split('## 16.')[0].strip())
(out/'auth-flow-map.md').write_text('# Authentication flow\n\n'+report.split('## 4. Authentication flow map')[1].split('## 5.')[0].strip())
(out/'component-inventory.md').write_text('# Component inventory\n\n'+report.split('## 13. Component inventory')[1].split('## 14.')[0].strip())
(out/'handoff-notes.md').write_text('# Transfer notes\n\n'+report.split('## 14. Transfer notes')[1].split('## 15.')[0].strip())
print(json.dumps({'workspaces':len(mods),'features':len(features),'report_files':len(list(out.glob('*'))),'status':'CHECKPOINT_NOT_FINAL_ACCEPTANCE'}))
