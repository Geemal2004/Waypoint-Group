import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {docker,localGuard,dbContainer,sql,privateDir,fixture} from './video-demo-lib.mjs';
localGuard();
const target=path.join(privateDir,'backups');mkdirSync(target,{recursive:true});
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
const name=`video-start-${stamp}.dump`,remote='/tmp/'+name,local=path.join(target,name);
for(const args of [
  ['exec',dbContainer,'sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$1"','video-backup',remote],
  ['cp',`${dbContainer}:${remote}`,local],
  ['exec',dbContainer,'rm','--',remote]
]) {const r=docker(args);if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);}
const sha256=createHash('sha256').update(readFileSync(local)).digest('hex');
const counts=JSON.parse(sql("select json_build_object('orders',(select count(*) from orders),'proofs',(select count(*) from proofs),'trips',(select count(*) from route_trips))::text;"));
writeFileSync(path.join(target,'latest.json'),JSON.stringify({campaign:fixture.campaign,path:local,sha256,counts,createdAt:new Date().toISOString()},null,2)+'\n');
console.log(`Backed up the complete selected database: ${local}\nSHA256 ${sha256}`);
