import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import base from '../vite.config.js';
import {compileYamlModule} from './compiled-yaml-plugin.mjs';

// QA-only immutable source/atlas snapshot. Never changes the shared checkout.
const root=process.cwd(),revision=execFileSync('git',['rev-parse',process.argv[2]??'HEAD'],{encoding:'utf8'}).trim();
const port=Number(process.argv[3]??5176);
const archive=execFileSync('git',['archive','--format=tar',revision,'src','config','scripts','editor.config.yaml','index.html','package.json','package-lock.json','public/assets/impostors/trees'],{maxBuffer:192*1024*1024});
const files=new Map(),fileHashes={},digest=createHash('sha256');let paxPath=null;
const normalize=file=>path.resolve(file).replaceAll('\\','/');
for(let offset=0;offset+512<=archive.length;) {
 const header=archive.subarray(offset,offset+512),string=(start,end)=>header.subarray(start,end).toString().replace(/\0.*$/s,'');
 const size=parseInt(string(124,136).trim()||'0',8),type=string(156,157),prefix=string(345,500);
 const filename=paxPath??(prefix?`${prefix}/`:'')+string(0,100),bytes=archive.subarray(offset+512,offset+512+size);
 offset+=512+Math.ceil(size/512)*512;
 if(type==='x'||type==='g'){paxPath=bytes.toString().match(/\d+ path=([^\n]+)/)?.[1]??null;continue;}
 paxPath=null;if(type==='5'||!filename)continue;
 files.set(normalize(filename),bytes);fileHashes[filename]=createHash('sha256').update(bytes).digest('hex');digest.update(filename).update(bytes);
}
const manifest={schemaVersion:1,frozen:true,sourceSha:revision,sha256:digest.digest('hex'),files:fileHashes,capturedAt:new Date().toISOString()};
const mime=file=>file.endsWith('.png')?'image/png':file.endsWith('.json')?'application/json':file.endsWith('.ktx2')?'image/ktx2':'application/octet-stream';
const snapshot={name:'immutable-world-visual-snapshot',enforce:'pre',
 load(id) {
  const [filename,query='']=id.split('?'),bytes=files.get(normalize(filename));if(!bytes)return null;
  const source=bytes.toString();
  if(query.includes('compiled')&&filename.endsWith('.yaml'))return compileYamlModule(source,filename);
  if(query.includes('raw'))return `export default ${JSON.stringify(source)};`;
  if(query.includes('url'))return null;
  return /\.(js|mjs|ts|json|css)$/.test(filename)?source:null;
 },
 transformIndexHtml:{order:'pre',handler:(html,ctx)=>files.get(normalize(ctx.filename))?.toString()??html},
 configureServer(server) {
  server.middlewares.use((req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/__worldVisualSource'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest));return;}
   if(url.pathname.startsWith('/assets/impostors/trees/')) {
    const file=`public${decodeURIComponent(url.pathname)}`,bytes=files.get(normalize(file));
    if(!bytes){res.statusCode=404;res.end('Atlas missing from frozen revision');return;}
    res.setHeader('Content-Type',mime(file));res.end(bytes);return;
   }
   next();
  });
 },
};
const server=await createServer({...base,configFile:false,root,cacheDir:`tmp/world-visual-quality/vite-${revision.slice(0,8)}-${port}`,
 plugins:[snapshot,...base.plugins],server:{host:'0.0.0.0',port,strictPort:true,hmr:false,watch:{ignored:['**/*']}}});
await server.listen();console.log(JSON.stringify({sourceSha:revision,sha256:manifest.sha256,files:files.size,port}));server.printUrls();
