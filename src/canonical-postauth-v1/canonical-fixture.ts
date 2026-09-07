import type { CanonicalFixture } from './canonical-types';

/**
 * VISUAL QA ONLY. Never use this fixture as production business truth.
 * Production integration must supply authorized live data through adapters.
 */
export const CANONICAL_VISUAL_FIXTURE: CanonicalFixture = {
  viewer: { displayName: 'Daniel', role: 'Owner', initials: 'DT' },
  workspace: { name: 'Daenem Global', subtitle: 'Owner Workspace' },
  release: { version: 'v2.4.0', label: 'Live' },
  sync: { label: 'Synced', detail: 'Just Now' },
  dateTime: { date: 'Thu, 24 Apr 2025', time: '10:24 AM', zone: 'Singapore (SGT)' },
  weather: { city: 'Singapore', tempC: 32, condition: 'Partly Cloudy', humidity: 70, windKph: 12, uv: '8 (Very High)' },
  kpis: [
    { label: 'Total Staff', value: '248', delta: '▲ 12%', meta: 'Vs Last Month', tone: 'blue' },
    { label: 'Monthly Revenue', value: 'S$ 128,430', delta: '▲ 8%', meta: 'Vs Last Month', tone: 'cyan' },
    { label: 'Active Projects', value: '36', delta: '▲ 20%', meta: 'Vs Last Month', tone: 'violet' },
    { label: 'Pending Approvals', value: '7', delta: '▼ 42%', meta: 'Vs Last Month', tone: 'coral' },
    { label: 'System Uptime', value: '99.98%', delta: '▲ 0.01%', meta: 'Last 30 Days', tone: 'success' },
  ],
  tasks: [
    { title: 'Review Q2 Financial Report', meta: 'Due Today · 11:00 AM', priority: 'High' },
    { title: 'Approve Marketing Budget', meta: 'Due Today · 1:00 PM', priority: 'High' },
    { title: 'Meet With Regional Leads', meta: 'Tomorrow · 4:00 PM', priority: 'Medium' },
    { title: 'Check System Upgrade Plan', meta: '25 Apr 2025', priority: 'Medium' },
    { title: 'Prepare Board Update', meta: '26 Apr 2025', priority: 'Low' },
  ],
  approvals: [
    { title: 'Annual Leave Request', meta: 'Jamie Lee · 2 Days Ago', status: 'Pending' },
    { title: 'Department Budget', meta: 'Marketing Team · 1 Day Ago', status: 'Pending' },
    { title: 'New Vendor Onboarding', meta: 'Tech Solutions · 2 Days Ago', status: 'In Review' },
    { title: 'Project Proposal', meta: 'Orion Expansion · 3 Days Ago', status: 'Pending' },
  ],
  activity: [
    { title: 'Rachel Lim Uploaded Q2 Marketing Plan', meta: '10 Minutes Ago' },
    { title: 'System Completed Daily Backup', meta: '28 Minutes Ago' },
    { title: 'Marcus Tan Approved Leave Request', meta: '1 Hour Ago' },
    { title: 'Finance Team Updated Revenue Forecast', meta: '2 Hours Ago' },
  ],
  worldTimes: [
    { city: 'Singapore', time: '10:24 AM', date: 'Thu, 24 Apr' },
    { city: 'London', time: '3:24 AM', date: 'Thu, 24 Apr' },
    { city: 'New York', time: '10:24 PM', date: 'Wed, 23 Apr' },
    { city: 'Sydney', time: '12:24 PM', date: 'Thu, 24 Apr' },
  ],
};
