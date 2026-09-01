# Daenem Workforce Hub

Private, multi-company employee ERP for Daenem Group.

Target domain: `staffportal.daenem.com`

> Temporary staging note: this subtree is isolated on the `workforce-hub-bootstrap` branch because the currently connected GitHub action does not expose repository creation. It must not be merged into Farms production. When the dedicated private repository `daenem-workforce-hub` is created, this subtree should be migrated there and this staging branch can be removed.

## Product principles

- One workforce platform, many Daenem companies.
- Company + role + permission + individual override controls access.
- Preserve useful non-farm capabilities from `portal.farms.daenem.com`; remove farm operations and farm terminology.
- Mobile-first, tablet-aware, desktop-optimized.
- Offline-first PWA with automatic sync and conflict/audit records.
- Distinctive UI that does not look like the Farms portal.
- Lagos / West Africa Time shown in 12-hour format with AM/PM.
- Owner has a group command center across all companies.
- Employees see role-specific workspaces and required-data reminders.
- AI guides users, explains features, flags missing data and drafts approved communications.
- Security logs and business audit logs are separate.
- Attendance is only completed when both required clock-in and clock-out rules are satisfied.

## Companies

- Daenem Printing & Technology
- Daenem Bakery
- Daenem Autos
- Daenem Logistics
- Daenem Homes & Properties
- Future Daenem Group companies

## Shared modules

- Identity, authentication and sessions
- Security Center
- Audit & sync logs
- Company management
- Users, roles and granular permissions (No Access / View / Create / Edit / Approve / Manage)
- HR and employee profiles
- Attendance, GPS, geofencing and optional photo evidence
- Continuous work-location tracking policies for designated employees
- Payroll, payslips, salary adjustments and payroll approvals
- Leave and reviews
- Recruitment, employee invitations and onboarding
- Assignable forms and workflow submissions
- Notifications, chat and notice board
- Emergency broadcasts with audience selection, optional push and acknowledgement tracking
- Daily AI-drafted staff encouragement requiring approval before publication
- Finance, receivables, ledger, journal, reports, fiscal periods, budgets, COA governance and funding events
- Sales, customers, purchasing and procurement
- Inventory, stock movement, goods received, requests and borrowed items
- Facilities, building maintenance, assets, preventive maintenance and work orders
- AI Help / User Guide
- Themes and accessibility controls
- PWA install and future Android wrapper / Play Store pipeline

## Specialized operations

### Printing

Benchmark workflows from Nigerian print ERP products such as DigiPress, implemented with Daenem's own design and code:

Enquiry -> Quote -> Approval -> Artwork -> Proof -> Proof Approval -> Job Card -> Material Issue -> Printing -> Finishing -> QC -> Pickup/Delivery -> Invoice -> Payment -> Complete.

Includes print shops/branches, print jobs, POS, stock, stock transfers, supplies, suppliers, customers and profitability analytics.

### Bakery

Recipe/BOM, batch planning, ingredient issue, actual yield, waste, finished-goods stock, expiry/low-stock alerts, POS, wholesale orders, pre-orders, returns and batch-level costing.

### Autos

Vehicle acquisition, VIN/chassis inventory, landed cost, repairs/bodywork/detailing, workshop, parts, CRM/leads, test drive, deposit/balance, sale, delivery and vehicle-level profit.

### Logistics

Fleet, drivers, dispatch, trips, GPS, route events, fuel, POD, trip expenses, maintenance, vehicle documents and trip profitability.

### Homes & Properties

Properties/units, listings, leads, inspections, agents, tenants/buyers, leases, rent/payment schedules, receipts, arrears, maintenance and commissions.

## Attendance hard rules

ERP authentication is not attendance.

A work day is `PRESENT / WORKED` only after required clock-in and clock-out events are successfully completed under the configured policy. Clock-in without clock-out is `INCOMPLETE`, not `PRESENT`.

Policies are configurable per company/location/role and can require:

- GPS permission
- in-geofence verification
- clock-in photo
- clock-out photo
- grace/late thresholds
- manager override with reason
- offline attendance rules

## Smart accountability

The platform should know which records are required for each role. Missing role-required inputs generate reminders and can block workflow completion where appropriate. Examples include material usage before closing a print job, actual yield before closing a bakery batch, proof of delivery before closing a logistics trip, or receipt evidence before submitting an expense.

## Communication rules

AI-generated encouragement is always draft-first: Generate -> Preview -> Approve/Edit/Regenerate/Skip -> Publish.

Emergency broadcasts can target the entire group, a company, location, department, role or selected employees. The sender explicitly chooses whether to send push notifications and whether acknowledgement is required.

## Initial Cloudflare architecture

- React + Vite
- Cloudflare Workers + official Cloudflare Vite plugin
- Cloudflare D1 migrations
- Cloudflare R2 for documents/photos/evidence
- Workers AI binding
- PWA/offline queue
- Later native Android layer for approved background location/geofencing

## Bootstrap milestone

This first milestone establishes:

1. Cloudflare-ready application scaffold.
2. Unique responsive shell and theme system.
3. Group Owner dashboard foundation and Action Center.
4. D1 core data model for tenancy, RBAC, security, audit, attendance, tracking, payroll, forms, broadcasts and facilities.
5. Worker API bootstrap and AI help endpoint foundation.

No Farms production files are modified by this subtree.