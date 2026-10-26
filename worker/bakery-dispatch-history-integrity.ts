import {hasPermission,type AuthEnv,type SessionContext} from './auth';

// Authenticated READ-ONLY exception evidence for historical Bakery dispatches.
// The company is ALWAYS permission-derived. No company picker or caller-selected
// tenant and NO money, stock, journal, audit or settlement writes.
interface Env extends AuthEnv {}
const COMPANY='company-bakery';
const LIMIT=50;
type DispatchIdRow={id:string};
type IssueRow={
 issue_code:string;dispatch_id:string;status:string|null;
 inventory_item_id:string|null;expected_quantity:number;
 recorded_quantity:number;review_note:string
};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});

// This is the bounded dispatch subset of scripts/bakery-dispatch-history-readonly.sql.
// Keep their exception codes/logic aligned and run the paired acceptance test.
const ISSUE_SQL=String.raw`WITH selected AS (
 SELECT id,company_id,status,location_id
 FROM bakery_dispatches WHERE company_id=? AND id>? AND id<=?
), expected AS (
 SELECT d.id AS dispatch_id,d.company_id,d.status,d.location_id,
        bp.inventory_item_id,SUM(di.quantity) AS expected_quantity,
        EXISTS(SELECT 1 FROM stock_movements sm
          WHERE sm.company_id=d.company_id
            AND sm.reference_type='bakery_dispatch'
            AND sm.reference_id=d.id) AS has_any_movement
 FROM selected d
 JOIN bakery_dispatch_items di ON di.dispatch_id=d.id
 JOIN bakery_products bp ON bp.id=di.product_id AND bp.company_id=d.company_id
 WHERE d.company_id='company-bakery'
 GROUP BY d.id,d.company_id,d.status,d.location_id,bp.inventory_item_id
),
item_check AS (
 SELECT e.*,
  COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm
    WHERE sm.company_id=e.company_id AND sm.reference_type='bakery_dispatch'
      AND sm.reference_id=e.dispatch_id
      AND sm.movement_type='transfer_out'
      AND sm.item_id=e.inventory_item_id
      AND sm.from_location_id=e.location_id),0) AS moved_quantity
 FROM expected e
),
issues AS (
 SELECT * FROM (
 SELECT 'DISPATCH_STOCK_QUANTITY_MISMATCH' AS issue_code,
    i.dispatch_id,i.status,i.inventory_item_id,
    i.expected_quantity,i.moved_quantity AS recorded_quantity,
    'Compare issued bread to transfer-out inventory movements' AS review_note
 FROM item_check i
 WHERE (i.status<>'draft' OR i.has_any_movement=1)
   AND ABS(i.expected_quantity-i.moved_quantity)>=0.0001

 UNION ALL
 SELECT 'UNEXPECTED_DISPATCH_STOCK_MOVEMENT',sm.reference_id,d.status,sm.item_id,
   CAST(0 AS REAL),sm.quantity,
   'Unexpected transfer type, product, location or missing dispatch; investigate' AS review_note
 FROM stock_movements sm LEFT JOIN selected d
   ON d.id=sm.reference_id AND d.company_id=sm.company_id
 WHERE sm.company_id='company-bakery' AND sm.reference_type='bakery_dispatch'
   AND sm.reference_id IN (SELECT id FROM selected)
   AND (
     sm.movement_type<>'transfer_out'
     OR NOT EXISTS(SELECT 1 FROM expected e
       WHERE e.dispatch_id=sm.reference_id AND e.company_id=sm.company_id
         AND e.inventory_item_id=sm.item_id
         AND e.location_id=sm.from_location_id)
   )

 UNION ALL
 SELECT 'DRAFT_WITH_STOCK_ALREADY_DEBITED',d.id,d.status,NULL,
    CAST(0 AS REAL),CAST(COUNT(sm.id) AS REAL),
    'Review incomplete/abandoned draft before any governed reversal' AS review_note
 FROM selected d JOIN stock_movements sm
   ON sm.reference_type='bakery_dispatch' AND sm.reference_id=d.id
    AND sm.company_id=d.company_id
 WHERE d.company_id='company-bakery' AND d.status='draft'
 GROUP BY d.id,d.status

 )
 UNION ALL
 SELECT * FROM (
 SELECT 'ISSUED_WITHOUT_DATABASE_AUDIT_REVIEW',d.id,d.status,NULL,
   CAST(1 AS REAL),CAST(0 AS REAL),
   'May predate 0116; verify historical signed issuance evidence, never fabricate an audit' AS review_note
 FROM selected d
 WHERE d.company_id='company-bakery'
   AND d.status IN ('in_transit','received','reconciling','closed')
   AND NOT EXISTS(
    SELECT 1 FROM audit_logs a
    WHERE a.company_id=d.company_id AND a.entity_id=d.id
      AND a.module='bakery' AND a.action='issue_dispatch'
      AND a.entity_type='bakery_dispatch' AND a.source='database'
   )

 UNION ALL
 SELECT 'ISSUED_WITHOUT_BREAD_ITEMS',d.id,d.status,NULL,
   CAST(1 AS REAL),CAST(0 AS REAL),
   'Issued or final dispatch has no product lines; investigate possible legacy insertion' AS review_note
 FROM selected d
 WHERE d.company_id='company-bakery'
   AND d.status IN ('in_transit','received','reconciling','closed')
   AND NOT EXISTS(SELECT 1 FROM bakery_dispatch_items di WHERE di.dispatch_id=d.id)

 UNION ALL
 SELECT 'CLOSED_WITHOUT_DATABASE_AUDIT_REVIEW',d.id,d.status,NULL,
   CAST(1 AS REAL),CAST(0 AS REAL),
   'May predate 0112; verify the original authorized closure evidence, never fabricate an audit' AS review_note
 FROM selected d
 WHERE d.company_id='company-bakery' AND d.status='closed'
   AND NOT EXISTS(
    SELECT 1 FROM audit_logs a
    WHERE a.company_id=d.company_id AND a.entity_id=d.id
      AND a.module='bakery' AND a.action='close_reconciliation'
      AND a.entity_type='bakery_dispatch' AND a.source='database'
   )
 )
)
SELECT issue_code,dispatch_id,status,inventory_item_id,
       expected_quantity,recorded_quantity,review_note
FROM issues ORDER BY dispatch_id,issue_code,inventory_item_id;`;

