import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8'));
db.exec(readFileSync(new URL('../migrations/0100_staffportal_recruitment.sql', import.meta.url), 'utf8'));
const q = (sql, ...values) => db.prepare(sql).run(...values);
const one = (sql, ...values) => db.prepare(sql).get(...values);
let checked = 0;
const test = (name, run) => {
  try { run(); checked++; console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e); process.exitCode = 1; }
};
const denied = (fn, pattern) => assert.throws(fn, pattern);
const addCandidate = (id, company = 'coA', location = 'locA') =>
  q(`INSERT INTO recruitment_candidates
    (id,company_id,location_id,candidate_ref,full_name,role_title,created_by)
    VALUES(?,?,?,?,?,?,?)`, id,company,location,'ref-'+id,'Test Applicant','Engineer','ownerA');
const addInterview = (id, employee = 'interviewerA', company = 'coA') =>
  q(`INSERT INTO recruitment_interviews
    (id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by)
    VALUES(?,?,?,?,?,?)`, id,company,'candScheduler',employee,'2027-01-01T12:00:00.000Z','ownerA');
const addDecisionReadyCandidate = (id) => {
  addCandidate(id,'coA',null);
  q('UPDATE recruitment_candidates SET stage=? WHERE id=?','screening',id);
  q(`INSERT INTO recruitment_interviews
    (id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by)
    VALUES(?,?,?,?,?,?)`,'decision-interview-'+id,'coA',id,'interviewerOtherSite','2025-01-01T09:00:00.000Z','ownerA');
  q(`UPDATE recruitment_interviews SET status='completed',feedback='Documented decision evidence',recommendation='hold' WHERE id=?`,'decision-interview-'+id);
  q('UPDATE recruitment_candidates SET stage=? WHERE id=?','interview',id);
  q('UPDATE recruitment_candidates SET stage=? WHERE id=?','decision',id);
};

q("INSERT INTO companies(id,code,name,business_type) VALUES('coA','A','A Corp','services')");
q("INSERT INTO companies(id,code,name,business_type) VALUES('coB','B','B Corp','services')");
for (const id of ['ownerA','interviewerA','interviewerB','interviewerOtherSite','offboarded']) {
  q('INSERT INTO employees(id,display_name,employment_status) VALUES(?,?,?)',
    id,id,id==='offboarded'?'terminated':'active');
}
q("INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES('ma','interviewerA','coA',1)");
q("INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES('mb','interviewerB','coB',1)");
q("INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES('mt','offboarded','coA',1)");
q("INSERT INTO company_locations(id,company_id,name,active) VALUES('locA','coA','L A',1)");
q("INSERT INTO company_locations(id,company_id,name,active) VALUES('locB','coB','L B',1)");
q("INSERT INTO company_locations(id,company_id,name,active) VALUES('locClosed','coA','Closed',0)");
q("INSERT INTO company_locations(id,company_id,name,active) VALUES('locOther','coA','Other A Site',1)");
q("UPDATE employee_company_memberships SET location_id='locA' WHERE employee_id='interviewerA' AND company_id='coA'");
q("UPDATE employee_company_memberships SET location_id='locB' WHERE employee_id='interviewerB' AND company_id='coB'");
q("INSERT INTO employee_company_memberships(id,employee_id,company_id,location_id,active) VALUES('mos','interviewerOtherSite','coA','locOther',1)");

test('current migration loads with committed core schema', () =>
  assert.equal(one("SELECT count(*) AS count FROM sqlite_master WHERE name LIKE 'trg_recruitment_%'").count,30));
test('valid company-scoped candidate', () => {
  addCandidate('candA');
  addCandidate('candScheduler');
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candA'");
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candScheduler'");
  assert.equal(one("SELECT company_id AS companyId FROM recruitment_candidates WHERE id='candA'").companyId,'coA');
});
test('foreign company location rejected at database barrier', () =>
  denied(() => addCandidate('candForeign','coA','locB'), /recruitment_location_company_mismatch/));
test('inactive location rejected at database barrier', () =>
  denied(() => addCandidate('candClosed','coA','locClosed'), /recruitment_location_company_mismatch/));
