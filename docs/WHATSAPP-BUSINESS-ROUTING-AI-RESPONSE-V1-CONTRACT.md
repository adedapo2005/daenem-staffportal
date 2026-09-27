# WhatsApp Business Routing + AI Response V1 Contract

Status: OWNER APPROVED
Scope: DAENEM Staff Portal only
Farms: EXCLUDED

## 1. Core Model
- Use one shared DAENEM WhatsApp number for Staff Portal businesses.
- Do not expose DAENEM's other businesses to customers.
- Route inbound conversations silently to the appropriate business.
- Each business has a separate permission-scoped inbox.
- A conversation must belong to one business before business-specific replies are sent.
- Owner/authorized admins may re-route, assign, escalate, pause automation, or take over.

## 2. Routing Evidence Order
Use the strongest available evidence in this order:
1. known source/referral/campaign/website/QR context;
2. existing customer-to-business conversation history;
3. authenticated business/customer record association;
4. high-confidence message intent classification;
5. human routing when confidence is insufficient.
## 3. Zero Disclosure
- Never present a public menu of DAENEM businesses.
- Never disclose unrelated DAENEM businesses during routing or AI replies.
- Business-scoped AI may access only the authorized business knowledge needed for that conversation.
- Users without the relevant company/inbox permission receive zero disclosure.
- Farms must never appear, route, or be selectable in this Staff Portal workflow.

## 4. AI Customer Responses
Low-risk, authoritative questions may be answered automatically when policy permits.
Examples: approved opening hours, approved location, approved catalogue/service facts, verified availability, approved pricing, basic FAQs, and verified order/status information.

AI must not invent facts, prices, availability, customer records, policies, promises, or timelines.
## 5. Confidence and Risk Gates
- High confidence + low risk + authoritative data: auto-answer if auto-send is enabled.
- Medium confidence: generate a draft for human review.
- Low confidence, conflicting data, or missing authority: do not answer substantively; ask a safe clarification or escalate.
- Complaints, refunds, disputes, legal/contractual issues, sensitive personal information, high-value negotiations, or explicit human requests: human-controlled workflow.

## 6. Human Takeover
Support per-conversation states:
- Auto Reply
- AI Draft Only
- Human Only
- Take Over Conversation
- Resume AI

Human takeover pauses autonomous replies for that conversation until explicitly resumed.
## 7. Assignment, Priority, and Escalation
Support:
- assignment to a specific authorized employee;
- Normal / Attention / High / Critical priority;
- acknowledgement tracking;
- reassignment and escalation;
- response-target timers;
- supervisor/manager escalation when configured thresholds are missed.

Assignment or escalation must create an immediate in-app alert.
High/Critical may additionally create mobile push and optional employee WhatsApp notification according to policy.
Do not forward sensitive customer message content to an employee's personal WhatsApp by default; use a secure deep link into Staff Portal.

## 8. Access Model
- Business Inbox permission: browse an authorized business inbox.
- Assigned Conversation access: view a specifically assigned conversation when explicitly granted by assignment policy.
- Reply permission is separate from view permission.
- Assignment permission is separate from reply permission.
- Owner/Admin can configure these controls per company/role/user.
## 9. Audit and Provider Truth
Audit routing, assignment, priority changes, AI/human mode changes, generated drafts, sends, acknowledgement, escalation, re-routing, and resolution.
Provider delivery state must remain truthful.
Production WhatsApp sends remain disabled until separately Owner-authorized.
Existing Meta credential-vault, template approval, consent, opt-out, rate, and Zero Disclosure controls remain mandatory.

## 10. Completion Gate
This capability is complete only when source, runtime, permissions, routing, AI response gating, notifications, escalation, browser QA, responsive QA, accessibility, audit evidence, and deployed non-production verification all pass.
