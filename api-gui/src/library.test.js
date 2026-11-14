import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { acceptsTemporal, applyDefaults, casesDocument, clockToken, defaultsDocument, evaluateDynamics, formatClock, keptTemporal, parseCases, parseDefaults, parseProfiles, parseProfilesText, profileLabel, profilesDocument, profilesYaml, resolveCases, sampleSource, storedRate, substitute, temporalDraftOk, uuidToken } from './library.js'

const orderNumber = { name: 'orderNumber', location: 'body', type: 'string', sample: 'Sample', values: [], constraints: {} }
const queryNumber = { name: 'orderNumber', location: 'query', type: 'string', sample: '', values: [], constraints: {} }
const quantity = { name: 'quantity', location: 'body', type: 'integer', sample: 1, values: [], constraints: {} }

test('global defaults fill shared field names and an endpoint value replaces them', () => {
  const defaults = {
    global: { orderNumber: 'ORD-1001', quantity: '2' },
    operations: { 'GET /api/orders': { orderNumber: '' } },
  }

  const created = applyDefaults([orderNumber, quantity], 'POST /api/orders', defaults)
  assert.equal(created[0].sample, 'ORD-1001')
  assert.equal(created[1].sample, 2)
  assert.equal(sampleSource(orderNumber, 'POST /api/orders', defaults), 'global')

  const listed = applyDefaults([queryNumber], 'GET /api/orders', defaults)
  assert.equal(listed[0].sample, '')
  assert.equal(sampleSource(queryNumber, 'GET /api/orders', defaults), 'endpoint')

  const other = applyDefaults([queryNumber], 'GET /api/orders/cursor', defaults)
  assert.equal(other[0].sample, 'ORD-1001')
})

test('defaults and custom cases import as separate files', () => {
  const defaults = parseDefaults(JSON.stringify({
    version: 1,
    kind: 'defaults',
    global: { status: 'CONFIRMED', ignored: { nested: true } },
    operations: { 'POST /api/orders': { quantity: 9 } },
  }))
  assert.equal(defaults.global.status, 'CONFIRMED')
  assert.equal(defaults.global.ignored, undefined)
  assert.equal(defaults.operations['POST /api/orders'].quantity, 9)
  assert.equal(defaults.tps, '30')
  assert.equal(defaultsDocument(defaults).tps, undefined)
  const rated = parseDefaults(JSON.stringify({ kind: 'defaults', tps: '12' }))
  assert.equal(rated.tps, '12')
  assert.equal(defaultsDocument(rated).tps, '12')
  assert.equal(storedRate('0'), '30')
  assert.equal(storedRate(' 0.5 '), '0.5')
  assert.deepEqual(defaults.responses, {})
  const withResponses = parseDefaults(JSON.stringify({
    kind: 'defaults',
    responses: { 'POST /api/orders': { '201': { status: '@{status}', id: '' } } },
  }))
  assert.equal(withResponses.responses['POST /api/orders']['201'].status, '@{status}')
  assert.equal(withResponses.responses['POST /api/orders']['201'].id, '')
  assert.throws(() => parseDefaults('{"kind":"cases","operations":{}}'), /field defaults/)

  const cases = parseCases(JSON.stringify({
    version: 1,
    kind: 'cases',
    operations: {
      'POST /api/orders': [{
        name: 'Confirmed',
        request: { status: 'CONFIRMED' },
        omit: ['notes'],
        expect: { status: 201, fields: [{ path: 'status', equals: 'CONFIRMED' }, { path: '' }] },
      }],
    },
  }))
  const saved = cases.operations['POST /api/orders'][0]
  assert.equal(saved.name, 'Confirmed')
  assert.equal(saved.request.status, 'CONFIRMED')
  assert.deepEqual(saved.omit, ['notes'])
  assert.equal(saved.expect.status, '201')
  assert.equal(saved.expect.fields.length, 1)
  const withExclusions = parseCases(JSON.stringify({
    kind: 'cases',
    operations: {},
    exclusions: {
      'POST /api/orders': {
        fieldsets: [{ id: 'fs-1', values: { status: 'CANCELLED', priority: 'HIGH' } }],
        distinct: [{ id: 'ds-1', fields: ['fromAccount', 'toAccount'] }],
      },
    },
  }))
  assert.equal(withExclusions.exclusions['POST /api/orders'].fieldsets[0].values.status, 'CANCELLED')
  assert.deepEqual(withExclusions.exclusions['POST /api/orders'].distinct[0].fields, ['fromAccount', 'toAccount'])
  const withValues = parseCases(JSON.stringify({
    kind: 'cases',
    operations: {},
    values: { 'POST /api/orders': { customerName: [' Grace ', 'Grace', 'Ada', ''] } },
  }))
  assert.deepEqual(withValues.values['POST /api/orders'].customerName, ['Grace', 'Ada'])
  assert.deepEqual(casesDocument(withValues).values['POST /api/orders'].customerName, ['Grace', 'Ada'])
  assert.equal(casesDocument(parseCases('{"kind":"cases","operations":{}}')).values, undefined)
  assert.equal(casesDocument(parseCases('{"kind":"cases","operations":{}}')).checks, undefined)
  const withChecks = parseCases(JSON.stringify({
    kind: 'cases',
    operations: {},
    checks: { 'GET /api/orders': { columns: ['exceptions[].code', 'exceptions[].message'], rows: { 'disallowed:status is not an allowed value': { status: '422', values: { 'exceptions[].message': '@{field}' } } } } },
    errors: { 'GET /api/orders': [{ name: 'Missing', status: '404', field: 'id', code: 'NotFound', message: 'no @{field}' }] },
  }))
  assert.equal(withChecks.checks['GET /api/orders'].rows['disallowed:status is not an allowed value'].status, '422')
  assert.equal(withChecks.errors['GET /api/orders'][0].message, 'no @{field}')
  assert.equal(casesDocument(withChecks).checks['GET /api/orders'].columns[1], 'exceptions[].message')
  const withSteps = parseCases(JSON.stringify({
    kind: 'cases',
    operations: {},
    steps: { 'PUT /api/orders/{id}': { before: false, enquiry: true, after: 'yes' } },
  }))
  assert.equal(withSteps.steps['PUT /api/orders/{id}'].before, false)
  assert.equal(withSteps.steps['PUT /api/orders/{id}'].enquiry, true)
  assert.equal(withSteps.steps['PUT /api/orders/{id}'].after, undefined)
  assert.equal(casesDocument(withSteps).steps['PUT /api/orders/{id}'].enquiry, true)
  assert.equal(casesDocument(parseCases('{"kind":"cases","operations":{}}')).steps, undefined)
  const withIds = parseCases(JSON.stringify({
    kind: 'cases',
    operations: {},
    ids: { 'POST /api/shipments/getShipment': 'instructionNumber', 'POST /api/shipments/queryShipments': '' },
  }))
  assert.equal(withIds.ids['POST /api/shipments/getShipment'], 'instructionNumber')
  assert.equal(withIds.ids['POST /api/shipments/queryShipments'], '')
  assert.equal(casesDocument(withIds).ids['POST /api/shipments/getShipment'], 'instructionNumber')
  assert.equal(casesDocument(parseCases('{"kind":"cases","operations":{}}')).ids, undefined)
  assert.throws(() => parseCases('{"kind":"defaults","global":{}}'), /custom cases/)
  assert.deepEqual(defaults.variables, {})
})

