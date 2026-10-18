/** Fixture identifiers only; never use as an authentication secret. */
export function fixtureId(){
 if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
 const bytes=new Uint8Array(16);
 if(typeof crypto!=='undefined'&&typeof crypto.getRandomValues==='function')crypto.getRandomValues(bytes);
 else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
 return 'fixture-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
