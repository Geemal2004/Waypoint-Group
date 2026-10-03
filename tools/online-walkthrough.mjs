// Executable API judge walkthrough against real Spring/PostgreSQL through nginx.
// Adds synthetic orders; does not reset or delete existing judge state.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const base = process.env.WAYPOINT_URL || 'http://localhost:8080'
class Client {
  cookie = ''; token = ''; header = ''
  async call(path, { method = 'GET', body, type = 'application/json', expect = 200 } = {}) {
    const headers = { Cookie: this.cookie }
    if (method !== 'GET' && this.header) headers[this.header] = this.token
    if (body && !(body instanceof FormData)) headers['Content-Type'] = type
    const response = await fetch(base + '/api/v1' + path, { method, headers, body: body instanceof FormData ? body : body && (type === 'application/json' ? JSON.stringify(body) : body), redirect: 'manual' })
    for (const cookie of response.headers.getSetCookie()) {
      if (cookie.startsWith('JSESSIONID=')) this.cookie = cookie.split(';')[0]
    }
    const result = response.status === 204 ? null : await response.json()
    assert.equal(response.status, expect, `${method} ${path}: ${JSON.stringify(result)}`)
    return result
  }
  async csrf() { const q = await this.call('/auth/csrf'); this.token = q.token; this.header = q.headerName }
  async login(username) {
    await this.csrf()
    await this.call('/auth/login', { method: 'POST', type: 'application/x-www-form-urlencoded', body: new URLSearchParams({ username, password: 'WaypointDemo!2026' }).toString() })
    await this.csrf()
    assert.equal((await this.call('/auth/me')).username, username)
  }
  post(path, body, expect = 200) { return this.call(path, { method: 'POST', body, expect }) }
}
const manager = new Client(), dispatcher = new Client(), loader = new Client(), driver = new Client()
await new Client().call('/orders', { expect: 401 })
const noCsrf = new Client()
await noCsrf.post('/auth/login', {}, 403)
for (const [client, username] of [[manager,'manager'], [dispatcher,'dispatcher'], [loader,'loader'], [driver,'driver']]) await client.login(username)
const initialCatalog = await manager.call('/catalog')
assert.equal(initialCatalog.outlets.filter(o=>o.demo).length, 3)
assert.ok(!initialCatalog.outlets.some(o => o.id === 'DEMO-OUTSIDE'))
await manager.post('/orders', { outletId:'DEMO-OUTSIDE', day:'2026-10-05', items:[{productId:'DEMO-TV',quantity:1}] }, 404)
await manager.post('/orders', { outletId:'DEMO-FRESH', day:'2026-10-05', items:[{productId:'DEMO-RICE',quantity:1},{productId:'DEMO-MILK',quantity:1}] }, 422)
const existing = await dispatcher.call('/orders')
const nowColombo = new Date(Date.now() + 330*60*1000).toISOString().slice(0,10)
const freeDay = initialCatalog.operatingDays.find(d => d.demo && d.day > nowColombo && !existing.some(o => o.run?.vehicle_id === 'DEMO-DRY' && o.day === d.day))?.day
assert.ok(freeDay, 'No unused synthetic judge day. Run the explicit demo reset in a verification environment.')
let order = await manager.post('/orders', { outletId:'DEMO-FRESH', day:freeDay, items:[{productId:'DEMO-RICE',quantity:10}] }, 201)
const id = order.id, lineId = order.lines[0].id, day = order.day
const publication = { expectedVersion:0,vehicleId:'DEMO-DRY',loaderId:'DEMO-LOADER',trip:1,departureAt:`${day}T00:00:00Z`,returnAt:`${day}T02:00:00Z`,estimatedFuelL:10,reason:'API walkthrough · synthetic schedule; no road feasibility claim' }
await manager.post(`/orders/${id}/publish`, publication, 403)
await loader.call(`/orders/${id}`, { expect:403 })
order = await dispatcher.post(`/orders/${id}/publish`, publication)
await dispatcher.post(`/orders/${id}/publish`, publication, 409)
await driver.post(`/orders/${id}/start`, {expectedVersion:order.version}, 409)
order = await loader.post(`/orders/${id}/loading`, {expectedVersion:order.version,lines:[{lineId,quantity:8}],reason:'SHORTAGE'})
assert.equal(order.loadingIssues[0].quantity, 2)
await loader.post(`/orders/${id}/release`, {expectedVersion:order.version}, 422)
order = await dispatcher.post(`/orders/${id}/approve-partial`, {expectedVersion:order.version,reason:'Eight cartons safe to release; two known missing cartons retained in record.'})
order = await loader.post(`/orders/${id}/release`, {expectedVersion:order.version})
order = await driver.post(`/orders/${id}/start`, {expectedVersion:order.version})
await loader.post(`/orders/${id}/loading`, {expectedVersion:order.version,lines:[{lineId,quantity:10}],reason:'NONE'}, 409)
order = await driver.post(`/orders/${id}/arrive`, {expectedVersion:order.version})
const form = new FormData()
const onlineAction = {actionId:randomUUID(),deviceId:'api-walkthrough-device',capturedAt:new Date().toISOString(),delivery:{expectedVersion:order.version,lines:[{lineId,quantity:8}],issue:''}}
form.set('action', new Blob([JSON.stringify(onlineAction)],{type:'application/json'}), 'action.json')
// A real small PNG; filename is ignored by the backend.
form.set('proof', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'proof.png')
const accepted = await driver.call(`/orders/${id}/sync-delivery`, {method:'POST',body:form})
assert.equal(accepted.outcome,'accepted')
assert.deepEqual(await driver.call(`/orders/${id}/sync-delivery`, {method:'POST',body:form}),accepted)
order = await manager.call(`/orders/${id}`)
assert.equal(order.status,'DELIVERED')
assert.equal(order.lines[0].expected_receiving,8)
order = await manager.post(`/orders/${id}/receive`, {expectedVersion:order.version,lines:[{lineId,quantity:8}],issue:''})
assert.equal(order.status,'RECEIVED_AT_STORE')
assert.equal(order.lines[0].ordered,10)
assert.equal(order.lines[0].loaded,8)
assert.equal(order.lines[0].delivered,8)
assert.equal(order.lines[0].received,8)
assert.equal(order.receipt.issue,'')
assert.ok(order.timeline.some(e => e.event === 'PARTIAL_RELEASE_APPROVED'))
assert.ok((await dispatcher.call(`/orders/${id}`)).proof)

