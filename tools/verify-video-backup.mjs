import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {docker,localGuard,dbContainer,sql,privateDir} from './video-demo-lib.mjs';
localGuard();
const directory=path.join(privateDir,'backups');
const meta=JSON.parse(readFileSync(path.join(directory,'latest.json'),'utf8'));
const resolved=path.resolve(meta.path);
assert.ok(resolved.startsWith(path.resolve(directory)+path.sep),'Backup must stay inside the private video backup directory.');
assert.equal(createHash('sha256').update(readFileSync(resolved)).digest('hex'),meta.sha256);
const database='waypoint_video_restore_verify',remote='/tmp/video-restore-verification.dump';
function run(args) {const r=docker(args);if(r.error)throw r.error;assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout.trim();}
const exists=run(['exec',dbContainer,'sh','-c',`psql -X -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from pg_database where datname='${database}'"`]);
assert.equal(exists,'0','Existing verification database retained; do not overwrite it.');
let created=false;
try {
  run(['cp',resolved,`${dbContainer}:${remote}`]);
  run(['exec',dbContainer,'sh','-c',`createdb -U "$POSTGRES_USER" -T template0 ${database}`]);created=true;
  run(['exec',dbContainer,'sh','-c',`pg_restore -U "$POSTGRES_USER" --no-owner --exit-on-error -d ${database} ${remote}`]);
  const counts=JSON.parse(run(['exec',dbContainer,'sh','-c',`psql -X -At -U "$POSTGRES_USER" -d ${database} -c "select json_build_object('orders',(select count(*) from orders),'proofs',(select count(*) from proofs),'campaignOrders',(select count(*) from video_seed_entities where entity_type='ORDER'),'sourceOrders',(select count(*) from orders where scenario='S1'),'trips',(select count(*) from route_trips))::text"`]));
  assert.equal(counts.orders,meta.counts.orders);assert.equal(counts.proofs,meta.counts.proofs);assert.equal(counts.campaignOrders,37);assert.equal(counts.sourceOrders,85);assert.equal(counts.trips,meta.counts.trips);
  writeFileSync(path.join(directory,'restore-verification.json'),JSON.stringify({...meta,verifiedAt:new Date().toISOString(),passed:true,counts},null,2)+'\n');
  console.log('PASS: backup restored into a disposable separate database; complete counts and source/campaign membership retained.');
} finally {
  if(created)run(['exec',dbContainer,'sh','-c',`dropdb -U "$POSTGRES_USER" ${database}`]);
  run(['exec',dbContainer,'rm','-f','--',remote]);
}
