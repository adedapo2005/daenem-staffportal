// Bakery exact-cost arithmetic. One kobo = 1,000,000 microkobo, one Inventory unit = 1,000,000 micro-units.
// Integer-backed monetary/quantity conservation; rounding only when presenting a whole-kobo amount.
const SCALE=1000000;
export const MATERIAL_VALUE_SCALE=SCALE;
export type MaterialValueBalance={quantityMicro:number;valueMicroKobo:number};
export type MaterialValueIssue={costMicroKobo:number;next:MaterialValueBalance};
export function materialQuantityMicro(value:number):number|null{
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>100000000)return null;
 const shifted=value*SCALE,rounded=Math.round(shifted);
 if(!Number.isSafeInteger(rounded)||rounded<=0||Math.abs(shifted-rounded)>1e-7)return null;
 return rounded;
}
export function materialCostMicroKobo(totalKobo:number):number|null{
 if(typeof totalKobo!=='number'||!Number.isSafeInteger(totalKobo)||totalKobo<0)return null;
 const total=totalKobo*SCALE;
 return Number.isSafeInteger(total)?total:null;
}
export function allocateMaterialValue(
 available:MaterialValueBalance,issueQuantityMicro:number
):MaterialValueIssue|null{
 const count=available.quantityMicro,value=available.valueMicroKobo;
 if(!Number.isSafeInteger(count)||!Number.isSafeInteger(value)||!Number.isSafeInteger(issueQuantityMicro)
   ||count<=0||value<0||issueQuantityMicro<=0||issueQuantityMicro>count)return null;
 // BigInt avoids precision loss in the multiplication of large (but individually safe) integers.
 const numerator=BigInt(value)*BigInt(issueQuantityMicro),denominator=BigInt(count);
 const quotient=(numerator*2n+denominator)/(2n*denominator);
 if(quotient<0n||quotient>BigInt(value))return null;
 const cost=Number(quotient),leftCount=count-issueQuantityMicro,leftValue=value-cost;
 if(!Number.isSafeInteger(cost)||!Number.isSafeInteger(leftValue)||!Number.isSafeInteger(leftCount))return null;
 return{costMicroKobo:cost,next:{quantityMicro:leftCount,valueMicroKobo:leftValue}};
}
export function sumMaterialValue(left:MaterialValueBalance,right:MaterialValueBalance):MaterialValueBalance|null{
 const count=left.quantityMicro+right.quantityMicro,value=left.valueMicroKobo+right.valueMicroKobo;
 if(![left.quantityMicro,left.valueMicroKobo,right.quantityMicro,right.valueMicroKobo,count,value].every(Number.isSafeInteger)
   ||left.quantityMicro<0||right.quantityMicro<=0||left.valueMicroKobo<0||right.valueMicroKobo<0
   ||!Number.isSafeInteger(count)||!Number.isSafeInteger(value))return null;
 return {quantityMicro:count,valueMicroKobo:value};
}
export function materialWholeKobo(valueMicroKobo:number):number|null{
 if(!Number.isSafeInteger(valueMicroKobo)||valueMicroKobo<0)return null;
 const rounded=(BigInt(valueMicroKobo)+BigInt(SCALE/2))/BigInt(SCALE);
 return rounded<=BigInt(Number.MAX_SAFE_INTEGER)?Number(rounded):null;
}

export async function readMaterialValueBalance(
 db:D1Database, companyId:string, locationId:string, itemId:string
):Promise<MaterialValueBalance|null>{
 const state=await db.prepare(`SELECT remaining_quantity_micro AS quantityMicro,remaining_value_microkobo AS valueMicroKobo
 FROM bakery_material_valuation_balances WHERE company_id=? AND location_id=? AND inventory_item_id=?`)
 .bind(companyId,locationId,itemId).first<MaterialValueBalance>();
 return state||null;
}