test('missing candidate success audit is rejected', () =>
  denied(() => q("INSERT INTO audit_logs(id,company_id,module,action,entity_type,entity_id) VALUES('bad','coA','recruitment','create','recruitment_candidate','missing')"),
    /recruitment_candidate_missing/));
test('cross-company success audit is rejected', () =>
  denied(() => q("INSERT INTO audit_logs(id,company_id,module,action,entity_type,entity_id) VALUES('bad2','coB','recruitment','create','recruitment_candidate','candA')"),
    /recruitment_candidate_missing/));
test('valid candidate audit persists', () => {
  q("INSERT INTO audit_logs(id,company_id,module,action,entity_type,entity_id) VALUES('good','coA','recruitment','create','recruitment_candidate','candA')");
  assert.equal(one("SELECT count(*) AS count FROM audit_logs WHERE id='good'").count,1);
});
test('eligible interviewer schedule is accepted', () => {
  addInterview('intValid');
  assert.equal(one("SELECT count(*) AS count FROM recruitment_interviews WHERE id='intValid'").count,1);
});
test('same interviewer cannot hold two active interviews at one exact time', () =>
  denied(() => addInterview('intCollision'), /UNIQUE constraint failed/));
test('scheduled interview cannot seed fabricated outcome evidence', () =>
  denied(() => q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,feedback,created_by) VALUES('intSeeded','coA','candA','interviewerA','2025-03-01T00:00:00.000Z','Never held','ownerA')"),
    /recruitment_interview_initial_evidence_invalid/));
test('an interview cannot be initially inserted as completed', () =>
  denied(() => q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,status,created_by) VALUES('intInvented','coA','candA','interviewerA','2025-01-01T00:00:00.000Z','completed','ownerA')"),
    /recruitment_interview_initial_status_invalid/));
test('future interview completion is rejected at SQL boundary', () =>
  denied(() => q("UPDATE recruitment_interviews SET status='completed',feedback='Not yet held',recommendation='hold' WHERE id='intValid'"),
    /recruitment_interview_completion_ineligible/));
test('past interview completion requires actual feedback and recommendation', () => {
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intEvidence','coA','candA','interviewerA','2025-04-01T00:00:00.000Z','ownerA')");
  denied(() => q("UPDATE recruitment_interviews SET status='completed' WHERE id='intEvidence'"),
    /recruitment_interview_outcome_evidence_invalid/);
  denied(() => q("UPDATE recruitment_interviews SET status='completed',feedback='Evidence without recommendation' WHERE id='intEvidence'"),
    /recruitment_interview_outcome_evidence_invalid/);
  denied(() => q("UPDATE recruitment_interviews SET status='cancelled',feedback='Fake cancelled feedback' WHERE id='intEvidence'"),
    /recruitment_interview_outcome_evidence_invalid/);
  assert.equal(one("SELECT status FROM recruitment_interviews WHERE id='intEvidence'").status,'scheduled');
});
test('candidate decision requires completed interview evidence', () => {
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candA'");
  q("UPDATE recruitment_candidates SET stage='interview' WHERE id='candA'");
  denied(() => q("UPDATE recruitment_candidates SET stage='decision' WHERE id='candA'"),
    /recruitment_decision_requires_completed_interview/);
});
test('past interview completion satisfies decision prerequisite', () => {
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intPast','coA','candA','interviewerA','2025-01-01T00:00:00.000Z','ownerA')");
  q("UPDATE recruitment_interviews SET status='completed',feedback='Recorded completed interview evidence',recommendation='advance' WHERE id='intPast'");
  q("UPDATE recruitment_candidates SET stage='decision' WHERE id='candA'");
  assert.equal(one("SELECT stage FROM recruitment_candidates WHERE id='candA'").stage,'decision');
});
test('offer preparation requires actual approved internal offer', () =>
  denied(() => q("UPDATE recruitment_candidates SET stage='offer_prepared' WHERE id='candA'"),
    /recruitment_offer_stage_requires_approval/));