test('variables fill defaults and custom expectations', () => {
  const defaults = {
    variables: { orderNumber: 'ORD-1001', quantity: '2', label: 'Order ${orderNumber}' },
    global: { orderNumber: '${orderNumber}', quantity: '${quantity}' },
    operations: { 'GET /api/orders': { orderNumber: '' } },
  }
  const body = { name: 'orderNumber', location: 'body', type: 'string', sample: 'Sample' }
  const amount = { name: 'quantity', location: 'body', type: 'integer', sample: 1 }
  const query = { name: 'orderNumber', location: 'query', type: 'string', sample: '' }
  const applied = applyDefaults([body, amount], 'POST /api/orders', defaults)
  assert.equal(applied[0].sample, 'ORD-1001')
  assert.equal(applied[1].sample, 2)
  assert.equal(applyDefaults([query], 'GET /api/orders', defaults)[0].sample, '')
  assert.equal(substitute('Order ${orderNumber}', defaults.variables), 'Order ORD-1001')
  assert.equal(substitute('${label}', defaults.variables), 'Order ORD-1001')
  assert.equal(substitute('${missing}', defaults.variables), '${missing}')
  assert.equal(substitute('${orderedAt}', { orderedAt: '${now+1d}' }), '${now+1d}')
  const noon = new Date(2026, 10, 12, 20, 15, 30)
  assert.equal(formatClock('today', '+1d', noon), '2026-11-13')
  assert.equal(formatClock('today', '', noon), '2026-11-12')
  assert.match(formatClock('now', '-2h', noon), /T18:15:30[+-]\d{2}:\d{2}$/)
  assert.equal(clockToken('date', -3, 'd'), '${today-3d}')
  assert.equal(clockToken('timestamp', 0, 'h'), '${now}')
  assert.equal(uuidToken(''), '${uuid}')
  assert.equal(uuidToken(12), '${uuid:12}')
  assert.equal(evaluateDynamics('${today+1d}', noon), '2026-11-13')
  assert.equal(evaluateDynamics('keep'), 'keep')
  assert.match(evaluateDynamics('${uuid}'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.match(evaluateDynamics('ORD-${uuid:8}'), /^ORD-[0-9a-f]{8}$/)

  const [item] = resolveCases([{
    name: 'Create ${orderNumber}',
    request: { quantity: '${quantity}' },
    omit: [],
    expect: { status: '201', fields: [{ path: 'orderNumber', equals: '${orderNumber}' }] },
  }], defaults.variables)
  assert.equal(item.name, 'Create ORD-1001')
  assert.equal(item.request.quantity, '2')
  assert.equal(item.expect.fields[0].equals, 'ORD-1001')
})

test('clients keep separate variables, defaults, and keys', () => {
  const saved = profilesDocument([
    {
      id: 'client-a',
      name: '',
      defaults: { variables: { warehouseCode: 'HK-01' }, global: { warehouseCode: '${warehouseCode}' }, headers: {}, operations: {} },
      cases: { operations: {} },
      oauth: { tokenUrl: 'https://auth.example/token', clientId: 'orders-a', audience: '', algorithm: 'RS256', privateKey: 'secret-a', scope: 'orders', lifetime: '300', saveAs: 'accessToken', caCert: '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----' },
    },
    {
      id: 'client-b',
      name: 'Warehouse B',
      defaults: { variables: { warehouseCode: 'SG-02' }, global: {}, headers: {}, operations: {}, responses: { 'POST /api/orders': { '400': { exceptions: { value: '[{"field":"quantity"}]', ordered: true } } } }, extraStatuses: { 'POST /api/orders': ['401', 'nope'] } },
      cases: { operations: { 'POST /api/orders': [{ name: 'Create', request: {}, omit: [], expect: { status: '201', fields: [{ path: 'exceptions', equals: '[{"field":"quantity"}]', ordered: true }] } }] } },
      oauth: { clientId: 'orders-b', privateKey: 'secret-b', tokenUrl: 'https://auth.example/token' },
    },
  ], 'client-b')
  const loaded = parseProfiles(JSON.stringify(saved))
  assert.equal(loaded.activeId, 'client-b')
  assert.equal(loaded.profiles[0].oauth.clientId, 'orders-a')
  assert.equal(loaded.profiles[0].oauth.privateKey, 'secret-a')
  assert.equal(loaded.profiles[0].oauth.caCert, '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----')
  assert.equal(loaded.profiles[0].oauth.saveAs, undefined)
  assert.equal(loaded.profiles[0].defaults.global.warehouseCode, '${warehouseCode}')
  assert.equal(profileLabel(loaded.profiles[0]), 'orders-a')
  assert.equal(profileLabel(loaded.profiles[1]), 'Warehouse B · orders-b')
  assert.equal(loaded.profiles[1].cases.operations['POST /api/orders'][0].expect.status, '201')
  assert.equal(loaded.profiles[1].cases.operations['POST /api/orders'][0].expect.fields[0].ordered, true)
  assert.deepEqual(loaded.profiles[1].defaults.responses['POST /api/orders']['400'].exceptions, { value: '[{"field":"quantity"}]', ordered: true })
  const imported = parseProfiles(JSON.stringify(saved), { newIds: true })
  assert.notEqual(imported.profiles[0].id, 'client-a')
  assert.throws(() => parseProfiles('{"kind":"defaults","global":{}}'), /clients export/)

  const yamlText = profilesYaml(loaded.profiles, loaded.activeId)
  const fromYaml = parseProfilesText(yamlText)
  assert.equal(fromYaml.profiles[0].defaults.global.warehouseCode, '${warehouseCode}')
  assert.equal(fromYaml.profiles[1].oauth.clientId, 'orders-b')
  assert.equal(fromYaml.profiles[0].oauth.caCert, '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----')
  assert.equal(fromYaml.profiles[1].cases.operations['POST /api/orders'][0].expect.fields[0].ordered, true)
  assert.deepEqual(fromYaml.profiles[1].defaults.responses['POST /api/orders']['400'].exceptions, { value: '[{"field":"quantity"}]', ordered: true })
  assert.deepEqual(fromYaml.profiles[1].defaults.extraStatuses['POST /api/orders'], ['401'])
})

test('example clients preload two makeup clients', () => {
  const loaded = parseProfilesText(readFileSync(new URL('../public/examples/clients.yaml', import.meta.url), 'utf8'))
  assert.equal(loaded.activeId, 'client-hk')
  assert.equal(loaded.profiles[0].name, 'Harbour')
  assert.equal(loaded.profiles[0].oauth.clientId, 'orders-hk')
  assert.equal(loaded.profiles[0].oauth.privateKey, '')
  assert.equal(loaded.profiles[0].defaults.variables.warehouseCode, 'HK-01')
  assert.equal(loaded.profiles[0].defaults.global.customerEmail, '${customerEmail}')
  assert.equal(loaded.profiles[0].cases.operations['POST /api/orders'][0].expect.fields[0].equals, '${orderNumber}')
  assert.equal(loaded.profiles[1].name, 'Marina')
  assert.equal(loaded.profiles[1].oauth.clientId, 'orders-sg')
  assert.equal(loaded.profiles[1].defaults.variables.customerName, 'Grace Hopper')
  assert.equal(loaded.profiles[1].defaults.variables.currency, 'USD')
  assert.equal(loaded.profiles[1].defaults.global.status, 'DRAFT')
  assert.equal(loaded.profiles[0].defaults.variables.orderedAt, '2020-01-15T10:15:30+08:00')
  assert.equal(loaded.profiles[0].defaults.variables.deliveryDate, '2099-12-01')
  const roundTrip = parseProfilesText(profilesYaml(loaded.profiles, loaded.activeId))
  assert.equal(roundTrip.profiles[0].defaults.variables.orderedAt, '2020-01-15T10:15:30+08:00')
  assert.equal(roundTrip.profiles[0].defaults.variables.deliveryDate, '2099-12-01')
})

test('a date field keeps a date and drops a plain string', () => {
  const date = { name: 'deliveryTo', format: 'date', type: 'string', sample: '' }
  const stamp = { name: 'orderedFrom', format: 'date-time', type: 'string', sample: '' }
  assert.equal(acceptsTemporal('date', '2099-12-01'), true)
  assert.equal(acceptsTemporal('date', '${today+1d}'), true)
  assert.equal(acceptsTemporal('date', '${deliveryDate}'), true)
  assert.equal(acceptsTemporal('date', '${now}'), false)
  assert.equal(acceptsTemporal('date', '1'), false)
  assert.equal(acceptsTemporal('date', '2026-02-31'), false)
  assert.equal(acceptsTemporal('timestamp', '2020-01-15T10:15:30+08:00'), true)
  assert.equal(acceptsTemporal('timestamp', '2020-01-15T02:15:30Z'), true)
  assert.equal(acceptsTemporal('timestamp', '${now-2h}'), true)
  assert.equal(acceptsTemporal('timestamp', '${orderedAt}'), true)
  assert.equal(acceptsTemporal('timestamp', '2099-12-01'), false)
  assert.equal(acceptsTemporal('timestamp', '${today}'), false)
  assert.equal(temporalDraftOk('date', '2099-12'), true)
  assert.equal(temporalDraftOk('date', '2099-13'), false)
  assert.equal(temporalDraftOk('date', 'not-a-date'), false)
  assert.equal(temporalDraftOk('timestamp', '2020-01-15T10:15:30+08'), true)
  assert.equal(temporalDraftOk('timestamp', '2020-01-15T10:15:30+08:00'), true)
  assert.equal(keptTemporal(date, '1'), '')
  assert.equal(keptTemporal(date, '${today}'), '${today}')
  assert.equal(keptTemporal(stamp, 'soon'), '')
  const listed = applyDefaults([date], 'GET /api/orders', {
    variables: { deliveryDate: '2099-12-01' },
    global: { deliveryTo: '${deliveryDate}' },
    operations: { 'GET /api/orders': { deliveryFrom: '1' } },
  })
  assert.equal(listed[0].sample, '2099-12-01')
  const overridden = applyDefaults([{ ...date, name: 'deliveryFrom' }], 'GET /api/orders', {
    operations: { 'GET /api/orders': { deliveryFrom: '1' } },
  })
  assert.equal(overridden[0].sample, '')
})

test('example files use the export format', () => {
  const defaults = parseDefaults(readFileSync(new URL('../public/examples/field-defaults.json', import.meta.url), 'utf8'))
  const cases = parseCases(readFileSync(new URL('../public/examples/custom-cases.json', import.meta.url), 'utf8'))
  assert.equal(defaults.variables.customerEmail, 'ada@example.com')
  assert.equal(defaults.global.customerEmail, '${customerEmail}')
  assert.equal(defaults.operations['GET /api/orders'].orderNumber, '')
  assert.equal(cases.operations['POST /api/orders'][0].expect.fields[0].equals, '${orderNumber}')
  assert.equal(cases.operations['GET /api/orders/{id}'][0].expect.status, '404')
})