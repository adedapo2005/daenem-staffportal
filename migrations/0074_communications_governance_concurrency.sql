PRAGMA foreign_keys = ON;

UPDATE communication_instruction_profiles
SET active=0
WHERE active=1
  AND EXISTS(
    SELECT 1
    FROM communication_instruction_profiles newer
    WHERE newer.company_id=communication_instruction_profiles.company_id
      AND newer.module=communication_instruction_profiles.module
      AND newer.language=communication_instruction_profiles.language
      AND newer.active=1
      AND (
        newer.version>communication_instruction_profiles.version
        OR (
          newer.version=communication_instruction_profiles.version
          AND newer.id>communication_instruction_profiles.id
        )
      )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_instruction_profiles_one_active_language
  ON communication_instruction_profiles(company_id,module,language)
  WHERE active=1;
