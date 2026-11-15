import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import yaml from 'js-yaml'
import { createStore } from './store.js'

test('clients.yaml and run files stay inside the data directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tester-files-'))
  try {
    const store = createStore(root)
    assert.equal(await store.readClients(), null)
    await store.writeClients('version: 1\nkind: profiles\nactiveId: client-hk\nprofiles:\n  - id: client-hk\n    name: Harbour\n    oauth:\n      clientId: orders-hk\n    defaults:\n      kind: defaults\n      variables:\n        warehouseCode: HK-01\n      global: {}\n      operations: {}\n    cases:\n      kind: cases\n      operations: {}\n')
    const saved = yaml.load(await store.readClients())
    assert.equal(saved.profiles[0].oauth.clientId, 'orders-hk')
    assert.equal(saved.profiles[0].defaults.variables.warehouseCode, 'HK-01')
    await assert.rejects(() => store.writeClients('kind: defaults\n'), /profiles document/)
    assert.equal(await store.readSpec(), null)
    await store.writeSpec('openapi: 3.1.0\npaths:\n  /api/orders:\n    get:\n      summary: List\n')
    assert.match(await store.readSpec(), /\/api\/orders/)
    await assert.rejects(() => store.writeSpec('kind: profiles\n'), /no paths/)

    const run = await store.writeRun({
      client: 'Harbour · orders-hk',
      clientId: 'orders-hk',
      operation: 'POST /api/orders',
      mode: 'Combinations',
      baseUrl: '/backend',
      stopped: false,
      results: [{ index: 1, label: 'status=CONFIRMED', status: 201, passed: true, detail: 'Created', text: '{"id":1}', pages: null }],
    })
    assert.match(run.name, /^[0-9]{8}T[0-9]{9}Z\.yaml$/)
    const listed = await store.listRuns()
    assert.equal(listed[0].name, run.name)
    assert.equal(listed[0].passed, 1)
    assert.equal(listed[0].operation, 'POST /api/orders')
    const loaded = yaml.load(await store.readRun(run.name))
    assert.equal(loaded.kind, 'run')
    assert.equal(loaded.results[0].text, '{"id":1}')
    await assert.rejects(() => store.readRun('../clients.yaml'), /Unknown run name/)

    assert.deepEqual(await store.readDatasets('client-hk'), {})
    await store.writeDatasets('client-hk', {
      'GET /api/orders': { name: 'orders.csv', ordered: false, rows: [{ id: 1, customerName: 'Ada' }] },
    })
    const records = await store.readDatasets('client-hk')
    assert.equal(records['GET /api/orders'].rows[0].customerName, 'Ada')
    await store.writeDatasets('client-hk', {})
    assert.deepEqual(await store.readDatasets('client-hk'), {})
    await assert.rejects(() => store.readDatasets('../clients'), /Unknown client/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