// Same-stop conflict: capture the driver's proof, then defer that very stop before replaying it.
let offline = await manager.post('/orders',{outletId:'DEMO-FRESH',day,items:[{productId:'DEMO-RICE',quantity:4}]},201)
const offlineId=offline.id,offlineLine=offline.lines[0].id
offline = await dispatcher.post(`/orders/${offlineId}/publish`,{...publication,vehicleId:'DEMO-VAN'})
offline = await loader.post(`/orders/${offlineId}/loading`,{expectedVersion:offline.version,lines:[{lineId:offlineLine,quantity:4}],reason:'NONE'})
offline = await loader.post(`/orders/${offlineId}/release`,{expectedVersion:offline.version})
offline = await driver.post(`/orders/${offlineId}/start`,{expectedVersion:offline.version})
offline = await driver.post(`/orders/${offlineId}/arrive`,{expectedVersion:offline.version})
const action = {actionId:randomUUID(),deviceId:'offline-walkthrough-device',capturedAt:new Date().toISOString(),delivery:{expectedVersion:offline.version,lines:[{lineId:offlineLine,quantity:4}],issue:''}}
const pending = new FormData()
pending.set('action',new Blob([JSON.stringify(action)],{type:'application/json'}),'action.json')
pending.set('proof',form.get('proof'))
const nextDay=initialCatalog.operatingDays.find(d => d.demo && d.day > day)?.day
assert.ok(nextDay)
offline=await dispatcher.post(`/orders/${offlineId}/defer`,{expectedVersion:offline.version,nextDay,reason:'Same-stop cancellation while driver proof is offline · verification fixture'})
const conflict=await driver.call(`/orders/${offlineId}/sync-delivery`,{method:'POST',body:pending})
assert.equal(conflict.outcome,'conflict')
assert.deepEqual(await driver.call(`/orders/${offlineId}/sync-delivery`,{method:'POST',body:pending}),conflict)
pending.set('action',new Blob([JSON.stringify({...action,delivery:{...action.delivery,issue:'different payload'}})],{type:'application/json'}),'action.json')
await driver.call(`/orders/${offlineId}/sync-delivery`,{method:'POST',body:pending,expect:409})
pending.set('action',new Blob([JSON.stringify(action)],{type:'application/json'}),'action.json')
await driver.call('/sync-conflicts',{expect:403})
const queue=await dispatcher.call('/sync-conflicts')
assert.ok(queue.some(c => c.id===conflict.conflictId && c.state==='OPEN'))
const evidence=await fetch(base+`/api/v1/sync-conflicts/${conflict.conflictId}/evidence`,{headers:{Cookie:dispatcher.cookie}})
assert.equal(evidence.status,200)
assert.ok((await evidence.arrayBuffer()).byteLength>0)
const recovered=await dispatcher.post(`/sync-conflicts/${conflict.conflictId}/resolve`,{expectedVersion:offline.version,acceptDelivery:true,reason:'Verified retained proof and actual delivery; retain deferral history and allow receipt.'})
assert.equal(recovered.state,'ACCEPTED')
assert.equal(recovered.evidenceRetained,true)
assert.equal(recovered.order.deferrals.length,1)
assert.equal(recovered.order.status,'DELIVERED')
assert.deepEqual(await driver.call(`/orders/${offlineId}/sync-delivery`,{method:'POST',body:pending}),conflict)
offline=await manager.post(`/orders/${offlineId}/receive`,{expectedVersion:recovered.order.version,lines:[{lineId:offlineLine,quantity:4}],issue:''})
assert.equal(offline.status,'RECEIVED_AT_STORE')
for (const client of [manager,dispatcher,loader,driver]) await client.post('/auth/logout',undefined,204)
console.log(`PASS: four authenticated roles completed order ${id}; known shortage carried into receipt. CSRF, role/scope, stale-version and invalid-transition checks passed. Offline action retries were idempotent; changed payload rejected; same-stop conflict retained evidence and recovered to store receipt (${offlineId}).`)
