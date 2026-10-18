import {activeEvidence} from './evidence-state';
import {printingLifecycle} from './printing-workflow-contract';
import {logisticsLifecycle} from './logistics-workflow-contract';
import {propertyPortfolioStates} from './property-portfolio-contract';
import type {FilePolicy} from './file-governance';
import {newModuleRows,enterpriseFixtures,businessError} from './enterprise-contract';
export type Role = 'Owner' | 'Experience Admin' | 'Manager' | 'Employee';
export type Company = 'group' | 'printing' | 'bakery' | 'autos' | 'logistics' | 'properties';
export type Mode = 'Demo Data' | 'Loading' | 'Empty' | 'Error' | 'Offline' | 'Stale' | 'Permission Denied' | 'No Results' | 'Sync Conflict' | 'Integration Unavailable';
export type Level = 'No Access' | 'View' | 'Create' | 'Edit' | 'Approve' | 'Manage';
export const accessLevels: Level[] = ['No Access','View','Create','Edit','Approve','Manage'];
export const specializedActions = ['export','print','publish','pay','delete','issuePassword','override','assign','reconcile','close','reopen','investigate','connectIntegration','manageSecrets','runDiagnostic','generateCommunication','sendCommunication','approveCommunication','manageCommunications','manageTemplates','createTransfer','approveTransfer','rejectTransfer','executeTransfer','manageBeneficiaries','manageBankAccounts','createPayroll','approvePayroll','executePayroll','reconcilePayroll','approvePayments','manageCashPosition','createReports','downloadAudit','bakery.flour_control'] as const;
export type SpecializedAction = typeof specializedActions[number];
export type ScopeKind = 'GROUP'|'COMPANY'|'BUSINESS_UNIT'|'DEPARTMENT'|'LOCATION'|'SITE'|'TEAM'|'OWN'|'ASSIGNED'|'RECORD_TYPE'|'BANK_ACCOUNT'|'BRANCH'|'COST_CENTRE'|'PAYROLL_BATCH'|'TRANSACTION'|'REPORT'|'PROJECT'|'BUILDING'|'AREA'|'WORK_PACKAGE';
export interface Assignment { module: string; level: Level; companies: Company[]; scope: ScopeKind; values?: string[]; startsAt?: string; expiresAt?: string; capabilities: string[] }
export const STUDIO_SECTION_CAPABILITIES = [
    { id: 'studio:themes', section: 'Themes', label: 'Themes' },
    { id: 'studio:layout', section: 'Layout', label: 'Layout Editor' },
    { id: 'studio:widgets', section: 'Widgets', label: 'Widget Library' },
    { id: 'studio:custom-widgets', section: 'Custom Widgets', label: 'Custom Widget Builder' },
    { id: 'studio:brand', section: 'Brand', label: 'Logo & Brand' },
    { id: 'studio:wording', section: 'Wording', label: 'Wording' },
    { id: 'studio:style', section: 'Style', label: 'Style Controls' },
    { id: 'studio:motion', section: 'Motion', label: 'Motion' },
    { id: 'studio:responsive', section: 'Responsive', label: 'Responsive Preview' },
    { id: 'studio:ai', section: 'AI Copilot', label: 'AI Design Copilot' },
    { id: 'studio:versions', section: 'Versions', label: 'Versions' },
    { id: 'studio:compare', section: 'Compare', label: 'Compare' },
    { id: 'studio:integration', section: 'Integration', label: 'Integration' },
    { id: 'studio:publish', section: 'Publish', label: 'Publish' },
] as const;
export type StudioCapabilityId = typeof STUDIO_SECTION_CAPABILITIES[number]['id'];
export type StudioCapabilitySection = typeof STUDIO_SECTION_CAPABILITIES[number]['section'];
export interface Session {
    role: Role;
    company: Company;
    personId: string;
    overrides: Record<string, Level>;
    roles?: Role[];
    assignments?: Assignment[];
    provisional?: boolean;
    capabilities?: Record<string,string[]>;
    fieldRules?: Record<string,'hidden'|'read'|'edit'>;
    timedOverrides?: Record<string,{level:Level;startsAt:string;expiresAt:string;reason:string}>;
    displayName?: string;
    profile?: string;
    displayTimeZone?: string;
}
export interface RecordData {
    id: string;
    module: string;
    title: string;
    subtitle: string;
    company: Company;
    status: string;
    owner: string;
    amount: number;
    due: string;
    fields: Record<string, string>;
    evidence: string[];
    scopeData?: Partial<Record<ScopeKind,string>>;
    revision?: number;
    filePolicies?:Record<string,FilePolicy>;
    evidenceData?: Record<string, {
        mime: string;
        data: string;
    }>;
    history: {
        action: string;
        actor: string;
        time: string;
    }[];
    communicationProjection?: {
        awaitingStaffReply?: boolean;
        lastStaffReplyAt?: string | null;
    };
}
export interface ModuleDef {
    id: string;
    canonicalPath: string;
    title: string;
    family: string;
    purpose: string;
    primary: string;
    archetype: string;
    kind: string;
    roles: Role[];
    company?: Company;
    stages: string[];
    fields: string[];
    required?: string;
}
export const companies: {
    id: Company;
    name: string;
    short: string;
    color: string;
}[] = [
    { id: 'group', name: 'Daenem Group', short: 'Group', color: '#166c5b' }, { id: 'printing', name: 'Daenem Printing & Technology', short: 'Printing', color: '#377ce6' }, { id: 'bakery', name: 'Daenem Bakery', short: 'Bakery', color: '#bf6d31' }, { id: 'autos', name: 'Daenem Autos', short: 'Autos', color: '#7968c6' }, { id: 'logistics', name: 'Daenem Logistics', short: 'Logistics', color: '#2c8b85' }, { id: 'properties', name: 'Daenem Homes & Properties', short: 'Properties', color: '#7c8c43' }
];
const all: Role[] = ['Owner', 'Manager', 'Employee'], manage: Role[] = ['Owner', 'Manager'], owner: Role[] = ['Owner'], experience: Role[] = ['Owner', 'Experience Admin'];
const moduleRows: Array<[
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    Role[],
    Company | undefined,
    string,
    string,
    string?
]> = [
    ['self-service', 'Self-Service', 'Staff ERP', 'Your assigned personal tasks, documents and requests.', 'Open assigned service', 'Personal Service Desk', 'self-service', all, undefined, 'Available', ''],
    ['home', 'Overview', 'Global', 'See the priorities and records available to you.', 'Review attention queue', 'Executive Command', 'home', all, undefined, 'Open|In Review|Resolved', 'Priority|Company|Owner'],
    ['cockpit', 'Operational Cockpit', 'Global', 'Resolve operational exceptions and keep work moving.', 'Inspect exception', 'Map & Exception Control Room', 'cockpit', manage, undefined, 'Open|Investigating|Resolved', 'Severity|Source|Owner'],
    ['workspace', 'My Workspace', 'Staff ERP', 'Complete your own work and personal requests.', 'Resume next task', 'Focus & Flow', 'work', all, undefined, 'To Do|In Progress|Done', 'Due Date|Assigned To|Priority'],
    ['profile', 'My Profile', 'Staff ERP', 'Manage your identity, employment and self-service information.', 'Complete profile', 'Identity & Self-Service', 'profile', all, undefined, 'Action Required|Verified', 'Work Email|Phone|Emergency Contact'],
    ['people', 'People & HR', 'Staff ERP', 'Find assigned employees and follow up on missing information.', 'Open employee record', 'People Directory & Record Inspector', 'people', manage, undefined, 'Active|Onboarding|On Leave', 'Employee ID|Job Title|Department|Manager|Start Date'],
    ['hr-records', 'HR Master Records', 'Staff ERP', 'Maintain authorized employment and statutory records.', 'Review HR record', 'Controlled HR Record Ledger', 'records', manage, undefined, 'Missing Information|In Review|Verified', 'Employment Type|Emergency Contact|Pension|PAYE|Payroll Bank'],
    ['attendance', 'Attendance & Location', 'Staff ERP', 'Record required attendance events and resolve incomplete days.', 'Clock in', 'Shift Timeline & Location Validation', 'attendance', all, undefined, 'Not Started|Incomplete|Present|Late', 'Clock In|Clock Out|Location|Photo|Override Reason'],
    ['leave', 'Leave Management', 'Staff ERP', 'Request time away and check team coverage before decisions.', 'Request leave', 'Absence Calendar & Request Rail', 'calendar', all, undefined, 'Draft|Submitted|Approved|Returned', 'Leave Type|Start Date|End Date|Reason'],
    ['performance', 'Performance Reviews', 'Staff ERP', 'Complete assigned reviews, commentary and acknowledgement.', 'Open review', 'Review Cycle & Scorecard', 'reviews', all, undefined, 'Not Started|Self Review|Manager Review|Acknowledged', 'Employee|Cycle|Goals|Self Rating|Review Notes|Manager Commentary'],
    ['hr-cases', 'HR Cases', 'Staff ERP', 'Handle scoped confidential employment cases and evidence.', 'Open case', 'Confidential Case Timeline', 'cases', manage, undefined, 'Open|Investigating|Action Required|Closed', 'Case Type|Confidentiality|Assignee|Case Notes'],
    ['lifecycle', 'Onboarding & Offboarding', 'Staff ERP', 'Coordinate accountable employee lifecycle tasks without treating checklist progress as verified access removal.', 'Create checklist', 'Lifecycle Checklist & Responsibility Map', 'lifecycle', manage, undefined, 'Identity|Assignment|Payroll|Acknowledgement|Complete', 'Employee|Lifecycle Type|Task Owner|Due Date'],
    ['forms', 'Forms Center', 'Staff ERP', 'Complete assigned forms and keep evidence with each submission.', 'Start form', 'Document Shelf & Form Workspace', 'forms', all, undefined, 'Draft|Submitted|Returned|Approved', 'Form Type|Purpose|Required Response', 'Required Response'],
    ['tasks', 'Tasks & Approvals', 'Staff ERP', 'Move assigned work forward with clear ownership.', 'Create task', 'Workstream Board', 'board', all, undefined, 'To Do|In Progress|Review|Done', 'Priority|Assigned To|Due Date'],
    ['payroll', 'Payroll Control', 'Staff ERP', 'Validate readiness and prepare controlled payroll batches.', 'Prepare payroll', 'Readiness Gates & Payroll Worksheet', 'payroll', owner, undefined, 'Prepare|Validate|Review|Approved|Draft Export', 'Period|Gross Pay|Deductions|Net Pay|Bank Validation|Statutory Configuration'],
    ['payslips', 'My Payslips', 'Staff ERP', 'Inspect your payroll statements and payment status.', 'View payslip', 'Statement Reader & Period Archive', 'payslips', all, undefined, 'Available|Payment Pending|Paid', 'Period|Gross Pay|Deductions|Net Pay'],
    ['payroll-batches', 'Bank Payment Batches', 'Staff ERP', 'Inspect batch evidence and prepare a draft export.', 'Prepare draft batch', 'Payment Batch Control Ledger', 'records', owner, undefined, 'Draft|Validation|Approval|Draft Export', 'Period|Payment Count|Bank Validation|Approval'],
    ['applications', 'Job Applications', 'Jobs ERP', 'Review candidates and move authorized applications through stages.', 'Review candidate', 'Candidate Pipeline', 'recruitment', manage, undefined, 'Applied|Screening|Interview|Offer|Hired', 'Role|Source|Application Date|Reviewer'],
    ['interviews', 'Interview Pipeline', 'Jobs ERP', 'Coordinate interview schedules and scorecards.', 'Schedule interview', 'Interview Calendar & Scorecards', 'calendar', manage, undefined, 'Scheduled|Interviewed|Scorecard Due|Reviewed', 'Candidate|Interviewer|Interview Date|Scorecard'],
    ['hiring', 'Hiring Workflow', 'Jobs ERP', 'Prepare approved candidate handoff to onboarding.', 'Review hiring readiness', 'Offer-to-Onboarding Handoff', 'lifecycle', manage, undefined, 'Approved|Offer Draft|Offer Accepted|Onboarding', 'Candidate|Approver|Start Date|Onboarding Owner'],
    ['printing', 'Printing Production', 'Printing & Technology', 'Keep commercial approval, production, QC, delivery and reconciliation connected without inventing payment confirmation.', 'Create print job', 'Commercial-to-Completion Job Workspace', 'printing', manage, 'printing', printingLifecycle.join('|'), 'Customer|Quantity|Paper Stock|Machine|Material Usage|QC Evidence', 'Material Usage'],
    ['print-orders', 'Customers & Print Orders', 'Printing & Technology', 'Track enquiries, quotes and customer commitments.', 'Create quotation', 'Quotation Ledger & Customer Inspector', 'records', manage, 'printing', 'Enquiry|Quoted|Approved|Ordered', 'Customer|Branch|Quantity|Quote Value|Delivery Date'],
    ['print-materials', 'Print Materials & Costing', 'Printing & Technology', 'Reconcile issued stock, actual use and job profitability.', 'Record material use', 'Consumption & Job Cost Worksheet', 'costing', manage, 'printing', 'Issued|Usage Pending|Reconciled', 'Job ID|Material|Issued Quantity|Actual Usage|Waste'],
    ['bakery', 'Bakery Production', 'Bakery ERP', 'Record ingredients and actual yield before completing batches.', 'Plan batch', 'Batch Timeline & Yield Reconciliation', 'bakery', manage, 'bakery', 'Planned|Ingredient Issue|Baking|Yield Required|QC|Complete', 'Recipe|Expected Yield|Actual Yield|Waste|Oven', 'Actual Yield'],
    ['bakery-recipes', 'Recipes & Ingredients', 'Bakery ERP', 'Maintain recipes and inspect ingredient availability.', 'Create recipe', 'BOM & Ingredient Inspector', 'recipes', manage, 'bakery', 'Draft|Reviewed|Active', 'Recipe|Ingredient|Quantity|Unit|Expected Yield'],
    ['bakery-sales', 'Bakery Orders & Remittance', 'Bakery ERP', 'Reconcile wholesale orders, dispatch, returns and remittance.', 'Create wholesale order', 'Dispatch-to-Remittance Reconciliation', 'costing', manage, 'bakery', 'Pre-order|Dispatch|Delivered|Remittance Due|Reconciled', 'Customer|Order Type|Quantity|Returns|Remittance'],
    ['autos', 'Vehicle Sales', 'Autos ERP', 'Manage inventory from acquisition to customer delivery.', 'Add vehicle', 'Vehicle Inventory & Sales Inspector', 'autos', manage, 'autos', 'Acquired|Documentation|Available|Reserved|Sold|Delivered', 'VIN / Chassis|Model Year|Landed Cost|Asking Price|Documentation'],
    ['auto-leads', 'Auto Leads & Sales', 'Autos ERP', 'Track prospects, vehicle interest and recorded sales amounts. Payment stays unconfirmed until bank reconciliation.', 'Create lead', 'Vehicle Sales Review Workspace', 'records', manage, 'autos', 'New Lead|Viewing|Test Drive|Deposit Review|Sale Review|Delivery Review', 'Prospect|Vehicle|Test Drive|Recorded Deposit Request|Recorded Balance|Payment Confirmation'],
    ['auto-history', 'Historical Workshop Records', 'Autos ERP', 'Read historical service records and their audit history.', 'Inspect historical record', 'Read-only Service Archive', 'archive', manage, 'autos', 'Archived', 'Vehicle|Historical Work|Archived Date|Audit Reference'],
    ['logistics', 'Logistics Dispatch', 'Logistics ERP', 'Dispatch trips and inspect recorded journey handoffs and delivery proof without inventing live tracking.', 'Create booking', 'Dispatch Journey & Delivery Evidence', 'logistics', manage, 'logistics', logisticsLifecycle.join('|'), 'Driver|Vehicle|Origin|Destination|Proof of Delivery', 'Proof of Delivery'],
    ['fleet', 'Fleet & Drivers', 'Logistics ERP', 'Review fleet readiness, fuel, maintenance and expiring documents.', 'Open vehicle', 'Fleet Readiness Matrix', 'fleet', manage, 'logistics', 'Available|Assigned|Maintenance|Document Due', 'Driver|Vehicle|Fuel|Licence Expiry|Maintenance Due'],
    ['trip-costs', 'Trip Expenses & Collections', 'Logistics ERP', 'Review fuel, collections, trip expenses and profitability.', 'Capture trip expense', 'Trip Profitability Worksheet', 'costing', manage, 'logistics', 'Draft|Submitted|Reviewed|Reconciled', 'Trip ID|Fuel|Other Expenses|Collections|Revenue'],
    ['properties', 'Homes & Properties', 'Homes & Properties', 'Inspect recorded occupancy and maintenance without treating rent schedules as confirmed payment.', 'Open property', 'Portfolio State & Occupancy Workspace', 'properties', manage, 'properties', propertyPortfolioStates.join('|'), 'Property|Units|Occupancy|Rent Due|Service Charges'],
    ['leases', 'Leases & Rent Schedules', 'Homes & Properties', 'Track lease periods, payment schedules, arrears and receipts.', 'Create lease', 'Lease Timeline & Receivables', 'calendar', manage, 'properties', 'Draft|Active|Expiring|Renewed', 'Tenant|Unit|Lease Start|Lease End|Rent'],
    ['property-leads', 'Property Sales & Leads', 'Homes & Properties', 'Coordinate listings, inspections, agents and commissions.', 'Create lead', 'Listing-to-Inspection Pipeline', 'board', manage, 'properties', 'Enquiry|Inspection|Negotiation|Contract|Completed', 'Listing|Agent|Buyer|Inspection Date|Commission'],
    ['finance', 'Finance Workspace', 'Finance & Operations', 'Trace ledger movement and reconcile posting exceptions.', 'Create journal', 'Ledger & Financial Analysis', 'finance', owner, undefined, 'Draft|Pending Review|Posted|Reconciliation', 'Account|Debit|Credit|Reference|Fiscal Period|Period State'],
    ['receivables', 'Receivables', 'Finance & Operations', 'Prioritize collection by aging, due date and company.', 'Inspect invoice', 'Aging Ladder & Receivable Ledger', 'receivables', manage, undefined, 'Current|1–30 Days|31–60 Days|61+ Days|Paid', 'Customer|Invoice|Due Date|Outstanding|Receipt'],
    ['finance-posting', 'Finance Posting', 'Finance & Operations', 'Inspect posting state, exceptions and source traceability.', 'Review exception', 'Posting Event Trace', 'audit', owner, undefined, 'Queued|Validation Failed|Posted|Reconciled', 'Source|Posting Reference|Exception|Result'],
    ['budgets', 'Budgets & Fiscal Periods', 'Finance & Operations', 'Compare authorized budgets and govern reporting periods.', 'Open budget', 'Budget Variance & Period Control', 'budget', owner, undefined, 'Draft|Reviewed|Active|Closed', 'Cost Centre|Fiscal Period|Budget|Actual|Funding'],
    ['expenses', 'My Expense Requests', 'Finance & Operations', 'Submit documented requests and track their decisions.', 'Create expense request', 'Request Register & Evidence Composer', 'expenses', all, undefined, 'Draft|Submitted|Approved|Returned|Rejected', 'Category|Supplier|Cost Centre|Amount|Purpose|Receipt', 'Receipt'],
    ['expense-approvals', 'Expense Approval Queue', 'Finance & Operations', 'Inspect evidence before a maker-checker decision.', 'Review request', 'Queue–Evidence–Decision Desk', 'approvals', manage, undefined, 'Submitted|Approved|Returned|Rejected', 'Maker|Category|Purpose|Amount|Receipt', 'Receipt'],
    ['spend', 'Spend & Profit Intelligence', 'Finance & Operations', 'Investigate cost exposure by company and category.', 'Trace cost driver', 'Spend Treemap & Profit Bridge', 'spend', owner, undefined, 'Evidence Due|Reviewed|Reconciled', 'Company|Supplier|Category|Treatment|Business Impact'],
    ['cost-admin', 'Cost Intelligence Administration', 'Finance & Operations', 'Maintain categories, suppliers, cost centres and evidence rules.', 'Create category', 'Cost Governance Workbench', 'policy', owner, undefined, 'Draft|Reviewed|Active', 'Category|Supplier|Cost Centre|Evidence Rule'],
    ['inventory', 'Inventory', 'Finance & Operations', 'Track stock, movement, issues, transfers and reorder risk.', 'Record stock movement', 'Availability Matrix & Movement Ledger', 'inventory', manage, undefined, 'Available|Low Stock|Reserved|In Transit', 'Item|Location|On Hand|Reorder Level|Movement Type'],
    ['projects', 'Construction & Projects', 'Finance & Operations', 'Track milestones, evidence and budget responsibility.', 'Create project', 'Milestone Schedule & Budget Rail', 'projects', manage, undefined, 'Planning|In Progress|At Risk|Complete', 'Site|Budget|Actual|Milestone|Responsible Person'],
    ['facilities', 'Facilities & Maintenance', 'Finance & Operations', 'Prioritize defects, inspections and preventive work.', 'Create work order', 'Asset Health & Maintenance Board', 'facilities', manage, undefined, 'Reported|Assigned|In Progress|Resolved', 'Building|Asset|Priority|Reading|Due Date'],
    ['social', 'Social Engine', 'Social & Web', 'Prepare content and review it before simulated publishing.', 'Draft content', 'Editorial Calendar & Content Canvas', 'social', manage, undefined, 'Draft|In Review|Approved|Published (Demo)', 'Channel|Campaign|Caption|Publication Date|Approval'],
    ['social-controls', 'Social Controls', 'Social & Web', 'Configure approval, automation and publishing guardrails.', 'Review guardrail', 'Publishing Policy Studio', 'policy', owner, undefined, 'Draft|Reviewed|Active', 'Approval Required|Allowed Channel|Automation Rule'],
    ['social-accounts', 'Social Accounts', 'Social & Web', 'Inspect provider connection scopes and availability.', 'Inspect connection', 'Provider Connection Register', 'integrations', manage, undefined, 'Unavailable', 'Provider|Permission Scope|Connection State'],
    ['social-sync', 'ERP Social Sync', 'Social & Web', 'Review ERP content conversion and sync exceptions.', 'Review sync item', 'Conversion Queue & Source Trace', 'sync', manage, undefined, 'Queued|Needs Review|Approved|Simulated Sync', 'Source Record|Destination|Conversion|Exception'],
    ['marketing', 'Marketing Command', 'Social & Web', 'Compare campaign outcomes and audience conversion.', 'Open campaign', 'Audience Funnel & Campaign Comparison', 'marketing', manage, undefined, 'Draft|Active|Review|Completed', 'Audience|Campaign|Channel|Budget|Conversions'],
    ['inbox', 'Community Inbox', 'Social & Web', 'Assign conversations and prepare appropriate responses.', 'Open conversation', 'Conversation Inbox & Context Rail', 'inbox', manage, undefined, 'Unassigned|Assigned|Replied (Demo)|Escalated|Closed', 'Channel|Customer|Assignee|Message|Response'],
    ['website', 'Website Administration', 'Social & Web', 'Review pages, media, revisions and publishing approval.', 'Edit draft page', 'Page Tree & Revision Workspace', 'website', manage, undefined, 'Draft|In Review|Approved|Published (Demo)', 'Page Title|Path|Body|Revision|Approval'],
    ['communications', 'Notice Board', 'Communications', 'Read authorized announcements and acknowledge notices.', 'Read announcement', 'Announcement Editorial Board', 'communications', all, undefined, 'Unread|Read|Acknowledged', 'Audience|Message|Acknowledgement Required'],
    ['broadcasts', 'Broadcast Center', 'Communications', 'Choose audience, push intent and acknowledgement explicitly.', 'Draft broadcast', 'Audience Composer & Acknowledgement Monitor', 'broadcast', manage, undefined, 'Draft|Preview|Approved|Published (Demo)', 'Audience|Message|Push Requested|Acknowledgement Required'],
    ['encouragement', 'Daily Staff Encouragement', 'Communications', 'Generate, review and approve encouragement before publishing.', 'Generate draft', 'Human-Approval Writing Desk', 'encouragement', manage, undefined, 'Generate|Preview|Approved|Published (Demo)', 'Message|Audience|Approval'],
    ['notifications', 'Action Center', 'Global', 'Resolve permitted alerts and required actions.', 'Open action', 'Priority Inbox', 'notifications', all, undefined, 'Unread|In Progress|Resolved', 'Priority|Source|Action Required'],
    ['help', 'AI Guide', 'Global', 'Get guidance for the current authorized workspace.', 'Ask for guidance', 'Contextual Help Conversation', 'help', all, undefined, 'Draft|Answered', 'Question|Context'],
    ['security', 'Security Center', 'Security, Access & Admin', 'Investigate sign-in events, failed access and session risk.', 'Investigate event', 'Security Event Timeline & Risk Matrix', 'security', owner, undefined, 'Open|Investigating|Reviewed', 'Severity|Device|Session|Result|Review Notes'],
    ['access', 'Access Control', 'Security, Access & Admin', 'Explain effective permissions and scoped overrides.', 'Inspect effective access', 'Permission Matrix & Explanation Inspector', 'access', owner, undefined, 'Draft|Applied|Rolled Back', 'Role|Company Scope|Module|Access Level|Override'],
    ['admin', 'Admin Setup', 'Security, Access & Admin', 'Manage organization policies with scope and change history.', 'Review policy', 'Organization Policy Workbench', 'policy', owner, undefined, 'Draft|Preview|Applied|Rolled Back', 'Policy|Company Scope|Value|Reason'],
    ['communication-settings', 'Communication Governance', 'Communications', 'Configure company-aware recovery and communication eligibility with inherited defaults.', 'Configure communications', 'Scoped Communication Governance', 'policy', owner, undefined, 'Draft|Saved|Inherited', 'Policy|Company Scope|Value|Status|Audit'],
    ['meta-credential-vault', 'Meta Credential Vault', 'Communications', 'Inspect protected backend credential readiness for Meta and WhatsApp without exposing secrets or claiming a provider connection.', 'Review vault readiness', 'Protected Provider Credential Vault', 'integrations', owner, undefined, 'Configuration Required|Pending Verification|Available', 'Provider|Credential Boundary|Verification|Release Gate'],
    ['recovery', 'Temporary Password Recovery', 'Security, Access & Admin', 'Represent audited recovery issuance and revocation.', 'Prepare recovery', 'Recovery Issue & Revocation Desk', 'recovery', owner, undefined, 'Requested|Issued (Demo)|Expired|Revoked', 'Employee|Expiry|Reason|Status'],
    ['support', 'User Support Centre', 'Security, Access & Admin', 'Inspect assigned access and employee-approved support.', 'Open support request', 'Support Case & Consent Inspector', 'support', owner, undefined, 'Awaiting Consent|Authorized|In Progress|Resolved', 'Employee|Issue|Consent|Support Action'],
    ['resources', 'Resource Monitoring', 'Security, Access & Admin', 'Inspect service availability and diagnostic context.', 'Inspect service', 'Service Topology & Health Grid', 'resources', owner, undefined, 'Unavailable', 'Service|Availability|Diagnostic|Last Seen'],
    ['sync', 'Sync & Sessions', 'Security, Access & Admin', 'Resolve pending changes and conflicts without losing drafts.', 'Review pending changes', 'Sync Queue & Conflict Comparator', 'sync', all, undefined, 'Waiting to Sync|Syncing|Synced (Demo)|Conflict', 'Record|Local Version|Remote Version|Resolution'],
    ['audit', 'Activity & Audit', 'Security, Access & Admin', 'Trace business changes by actor, object and result.', 'Inspect event', 'Audit Explorer & Event Detail', 'audit', owner, undefined, 'Recorded', 'Actor|Time|Object|Action|Result'],
    ['toolbox', 'Advanced Toolbox', 'Security, Access & Admin', 'Inspect readiness and controlled maintenance plans.', 'Run demo readiness check', 'Readiness Diagnostic Workbench', 'toolbox', owner, undefined, 'Not Run|Needs Attention|Checked (Demo)', 'Check|Result|Reason|Authorized Action'],
    ['integrations', 'API & Integrations', 'Security, Access & Admin', 'Inspect safe metadata and unavailable provider states.', 'Inspect integration', 'Integration Catalogue & Request Inspector', 'integrations', owner, undefined, 'Unavailable', 'Provider|Capability|State|Last Request'],
    ['hub', 'Module Hub', 'Global', 'Find and open workspaces available to your role and company.', 'Launch workspace', 'Authorized Module Atlas', 'hub', all, undefined, 'Available', 'Family|Module|Purpose'],
    ['theme', 'Theme Studio', 'Personalization', 'Preview and apply permitted appearance preferences.', 'Preview theme', 'Appearance Gallery', 'studio', all, undefined, 'Preview|Applied', 'Theme|Scope'],
    ['navigation', 'Navigation Studio', 'Personalization', 'Choose a navigation model for your authorized work.', 'Preview navigation', 'Navigation Workbench', 'studio', all, undefined, 'Preview|Applied', 'Navigation Style|Pinned Modules|Scope'],
    ['layout', 'Layout Studio', 'Personalization', 'Preview ten compositions and apply a scoped preference.', 'Preview layout', 'Composition Studio & Policy Inspector', 'studio', all, undefined, 'Preview|Applied|Rolled Back', 'Layout|Density|Motion|Scope'],
    ['signin-design', 'Sign-In Experience / Sign-In Studio', 'Admin / Experience', 'Manage the unified production Staff Portal default, preserved Sites themes, governed variants and isolated live previews.', 'Open Studio', 'Unified Sign-In Experience Registry', 'signin-studio', experience, undefined, 'Draft|Preview|Review|Published', 'Theme Library|Live Preview|Breakpoint Layouts|Widgets|Style|Motion|Version History|Compare']
];
export function canonicalModulePath(id: string) {
    return id === 'signin-design' ? '/admin/experience/sign-in-studio' : '/' + id;
}
export const modules: ModuleDef[] = moduleRows.map(([id, title, family, purpose, primary, archetype, kind, roles, company, stages, fields, required]) => ({ id, canonicalPath: canonicalModulePath(id), title, family, purpose, primary, archetype, kind, roles, company, stages: stages.split('|'), fields: fields.split('|'), required }));
for(const [id,title,family,purpose,primary,archetype,kind,stages,fields,required] of newModuleRows)modules.push({id,canonicalPath:canonicalModulePath(id),title,family,purpose,primary,archetype,kind,stages:stages.split('|'),fields:fields.split('|'),required:required||undefined,roles:['files','saved-views','staff-messaging','productivity'].includes(id)?all:['builder','session-analytics','banking-operations','treasury-operations','payment-verification','transfer-operations','beneficiary-operations','payroll-operations','reconciliation-operations','financial-reporting','letterhead-ai'].includes(kind)?owner:manage,company:id==='bakery-accountability'?'bakery':id==='technology-services'?'printing':undefined});
export const layouts = ['Daenem Executive Command', 'Workspace Canvas', 'Operational Cockpit', 'Insight Magazine', 'Master–Detail Workspace', 'Horizon Wide', 'Adaptive Bento', 'Focus & Flow', 'Enterprise Studio', 'Board & Pulse'];
export const experiencePresets = [
 {id:'executive-command',name:'Executive Command',layout:0,theme:'Daylight',density:'Comfortable',motion:'Calm',navigation:'Sidebar',composition:'Priority summary with governed evidence'},
 {id:'workspace-canvas',name:'Workspace Canvas',layout:1,theme:'Slate',density:'Standard',motion:'Balanced',navigation:'Rail',composition:'Flexible multicolumn work surface'},
 {id:'operational-cockpit',name:'Operational Cockpit',layout:2,theme:'Midnight',density:'Compact',motion:'Balanced',navigation:'Sidebar',composition:'Exceptions, queues and source health'},
 {id:'insight-magazine',name:'Insight Magazine',layout:3,theme:'Daylight',density:'Comfortable',motion:'Calm',navigation:'Top',composition:'Narrative analysis and supporting evidence'},
 {id:'master-detail-workspace',name:'Master–Detail Workspace',layout:4,theme:'Slate',density:'Standard',motion:'Off',navigation:'Sidebar',composition:'Persistent queue and selected context'},
 {id:'horizon-wide',name:'Horizon Wide',layout:5,theme:'Daylight',density:'Comfortable',motion:'Calm',navigation:'Top',composition:'Broad comparative data surface'},
 {id:'adaptive-bento',name:'Adaptive Bento',layout:6,theme:'Midnight',density:'Standard',motion:'Expressive',navigation:'Rail',composition:'Priority-weighted blocks and deliberate spans'},
 {id:'focus-flow',name:'Focus & Flow',layout:7,theme:'Daylight',density:'Comfortable',motion:'Calm',navigation:'Sidebar',composition:'One next action and personal timeline'},
 {id:'enterprise-studio',name:'Enterprise Studio',layout:8,theme:'Slate',density:'Standard',motion:'Balanced',navigation:'Rail',composition:'Tool rail, workspace and policy inspector'},
 {id:'board-pulse',name:'Board & Pulse',layout:9,theme:'Midnight',density:'Compact',motion:'Balanced',navigation:'Top',composition:'Workstream lanes, owners and stage pulse'}
] as const;
export const byId = (id: string) => modules.find(m => m.id === id);
const within = (startsAt?:string,expiresAt?:string,now=Date.now()) => (!startsAt||Date.parse(startsAt)<=now)&&(!expiresAt||Date.parse(expiresAt)>now);
export function authorizedCompaniesForSession(s:Session,now=Date.now()):Company[] {
 if(s.provisional)return [];
 const assignments=(s.assignments||[]).filter(a=>a.level!=='No Access'&&within(a.startsAt,a.expiresAt,now));
 if(assignments.some(a=>a.companies.includes('group')))return companies.map(company=>company.id);
 const granted=new Set(assignments.flatMap(a=>a.companies.filter(company=>company!=='group')));
 const scoped=companies.filter(company=>company.id!=='group'&&granted.has(company.id)).map(company=>company.id);
 return scoped.length>1?['group',...scoped]:scoped;
}
export function normalizeSessionCompany(s:Session,now=Date.now()):Session {
 const authorized=authorizedCompaniesForSession(s,now);
 if(!authorized.length||authorized.includes(s.company))return s;
 const fallback=authorized.find(company=>company!=='group')||authorized[0];
 return {...s,company:fallback};
}
export function sessionScopeKey(s:Session):string {
 const assignments=(s.assignments||[]).map(a=>[a.module,a.level,[...a.companies].sort().join(','),a.scope,[...a.capabilities].sort().join(','),a.startsAt||'',a.expiresAt||''].join('~')).sort().join('|');
 const overrides=Object.entries(s.overrides||{}).sort(([a],[b])=>a.localeCompare(b)).map(([module,level])=>module+'='+level).join('|');
 const capabilities=Object.entries(s.capabilities||{}).sort(([a],[b])=>a.localeCompare(b)).map(([module,actions])=>module+'='+[...actions].sort().join(',')).join('|');
 return [s.personId,s.role,s.company,s.provisional?'provisional':'assigned',assignments,overrides,capabilities].join(':');
}
const assignmentsFor = (m:ModuleDef,s:Session,now=Date.now()) => s.assignments?.filter(a=>(a.module===m.id||a.module==='*')&&within(a.startsAt,a.expiresAt,now)&&(!m.company||a.companies.includes('group')||a.companies.includes(m.company))&&(s.company==='group'||a.companies.includes('group')||a.companies.includes(s.company)))||[];
export function effectiveLevel(m:ModuleDef,s:Session,now=Date.now()):Level {
 if(s.provisional||s.overrides[m.id]==='No Access') return 'No Access';
 const validAssignments=assignmentsFor(m,s,now);
 let base:Level='No Access';
 base=validAssignments.reduce((best,a)=>accessLevels.indexOf(a.level)>accessLevels.indexOf(best)?a.level:best,'No Access' as Level);

 if(base==='No Access')return base;
 const timed=s.timedOverrides?.[m.id];
 return timed&&within(timed.startsAt,timed.expiresAt,now)?timed.level:s.overrides[m.id]||base;
}
export function canView(m:ModuleDef|undefined,s:Session){return !!m&&effectiveLevel(m,s)!=='No Access'}
export function authorizedCompaniesForModule(s:Session,m:ModuleDef|undefined,now=Date.now()):Company[] {
 if(!m||s.provisional)return [];
 const sessionCompanies=authorizedCompaniesForSession(s,now);
 const scoped=sessionCompanies.filter(company=>company!=='group'&&(!m.company||m.company==='group'||m.company===company)&&effectiveLevel(m,{...s,company},now)!=='No Access');
 const aggregate=sessionCompanies.includes('group')&&scoped.length>1&&effectiveLevel(m,{...s,company:'group'},now)!=='No Access';
 return aggregate?['group',...scoped]:scoped;
}
export function canViewStudioCapability(capability:StudioCapabilityId,s:Session) {
 const studio=byId('signin-design');
 if(!studio||!canView(studio,s))return false;
 if(s.role==='Owner')return true;
 return assignmentsFor(studio,s).some(a=>a.capabilities.includes(capability));
}
export function canViewStudioSection(section:string,s:Session) {
 if(section==='Home')return s.role==='Owner' ? canView(byId('signin-design'),s) : STUDIO_SECTION_CAPABILITIES.some(item=>canViewStudioCapability(item.id,s));
 const definition=STUDIO_SECTION_CAPABILITIES.find(item=>item.section===section);
 return definition ? canViewStudioCapability(definition.id,s) : false;
}
export function canAct(m:ModuleDef,s:Session,action='edit'){
 if(!canView(m,s))return false;
 if((specializedActions as readonly string[]).includes(action)){
   // Specialized actions are explicit grants, never inferred from the level.
   const assigned=s.assignments?.some(a=>(a.module===m.id||a.module==='*')&&within(a.startsAt,a.expiresAt)&&a.capabilities.includes(action)&&(s.company==='group'||a.companies.includes('group')||a.companies.includes(s.company))&&(!m.company||a.companies.includes('group')||a.companies.includes(m.company)));
  const restriction=s.capabilities?.[m.id]??s.capabilities?.['*'];
   return !!assigned && (!restriction||restriction.includes(action));
 }
 if(m.kind==='archive'||['integrations','resources','payslips','audit'].includes(m.kind))return false;
 if(s.role==='Employee'&&!s.assignments&&!['workspace','profile','attendance','leave','performance','forms','tasks','expenses','sync','theme','navigation','layout','help','saved-views'].includes(m.id))return false;
 const rank=accessLevels.indexOf(effectiveLevel(m,s));
 return rank>=(action==='view'?1:action==='create'?2:action==='approve'?4:action==='manage'?5:3);
}
export function fieldAccess(module:string,field:string,s:Session):'hidden'|'read'|'edit' {
 const m=byId(module);if(!m||!canView(m,s))return 'hidden';
 if(/Secret|Token/i.test(field))return 'hidden';
 const configured=s.fieldRules?.[module+'.'+field]??s.fieldRules?.['*.'+field];if(configured)return configured;
 const confidential=/Current Amount|Proposed Amount|Case Notes|Manager Commentary|PAYE|Pension|Payroll Bank|Gross Pay|Net Pay|Deductions|Landed Cost|Profit|Margin|Bank Account|Secret|Token/i.test(field);
 if(/Secret|Token/i.test(field))return 'hidden';
 if(confidential&&s.role!=='Owner'&&!(module==='profile'||module==='payslips'&&s.role==='Employee'))return 'hidden';
 return canAct(m,s,'edit')?'edit':'read';
}
export function recordVisible(row:RecordData,m:ModuleDef,s:Session):boolean {
 if(!canView(m,s)||row.module!==(m.id==='expense-approvals'?'expenses':m.id))return false;
 if(s.company!=='group'&&row.company!==s.company)return false;
 if(['profile','payslips','expenses'].includes(m.id)&&row.owner!==personFor(s))return false;
 const isOwnRecord=row.owner===personFor(s)||(m.id==='performance'&&row.fields.Employee===personFor(s));
 if(s.assignments){
  return s.assignments.some(a=>(a.module===m.id||a.module==='*')&&a.level!=='No Access'&&within(a.startsAt,a.expiresAt)&&(a.companies.includes('group')||a.companies.includes(row.company))&&
    (['GROUP','COMPANY'].includes(a.scope)||a.scope==='OWN'&&isOwnRecord||a.scope==='ASSIGNED'&&row.fields['Assigned To']===personFor(s)||a.scope==='RECORD_TYPE'&&!!a.values?.includes(row.module)||!!a.values?.includes(row.scopeData?.[a.scope]||'')));
 }
 return s.role!=='Employee'||isOwnRecord;
}

