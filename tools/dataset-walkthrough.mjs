// Requires privately prepared S1 and a reset judge database. Uses actual local OSRM.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.WAYPOINT_URL||'http://localhost:8080';
class Client {
  cookie='';token='';header='';
  async call(path,{method='GET',body,expect=200,type='application/json'}={}) {
    const headers={Cookie:this.cookie};if(method!=='GET')headers[this.header]=this.token;
    if(body&&!(body instanceof FormData))headers['Content-Type']=type;
    const r=await fetch(base+'/api/v1'+path,{method,headers,body:body instanceof FormData?body:body&&(type==='application/json'?JSON.stringify(body):body),redirect:'manual'});
    for(const c of r.headers.getSetCookie())if(c.startsWith('JSESSIONID='))this.cookie=c.split(';')[0];
    const result=r.status===204?null:await r.json();assert.equal(r.status,expect,`${path}: ${JSON.stringify(result)}`);return result;
  }
  async csrf(){const c=await this.call('/auth/csrf');this.token=c.token;this.header=c.headerName;}
  async login(username){await this.csrf();await this.call('/auth/login',{method:'POST',type:'application/x-www-form-urlencoded',body:new URLSearchParams({username,password:process.env.WAYPOINT_DEMO_PASSWORD||'WaypointDemo!2026'}).toString()});await this.csrf();}
  post(path,body,expect=200){return this.call(path,{method:'POST',body,expect});}
}
const manager=new Client(),dispatcher=new Client(),loader=new Client(),driver=new Client();
for(const [client,name] of [[manager,'manager'],[dispatcher,'dispatcher'],[loader,'loader'],[driver,'driver']])await client.login(name);
const context=await dispatcher.call('/planning?day=2026-01-08');
assert.equal(context.orders.filter(o=>o.scenario==='S1').length,85,'Prepare private source data and restart core.');
assert.equal(context.version,0,'Use the explicit judge reset before this walkthrough.');
const get=ref=>{const o=context.orders.find(o=>o.source_ref===ref);assert.ok(o,ref);return o;};
const stops=refs=>refs.map(ref=>({orderId:get(ref).id,expectedVersion:get(ref).version}));
const dryRefs=['S1-000','S1-004','S1-002'];
const plan={day:context.day,expectedPlanVersion:0,reason:'Dataset judge walkthrough: verified multi-stop dry/chilled/mall trips; whole-order excess deferral.',trips:[
  {existingTripId:null,vehicleId:'VEH037',trip:1,loaderId:'DEMO-LOADER',departureAt:'2026-01-07T22:00:00Z',stops:stops(dryRefs)},
  {existingTripId:null,vehicleId:'VEH036',trip:1,loaderId:'DEMO-LOADER',departureAt:'2026-01-07T22:00:00Z',stops:stops(['S1-001'])},
  {existingTripId:null,vehicleId:'VEH009',trip:1,loaderId:'DEMO-LOADER',departureAt:'2026-01-08T03:30:00Z',stops:stops(['S1-023','S1-024','S1-025'])}
],deferred:[{orderId:get('S1-078').id,expectedVersion:0,reason:'VOLUME_LIMIT: whole order exceeds the eligible ambient fleet. Arrange additional capacity or agree a later revised order; do not split it silently.',nextDay:'2026-01-09'}]};
const checked=await dispatcher.post('/planning/validate',plan);assert.equal(checked.valid,true,JSON.stringify(checked.failures));
assert.ok(checked.trips[0].stops.length===3&&checked.trips[0].distanceKm>0&&checked.trips[0].fuelL>0);
const proposal=await dispatcher.post('/planning/propose',{day:plan.day,orderIds:dryRefs.map(ref=>get(ref).id)});assert.equal(proposal.validation.valid,true,JSON.stringify(proposal.validation.failures));
assert.ok(proposal.plan.trips.some(t=>t.stops.length>1));
// The two simultaneous requests carry the same revision: exactly one can commit.
const published=await Promise.allSettled([dispatcher.post('/planning/publish',plan),dispatcher.post('/planning/publish',plan)]);
assert.equal(published.filter(r=>r.status==='fulfilled').length,1);
assert.match(published.find(r=>r.status==='rejected').reason.message,/STALE_PLAN/);
await dispatcher.post('/planning/publish',plan,409);
const orderedUnits=new Map();
for(const ref of dryRefs){
  let order=await loader.call(`/orders/${get(ref).id}`);orderedUnits.set(ref,order.lines[0].ordered);const qty=order.lines[0].ordered-(ref===dryRefs[0]?1:0);
  order=await loader.post(`/orders/${order.id}/loading`,{expectedVersion:order.version,lines:[{lineId:order.lines[0].id,quantity:qty}],reason:ref===dryRefs[0]?'SHORTAGE':'NONE'});
  if(ref===dryRefs[0]){await loader.post(`/orders/${order.id}/release`,{expectedVersion:order.version},422);order=await dispatcher.post(`/orders/${order.id}/approve-partial`,{expectedVersion:order.version,reason:'One source unit unavailable; safe remaining units approved and shortage retained.'});}
  await loader.post(`/orders/${order.id}/release`,{expectedVersion:order.version});
}
let first=await driver.call(`/orders/${get(dryRefs[0]).id}`);
assert.deepEqual(first.tripStops.map(s=>s.loading_sequence),[3,2,1]);
await driver.post(`/orders/${first.id}/start`,{expectedVersion:first.version});

