CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'formal audit evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'formal audit evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS access_control_changes_no_update
BEFORE UPDATE ON access_control_changes BEGIN
  SELECT RAISE(ABORT, 'access control audit evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS access_control_changes_no_delete
BEFORE DELETE ON access_control_changes BEGIN
  SELECT RAISE(ABORT, 'access control audit evidence is immutable');
END;
