import assert from 'node:assert/strict'
import test from 'node:test'
import { capturedFrom, columnNames, iterationsFromCsv, scenarioCall, scenarioRequest, stepShouldRun } from './scenarios.js'

const operation = {
  id: 'POST /api/orders',
  summary: 'Create an order',
  fields: [
    { name: 'orderNumber', location: 'body', type: 'string', required: true, sample: 'ORD' },
    { name: 'priority', location: 'body', type: 'string', enum: true, required: true, sample: 'LOW' },
    { name: 'note', location: 'body', type: 'string', required: false, sample: '' },
  ],
}

test('a scenario step fills the iteration values and keeps a fresh uuid', () => {
  const call = scenarioCall(operation, {
    request: { orderNumber: '${orderNumber}', note: '${uuid:4}' },
    expect: { status: '201', fields: [{ path: 'orderNumber', equals: '@{orderNumber}' }] },
  }, { variables: { warehouse: 'HK' } }, { orderNumber: 'A-1' })
  assert.equal(call.body.orderNumber, 'A-1')
  assert.equal(call.body.priority, 'LOW')
  assert.equal(call.body.note, '${uuid:4}')
  assert.equal(call.expect.status, '201')
  const sent = scenarioRequest(call, new Date('2026-01-02T00:00:00Z'))
  assert.equal(sent.body.note.length, 4)
  assert.notEqual(sent.body.note, scenarioRequest(call).body.note)
})

test('a captured id is available to the next step and a failure skips everything except cleanup', () => {
  const saved = capturedFrom({ orderId: 'id' }, 201, '{"id":15,"orderNumber":"A-1"}', '/api/orders/15')
  assert.equal(saved.orderId, 15)
  const call = scenarioCall({
    id: 'GET /api/orders/{id}',
    fields: [{ name: 'id', location: 'path', type: 'integer', required: true, sample: 1 }],
  }, { request: { id: '${orderId}' } }, { variables: {} }, saved)
  assert.equal(call.path.id, 15)
  assert.equal(stepShouldRun({ cleanup: false }, false), true)
  assert.equal(stepShouldRun({ cleanup: false }, true), false)
  assert.equal(stepShouldRun({ cleanup: true }, true), true)
})

test('iteration rows come from csv and from names used in the steps', () => {
  const parsed = iterationsFromCsv('orderNumber,priority\nA-1,HIGH\nA-2,LOW\n')
  assert.deepEqual(parsed.columns, ['orderNumber', 'priority'])
  assert.equal(parsed.iterations[1].values.priority, 'LOW')
  const names = columnNames([
    { request: { orderNumber: '${orderNumber}', reference: '${reference}' }, expect: { fields: [] }, save: { orderId: 'id' } },
  ], ['orderId'])
  assert.deepEqual(names, ['orderNumber', 'reference'])
})
