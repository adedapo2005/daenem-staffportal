// Presentation shape only. Session, employee and authority checks stay in own-profile-load.
const nullableDisplayFields=['displayName','firstName','lastName','phone','email','jobTitle','department'] as const;
export function isOwnProfileDisplayShape(profile:unknown):boolean{
  if(!profile||typeof profile!=='object'||Array.isArray(profile))return false;
  const p=profile as Record<string,unknown>;
  return nullableDisplayFields.every(key=>p[key]===undefined||p[key]===null||typeof p[key]==='string')
    && (p.status===undefined||typeof p.status==='string');
}
