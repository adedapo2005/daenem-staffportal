import {activeEvidence} from './evidence-state';
import {fileChangeError} from './file-governance';
import {byId, recordVisible, type RecordData, type Session} from './model';

/** Pure, all-or-nothing fixture transaction. Production must provide the same
 * guarantees inside its authoritative database transaction, not in a browser. */
export function applyTransaction(previous: RecordData[], original: RecordData, next: RecordData, session: Session): RecordData[] {
  const current = previous.find(r => r.module === original.module && r.id === original.id);
  if (current && (current.revision || 0) !== (original.revision || 0)) throw new Error('This record changed. Reopen it before saving.');
  if(current){const fileError=fileChangeError(current,next,session);if(fileError)throw new Error(fileError)}
  const result = previous.map(r => ({...r, fields: {...r.fields}, history: [...r.history]}));
  const findLinked = (module: string, predicate: (r: RecordData) => boolean) => {
    const matches = result.filter(r => r.module === module && r.company === next.company && predicate(r));
    if (matches.length !== 1 || !recordVisible(matches[0], byId(module)!, session)) throw new Error('A required linked record is unavailable.');
    return matches[0];
  };
  const number = (r: RecordData, field: string) => {
    const value = Number(r.fields[field]);
    if (!Number.isFinite(value) || value < 0 || r.fields[field] === '') throw new Error(`${field} must be a nonnegative number.`);
    return value;
  };
  const update = (r: RecordData, action: string) => {
    r.revision = (r.revision || 0) + 1;
    r.history.push({action: `${action} · ${next.module}:${next.id}`, actor: session.personId, time: new Date().toISOString()});
  };
  if(current&&['Posted','Closed','Complete','Reconciled','Paid'].includes(current.status)&&['finance','goods-receipts','printing','bakery','logistics','bakery-accountability'].includes(current.module)&&(JSON.stringify(current.fields)!==JSON.stringify(next.fields)||JSON.stringify(current.evidence)!==JSON.stringify(next.evidence)||JSON.stringify(activeEvidence(current))!==JSON.stringify(activeEvidence(next))||JSON.stringify(current.evidenceData)!==JSON.stringify(next.evidenceData)))throw new Error('Finalized values and evidence are immutable. Use a separately reviewed correction.');
  if(current?.module==='payroll'&&['Approved','Draft Export'].includes(current.status)&&(JSON.stringify(current.fields)!==JSON.stringify(next.fields)||JSON.stringify(current.evidence)!==JSON.stringify(next.evidence)||JSON.stringify(activeEvidence(current))!==JSON.stringify(activeEvidence(next))||JSON.stringify(current.evidenceData)!==JSON.stringify(next.evidenceData)||current.amount!==next.amount))throw new Error('Approved payroll is immutable. Create a reviewed adjustment.');
  if(current?.module==='purchase-orders'&&(current.fields['Received Quantity']!==next.fields['Received Quantity']||current.status!==next.status&&['Partially Received','Received'].includes(next.status)))throw new Error('Receipt totals are updated only by posted receipts.');
  const changed = current?.status !== next.status;
  const graphs:Record<string,Record<string,string[]>>={
    'goods-receipts':{Draft:['Inspected','Accepted','Cancelled'],Inspected:['Accepted','Cancelled'],Accepted:['Posted','Cancelled'],Posted:[],Cancelled:[]},
    'stock-transfers':{Draft:['Approved','Cancelled'],Approved:['Dispatched','Cancelled'],Dispatched:['In Transit'],'In Transit':['Received'],Received:['Closed'],Closed:[],Cancelled:[]},
    'payroll':{Prepare:['Validate'],Validate:['Review'],Review:['Approved'],Approved:['Draft Export'],'Draft Export':[]},
  };
  if(current&&changed&&!graphs[next.module]){
    const mod=byId(next.module)!,index=mod.stages.indexOf(current.status);
    const allowed=mod.stages[index+1]===next.status||['expenses','leave','forms'].includes(next.module)&&current.status==='Submitted'&&['Approved','Returned','Rejected'].includes(next.status)||['expenses','leave','forms'].includes(next.module)&&current.status==='Returned'&&next.status==='Submitted'||next.status==='Cancelled'&&!['Posted','Closed','Received','Complete','Paid'].includes(current.status)&&mod.stages.includes('Cancelled')||['properties','inventory','fleet'].includes(next.module)&&mod.stages.includes(next.status);
    if(!allowed)throw new Error('This workflow stage cannot be skipped or reversed. Complete the next permitted step.');
  }
  if(current&&changed&&graphs[next.module]&&!graphs[next.module][current.status]?.includes(next.status))throw new Error('This state transition is unavailable.');
  if (current && ((current.module === 'goods-receipts' && current.status === 'Posted') || (current.module === 'stock-transfers' && ['Dispatched','In Transit','Received','Closed'].includes(current.status)))) {
    const protectedFields = current.module === 'goods-receipts' ? Object.keys(current.fields) : ['Item','Quantity','From Location','To Location'];
    if (protectedFields.some(f => next.fields[f] !== current.fields[f])) throw new Error('Posted or dispatched quantities are immutable. Use a separately reviewed correction.');
    if (current.status === 'Posted' && next.status !== 'Posted') throw new Error('A posted receipt cannot be reopened or posted again.');
  }
  if (next.module === 'goods-receipts' && changed && ['Accepted','Posted'].includes(next.status)) {
    if (!activeEvidence(next).length) throw new Error('Attach receiving evidence before acceptance.');
    const po = findLinked('purchase-orders', r => r.id === next.fields['Purchase Order']);
    if (!['Ordered','Partially Received'].includes(po.status)) throw new Error('The linked purchase order must have an outstanding ordered balance.');
    if(!po.fields.Item || po.fields.Item!==next.fields.Item)throw new Error('The receipt item must match the linked purchase order item.');
    const accepted = number(next, 'Accepted Quantity');
    if (accepted + number(next, 'Rejected Quantity') !== number(next, 'Quantity')) throw new Error('Receipt quantities must reconcile.');
    const received = number(po, 'Received Quantity');
    if (received + accepted > number(po, 'Quantity')) throw new Error('Receipt exceeds the outstanding purchase order quantity.');
    if (next.status === 'Posted') {
      if (current?.status !== 'Accepted') throw new Error('Accept the receipt before posting.');
      const stock = findLinked('inventory', r => r.fields.Item === next.fields.Item && r.fields.Location === next.fields.Location);
      stock.fields['On Hand'] = String(number(stock, 'On Hand') + accepted);
      po.fields['Received Quantity'] = String(received + accepted);
      po.status = received + accepted === number(po, 'Quantity') ? 'Received' : 'Partially Received';
      update(stock, 'Receipt posted'); update(po, 'Receipt posted');
    }
  }
  if (next.module === 'stock-transfers' && changed && ['Dispatched','Received'].includes(next.status)) {
    const qty = number(next, 'Quantity');
    if (!qty || next.fields['From Location'] === next.fields['To Location']) throw new Error('A transfer requires positive quantity and distinct locations.');
    if (!activeEvidence(next).length) throw new Error('Attach custody evidence before moving stock.');
    if (next.status === 'Dispatched') {
      if (current?.status !== 'Approved') throw new Error('Approve the transfer before dispatch.');
      const source = findLinked('inventory', r => r.fields.Item === next.fields.Item && r.fields.Location === next.fields['From Location']);
      const available = number(source, 'On Hand') - Number(source.fields.Reserved || 0);
      if (!Number.isFinite(available) || available < qty) throw new Error('Insufficient available stock at the source.');
      source.fields['On Hand'] = String(number(source, 'On Hand') - qty); update(source, 'Transfer dispatched');
    } else {
      if (current?.status !== 'In Transit') throw new Error('Only an in-transit transfer can be received.');
      if (number(next, 'Received Quantity') !== qty) throw new Error('Resolve the receiving discrepancy before completion.');
      const destination = findLinked('inventory', r => r.fields.Item === next.fields.Item && r.fields.Location === next.fields['To Location']);
      destination.fields['On Hand'] = String(number(destination, 'On Hand') + qty); update(destination, 'Transfer received');
    }
  }
  const index = result.findIndex(r => r.module === next.module && r.id === next.id);
  if (index === -1) result.unshift(next); else result[index] = next;
  return result;
}
