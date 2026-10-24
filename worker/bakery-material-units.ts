import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface UnitEnv extends AuthEnv {}
const COMPANY = 'company-bakery';
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const member = (context: SessionContext) => context.companies.some(c => c.id === COMPANY);
const allowed = (context: SessionContext, action: 'view'|'edit'|'approve') =>
  member(context) && hasPermission(context, 'bakery.access', 'view', COMPANY)
    && hasPermission(context, 'inventory.access', action, COMPANY);

export const normalizeMaterialUnit = (input: unknown) =>
  typeof input === 'string' ? input.trim().replace(/\s+/g, ' ').toLowerCase() : '';
export const validMaterialUnit = (input: string) => /^[a-z0-9][a-z0-9 _.-]{0,29}$/.test(input);
export const normalizeBaseQuantity = (inputQuantity: number, factor: number) => {
  if (!Number.isFinite(inputQuantity) || inputQuantity <= 0 || inputQuantity > 100000000
    || !Number.isFinite(factor) || factor <= 0 || factor > 100000000) return null;
  const raw = inputQuantity * factor;
  const rounded = Math.round(raw * 1000000) / 1000000;
  // Quantities must fit the shared Inventory ledger's practical six-decimal precision.
  return Number.isFinite(raw) && raw <= 100000000 && Number.isFinite(rounded)
    && rounded > 0 && Math.abs(raw - rounded) <= 0.00000001 ? rounded : null;
};

export type ApprovedMaterialRule = {
  id: string; fromUnit: string; inventoryUnit: string; factor: number; versionNo: number;
};
export async function approvedMaterialRule(
  env: UnitEnv, itemId: string, fromUnit: string, inventoryUnit: string
): Promise<ApprovedMaterialRule|null> {
  const row = await env.DB.prepare(`
    SELECT id,input_unit AS fromUnit,inventory_unit AS inventoryUnit,
      base_quantity_per_input AS factor,version_no AS versionNo
    FROM bakery_material_unit_rules
    WHERE company_id=? AND inventory_item_id=? AND input_unit=?
      AND lower(inventory_unit)=? AND status='approved'
    ORDER BY version_no DESC LIMIT 1
  `).bind(COMPANY,itemId,fromUnit,inventoryUnit).first<ApprovedMaterialRule>();
  return row && Number.isFinite(Number(row.factor)) && Number(row.factor)>0 ? row : null;
}

async function listRules(env: UnitEnv, context: SessionContext) {
  if (!member(context) || !hasPermission(context,'bakery.access','view',COMPANY)) return json({error:'Bakery access is required.'},403);
  const rows = await env.DB.prepare(`
    SELECT r.id,r.inventory_item_id AS inventoryItemId,i.name AS ingredientName,
      r.input_unit AS fromUnit,r.inventory_unit AS inventoryUnit,
      r.base_quantity_per_input AS factor,r.version_no AS versionNo,
      r.status,r.reason,r.proposed_by AS proposedBy,r.reviewed_by AS reviewedBy,
      r.review_note AS reviewNote,r.created_at AS createdAt,r.reviewed_at AS reviewedAt
    FROM bakery_material_unit_rules r
    JOIN inventory_items i ON i.id=r.inventory_item_id AND i.company_id=r.company_id
    WHERE r.company_id=?
      AND (r.status='proposed' OR (r.status='approved' AND
        r.version_no=(SELECT MAX(x.version_no) FROM bakery_material_unit_rules x
          WHERE x.company_id=r.company_id AND x.inventory_item_id=r.inventory_item_id
            AND x.input_unit=r.input_unit AND x.status='approved')))
    ORDER BY i.name,r.input_unit,r.version_no DESC LIMIT 300
  `).bind(COMPANY).all<Record<string,unknown>>();
  const canReview = allowed(context,'approve'),canEdit = allowed(context,'edit');
  const result=(rows.results||[]).filter(row=>row.status==='approved'||canEdit||canReview);
  return json({rules:result,canPropose:canEdit,canReview,baseUnitAuthority:'inventory_items.unit',
    policy:'Only independently approved rules are usable. Every recipe and receipt records the applied rule version.'});
}

