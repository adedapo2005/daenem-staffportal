import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface InventoryEnv extends AuthEnv {}

type Access = 'view' | 'create' | 'edit' | 'approve' | 'manage';

const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function membership(context: SessionContext, companyId: string) {
  return context.companies.some((company) => company.id === companyId);
}

function allowed(context: SessionContext, companyId: string, minimum: Access = 'view') {
  if (!membership(context, companyId)) return false;
  return hasPermission(context, 'inventory.access', minimum, companyId);
}

function koboFromNaira(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(Math.max(0, number) * 100) : 0;
}

async function catalog(request: Request, env: InventoryEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = String(url.searchParams.get('companyId') || context.companies.find((company) => company.primary)?.id || '');
  if (!companyId || !allowed(context, companyId)) return json({ error: 'Inventory access is not assigned for this company.' }, 403);
  const locationId = url.searchParams.get('locationId') || '';
  const search = `%${(url.searchParams.get('q') || '').trim()}%`;
  const [categories, items, locations] = await Promise.all([
    env.DB.prepare(`SELECT id, name, category_type AS categoryType, parent_id AS parentId FROM inventory_categories WHERE company_id = ? AND active = 1 ORDER BY name`).bind(companyId).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT i.id, i.sku, i.name, i.description, i.brand, i.unit, i.unit_cost_kobo AS unitCostKobo,
             i.selling_price_kobo AS sellingPriceKobo, i.reorder_level AS reorderLevel,
             i.track_lot AS trackLot, i.track_expiry AS trackExpiry,
             c.id AS categoryId, c.name AS categoryName,
             COALESCE(SUM(CASE WHEN (? = '' OR sb.location_id = ?) THEN sb.quantity ELSE 0 END),0) AS quantity,
             COALESCE(SUM(CASE WHEN (? = '' OR sb.location_id = ?) THEN sb.reserved_quantity ELSE 0 END),0) AS reservedQuantity
      FROM inventory_items i
      LEFT JOIN inventory_categories c ON c.id = i.category_id
      LEFT JOIN stock_balances sb ON sb.item_id = i.id
      WHERE i.company_id = ? AND i.active = 1
        AND (? = '%%' OR i.sku LIKE ? OR i.name LIKE ? OR i.brand LIKE ? OR c.name LIKE ?)
      GROUP BY i.id
      ORDER BY c.name, i.name
      LIMIT 500
    `).bind(locationId, locationId, locationId, locationId, companyId, search, search, search, search, search).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id, name, address_line AS addressLine, city, state FROM company_locations WHERE company_id = ? AND active = 1 ORDER BY name`).bind(companyId).all<Record<string, unknown>>(),
  ]);
  return json({ companyId, categories: categories.results || [], items: items.results || [], locations: locations.results || [] });
}

