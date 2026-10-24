/* One-time read-validated PR 173 conflict resolver. It only reads git
 * stages and writes the two expected conflict files: no reset or deployment. */
const fs=require('node:fs'),cp=require('node:child_process');
const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const pick=(stage,file)=>git('show',':'+stage+':'+file);
const status=git('diff','--name-only','--diff-filter=U').trim().split(/\r?\n/).filter(Boolean).sort();
const expect=['src/auth.tsx','src/signin-experience.css'].sort();
if(JSON.stringify(status)!==JSON.stringify(expect)) throw Error('Unexpected unresolved paths: '+status);
const common='src/signin-experience.css';
const ancestor=pick(1,common),ours=pick(2,common),upstream=pick(3,common);
if(!ours.startsWith(ancestor)||!upstream.startsWith(ancestor))throw Error('CSS branches changed common prefix; refusing composition');
const suffix=ours.slice(ancestor.length);
for(const name of ['sp-mobile-auth-dock','sp-inline-auth-error','32-inch/4K auth acceptance'])if(!suffix.includes(name))throw Error('Missing own style '+name);
const css=upstream+suffix;
let auth=pick(2,'src/auth.tsx');
const replacements=[
 ["  async function signIn(event: React.FormEvent) {\n    event.preventDefault();\n    setBusy(true);",
  "  async function signIn(event: React.FormEvent) {\n    event.preventDefault();\n    if (!identity.trim() || !password) {\n      setMessage({ type: 'error', text: 'Enter your email or username and password to continue.' });\n      return;\n    }\n    setBusy(true);"],
 ["  async function startWhatsAppSignIn() {\n    setBusy(true);",
  "  async function startWhatsAppSignIn() {\n    if (!identity.trim() || !password) {\n      setMessage({ type: 'error', text: 'Enter your email or username and password before requesting WhatsApp verification.' });\n      return;\n    }\n    setBusy(true);"],
 ['autoComplete="username" value={identity}','autoComplete="username" required value={identity}'],
 ['autoComplete="current-password" value={password}','autoComplete="current-password" required value={password}']
];
for(const [before,after] of replacements){if(auth.split(before).length!==2)throw Error('Missing/repeated auth anchor '+before.slice(0,90));auth=auth.replace(before,after)}
for(const marker of ['Enter your email or username and password to continue.','before requesting WhatsApp verification.','sp-inline-auth-error','onSwitchAuth={switchMode}','placeholder="Email or username"'])if(!auth.includes(marker))throw Error('Missing merged auth behavior '+marker);
fs.writeFileSync(common,css,'utf8');fs.writeFileSync('src/auth.tsx',auth,'utf8');
console.log('RESOLVED_EXPECTED_CONFLICTS_WITH_UPSTREAM_AUTH_GUARDS');
console.log('CSS ancestor/upstream/own-suffix/combined bytes',ancestor.length,upstream.length,suffix.length,css.length);
console.log('NO_RESET_NO_FORCE');
