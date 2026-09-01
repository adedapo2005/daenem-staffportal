PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1 CHECK(paid IN (0,1)),
  default_days REAL NOT NULL DEFAULT 0,
  requires_attachment INTEGER NOT NULL DEFAULT 0 CHECK(requires_attachment IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_type_id TEXT REFERENCES leave_types(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_requested REAL NOT NULL,
  reason TEXT,
  attachment_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('draft','pending','approved','rejected','cancelled')),
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leave_employee_status ON leave_requests(employee_id,status,start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_company_status ON leave_requests(company_id,status,start_date DESC);

CREATE TABLE IF NOT EXISTS employee_reviews (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  review_period_start TEXT NOT NULL,
  review_period_end TEXT NOT NULL,
  reviewer_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  review_type TEXT NOT NULL DEFAULT 'performance' CHECK(review_type IN ('performance','probation','promotion','corrective','recognition','other')),
  rating REAL,
  strengths TEXT,
  improvement_areas TEXT,
  goals TEXT,
  manager_comments TEXT,
  employee_comments TEXT,
  employee_acknowledged_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','shared','acknowledged','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_employee ON employee_reviews(employee_id,review_period_end DESC);

CREATE TABLE IF NOT EXISTS employee_document_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  purpose TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','in_progress','ready','delivered','rejected','cancelled')),
  assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL,
  output_file_key TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_document_requests_employee ON employee_document_requests(employee_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_requests_company ON employee_document_requests(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS employee_notifications (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','success','warning','urgent','emergency')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  source_type TEXT,
  source_id TEXT,
  requires_ack INTEGER NOT NULL DEFAULT 0 CHECK(requires_ack IN (0,1)),
  read_at TEXT,
  acknowledged_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employee_notifications_unread ON employee_notifications(employee_id,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT,
  thread_type TEXT NOT NULL DEFAULT 'direct' CHECK(thread_type IN ('direct','group','department','role','support')),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_thread_members (
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at TEXT,
  muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)),
  PRIMARY KEY(thread_id, employee_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  attachment_key TEXT,
  reply_to_message_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id,created_at DESC);

CREATE TABLE IF NOT EXISTS employee_daily_obligations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  obligation_date TEXT NOT NULL,
  obligation_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_type TEXT,
  source_id TEXT,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  blocking INTEGER NOT NULL DEFAULT 0 CHECK(blocking IN (0,1)),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','overdue','waived')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id,obligation_date,obligation_type,source_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_obligation_employee ON employee_daily_obligations(employee_id,obligation_date,status);

INSERT OR IGNORE INTO leave_types(id,company_id,code,name,paid,default_days) VALUES
 ('leave-annual',NULL,'annual','Annual Leave',1,20),
 ('leave-sick',NULL,'sick','Sick Leave',1,0),
 ('leave-compassionate',NULL,'compassionate','Compassionate Leave',1,0),
 ('leave-unpaid',NULL,'unpaid','Unpaid Leave',0,0);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-leave-admin','leave.admin','leave','admin','Review and manage employee leave requests',1),
 ('perm-reviews-admin','reviews.admin','reviews','admin','Create and manage employee performance reviews',1),
 ('perm-documents-admin','document_requests.admin','document_requests','admin','Process employee document requests',1),
 ('perm-chat-admin','chat.admin','chat','admin','Moderate and administer internal chat',1),
 ('perm-obligations-admin','obligations.admin','obligations','admin','Manage employee required daily data obligations',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'owner-'||p.id,'role-owner',p.id,'manage' FROM permissions p WHERE p.id IN ('perm-leave-admin','perm-reviews-admin','perm-documents-admin','perm-chat-admin','perm-obligations-admin');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'manager-leave-'||r.id,r.id,'perm-leave-admin','approve' FROM roles r WHERE r.code IN ('manager','fleet_manager','admin') AND r.company_id IS NOT NULL;
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'manager-reviews-'||r.id,r.id,'perm-reviews-admin','edit' FROM roles r WHERE r.code IN ('manager','fleet_manager','admin') AND r.company_id IS NOT NULL;
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'manager-obligations-'||r.id,r.id,'perm-obligations-admin','edit' FROM roles r WHERE r.code IN ('manager','fleet_manager','admin') AND r.company_id IS NOT NULL;
