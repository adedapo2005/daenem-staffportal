PRAGMA foreign_keys=ON;

-- Bakery precision ledger: an optional, exact-value overlay on the EXISTING inventory stock balance.
-- Never auto-backfill legacy stock with assumed prices. An item/location can enter this
-- ledger only after a verified zero-stock cutover (or an independently audited opening valuation).
-- One inventory unit = 1,000,000 micro-units, one kobo = 1,000,000 microkobo.
-- Cost and quantity are safe-range SQLite INTEGER; no floating-point money balances.
CREATE TABLE IF NOT EXISTS bakery_material_valuation_balances (
 id TEXT PRIMARY KEY NOT NULL,
 company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
 location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
 inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 remaining_quantity_micro INTEGER NOT NULL CHECK(remaining_quantity_micro>=0),
 remaining_value_microkobo INTEGER NOT NULL CHECK(remaining_value_microkobo>=0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,location_id,inventory_item_id)
);
CREATE INDEX IF NOT EXISTS idx_bakery_material_valuation_item
 ON bakery_material_valuation_balances(company_id,inventory_item_id,location_id);

CREATE TABLE IF NOT EXISTS bakery_material_valuation_events (
 id TEXT PRIMARY KEY NOT NULL,
 company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
 location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
 inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 stock_movement_id TEXT NOT NULL UNIQUE REFERENCES stock_movements(id) ON DELETE RESTRICT,
 movement_type TEXT NOT NULL CHECK(movement_type IN ('receipt','issue','transfer_in','transfer_out')),
 quantity_micro INTEGER NOT NULL CHECK(quantity_micro>0),
 value_microkobo INTEGER NOT NULL CHECK(value_microkobo>=0),
 before_quantity_micro INTEGER NOT NULL CHECK(before_quantity_micro>=0),
 before_value_microkobo INTEGER NOT NULL CHECK(before_value_microkobo>=0),
 after_quantity_micro INTEGER NOT NULL CHECK(after_quantity_micro>=0),
 after_value_microkobo INTEGER NOT NULL CHECK(after_value_microkobo>=0),
 conversion_rule_id TEXT REFERENCES bakery_material_unit_rules(id) ON DELETE RESTRICT,
 reference_id TEXT,
 recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (
  (movement_type IN ('receipt','transfer_in')
   AND after_quantity_micro=before_quantity_micro+quantity_micro
   AND after_value_microkobo=before_value_microkobo+value_microkobo)
  OR
  (movement_type IN ('issue','transfer_out')
   AND before_quantity_micro=after_quantity_micro+quantity_micro
   AND before_value_microkobo=after_value_microkobo+value_microkobo)
 )
);
CREATE INDEX IF NOT EXISTS idx_bakery_material_valuation_movements
 ON bakery_material_valuation_events(company_id,inventory_item_id,occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS bakery_material_value_event_immutable
BEFORE UPDATE ON bakery_material_valuation_events
BEGIN SELECT RAISE(ABORT,'Material valuation events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS bakery_material_value_event_no_delete
BEFORE DELETE ON bakery_material_valuation_events
BEGIN SELECT RAISE(ABORT,'Material valuation event history cannot be deleted'); END;

-- Keep the precise value for production consumption and batch-level reconciliation.
-- Existing kobo fields remain for backwards-compatible displays.
ALTER TABLE bakery_batch_ingredients ADD COLUMN precise_cost_microkobo INTEGER
 CHECK(precise_cost_microkobo IS NULL OR precise_cost_microkobo>=0);
ALTER TABLE bakery_batches ADD COLUMN ingredient_cost_microkobo INTEGER
 CHECK(ingredient_cost_microkobo IS NULL OR ingredient_cost_microkobo>=0);
