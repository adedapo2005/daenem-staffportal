import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
// Exact downloaded originals are retained. WebP sizes are downsampled delivery variants, never claimed as new originals.
const researchRoot='/workspace/scratch/8f58e7080ff4/assets/global-4k';
const research=JSON.parse(fs.readFileSync(path.join(researchRoot,'manifest.json'),'utf8'));
const selection=[
 ['horizon','01-manhattan-day','candidate-manhattan-day.jpg'],
 ['editorial','03-shanghai-glass','03-shanghai-glass.jpg'],
 ['nightfall','05-singapore-blue-hour','05-singapore-blue-hour.jpg'],
 ['atrium','04-white-atrium','04-washington-atrium.jpg'],
 ['vertical','02-pudong-glass','candidate-pudong-glass.jpg'],
 ['panorama','06-mediterranean-blue','candidate-mediterranean-blue.jpg'],
 ['duet','07-hintersee-winter','07-hintersee-winter.jpg'],
 ['command','lagos-bridge-drive',null],
 ['gallery','08-moraine-lake','candidate-moraine.jpg'],
 ['focus','10-olympic-sunrise','10-olympic-sunrise.jpg'],
];
const out='public/assets/scenery';fs.mkdirSync(out,{recursive:true});
const assets=[];
for(const [theme,id,original] of selection){
 const source=original?path.join(researchRoot,'originals',original):'public/assets/nigeria/lagos-bridge-drive.jpg';
 const metadata=research.assets.find(a=>a.id===id)||{id,source_page_url:'https://unsplash.com/photos/ri22VY7Cm8U',image_url:'https://images.unsplash.com/photo-1696339058184-2e6d1da36ad3',credit:'Ben Iwara / Unsplash',license:'Unsplash License',location:'Lagos, Nigeria',crop_suggestion:'41% 46%; bridge pylons and sunset, not the foreground windscreen.',visual_suitability:'Native-resolution Nigerian infrastructure scene; used only for the dusk command composition.'};
 const [width,height]=execFileSync('identify',['-format','%w %h',source],{encoding:'utf8'}).split(' ').map(Number);if(width<3840||height<2160)throw Error(id+' fails native 4K');
 const target=path.join(out,id+'.jpg');fs.copyFileSync(source,target);
 const variants=[];
 for(const size of [640,1280,2560,3840]){const file=path.join(out,id+'-'+size+'.webp');execFileSync('convert',[source,'-auto-orient','-resize',size+'x>','-strip','-quality','86',file]);variants.push({width:size,path:'/assets/scenery/'+path.basename(file),bytes:fs.statSync(file).size})}
 const bytes=fs.readFileSync(target);assets.push({...metadata,theme,path:'/assets/scenery/'+id+'.jpg',native_dimensions:{width,height},byte_size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),license_url:research.license_url,original_unmodified:true,variants});
 console.log(theme+': '+width+' × '+height+' verified; delivery variants generated');
}
fs.mkdirSync('docs/v3',{recursive:true});fs.writeFileSync('docs/v3/image-assets.json',JSON.stringify({verifiedAt:new Date().toISOString(),policy:'Minimum native original 3840 × 2160; no upscaling; responsive delivery variants are downsampled; uploaded dashboard screenshots are not used as backgrounds.',selectionNote:'Nine international photographs plus one verified Lagos original; written requirements take priority over reference mockups.',assets,rejections:research.rejections},null,2));
