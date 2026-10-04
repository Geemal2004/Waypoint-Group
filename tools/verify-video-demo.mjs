import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import { fixture,digest,id,sql,quote as q,localGuard,clients,saveReport,privateDir } from './video-demo-lib.mjs';

localGuard();
const campaign=q(fixture.campaign);
const registry=JSON.parse(sql(`select json_build_object('digest',digest,'state',state,'snapshot',snapshot)::text from video_seed_campaigns where campaign=${campaign};`)||'null');
assert.ok(registry,'Seed the video campaign first.');assert.equal(registry.digest,digest);assert.equal(registry.state,'READY');
const report=registry.snapshot;
const members=JSON.parse(sql(`select json_agg(json_build_object('key',key,'type',entity_type,'id',entity_id))::text from video_seed_entities where campaign=${campaign};`));
assert.equal(members.filter(m=>m.type==='ORDER').length,37);
assert.equal(members.filter(m=>m.type==='DRAFT').length,6);
const c=await clients();
const visible=Object.fromEntries(await Promise.all(Object.entries(c).map(async([role,client])=>[role,await client.call('/orders')])));
for(const [key,,,target,day=fixture.day] of fixture.orders) {
  const order=visible.DISPATCHER.find(o=>o.id===id(key));assert.ok(order,key);
  const expected=['PENDING','CONFIRMED'].includes(target)?'RECEIVED':target;
  assert.equal(order.status,expected,`${key} baseline consumed/changed; reset explicitly before a fresh take.`);
  assert.equal(order.day,day);assert.equal(order.version,report.orders[key].version,`${key}: changed baseline version`);
  if(target==='PENDING') {assert.equal(order.confirmation_required,true);assert.equal(order.confirmed_at,null);}
  else if(target!=='CANCELLED') assert.ok(order.confirmed_at,key);
  assert.ok(visible.MANAGER.some(o=>o.id===order.id),`Manager cannot see ${key}`);
  if(order.run) for(const role of ['LOADER','DRIVER']) assert.ok(visible[role].some(o=>o.id===order.id),`${role} cannot see ${key}`);
  for(const line of order.lines) {
    if(line.loaded!=null) assert.ok(line.loaded>=0&&line.loaded<=line.ordered);
    if(line.delivered!=null) assert.ok(line.loaded!=null&&line.delivered>=0&&line.delivered<=line.loaded);
    if(line.received!=null) assert.ok(line.delivered!=null&&line.received>=0&&line.received<=line.delivered);
  }
  if(['DELIVERED','RECEIVED_AT_STORE'].includes(order.status)) {
    assert.ok(order.proof,key);assert.equal(Boolean(order.receipt),order.status==='RECEIVED_AT_STORE');
    const png=await c.MANAGER.call(`/orders/${order.id}/proof`,{raw:true});
    assert.ok(png.length>1000,`Non-displayable image: ${key}`);assert.equal(png.readUInt32BE(16),960);assert.equal(png.readUInt32BE(20),640);
  }
}
const replacement=visible.DISPATCHER.find(o=>o.id===report.orders.N01.id);
assert.equal(replacement.status,'RECEIVED');assert.equal(replacement.day,'2026-10-13');assert.ok(replacement.confirmed_at);
const deferred=visible.DISPATCHER.find(o=>o.id===id('A26'));
assert.equal(deferred.rescheduledTo.length,1);assert.equal(deferred.rescheduledTo[0].id,replacement.id);
assert.equal(deferred.deferrals.length,1);assert.ok(replacement.consecutive_skips>=1);
const shortage=visible.DISPATCHER.find(o=>o.id===id('A15'));
assert.equal(shortage.lines[0].loaded,1);assert.equal(shortage.lines[0].ordered,2);assert.equal(shortage.run.partial_approved_by,null);
const h02=visible.MANAGER.find(o=>o.id===id('H02'));
assert.equal(h02.lines[0].ordered,5);assert.equal(h02.lines[0].received,4);assert.equal(h02.receipt.issue,'');
for(const key of ['H03','H06','H09']) assert.ok(visible.MANAGER.find(o=>o.id===id(key)).receipt.issue);
const catalogue=await c.MANAGER.call('/catalog');
for(const [,outlet] of fixture.outlets) assert.ok(catalogue.outlets.some(o=>o.id===outlet),outlet);
assert.ok(!catalogue.outlets.some(o=>o.id==='DEMO-OUTSIDE'));
assert.ok(!visible.MANAGER.some(o=>o.outlet_id==='DEMO-OUTSIDE'));
const drafts=await c.MANAGER.call('/drafts');
for(const m of members.filter(m=>m.type==='DRAFT')) assert.ok(drafts.some(d=>d.id===m.id),m.key);
assert.equal(members.filter(m=>m.type==='DRAFT'&&drafts.some(d=>d.id===m.id)).length,6);
const context=await c.DISPATCHER.call(`/planning?day=${fixture.day}`);
assert.equal(context.trips.filter(t=>report.trips.some(r=>r.id===t.id)).length,5);
const tripIds=report.trips.filter(t=>t.day===fixture.day).map(t=>t.id);
assert.equal(Number(sql(`select count(*) from route_stops where route_trip_id in(${tripIds.map(q).join(',')});`)),16);
for(const trip of report.trips) {
  assert.equal(trip.validation.valid,true);const metrics=trip.validation.trips[0];
  assert.ok(metrics.distanceKm>0&&metrics.fuelL>0);assert.ok(metrics.geometry.coordinates.length>2);
  const orders=trip.keys.map(key=>visible.DISPATCHER.find(o=>o.id===id(key)));
  assert.deepEqual(orders.map(o=>o.run.stop_sequence),trip.keys.map((_,i)=>i+1));
  assert.deepEqual(orders.map(o=>o.run.loading_sequence),trip.keys.map((_,i)=>trip.keys.length-i));
  assert.ok(orders.every(o=>o.run.route_trip_id===trip.id));
  if(['P1','P2'].includes(trip.key)) {
    const row=fixture.trips.find(t=>t[0]===trip.key);
    const checked=await c.DISPATCHER.post('/planning/validate',{day:fixture.day,expectedPlanVersion:context.version,reason:'Local video preflight: revalidate untouched road-backed manifest.',
      trips:[{existingTripId:trip.id,vehicleId:row[1],trip:1,loaderId:'DEMO-LOADER',departureAt:`${fixture.day}T${row[2]}:00+05:30`,stops:orders.map(o=>({orderId:o.id,expectedVersion:o.version}))}],deferred:[]});
    assert.equal(checked.valid,true,JSON.stringify(checked.failures));
  }
}
for(const key of ['A15','A12','A26','H09']) assert.equal((await c.DISPATCHER.call(`/orders/${id(key)}/messages`)).length,2);
// Read-only structural checks, including quantity bounds and all required workflow evidence.
const counts=JSON.parse(sql(`select json_build_object(
 'orders',(select count(*) from orders where id in(select entity_id::uuid from video_seed_entities where campaign=${campaign} and entity_type='ORDER')),
 'sourceOrders',(select count(*) from orders where scenario='S1'),
 'legacyOrders',(select count(*) from orders where demo and schedule_reason like 'Synthetic judge scenario:%'),
 'history',(select count(*) from orders where id in(select entity_id::uuid from video_seed_entities where campaign=${campaign} and key like 'H%') and status='RECEIVED_AT_STORE'),
 'orphanStops',(select count(*) from route_stops s left join runs r on r.id=s.run_id left join orders o on o.id=s.order_id where r.id is null or o.id is null)
 )::text;`));