test('terminal candidate cannot acquire fabricated completion evidence', () => {
  addCandidate('candTerm');
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candTerm'");
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intTerm','coA','candTerm','interviewerA','2025-02-01T00:00:00.000Z','ownerA')");
  q("UPDATE recruitment_candidates SET stage='withdrawn' WHERE id='candTerm'");
  denied(() => q("UPDATE recruitment_interviews SET status='completed',feedback='Should never count',recommendation='hold' WHERE id='intTerm'"),
    /recruitment_terminal_candidate_interview/);
});
test('cancellation releases the open slot for a new scheduled interview', () => {
  q("UPDATE recruitment_interviews SET status='cancelled' WHERE id='intValid'");
  addInterview('intAfterCancel');
  assert.equal(one("SELECT status FROM recruitment_interviews WHERE id='intAfterCancel'").status,'scheduled');
});
test('foreign-company interviewer is rejected', () =>
  denied(() => addInterview('intForeign','interviewerB'), /recruitment_interviewer_not_eligible/));
test('other-site interviewer is rejected even with company membership', () =>
  denied(() => addInterview('intOtherSite','interviewerOtherSite'), /recruitment_interviewer_not_eligible/));
test('interview reassignment cannot cross candidate site', () =>
  denied(() => q("UPDATE recruitment_interviews SET interviewer_employee_id='interviewerOtherSite' WHERE id='intValid'"),
    /recruitment_interview_identity_immutable/));
test('offboarded interviewer is rejected', () =>
  denied(() => addInterview('intOffboarded','offboarded'), /recruitment_interviewer_not_eligible/));
test('revoked interviewer rejected before insert even after earlier membership', () => {
  q("UPDATE employee_company_memberships SET active=0 WHERE employee_id='interviewerA' AND company_id='coA'");
  denied(() => addInterview('intRevoked'), /recruitment_interviewer_not_eligible/);
  assert.equal(one("SELECT count(*) AS count FROM recruitment_interviews WHERE id='intRevoked'").count,0);
});
test('interviewer reassignment cannot use revoked employee', () =>
  denied(() => q("UPDATE recruitment_interviews SET interviewer_employee_id='interviewerA' WHERE id='intValid'"),
    /recruitment_interviewer_not_eligible|recruitment_interview_identity_immutable/));
test('stale conditional insert plus required audit rolls back request receipt', () => {
  db.exec('BEGIN');
  try {
    q("INSERT INTO recruitment_request_receipts(id,actor_employee_id,company_id,action,request_key,payload_hash,entity_type,entity_id) VALUES('receiptStale','ownerA','coA','interview','key-00000000001','hash','interview','intStale')");
    const result=q(`INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by)
       SELECT 'intStale','coA','candA','interviewerA','2027-01-01T12:00:00.000Z','ownerA'
       WHERE EXISTS(SELECT 1 FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id
         WHERE m.employee_id='interviewerA' AND m.company_id='coA' AND m.active=1
         AND e.employment_status='active')`);
    assert.equal(result.changes,0);
    q("INSERT INTO audit_logs(id,company_id,module,action,entity_type,entity_id) VALUES('auditStale','coA','recruitment','schedule_interview','recruitment_interview','intStale')");
    throw new Error('audit unexpectedly accepted');
  } catch (e) {
    assert.match(String(e),/recruitment_interview_missing/);
    db.exec('ROLLBACK');
  }
  assert.equal(one("SELECT count(*) AS count FROM recruitment_request_receipts WHERE id='receiptStale'").count,0);
});
test('active offer uniqueness prevents competing drafts', () => {
  q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offer1','coA','candA','Engineer','Private terms','ownerA')");
  denied(() => q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offer2','coA','candA','Engineer','Other terms','ownerA')"),
    /UNIQUE constraint failed/);
});
test('an offer cannot be inserted already approved or with forged approval metadata', () => {
  addDecisionReadyCandidate('candInvalidOffer');
  denied(() => q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,status,created_by) VALUES('offerInvented','coA','candInvalidOffer','Engineer','Hidden terms','approved','ownerA')"),
    /recruitment_offer_initial_status_invalid/);
  denied(() => q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,approved_by,created_by) VALUES('offerForgedMetadata','coA','candInvalidOffer','Engineer','Hidden terms','ownerA','ownerA')"),
    /recruitment_offer_initial_status_invalid/);
  assert.equal(one("SELECT count(*) AS count FROM recruitment_offers WHERE candidate_id='candInvalidOffer'").count,0);
});
const addHandoff = (id, candidateId, offerId, companyId = 'coA') =>
  q(`INSERT INTO recruitment_hr_handoffs
    (id,company_id,candidate_id,offer_id,acceptance_evidence_ref,requested_by)
    VALUES(?,?,?,?,?,?)`, id,companyId,candidateId,offerId,'evidence-reference-123','ownerA');
