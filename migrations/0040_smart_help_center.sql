PRAGMA foreign_keys = ON;

-- Keeps each employee's function-learning progress consistent across phone,
-- tablet and desktop. Progress is scoped to the business because the same
-- employee may have different duties and permissions in different businesses.
CREATE TABLE IF NOT EXISTS employee_guide_progress (
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  function_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reviewed' CHECK (status IN ('reviewed','not_reviewed')),
  first_reviewed_at TEXT,
  last_reviewed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(employee_id,company_id,function_key)
);
CREATE INDEX IF NOT EXISTS idx_employee_guide_progress_company
  ON employee_guide_progress(employee_id,company_id,status,updated_at DESC);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('ai.guide_company_scope_required','true','boolean'),
 ('ai.guide_catalog_fallback_enabled','true','boolean'),
 ('ai.guide_max_question_characters','800','number'),
 ('ai.guide_questions_per_minute','8','number'),
 ('ai.guide_history_limit','20','number');
