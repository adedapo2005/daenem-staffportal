# Workflow state inventory — incomplete transition specification

PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION. The lists below are registered UI states, not proof of complete state machines. Do not infer every adjacent transition is allowed. Full entry/exit predicates, reversal, compensation, concurrency, approval, audit and notification semantics remain to be mapped.

## Overview

Registered states: Open → In Review → Resolved.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Operational Cockpit

Registered states: Open → Investigating → Resolved.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## My Workspace

Registered states: To Do → In Progress → Done.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## My Profile

Registered states: Action Required → Verified.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## People & HR

Registered states: Active → Onboarding → On Leave.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## HR Master Records

Registered states: Missing Information → In Review → Verified.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Attendance & Location

Registered states: Not Started → Incomplete → Present → Late.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Leave Management

Registered states: Draft → Submitted → Approved → Returned.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Performance Reviews

Registered states: Not Started → Self Review → Manager Review → Acknowledged.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## HR Cases

Registered states: Open → Investigating → Action Required → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Onboarding & Offboarding

Registered states: Identity → Assignment → Payroll → Acknowledgement → Complete.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Forms Center

Registered states: Draft → Submitted → Returned → Approved.

Current source: model.ts and enterprise-contract.ts. Required field gate: Required Response. Complete transition graph: NOT VERIFIED.

## Tasks & Approvals

Registered states: To Do → In Progress → Review → Done.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Payroll Control

Registered states: Prepare → Validate → Review → Approved → Draft Export.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## My Payslips

Registered states: Available → Payment Pending → Paid.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Bank Payment Batches

Registered states: Draft → Validation → Approval → Draft Export.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Job Applications

Registered states: Applied → Screening → Interview → Offer → Hired.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Interview Pipeline

Registered states: Scheduled → Interviewed → Scorecard Due → Reviewed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Hiring Workflow

Registered states: Approved → Offer Draft → Offer Accepted → Onboarding.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Printing Production

Registered states: Enquiry → Quote → Approval → Artwork → Proof → Proof Approval → Job Card → Material Issue → Printing → Finishing → QC → Delivery → Invoice → Payment → Complete.

Current source: model.ts and enterprise-contract.ts. Required field gate: Material Usage. Complete transition graph: NOT VERIFIED.

## Customers & Print Orders

Registered states: Enquiry → Quoted → Approved → Ordered.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Print Materials & Costing

Registered states: Issued → Usage Pending → Reconciled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Bakery Production

Registered states: Planned → Ingredient Issue → Baking → Yield Required → QC → Complete.

Current source: model.ts and enterprise-contract.ts. Required field gate: Actual Yield. Complete transition graph: NOT VERIFIED.

## Recipes & Ingredients

Registered states: Draft → Reviewed → Active.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Bakery Orders & Remittance

Registered states: Pre-order → Dispatch → Delivered → Remittance Due → Reconciled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Vehicle Sales

Registered states: Acquired → Documentation → Available → Reserved → Sold → Delivered.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Auto Leads & Sales

Registered states: New Lead → Showing → Test Drive → Deposit → Sale → Delivery.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Historical Workshop Records

Registered states: Archived.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Logistics Dispatch

Registered states: Booked → Assigned → In Transit → POD Required → Delivered → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: Proof of Delivery. Complete transition graph: NOT VERIFIED.

## Fleet & Drivers

Registered states: Available → Assigned → Maintenance → Document Due.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Trip Expenses & Collections

Registered states: Draft → Submitted → Reviewed → Reconciled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Homes & Properties

Registered states: Occupied → Available → Maintenance.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Leases & Rent Schedules

Registered states: Draft → Active → Expiring → Renewed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Property Sales & Leads

Registered states: Enquiry → Inspection → Negotiation → Contract → Completed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Finance Workspace

Registered states: Draft → Pending Review → Posted → Reconciliation.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Receivables

Registered states: Current → 1–30 Days → 31–60 Days → 61+ Days → Paid.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Finance Posting

Registered states: Queued → Validation Failed → Posted → Reconciled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Budgets & Fiscal Periods

Registered states: Draft → Reviewed → Active → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## My Expense Requests

Registered states: Draft → Submitted → Approved → Returned → Rejected.

Current source: model.ts and enterprise-contract.ts. Required field gate: Receipt. Complete transition graph: NOT VERIFIED.

## Expense Approval Queue

Registered states: Submitted → Approved → Returned → Rejected.

Current source: model.ts and enterprise-contract.ts. Required field gate: Receipt. Complete transition graph: NOT VERIFIED.

## Spend & Profit Intelligence

Registered states: Evidence Due → Reviewed → Reconciled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Cost Intelligence Administration

Registered states: Draft → Reviewed → Active.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Inventory

Registered states: Available → Low Stock → Reserved → In Transit.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Construction & Projects

Registered states: Planning → In Progress → At Risk → Complete.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Facilities & Maintenance

Registered states: Reported → Assigned → In Progress → Resolved.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Social Engine

Registered states: Draft → In Review → Approved → Published (Demo).

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Social Controls

Registered states: Draft → Reviewed → Active.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Social Accounts

Registered states: Unavailable.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## ERP Social Sync

