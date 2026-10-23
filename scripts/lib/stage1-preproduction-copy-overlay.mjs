import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const portal = fileURLToPath(new URL('../../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx', import.meta.url)).replaceAll('\\','/').toLowerCase();
const approved = '07af5ed6ff4a9e82a3984558738200c566456bd5ab48692420c7c78c3dc2d572';
const replacements = [
  ['Development preview controls','Pre-Production review controls',2],
  ['DEVELOPMENT PREVIEW ONLY','PRE-PRODUCTION REVIEW',1],
];
export function stage1PreproductionCopyOverlay() {
  return { name:'stage1-preproduction-copy-overlay', enforce:'pre', transform(source,id) {
    if(id.split('?')[0].replaceAll('\\','/').toLowerCase()!==portal)return null;
    const hash=createHash('sha256').update(source).digest('hex');
    if(hash!==approved)throw Error('Stage One copy overlay rejected: protected Portal checksum differs from approved source');
    let code=source;
    for(const [from,to,expected] of replacements){
      if(code.split(from).length-1!==expected)throw Error('Stage One copy overlay rejected: expected UI label count changed: '+from);
      code=code.split(from).join(to);
    }
    return {code,map:null};
  }};
}
