PRAGMA foreign_keys = ON;

-- Persist explicit, reviewable mappings between approved Staff Portal use cases
-- and Meta template components. This migration does not enable templates or sends.
CREATE TABLE IF NOT EXISTS communication_template_mappings (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES communication_templates(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  use_case_id TEXT NOT NULL,
  provider_template_name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'marketing','transactional','reminder','customer_support','account_verification','hr_employee','emergency_operational'
  )),
  owning_module TEXT NOT NULL,
  provider_template_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','suspended','archived')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,use_case_id,language,revision),
  UNIQUE(template_id,revision)
);

CREATE TABLE IF NOT EXISTS communication_template_variable_mappings (
  id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL REFERENCES communication_template_mappings(id) ON DELETE CASCADE,
  component TEXT NOT NULL CHECK (component IN ('header','body','footer','button')),
  component_name TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL CHECK (position > 0),
  variable_name TEXT NOT NULL DEFAULT '',
  source_field TEXT NOT NULL,
  source_module TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('text','number','date','currency','url')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  formatter TEXT NOT NULL DEFAULT 'none',
  max_length INTEGER NOT NULL CHECK (max_length BETWEEN 1 AND 4096),
  fallback_policy TEXT NOT NULL DEFAULT 'none' CHECK (fallback_policy IN ('none','approved_value')),
  fallback_value TEXT,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('public','internal','personal','sensitive','prohibited')),
  example_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mapping_id,component,component_name,position),
  CHECK ((fallback_policy = 'approved_value' AND fallback_value IS NOT NULL)
      OR (fallback_policy = 'none' AND fallback_value IS NULL)),
  CHECK (sensitivity != 'prohibited')
);

CREATE INDEX IF NOT EXISTS idx_communication_template_mappings_scope
  ON communication_template_mappings(company_id,use_case_id,language,status,enabled);
CREATE INDEX IF NOT EXISTS idx_communication_template_variables_mapping
  ON communication_template_variable_mappings(mapping_id,component,position);
