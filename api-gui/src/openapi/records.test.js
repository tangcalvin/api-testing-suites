import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { annotateJsonLines, compareRecords, filterRecords, filterRules, parseRecordBuffer, parseRecordCsv, parseRecordJson } from './records.js'

const COLUMNS = [
  'id', 'orderNumber', 'status', 'priority', 'customerName', 'customerEmail', 'currency',
  'countryCode', 'warehouseCode', 'giftWrap', 'notes', 'quantity', 'unitPrice', 'taxRate',
  'discountAmount', 'orderedAt', 'requestedDeliveryDate',
]

function field(name, extra = {}) {
  return {
    name,
    location: 'query',
    type: 'string',
    format: '',
    object: false,
    enum: false,
    required: false,
    ...extra,
  }
}

const ORDER_FIELDS = [
  field('orderNumber'),
  field('status', { enum: true, members: ['DRAFT', 'PAID'] }),
  field('priority', { enum: true, members: ['LOW', 'HIGH'] }),
  field('customerName'),
  field('giftWrap', { type: 'boolean' }),
  field('notes'),
  field('quantityMin', { type: 'integer' }),
  field('quantityMax', { type: 'integer' }),
  field('discountMin', { type: 'number' }),
  field('discountMax', { type: 'number' }),
  field('orderedFrom', { format: 'date-time' }),
  field('orderedTo', { format: 'date-time' }),
  field('deliveryFrom', { format: 'date' }),
  field('deliveryTo', { format: 'date' }),
  field('page', { type: 'integer' }),
  field('size', { type: 'integer' }),
  field('sort'),
]

const ROWS = [
  { id: 1, customerName: 'Ada Lovelace', status: 'DRAFT', priority: 'LOW', quantity: 1, discountAmount: 0, orderedAt: '2026-01-01T00:00:00Z', requestedDeliveryDate: '2026-01-03', notes: 'rush', giftWrap: false },
  { id: 2, customerName: 'Grace Hopper', status: 'PAID', priority: 'HIGH', quantity: 4, discountAmount: 5, orderedAt: '2026-01-02T15:00:00+08:00', requestedDeliveryDate: '2026-01-04', notes: '', giftWrap: true },
  { id: 3, customerName: 'Ada Byron', status: 'DRAFT', priority: 'HIGH', quantity: 2, discountAmount: 1.5, orderedAt: '2026-01-01T23:00:00Z', requestedDeliveryDate: '2026-01-05', notes: null, giftWrap: false },
]

test('list filters use contains, equals, and inclusive ranges on the record column', () => {
  const rules = filterRules(ORDER_FIELDS, COLUMNS, {}, { request: { page: 'page', size: 'size' } })
  const byName = Object.fromEntries(rules.map((rule) => [rule.field, rule]))
  assert.equal(byName.customerName.mode, 'contains')
  assert.equal(byName.status.mode, 'equals')
  assert.equal(byName.giftWrap.mode, 'equals')
  assert.equal(byName.quantityMin.mode, 'minimum')
  assert.equal(byName.quantityMin.column, 'quantity')
  assert.equal(byName.quantityMax.mode, 'maximum')
  assert.equal(byName.discountMin.column, 'discountAmount')
  assert.equal(byName.orderedFrom.column, 'orderedAt')
  assert.equal(byName.deliveryFrom.column, 'requestedDeliveryDate')
  assert.equal(byName.page, undefined)
  assert.equal(byName.sort, undefined)
  const sent = { query: { customerName: 'ada', status: 'DRAFT', quantityMin: 2 }, body: {} }
  assert.deepEqual(filterRecords(ROWS, rules, sent).map((row) => row.id), [3])
})

test('a blank filter is not applied and a saved mode can replace the guess', () => {
  const rules = filterRules(ORDER_FIELDS, COLUMNS, { customerName: { mode: 'equals' } })
  const sent = { query: { customerName: 'Ada Lovelace', notes: '' }, body: {} }
  assert.deepEqual(filterRecords(ROWS, rules, sent).map((row) => row.id), [1])
  const ignored = filterRules(ORDER_FIELDS, COLUMNS, { customerName: { mode: 'skip' } })
  assert.equal(filterRecords(ROWS, ignored, { query: { customerName: 'missing' }, body: {} }).length, 3)
})

