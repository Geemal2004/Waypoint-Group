// Local screenshot evidence; no credentials or restricted data are committed.
import { chromium } from '../apps/web/node_modules/playwright-core/index.mjs';
import { mkdir } from 'node:fs/promises';
const base=process.env.WAYPOINT_URL||'http://localhost:8080';
const stage=process.argv[2]||'after';
const folder=new URL(`../tmp/product-ui/${stage}/`,import.meta.url);
await mkdir(folder,{recursive:true});
const browser=await chromium.launch();
for(const [role,width,height] of [['dispatcher',1440,900],['manager',390,844],['loader',390,844],['driver',390,844],['loader',1024,768]]){
 const context=await browser.newContext({viewport:{width,height}});
 const page=await context.newPage();
 await page.goto(base);
 await page.getByLabel('Username',{exact:true}).fill(role);
 await page.getByLabel('Password',{exact:true}).fill(process.env.JUDGE_PASSWORD||'WaypointDemo!2026');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
 await page.waitForTimeout(1500);
 await page.screenshot({path:new URL(`${role}-${width}.png`,folder).pathname.replace(/^\/(\w:)/,'$1'),fullPage:false});
 await context.close();
}
await browser.close();
console.log(`Captured ${stage} role screens in tmp/product-ui.`);