assert.equal(counts.orders,37);assert.equal(counts.sourceOrders,85);assert.equal(counts.legacyOrders,6);assert.equal(counts.history,9);assert.equal(counts.orphanStops,0);
report.preflight={passed:true,checkedAt:new Date().toISOString(),counts,personas:Object.fromEntries(Object.entries(visible).map(([role,orders])=>[role,orders.filter(o=>members.some(m=>m.type==='ORDER'&&m.id===o.id)).length])),
  browser:'Pending separate browser rehearsal',offline:'Pending separate offline rehearsal',physicalCameraGps:'Unverified'};
for(const [filename,field] of [['browser-verification.json','browser'],['rehearsal.json','offline']]) {
  const filenamePath=path.join(privateDir,filename);
  if(existsSync(filenamePath)) {
    const evidence=JSON.parse(readFileSync(filenamePath,'utf8'));
    if(evidence.digest===digest&&evidence.passed&&evidence[field]?.startsWith('Passed')) {
      report.preflight[field]=evidence[field];report.preflight[field+'EvidenceAt']=evidence.browserCheckedAt||evidence.checkedAt;
    }
  }
}
saveReport(report);
sql(`update video_seed_campaigns set snapshot=${q(JSON.stringify(report))}::jsonb where campaign=${campaign};`);
console.log('PASS: 37 campaign orders, 6 drafts, 5 active trips/16 stops, 9 receipts, source/legacy preservation, four-role scopes, road validation, shortages, issues, replacement lineage and displayable proof.');
