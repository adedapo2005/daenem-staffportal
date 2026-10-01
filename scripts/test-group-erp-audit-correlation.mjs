import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

check('audit helper accepts the originating request', source.includes('async function audit(request:Request'));
check('formal audit stores the bounded request correlation', source.includes('requestCorrelationId(request)).run()'));
check('all Group ERP audit writes preserve the request', (source.match(/await audit\(request,env,c,/g) || []).length === 5);
check('inbound request ID takes precedence over CF-Ray', source.includes("request.headers.get('x-request-id')||request.headers.get('cf-ray')"));
check('correlation fallback remains generated when headers are absent', source.includes("||crypto.randomUUID()).slice(0,128)"));
