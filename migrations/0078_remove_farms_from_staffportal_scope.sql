-- DAENEM Staff Portal: Farms is outside this application's scope.
-- Preserve historical rows for audit, but prevent the legacy social brand from surfacing or being selectable.
UPDATE social_brands
SET active = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE lower(code) = 'farms'
   OR lower(name) LIKE '%farm%';
