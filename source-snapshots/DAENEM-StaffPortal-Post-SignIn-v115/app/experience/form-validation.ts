export function validateFieldValue(kind:string,value:string,required:boolean,options?:string[]){
 if(required&&(!value.trim()||['checkbox','toggle'].includes(kind)&&value!=='Yes'))return 'Complete the required field.';
 if(!value)return '';
 if(['number','currency','percentage','range'].includes(kind)&&(!Number.isFinite(Number(value))||Number(value)<0||['percentage','range'].includes(kind)&&Number(value)>100))return 'Enter a valid value in range.';
 if(kind==='repeat-group'){try{const rows=JSON.parse(value);if(!Array.isArray(rows)||rows.length>20||(required&&!rows.length)||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!Object.keys(r).length||Object.keys(r).length>8||(options&&options.some(k=>typeof r[k]!=='string'||!r[k].trim()))||Object.values(r).some(v=>typeof v!=='string'||!v.trim())))return 'Complete each row and keep the group within 20 rows and eight columns.';}catch{return 'Enter a valid repeat group.'}}
 if(kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return 'Enter a valid email address.';
 if(kind==='date-range'){const[a,b]=value.split('|');if(!/^\d{4}-\d{2}-\d{2}$/.test(a||'')||!/^\d{4}-\d{2}-\d{2}$/.test(b||'')||a>b)return 'Choose both dates in chronological order.';}
 if(kind==='signature'&&!/^Acknowledged:\S[^·]* · \d{4}-/.test(value)&&!/^Drawn acknowledgement · \d{4}-.+ · data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value))return 'Enter your name or confirm a drawn acknowledgement.';
 if(kind==='upload'){try{const f=JSON.parse(value);if(!f.name||!['application/pdf','image/png','image/jpeg','text/plain'].includes(f.mime)||!f.data.startsWith('data:'+f.mime+';base64,')||f.size>2*1024*1024)return 'Choose a supported file up to 2 MB.';}catch{return 'Choose a valid attachment.'}}
 return '';
}
