// Additive campaign seed; existing source and unrelated operational data remain intact.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fixture, digest, root, privateDir, base, nearest, quote as q, id, sql, localGuard, clients,
  detail, command, versionAction, deliver, member, planTrip, saveReport } from './video-demo-lib.mjs';

const provenance='SUPPLEMENTAL VIDEO DEMO: staged outlet road waypoint; not verified source geography';
const outletIds=Object.fromEntries(fixture.outlets.map(([key,identity])=>[key,identity]));
const campaign=q(fixture.campaign);
localGuard();
sql(`create table if not exists video_seed_campaigns (
 campaign varchar(80) primary key, day date not null, digest varchar(64) not null,
 state varchar(20) not null, snapshot jsonb, created_at timestamptz not null default now());
create table if not exists video_seed_entities (
 campaign varchar(80) references video_seed_campaigns(campaign), key varchar(32),
 entity_type varchar(16) not null, entity_id varchar(80) not null,
 primary key(campaign,key), unique(campaign,entity_type,entity_id));`);

if(process.argv.includes('--reset')) {
  // Refuse mixed manifests: resetting a campaign must not alter somebody else's assignment.
  sql(`begin;
  select pg_advisory_xact_lock(73429015);
  create temp table video_orders on commit drop as
    with recursive initial as (
      select entity_id::uuid id from video_seed_entities where campaign=${campaign} and entity_type='ORDER'
      union select d.submitted_order_id from order_drafts d join video_seed_entities e on e.entity_type='DRAFT' and e.entity_id=d.id::text
        where e.campaign=${campaign} and d.submitted_order_id is not null
    ), owned(id) as (
      select id from initial union select o.id from orders o join owned parent on o.rescheduled_from=parent.id
    ) select id from owned;
  create temp table video_trips on commit drop as select distinct route_trip_id id from runs where order_id in(select id from video_orders) and route_trip_id is not null;
  do $$ begin if exists(select 1 from route_stops s where s.route_trip_id in(select id from video_trips) and s.order_id not in(select id from video_orders)) then raise exception 'Mixed campaign manifest: reset refused'; end if; end $$;
  delete from issue_messages where order_id in(select id from video_orders);
  delete from order_commands where order_id in(select id from video_orders);
  delete from order_drafts where submitted_order_id in(select id from video_orders) or id in(select entity_id::uuid from video_seed_entities where campaign=${campaign} and entity_type='DRAFT');
  delete from route_stops where order_id in(select id from video_orders);
  delete from sync_conflicts where order_id in(select id from video_orders);
  delete from processed_sync_actions where order_id in(select id from video_orders);
  delete from audit_events where order_id in(select id from video_orders);
  delete from receipts where order_id in(select id from video_orders);
  delete from proofs where order_id in(select id from video_orders);
  delete from loading_issues where run_id in(select id from runs where order_id in(select id from video_orders));
  delete from deferrals where order_id in(select id from video_orders);
  delete from runs where order_id in(select id from video_orders);
  delete from route_trips where id in(select id from video_trips);
  delete from plan_revisions p where not exists(select 1 from route_trips t where t.plan_id=p.id)
    and exists(select 1 from jsonb_path_query(p.request,'$.trips[*].stops[*].orderId') j where (j #>> '{}')::uuid in(select id from video_orders))
    and not exists(select 1 from jsonb_path_query(p.request,'$.trips[*].stops[*].orderId') j where (j #>> '{}')::uuid not in(select id from video_orders));
  delete from planning_days d where not exists(select 1 from plan_revisions p where p.depot_code=d.depot_code and p.day=d.day);
  delete from order_lines where order_id in(select id from video_orders);
  delete from orders where id in(select id from video_orders);
  delete from video_seed_entities where campaign=${campaign};
  delete from video_seed_campaigns where campaign=${campaign};
  commit;`);
  console.log('Reset only registered video campaign orders/drafts; source, legacy and unrelated demand retained.');
}
const existing=sql(`select coalesce(json_build_object('state',state,'digest',digest,'snapshotReady',snapshot->>'state'='READY')::text,'') from video_seed_campaigns where campaign=${campaign};`);
if(existing) {
  const row=JSON.parse(existing); assert.equal(row.digest,digest,'Fixture changed; use an explicit campaign reset.');
  if(row.state==='FAILED'&&row.snapshotReady) {
    sql(`update video_seed_campaigns set state='READY' where campaign=${campaign};`);
    row.state='READY';
    console.log('Workflow preparation completed previously; retrying its interrupted preflight without replaying actions.');
  }
  assert.equal(row.state,'READY','Incomplete seed: inspect failure and use the explicit campaign reset.');
  await import('./verify-video-demo.mjs');
  console.log('Existing baseline verified; nothing reseeded or rewound.');
} else {
  const report={campaign:fixture.campaign,digest,day:fixture.day,url:base,state:'PREPARING',trips:[],orders:{},drafts:{}};
  try {
    const points=[];
    for(const row of fixture.outlets) {
      const data=await nearest(row[8],row[9]); assert.equal(data.code,'Ok');
      points.push([row[1],...data.waypoints[0].location]);
    }
    // Fixture-only demand insertion handles baseline history without weakening the product date cutoff.
    // No workflow status, route, approval, receipt or proof is fabricated here.
    const statements=[`begin; select pg_advisory_xact_lock(73429015);
      insert into video_seed_campaigns(campaign,day,digest,state) values(${campaign},${q(fixture.day)},${q(digest)},'PREPARING');`];
    for(const [key,identity,name,brand,access,open,close,dock] of fixture.outlets) {
      statements.push(`insert into outlets(id,name,brand_code,depot_code,district,access,window_start,window_end,demo,dock_type,record_provenance)
      values(${q(identity)},${q(name)},${q(brand)},'PELIYAGODA','Colombo',${q(access)},${q(open)},${q(close)},true,${q(dock)},${q(provenance)})
      on conflict(id) do nothing;
      insert into account_outlets values('DEMO-MANAGER',${q(identity)}) on conflict do nothing;`);
    }
    for(const [identity,lon,lat] of points) statements.push(`insert into routing_points(point_id,longitude,latitude,provenance,supplemental)
      values(${q(identity)},${lon},${lat},${q(provenance)},true) on conflict(point_id) do nothing;`);
    for(const identity of ['VIDEO-DRY-1','VIDEO-DRY-2']) statements.push(`insert into vehicles(id,name,depot_code,kind,refrigerated,weight_kg,volume_m3,weekly_fuel_l,driver_id,available,demo,km_per_l,fuel_type,record_provenance)
      values(${q(identity)},${q(identity==='VIDEO-DRY-1'?'Demo Tech dry truck':'Demo Fresh journey truck')},'PELIYAGODA','TRUCK',false,1000,8,120,'DEMO-DRIVER',true,true,6,'diesel',${q(provenance)}) on conflict(id) do nothing;`);
    for(const [identity,source,name] of [['VIDEO-MAIN-DRY','DEMO-DRY','Video main dry truck'],['VIDEO-STYLE-VAN','DEMO-VAN','Video Style van'],['VIDEO-FRESH-COLD','DEMO-COLD','Video Fresh chilled truck']]) statements.push(`insert into vehicles(id,name,depot_code,kind,refrigerated,weight_kg,volume_m3,weekly_fuel_l,driver_id,available,demo,km_per_l,fuel_type,record_provenance)
      select ${q(identity)},${q(name)},depot_code,kind,refrigerated,weight_kg,volume_m3,weekly_fuel_l,driver_id,true,true,6,'diesel',${q(provenance)} from vehicles where id=${q(source)} on conflict(id) do nothing;`);
    statements.push(`update vehicles set min_c=2,max_c=5 where id='VIDEO-FRESH-COLD' and demo;`);
    for(const [key,outlet,items,,day=fixture.day] of fixture.orders) {
      const temperature=items[0][0]==='DEMO-MILK'?'CHILLED':items[0][0]==='DEMO-FROZEN'?'FROZEN':'AMBIENT';
      statements.push(`insert into orders(id,outlet_id,created_by,day,temperature,status,demo,schedule_reason,confirmation_required)
        values(${q(id(key))},${q(outletIds[outlet])},'DEMO-MANAGER',${q(day)},${q(temperature)},'RECEIVED',true,${q(`Staged video baseline ${key}; supplemental retail demand, not source S1.`)},true);
        insert into video_seed_entities values(${campaign},${q(key)},'ORDER',${q(id(key))});
        insert into audit_events(account_id,order_id,event,details) values('DEMO-MANAGER',${q(id(key))},'VIDEO_BASELINE_DEMAND',${q(`Staged campaign ${fixture.campaign} / ${key}; operating date is distinct from actual seed timestamps.`)});`);
      for(const [product,quantity] of items) statements.push(`insert into order_lines(id,order_id,product_id,ordered) values(${q(id(key+':'+product))},${q(id(key))},${q(product)},${quantity});`);
    }
    statements.push('commit;'); sql(statements.join('\n'));
    console.log('Created 36 registered baseline demands and supplemental road points in the selected database.');
    const c=await clients(), dispatch=c.DISPATCHER, loader=c.LOADER, driver=c.DRIVER, manager=c.MANAGER;
    for(const [key,,,state] of fixture.orders) if(!['PENDING','CANCELLED'].includes(state)) await command(dispatch,key,'CONFIRM');
    await command(manager,'A27','CANCEL');
    for(const trip of fixture.trips) {report.trips.push(await planTrip(dispatch,trip));console.log(`Validated and published ${trip[0]}.`);}

    mkdirSync(privateDir,{recursive:true});
    const require=createRequire(path.join(root,'apps/web/package.json'));
    const { chromium }=require('@playwright/test');
    const browser=await chromium.launch({headless:true});
    try {
      const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1});
      await page.setContent(`<html><body style="margin:0;background:#edf3ef;font:24px Arial;color:#163c2f;padding:45px;box-sizing:border-box">
        <div style="font-size:18px;letter-spacing:3px">WAYPOINT · STAGED DEMO EVIDENCE</div>
        <h1>Packaging &amp; quantity check</h1><div style="display:flex;gap:28px;margin:50px 0">
        ${[1,2,3].map(n=>`<div style="background:#cda572;border:5px solid #997448;width:210px;height:170px;position:relative"><div style="height:35px;background:#b9905f;border-bottom:3px solid #997448"></div><div style="background:white;margin:25px;padding:10px;font-size:19px">SAMPLE CARTON ${n}<br>KEEP UPRIGHT ↑</div></div>`).join('')}</div>
        <p>Illustrative packing fixture · synthetic judge order</p><p style="font-size:18px">Seed-time preview asset. This is not a customer delivery photograph.</p></body></html>`);
      await page.screenshot({path:path.join(privateDir,'staged-packaging.png')});
    } finally {await browser.close();}
    const image=readFileSync(path.join(privateDir,'staged-packaging.png'));
    const load=async(key,shortage=false,release=true)=>{
      const o=await detail(loader,key);
      await versionAction(loader,key,'loading',{lines:o.lines.map((l,i)=>({lineId:l.id,quantity:l.ordered-(shortage&&i===0?1:0)})),reason:shortage?'SHORTAGE':'NONE'});
      if(shortage&&release) await versionAction(dispatch,key,'approve-partial',{reason:'Staged demo: one unit unavailable; approve safe reduced load and retain shortage.'});
      if(release) await versionAction(loader,key,'release');
    };
    for(const key of ['A17','A16','A15']) await load(key,key==='A15',false);
    for(const trip of fixture.trips.filter(t=>t[0]==='P4'||t[0]==='P5'||t[0].startsWith('H-'))) {
      for(const key of [...trip[3]].reverse()) {
        const row=fixture.orders.find(o=>o[0]===key);
        await load(key,row[5]==='SHORTAGE');
      }
      if(trip[0]==='P4') continue;
      await versionAction(driver,trip[3][0],'start');
      for(const key of trip[3]) {
        const row=fixture.orders.find(o=>o[0]===key);
        if(key==='A21') break;
        await versionAction(driver,key,'arrive');
        if(key==='A22') break;
        await deliver(driver,key,image);
        if(row[3]==='RECEIVED_AT_STORE') {
          const o=await detail(manager,key),discrepancy=row[5]==='RECEIPT_ISSUE';
          await versionAction(manager,key,'receive',{lines:o.lines.map((l,i)=>({lineId:l.id,quantity:l.delivered-(discrepancy&&i===0?1:0)})),
            issue:discrepancy?'Staged receiving discrepancy: one unit declined after damaged packaging inspection.':''});
        }
      }
    }
    // Record the actual rejected plan as evidence before creating the whole-order deferral.
    const context=await dispatch.call(`/planning?day=${fixture.day}`);
    for(const [key,vehicle] of [['A08','VIDEO-STYLE-VAN'],['A25','VIDEO-MAIN-DRY']]) {
      const o=await detail(dispatch,key);
      const checked=await dispatch.post('/planning/validate',{day:fixture.day,expectedPlanVersion:context.version,reason:`Staged invalid capacity example ${key}.`,trips:[{
        existingTripId:null,vehicleId:vehicle,trip:2,loaderId:'DEMO-LOADER',departureAt:`${fixture.day}T${key==='A08'?'09:30':'05:00'}:00+05:30`,stops:[{orderId:o.id,expectedVersion:o.version}]}],deferred:[]});
      assert.equal(checked.valid,false);assert.ok(checked.failures.some(f=>f.code==='VOLUME_LIMIT'));
      report[key+'Failures']=checked.failures;
    }
    await versionAction(dispatch,'A25','defer',{nextDay:'2026-10-13',reason:'VOLUME_LIMIT / WEIGHT_LIMIT: 20,000 kg and 40 m³ exceeds the eligible demo fleet. Whole order deferred; arrange additional capacity.'});
    await versionAction(dispatch,'A26','defer',{nextDay:'2026-10-13',reason:'Staged receiving closure: store requests protected delivery on the next operating day.'});
    const rescheduled=await command(dispatch,'A26','RESCHEDULE',{day:'2026-10-13',reason:'Staged receiving closure confirmed; preserve whole TV demand and original deferral.'});
    assert.equal(rescheduled.rescheduledTo.length,1);
    const replacement=await dispatch.call(`/orders/${rescheduled.rescheduledTo[0].id}`);
    member('N01','ORDER',replacement.id);
    for(const [key,outlet,items] of fixture.drafts) {
      const draft=await manager.post('/drafts',{id:null,expectedVersion:0,outletId:outletIds[outlet],day:fixture.day,items:items.map(([productId,quantity])=>({productId,quantity}))});
      member(key,'DRAFT',draft.id);report.drafts[key]=draft.id;
    }
    for(const [key,category,first,reply,author] of [
      ['A15','SHORTAGE','One TV unit is unavailable; reduced load is held for dispatcher approval.','Hold release until the shortage review is approved.','LOADER'],
      ['A12','ACCESS','Mall bay accepts the van between 10:00 and 12:00.','Window retained in the published road plan.','MANAGER'],
      ['A26','DELAY','Receiving area is closed on the original date.','Linked whole-order replacement is confirmed for October 13.','MANAGER'],
      ['H09','DAMAGE','One television declined because the packaging was damaged.','Receipt discrepancy remains separate from driver proof.','MANAGER']
    ]) {
      const entity=id(key);
      await c[author].post(`/orders/${entity}/messages`,{commandId:id(key+':message:1'),category,body:first});
      await dispatch.post(`/orders/${entity}/messages`,{commandId:id(key+':message:2'),category,body:reply});
    }
    const orders=await dispatch.call('/orders');
    for(const [key] of fixture.orders) {const o=orders.find(o=>o.id===id(key));report.orders[key]={id:o.id,reference:o.reference,status:o.status,version:o.version,outlet:o.outlet_id,day:o.day};}
    report.orders.N01={id:replacement.id,reference:replacement.reference,status:replacement.status,version:replacement.version,day:replacement.day};
    report.state='READY';report.seededAt=new Date().toISOString();saveReport(report);
    sql(`update video_seed_campaigns set state='READY',snapshot=${q(JSON.stringify(report))}::jsonb where campaign=${campaign};`);
    await import('./verify-video-demo.mjs');
  } catch(error) {
    const prepared=report.state==='READY';
    report.state=prepared?'READY':'FAILED';report.error=error.message;saveReport(report);
    sql(`update video_seed_campaigns set state=${q(report.state)} where campaign=${campaign};`);
    throw error;
  }
}
