import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { root,base,fixture,privateDir,reportPath,id,clients,detail,versionAction } from './video-demo-lib.mjs';
const require=createRequire(path.join(root,'apps/web/package.json'));
const {chromium,expect}=require('@playwright/test');
const open=process.argv.includes('--open'),rehearse=process.argv.includes('--rehearse');
assert.ok(!open||!rehearse,'Use separate rehearsal and recording profiles.');
const report=JSON.parse(readFileSync(reportPath,'utf8'));
assert.equal(report.state,'READY');
const output=path.join(privateDir,'screens');mkdirSync(output,{recursive:true});
const browsers=[],pages={};
const errors=[];
async function assigned(page,key) {
  const order=report.orders[key],trip=report.trips.find(t=>t.keys.includes(key));
  const value=JSON.stringify([order.day,trip.id]);
  const inputs=page.getByLabel('Assigned trip',{exact:true}).locator('input');
  await expect.poll(()=>inputs.evaluateAll(inputs=>inputs.map(i=>i.value))).toContain(value);
  await inputs.evaluateAll((inputs,v)=>{
    const input=inputs.find(i=>i.value===v);if(!input)throw Error('Assigned campaign trip missing');input.click();
  },value);
  await page.getByLabel('Assigned stop',{exact:true}).locator(`input[value="${order.id}"]`).check();
}
try {
  for(const [role,title] of [['MANAGER','Store manager'],['DISPATCHER','Dispatcher'],['LOADER','Loader'],['DRIVER','Driver']]) {
    const context=open
      ?await chromium.launchPersistentContext(path.join(privateDir,'profiles',role.toLowerCase()),{headless:false,viewport:{width:1440,height:900}})
      :await (async()=>{const b=await chromium.launch({headless:true});browsers.push(b);return b.newContext({viewport:{width:1440,height:900}});})();
    if(open)browsers.push(context);
    await context.addInitScript(day=>localStorage.setItem('waypoint-operating-day',day),fixture.day);
    const page=context.pages()[0]||await context.newPage();pages[role]=page;
    page.on('pageerror',e=>errors.push(`${role}: ${e.message}`));
    await page.goto(base);
    if(open) {
      const retained=await page.evaluate(async()=>{
        if(!(await indexedDB.databases()).some(d=>d.name==='waypoint-offline'))return false;
        const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('waypoint-offline');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        const names=['proofDrafts','outbox'].filter(n=>db.objectStoreNames.contains(n));
        if(!names.length){db.close();return false;}
        const tx=db.transaction(names,'readonly');
        const counts=await Promise.all(names.map(n=>new Promise((resolve,reject)=>{const r=tx.objectStore(n).count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);})));db.close();
        return counts.some(n=>n>0);
      });
      assert.equal(retained,false,`${role}: recording profile retains evidence. Use a fresh profile; retained evidence was not erased.`);
    }
    const signout=page.getByRole('button',{name:'Sign out',exact:true});
    if(await signout.isVisible())await signout.click();
    await page.getByRole('button',{name:new RegExp('^'+title)}).click();
    await expect(signout).toBeVisible();
    if(open)await page.evaluate(title=>{document.title=`Waypoint · ${title} · Local demo`;},title);
    await page.getByLabel('Operating day',{exact:true}).fill(fixture.day);
    if(role==='MANAGER') {
      await page.getByLabel('Outlet',{exact:true}).selectOption('DEMO-FRESH');
      await expect(page.getByText('Saved draft · '+fixture.day).first()).toBeVisible();
      await expect(page.getByRole('button',{name:'Resume draft',exact:true})).toHaveCount(3);
    }
    if(role==='DISPATCHER') {
      await expect(page.getByRole('region',{name:'Dataset multi-stop planning'})).toBeVisible();
      await page.locator('summary').filter({hasText:'Published runs'}).click();
    }
    if(role==='LOADER') {
      await page.getByLabel('Assigned load',{exact:true}).selectOption(id('A11'));
      await expect(page.getByText('Rice cartons',{exact:true}).first()).toBeVisible();
    }
    if(role==='DRIVER') {
      await assigned(page,'A22');
      await page.getByRole('button',{name:'Journey',exact:true}).click();
    }
    await page.screenshot({path:path.join(output,role.toLowerCase()+'.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${role}: horizontal overflow`);
    if(['LOADER','DRIVER'].includes(role)) {
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(output,role.toLowerCase()+'-phone.png'),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${role}: phone overflow`);
      await page.setViewportSize({width:1440,height:900});
    }
    console.log(`Prepared ${title}: selected ${fixture.day}, populated tasks, screenshot captured.`);
  }
  const manager=pages.MANAGER;
  for(const [outlet,brand] of [['DEMO-STYLE','style'],['DEMO-TECH','tech']]) {
    await manager.getByLabel('Outlet',{exact:true}).selectOption(outlet);
    await expect(manager.getByRole('button',{name:'Resume draft',exact:true}).first()).toBeVisible();
    await manager.screenshot({path:path.join(output,`manager-${brand}.png`),fullPage:true});
  }
  await manager.getByLabel('Outlet',{exact:true}).selectOption('DEMO-FRESH');
  if(rehearse) {
    // Rehearsal deliberately consumes A22. Restore the campaign baseline afterwards.
    const c=await clients(),driver=pages.DRIVER,context=driver.context();
    await assigned(driver,'A22');
    await driver.getByRole('button',{name:'Stop proof',exact:true}).click();
    await expect(driver.getByRole('button',{name:'Continue to photo',exact:true})).toBeVisible();
    await driver.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await driver.reload();await assigned(driver,'A22');
    await expect.poll(()=>driver.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);await driver.reload();await assigned(driver,'A22');
    await driver.getByRole('button',{name:'Continue to photo',exact:true}).click();
    await driver.getByLabel('Delivery photo',{exact:true}).setInputFiles(path.join(privateDir,'staged-packaging.png'));
    await expect(driver.getByAltText('Selected delivery evidence preview')).toBeVisible();
    await driver.getByRole('button',{name:'Save proof on this device',exact:true}).click();
    await driver.getByRole('button',{name:'Sync',exact:true}).click();
    await expect(driver.getByText(`${report.orders.A22.reference} · Saved on device · pending sync`,{exact:true})).toBeVisible();
    await driver.reload();
    await driver.getByRole('button',{name:'Sync',exact:true}).click();
    await expect(driver.getByText(`${report.orders.A22.reference} · Saved on device · pending sync`,{exact:true})).toBeVisible();
    const deferred=await versionAction(c.DISPATCHER,'A22','defer',{nextDay:'2026-10-13',reason:'Local rehearsal: proof was captured offline while the same stop was deferred.'});
    await context.setOffline(false);
    await expect(driver.getByText(`${report.orders.A22.reference} · Conflict needs review`,{exact:true})).toBeVisible({timeout:30000});
    const conflicts=await c.DISPATCHER.call('/sync-conflicts');
    const conflict=conflicts.find(v=>v.order_id===id('A22')&&v.state==='OPEN');assert.ok(conflict);
    const resolved=await c.DISPATCHER.post(`/sync-conflicts/${conflict.id}/resolve`,{expectedVersion:deferred.version,acceptDelivery:true,reason:'Local rehearsal: retained image and quantities checked; preserve original deferral.'});
    assert.equal(resolved.state,'ACCEPTED');
    const order=await detail(c.MANAGER,'A22');assert.equal(order.status,'DELIVERED');assert.equal(order.deferrals.length,1);
    await versionAction(c.MANAGER,'A22','receive',{lines:order.lines.map(l=>({lineId:l.id,quantity:l.delivered})),issue:''});
    report.preflight.offline='Passed real browser offline reload, image retention, same-stop conflict, explicit recovery and separate receipt';
    console.log('PASS: real offline reload/proof persistence and conflict recovery; rehearsal consumed only A22. Reset campaign before recording.');
  }
  assert.deepEqual(errors,[],'Browser runtime errors');
  report.preflight.browser='Passed four desktop personas, three store brands and driver/loader phone overflow checks';
  report.preflight.browserCheckedAt=new Date().toISOString();
  writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  writeFileSync(path.join(privateDir,rehearse?'rehearsal.json':'browser-verification.json'),JSON.stringify({campaign:fixture.campaign,digest:report.digest,...report.preflight},null,2)+'\n');
  if(open) {
    console.log('Four independent recording profiles are open. Ctrl+C closes them. Server baseline is unchanged.');
    await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }
} finally {await Promise.all(browsers.map(b=>b.close()));}
