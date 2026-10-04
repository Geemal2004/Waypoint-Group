import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const fixture = JSON.parse(readFileSync(path.join(root, 'seed/video-campaign.json'), 'utf8'));
export const digest = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
export const project = process.env.VIDEO_PROJECT || 'waypoint';
assert.ok(['waypoint','waypoint-video','waypoint-judge'].includes(project), 'Choose an existing Waypoint Compose project.');
export const cloud = project === 'waypoint-judge';
assert.ok(!cloud || process.env.VIDEO_DEPLOYMENT === '18.138.29.235', 'Cloud campaign requires the explicit existing deployment address.');
assert.ok(!cloud || !process.argv.includes('--reset'), 'Cloud reset is disabled; preserve hosted operational history.');
export const dbContainer = `${project}-db-1`;
export const base = cloud ? 'https://18-138-29-235.sslip.io' : project === 'waypoint' ? 'http://localhost:8080' : 'http://localhost:8180';
export const routingBase = project === 'waypoint' ? 'http://localhost:5000' : 'http://localhost:5100';
export const compose = ['compose', '-p', project, '-f', 'compose.yaml', ...(project === 'waypoint-video' ? ['-f','compose.video.yaml'] : [])];
export const privateDir = path.join(root, 'data/private', cloud ? 'video-demo-cloud' : project === 'waypoint' ? 'video-demo-local' : 'video-demo');
export const quote = value => `'${String(value).replaceAll("'", "''")}'`;
let directEngine=process.env.VIDEO_DOCKER_DIRECT==='1';
let engineSelected=directEngine;
export function docker(args, options={}) {
  if (cloud) {
    assert.equal(args[0], 'exec', 'Cloud transport only supports container exec; use deployment backups for hosted data.');
    const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
    return spawnSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',
      path.join(process.env.USERPROFILE,'Downloads/waypoint-key.pem'),'ubuntu@18.138.29.235',
      'docker '+args.map(shellQuote).join(' ')], {cwd:root,encoding:'utf8',timeout:90000,...options});
  }
  if(!engineSelected) {
    // Probe read-only first; never replay a timed-out mutation against a second connection.
    const probe=spawnSync('docker',['version','--format','{{.Server.Version}}'],{cwd:root,encoding:'utf8',timeout:5000});
    directEngine=probe.error?.code==='ETIMEDOUT';engineSelected=true;
    if(directEngine)console.log('Docker Desktop proxy stalled; using bundled Docker CLI on the direct local WSL engine socket.');
  }
  if(!directEngine)return spawnSync('docker',args,{cwd:root,encoding:'utf8',timeout:90000,...options});
  // Docker's own CLI and engine socket; fixed WSL distribution, no daemon restart.
  const script='/mnt/host/'+root[0].toLowerCase()+root.slice(2).replaceAll('\\','/')+'tools/video-docker.sh';
  const linuxArgs=args[0]==='cp'?args.map(arg=>/^[a-z]:[\\/]/i.test(arg)?'/mnt/host/'+arg[0].toLowerCase()+arg.slice(2).replaceAll('\\','/'):arg):args;
  return spawnSync('wsl.exe',['-d','docker-desktop','--exec','sh',script,...linuxArgs],
    {cwd:root,encoding:'utf8',timeout:90000,...options});
}
export async function nearest(longitude,latitude) {
  if (!cloud) {
    const response=await fetch(`${routingBase}/nearest/v1/driving/${longitude},${latitude}?number=1`,{signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);return response.json();
  }
  const url=`http://osrm:5000/nearest/v1/driving/${Number(longitude)},${Number(latitude)}?number=1`;
  const r=docker(['exec','waypoint-judge-planning-1','python','-c',
    'import urllib.request,sys; print(urllib.request.urlopen(sys.argv[1],timeout=15).read().decode())',url]);
  if(r.error)throw r.error;assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
export const id = key => {
  const b = createHash('sha256').update(`${fixture.campaign}:${key}`).digest().subarray(0,16);
  b[6] = (b[6] & 15) | 0x50; b[8] = (b[8] & 63) | 0x80;
  const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
export function sql(statement) {
  // Fixed local project, no shell interpolation; credentials stay in container environment.
  const r = docker(['exec', '-i', dbContainer, 'sh', '-c',
    'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],
    { cwd: root, input: statement, encoding: 'utf8', timeout: 90000, maxBuffer: 8*1024*1024 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}
export function localGuard() {
  const r = docker(['exec', `${project}-core-1`, 'printenv', 'DEMO_SEED'],
    { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'true', 'Video fixtures require a demo-seeded local stack.');
  assert.match(sql('select current_database();'), /^waypoint$/);
}
export const reportPath = path.join(privateDir, 'report.json');
export function saveReport(report) {
  mkdirSync(privateDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2)+'\n');
}
export class Client {
  constructor(role) { this.role = role; this.cookie = ''; }
  async call(endpoint, {method='GET', body, expect=200, raw=false}={}) {
    const headers = { Cookie: this.cookie };
    if (method !== 'GET') headers[this.header] = this.token;
    if (body && !(body instanceof FormData)) headers['Content-Type']='application/json';
    const response = await fetch(base+'/api/v1'+endpoint, {
      method, headers, body: body instanceof FormData ? body : body && JSON.stringify(body),
      redirect: 'manual', signal: AbortSignal.timeout(90000)
    });
    for (const cookie of response.headers.getSetCookie()) if(cookie.startsWith('JSESSIONID=')) this.cookie=cookie.split(';')[0];
    const value = raw ? Buffer.from(await response.arrayBuffer()) : response.status===204 ? null : await response.json();
    assert.equal(response.status, expect, `${this.role} ${endpoint}: ${raw ? response.status : JSON.stringify(value)}`);
    return value;
  }
  async login() {
    const csrf = async () => { const c = await this.call('/auth/csrf'); this.token=c.token; this.header=c.headerName; };
    await csrf(); await this.post('/auth/demo-login', {role:this.role}); await csrf();
    return this;
  }
  post(endpoint, body, expect=200) { return this.call(endpoint, {method:'POST',body,expect}); }
}
export async function clients() {
  const roles = ['MANAGER','DISPATCHER','LOADER','DRIVER'];
  const result = await Promise.all(roles.map(role => new Client(role).login()));
  return Object.fromEntries(roles.map((role,i) => [role,result[i]]));
}
export const detail = (client,key) => client.call(`/orders/${id(key)}`);
export async function command(client, key, operation, extra={}) {
  const o=await detail(client,key);
  return client.post(`/orders/${o.id}/commands`, {
    commandId:randomUUID(), expectedVersion:o.version, operation,
    reason:`Staged video baseline: ${operation.toLowerCase()} ${key}.`, ...extra
  });
}
export async function versionAction(client,key,action,extra={}) {
  const o=await detail(client,key);
  return client.post(`/orders/${o.id}/${action}`,{expectedVersion:o.version,...extra});
}
export async function deliver(client,key,image) {
  const o=await detail(client,key);
  const form=new FormData();
  form.set('action',new Blob([JSON.stringify({actionId:randomUUID(),deviceId:'video-baseline-fixture',capturedAt:new Date().toISOString(),
    delivery:{expectedVersion:o.version,lines:o.lines.map(l=>({lineId:l.id,quantity:l.loaded})),issue:''}})],{type:'application/json'}),'action.json');
  form.set('proof',new Blob([image],{type:'image/png'}),'staged-packaging.png');
  const result=await client.post(`/orders/${o.id}/sync-delivery`,form);
  assert.equal(result.outcome,'accepted');
  return result;
}
export function member(key, type, entityId) {
  sql(`insert into video_seed_entities(campaign,key,entity_type,entity_id) values(${quote(fixture.campaign)},${quote(key)},${quote(type)},${quote(entityId)});`);
}
export async function planTrip(dispatcher, row) {
  const [key,vehicle,time,keys,day=fixture.day]=row;
  const context=await dispatcher.call(`/planning?day=${day}`);
  const orders=await Promise.all(keys.map(key=>detail(dispatcher,key)));
  const plan={day,expectedPlanVersion:context.version,reason:`Staged video baseline: ${key}; supplemental stores, actual OSRM road validation.`,
    trips:[{existingTripId:null,vehicleId:vehicle,trip:1,loaderId:'DEMO-LOADER',departureAt:`${day}T${time}:00+05:30`,
      stops:orders.map(o=>({orderId:o.id,expectedVersion:o.version}))}],deferred:[]};
  const checked=await dispatcher.post('/planning/validate',plan);
  assert.equal(checked.valid,true,`${key}: ${JSON.stringify(checked.failures)}`);
  await dispatcher.post('/planning/publish',plan);
  const o=await detail(dispatcher,keys[0]);
  return {key,id:o.run.route_trip_id,day,vehicle,keys,validation:checked};
}
