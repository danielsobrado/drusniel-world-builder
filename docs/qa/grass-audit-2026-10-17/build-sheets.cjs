const sharp=require('sharp');
const dir='docs/qa/grass-audit-2026-10-17', tags=['eye','eye-rev','down','low','aerial'];
const names=['','Hot desert','Cold desert','Savanna','Grassland','Tropical seasonal forest','Temperate deciduous forest','Tropical rainforest','Temperate rainforest','Taiga','Tundra','Glacier','Wetland'];
const W=640,H=360;
const label=(t,w,h)=>Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000" opacity=".55"/><text x="8" y="${h-9}" font-family="Arial" font-size="20" fill="#fff">${t}</text></svg>`);
(async()=>{
 const rows=[];
 for(let b=1;b<=12;b++){
  const id='b'+String(b).padStart(2,'0'), comp=[];
  for(const [i,t] of tags.entries()){
   const img=await sharp(`${dir}/${id}-${t}.jpg`).resize(W,H).toBuffer();
   comp.push({input:img,left:(i%3)*W,top:Math.floor(i/3)*H},{input:label(`${id} ${names[b]} · ${t}`,W,30),left:(i%3)*W,top:Math.floor(i/3)*H+H-30});
  }
  await sharp({create:{width:3*W,height:2*H,channels:3,background:'#222'}}).composite(comp).jpeg({quality:80}).toFile(`tmp/grass-audit-2026-10-17/sheet-${id}.jpg`);
  rows.push(id);
 }
 // overall contact sheet: eye + low per biome, 4 columns
 const cw=400,ch=225,comp=[];let k=0;
 for(let b=1;b<=12;b++)for(const t of ['eye','low','down']){const id='b'+String(b).padStart(2,'0');
  comp.push({input:await sharp(`${dir}/${id}-${t}.jpg`).resize(cw,ch).toBuffer(),left:(k%6)*cw,top:Math.floor(k/6)*ch},{input:label(`${id} ${names[b]} · ${t}`.replace('Temperate','Temp.').replace('Tropical','Trop.'),cw,26),left:(k%6)*cw,top:Math.floor(k/6)*ch+ch-26});k++;}
 await sharp({create:{width:6*cw,height:Math.ceil(k/6)*ch,channels:3,background:'#222'}}).composite(comp).jpeg({quality:78}).toFile(`${dir}/contact-sheet.jpg`);
})();