test('date and number comparator objects, bounds, lists, empty, and any-of groups filter the set', () => {
  const fields = [
    field('orderedAtDateRange', { location: 'body', type: 'object', object: true }),
    field('orderedAtDateRange.comparator', { location: 'body', enum: true, members: ['=', '>=', '<=', '>', '<'] }),
    field('orderedAtDateRange.date', { location: 'body', format: 'date' }),
    field('quantityRange', { location: 'body', type: 'object', object: true }),
    field('quantityRange.comparator', { location: 'body', enum: true, members: ['=', '>=', '<=', '>', '<'] }),
    field('quantityRange.value', { location: 'body', type: 'integer' }),
    field('weightRange', { location: 'body', type: 'object', object: true }),
    field('weightRange.from', { location: 'body', type: 'number' }),
    field('weightRange.exclusiveTo', { location: 'body', type: 'number' }),
    field('customerNameMatch', { location: 'body', type: 'object', object: true }),
    field('customerNameMatch.comparator', { location: 'body', enum: true, members: ['contains', 'startsWith', 'endsWith', '='] }),
    field('customerNameMatch.value', { location: 'body' }),
    field('statuses', { type: 'array' }),
    field('statusNot'),
    field('notesEmpty', { type: 'boolean' }),
    field('hasGiftWrap', { type: 'boolean' }),
    field('anyOf', { location: 'body', type: 'object', object: true }),
    field('anyOf.status', { location: 'body', enum: true, members: ['DRAFT', 'PAID'] }),
    field('anyOf.priority', { location: 'body', enum: true, members: ['LOW', 'HIGH'] }),
    field('deliveryAddress', { location: 'body', type: 'object', object: true }),
    field('deliveryAddress.countryCode', { location: 'body' }),
  ]
  const columns = [...COLUMNS, 'weight']
  const rows = ROWS.map((row, index) => ({ ...row, weight: [1, 2.5, 4][index], deliveryAddress: { countryCode: index === 1 ? 'US' : 'HK' } }))
  const rules = filterRules(fields, columns)
  const byName = Object.fromEntries(rules.map((rule) => [rule.field, rule]))
  assert.equal(byName.orderedAtDateRange.mode, 'compare')
  assert.equal(byName.orderedAtDateRange.column, 'orderedAt')
  assert.equal(byName.orderedAtDateRange.valueKey, 'date')
  assert.equal(byName.quantityRange.column, 'quantity')
  assert.equal(byName.quantityRange.valueFormat, 'integer')
  assert.equal(byName.weightRange.mode, 'bounds')
  assert.deepEqual(byName.weightRange.sides.map((side) => side.mode), ['minimum', 'less'])
  assert.equal(byName.customerNameMatch.mode, 'compare')
  assert.equal(byName.statuses.mode, 'in')
  assert.equal(byName.statusNot.mode, 'not')
  assert.equal(byName.notesEmpty.mode, 'empty')
  assert.equal(byName.hasGiftWrap.mode, 'present')
  assert.equal(byName.hasGiftWrap.column, 'giftWrap')
  assert.equal(byName['anyOf.status'].or, 'anyOf')
  assert.equal(byName['anyOf.status'].column, 'status')
  assert.equal(byName['deliveryAddress.countryCode'].column, 'deliveryAddress.countryCode')

  const day = filterRecords(rows, rules, { body: { orderedAtDateRange: { comparator: '=', date: '2026-01-01' } }, query: {} })
  assert.deepEqual(day.map((row) => row.id), [1, 3])
  const after = filterRecords(rows, rules, { body: { orderedAtDateRange: { comparator: '>', date: '2026-01-01' } }, query: {} })
  assert.deepEqual(after.map((row) => row.id), [2])
  const atLeast = filterRecords(rows, rules, { body: { orderedAtDateRange: { comparator: '>=', date: '2026-01-02' } }, query: {} })
  assert.deepEqual(atLeast.map((row) => row.id), [2])
  const sameInstant = filterRecords(rows, rules, { body: { orderedAtDateRange: { comparator: '=', date: '2026-01-02T07:00:00Z' } }, query: {} })
  assert.deepEqual(sameInstant.map((row) => row.id), [2])
  const numbers = filterRecords(rows, rules, { body: { quantityRange: { comparator: '>', value: 2 } }, query: {} })
  assert.deepEqual(numbers.map((row) => row.id), [2])
  const bounds = filterRecords(rows, rules, { body: { weightRange: { from: 2, exclusiveTo: 4 } }, query: {} })
  assert.deepEqual(bounds.map((row) => row.id), [2])
  const starts = filterRecords(rows, rules, { body: { customerNameMatch: { comparator: 'startsWith', value: 'ada' } }, query: {} })
  assert.deepEqual(starts.map((row) => row.id), [1, 3])
  const list = filterRecords(rows, rules, { query: { statuses: ['PAID'] }, body: {} })
  assert.deepEqual(list.map((row) => row.id), [2])
  const excluded = filterRecords(rows, rules, { query: { statusNot: 'DRAFT' }, body: {} })
  assert.deepEqual(excluded.map((row) => row.id), [2])
  const emptyNotes = filterRecords(rows, rules, { query: { notesEmpty: true }, body: {} })
  assert.deepEqual(emptyNotes.map((row) => row.id), [2, 3])
  const either = filterRecords(rows, rules, { body: { anyOf: { status: 'PAID', priority: 'LOW' } }, query: {} })
  assert.deepEqual(either.map((row) => row.id), [1, 2])
  const nested = filterRecords(rows, rules, { body: { deliveryAddress: { countryCode: 'hk' } }, query: {} })
  assert.deepEqual(nested.map((row) => row.id), [1, 3])
  const omitted = filterRecords(rows, rules, { body: { orderedAtDateRange: null }, query: {} })
  assert.equal(omitted.length, 3)
})

