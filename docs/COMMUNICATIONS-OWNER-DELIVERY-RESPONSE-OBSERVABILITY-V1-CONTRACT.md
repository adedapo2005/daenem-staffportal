# Communications Owner Delivery + Response Observability V1 Contract

Status: OWNER APPROVED
Scope: DAENEM Staff Portal only
Farms: EXCLUDED

## 1. Owner Objective
Provide the Owner with one permission-controlled command center for customer, employee, and system communications across supported channels.

The Owner must be able to distinguish:
- queued;
- sending;
- accepted by provider;
- delivered;
- read/viewed where provider or application evidence supports it;
- acknowledged;
- responded;
- actioned;
- resolved;
- failed;
- cancelled;
- expired;
- escalated;
- SLA breached.

Opening or viewing a message must never count as a response.
## 2. Read But Unanswered
For assigned or escalated conversations, explicitly detect and surface:
- unread;
- viewed but not acknowledged;
- acknowledged but not responded;
- read/viewed but unanswered;
- responded but unresolved;
- escalation exhausted.

Track:
- assignment time;
- delivery time;
- first viewed time;
- acknowledgement time;
- first response time;
- last response time;
- resolution time;
- elapsed waiting time;
- SLA state.

## 3. Cross-Channel Truth
Supported observability must include, where applicable:
- WhatsApp;
- Email;
- In-App;
- Screen Popup;
- Web Push;
- future approved channels.

Never infer a provider state that is not authoritative.
## 4. Provider-Specific Semantics
WhatsApp:
- use provider accepted/sent/delivered/read/failed evidence when available.

In-App:
- DAENEM may truthfully record delivered, viewed, acknowledged, actioned, and deep-link open events.

Web Push:
- record dispatch/delivery evidence supported by the push provider and record application/deep-link open separately.

Email:
- do not claim definitive read state when only tracking-pixel/open evidence exists.
- use truthful labels such as Delivered, Open Detected, Clicked, or No Open Evidence.

## 5. Escalation Logic
Configured High/Critical workflows may escalate on:
- delivery failure;
- delivered but not viewed within threshold;
- viewed but not acknowledged within threshold;
- acknowledged but no response/action within threshold;
- response sent but case unresolved beyond threshold.

Thresholds must be configurable and audited.
## 6. Owner Communications Command Center
Provide Owner-level filters for:
- business;
- recipient type;
- customer vs employee;
- channel;
- priority;
- assigned user;
- message/use-case;
- automated vs human;
- delivery state;
- read/view state;
- acknowledgement state;
- response state;
- escalation state;
- SLA state;
- date/time.

Provide Owner exception panels for:
- Critical delivered but unread;
- Critical read but unanswered;
- High SLA breached;
- failed delivery;
- repeated provider failures;
- user viewed but did not acknowledge;
- assigned user unavailable;
- escalation exhausted;
- customer waiting too long;
- provider degradation.

## 7. Zero Disclosure + Access
- Owner has full authorized cross-company visibility.
- Other users only see records allowed by company, role, and communication permissions.
- Counts, recipient identities, customer data, message previews, and statuses must not leak across unauthorized scopes.
- Farms must not appear anywhere in this Staff Portal command center.

## 8. Audit + Acceptance
Audit status transitions, provider events, assignment, views, acknowledgements, responses, escalation, SLA state changes, and manual overrides.

This capability is complete only when:
1. status ingestion is provider-truthful;
2. read/view vs response is distinguished;
3. read-but-unanswered detection works;
4. escalation rules work;
5. Owner dashboard works;
6. permissions and Zero Disclosure pass;
7. responsive/accessibility/browser QA pass;
8. non-production deployment is verified;
9. production sending remains Owner-gated.