test('handoff rejects an unapproved offer and unprepared candidate', () =>
  denied(() => addHandoff('handoffDraft','candA','offer1'), /recruitment_handoff_offer_ineligible/));
test('handoff accepts matching approved offer and prepared candidate', () => {
  q("UPDATE recruitment_offers SET status='approved',approved_by='ownerA',approved_at=CURRENT_TIMESTAMP WHERE id='offer1'");
  q("UPDATE recruitment_candidates SET stage='offer_prepared' WHERE id='candA'");
  addHandoff('handoffValid','candA','offer1');
  assert.equal(one("SELECT status FROM recruitment_hr_handoffs WHERE id='handoffValid'").status,'pending');
});
test('same-company cross-candidate handoff is rejected', () => {
  addCandidate('candB','coA',null);
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candB'");
  q("UPDATE recruitment_candidates SET stage='interview' WHERE id='candB'");
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intB','coA','candB','interviewerOtherSite','2025-02-01T00:00:00.000Z','ownerA')");
  q("UPDATE recruitment_interviews SET status='completed',feedback='Recorded interview B',recommendation='hold' WHERE id='intB'");
  q("UPDATE recruitment_candidates SET stage='decision' WHERE id='candB'");
  q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offerB','coA','candB','Engineer','Candidate B private terms','ownerA')");
  q("UPDATE recruitment_offers SET status='approved',approved_by='ownerA',approved_at=CURRENT_TIMESTAMP WHERE id='offerB'");
  q("UPDATE recruitment_candidates SET stage='offer_prepared' WHERE id='candB'");
  denied(() => addHandoff('handoffWrongCandidate','candB','offer1'), /recruitment_handoff_offer_ineligible/);
});
test('HR handoff cannot be inserted with fabricated acknowledgment or acknowledgment metadata', () => {
  denied(() => q("INSERT INTO recruitment_hr_handoffs(id,company_id,candidate_id,offer_id,status,acceptance_evidence_ref,requested_by) VALUES('handoffInvented','coA','candB','offerB','acknowledged','reference-evidence-001','ownerA')"),
    /recruitment_handoff_initial_status_invalid/);
  denied(() => q("INSERT INTO recruitment_hr_handoffs(id,company_id,candidate_id,offer_id,acceptance_evidence_ref,requested_by,acknowledged_employee_id) VALUES('handoffMetadata','coA','candB','offerB','reference-evidence-001','ownerA','ownerA')"),
    /recruitment_handoff_initial_status_invalid/);
  assert.equal(one("SELECT count(*) AS count FROM recruitment_hr_handoffs WHERE candidate_id='candB'").count,0);
});
test('handoff reassignment cannot swap candidate while retaining offer', () =>
  denied(() => q("UPDATE recruitment_hr_handoffs SET candidate_id='candB' WHERE id='handoffValid'"),
    /recruitment_handoff_identity_immutable|recruitment_handoff_offer_ineligible/));
test('active HR handoff uniqueness prevents replayed second request', () =>
  denied(() => addHandoff('handoffDuplicate','candA','offer1'), /UNIQUE constraint failed/));