Registered states: Queued → Needs Review → Approved → Simulated Sync.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Marketing Command

Registered states: Draft → Active → Review → Completed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Community Inbox

Registered states: Unassigned → Assigned → Replied (Demo) → Escalated → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Website Administration

Registered states: Draft → In Review → Approved → Published (Demo).

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Notice Board

Registered states: Unread → Read → Acknowledged.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Broadcast Center

Registered states: Draft → Preview → Approved → Published (Demo).

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Daily Staff Encouragement

Registered states: Generate → Preview → Approved → Published (Demo).

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Action Center

Registered states: Unread → In Progress → Resolved.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## AI Guide

Registered states: Draft → Answered.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Security Center

Registered states: Open → Investigating → Reviewed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Access Control

Registered states: Draft → Applied → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Admin Setup

Registered states: Draft → Preview → Applied → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Temporary Password Recovery

Registered states: Requested → Issued (Demo) → Expired → Revoked.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## User Support Centre

Registered states: Awaiting Consent → Authorized → In Progress → Resolved.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Resource Monitoring

Registered states: Unavailable.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Sync & Sessions

Registered states: Waiting to Sync → Syncing → Synced (Demo) → Conflict.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Activity & Audit

Registered states: Recorded.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Advanced Toolbox

Registered states: Not Run → Needs Attention → Checked (Demo).

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## API & Integrations

Registered states: Unavailable.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Module Hub

Registered states: Available.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Theme Studio

Registered states: Preview → Applied.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Navigation Studio

Registered states: Preview → Applied.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Layout Studio

Registered states: Preview → Applied → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Sign-In Personalization

Registered states: Preview → Applied.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Procurement

Registered states: Draft → Submitted → Approved → Sourcing → Converted → Cancelled.

Current source: model.ts and enterprise-contract.ts. Required field gate: Receipt. Complete transition graph: NOT VERIFIED.

## Purchase Orders

Registered states: Draft → Submitted → Approved → Ordered → Partially Received → Received → Closed → Cancelled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Goods Receipts

Registered states: Draft → Inspected → Accepted → Posted → Cancelled.

Current source: model.ts and enterprise-contract.ts. Required field gate: Receipt. Complete transition graph: NOT VERIFIED.

## Stock Transfers

Registered states: Draft → Approved → Dispatched → In Transit → Received → Closed → Cancelled.

Current source: model.ts and enterprise-contract.ts. Required field gate: Receipt. Complete transition graph: NOT VERIFIED.

## Stock Borrowing

Registered states: Draft → Submitted → Approved → Issued → Partially Returned → Returned → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Bakery Accountability

Registered states: Draft → Dispatched → Remittance Due → Investigating → Resolved → Reconciled.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Technology Services

Registered states: New → Triaged → Assigned → In Progress → Customer Review → Resolved → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: Resolution. Complete transition graph: NOT VERIFIED.

## Vacancies

Registered states: Draft → Approved → Open → Interviewing → Filled → Closed.

Current source: model.ts and enterprise-contract.ts. Required field gate: Approval. Complete transition graph: NOT VERIFIED.

## Staff Messaging

Registered states: Draft → Sent → Acknowledged → Archived.

Current source: model.ts and enterprise-contract.ts. Required field gate: Message. Complete transition graph: NOT VERIFIED.

## Work Effectiveness

Registered states: Current → Reviewed → Action Planned.

Current source: model.ts and enterprise-contract.ts. Required field gate: Business Purpose. Complete transition graph: NOT VERIFIED.

## Work-Location Policy

Registered states: Draft → Review → Approved → Active → Expired.

Current source: model.ts and enterprise-contract.ts. Required field gate: Privacy Explanation. Complete transition graph: NOT VERIFIED.

## Salary Adjustments

Registered states: Draft → Review → Approved → Payroll Ready → Visible → Cancelled.

Current source: model.ts and enterprise-contract.ts. Required field gate: Reason. Complete transition graph: NOT VERIFIED.

## Controlled Data Import

Registered states: Choose Entity → Upload → Map → Validate → Duplicate Review → Dry Run → Imported.

Current source: model.ts and enterprise-contract.ts. Required field gate: Mapping. Complete transition graph: NOT VERIFIED.

## Dashboard Personalization

Registered states: Draft → Preview → Saved → Restored.

Current source: model.ts and enterprise-contract.ts. Required field gate: Widget. Complete transition graph: NOT VERIFIED.

## File Manager

Registered states: Available.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Saved Views

Registered states: Draft → Saved.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Field Configuration

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Form Builder

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Workflow Builder

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Report Builder

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Widget Builder

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Theme Builder

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Business Rules

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Notification Policies

Registered states: Draft → Validated → Simulated → Published → Rolled Back.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Sessions & Usage

Registered states: Active → Revoked.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

## Report Center

Registered states: Available.

Current source: model.ts and enterprise-contract.ts. Required field gate: No single registry gate; review domain rules. Complete transition graph: NOT VERIFIED.

Configuration has a local Draft → Validated → Simulated → Published → Rolled Back sequence with validation and specialized publish/override checks. Authentication and attendance state contracts are described separately. None is a production workflow engine.