export async function routeBakeryDispatchHistoryIntegrity(
 request:Request,env:Env,context:SessionContext
):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname!=='/api/bakery/accountability/dispatch-history-integrity'
   ||request.method!=='GET')return null;
 if(!context.companies.some(x=>x.id===COMPANY)
   ||!hasPermission(context,'bakery.reconciliation','view',COMPANY)
   ||!hasPermission(context,'finance.ledger','view',COMPANY))
  return json({error:'Bakery reconciliation and Finance ledger view permissions are required.'},403);

 const params=url.searchParams;
 if([...params.keys()].some(key=>key!=='afterDispatchId')
   ||params.getAll('afterDispatchId').length>1)
  return json({error:'Company selection and unsupported query parameters are not allowed.'},400);
 const afterDispatchId=(params.get('afterDispatchId')||'').trim();
 if(afterDispatchId.length>128 || (afterDispatchId!==''&&!/^[A-Za-z0-9:_-]+$/.test(afterDispatchId)))
  return json({error:'Invalid dispatch page cursor.'},400);

 const rows=await env.DB.prepare(`SELECT id FROM bakery_dispatches
   WHERE company_id=? AND id>? ORDER BY id LIMIT ?`)
   .bind(COMPANY,afterDispatchId,LIMIT+1).all<DispatchIdRow>();
 const all=rows.results||[],hasMore=all.length>LIMIT;
 const selected=all.slice(0,LIMIT);
 if(selected.length===0)return json({
  readOnly:true,companyScope:'permission-derived',scannedDispatches:0,
  issues:[],hasMore:false,nextAfterDispatchId:null,
  settlementAssessed:false
 });
 const upperId=selected[selected.length-1].id;
 try{
  const evidence=await env.DB.prepare(ISSUE_SQL)
   .bind(COMPANY,afterDispatchId,upperId).all<IssueRow>();
  return json({
   readOnly:true,companyScope:'permission-derived',
   scannedDispatches:selected.length,issues:evidence.results||[],
   hasMore,nextAfterDispatchId:hasMore?upperId:null,
   settlementAssessed:false,
   notes:[
    'Historical records may predate database-owned audit triggers; flagged records need review, not invented audits.',
    'This page is bounded by dispatch ID; unlinked stock movements with no dispatch are covered by the separate full SQL release scan.',
    'Cashier confirmation and operational receipts are not independent bank/provider settlement.'
   ]
  });
 }catch{
  return json({error:'Bakery integrity evidence could not be read. No records were changed.'},503);
 }
}