async function createCategory(request: Request, env: InventoryEnv, context: SessionContext) {
  let body: { companyId?: string; name?: string; categoryType?: string; parentId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid category request.' }, 400); }
  const companyId = String(body.companyId || '');
  if (!allowed(context, companyId, 'edit')) return json({ error: 'Edit Inventory permission is required.' }, 403);
  const name = String(body.name || '').trim();
  if (!name) return json({ error: 'Category name is required.' }, 400);
  const type = String(body.categoryType || 'stock');
  if (!['stock','supply','finished_good','spare_part','consumable','asset_related'].includes(type)) return json({ error: 'Invalid inventory category type.' }, 400);
  const id = uid('inventory-category');
  try {
    await env.DB.prepare(`INSERT INTO inventory_categories (id, company_id, name, category_type, parent_id) VALUES (?, ?, ?, ?, ?)`).bind(id, companyId, name, type, body.parentId || null).run();
  } catch { return json({ error: 'A category with this name may already exist.' }, 409); }
  return json({ ok: true, category: { id, name, categoryType: type } }, 201);
}

async function createItem(request: Request, env: InventoryEnv, context: SessionContext) {
  let body: { companyId?: string; categoryId?: string; sku?: string; name?: string; description?: string; brand?: string; unit?: string; unitCostNaira?: number; sellingPriceNaira?: number; reorderLevel?: number; trackLot?: boolean; trackExpiry?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Invalid inventory item request.' }, 400); }
  const companyId = String(body.companyId || '');
  if (!allowed(context, companyId, 'edit')) return json({ error: 'Edit Inventory permission is required.' }, 403);
  const sku = String(body.sku || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!sku || !name) return json({ error: 'SKU and item name are required.' }, 400);
  if (body.categoryId) {
    const category = await env.DB.prepare(`SELECT id FROM inventory_categories WHERE id = ? AND company_id = ? AND active = 1`).bind(body.categoryId, companyId).first();
    if (!category) return json({ error: 'Selected inventory category was not found.' }, 400);
  }
  const id = uid('inventory-item');
  try {
    await env.DB.prepare(`
      INSERT INTO inventory_items (
        id, company_id, category_id, sku, name, description, brand, unit,
        unit_cost_kobo, selling_price_kobo, reorder_level, track_lot, track_expiry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, companyId, body.categoryId || null, sku, name, body.description || null, body.brand || null, body.unit || 'unit', koboFromNaira(body.unitCostNaira), koboFromNaira(body.sellingPriceNaira), Math.max(0, Number(body.reorderLevel || 0)), body.trackLot ? 1 : 0, body.trackExpiry ? 1 : 0).run();
  } catch { return json({ error: 'An inventory item with this SKU may already exist.' }, 409); }
  await env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source) VALUES (?, ?, ?, 'inventory', 'create_item', 'inventory_item', ?, ?, 'web')`).bind(uid('audit'), context.employee.id, companyId, id, JSON.stringify({ sku, name })).run();
  return json({ ok: true, item: { id, sku, name } }, 201);
}

async function receiveStock(request: Request, env: InventoryEnv, context: SessionContext) {
  let body: { companyId?: string; locationId?: string; itemId?: string; quantity?: number; unitCostNaira?: number; supplierId?: string; supplierReference?: string; lotNo?: string; expiryDate?: string; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid goods receipt request.' }, 400); }
  const companyId = String(body.companyId || '');
  if (!allowed(context, companyId, 'create')) return json({ error: 'Create Inventory permission is required.' }, 403);
  const quantity = Number(body.quantity || 0);
  if (!body.locationId || !body.itemId || !Number.isFinite(quantity) || quantity <= 0) return json({ error: 'Location, item and positive received quantity are required.' }, 400);
  const [location, item] = await Promise.all([
    env.DB.prepare(`SELECT id FROM company_locations WHERE id = ? AND company_id = ? AND active = 1`).bind(body.locationId, companyId).first(),
    env.DB.prepare(`SELECT id, unit_cost_kobo AS unitCostKobo FROM inventory_items WHERE id = ? AND company_id = ? AND active = 1`).bind(body.itemId, companyId).first<{ id: string; unitCostKobo: number }>(),
  ]);
  if (!location || !item) return json({ error: 'Selected company location or inventory item was not found.' }, 404);
  const unitCost = body.unitCostNaira == null ? Number(item.unitCostKobo || 0) : koboFromNaira(body.unitCostNaira);
  const movementId = uid('stock-movement');
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO stock_balances (id, company_id, location_id, item_id, quantity)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(location_id, item_id) DO UPDATE SET quantity = stock_balances.quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP
    `).bind(uid('stock-balance'), companyId, body.locationId, body.itemId, quantity),
    env.DB.prepare(`UPDATE inventory_items SET unit_cost_kobo = CASE WHEN ? > 0 THEN ? ELSE unit_cost_kobo END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(unitCost, unitCost, body.itemId),
    env.DB.prepare(`
      INSERT INTO stock_movements (
        id, company_id, item_id, movement_type, quantity, unit_cost_kobo, to_location_id,
        reference_type, reference_id, reason, lot_no, expiry_date, created_by, metadata_json
      ) VALUES (?, ?, ?, 'receipt', ?, ?, ?, 'goods_receipt', ?, ?, ?, ?, ?, ?)
    `).bind(movementId, companyId, body.itemId, quantity, unitCost, body.locationId, body.supplierReference || movementId, body.note || 'Goods received', body.lotNo || null, body.expiryDate || null, context.employee.id, JSON.stringify({ supplierId: body.supplierId || null })),
    env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source) VALUES (?, ?, ?, 'inventory', 'receive_stock', 'stock_movement', ?, ?, 'web')`).bind(uid('audit'), context.employee.id, companyId, movementId, JSON.stringify({ itemId: body.itemId, locationId: body.locationId, quantity, unitCost })),
  ]);
  return json({ ok: true, movementId, message: 'Goods received and stock balance updated.' });
}

async function transferStock(request: Request, env: InventoryEnv, context: SessionContext) {
  let body: { companyId?: string; itemId?: string; fromLocationId?: string; toLocationId?: string; quantity?: number; reason?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid stock transfer request.' }, 400); }
  const companyId = String(body.companyId || '');
  if (!allowed(context, companyId, 'edit')) return json({ error: 'Edit Inventory permission is required for stock transfers.' }, 403);
  const quantity = Number(body.quantity || 0);
  if (!body.itemId || !body.fromLocationId || !body.toLocationId || body.fromLocationId === body.toLocationId || !Number.isFinite(quantity) || quantity <= 0) return json({ error: 'Item, different source/destination locations and a positive quantity are required.' }, 400);
  const balance = await env.DB.prepare(`SELECT id, quantity, reserved_quantity AS reservedQuantity FROM stock_balances WHERE company_id = ? AND location_id = ? AND item_id = ?`).bind(companyId, body.fromLocationId, body.itemId).first<{ id: string; quantity: number; reservedQuantity: number }>();
  const available = Number(balance?.quantity || 0) - Number(balance?.reservedQuantity || 0);
  if (!balance || available < quantity) return json({ error: `Insufficient available stock. Available: ${Math.max(0, available)}.` }, 409);
  const destination = await env.DB.prepare(`SELECT id FROM company_locations WHERE id = ? AND company_id = ? AND active = 1`).bind(body.toLocationId, companyId).first();
  if (!destination) return json({ error: 'Destination location was not found.' }, 404);
  const transferRef = uid('transfer');
  await env.DB.batch([
    env.DB.prepare(`UPDATE stock_balances SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(quantity, balance.id),
    env.DB.prepare(`INSERT INTO stock_balances (id, company_id, location_id, item_id, quantity) VALUES (?, ?, ?, ?, ?) ON CONFLICT(location_id,item_id) DO UPDATE SET quantity = stock_balances.quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP`).bind(uid('stock-balance'), companyId, body.toLocationId, body.itemId, quantity),
    env.DB.prepare(`INSERT INTO stock_movements (id, company_id, item_id, movement_type, quantity, from_location_id, to_location_id, reference_type, reference_id, reason, created_by) VALUES (?, ?, ?, 'transfer_out', ?, ?, ?, 'stock_transfer', ?, ?, ?)`).bind(uid('stock-movement'), companyId, body.itemId, quantity, body.fromLocationId, body.toLocationId, transferRef, body.reason || 'Internal stock transfer', context.employee.id),
    env.DB.prepare(`INSERT INTO stock_movements (id, company_id, item_id, movement_type, quantity, from_location_id, to_location_id, reference_type, reference_id, reason, created_by) VALUES (?, ?, ?, 'transfer_in', ?, ?, ?, 'stock_transfer', ?, ?, ?)`).bind(uid('stock-movement'), companyId, body.itemId, quantity, body.fromLocationId, body.toLocationId, transferRef, body.reason || 'Internal stock transfer', context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source) VALUES (?, ?, ?, 'inventory', 'stock_transfer', 'stock_transfer', ?, ?, 'web')`).bind(uid('audit'), context.employee.id, companyId, transferRef, JSON.stringify({ itemId: body.itemId, quantity, from: body.fromLocationId, to: body.toLocationId })),
  ]);
  return json({ ok: true, transferRef, message: 'Stock transferred successfully.' });
}

async function movementLog(request: Request, env: InventoryEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = String(url.searchParams.get('companyId') || '');
  if (!allowed(context, companyId)) return json({ error: 'Inventory access is not assigned for this company.' }, 403);
  const result = await env.DB.prepare(`
    SELECT sm.id, sm.movement_type AS movementType, sm.quantity, sm.unit_cost_kobo AS unitCostKobo,
           sm.reference_type AS referenceType, sm.reference_id AS referenceId, sm.reason,
           sm.lot_no AS lotNo, sm.expiry_date AS expiryDate, sm.occurred_at AS occurredAt,
           i.sku, i.name AS itemName, i.unit,
           fromLoc.name AS fromLocation, toLoc.name AS toLocation, e.display_name AS createdBy
    FROM stock_movements sm
    JOIN inventory_items i ON i.id = sm.item_id
    LEFT JOIN company_locations fromLoc ON fromLoc.id = sm.from_location_id
    LEFT JOIN company_locations toLoc ON toLoc.id = sm.to_location_id
    LEFT JOIN employees e ON e.id = sm.created_by
    WHERE sm.company_id = ? ORDER BY sm.occurred_at DESC LIMIT 300
  `).bind(companyId).all<Record<string, unknown>>();
  return json({ movements: result.results || [] });
}

async function listRequests(request: Request, env: InventoryEnv, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = String(url.searchParams.get('companyId') || '');
  if (!allowed(context, companyId)) return json({ error: 'Inventory access is not assigned for this company.' }, 403);
  const result = await env.DB.prepare(`
    SELECT r.id, r.request_no AS requestNo, r.request_type AS requestType, r.department, r.purpose,
           r.status, r.created_at AS createdAt, e.display_name AS requestedBy,
           COUNT(ri.id) AS lineCount, COALESCE(SUM(ri.quantity_requested),0) AS quantityRequested
    FROM inventory_requests r
    JOIN employees e ON e.id = r.requested_by
    LEFT JOIN inventory_request_items ri ON ri.request_id = r.id
    WHERE r.company_id = ? GROUP BY r.id ORDER BY r.created_at DESC LIMIT 200
  `).bind(companyId).all<Record<string, unknown>>();
  return json({ requests: result.results || [] });
}

async function createRequest(request: Request, env: InventoryEnv, context: SessionContext) {
  let body: { companyId?: string; locationId?: string; requestType?: string; department?: string; purpose?: string; items?: Array<{ itemId: string; quantity: number; note?: string }> };
  try { body = await request.json(); } catch { return json({ error: 'Invalid inventory request.' }, 400); }
  const companyId = String(body.companyId || '');
  if (!allowed(context, companyId, 'create')) return json({ error: 'Create Inventory permission is required.' }, 403);
  const items = (body.items || []).filter((item) => item.itemId && Number(item.quantity) > 0);
  if (!items.length) return json({ error: 'At least one requested item and quantity are required.' }, 400);
  const today = new Date().toISOString().slice(0,10).replaceAll('-','');
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM inventory_requests WHERE company_id = ? AND substr(created_at,1,10) = date('now')`).bind(companyId).first<{ count: number }>();
  const requestNo = `REQ-${today}-${String(Number(count?.count || 0) + 1).padStart(4,'0')}`;
  const id = uid('inventory-request');
  const statements: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO inventory_requests (id, company_id, location_id, request_no, request_type, requested_by, department, purpose, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`).bind(id, companyId, body.locationId || null, requestNo, body.requestType || 'internal', context.employee.id, body.department || context.employee.department || null, body.purpose || null)];
  for (const item of items) statements.push(env.DB.prepare(`INSERT INTO inventory_request_items (id, request_id, item_id, quantity_requested, note) VALUES (?, ?, ?, ?, ?)`).bind(uid('request-item'), id, item.itemId, Number(item.quantity), item.note || null));
  statements.push(env.DB.prepare(`INSERT INTO audit_logs (id, actor_employee_id, company_id, module, action, entity_type, entity_id, after_json, source) VALUES (?, ?, ?, 'inventory', 'submit_request', 'inventory_request', ?, ?, 'web')`).bind(uid('audit'), context.employee.id, companyId, id, JSON.stringify({ requestNo, itemCount: items.length })));
  await env.DB.batch(statements);
  return json({ ok: true, request: { id, requestNo, status: 'submitted' } }, 201);
}

export async function routeInventory(request: Request, env: InventoryEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/inventory/catalog' && request.method === 'GET') return catalog(request, env, context);
  if (url.pathname === '/api/inventory/categories' && request.method === 'POST') return createCategory(request, env, context);
  if (url.pathname === '/api/inventory/items' && request.method === 'POST') return createItem(request, env, context);
  if (url.pathname === '/api/inventory/receive' && request.method === 'POST') return receiveStock(request, env, context);
  if (url.pathname === '/api/inventory/transfer' && request.method === 'POST') return transferStock(request, env, context);
  if (url.pathname === '/api/inventory/movements' && request.method === 'GET') return movementLog(request, env, context);
  if (url.pathname === '/api/inventory/requests' && request.method === 'GET') return listRequests(request, env, context);
  if (url.pathname === '/api/inventory/requests' && request.method === 'POST') return createRequest(request, env, context);
  return null;
}
