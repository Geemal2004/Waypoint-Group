// Local web fallback when Docker Desktop cannot register a newly started web port.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { root } from './video-demo-lib.mjs';
const dist=path.join(root,'apps/web/dist');
if(!existsSync(path.join(dist,'index.html'))) throw new Error('Run npm run build in apps/web before starting the video preview.');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')) {
    const upstream=http.request({hostname:'127.0.0.1',port:8181,path:req.url,method:req.method,headers:req.headers,agent:false},response=>{
      res.writeHead(response.statusCode,response.headers);response.pipe(res);
    });
    upstream.on('error',error=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain'});res.end('Local video backend unavailable');});
    res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});req.pipe(upstream);return;
  }
  let filename;
  try {filename=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}
  catch {res.writeHead(400);res.end();return;}
  if(filename!==dist&&!filename.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
  if(!existsSync(filename)||!statSync(filename).isFile())filename=path.join(dist,'index.html');
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});
  createReadStream(filename).pipe(res);
});
server.listen(8180,'127.0.0.1',()=>console.log('Local video preview: http://localhost:8180 → isolated backend :8181'));