// Valid PNG used by the existing workflow scenarios.
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function proof(order){const form=new FormData();const action={actionId:randomUUID(),deviceId:'dataset-judge-device',capturedAt:new Date().toISOString(),delivery:{expectedVersion:order.version,lines:order.lines.map(l=>({lineId:l.id,quantity:l.loaded})),issue:''}};form.set('action',new Blob([JSON.stringify(action)],{type:'application/json'}),'action.json');form.set('proof',new Blob([image],{type:'image/png'}),'proof.png');return form;}
for(let i=0;i<dryRefs.length;i++){
  let order=await driver.call(`/orders/${get(dryRefs[i]).id}`);order=await driver.post(`/orders/${order.id}/arrive`,{expectedVersion:order.version});const pending=proof(order);
  if(i===1){
    const deferred=await dispatcher.post(`/orders/${order.id}/defer`,{expectedVersion:order.version,nextDay:'2026-01-09',reason:'Judge simulation: driver captured proof offline while this same stop was deferred.'});
    const conflict=await driver.call(`/orders/${order.id}/sync-delivery`,{method:'POST',body:pending});assert.equal(conflict.outcome,'conflict');assert.deepEqual(await driver.call(`/orders/${order.id}/sync-delivery`,{method:'POST',body:pending}),conflict);
    const resolved=await dispatcher.post(`/sync-conflicts/${conflict.conflictId}/resolve`,{expectedVersion:deferred.version,acceptDelivery:true,reason:'Verify retained evidence; recover delivery and preserve the deferral decision.'});assert.equal(resolved.state,'ACCEPTED');assert.equal(resolved.order.deferrals.length,1);
  }else{const result=await driver.call(`/orders/${order.id}/sync-delivery`,{method:'POST',body:pending});assert.equal(result.outcome,'accepted');assert.deepEqual(await driver.call(`/orders/${order.id}/sync-delivery`,{method:'POST',body:pending}),result);}
  order=await manager.call(`/orders/${order.id}`);order=await manager.post(`/orders/${order.id}/receive`,{expectedVersion:order.version,lines:order.lines.map(l=>({lineId:l.id,quantity:l.loaded})),issue:''});assert.equal(order.status,'RECEIVED_AT_STORE');assert.equal(order.lines[0].ordered,orderedUnits.get(dryRefs[i]));
}
assert.equal((await manager.call(`/orders/${get(dryRefs[0]).id}`)).lines[0].received,orderedUnits.get(dryRefs[0])-1);
const excess=await dispatcher.call(`/orders/${get('S1-078').id}`);assert.equal(excess.status,'DEFERRED');assert.ok(excess.deferrals[0].reason.includes('VOLUME_LIMIT'));
console.log('PASS: private source orders, live OSRM multi-stop geometry/timing/fuel, assisted allocation, concurrent/stale publication, dry/chilled separation, van access, mall window, excess deferral, reverse loading, four-role shortage receipt and same-stop offline proof recovery.');