test('an offer from another company cannot satisfy HR handoff prerequisite', () => {
  q("INSERT INTO recruitment_candidates(id,company_id,location_id,candidate_ref,full_name,role_title,created_by) VALUES('candOtherCompany','coB','locB','ref-candOtherCompany','Other-company candidate','Engineer','ownerA')");
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candOtherCompany'");
  q("UPDATE recruitment_candidates SET stage='interview' WHERE id='candOtherCompany'");
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intOtherCompany','coB','candOtherCompany','interviewerB','2025-02-01T00:00:00.000Z','ownerA')");
  q("UPDATE recruitment_interviews SET status='completed',feedback='Completed interview',recommendation='advance' WHERE id='intOtherCompany'");
  q("UPDATE recruitment_candidates SET stage='decision' WHERE id='candOtherCompany'");
  q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offerOtherCompany','coB','candOtherCompany','Engineer','Private terms','ownerA')");
  q("UPDATE recruitment_offers SET status='approved',approved_by='ownerA',approved_at=CURRENT_TIMESTAMP WHERE id='offerOtherCompany'");
  q("UPDATE recruitment_candidates SET stage='offer_prepared' WHERE id='candOtherCompany'");
  denied(() => addHandoff('handoffWrongCompany','candA','offerOtherCompany'),
    /recruitment_handoff_offer_ineligible/);
});

test('offer approval without decision actor/time or with invalid date is refused', () => {
  addDecisionReadyCandidate('candDecisionMetadata');
  q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offerMetadata','coA','candDecisionMetadata','Engineer','Restricted draft terms','ownerA')");
  denied(() => q("UPDATE recruitment_offers SET status='approved' WHERE id='offerMetadata'"),
    /recruitment_offer_decision_truth_invalid/);
  denied(() => q("UPDATE recruitment_offers SET status='approved',approved_by='ownerA',approved_at='invalid' WHERE id='offerMetadata'"),
    /recruitment_offer_decision_truth_invalid/);
  assert.equal(one("SELECT status FROM recruitment_offers WHERE id='offerMetadata'").status,'draft');
});
test('approved offer is not silently downgraded or reinstated', () => {
  denied(() => q("UPDATE recruitment_offers SET status='withdrawn' WHERE id='offer1'"),
    /recruitment_offer_decision_truth_invalid/);
  assert.equal(one("SELECT status FROM recruitment_offers WHERE id='offer1'").status,'approved');
});
test('HR handoff acknowledgment without complete existing-HR metadata is rejected', () => {
  denied(() => q("UPDATE recruitment_hr_handoffs SET status='acknowledged' WHERE id='handoffValid'"),
    /recruitment_handoff_acknowledgment_truth_invalid/);
  denied(() => q("UPDATE recruitment_hr_handoffs SET status='acknowledged',acknowledged_employee_id='ownerA',acknowledged_at='not-a-date' WHERE id='handoffValid'"),
    /recruitment_handoff_acknowledgment_truth_invalid/);
  assert.equal(one("SELECT status FROM recruitment_hr_handoffs WHERE id='handoffValid'").status,'pending');
});
test('synthetic HR acknowledgment satisfies shape but cannot be reverted (rolled back)', () => {
  db.exec('SAVEPOINT test_only_hr_ack');
  try {
    q("UPDATE recruitment_hr_handoffs SET status='acknowledged',acknowledged_employee_id='ownerA',acknowledged_at=CURRENT_TIMESTAMP WHERE id='handoffValid'");
    assert.equal(one("SELECT status FROM recruitment_hr_handoffs WHERE id='handoffValid'").status,'acknowledged');
    denied(() => q("UPDATE recruitment_hr_handoffs SET status='pending' WHERE id='handoffValid'"),
      /recruitment_handoff_acknowledgment_truth_invalid/);
  } finally {
    db.exec('ROLLBACK TO test_only_hr_ack');
    db.exec('RELEASE test_only_hr_ack');
  }
  assert.equal(one("SELECT status FROM recruitment_hr_handoffs WHERE id='handoffValid'").status,'pending');
});
test('synthetically cancelled handoff cannot be reopened (rolled back)', () => {
  db.exec('SAVEPOINT test_only_hr_cancel');
  try {
    q("UPDATE recruitment_hr_handoffs SET status='cancelled' WHERE id='handoffValid'");
    denied(() => q("UPDATE recruitment_hr_handoffs SET status='acknowledged',acknowledged_employee_id='ownerA',acknowledged_at=CURRENT_TIMESTAMP WHERE id='handoffValid'"),
      /recruitment_handoff_acknowledgment_truth_invalid/);
  } finally {
    db.exec('ROLLBACK TO test_only_hr_cancel');
    db.exec('RELEASE test_only_hr_cancel');
  }
  assert.equal(one("SELECT status FROM recruitment_hr_handoffs WHERE id='handoffValid'").status,'pending');
});

