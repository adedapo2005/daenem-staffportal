-- StaffPortal internal Recruitment/Jobs ERP.
-- Separate from public website vacancies/applications and canonical HR employee records.
-- All identities are company-bound; no production migration is executed by this writer.
CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  location_id TEXT REFERENCES company_locations(id),
  candidate_ref TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role_title TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'internal' CHECK (source_kind IN ('internal','referral','import_reference','website_reference')),
  source_reference TEXT,
  stage TEXT NOT NULL DEFAULT 'applied' CHECK (stage IN ('applied','screening','interview','decision','offer_prepared','closed_rejected','withdrawn')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_mutation_id TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id),
  updated_by TEXT REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,id),
  UNIQUE(company_id,candidate_ref)
);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_scope
  ON recruitment_candidates(company_id,stage,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_candidates_location
  ON recruitment_candidates(company_id,location_id);

CREATE TABLE IF NOT EXISTS recruitment_interviews (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  interviewer_employee_id TEXT NOT NULL REFERENCES employees(id),
  scheduled_at TEXT NOT NULL,
  meeting_mode TEXT NOT NULL DEFAULT 'remote' CHECK (meeting_mode IN ('remote','onsite','phone')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  feedback TEXT,
  recommendation TEXT CHECK (recommendation IN ('advance','hold','reject') OR recommendation IS NULL),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_mutation_id TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,candidate_id) REFERENCES recruitment_candidates(company_id,id)
);
CREATE INDEX IF NOT EXISTS idx_recruitment_interviews_candidate
  ON recruitment_interviews(company_id,candidate_id,scheduled_at DESC);
-- One scheduled slot per employee globally, even with concurrent company-scoped requests.
-- Completed/cancelled records remain historical evidence and release their slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitment_interviewer_open_slot
  ON recruitment_interviews(interviewer_employee_id,scheduled_at)
  WHERE status='scheduled';

CREATE TABLE IF NOT EXISTS recruitment_offers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  role_title TEXT NOT NULL,
  terms_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','withdrawn')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  last_mutation_id TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id),
  approved_by TEXT REFERENCES employees(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,candidate_id) REFERENCES recruitment_candidates(company_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitment_active_offer
  ON recruitment_offers(company_id,candidate_id) WHERE status IN ('draft','approved');
CREATE INDEX IF NOT EXISTS idx_recruitment_offers_candidate
  ON recruitment_offers(company_id,candidate_id,created_at DESC);

CREATE TABLE IF NOT EXISTS recruitment_hr_handoffs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','cancelled')),
  acceptance_evidence_ref TEXT NOT NULL,
  acknowledged_employee_id TEXT REFERENCES employees(id),
  acknowledged_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  last_mutation_id TEXT,
  requested_by TEXT NOT NULL REFERENCES employees(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id,candidate_id) REFERENCES recruitment_candidates(company_id,id),
  FOREIGN KEY(company_id,offer_id) REFERENCES recruitment_offers(company_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recruitment_active_hr_handoff
  ON recruitment_hr_handoffs(company_id,candidate_id) WHERE status IN ('pending','acknowledged');
CREATE INDEX IF NOT EXISTS idx_recruitment_hr_handoffs_scope
  ON recruitment_hr_handoffs(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS recruitment_request_receipts (
  id TEXT PRIMARY KEY,
  actor_employee_id TEXT NOT NULL REFERENCES employees(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  action TEXT NOT NULL,
  request_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(actor_employee_id,company_id,action,request_key)
);
CREATE INDEX IF NOT EXISTS idx_recruitment_receipts_entity
  ON recruitment_request_receipts(company_id,entity_type,entity_id);

-- A conditional INSERT ... SELECT may affect zero rows after a stale pre-read.
-- Abort the entire D1 batch rather than retaining a false success receipt/audit.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_audit_entity_required
BEFORE INSERT ON audit_logs
WHEN NEW.module='recruitment'
BEGIN
  SELECT CASE
    WHEN NEW.company_id IS NULL THEN RAISE(ABORT,'recruitment_audit_company_required')
    WHEN NEW.entity_type='recruitment_candidate' AND NOT EXISTS (
      SELECT 1 FROM recruitment_candidates WHERE id=NEW.entity_id AND company_id=NEW.company_id
    ) THEN RAISE(ABORT,'recruitment_candidate_missing')
    WHEN NEW.entity_type='recruitment_interview' AND NOT EXISTS (
      SELECT 1 FROM recruitment_interviews WHERE id=NEW.entity_id AND company_id=NEW.company_id
    ) THEN RAISE(ABORT,'recruitment_interview_missing')
    WHEN NEW.entity_type='recruitment_offer' AND NOT EXISTS (
      SELECT 1 FROM recruitment_offers WHERE id=NEW.entity_id AND company_id=NEW.company_id
    ) THEN RAISE(ABORT,'recruitment_offer_missing')
    WHEN NEW.entity_type='recruitment_hr_handoff' AND NOT EXISTS (
      SELECT 1 FROM recruitment_hr_handoffs WHERE id=NEW.entity_id AND company_id=NEW.company_id
    ) THEN RAISE(ABORT,'recruitment_handoff_missing')
    WHEN NEW.entity_type NOT IN (
      'recruitment_candidate','recruitment_interview','recruitment_offer','recruitment_hr_handoff'
    ) THEN RAISE(ABORT,'recruitment_audit_entity_invalid')
  END;
END;

-- Existing location FK protects existence, not ownership by the candidate company.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_location_company_insert
BEFORE INSERT ON recruitment_candidates
WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM company_locations
  WHERE id=NEW.location_id AND company_id=NEW.company_id AND active=1
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_location_company_mismatch');
END;
CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_location_company_update
BEFORE UPDATE OF company_id,location_id ON recruitment_candidates
WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM company_locations
  WHERE id=NEW.location_id AND company_id=NEW.company_id AND active=1
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_location_company_mismatch');
END;

-- Membership/employee eligibility is checked at mutation time, not only by a stale API pre-read.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interviewer_company_insert
BEFORE INSERT ON recruitment_interviews
WHEN NOT EXISTS (
  SELECT 1 FROM employee_company_memberships m
  JOIN employees e ON e.id=m.employee_id
  JOIN recruitment_candidates c ON c.id=NEW.candidate_id AND c.company_id=NEW.company_id
  WHERE m.employee_id=NEW.interviewer_employee_id AND m.company_id=NEW.company_id
    AND m.active=1 AND e.employment_status='active'
    AND (c.location_id IS NULL OR m.location_id=c.location_id)
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_interviewer_not_eligible');
END;
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interviewer_company_update
BEFORE UPDATE OF interviewer_employee_id,company_id,candidate_id ON recruitment_interviews
WHEN NOT EXISTS (
  SELECT 1 FROM employee_company_memberships m
  JOIN employees e ON e.id=m.employee_id
  JOIN recruitment_candidates c ON c.id=NEW.candidate_id AND c.company_id=NEW.company_id
  WHERE m.employee_id=NEW.interviewer_employee_id AND m.company_id=NEW.company_id
    AND m.active=1 AND e.employment_status='active'
    AND (c.location_id IS NULL OR m.location_id=c.location_id)
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_interviewer_not_eligible');
END;

-- A handoff may only reference an approved offer belonging to this candidate.
-- Protect the existing-HR boundary against malformed writes and stale prerequisites.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_handoff_offer_insert
BEFORE INSERT ON recruitment_hr_handoffs
WHEN NOT EXISTS (
  SELECT 1 FROM recruitment_offers o
  JOIN recruitment_candidates c ON c.company_id=o.company_id AND c.id=o.candidate_id
  WHERE o.company_id=NEW.company_id AND o.id=NEW.offer_id
    AND o.candidate_id=NEW.candidate_id AND o.status='approved'
    AND c.stage='offer_prepared'
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_handoff_offer_ineligible');
END;
CREATE TRIGGER IF NOT EXISTS trg_recruitment_handoff_offer_update
BEFORE UPDATE OF company_id,candidate_id,offer_id ON recruitment_hr_handoffs
WHEN NOT EXISTS (
  SELECT 1 FROM recruitment_offers o
  JOIN recruitment_candidates c ON c.company_id=o.company_id AND c.id=o.candidate_id
  WHERE o.company_id=NEW.company_id AND o.id=NEW.offer_id
    AND o.candidate_id=NEW.candidate_id AND o.status='approved'
    AND c.stage='offer_prepared'
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_handoff_offer_ineligible');
END;

-- An interview starts scheduled; a writer must not directly invent a completed record.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_initial_status
BEFORE INSERT ON recruitment_interviews
WHEN NEW.status<>'scheduled'
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_initial_status_invalid');
END;

-- Completion must be a scheduled -> completed transition after the appointed time.
-- This guards direct SQL as well as the conditional Recruitment API update.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_completion_time
BEFORE UPDATE OF status ON recruitment_interviews
WHEN NEW.status='completed'
  AND (OLD.status<>'scheduled' OR julianday(NEW.scheduled_at) IS NULL
       OR julianday(NEW.scheduled_at)>julianday('now'))
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_completion_ineligible');
END;

-- A terminal candidate cannot acquire new "completed interview" evidence.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_terminal_candidate
BEFORE UPDATE OF status ON recruitment_interviews
WHEN NEW.status='completed' AND EXISTS (
  SELECT 1 FROM recruitment_candidates c
  WHERE c.id=NEW.candidate_id AND c.company_id=NEW.company_id
    AND c.stage IN ('withdrawn','closed_rejected')
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_terminal_candidate_interview');
END;

-- Preserve prerequisite truth even when a future integration writes directly.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_decision_gate
BEFORE UPDATE OF stage ON recruitment_candidates
WHEN NEW.stage='decision' AND OLD.stage<>'decision' AND NOT EXISTS (
  SELECT 1 FROM recruitment_interviews i
  WHERE i.company_id=NEW.company_id AND i.candidate_id=NEW.id AND i.status='completed'
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_decision_requires_completed_interview');
END;

CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_offer_gate
BEFORE UPDATE OF stage ON recruitment_candidates
WHEN NEW.stage='offer_prepared' AND OLD.stage<>'offer_prepared' AND NOT EXISTS (
  SELECT 1 FROM recruitment_offers o
  WHERE o.company_id=NEW.company_id AND o.candidate_id=NEW.id AND o.status='approved'
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_offer_stage_requires_approval');
END;

-- Internal offer status reflects an explicit later approval decision, never initial insertion.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_offer_initial_status
BEFORE INSERT ON recruitment_offers
WHEN NEW.status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'recruitment_offer_initial_status_invalid');
END;

-- The existing HR authority must separately acknowledge a pending handoff.
-- This Recruitment writer never seeds or fabricates an acknowledged handoff.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_handoff_initial_status
BEFORE INSERT ON recruitment_hr_handoffs
WHEN NEW.status<>'pending' OR NEW.acknowledged_employee_id IS NOT NULL
     OR NEW.acknowledged_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'recruitment_handoff_initial_status_invalid');
END;

-- Interview feedback is actual documented evidence, not merely a completed status bit.
-- Scheduled/cancelled records cannot carry a fabricated completion recommendation.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_initial_evidence
BEFORE INSERT ON recruitment_interviews
WHEN NEW.feedback IS NOT NULL OR NEW.recommendation IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_initial_evidence_invalid');
END;
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_outcome_evidence
BEFORE UPDATE OF status,feedback,recommendation ON recruitment_interviews
WHEN (NEW.status='completed' AND
      (length(trim(COALESCE(NEW.feedback,'')))=0 OR
       COALESCE(NEW.recommendation,'') NOT IN ('advance','hold','reject')))
  OR (NEW.status<>'completed' AND
      (NEW.feedback IS NOT NULL OR NEW.recommendation IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_outcome_evidence_invalid');
END;

-- A later internal offer decision must have decision metadata.  This records
-- internal approval only: it cannot attest delivery, signatures or acceptance.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_offer_decision_truth
BEFORE UPDATE OF status,approved_by,approved_at ON recruitment_offers
WHEN (NEW.status<>OLD.status AND (OLD.status<>'draft' OR NEW.status NOT IN ('approved','withdrawn')))
  OR (NEW.status='approved' AND
      (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR julianday(NEW.approved_at) IS NULL))
  OR (NEW.status IN ('draft','withdrawn') AND
      (NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT,'recruitment_offer_decision_truth_invalid');
END;

-- Structural shape only: an acknowledged handoff still requires existing HR
-- authority to authenticate, authorize and write the actual acknowledgment.
-- Recruitment's own API must never execute this transition.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_handoff_acknowledgment_truth
BEFORE UPDATE OF status,acknowledged_employee_id,acknowledged_at ON recruitment_hr_handoffs
WHEN (NEW.status<>OLD.status AND
      (OLD.status<>'pending' OR NEW.status NOT IN ('acknowledged','cancelled')))
  OR (NEW.status='acknowledged' AND
      (OLD.status<>'pending' OR NEW.acknowledged_employee_id IS NULL OR
       NEW.acknowledged_at IS NULL OR julianday(NEW.acknowledged_at) IS NULL))
  OR (NEW.status IN ('pending','cancelled') AND
      (NEW.acknowledged_employee_id IS NOT NULL OR NEW.acknowledged_at IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT,'recruitment_handoff_acknowledgment_truth_invalid');
END;

-- Candidate creation and stage history must reflect the internal workflow even
-- if a future integrator submits SQL without using the Recruitment HTTP route.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_initial_stage
BEFORE INSERT ON recruitment_candidates
WHEN NEW.stage<>'applied' OR NEW.revision<>0 OR NEW.last_mutation_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'recruitment_candidate_initial_stage_invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_stage_transition
BEFORE UPDATE OF stage ON recruitment_candidates
WHEN NEW.stage<>OLD.stage AND NOT (
  (OLD.stage='applied' AND NEW.stage IN ('screening','closed_rejected','withdrawn')) OR
  (OLD.stage='screening' AND NEW.stage IN ('interview','closed_rejected','withdrawn')) OR
  (OLD.stage='interview' AND NEW.stage IN ('decision','closed_rejected','withdrawn')) OR
  (OLD.stage='decision' AND NEW.stage IN ('offer_prepared','closed_rejected','withdrawn')) OR
  (OLD.stage='offer_prepared' AND NEW.stage IN ('closed_rejected','withdrawn'))
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_candidate_stage_transition_invalid');
END;

-- Company and candidate identity are immutable; moving a candidate across
-- companies would silently disclose previously protected recruitment records.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_identity_immutable
BEFORE UPDATE OF company_id,candidate_ref ON recruitment_candidates
WHEN NEW.company_id<>OLD.company_id OR NEW.candidate_ref<>OLD.candidate_ref
BEGIN
  SELECT RAISE(ABORT,'recruitment_candidate_identity_immutable');
END;

-- A location change after an interview is recorded would retrospectively
-- relabel site-scoped interview eligibility. Preserve the recorded site.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_candidate_interview_site_immutable
BEFORE UPDATE OF location_id ON recruitment_candidates
WHEN NEW.location_id IS NOT OLD.location_id AND EXISTS (
  SELECT 1 FROM recruitment_interviews i
  WHERE i.company_id=OLD.company_id AND i.candidate_id=OLD.id
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_candidate_interview_site_immutable');
END;

-- Existing HR must decide a pending handoff, never repoint it to a different
-- candidate or offer. A fresh request requires a new owned record/audit.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_handoff_identity_immutable
BEFORE UPDATE OF company_id,candidate_id,offer_id ON recruitment_hr_handoffs
WHEN NEW.company_id<>OLD.company_id OR NEW.candidate_id<>OLD.candidate_id
  OR NEW.offer_id<>OLD.offer_id
BEGIN
  SELECT RAISE(ABORT,'recruitment_handoff_identity_immutable');
END;

-- Recorded interview identity and appointment details are historical evidence.
-- Cancellation or completion changes state, never the original assignment.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_identity_immutable
BEFORE UPDATE OF company_id,candidate_id,interviewer_employee_id,scheduled_at,meeting_mode ON recruitment_interviews
WHEN NEW.company_id<>OLD.company_id OR NEW.candidate_id<>OLD.candidate_id
  OR NEW.interviewer_employee_id<>OLD.interviewer_employee_id
  OR NEW.scheduled_at<>OLD.scheduled_at OR NEW.meeting_mode<>OLD.meeting_mode
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_identity_immutable');
END;

-- Draft terms may be edited; deciding an offer freezes its recorded terms.
-- Candidate/company identity cannot be repointed at any point.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_offer_identity_terms_immutable
BEFORE UPDATE OF company_id,candidate_id,role_title,terms_summary,status ON recruitment_offers
WHEN NEW.company_id<>OLD.company_id OR NEW.candidate_id<>OLD.candidate_id
  OR ((OLD.status IN ('approved','withdrawn') OR NEW.status IN ('approved','withdrawn'))
      AND (NEW.role_title<>OLD.role_title OR NEW.terms_summary<>OLD.terms_summary))
BEGIN
  SELECT RAISE(ABORT,'recruitment_offer_identity_terms_immutable');
END;

-- HR handoff acceptance reference is submitted evidence, not mutable state.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_handoff_evidence_immutable
BEFORE UPDATE OF acceptance_evidence_ref ON recruitment_hr_handoffs
WHEN NEW.acceptance_evidence_ref<>OLD.acceptance_evidence_ref
BEGIN
  SELECT RAISE(ABORT,'recruitment_handoff_evidence_immutable');
END;

-- Direct SQL writers cannot schedule interviews before internal screening
-- or after a candidate has moved beyond the interview stage.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_candidate_stage_insert
BEFORE INSERT ON recruitment_interviews
WHEN NOT EXISTS (
  SELECT 1 FROM recruitment_candidates c WHERE c.id=NEW.candidate_id
    AND c.company_id=NEW.company_id AND c.stage IN ('screening','interview')
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_candidate_stage_ineligible');
END;

-- Internal drafts are created only after a documented hiring decision stage.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_offer_candidate_stage_insert
BEFORE INSERT ON recruitment_offers
WHEN NOT EXISTS (
  SELECT 1 FROM recruitment_candidates c WHERE c.id=NEW.candidate_id
    AND c.company_id=NEW.company_id AND c.stage='decision'
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_offer_candidate_stage_ineligible');
END;

-- Once an interview is completed or cancelled, its recorded outcome is historical
-- evidence. Corrections require a separately governed process, not overwriting it.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_interview_outcome_immutable
BEFORE UPDATE OF status,feedback,recommendation ON recruitment_interviews
WHEN OLD.status IN ('completed','cancelled') AND (
  NEW.status IS NOT OLD.status OR NEW.feedback IS NOT OLD.feedback
  OR NEW.recommendation IS NOT OLD.recommendation
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_interview_outcome_immutable');
END;

-- The approving employee and time are decision evidence. A later SQL writer
-- must not silently replace the original internal approval identity.
CREATE TRIGGER IF NOT EXISTS trg_recruitment_offer_decision_metadata_immutable
BEFORE UPDATE OF approved_by,approved_at,status ON recruitment_offers
WHEN OLD.status IN ('approved','withdrawn') AND (
  NEW.approved_by IS NOT OLD.approved_by OR NEW.approved_at IS NOT OLD.approved_at
)
BEGIN
  SELECT RAISE(ABORT,'recruitment_offer_decision_metadata_immutable');
END;