async function proposeRule(request: Request, env: UnitEnv, context: SessionContext) {
  if (!allowed(context,'edit')) return json({error:'Edit Bakery Inventory permission is required.'},403);
  let body:Record<string,unknown>;try{body=await request.json()}catch{return json({error:'Invalid material conversion proposal.'},400)}
  const itemId=String(body.inventoryItemId||'').trim(),fromUnit=normalizeMaterialUnit(body.fromUnit),
    factor=body.factor,reason=String(body.reason||'').trim();
  if(!itemId||!validMaterialUnit(fromUnit)||typeof factor!=='number'||!Number.isFinite(factor)
    ||factor<=0||factor>100000000||reason.length<8||reason.length>500)
    return json({error:'Choose an ingredient, a valid purchase unit, a positive conversion factor and an evidence-based reason (8–500 characters).'},400);
  const item=await env.DB.prepare(`SELECT id,unit FROM inventory_items WHERE id=? AND company_id=? AND active=1`)
    .bind(itemId,COMPANY).first<{id:string;unit:string}>();
  const inventoryUnit=normalizeMaterialUnit(item?.unit);
  if(!item||!validMaterialUnit(inventoryUnit))return json({error:'Active Bakery inventory ingredient and its base unit are required.'},404);
  if(fromUnit===inventoryUnit)return json({error:'The purchase unit already matches the inventory unit. No conversion rule is needed.'},400);
  if(normalizeBaseQuantity(1,Number(factor))===null)return json({error:'Conversion precision exceeds safe base-unit stock precision.'},400);
  const pending=await env.DB.prepare(`SELECT id FROM bakery_material_unit_rules
     WHERE company_id=? AND inventory_item_id=? AND input_unit=? AND status='proposed' LIMIT 1`)
    .bind(COMPANY,itemId,fromUnit).first();
  if(pending)return json({error:'A conversion for this ingredient and unit is awaiting independent review.'},409);
  const version=await env.DB.prepare(`SELECT COALESCE(MAX(version_no),0)+1 AS versionNo
     FROM bakery_material_unit_rules WHERE company_id=? AND inventory_item_id=? AND input_unit=?`)
    .bind(COMPANY,itemId,fromUnit).first<{versionNo:number}>();
  const ruleId=uid('bakery-unit-rule'),versionNo=Number(version?.versionNo||1);
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO bakery_material_unit_rules
        (id,company_id,inventory_item_id,input_unit,inventory_unit,base_quantity_per_input,version_no,reason,proposed_by)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(ruleId,COMPANY,itemId,fromUnit,inventoryUnit,factor,versionNo,reason,context.employee.id),
      env.DB.prepare(`INSERT INTO audit_logs
        (id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
        VALUES(?,?,?,'bakery','propose_unit_conversion','bakery_material_unit_rule',?,?,'web')`)
        .bind(uid('audit'),context.employee.id,COMPANY,ruleId,JSON.stringify({itemId,fromUnit,inventoryUnit,factor,versionNo,reason})),
    ]);
  }catch{return json({error:'Conversion proposal conflicted with an existing version; refresh and retry.'},409)}
  return json({ok:true,ruleId,status:'proposed',versionNo,requiresIndependentApproval:true},201);
}

async function reviewRule(request: Request, env: UnitEnv, context: SessionContext) {
  if(!allowed(context,'approve'))return json({error:'Approve Bakery Inventory permission is required.'},403);
  let body:Record<string,unknown>;try{body=await request.json()}catch{return json({error:'Invalid conversion review.'},400)}
  const ruleId=String(body.ruleId||'').trim(),decision=String(body.decision||''),
    reviewNote=String(body.reviewNote||'').trim();
  if(!ruleId||!['approved','rejected'].includes(decision)||reviewNote.length<8||reviewNote.length>500)
    return json({error:'Select a rule, approve or reject it, and provide an independent review note (8–500 characters).'},400);
  const rule=await env.DB.prepare(`SELECT r.id,r.status,r.proposed_by AS proposedBy,r.inventory_unit AS inventoryUnit,
      i.unit AS currentUnit,i.active AS itemActive
    FROM bakery_material_unit_rules r JOIN inventory_items i ON i.id=r.inventory_item_id AND i.company_id=r.company_id
    WHERE r.id=? AND r.company_id=?`).bind(ruleId,COMPANY)
    .first<{id:string;status:string;proposedBy:string;inventoryUnit:string;currentUnit:string;itemActive:number}>();
  if(!rule||rule.status!=='proposed')return json({error:'An undecided conversion rule was not found.'},409);
  if(rule.proposedBy===context.employee.id)return json({error:'The proposer cannot approve or reject their own conversion rule.'},403);
  if(rule.itemActive!==1||normalizeMaterialUnit(rule.inventoryUnit)!==normalizeMaterialUnit(rule.currentUnit))
    return json({error:'The inventory base unit changed. Propose a new conversion for the active item.'},409);
  try{
    await env.DB.batch([
      env.DB.prepare(`UPDATE bakery_material_unit_rules SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=?
        WHERE id=? AND company_id=? AND status='proposed' AND proposed_by<>?
          AND inventory_unit=(SELECT unit FROM inventory_items WHERE id=bakery_material_unit_rules.inventory_item_id
             AND company_id=? AND active=1)`)
        .bind(decision,context.employee.id,reviewNote,ruleId,COMPANY,context.employee.id,COMPANY),
      env.DB.prepare(`INSERT INTO audit_logs
        (id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
        VALUES(?,?,?,'bakery',CASE WHEN changes()=1 THEN ? ELSE NULL END,'bakery_material_unit_rule',?,?,'web')`)
        .bind(uid('audit'),context.employee.id,COMPANY,
          decision==='approved'?'approve_unit_conversion':'reject_unit_conversion',ruleId,
          JSON.stringify({decision,reviewNote})),
    ]);
  }catch{return json({error:'Conversion review did not commit; the rule may have changed.'},409)}
  return json({ok:true,ruleId,status:decision});
}

export async function routeBakeryMaterialUnits(
  request:Request, env:UnitEnv, context:SessionContext
):Promise<Response|null> {
  const pathname=new URL(request.url).pathname;
  if(pathname==='/api/bakery/material-units' && request.method==='GET')return listRules(env,context);
  if(pathname==='/api/bakery/material-units/propose' && request.method==='POST')return proposeRule(request,env,context);
  if(pathname==='/api/bakery/material-units/review' && request.method==='POST')return reviewRule(request,env,context);
  return null;
}