test('uploaded rows match the filtered response by id, shared fields, and order', () => {
  const expected = [ROWS[0], ROWS[2]]
  const same = compareRecords(expected, [ROWS[2], { ...ROWS[0], extra: true }])
  assert.equal(same.passed, true)
  const missing = compareRecords(expected, [ROWS[0]])
  assert.equal(missing.passed, false)
  assert.match(missing.detail, /Missing from response: id 3/)
  const extra = compareRecords(expected, [...expected, ROWS[1]])
  assert.match(extra.detail, /Extra in response: id 2/)
  const changed = compareRecords([ROWS[0]], [{ ...ROWS[0], customerName: 'Other' }])
  assert.equal(changed.passed, false)
  assert.match(changed.detail, /Field mismatch on id 1:/)
  assert.match(changed.detail, /customerName: expected "Ada Lovelace", got "Other"/)
  assert.match(changed.detail, /\n/)
  assert.equal(changed.diffs.length, 1)
  assert.equal(changed.diffs[0].matchKey, 'id')
  assert.equal(changed.diffs[0].actualIndex, 0)
  assert.equal(changed.diffs[0].fields[0].path, 'customerName')
  const annotated = annotateJsonLines(JSON.stringify([{ ...ROWS[0], customerName: 'Other' }], null, 2), changed.diffs)
  assert.ok(annotated.notes.some((note) => /customerName: expected/.test(note)))
  const ordered = compareRecords(expected, [ROWS[2], ROWS[0]], { ordered: true })
  assert.match(ordered.detail, /out of order/)
  const instant = compareRecords(
    [{ id: 2, orderedAt: '2026-01-02T07:00:00Z' }],
    [{ id: 2, orderedAt: '2026-01-02T15:00:00+08:00' }],
  )
  assert.equal(instant.passed, true)
  assert.equal(compareRecords([], []).detail, 'No records match this filter.')
  const nested = compareRecords(
    [{ id: 1, 'packaging.type': 'BOX', 'packaging.label.code': 'LBL-1' }],
    [{ id: 1, packaging: { type: 'ENVELOPE', label: { code: 'LBL-1', carrier: 'DHL' }, dimensions: { lengthCm: 1, widthCm: 1, heightCm: 1 } } }],
  )
  assert.equal(nested.passed, false)
  assert.match(nested.detail, /packaging\.type: expected "BOX", got "ENVELOPE"/)
  const nullPackaging = compareRecords(
    [{ id: 1, reference: 'SHP-1', 'packaging.type': 'BOX', 'packaging.label.code': 'LBL-1' }],
    [{ id: 1, reference: 'SHP-1', packaging: null }],
  )
  assert.equal(nullPackaging.passed, false)
  assert.match(nullPackaging.detail, /packaging\.type: expected "BOX", got \(missing\)/)
  assert.match(nullPackaging.detail, /packaging\.label\.code: expected "LBL-1", got \(missing\)/)
  const emptyExcelPackaging = compareRecords(
    [{ id: 1, reference: 'SHP-1', 'packaging.type': null, 'packaging.label.code': null }],
    [{ id: 1, reference: 'SHP-1', packaging: null }],
  )
  assert.equal(emptyExcelPackaging.passed, true)
  const noId = compareRecords(
    [{ reference: 'A', status: 'DRAFT' }, { reference: 'B', status: 'BOOKED' }],
    [{ reference: 'B', status: 'SHIPPED' }, { reference: 'A', status: 'DRAFT' }],
  )
  assert.equal(noId.passed, false)
  assert.match(noId.detail, /Field mismatch on reference B:/)
  assert.match(noId.detail, /status: expected "BOOKED", got "SHIPPED"/)
})