test('candidate cannot be inserted with fabricated progressed stage or revision', () => {
  denied(() => q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,role_title,stage,created_by) VALUES('candInjected','coA','ref-injected','Applicant','Engineer','decision','ownerA')"),
    /recruitment_candidate_initial_stage_invalid/);
  denied(() => q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,role_title,revision,created_by) VALUES('candRevision','coA','ref-revision','Applicant','Engineer',3,'ownerA')"),
    /recruitment_candidate_initial_stage_invalid/);
});
test('candidate stages cannot skip the approved pipeline or reopen terminal states', () => {
  addCandidate('candJump');
  denied(() => q("UPDATE recruitment_candidates SET stage='interview' WHERE id='candJump'"),
    /recruitment_candidate_stage_transition_invalid/);
  denied(() => q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candTerm'"),
    /recruitment_candidate_stage_transition_invalid/);
  assert.equal(one("SELECT stage FROM recruitment_candidates WHERE id='candJump'").stage,'applied');
});
test('candidate company and reference identity cannot change silently', () => {
  denied(() => q("UPDATE recruitment_candidates SET company_id='coB' WHERE id='candJump'"),
    /recruitment_candidate_identity_immutable/);
  denied(() => q("UPDATE recruitment_candidates SET candidate_ref='replacement' WHERE id='candJump'"),
    /recruitment_candidate_identity_immutable/);
  assert.equal(one("SELECT company_id FROM recruitment_candidates WHERE id='candJump'").company_id,'coA');
});

test('candidate site cannot be relabelled after interviewing', () => {
  denied(() => q("UPDATE recruitment_candidates SET location_id='locOther' WHERE id='candA'"),
    /recruitment_candidate_interview_site_immutable/);
  assert.equal(one("SELECT location_id FROM recruitment_candidates WHERE id='candA'").location_id,'locA');
});
test('a new candidate may change to another active site before interviewing', () => {
  addCandidate('candRelocatable');
  q("UPDATE recruitment_candidates SET location_id='locOther' WHERE id='candRelocatable'");
  assert.equal(one("SELECT location_id FROM recruitment_candidates WHERE id='candRelocatable'").location_id,'locOther');
  denied(() => q("UPDATE recruitment_candidates SET location_id='locB' WHERE id='candRelocatable'"),
    /recruitment_location_company_mismatch/);
});
test('pending HR handoff cannot be repointed after recording', () => {
  denied(() => q("UPDATE recruitment_hr_handoffs SET offer_id='offerB' WHERE id='handoffValid'"),
    /recruitment_handoff_identity_immutable|recruitment_handoff_offer_ineligible/);
  assert.equal(one("SELECT offer_id FROM recruitment_hr_handoffs WHERE id='handoffValid'").offer_id,'offer1');
});

test('interview insertion requires screening or interview stage', () => {
  addCandidate('candAppliedStage','coA',null);
  denied(() => q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intAppliedBlocked','coA','candAppliedStage','interviewerOtherSite','2025-03-05T12:00:00.000Z','ownerA')"),
    /recruitment_interview_candidate_stage_ineligible/);
  denied(() => q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('intLateBlocked','coA','candA','interviewerOtherSite','2025-03-06T12:00:00.000Z','ownerA')"),
    /recruitment_interview_candidate_stage_ineligible/);
});
test('offer insertion requires documented candidate decision stage', () => {
  denied(() => q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offerAppliedBlocked','coA','candAppliedStage','Engineer','Unapproved premature terms','ownerA')"),
    /recruitment_offer_candidate_stage_ineligible/);
  denied(() => q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('offerLateBlocked','coA','candTerm','Engineer','Terminal terms','ownerA')"),
    /recruitment_offer_candidate_stage_ineligible/);
});
test('recorded interview candidate and appointment are immutable', () => {
  denied(() => q("UPDATE recruitment_interviews SET candidate_id='candA' WHERE id='intValid'"),
    /recruitment_interview_identity_immutable/);
  denied(() => q("UPDATE recruitment_interviews SET scheduled_at='2028-01-01T12:00:00.000Z' WHERE id='intValid'"),
    /recruitment_interview_identity_immutable/);
  denied(() => q("UPDATE recruitment_interviews SET meeting_mode='phone' WHERE id='intValid'"),
    /recruitment_interview_identity_immutable/);
  assert.equal(one("SELECT candidate_id FROM recruitment_interviews WHERE id='intValid'").candidate_id,'candScheduler');
});

