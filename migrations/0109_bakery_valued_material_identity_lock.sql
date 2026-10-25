PRAGMA foreign_keys=ON;

-- Bakery material units and classifications carry real financial meaning.
-- Once an independently documented opening is proposed or an exact valuation
-- exists, changing the base unit, owner company or treating the item as a
-- finished product can misstate financial inventory without changing numbers.
-- Freeze these identity fields at the database boundary. Introduce a new
-- product/material SKU for a genuine unit or classification change.
-- These triggers never alter stock, payments, balances or prior history.

CREATE TRIGGER IF NOT EXISTS bakery_valued_material_identity_lock
BEFORE UPDATE OF unit,company_id ON inventory_items
WHEN OLD.company_id='company-bakery'
 AND (NEW.company_id<>OLD.company_id OR lower(trim(NEW.unit))<>lower(trim(OLD.unit)))
 AND (
   EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
     WHERE v.company_id=OLD.company_id AND v.inventory_item_id=OLD.id)
   OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
     WHERE o.company_id=OLD.company_id AND o.inventory_item_id=OLD.id
       AND o.status IN ('proposed','approved'))
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery valued material identity is locked');
END;

CREATE TRIGGER IF NOT EXISTS bakery_valued_material_category_lock
BEFORE UPDATE OF category_id ON inventory_items
WHEN OLD.company_id='company-bakery' AND NEW.category_id IS NOT OLD.category_id
 AND EXISTS(SELECT 1 FROM inventory_categories c
   WHERE c.id=NEW.category_id AND c.company_id=OLD.company_id AND c.category_type='finished_good')
 AND (
   EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
     WHERE v.company_id=OLD.company_id AND v.inventory_item_id=OLD.id)
   OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
     WHERE o.company_id=OLD.company_id AND o.inventory_item_id=OLD.id
       AND o.status IN ('proposed','approved'))
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery valued material cannot become finished goods');
END;

CREATE TRIGGER IF NOT EXISTS bakery_valued_category_type_lock
BEFORE UPDATE OF category_type ON inventory_categories
WHEN OLD.company_id='company-bakery'
 AND OLD.category_type<>'finished_good' AND NEW.category_type='finished_good'
 AND EXISTS(SELECT 1 FROM inventory_items i
   WHERE i.company_id=OLD.company_id AND i.category_id=OLD.id
   AND (
     EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
       WHERE v.company_id=i.company_id AND v.inventory_item_id=i.id)
     OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
       WHERE o.company_id=i.company_id AND o.inventory_item_id=i.id
         AND o.status IN ('proposed','approved'))
   ))
BEGIN
 SELECT RAISE(ABORT,'Bakery valued material category cannot become finished goods');
END;

-- Cross-company categories would make an already valued Bakery ingredient
-- appear uncategorized in company-scoped reads. Refuse those re-links.
CREATE TRIGGER IF NOT EXISTS bakery_valued_material_foreign_category_lock
BEFORE UPDATE OF category_id ON inventory_items
WHEN OLD.company_id='company-bakery'
 AND NEW.category_id IS NOT NULL
 AND NEW.category_id IS NOT OLD.category_id
 AND NOT EXISTS(SELECT 1 FROM inventory_categories c
   WHERE c.id=NEW.category_id AND c.company_id=OLD.company_id)
 AND (
   EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
     WHERE v.company_id=OLD.company_id AND v.inventory_item_id=OLD.id)
   OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
     WHERE o.company_id=OLD.company_id AND o.inventory_item_id=OLD.id
       AND o.status IN ('proposed','approved'))
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery valued material category must remain company scoped');
END;

-- Editing a category's company can bypass checks on the inventory item alone.
CREATE TRIGGER IF NOT EXISTS bakery_valued_category_company_lock
BEFORE UPDATE OF company_id ON inventory_categories
WHEN OLD.company_id='company-bakery' AND NEW.company_id<>OLD.company_id
 AND EXISTS(SELECT 1 FROM inventory_items i WHERE i.company_id=OLD.company_id
   AND i.category_id=OLD.id AND (
     EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
       WHERE v.company_id=i.company_id AND v.inventory_item_id=i.id)
     OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
       WHERE o.company_id=i.company_id AND o.inventory_item_id=i.id
         AND o.status IN ('proposed','approved'))
   ))
BEGIN
 SELECT RAISE(ABORT,'Bakery valued material category company is locked');
END;

CREATE TRIGGER IF NOT EXISTS bakery_valued_material_product_insert_lock
BEFORE INSERT ON bakery_products
WHEN NEW.company_id='company-bakery' AND NEW.inventory_item_id IS NOT NULL
 AND (
   EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
     WHERE v.company_id=NEW.company_id AND v.inventory_item_id=NEW.inventory_item_id)
   OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
     WHERE o.company_id=NEW.company_id AND o.inventory_item_id=NEW.inventory_item_id
       AND o.status IN ('proposed','approved'))
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery valued raw material cannot be assigned as a finished product');
END;

CREATE TRIGGER IF NOT EXISTS bakery_valued_material_product_update_lock
BEFORE UPDATE OF inventory_item_id,company_id ON bakery_products
WHEN NEW.company_id='company-bakery' AND NEW.inventory_item_id IS NOT NULL
 AND (NEW.inventory_item_id IS NOT OLD.inventory_item_id OR NEW.company_id IS NOT OLD.company_id)
 AND (
   EXISTS(SELECT 1 FROM bakery_material_valuation_balances v
     WHERE v.company_id=NEW.company_id AND v.inventory_item_id=NEW.inventory_item_id)
   OR EXISTS(SELECT 1 FROM bakery_material_opening_valuations o
     WHERE o.company_id=NEW.company_id AND o.inventory_item_id=NEW.inventory_item_id
       AND o.status IN ('proposed','approved'))
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery valued raw material cannot be reassigned as a finished product');
END;