test('csv and json files become records', () => {
  const csv = parseRecordCsv('id,customerName,giftWrap,notes\n1,"Ada, Lovelace",true,\n2,Grace,false,rush\n')
  assert.equal(csv[0].customerName, 'Ada, Lovelace')
  assert.equal(csv[0].giftWrap, true)
  assert.equal(csv[0].notes, null)
  assert.equal(csv[1].id, 2)
  const spaced = parseRecordCsv('id,name,notes\n1," abc ",\n2,"",x\n')
  assert.equal(spaced[0].name, ' abc ')
  assert.equal(spaced[0].notes, null)
  assert.equal(spaced[1].notes, 'x')
  assert.equal(spaced[1].name, '')
  const json = parseRecordJson('{"records":[{"id":"1","quantity":"2","name":" abc "}]}')
  assert.equal(json[0].id, 1)
  assert.equal(json[0].quantity, 2)
  assert.equal(json[0].name, ' abc ')
  const spacesMatch = compareRecords(
    [{ id: 1, name: ' abc ' }],
    [{ id: 1, name: ' abc ' }],
  )
  assert.equal(spacesMatch.passed, true)
  const spacesMiss = compareRecords(
    [{ id: 1, name: ' abc ' }],
    [{ id: 1, name: 'abc' }],
  )
  assert.equal(spacesMiss.passed, false)
  assert.match(spacesMiss.detail, /name: expected " abc ", got "abc"/)
  const nullVsEmpty = compareRecords(
    [{ id: 1, notes: null }],
    [{ id: 1, notes: '' }],
  )
  assert.equal(nullVsEmpty.passed, false)
  assert.match(nullVsEmpty.detail, /notes: expected null, got ""/)
  const emptyVsNull = compareRecords(
    [{ id: 1, notes: '' }],
    [{ id: 1, notes: null }],
  )
  assert.equal(emptyVsNull.passed, false)
  assert.match(emptyVsNull.detail, /notes: expected "", got null/)
})

test('an xlsx sheet becomes records', async () => {
  const XLSX = (await import('xlsx')).default || await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet([{ id: 4, customerName: 'Ada', quantity: 2 }])
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Orders')
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  const rows = await parseRecordBuffer(buffer, 'orders.xlsx')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 4)
  assert.equal(rows[0].customerName, 'Ada')
  assert.equal(rows[0].quantity, 2)
})

