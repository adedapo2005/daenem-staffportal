import{type AuthEnv,type SessionContext}from'./auth';
import{allocateMaterialValue,materialQuantityMicro,readMaterialValueBalance,sumMaterialValue}from'./bakery-material-valuation';

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
type TransferInput={companyId:string;itemId:string;fromLocationId:string;toLocationId:string;
 quantity:number;sourceBalanceId:string;sourceQuantity:number;sourceReserved:number;reason?:string};
export async function transferPreciseBakeryMaterial(
 env:AuthEnv,context:SessionContext,t:TransferInput
):Promise<Response|null>{
 if(t.companyId!=='company-bakery')return null;
 const [sourceValue,destValue]=await Promise.all([
  readMaterialValueBalance(env.DB,t.companyId,t.fromLocationId,t.itemId),
  readMaterialValueBalance(env.DB,t.companyId,t.toLocationId,t.itemId)
 ]);
 if(!sourceValue&&!destValue)return null; // Preserve existing unvalued Inventory transfers.
 if(!sourceValue)return json({error:'Destination has exact-valued stock. Verify an opening valuation for the source material before transferring into it.'},409);
 const qtyMicro=materialQuantityMicro(t.quantity),
  sourcePhysicalMicro=t.sourceQuantity===0?0:materialQuantityMicro(t.sourceQuantity);
 if(qtyMicro===null||sourcePhysicalMicro===null||sourcePhysicalMicro!==sourceValue.quantityMicro)
  return json({error:'Source physical stock and financial valuation do not reconcile. No transfer was made.'},409);
 if(t.sourceQuantity-t.sourceReserved<t.quantity)return json({error:'Insufficient unreserved material for transfer.'},409);
 const destStock=await env.DB.prepare(`SELECT quantity,reserved_quantity AS reservedQuantity
  FROM stock_balances WHERE company_id=? AND location_id=? AND item_id=?`)
  .bind(t.companyId,t.toLocationId,t.itemId)
  .first<{quantity:number;reservedQuantity:number}>();
 const destOnHand=Number(destStock?.quantity||0);
 const destPhysicalMicro=destOnHand===0?0:materialQuantityMicro(destOnHand);
 if(destPhysicalMicro===null||destValue&&destValue.quantityMicro!==destPhysicalMicro
   ||!destValue&&(destPhysicalMicro!==0||Number(destStock?.reservedQuantity||0)!==0))
  return json({error:'Destination has unvalued material or an unreconciled physical count. Verify its opening valuation before accepting a transfer.'},409);
 const issued=allocateMaterialValue(sourceValue,qtyMicro);
 if(!issued)return json({error:'Transfer quantity exceeds exact-value inventory or supported precision.'},409);
 const received=sumMaterialValue(destValue||{quantityMicro:0,valueMicroKobo:0},
  {quantityMicro:qtyMicro,valueMicroKobo:issued.costMicroKobo});
 if(!received)return json({error:'Transfer would exceed safe destination money or quantity limits.'},409);
 const ref=uid('transfer'),outId=uid('stock-movement'),inId=uid('stock-movement'),
  unitCostApprox=Math.round(issued.costMicroKobo/qtyMicro),
  metadata={valuationMode:'exact_microkobo',transferRef:ref,exactValueMicroKobo:issued.costMicroKobo,
    quantityMicro:qtyMicro,unitCostKoboApproximate:unitCostApprox};
 const statements:D1PreparedStatement[]=[
  env.DB.prepare(`UPDATE stock_balances SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP
   WHERE id=? AND company_id=? AND location_id=? AND item_id=? AND quantity-reserved_quantity>=?
     AND CAST(ROUND(quantity*1000000,0) AS INTEGER)=?`)
   .bind(t.quantity,t.sourceBalanceId,t.companyId,t.fromLocationId,t.itemId,t.quantity,sourcePhysicalMicro),
  env.DB.prepare(`INSERT INTO stock_movements
   (id,company_id,item_id,movement_type,quantity,unit_cost_kobo,from_location_id,to_location_id,
    reference_type,reference_id,reason,created_by,metadata_json)
   VALUES(?,?,?,'transfer_out',CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?,?)`)
   .bind(outId,t.companyId,t.itemId,t.quantity,unitCostApprox,t.fromLocationId,t.toLocationId,
    'stock_transfer',ref,t.reason||'Internal precise-material transfer',context.employee.id,JSON.stringify(metadata)),
  env.DB.prepare(`UPDATE bakery_material_valuation_balances SET remaining_quantity_micro=?,
    remaining_value_microkobo=?,updated_at=CURRENT_TIMESTAMP
    WHERE company_id=? AND location_id=? AND inventory_item_id=?
      AND remaining_quantity_micro=? AND remaining_value_microkobo=?`)
   .bind(issued.next.quantityMicro,issued.next.valueMicroKobo,
    t.companyId,t.fromLocationId,t.itemId,sourceValue.quantityMicro,sourceValue.valueMicroKobo),
  env.DB.prepare(`INSERT INTO bakery_material_valuation_events(id,company_id,location_id,inventory_item_id,
    stock_movement_id,movement_type,quantity_micro,value_microkobo,before_quantity_micro,before_value_microkobo,
    after_quantity_micro,after_value_microkobo,reference_id,recorded_by)
   VALUES(?,?,?,?,?,'transfer_out',CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?)`)
   .bind(uid('material-value-event'),t.companyId,t.fromLocationId,t.itemId,outId,
    qtyMicro,issued.costMicroKobo,sourceValue.quantityMicro,sourceValue.valueMicroKobo,
    issued.next.quantityMicro,issued.next.valueMicroKobo,ref,context.employee.id),
  env.DB.prepare(`INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity)
    VALUES(?,?,?,?,?) ON CONFLICT(location_id,item_id) DO UPDATE SET
    quantity=stock_balances.quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP
    WHERE stock_balances.company_id=? AND CAST(ROUND(stock_balances.quantity*1000000,0) AS INTEGER)=?`)
   .bind(uid('stock-balance'),t.companyId,t.toLocationId,t.itemId,t.quantity,t.companyId,destPhysicalMicro),
  env.DB.prepare(`INSERT INTO stock_movements(id,company_id,item_id,movement_type,quantity,unit_cost_kobo,
    from_location_id,to_location_id,reference_type,reference_id,reason,created_by,metadata_json)
    VALUES(?,?,?,'transfer_in',CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?,?)`)
   .bind(inId,t.companyId,t.itemId,t.quantity,unitCostApprox,t.fromLocationId,t.toLocationId,
     'stock_transfer',ref,t.reason||'Internal precise-material transfer',context.employee.id,JSON.stringify(metadata)),
  env.DB.prepare(`INSERT INTO bakery_material_valuation_balances
    (id,company_id,location_id,inventory_item_id,remaining_quantity_micro,remaining_value_microkobo)
    VALUES(?,?,?,?,?,?) ON CONFLICT(company_id,location_id,inventory_item_id) DO UPDATE SET
    remaining_quantity_micro=excluded.remaining_quantity_micro,
    remaining_value_microkobo=excluded.remaining_value_microkobo,updated_at=CURRENT_TIMESTAMP
    WHERE remaining_quantity_micro=? AND remaining_value_microkobo=?`)
   .bind(uid('material-value-balance'),t.companyId,t.toLocationId,t.itemId,
     received.quantityMicro,received.valueMicroKobo,
     destValue?.quantityMicro||0,destValue?.valueMicroKobo||0),
  env.DB.prepare(`INSERT INTO bakery_material_valuation_events(id,company_id,location_id,inventory_item_id,
    stock_movement_id,movement_type,quantity_micro,value_microkobo,before_quantity_micro,before_value_microkobo,
    after_quantity_micro,after_value_microkobo,reference_id,recorded_by)
    VALUES(?,?,?,?,?,'transfer_in',CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?,?)`)
   .bind(uid('material-value-event'),t.companyId,t.toLocationId,t.itemId,inId,
     qtyMicro,issued.costMicroKobo,destValue?.quantityMicro||0,destValue?.valueMicroKobo||0,
     received.quantityMicro,received.valueMicroKobo,ref,context.employee.id),
  env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source)
    VALUES(?,?,?,'inventory','stock_transfer','stock_transfer',?,?,'web')`)
   .bind(uid('audit'),context.employee.id,t.companyId,ref,
     JSON.stringify({itemId:t.itemId,from:t.fromLocationId,to:t.toLocationId,quantity:t.quantity,
       quantityMicro:qtyMicro,valueMicroKobo:issued.costMicroKobo,valuationMode:'exact_microkobo'}))
 ];
 try{await env.DB.batch(statements)}
 catch{return json({error:'Exact-value transfer did not commit. Material quantity/value changed or the destination is not yet reconciled.'},409)}
 return json({ok:true,transferRef:ref,valuationMode:'exact_microkobo',quantity:t.quantity,
  valueMicroKobo:issued.costMicroKobo,
  message:'Stock and exact financial value transferred together in one audited transaction.'});
}
