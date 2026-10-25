import {hasPermission,type AuthEnv,type SessionContext} from './auth';
import {materialQuantityMicro,materialCostMicroKobo,readMaterialValueBalance} from './bakery-material-valuation';

type OpeningEnv=AuthEnv;
const COMPANY='company-bakery';
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const id=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const has=(context:SessionContext,action:'view'|'edit'|'approve')=>
 context.companies.some(x=>x.id===COMPANY)
 &&hasPermission(context,'bakery.access','view',COMPANY)
 &&hasPermission(context,'inventory.access',action,COMPANY);
function wholeKobo(value:unknown):number|null{
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return null;
 const scaled=value*100,rounded=Math.round(scaled);
 return Number.isSafeInteger(rounded)&&Math.abs(scaled-rounded)<1e-6?rounded:null;
}
async function list(context:SessionContext,env:OpeningEnv){
 if(!has(context,'view'))return json({error:'Bakery Inventory access is required.'},403);
 const rows=await env.DB.prepare(`SELECT o.id,o.location_id AS locationId,o.inventory_item_id AS inventoryItemId,
   i.name AS itemName,l.name AS locationName,o.base_unit AS baseUnit,o.counted_quantity_micro AS quantityMicro,
   o.opening_value_microkobo AS valueMicroKobo,o.status,o.reason,o.evidence_reference AS evidenceReference,
   o.proposed_by AS proposedBy,o.reviewed_by AS reviewedBy,o.review_note AS reviewNote,
   o.created_at AS createdAt,o.reviewed_at AS reviewedAt
  FROM bakery_material_opening_valuations o
  JOIN inventory_items i ON i.id=o.inventory_item_id AND i.company_id=o.company_id
  JOIN company_locations l ON l.id=o.location_id AND l.company_id=o.company_id
  WHERE o.company_id=? ORDER BY o.created_at DESC LIMIT 150`).bind(COMPANY).all<Record<string,unknown>>();
 return json({openings:rows.results||[],canPropose:has(context,'edit'),
  canReview:has(context,'approve'),unitScale:1000000,valueScaleMicroKobo:1000000,
  explanation:'Opening valuation establishes the documented value of stock already counted. It never adds physical stock.'});
}
async function propose(request:Request,env:OpeningEnv,context:SessionContext){
 if(!has(context,'edit'))return json({error:'Edit Bakery Inventory permission is required.'},403);
 let body:Record<string,unknown>;try{body=await request.json()}catch{return json({error:'Invalid opening valuation request.'},400)}
 const locationId=String(body.locationId||'').trim(),itemId=String(body.inventoryItemId||'').trim(),
  qty=body.countedQuantity,totalKobo=wholeKobo(body.totalValueNaira),
  reason=String(body.reason||'').trim(),evidence=String(body.evidenceReference||'').trim();
 const qtyMicro=typeof qty==='number'?materialQuantityMicro(qty):null;
 const valueMicro=totalKobo===null?null:materialCostMicroKobo(totalKobo);
 if(!locationId||!itemId||qtyMicro===null||valueMicro===null||reason.length<8||reason.length>500
  ||evidence.length<8||evidence.length>250)
  return json({error:'Provide an existing Bakery raw-material location, counted base-unit quantity, positive total naira valuation, reason and independent evidence reference.'},400);
 const item=await env.DB.prepare(`SELECT i.id,i.unit,i.active,l.id AS locationId,
   EXISTS(SELECT 1 FROM bakery_products p WHERE p.inventory_item_id=i.id AND p.company_id=i.company_id) AS finishedProduct,
   EXISTS(SELECT 1 FROM inventory_categories c WHERE c.id=i.category_id
     AND c.company_id=i.company_id AND c.category_type='finished_good') AS finishedCategory
  FROM inventory_items i JOIN company_locations l ON l.id=? AND l.company_id=i.company_id AND l.active=1
  WHERE i.id=? AND i.company_id=? AND i.active=1`)
  .bind(locationId,itemId,COMPANY).first<{id:string;unit:string;locationId:string;finishedProduct:number;finishedCategory:number}>();
 if(!item||Number(item.finishedProduct)>0||Number(item.finishedCategory)>0)return json({error:'Only active Bakery raw materials at valid Bakery locations can receive opening valuations.'},404);
 const stock=await env.DB.prepare(`SELECT sb.quantity,sb.reserved_quantity AS reservedQuantity,
    (SELECT COALESCE(MAX(sm.rowid),0) FROM stock_movements sm
      WHERE sm.company_id=sb.company_id AND sm.item_id=sb.item_id
       AND (sm.from_location_id=sb.location_id OR sm.to_location_id=sb.location_id)) AS stockMovementMarker
   FROM stock_balances sb WHERE sb.company_id=? AND sb.location_id=? AND sb.item_id=?`)
  .bind(COMPANY,locationId,itemId).first<{quantity:number;reservedQuantity:number;stockMovementMarker:number}>();
 const stockMicro=stock?materialQuantityMicro(Number(stock.quantity)):null;
 if(stockMicro!==qtyMicro||Number(stock?.reservedQuantity||0)!==0)
  return json({error:'Physical count must match the current unreserved Inventory stock exactly. Complete stock-count reconciliation before requesting valuation.'},409);
 if(await readMaterialValueBalance(env.DB,COMPANY,locationId,itemId))
  return json({error:'This location/material already has a financial valuation balance; duplicate opening is not permitted.'},409);
 const stockMarker=Number(stock?.stockMovementMarker||0);
 if(!Number.isSafeInteger(stockMarker)||stockMarker<0)return json({error:'Stock movement history exceeds safe audit precision.'},409);
 const openingId=id('bakery-opening');
 try{
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO bakery_material_opening_valuations(id,company_id,location_id,inventory_item_id,
    base_unit,counted_quantity_micro,opening_value_microkobo,stock_movement_marker,reason,evidence_reference,proposed_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(openingId,COMPANY,locationId,itemId,item.unit,qtyMicro,valueMicro,stockMarker,reason,evidence,context.employee.id),
   env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
    VALUES(?,?,?,'inventory','propose_material_opening','bakery_material_opening',?,?,'web')`)
    .bind(id('audit'),context.employee.id,COMPANY,openingId,JSON.stringify({locationId,itemId,baseUnit:item.unit,
      quantityMicro:qtyMicro,valueMicroKobo:valueMicro,stockMovementMarker:stockMarker,evidenceReference:evidence,reason}))
  ]);
 }catch{return json({error:'An opening valuation is already pending or approved, or stock changed. Refresh before retrying.'},409)}
 return json({ok:true,id:openingId,status:'proposed',requiresIndependentApproval:true},201);
}
async function review(request:Request,env:OpeningEnv,context:SessionContext){
 if(!has(context,'approve'))return json({error:'Approve Bakery Inventory permission is required.'},403);
 let body:Record<string,unknown>;try{body=await request.json()}catch{return json({error:'Invalid opening valuation review.'},400)}
 const openingId=String(body.openingId||'').trim(),decision=String(body.decision||''),
  note=String(body.reviewNote||'').trim();
 if(!openingId||!['approved','rejected'].includes(decision)||note.length<8||note.length>500)
  return json({error:'Select an opening, approve or reject, and document the independent count/value verification.'},400);
 const opening=await env.DB.prepare(`SELECT o.id,o.status,o.location_id AS locationId,
   o.inventory_item_id AS itemId,o.base_unit AS baseUnit,o.counted_quantity_micro AS quantityMicro,
   o.opening_value_microkobo AS valueMicroKobo,o.stock_movement_marker AS stockMovementMarker,o.proposed_by AS proposedBy
   FROM bakery_material_opening_valuations o WHERE o.id=? AND o.company_id=?`)
  .bind(openingId,COMPANY)
  .first<{id:string;status:string;locationId:string;itemId:string;baseUnit:string;quantityMicro:number;valueMicroKobo:number;stockMovementMarker:number;proposedBy:string}>();
 if(!opening||opening.status!=='proposed')return json({error:'This opening is no longer awaiting independent review.'},409);
 if(opening.proposedBy===context.employee.id)return json({error:'The person recording the physical opening cannot approve or reject their own valuation.'},403);
 const audit=env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,
  entity_type,entity_id,after_json,source)
  VALUES(?,?,?,'inventory',?,'bakery_material_opening',?,?,'web')`)
  .bind(id('audit'),context.employee.id,COMPANY,
    decision==='approved'?'approve_material_opening':'reject_material_opening',
    opening.id,JSON.stringify({decision,reviewNote:note,quantityMicro:opening.quantityMicro,
      valueMicroKobo:opening.valueMicroKobo}));
 try{
  if(decision==='rejected'){
   await env.DB.batch([
    env.DB.prepare(`UPDATE bakery_material_opening_valuations SET status='rejected',
      reviewed_by=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP
      WHERE id=? AND company_id=? AND status='proposed' AND proposed_by<>?`)
      .bind(context.employee.id,note,openingId,COMPANY,context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,
      entity_type,entity_id,after_json,source)
      VALUES(?,?,?,'inventory',CASE WHEN changes()=1 THEN ? ELSE NULL END,
        'bakery_material_opening',?,?,'web')`)
      .bind(id('audit'),context.employee.id,COMPANY,'reject_material_opening',opening.id,
        JSON.stringify({decision,reviewNote:note}))
   ]);
  }else{
   await env.DB.batch([
    // Recheck stock at the precise moment of approval; a stale count must not be accepted.
    env.DB.prepare(`UPDATE bakery_material_opening_valuations SET status='approved',
     reviewed_by=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP
     WHERE id=? AND company_id=? AND status='proposed' AND proposed_by<>?
       AND NOT EXISTS(SELECT 1 FROM bakery_material_valuation_balances vb
        WHERE vb.company_id=? AND vb.location_id=? AND vb.inventory_item_id=?)
       AND EXISTS(SELECT 1 FROM stock_balances sb
        JOIN inventory_items i ON i.id=sb.item_id AND i.company_id=sb.company_id AND i.active=1
        JOIN company_locations l ON l.id=sb.location_id AND l.company_id=sb.company_id AND l.active=1
        WHERE sb.company_id=? AND sb.location_id=? AND sb.item_id=?
          AND lower(trim(i.unit))=lower(trim(?)) AND sb.reserved_quantity=0
          AND NOT EXISTS(SELECT 1 FROM bakery_products p WHERE p.inventory_item_id=i.id AND p.company_id=i.company_id)
          AND NOT EXISTS(SELECT 1 FROM inventory_categories c WHERE c.id=i.category_id
            AND c.company_id=i.company_id AND c.category_type='finished_good')
          AND CAST(ROUND(sb.quantity*1000000,0) AS INTEGER)=?)
       AND (SELECT COALESCE(MAX(sm.rowid),0) FROM stock_movements sm
        WHERE sm.company_id=? AND sm.item_id=?
         AND (sm.from_location_id=? OR sm.to_location_id=?))=?`)
      .bind(context.employee.id,note,openingId,COMPANY,context.employee.id,
        COMPANY,opening.locationId,opening.itemId,
        COMPANY,opening.locationId,opening.itemId,opening.baseUnit,opening.quantityMicro,
        COMPANY,opening.itemId,opening.locationId,opening.locationId,opening.stockMovementMarker),
    env.DB.prepare(`INSERT INTO bakery_material_valuation_balances
      (id,company_id,location_id,inventory_item_id,remaining_quantity_micro,remaining_value_microkobo)
      VALUES(?,?,?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?)`)
      .bind(id('material-opening-balance'),COMPANY,opening.locationId,opening.itemId,
        opening.quantityMicro,opening.valueMicroKobo),
    audit
   ]);
  }
 }catch{return json({error:'Opening review could not commit. Stock may have changed, another reviewer acted, or this material is already valued.'},409)}
 return json({ok:true,id:openingId,status:decision,stockAdded:0,
  valuationEstablished:decision==='approved'});
}

type ReconciliationRow={
 locationId:string;itemId:string;itemName:string;baseUnit:string;locationName:string;
 itemActive:number;locationActive:number;physicalQuantity:number|null;reservedQuantity:number|null;
 valuedQuantityMicro:number|null;valuedMicroKobo:number|null
};
// A page is one read-only snapshot, not a claim of company-wide acceptance.
async function reconciliation(request:Request,env:OpeningEnv,context:SessionContext){
 if(!has(context,'view'))return json({error:'Bakery Inventory access is required.'},403);
 const url=new URL(request.url);
 const afterLocationId=(url.searchParams.get('afterLocationId')||'').trim();
 const afterItemId=(url.searchParams.get('afterItemId')||'').trim();
 if(Boolean(afterLocationId)!==Boolean(afterItemId)||afterLocationId.length>128||afterItemId.length>128)
  return json({error:'Use a valid pair of location and item page cursors.'},400);
 const records=await env.DB.prepare(`WITH material_keys AS (
    SELECT location_id,item_id FROM stock_balances WHERE company_id=?
    UNION
    SELECT location_id,inventory_item_id AS item_id FROM bakery_material_valuation_balances WHERE company_id=?
   )
   SELECT k.location_id AS locationId,k.item_id AS itemId,
     i.name AS itemName,i.unit AS baseUnit,i.active AS itemActive,
     l.name AS locationName,l.active AS locationActive,
     sb.quantity AS physicalQuantity,sb.reserved_quantity AS reservedQuantity,
     v.remaining_quantity_micro AS valuedQuantityMicro,v.remaining_value_microkobo AS valuedMicroKobo
   FROM material_keys k
   JOIN inventory_items i ON i.id=k.item_id AND i.company_id=?
   JOIN company_locations l ON l.id=k.location_id AND l.company_id=i.company_id
   LEFT JOIN stock_balances sb ON sb.company_id=i.company_id AND sb.location_id=k.location_id AND sb.item_id=k.item_id
   LEFT JOIN bakery_material_valuation_balances v
     ON v.company_id=i.company_id AND v.location_id=k.location_id AND v.inventory_item_id=k.item_id
   LEFT JOIN inventory_categories c ON c.id=i.category_id AND c.company_id=i.company_id
   WHERE NOT EXISTS(SELECT 1 FROM bakery_products bp WHERE bp.company_id=i.company_id AND bp.inventory_item_id=i.id)
     AND COALESCE(c.category_type,'')<>'finished_good'
     AND (COALESCE(sb.quantity,0)<>0 OR COALESCE(sb.reserved_quantity,0)<>0 OR v.id IS NOT NULL)
     AND (k.location_id>? OR (k.location_id=? AND k.item_id>?))
   ORDER BY k.location_id,k.item_id LIMIT 101`)
   .bind(COMPANY,COMPANY,COMPANY,afterLocationId,afterLocationId,afterItemId).all<ReconciliationRow>();
 const all=records.results||[],hasMore=all.length>100,source=all.slice(0,100);
 const entries=source.map(row=>{
  const physical=row.physicalQuantity===null?0:Number(row.physicalQuantity);
  const reserved=row.reservedQuantity===null?0:Number(row.reservedQuantity);
  const countedMicro=physical===0?0:materialQuantityMicro(physical);
  const reservedMicro=reserved===0?0:materialQuantityMicro(reserved);
  const valuedQty=row.valuedQuantityMicro===null?null:Number(row.valuedQuantityMicro);
  const valuedMoney=row.valuedMicroKobo===null?null:Number(row.valuedMicroKobo);
  let status='reconciled';
  if(physical<0||reserved<0||countedMicro===null||reservedMicro===null)status='invalid_stock_quantity';
  else if(reserved>physical)status='invalid_reservation';
  else if(valuedQty===null)status='unvalued_stock';
  else if(!Number.isSafeInteger(valuedQty)||!Number.isSafeInteger(valuedMoney)
    ||valuedQty<0||Number(valuedMoney)<0)status='invalid_valuation';
  else if(valuedQty===0&&Number(valuedMoney)>0)status='orphan_value';
  else if(countedMicro!==valuedQty)status='quantity_mismatch';
  else if(Number(row.itemActive)!==1||Number(row.locationActive)!==1)status='inactive_inventory';
  const varianceMicro=countedMicro!==null&&valuedQty!==null&&Number.isSafeInteger(valuedQty)
   &&Number.isSafeInteger(countedMicro-valuedQty)?countedMicro-valuedQty:null;
  return{locationId:row.locationId,itemId:row.itemId,itemName:row.itemName,
   locationName:row.locationName,baseUnit:row.baseUnit,
   physicalQuantity:physical,reservedQuantity:reserved,
   physicalQuantityMicro:countedMicro,valuedQuantityMicro:valuedQty,
   valuedMicroKobo:valuedMoney,quantityVarianceMicro:varianceMicro,status};
 });
 const last=source.at(-1);
 return json({companyId:COMPANY,readOnly:true,scope:'page_only',
  unitScale:1000000,valueScaleMicroKobo:1000000,
  entries,returned:entries.length,exceptionsOnPage:entries.filter(x=>x.status!=='reconciled').length,
  hasMore,nextCursor:hasMore&&last?{afterLocationId:last.locationId,afterItemId:last.itemId}:null,
  explanation:'Each page compares physical stock and exact financial value; unvalued stock is flagged, never assigned an invented cost.'});
}
export async function routeBakeryMaterialOpenings(request:Request,env:OpeningEnv,context:SessionContext){
 const path=new URL(request.url).pathname;
 if(path==='/api/inventory/bakery/openings'&&request.method==='GET')return list(context,env);
  if(path==='/api/inventory/bakery/reconciliation'&&request.method==='GET')return reconciliation(request,env,context);
 if(path==='/api/inventory/bakery/openings/propose'&&request.method==='POST')return propose(request,env,context);
 if(path==='/api/inventory/bakery/openings/review'&&request.method==='POST')return review(request,env,context);
 return null;
}
