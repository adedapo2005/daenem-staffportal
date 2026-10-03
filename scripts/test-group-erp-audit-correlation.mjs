import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

check('audit helper accepts the originating request', source.includes('async function audit(request:Request'));
check('formal audit stores the bounded request correlation', source.includes('requestCorrelationId(request)).run()'));
check('all best-effort Group ERP audit writes preserve the request', (source.match(/await audit\(request,env,c,/g) || []).length === 4);
check('inbound request ID takes precedence over CF-Ray', source.includes("request.headers.get('x-request-id')||request.headers.get('cf-ray')"));
check('correlation fallback remains generated when headers are absent', source.includes("||crypto.randomUUID()).slice(0,128)"));
check('protected payroll export has a non-swallowing audit writer', source.includes('async function auditRequired(') && source.includes("try{await auditRequired(request,env,c,'payroll','export_bank_payment_draft'") && source.includes("return json({error:'Payment batch export is temporarily unavailable.'},503)"));