test('nested request filters use the record leaf and skip fields that are not columns', () => {
  const fields = [
    field('userId', { location: 'body' }),
    field('data', { location: 'body', type: 'object', object: true }),
    field('data.nextCursor', { location: 'body' }),
    field('data.size', { location: 'body', type: 'integer' }),
    field('data.reference', { location: 'body' }),
    field('data.status', { location: 'body', enum: true, members: ['DRAFT', 'BOOKED'] }),
  ]
  const columns = ['id', 'reference', 'status', 'recipient']
  const rows = [
    { id: 1, reference: 'SHP-1001', status: 'DRAFT', recipient: 'Ada Lovelace' },
    { id: 2, reference: 'SHP-1002', status: 'BOOKED', recipient: 'Ada Lovelace' },
    { id: 3, reference: 'HK-2001', status: 'BOOKED', recipient: 'Grace Hopper' },
  ]
  const pagination = { request: { cursor: 'data.nextCursor', size: 'data.size' } }
  const rules = filterRules(fields, columns, {}, pagination)
  const byName = Object.fromEntries(rules.map((rule) => [rule.field, rule]))
  assert.equal(byName.userId, undefined)
  assert.equal(byName['data.nextCursor'], undefined)
  assert.equal(byName['data.size'], undefined)
  assert.equal(byName['data.reference'].column, 'reference')
  assert.equal(byName['data.reference'].mode, 'contains')
  assert.equal(byName['data.status'].column, 'status')
  assert.equal(byName['data.status'].mode, 'equals')
  const all = filterRecords(rows, rules, { body: { userId: 'user-ada', data: { nextCursor: '0', size: 20 } }, query: {} })
  assert.deepEqual(all.map((row) => row.id), [1, 2, 3])
  const booked = filterRecords(rows, rules, {
    body: { userId: 'user-ada', data: { nextCursor: '0', size: 20, status: 'BOOKED' } },
    query: {},
  })
  assert.deepEqual(booked.map((row) => row.id), [2, 3])
  const both = filterRecords(rows, rules, {
    body: { userId: 'user-ada', data: { reference: 'SHP', status: 'BOOKED' } },
    query: {},
  })
  assert.deepEqual(both.map((row) => row.id), [2])
})

test('the shipment example workbook matches the query response columns', async () => {
  const buffer = readFileSync(new URL('../../public/examples/shipments.xlsx', import.meta.url))
  const rows = await parseRecordBuffer(buffer, 'shipments.xlsx')
  assert.equal(rows.length, 48)
  assert.deepEqual(Object.keys(rows[0]), [
    'id', 'reference', 'recipient', 'destination', 'weightKg', 'priority', 'status', 'insured', 'readyDate', 'cutoffTime', 'bookedAt',
    'packaging.type', 'packaging.dimensions.lengthCm', 'packaging.dimensions.widthCm', 'packaging.dimensions.heightCm',
    'packaging.label.code', 'packaging.label.carrier',
  ])
  assert.equal(rows[0].id, 1)
  assert.equal(rows[0].reference, 'SHP-1001')
  assert.equal(rows[0].destination, 'HK')
  assert.equal(rows[0].readyDate, '2026-03-01')
  assert.equal(rows[0].cutoffTime, '08:30:00')
  assert.equal(rows[0].bookedAt, '2026-03-01T10:15:30Z')
  assert.equal(rows[0]['packaging.type'], 'BOX')
  assert.equal(rows[0]['packaging.dimensions.lengthCm'], 10)
  assert.equal(rows[0]['packaging.label.code'], 'LBL-1001')
  assert.equal(rows[3]['packaging.type'], null)
  assert.equal(rows[35].reference, 'SHP-1036')
  assert.equal(rows[36].reference, 'HK-2001')
  assert.equal(rows[47].id, 48)
  assert.equal(rows[4].readyDate, null)
})