test('offer cannot change company, candidate or approved terms', () => {
  denied(() => q("UPDATE recruitment_offers SET company_id='coB' WHERE id='offer1'"),
    /recruitment_offer_identity_terms_immutable/);
  denied(() => q("UPDATE recruitment_offers SET candidate_id='candB' WHERE id='offer1'"),
    /recruitment_offer_identity_terms_immutable/);
  denied(() => q("UPDATE recruitment_offers SET terms_summary='Rewritten after approval' WHERE id='offer1'"),
    /recruitment_offer_identity_terms_immutable/);
  assert.equal(one("SELECT terms_summary FROM recruitment_offers WHERE id='offer1'").terms_summary,'Private terms');
});
test('draft terms remain editable but cannot change during approval', () => {
  q("UPDATE recruitment_offers SET terms_summary='Updated internal draft' WHERE id='offerMetadata'");
  assert.equal(one("SELECT terms_summary FROM recruitment_offers WHERE id='offerMetadata'").terms_summary,'Updated internal draft');
  denied(() => q("UPDATE recruitment_offers SET status='approved',approved_by='ownerA',approved_at=CURRENT_TIMESTAMP,terms_summary='Switch on approval' WHERE id='offerMetadata'"),
    /recruitment_offer_identity_terms_immutable/);
});
test('submitted HR acceptance evidence cannot be overwritten', () => {
  denied(() => q("UPDATE recruitment_hr_handoffs SET acceptance_evidence_ref='replacement-proof' WHERE id='handoffValid'"),
    /recruitment_handoff_evidence_immutable/);
  assert.equal(one("SELECT acceptance_evidence_ref FROM recruitment_hr_handoffs WHERE id='handoffValid'").acceptance_evidence_ref,'evidence-reference-123');
});

test('completed interview outcome evidence cannot be rewritten', () => {
  denied(() => q("UPDATE recruitment_interviews SET feedback='Replaced after completion' WHERE id='intPast'"),
    /recruitment_interview_outcome_immutable/);
  denied(() => q("UPDATE recruitment_interviews SET recommendation='hold' WHERE id='intPast'"),
    /recruitment_interview_outcome_immutable/);
  assert.equal(one("SELECT feedback FROM recruitment_interviews WHERE id='intPast'").feedback,
    'Recorded completed interview evidence');
});
test('cancelled interview cannot be reopened as scheduled', () => {
  denied(() => q("UPDATE recruitment_interviews SET status='scheduled' WHERE id='intValid'"),
    /recruitment_interview_outcome_immutable/);
  assert.equal(one("SELECT status FROM recruitment_interviews WHERE id='intValid'").status,'cancelled');
});
test('approved offer actor and approval time cannot be substituted', () => {
  denied(() => q("UPDATE recruitment_offers SET approved_by='interviewerOtherSite' WHERE id='offer1'"),
    /recruitment_offer_decision_metadata_immutable/);
  denied(() => q("UPDATE recruitment_offers SET approved_at='2026-01-01T12:00:00Z' WHERE id='offer1'"),
    /recruitment_offer_decision_metadata_immutable/);
  assert.equal(one("SELECT approved_by FROM recruitment_offers WHERE id='offer1'").approved_by,'ownerA');
});

console.log(`RECRUITMENT SQLITE: ${checked} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