export function canRecordAct(row:RecordData,m:ModuleDef,s:Session,action='edit'):boolean {
 if(!canAct(m,s,action)||!recordVisible(row,m,s))return false;
 const required=action==='view'?1:action==='create'?2:action==='approve'?4:action==='manage'?5:3;
 return (s.assignments||[]).some(a=>{
   const scopeSession={...s,assignments:[a]};
   if(!recordVisible(row,m,scopeSession))return false;
   return (specializedActions as readonly string[]).includes(action)?a.capabilities.includes(action):accessLevels.indexOf(a.level)>=required;
 });
}
export function projectRecord(row:RecordData,s:Session,asModule=row.module):RecordData {
 const visible=(f:string)=>fieldAccess(asModule,f,s)!=='hidden';
 return {...row, title:visible('Title')?row.title:row.id, subtitle:visible('Subtitle')?row.subtitle:'', amount:visible('Amount')?row.amount:0, evidence:visible('Evidence')?row.evidence:[], evidenceData:visible('Evidence')?row.evidenceData&&Object.fromEntries(Object.entries(row.evidenceData).filter(([name])=>!row.filePolicies?.[name]?.deleted)):undefined,filePolicies:visible('Evidence')?row.filePolicies:undefined, history:visible('History')?row.history:[], fields:Object.fromEntries(Object.entries(row.fields).filter(([f])=>visible(f)))};
}
/** A projected row is never allowed to overwrite its hidden canonical data. */
export function canonicalEdit(stored:RecordData|undefined,projection:RecordData,s:Session):RecordData {
 if(!stored)return projection;
 return {...stored,
  title:fieldAccess(stored.module,'Title',s)==='edit'?projection.title:stored.title,
  evidence:fieldAccess(stored.module,'Evidence',s)==='edit'?projection.evidence:stored.evidence,
  filePolicies:fieldAccess(stored.module,'Evidence',s)==='edit'?projection.filePolicies:stored.filePolicies,
  evidenceData:fieldAccess(stored.module,'Evidence',s)==='edit'?(stored.evidenceData||projection.evidenceData?{...Object.fromEntries(Object.entries(stored.evidenceData||{}).filter(([name])=>stored.filePolicies?.[name]?.deleted&&projection.evidence.includes(name))),...projection.evidenceData}:undefined):stored.evidenceData,
 };
}
export const neutralNotFound = {title:'Page not found',message:'This page is unavailable. Return to your workspace.'} as const;
export const personFor = (s: Session) => s.displayName || (s.role === 'Owner' ? 'Theo Adegboye' : s.role === 'Manager' ? 'Aminat Bello' : 'Daniel Obi');
export const initials = (s: string) => s.split(' ').slice(0, 2).map(p => p[0]).join('');
export const money = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
const titles: Record<string, string[]> = {
    printing: ['Meridian launch brochure', 'Harmony retail packaging', 'Apex annual report'], 'print-orders': ['Meridian Group quotation', 'Harmony Foods enquiry', 'Apex Foundation order'], 'print-materials': ['Meridian brochure material issue', 'Harmony packaging consumption', 'Apex finishing waste'], bakery: ['Signature loaf · morning batch', 'Butter croissant · batch 02', 'Wholegrain rolls · wholesale'], 'bakery-recipes': ['Signature white loaf', 'Butter croissant', 'Wholegrain rolls'], 'bakery-sales': ['Balogun Distributors · order 018', 'Sunrise Stores · wholesale', 'Market Street · remittance'], autos: ['2022 Toyota Camry SE', '2021 Lexus RX 350', '2023 Toyota Corolla LE'], 'auto-leads': ['Emeka Nwosu · Camry enquiry', 'Ada Okoro · RX showing', 'Femi Lawal · Corolla deposit'], 'auto-history': ['Archived bodywork · 2024', 'Archived repair · 2023', 'Archived parts issue · 2022'], logistics: ['Lagos → Ibadan · TRP-208', 'Ikire → Osogbo · TRP-209', 'Ikeja → Lekki · TRP-210'], fleet: ['DNG-204 · Delivery van', 'DNG-207 · Light truck', 'DNG-210 · Cargo van'], 'trip-costs': ['TRP-208 · fuel and tolls', 'TRP-209 · collections', 'TRP-210 · expense reconciliation'], properties: ['Parkside Residences', 'Victoria Court', 'Oakwood Apartments'], leases: ['Unit A-04 · annual lease', 'Unit B-12 · renewal', 'Unit C-02 · new tenancy'], 'property-leads': ['Victoria Court · buyer enquiry', 'Parkside · inspection booked', 'Oakwood · agent referral'], people: ['Aminat Bello', 'Daniel Obi', 'Chiamaka Eze'], 'hr-records': ['Aminat Bello · employment', 'Daniel Obi · emergency contact', 'Chiamaka Eze · statutory review'], expenses: ['Paper stock replenishment', 'Generator service', 'Dispatch fuel advance'], 'expense-approvals': ['Paper stock replenishment', 'Generator service', 'Dispatch fuel advance'], finance: ['INV-2048 · Meridian receipts', 'JRN-0912 · operating expense', 'JRN-0913 · intercompany funding'], receivables: ['Meridian Group · INV-2048', 'Harmony Foods · INV-2039', 'Apex Foundation · INV-2022'], projects: ['Ikire branch fit-out', 'Production line upgrade', 'Staff quarters renovation'], facilities: ['Backup generator inspection', 'Air handler filter replacement', 'Loading bay lighting fault'], applications: ['Oluwaseun Akin · operations', 'Ifeoma Udo · finance', 'Yusuf Hassan · dispatch'], interviews: ['Operations lead · interview', 'Accounts officer · interview', 'Dispatch coordinator · interview'], hiring: ['Operations lead · offer', 'Accounts officer · offer', 'Dispatch coordinator · handoff'], social: ['Behind the scenes · print studio', 'Fresh from the bakery', 'People of Daenem'], marketing: ['September wholesale outreach', 'Vehicle discovery campaign', 'New property listings'], inbox: ['Order delivery question', 'Vehicle showing request', 'Lease renewal enquiry'], website: ['About Daenem', 'Our Businesses', 'Contact Us'], communications: ['September operating priorities', 'Workplace safety briefing', 'New team member welcome'], broadcasts: ['Weather disruption advisory', 'Scheduled power maintenance', 'Group operating update'], security: ['Repeated failed sign-in', 'New device verification', 'Session review requested'], audit: ['Expense evidence added', 'Leave request reviewed', 'Profile updated'], inventory: ['A4 coated stock · 170 gsm', 'Wheat flour · premium', 'Packaging cartons · medium'], forms: ['Employee details update', 'Workplace incident report', 'Equipment request'], leave: ['Annual leave · September', 'Medical appointment', 'Annual leave · October'], performance: ['September review · Daniel Obi', 'Q3 goals · Chiamaka Eze', 'Manager feedback · Aminat Bello'], lifecycle: ['Daniel Obi · onboarding', 'Chiamaka Eze · onboarding', 'Samuel Okeke · exit checklist'], payslips: ['August 2026 payslip', 'July 2026 payslip', 'June 2026 payslip'], payroll: ['September 2026 payroll', 'August 2026 payroll', 'July 2026 payroll'], 'payroll-batches': ['September payroll draft', 'August bank batch', 'July bank batch'], budgets: ['Printing · Q3 operating budget', 'Bakery · Q3 ingredient budget', 'Logistics · Q3 fuel budget'], sync: ['Expense request · local draft', 'Employee form · conflict', 'Attendance event · pending'], tasks: ['Approve artwork for Meridian', 'Complete emergency contact', 'Review September stock levels'], resources: ['Staff Portal interface', 'Payroll service', 'Identity service'], integrations: ['Weather provider', 'Cloudflare services', 'Bank payment connector'], 'social-accounts': ['Official Instagram connection', 'Official LinkedIn connection', 'Official Facebook connection'], recovery: ['Daniel Obi · recovery request', 'Chiamaka Eze · expired request', 'Samuel Okeke · revoked request'], support: ['Daniel Obi · missing assignment', 'Aminat Bello · session refresh', 'Chiamaka Eze · form assistance'], toolbox: ['Database readiness', 'Payroll readiness', 'Session health'], access: ['Manager · Printing', 'Employee · Printing', 'Owner · Group'], admin: ['Attendance event policy', 'Employee location policy', 'Company appearance policy'], 'cost-admin': ['Paper & Materials', 'Maintenance', 'Transport'], 'finance-posting': ['INV-2048 · awaiting validation', 'INV-2039 · posting exception', 'INV-2022 · posted source'], spend: ['Printing consumables', 'Bakery ingredient spend', 'Logistics fuel exposure'], 'social-controls': ['Human approval policy', 'Official account policy', 'Scheduled content guardrail'], 'social-sync': ['Print completion → content draft', 'Bakery batch → photo story', 'Vehicle inventory → listing draft'], 'hr-cases': ['Workplace incident · confidential', 'Employee commendation', 'Grievance follow-up']
};
for(const [id,entries] of Object.entries(enterpriseFixtures))titles[id]=entries.map(e=>e.title);
export function seedRecords(): RecordData[] {
    const seeded = modules.filter(m => Boolean(titles[m.id])).flatMap(m => (titles[m.id] || [`${m.title} · current period`, `${m.title} · review required`, `${m.title} · archived period`]).map((title, i) => {
        const fixture = enterpriseFixtures[m.id]?.[i];
        const fields: Record<string, string> = {};
        for (const f of m.fields)
            fields[f] = sampleField(f, i, m);
        if (m.required && i === 0 && !enterpriseFixtures[m.id])
            fields[m.required] = '';
        const defaultAmounts = m.id === 'autos' ? [24500000, 42000000, 28000000] : [485000, 128000, 75000];
        const defaultOwners = ['Daniel Obi', 'Chiamaka Eze', 'Aminat Bello'];
        const defaultDueDates = ['2026-09-12', '2026-09-15', '2026-09-18'];
        return { id: `${m.id.toUpperCase().slice(0, 3)}-${2048 + i}`, module: m.id, title, subtitle: m.company ? companies.find(c => c.id === m.company)!.name : 'Printing · Ikire branch', company: (fixture?.company||m.company||'printing') as Company, status: fixture?.status || (m.id === 'properties' ? m.stages[i] : m.id === 'expenses' && i === 0 ? 'Draft' : m.stages[Math.min(i === 0 ? Math.floor(m.stages.length / 2) : i, m.stages.length - 1)]), owner: fixture?.owner || defaultOwners[i % defaultOwners.length], amount: fixture?.amount ?? defaultAmounts[i % defaultAmounts.length], due: fixture?.due || defaultDueDates[i % defaultDueDates.length], fields, scopeData:{BANK_ACCOUNT:fields['Masked Account']||fields.Account||fields['Source Account'],BRANCH:fields.Branch,COST_CENTRE:fields['Cost Centre'],PAYROLL_BATCH:fields['Payroll Batch'],TRANSACTION:fields['Transaction Reference']||fields['Provider Transaction'],REPORT:fields['Report Type'],BUSINESS_UNIT:fields['Business Unit'],DEPARTMENT:fields.Department,SITE:fields.Site}, evidence: i === 0 ? [] : ['Demo supporting document.pdf'], history: [{ action: 'Record created', actor: 'Daniel Obi', time: '2026-09-10T08:20:00.000Z' }, { action: 'Assigned for review', actor: 'Aminat Bello', time: '2026-09-11T07:15:00.000Z' }], communicationProjection: fixture?.communicationProjection };
    }));
    const source=seeded.find(r=>r.module==='inventory'&&r.fields.Item==='170 gsm coated stock');
    if(source){source.fields['On Hand']='900';seeded.push({...source,id:'INV-DEST-PRINT',title:'170 gsm coated stock · Ibadan print studio',fields:{...source.fields,Location:'Ibadan print studio','On Hand':'100'},history:[]});}
    return seeded;

}
function sampleField(f: string, i: number, m: ModuleDef): string { if(enterpriseFixtures[m.id])return enterpriseFixtures[m.id][i]?.fields[f]||''; const d: Record<string, string> = { 'Employee ID': `DN-${103 + i}`, 'Job Title': ['Operations Manager', 'Production Coordinator', 'Finance Analyst'][i], Department: 'Operations', Manager: 'Aminat Bello', 'Start Date': '2025-03-10', 'Employment Type': 'Full Time', 'Work Email': 'daniel.obi@example.test', Phone: '+234 ••• ••• 0124', 'Emergency Contact': 'Contact review required', Pension: 'Review Required', PAYE: 'Configuration Review', 'Payroll Bank': '•••• ••4821', Customer: ['Meridian Group', 'Harmony Foods', 'Apex Foundation'][i], Quantity: '2400', 'Paper Stock': '170 gsm coated', Machine: 'Press 02', 'Expected Yield': '600', 'Actual Yield': '584', Waste: '16', Oven: 'Oven 01', Recipe: 'Signature white loaf', 'VIN / Chassis': `DEMO-VIN-00000000${i + 1}`, 'Model Year': ['2022', '2021', '2023'][i], 'Landed Cost': ['21800000', '37000000', '24700000'][i], 'Asking Price': ['24500000', '42000000', '28000000'][i], Documentation: 'Title review required', Driver: 'Ibrahim Musa', Vehicle: `DNG-${204 + i}`, Origin: 'Lagos', Destination: 'Ibadan', 'Proof of Delivery': 'Demo delivery receipt', Units: ['24','18','12'][i], Occupancy: ['21 of 24','12 of 18','8 of 12'][i], Rent: '1800000', 'Rent Due': ['150000','0','80000'][i], 'Service Charges': ['25000','18000','12000'][i], Debit: '485000', Credit: '485000', Account: 'Operating Expenses', 'Fiscal Period': 'September 2026', 'Period State':'Open', Category: 'Materials', Supplier: 'Meridian Supplies', 'Cost Centre': 'Printing Operations', Amount: '485000', Purpose: 'Replenish paper stock for approved September jobs', Receipt: 'Demo receipt', Maker: 'Daniel Obi', Priority: 'Medium', 'Assigned To': 'Daniel Obi', 'Due Date': '2026-09-12', Location: m.id==='inventory'?'Ikire warehouse':'Ikire branch', 'Clock In': '08:42 AM', 'Clock Out': 'Required', Photo: 'Permission Required', Period: 'September 2026', 'Gross Pay': '350000', Deductions: '42000', 'Net Pay': '308000', 'Bank Validation': 'Review Required', 'Leave Type': 'Annual Leave', 'End Date': '2026-09-18', Reason: 'Annual leave request', 'Case Type': 'Incident', Confidentiality: 'Restricted HR', 'Case Notes': 'Fixture case note. Authorized HR review only.', Audience: 'Assigned company', Message: 'Please review September operating priorities and acknowledge the safety update.', 'Push Requested': 'No', 'Acknowledgement Required': 'Yes', 'On Hand': '120', 'Reorder Level': '150', Item: m.id==='inventory'?['170 gsm coated stock','Wheat flour','Packaging cartons'][i]:m.id, Unit: 'kg', Budget: '12500000', Actual: '8750000', Source: 'Direct application', Stage: 'Review', Caption: 'A closer look at the people and care behind our work.', Channel: 'LinkedIn', Campaign: 'September operations', Severity: 'Medium', Device: 'Chrome · Windows', Result: 'Review Required', Approval: 'Pending human review', Status: 'Demo Data', Consent: 'Awaiting employee approval', Provider: 'Not Connected', 'Connection State': 'Authorized Integration Data Unavailable' }; return d[f] ?? (/Date|Expiry|Start|End/.test(f) ? '2026-09-15' : /Amount|Cost|Revenue|Spend|Deposit|Balance|Funding|Collections/.test(f) ? '485000' : /Owner|Employee|Assignee|Actor|Interviewer|Reviewer/.test(f) ? 'Aminat Bello' : /Required|Rule|Policy|Scope/.test(f) ? 'Review current policy' : `${f} · demo record`); }
export function recordsFor(rows: RecordData[], m: ModuleDef, s: Session) { return rows.filter(r=>recordVisible(r,m,s)).map(r=>projectRecord(r,s,m.id)); }
export function authorizedRecords(rows: RecordData[], s: Session) { return [...new Map(modules.filter(m => canView(m, s)).flatMap(m => recordsFor(rows, m, s)).map(r => [r.module + ':' + r.id, r])).values()]; }
export function recordsAreRelated(left:RecordData,right:RecordData){
 if(left.id===right.id&&left.module===right.module)return false;
 const mentions=(source:RecordData,target:RecordData)=>{
  const references=[target.id,`${target.module}:${target.id}`].map(value=>value.trim().toLowerCase()).filter(Boolean);
  return Object.values(source.fields).some(value=>{
   const text=String(value).trim().toLowerCase();
   return Boolean(text)&&references.some(reference=>text.includes(reference));
  });
 };
 return mentions(left,right)||mentions(right,left);
}
export function attentionRecords(rows:RecordData[],s:Session){return authorizedRecords(rows,s).filter(r=>{const m=byId(r.module);return /Required|Review|Due|Pending|Conflict|Submitted/.test(r.status)||!!m?.required&&fieldAccess(m.id,m.required,s)!=='hidden'&&!r.fields[m.required]?.trim()})}
export interface ProductionAdapter {
    list(module: string, context: Session): Promise<RecordData[]>;
    mutate(module: string, id: string, action: string, fields: Record<string, string>, context: Session): Promise<RecordData>;
}
// PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION. No production endpoint is invented.
export function requirementsMissing(r: RecordData, m: ModuleDef) { return m.required && !r.fields[m.required]?.trim() ? [m.required] : []; }
export function mutationError(row: RecordData, fields: Record<string, string>, status: string, session: Session, isNew = false): string | null {
    const mod = byId(row.module);
    if (!mod)
        return 'Unknown module';
    if(isNew&&fieldAccess(mod.id,'Title',session)!=='edit')return 'Title creation is not permitted.';
    if (!canAct(mod, session, isNew ? 'create' : 'edit'))
        return 'This action is not permitted in the current session.';
    const authority=mod.id==='expenses'&&row.owner!==personFor(session)?byId('expense-approvals')!:mod;
    if(!isNew&&!canRecordAct(row,authority,session,'edit'))return 'Record unavailable.';
    if(isNew&&!canRecordAct(row,mod,session,'create'))return 'Record unavailable.';
    if(Object.keys(fields).some(f=>(isNew||fields[f]!==row.fields[f])&&fieldAccess(mod.id,f,session)!=='edit'))return 'A field cannot be changed in this context.';
    const special=status==='Published (Demo)'?'publish':status==='Closed'?'close':status==='Reconciled'?'reconcile':null;
    if(special&&status!==row.status&&!canRecordAct(row,authority,session,special))return 'Action unavailable.';
    if ((['Approved', 'Rejected', 'Returned'].includes(status)||mod.id==='bakery-accountability'&&status==='Resolved') && status !== row.status) {
        if (['expenses', 'leave', 'forms'].includes(mod.id) && row.status !== 'Submitted')
            return 'Only a submitted request can receive a review decision.';
        if (!canRecordAct(row, authority, session, 'approve'))
            return 'An authorized reviewer is required.';
        if (row.owner === personFor(session))
            return 'Maker-checker rule: the maker cannot review their own request.';
        if (!fields['Decision Reason']?.trim())
            return 'A decision reason is required.';
    }
    if(mod.id==='bakery-accountability'&&status==='Resolved'&&status!==row.status){
        if(row.status!=='Investigating'||!row.fields['Resolution Maker']||row.fields['Resolution Maker']===personFor(session)||['Resolution Amount','Resolution Quantity'].some(k=>fields[k]!==undefined&&fields[k]!==row.fields[k]))return 'An independent reviewer must approve a previously submitted resolution.';
        if(!activeEvidence(row).length)return 'Attach investigation evidence before approval.';
    }
    if(mod.id==='payroll'&&['Approved','Draft Export'].includes(row.status)&&Object.keys(fields).some(k=>fields[k]!==row.fields[k]))return 'Approved payroll is immutable. Create a separately reviewed adjustment.';
    if(mod.id==='purchase-orders'&&!isNew&&(fields['Received Quantity']!==undefined&&fields['Received Quantity']!==row.fields['Received Quantity']||status!==row.status&&['Partially Received','Received'].includes(status)))return 'Receipt totals and states are updated only by posting linked goods receipts.';
    const next = { ...row, fields: { ...row.fields, ...fields }, status };
    const missing = requirementsMissing(next, mod);
    if (/Complete|Closed|Submitted|Approved/.test(status) && missing.length)
        return missing.join(', ') + ' is required before this action.';
    if (['Receipt', 'Proof of Delivery'].includes(mod.required || '') && /Submitted|Approved|Closed|Complete/.test(status) && !activeEvidence(row).length)
        return 'Attach the required evidence before continuing.';
    if (mod.id === 'bakery' && next.fields['Actual Yield'] !== '' && (!Number.isFinite(Number(next.fields['Actual Yield'])) || Number(next.fields['Actual Yield']) < 0))
        return 'Actual yield must be a valid number of zero or more.';
    if (fields.Amount && (Number(fields.Amount) <= 0 || !Number.isFinite(Number(fields.Amount))))
        return 'Amount must be greater than zero.';
    if (mod.id === 'finance' && status === 'Posted' && Number(next.fields.Debit) !== Number(next.fields.Credit))
        return 'Journal debits and credits must balance before posting.';
    if (['social', 'broadcasts', 'encouragement', 'website'].includes(mod.id) && status === 'Published (Demo)' && row.status !== 'Approved')
        return 'Human approval is required before publication.';
    if (mod.id === 'logistics' && status === 'Closed' && !next.fields['Proof of Delivery'])
        return 'Proof of delivery is required before closing the trip.';
    return businessError(row,fields,status);
}
export function resolveLayout(options: {
    forced?: number | null;
    personal?: number | null;
    personalAllowed?: boolean;
    roleDefault?: number | null;
    erpDefault?: number | null;
    organizationDefault?: number | null;
}): number { const chain = [options.forced, options.personalAllowed === false ? null : options.personal, options.roleDefault, options.erpDefault, options.organizationDefault, 0]; return chain.find(v => typeof v === 'number' && v >= 0 && v < 10) ?? 0; }
