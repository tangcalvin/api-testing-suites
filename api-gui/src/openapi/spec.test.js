import assert from 'node:assert/strict'
import test from 'node:test'
import { OMIT, individualChoices, buildIndividualCases, buildCases, buildCustomCases, buildErrorCases, caseCount, detectPagination, judge, listOperations, operationGroups, parseSpecText, planContinuation, responseChecks, responseViews, scalarCombinationField, specGaps, textCombinationField, viewsWithStatuses, withTextCombinationValues } from './spec.js'

const SPEC = `
openapi: 3.1.0
paths:
  /api/orders:
    post:
      summary: Create a dummy order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateOrderRequest"
components:
  schemas:
    CreateOrderRequest:
      type: object
      properties:
        orderNumber:
          type: string
          example: ORD-1001
        status:
          type: string
          enum: [DRAFT, CONFIRMED]
        priority:
          type: string
          enum: [LOW, HIGH]
        giftWrap:
          type: boolean
        orderedAt:
          type: string
          format: date-time
        requestedDeliveryDate:
          type: string
          format: date
        notes:
          type: string
        countryCode:
          type: string
          pattern: "[A-Z]{2}"
      required:
        - orderNumber
        - status
        - priority
        - giftWrap
        - orderedAt
        - requestedDeliveryDate
        - countryCode
`

const LIST = `
openapi: 3.1.0
paths:
  /api/orders:
    get:
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [DRAFT, CONFIRMED]
        - name: quantityMin
          in: query
          schema:
            type: integer
        - name: quantityMax
          in: query
          schema:
            type: integer
        - name: unitPriceMin
          in: query
          schema:
            type: number
        - name: unitPriceMax
          in: query
          schema:
            type: number
`

const PAGED = `
openapi: 3.1.0
paths:
  /api/orders:
    get:
      parameters:
        - name: page
          in: query
          schema: { type: integer, minimum: 0 }
        - name: size
          in: query
          schema: { type: integer }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  content: { type: array, items: { type: object } }
                  page: { type: integer }
                  size: { type: integer }
                  totalPages: { type: integer }
  /search:
    get:
      parameters:
        - name: nextCursor
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  items: { type: array, items: { type: object } }
                  nextCursor: { type: string }
  /feed:
    get:
      parameters:
        - name: offset
          in: query
          schema: { type: integer }
        - name: limit
          in: query
          schema: { type: integer }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  results: { type: array, items: { type: object } }
                  total: { type: integer }
`

test('operations are grouped by the OpenAPI tag', () => {
  const operations = listOperations(parseSpecText(`
openapi: 3.1.0
tags:
  - name: Orders
  - name: Customers
paths:
  /api/customers:
    get:
      tags: [Customers]
      summary: List customers
  /api/orders:
    post:
      tags: [Orders]
      summary: Create an order
`))
  assert.deepEqual(operations.map((operation) => operation.tag), ['Orders', 'Customers'])
  assert.deepEqual(operationGroups(operations).map((group) => group.tag), ['Orders', 'Customers'])
  assert.equal(operationGroups(operations)[1].operations[0].summary, 'List customers')
})

test('pagination follows the parameter style declared by the spec', () => {
  const operations = Object.fromEntries(listOperations(parseSpecText(PAGED)).map((operation) => [operation.path, operation]))

  assert.equal(operations['/api/orders'].pagination.style, 'page')
  const pageBody = { content: [{ id: 1 }], page: 0, size: 1, totalPages: 3 }
  const second = planContinuation(operations['/api/orders'].pagination, { size: 1 }, pageBody, [{ pageIndex: 0, status: 200, count: 1 }])
  assert.equal(second.query.page, 1)
  assert.equal(second.query.size, 1)
  const done = planContinuation(operations['/api/orders'].pagination, { page: 2, size: 1 }, pageBody, [
    { pageIndex: 0 }, { pageIndex: 1 }, { pageIndex: 2 },
  ])
  assert.equal(done, null)

  assert.equal(operations['/search'].pagination.style, 'cursor')
  assert.equal(operations['/search'].pagination.request.cursor, 'nextCursor')
  const cursor = planContinuation(operations['/search'].pagination, {}, { items: [{ id: 1 }], nextCursor: 'abc' }, [{ status: 200, count: 1 }])
  assert.equal(cursor.query.nextCursor, 'abc')
  const cursorDone = planContinuation(operations['/search'].pagination, { nextCursor: 'abc' }, { items: [], nextCursor: null }, [
    { status: 200, count: 1 }, { cursor: 'abc', status: 200, count: 0 },
  ])
  assert.equal(cursorDone, null)

  const products = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/products:
    get:
      parameters:
        - name: size
          in: query
          schema: { type: integer, minimum: 1, maximum: 100 }
        - name: nextCursor
          in: query
          schema: { type: string }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  content: { type: array, items: { type: object } }
                  size: { type: integer }
                  totalSize: { type: integer }
                  nextCursor: { type: string, nullable: true }
`))[0]
  assert.equal(products.pagination.style, 'cursor')
  assert.equal(products.pagination.request.size, 'size')
  assert.equal(products.pagination.request.cursor, 'nextCursor')
  assert.deepEqual(products.pagination.response.total, ['totalSize'])
  assert.deepEqual(products.pagination.response.size, ['size'])
  const next = planContinuation(products.pagination, { size: 2 }, {
    content: [{ id: 1 }, { id: 2 }], size: 2, totalSize: 3, nextCursor: '2',
  }, [{ status: 200, count: 2 }])
  assert.equal(next.query.size, 2)
  assert.equal(next.query.nextCursor, '2')
  const shortPage = planContinuation(products.pagination, { size: 2, nextCursor: '2' }, {
    content: [{ id: 3 }], size: 2, totalSize: 3, nextCursor: null,
  }, [{ count: 2 }, { cursor: '2', count: 1 }])
  assert.equal(shortPage, null)
  const filled = planContinuation(products.pagination, { size: 2 }, {
    content: [{ id: 1 }, { id: 2 }], size: 2, totalSize: 2, nextCursor: '2',
  }, [{ count: 2 }])
  assert.equal(filled, null)

  assert.equal(operations['/feed'].pagination.style, 'offset')
  const offset = planContinuation(operations['/feed'].pagination, { limit: 2 }, { results: [{ id: 1 }, { id: 2 }], total: 5 }, [{ offset: 0, status: 200, count: 2 }])
  assert.equal(offset.query.offset, 2)
  assert.equal(detectPagination({ paths: {} }, { parameters: [] }, { parameters: [], responses: {} }), null)
})

test('a composite body field is sent as one nested object', () => {
  const fields = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [deliveryAddress]
              properties:
                deliveryAddress:
                  type: object
                  required: [line1, city, postalCode]
                  properties:
                    line1: { type: string, example: "1 Harbour Road", maxLength: 120 }
                    city: { type: string, example: Hong Kong, maxLength: 80 }
                    postalCode: { type: string, example: "999077", maxLength: 12 }
`))[0].fields
  assert.deepEqual(fields.map((field) => field.name), ['deliveryAddress', 'deliveryAddress.line1', 'deliveryAddress.city', 'deliveryAddress.postalCode'])
  assert.equal(fields[0].object, true)
  assert.equal(fields.every((field) => field.required), true)
  assert.deepEqual(buildCases(fields)[0].body, {
    deliveryAddress: { line1: '1 Harbour Road', city: 'Hong Kong', postalCode: '999077' },
  })
  const omitted = buildErrorCases(fields).find((item) => item.label === 'omit deliveryAddress.line1')
  assert.deepEqual(omitted.body, { deliveryAddress: { city: 'Hong Kong', postalCode: '999077' } })
  assert.equal(omitted.expect.field, 'deliveryAddress.line1')
  assert.deepEqual(
    responseChecks([{ status: '201', fields: [{ name: 'deliveryAddress.line1', type: 'string' }, { name: 'deliveryAddress', type: 'object' }] }], new Set(fields.map((field) => field.name))),
    { '201': { 'deliveryAddress.line1': '@{deliveryAddress.line1}' } },
  )
})

test('a third level object can be sent as fields, null, or an empty object', () => {
  const fields = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                deliveryAddress:
                  type: object
                  properties:
                    line1: { type: string, example: "1 Harbour Road" }
                    region:
                      oneOf:
                        - type: object
                          properties:
                            code: { type: string, example: HK }
                            district:
                              type: object
                              properties:
                                name: { type: string, example: Central }
                        - type: 'null'
`))[0].fields
  assert.deepEqual(fields.map((field) => field.name), [
    'deliveryAddress',
    'deliveryAddress.line1',
    'deliveryAddress.region',
    'deliveryAddress.region.code',
    'deliveryAddress.region.district',
    'deliveryAddress.region.district.name',
  ])
  const filled = buildCustomCases(fields, [{ name: 'Filled', request: {}, omit: [], expect: {} }])[0]
  assert.equal(filled.body.deliveryAddress.region.district.name, 'Central')
  const nulled = buildCustomCases(fields, [{ name: 'Null region', request: { 'deliveryAddress.region': '@null' }, omit: [], expect: {} }])[0]
  assert.equal(nulled.body.deliveryAddress.region, null)
  assert.equal(nulled.body.deliveryAddress.line1, '1 Harbour Road')
  const empty = buildCustomCases(fields, [{ name: 'Empty address', request: { deliveryAddress: '@empty' }, omit: [], expect: {} }])[0]
  assert.deepEqual(empty.body, { deliveryAddress: {} })
  const omitted = buildCustomCases(fields, [{ name: 'Omit address', request: {}, omit: ['deliveryAddress'], expect: {} }])[0]
  assert.deepEqual(omitted.body, {})
})

test('response schema lists nested fields for each status', () => {
  const operation = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    get:
      responses:
        "200":
          description: One page of orders
          content:
            application/json:
              schema:
                type: object
                required: [content]
                properties:
                  content:
                    type: array
                    items:
                      type: object
                      required: [id]
                      properties:
                        id: { type: integer }
                        status: { type: string, enum: [DRAFT, CONFIRMED] }
                  totalPages: { type: integer }
        "400":
          description: Invalid query
          content:
            "*/*":
              schema:
                type: object
                properties:
                  exceptions:
                    type: array
                    items:
                      type: object
                      properties:
                        field: { type: string }
`))[0]
  const views = operation.responses
  assert.equal(views[0].status, '200')
  assert.equal(views[0].description, 'One page of orders')
  const names = views[0].fields.map((field) => field.name)
  assert.ok(names.includes('content'))
  assert.ok(names.includes('content[].id'))
  assert.ok(names.includes('totalPages'))
  assert.equal(views[0].fields.find((field) => field.name === 'content[].id').required, true)
  assert.equal(views[0].fields.find((field) => field.name === 'content[].status').type, 'enum')
  assert.equal(views[1].fields.find((field) => field.name === 'exceptions[].field').type, 'string')
  assert.equal(responseViews({ paths: {} }, { responses: {} }).length, 0)
})

test('an added status uses the documented fields of the same kind', () => {
  const views = [
    { status: '200', fields: [{ name: 'id', type: 'integer' }] },
    { status: '400', fields: [{ name: 'exceptions', type: 'array of object' }, { name: 'exceptions[].field', type: 'string' }] },
  ]
  const withError = viewsWithStatuses(views, ['401', '200'])
  assert.deepEqual(withError.map((view) => view.status), ['200', '400', '401'])
  assert.equal(withError.find((view) => view.status === '401').added, true)
  assert.equal(withError.find((view) => view.status === '401').fields[0].name, 'exceptions')
  const withSuccess = viewsWithStatuses(views, ['201'])
  assert.equal(withSuccess.find((view) => view.status === '201').fields[0].name, 'id')
})

test('text fields cross the sample with extra combination values', () => {
  const field = (name, extra) => ({
    name,
    location: 'query',
    type: 'string',
    object: false,
    enum: false,
    format: '',
    required: false,
    values: [],
    vary: false,
    sample: '',
    ...extra,
  })
  const fields = withTextCombinationValues([
    field('customerName'),
    field('orderedFrom', { format: 'date-time', sample: '2020-01-15T10:15:30Z' }),
    field('size', { type: 'integer', sample: 20 }),
  ], { customerName: ['Ada', 'Ada', ''] }, {})
  assert.equal(textCombinationField(fields.find((item) => item.name === 'customerName')), true)
  assert.equal(textCombinationField(fields.find((item) => item.name === 'orderedFrom')), false)
  assert.equal(textCombinationField(fields.find((item) => item.name === 'size')), false)
  const customer = fields.find((item) => item.name === 'customerName')
  assert.equal(customer.vary, true)
  assert.deepEqual(customer.values, ['', 'Ada'])
  const cases = buildCases(fields)
  assert.deepEqual(cases.map((item) => item.label), ['customerName=blank', 'customerName=Ada'])
  assert.deepEqual(cases[0].query, { size: 20 })
  assert.deepEqual(cases[1].query, { customerName: 'Ada', size: 20 })
  assert.equal(cases[1].query.orderedFrom, undefined)

  const held = withTextCombinationValues([
    field('notes', { location: 'body', sample: 'Leave at reception', textVary: false }),
  ], { notes: ['${desk}', 'Leave at reception'] }, { desk: 'Call first' })
  assert.equal(held[0].vary, false)
  assert.deepEqual(held[0].values, ['Leave at reception', 'Call first'])
  assert.equal(buildCases(held).length, 1)
  assert.equal(buildCases(held)[0].body.notes, 'Leave at reception')
})

test('string and number combinations add other values, and optional fields can add null and omit', () => {
  const field = (name, extra) => ({
    name,
    location: 'body',
    type: 'string',
    object: false,
    enum: false,
    format: '',
    required: false,
    values: [],
    vary: false,
    sample: '',
    ...extra,
  })
  const fields = withTextCombinationValues([
    field('notes', { sample: 'Leave' }),
    field('quantity', { type: 'integer', sample: 2 }),
    field('orderNumber', { sample: 'AB', required: true }),
    field('customerName'),
  ], {
    notes: ['Ada', '@null', '@omit', 'Leave'],
    quantity: ['5', '@null', '2'],
    orderNumber: ['ZZ', '@omit', '@null'],
    customerName: ['@omit'],
  }, {})
  const notes = fields.find((item) => item.name === 'notes')
  assert.equal(scalarCombinationField(notes), true)
  assert.deepEqual(notes.values, ['Leave', 'Ada', null, OMIT])
  assert.deepEqual(fields.find((item) => item.name === 'quantity').values, [2, 5, null])
  assert.deepEqual(fields.find((item) => item.name === 'orderNumber').values, ['AB', 'ZZ'])
  assert.deepEqual(fields.find((item) => item.name === 'customerName').values, [])
  const cases = buildCases(fields)
  const omitted = cases.find((item) => item.varied.notes === OMIT && item.varied.quantity === 2)
  assert.equal(omitted.body.notes, undefined)
  assert.equal(omitted.body.quantity, 2)
  assert.equal(omitted.body.orderNumber, 'AB')
  const cleared = cases.find((item) => item.varied.notes === null && item.varied.quantity === null)
  assert.equal(cleared.body.notes, null)
  assert.equal(cleared.body.quantity, null)
})

test('an enum that already contains null lists that null once', () => {
  const fields = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
                  enum: [null, DRAFT, null, DRAFT]
                priority:
                  type: string
                  enum: [null, LOW]
              required: [priority]
`))[0].fields
  const status = fields.find((item) => item.name === 'status')
  assert.deepEqual(status.members, [null, 'DRAFT'])
  assert.deepEqual(status.values, [null, 'DRAFT', OMIT])
  const priority = fields.find((item) => item.name === 'priority')
  assert.deepEqual(priority.members, [null, 'LOW'])
  assert.deepEqual(priority.values, [null, 'LOW'])
  assert.deepEqual(buildCases([status]).map((item) => item.label), ['status=null', 'status=DRAFT', 'status=omit'])
})

test('list combinations do not send saved query filters that are not being varied', () => {
  const field = (name, extra) => ({ name, location: 'query', type: 'string', object: false, required: false, values: [], vary: false, sample: '', ...extra })
  const cases = buildCases([
    field('status', { values: ['DRAFT', 'CONFIRMED'], vary: true, sample: 'DRAFT' }),
    field('deliveryTo', { sample: '2026-11-13' }),
    field('discountMin', { type: 'number', sample: 1 }),
    field('orderNumber', { sample: '1' }),
    field('size', { type: 'integer', sample: 20 }),
  ])
  assert.equal(cases.length, 2)
  assert.deepEqual(cases[0].query, { status: 'DRAFT', size: 20 })
  assert.equal(cases[0].query.deliveryTo, undefined)
  assert.equal(cases[0].query.discountMin, undefined)
  assert.equal(cases[0].query.orderNumber, undefined)
})

test('an omitted query value is left off the request', () => {
  const fields = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    get:
      parameters:
        - name: status
          in: query
          schema: { type: string, enum: [DRAFT, CONFIRMED] }
        - name: priority
          in: query
          schema: { type: string, enum: [LOW, HIGH] }
        - name: currency
          in: query
          schema: { type: string, enum: [HKD, USD] }
`))[0].fields
  const currency = fields.find((field) => field.name === 'currency')
  currency.values = ['HKD', Symbol('omit'), 'Symbol(omit)']
  const cases = buildCases(fields.map((field) => field.name === 'status' || field.name === 'priority' ? { ...field, vary: false, values: [] } : field))
  assert.deepEqual(cases.map((item) => item.label), ['currency=HKD', 'currency=omit', 'currency=omit'])
  assert.deepEqual(cases[1].query, {})
  assert.deepEqual(cases[2].query, {})
  assert.equal(cases[0].query.currency, 'HKD')
})

test('optional enum fields also try null and omit', () => {
  const fields = listOperations(parseSpecText(LIST))[0].fields
  const status = fields.find((field) => field.name === 'status')
  assert.equal(status.vary, true)
  assert.equal(status.enum, true)
  assert.equal(status.required, false)
  assert.equal(caseCount(fields), 4)
  const cases = buildCases(fields)
  assert.deepEqual(cases.map((item) => item.label), ['status=DRAFT', 'status=CONFIRMED', 'status=null', 'status=omit'])
  assert.deepEqual(cases[0].query, { status: 'DRAFT' })
  assert.deepEqual(cases[2].query, { status: '' })
  assert.deepEqual(cases[3].query, {})
  assert.equal(fields.find((field) => field.name === 'quantityMin').vary, false)
  assert.equal(cases[0].query.quantityMin, undefined)
})

test('an optional body enum sends null and drops the field when omitted', () => {
  const fields = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
                  enum: [DRAFT, CONFIRMED]
                orderNumber:
                  type: string
                  example: ORD-1001
              required: [orderNumber]
`))[0].fields
  const cases = buildCases(fields)
  assert.equal(cases.length, 4)
  assert.equal(cases[2].body.status, null)
  assert.equal(cases[2].body.orderNumber, 'ORD-1001')
  assert.equal(cases[3].body.status, undefined)
  assert.equal(cases[3].label, 'status=omit')
})

test('builds the cartesian product of enum fields and keeps other fields fixed', () => {
  const operations = listOperations(parseSpecText(SPEC))
  assert.equal(operations.length, 1)
  const fields = operations[0].fields
  assert.equal(caseCount(fields), 4)

  const cases = buildCases(fields)
  assert.equal(cases.length, 4)
  assert.deepEqual(cases.map((item) => item.varied), [
    { status: 'DRAFT', priority: 'LOW' },
    { status: 'DRAFT', priority: 'HIGH' },
    { status: 'CONFIRMED', priority: 'LOW' },
    { status: 'CONFIRMED', priority: 'HIGH' },
  ])

  const body = cases[0].body
  assert.equal(body.orderNumber, 'ORD-1001')
  assert.equal(body.giftWrap, false)
  assert.equal(body.countryCode, 'HK')
  assert.equal(body.orderedAt, '2020-01-15T10:15:30Z')
  assert.equal(body.requestedDeliveryDate, '2099-12-01')
  assert.equal(body.notes, undefined)
})

test('combination exclusions skip field values, equal fields, and mutually exclusive groups', () => {
  const field = (name, values, sample = values[0]) => ({
    name, location: 'body', type: 'string', object: false, values, vary: true, sample, required: false,
  })
  const fields = [
    field('status', ['DRAFT', 'CANCELLED']),
    field('fromAccount', ['100', '200']),
    field('toAccount', ['100', '200'], '200'),
  ]
  const cases = buildCases(fields, {
    fieldsets: [{ values: { status: 'CANCELLED', fromAccount: '100' } }],
    distinct: [{ fields: ['fromAccount', 'toAccount'] }],
  })
  assert.deepEqual(cases.map((item) => item.varied), [
    { status: 'DRAFT', fromAccount: '100', toAccount: '200' },
    { status: 'DRAFT', fromAccount: '200', toAccount: '100' },
    { status: 'CANCELLED', fromAccount: '200', toAccount: '100' },
  ])

  const operation = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    post:
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/OrderRequest"
components:
  schemas:
    OrderRequest:
      type: object
      x-mutually-exclusive:
        - [couponCode, promotionCode]
      properties:
        couponCode: { type: string, example: SAVE10 }
        promotionCode: { type: string, example: SPRING }
`))[0]
  assert.deepEqual(operation.exclusive, [['couponCode', 'promotionCode']])
  const exclusiveFields = operation.fields.map((item) => (
    item.name === 'promotionCode' ? { ...item, vary: true, values: ['SPRING', OMIT] } : item
  ))
  const kept = buildCases(exclusiveFields, { exclusive: operation.exclusive })
  assert.equal(kept.length, 1)
  assert.equal(kept[0].body.couponCode, 'SAVE10')
  assert.equal(kept[0].body.promotionCode, undefined)
})

const BOUNDED = `
openapi: 3.1.0
paths:
  /api/orders:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [quantity, taxRate, orderNumber, countryCode, customerEmail]
              properties:
                quantity:
                  type: integer
                  minimum: 1
                  example: 2
                taxRate:
                  type: number
                  minimum: 0
                  maximum: 1
                  example: 0.08
                orderNumber:
                  type: string
                  maxLength: 4
                  example: AB
                countryCode:
                  type: string
                  pattern: "[A-Z]{2}"
                  example: HK
                customerEmail:
                  type: string
                  format: email
                  example: ada@example.com
                notes:
                  type: string
                  example: Leave at reception
                status:
                  type: string
                  enum: [DRAFT, CONFIRMED]
`

test('individual cases vary one field and keep the other defaults', () => {
  const fields = listOperations(parseSpecText(BOUNDED))[0].fields
  const cases = buildIndividualCases(fields)
  const byLabel = Object.fromEntries(cases.map((item) => [item.label, item]))

  assert.equal(byLabel['quantity at minimum 1'].body.quantity, 1)
  assert.equal(byLabel['quantity at minimum 1'].body.taxRate, 0.08)
  assert.equal(byLabel['quantity at minimum 1'].body.customerEmail, 'ada@example.com')
  assert.equal(byLabel['quantity at minimum 1'].body.notes, 'Leave at reception')
  assert.equal(byLabel['quantity at minimum 1'].body.status, 'DRAFT')
  assert.equal(byLabel['taxRate at minimum 0'].body.taxRate, 0)
  assert.equal(byLabel['taxRate at maximum 1'].body.taxRate, 1)
  assert.equal(byLabel['orderNumber at length 4'].body.orderNumber, 'AAAA')
  assert.equal(byLabel['orderNumber leading space'].body.orderNumber, ' AB')
  assert.equal(byLabel['orderNumber trailing space'].body.orderNumber, 'AB ')
  assert.equal(byLabel['orderNumber both spaces'].body.orderNumber, ' AB ')
  assert.equal(byLabel['countryCode pattern AA'].body.countryCode, 'AA')
  assert.equal(byLabel['countryCode pattern ZZ'].body.countryCode, 'ZZ')
  assert.equal(byLabel['status=DRAFT'], undefined)
  assert.equal(byLabel['status=CONFIRMED'].body.status, 'CONFIRMED')
  assert.equal(byLabel['status=CONFIRMED'].body.quantity, 2)
  assert.equal(byLabel['status=null'].body.status, null)
  assert.equal(byLabel['status=omit'].body.status, undefined)
  assert.equal(byLabel['status=omit'].body.quantity, 2)
  assert.equal(byLabel['notes leading space'].body.notes, ' Leave at reception')
  assert.equal(byLabel['notes trailing space'].body.notes, 'Leave at reception ')
  assert.equal(byLabel['notes both spaces'].body.notes, ' Leave at reception ')
  assert.equal(byLabel['notes=null'].body.notes, null)
  assert.equal(byLabel['notes=omit'].body.notes, undefined)
  assert.equal(byLabel['notes=omit'].body.orderNumber, 'AB')
  assert.equal(byLabel['notes=null'].body.orderNumber, 'AB')
  assert.equal(byLabel['quantity at minimum 1'].expect.outcome, 'accepted')
  assert.equal(individualChoices(fields.find((field) => field.name === 'customerEmail')).length, 0)
  assert.equal(individualChoices(fields.find((field) => field.name === 'orderNumber')).some((choice) => choice.id === 'null'), false)
  assert.equal(individualChoices(fields.find((field) => field.name === 'orderNumber')).some((choice) => choice.id === 'omit'), false)

  const quantity = fields.find((field) => field.name === 'quantity')
  quantity.individual = { min: false }
  assert.equal(buildIndividualCases(fields).some((item) => item.label === 'quantity at minimum 1'), false)
})

test('error cases break one constraint and expect that field to be rejected', () => {
  const fields = listOperations(parseSpecText(BOUNDED))[0].fields
  const cases = buildErrorCases(fields)
  const labels = cases.map((item) => item.label)

  assert.ok(labels.includes('omit every required field'))
  assert.ok(labels.includes('omit quantity'))
  assert.ok(labels.includes('quantity below minimum'))
  assert.ok(labels.includes('taxRate above maximum'))
  assert.ok(labels.includes('orderNumber longer than 4'))
  assert.ok(labels.includes('customerEmail is not an email'))
  assert.ok(labels.includes('status is not an allowed value'))
  assert.ok(labels.includes('countryCode does not match its pattern'))

  const below = cases.find((item) => item.label === 'quantity below minimum')
  assert.equal(below.body.quantity, 0)
  assert.equal(below.body.customerEmail, 'ada@example.com')
  assert.equal(below.body.notes, undefined)
  assert.equal(below.expect.field, 'quantity')

  const omitted = cases.find((item) => item.label === 'omit quantity')
  assert.equal(omitted.body.quantity, undefined)
  assert.equal(judge(omitted.expect, 400, JSON.stringify({ exceptions: [{ field: 'quantity', code: 'NotNull' }] })).passed, true)
  assert.equal(judge(below.expect, 200, '{}').passed, false)
  assert.equal(judge({ outcome: 'accepted' }, 404, '').detail, 'Validation accepted (404)')
})

const LIST_BOUNDS = `
openapi: 3.1.0
paths:
  /api/orders:
    get:
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [DRAFT, CONFIRMED]
        - name: orderedFrom
          in: query
          schema:
            type: string
            format: date-time
        - name: deliveryFrom
          in: query
          schema:
            type: string
            format: date
        - name: page
          in: query
          schema:
            type: integer
            minimum: 0
            default: 0
        - name: size
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 100
            default: 20
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [orderedAt]
              properties:
                orderedAt:
                  type: string
                  format: date-time
                  example: 2020-01-15T10:15:30Z
`

test('list filters reject a bad date format and use the published page bounds', () => {
  const fields = listOperations(parseSpecText(LIST_BOUNDS))[0].fields
  const errors = buildErrorCases(fields).map((item) => item.label)

  assert.ok(errors.includes('status is not an allowed value'))
  assert.ok(errors.includes('orderedFrom is not a timestamp'))
  assert.ok(errors.includes('deliveryFrom is not a date'))
  assert.ok(errors.includes('page below minimum'))
  assert.ok(errors.includes('size below minimum'))
  assert.ok(errors.includes('size above maximum'))
  assert.equal(errors.some((label) => label.includes('earlier than allowed') || label.includes('later than allowed')), false)

  const delivery = fields.find((item) => item.name === 'orderedFrom')
  delivery.sample = 'not-a-date'
  const isolated = buildErrorCases(fields).find((item) => item.label === 'page below minimum')
  assert.equal(isolated.query.page, -1)
  assert.equal(isolated.query.orderedFrom, undefined)

  delivery.sample = '2020-01-15T10:15:30Z'
  const byLabel = Object.fromEntries(buildIndividualCases(fields).map((item) => [item.label, item]))
  assert.equal(byLabel['page at minimum 0'].query.page, 0)
  assert.equal(byLabel['page at minimum 0'].query.orderedFrom, '2020-01-15T10:15:30Z')
  assert.equal(byLabel['size at minimum 1'].query.size, 1)
  assert.equal(byLabel['size at minimum 1'].query.orderedFrom, '2020-01-15T10:15:30Z')
  assert.equal(byLabel['size at maximum 100'].query.size, 100)
  assert.equal(byLabel['status=DRAFT'].query.status, 'DRAFT')
  assert.equal(byLabel['status=CONFIRMED'].query.status, 'CONFIRMED')
  assert.equal(byLabel['status=null'].query.status, '')
  assert.equal(byLabel['status=omit'], undefined)
  assert.equal(byLabel['status=DRAFT'].query.orderedFrom, '2020-01-15T10:15:30Z')
  assert.equal(byLabel['orderedFrom=null'].query.orderedFrom, '')

  fields.find((item) => item.name === 'status').sample = 'DRAFT'
  fields.find((item) => item.name === 'page').sample = 0
  const shifted = buildIndividualCases(fields)
  assert.equal(shifted.some((item) => item.label === 'status=DRAFT'), false)
  assert.equal(shifted.some((item) => item.label === 'page at minimum 0'), false)
  assert.equal(shifted.some((item) => item.label === 'status=CONFIRMED'), true)
  const omitted = shifted.find((item) => item.label === 'status=omit')
  assert.equal(omitted.query.status, undefined)
  assert.equal(omitted.query.orderedFrom, '2020-01-15T10:15:30Z')
})

test('a body timestamp still rejects a value later than the field allows', () => {
  const fields = listOperations(parseSpecText(LIST_BOUNDS))[1].fields
  const labels = buildErrorCases(fields).map((item) => item.label)
  assert.ok(labels.includes('orderedAt is later than allowed'))
  assert.ok(labels.includes('orderedAt is not a timestamp'))
})

test('a saved client reports operations and fields the spec no longer has', () => {
  const operations = [{ id: 'GET /api/orders', fields: [{ name: 'status' }] }]
  const profiles = [{
    name: 'Harbour',
    defaults: { global: { missingGlobal: 'x', status: 'DRAFT' }, operations: { 'GET /api/orders': { status: '' }, 'POST /api/orders': { quantity: 1 } } },
    cases: {
      operations: { 'GET /api/orders': [{ request: { gone: '1' }, omit: [] }] },
      values: { 'GET /api/orders': { missingValue: ['A'] } },
    },
  }]
  assert.deepEqual(specGaps(operations, profiles), [
    'Harbour defaults POST /api/orders',
    'Harbour global missingGlobal',
    'Harbour case GET /api/orders gone',
    'Harbour value GET /api/orders missingValue',
  ])
})

test('response expectations compare a sent request field and a typed value', () => {
  const views = [{
    status: '201',
    fields: [
      { name: 'status', type: 'string' },
      { name: 'id', type: 'integer' },
      { name: 'content[]', type: 'array of object' },
    ],
  }, {
    status: '400',
    fields: [{ name: 'status', type: 'string' }],
  }]
  const names = new Set(['status'])
  assert.deepEqual(responseChecks(views, names, { '201': { id: '' } }), { '201': { status: '@{status}' } })

  const request = { body: { status: 'CONFIRMED', orderNumber: 'ORD-1' }, query: {}, path: {} }
  const expectations = { '201': { status: '@{status}', orderNumber: '@{orderNumber}', note: 'fixed' } }
  const matched = judge(
    { outcome: 'success' },
    201,
    '{"status":"CONFIRMED","orderNumber":"ORD-1","note":"fixed"}',
    { request, expectations },
  )
  assert.equal(matched.passed, true)
  assert.equal(matched.detail, 'Response matched')

  const different = judge(
    { outcome: 'success' },
    201,
    '{"status":"DRAFT","orderNumber":"ORD-1","note":"fixed"}',
    { request, expectations },
  )
  assert.equal(different.passed, false)
  assert.match(different.detail, /status expected CONFIRMED/)

  const omitted = judge(
    { outcome: 'success' },
    201,
    '{"note":"fixed"}',
    { request: { body: {}, query: {}, path: {} }, expectations: { '201': { status: '@{status}', note: 'fixed' } } },
  )
  assert.equal(omitted.passed, true)

  const list = judge(
    { outcome: 'success' },
    200,
    '{"content":[{"status":"CONFIRMED"},{"status":"DRAFT"}]}',
    { request: { body: {}, query: { status: 'CONFIRMED' }, path: {} }, expectations: { '200': { 'content[].status': '@{status}' } } },
  )
  assert.equal(list.passed, false)
  assert.match(list.detail, /content\[\]\.status expected CONFIRMED/)

  const address = judge(
    { outcome: 'success' },
    201,
    '{"deliveryAddress":{"line1":"1 Harbour Road"}}',
    {
      request: { body: { deliveryAddress: { line1: '1 Harbour Road' } }, query: {}, path: {} },
      expectations: { '201': { 'deliveryAddress.line1': '@{deliveryAddress.line1}' } },
    },
  )
  assert.equal(address.passed, true)

  const zoned = judge(
    { outcome: 'success' },
    201,
    '{"orderedAt":"2020-01-15T02:15:30Z"}',
    { request: { body: { orderedAt: '2020-01-15T10:15:30+08:00' }, query: {}, path: {} }, expectations: { '201': { orderedAt: '@{orderedAt}' } } },
  )
  assert.equal(zoned.passed, true)

  const trimmed = judge(
    { outcome: 'accepted' },
    201,
    '{"orderNumber":"AB","notes":null}',
    {
      request: { body: { orderNumber: ' AB ', notes: '   ' }, query: {}, path: {} },
      expectations: { '201': { orderNumber: '@{orderNumber}', notes: '@{notes}' } },
    },
  )
  assert.equal(trimmed.passed, true)

  const kept = judge(
    { outcome: 'accepted' },
    201,
    '{"orderNumber":" AB "}',
    { request: { body: { orderNumber: ' AB ' }, query: {}, path: {} }, expectations: { '201': { orderNumber: '@{orderNumber}' } } },
  )
  assert.equal(kept.passed, false)
  assert.match(kept.detail, /orderNumber expected AB/)
})

test('custom cases send request overrides and match response fields', () => {
  const fields = [
    { name: 'status', location: 'body', type: 'string', sample: 'DRAFT', values: [], constraints: {} },
    { name: 'quantity', location: 'body', type: 'integer', sample: 1, values: [], constraints: {} },
    { name: 'notes', location: 'body', type: 'string', sample: 'Sample', values: [], constraints: {} },
  ]
  const [item] = buildCustomCases(fields, [{
    name: 'Confirmed',
    request: { status: 'CONFIRMED', quantity: '2' },
    omit: ['notes'],
    expect: { status: '201', fields: [{ path: 'status', equals: 'CONFIRMED' }, { path: 'id', equals: '' }] },
  }])

  assert.equal(item.label, 'Confirmed')
  assert.equal(item.body.status, 'CONFIRMED')
  assert.equal(item.body.quantity, 2)
  assert.equal(item.body.notes, undefined)
  const matched = judge(item.expect, 201, '{"id":8,"status":"CONFIRMED"}', {
    expectations: { '201': { status: 'CONFIRMED' } },
  })
  assert.equal(matched.passed, true)
  assert.equal(matched.detail, 'Response matched')
  assert.equal(judge(item.expect, 400, '{"id":8,"status":"CONFIRMED"}').passed, false)

  const nested = judge(
    { outcome: 'custom', status: '200' },
    200,
    '{"items":[{"orderNumber":"ORD-1001"}]}',
    { expectations: { '200': { 'items[].orderNumber': 'ORD-1001' } } },
  )
  assert.equal(nested.passed, true)

  const several = judge(
    { outcome: 'custom', status: '400' },
    400,
    '{"exceptions":[{"field":"quantity","code":"Positive","message":"must be positive"},{"field":"customerEmail","code":"NotBlank","message":"must not be blank"},{"field":"notes","code":"Size"}]}',
    { expectations: { '400': { exceptions: '[{"field":"customerEmail","code":"NotBlank"},{"field":"quantity","code":"Positive"}]' } } },
  )
  assert.equal(several.passed, true)

  const missingOne = judge(
    { outcome: 'custom', status: '400' },
    400,
    '{"exceptions":[{"field":"customerEmail","code":"NotBlank"}]}',
    { expectations: { '400': { exceptions: '[{"field":"customerEmail"},{"field":"quantity"}]' } } },
  )
  assert.equal(missingOne.passed, false)
  assert.match(missingOne.detail, /exceptions expected/)
})

test('an array of objects matches each listed object', () => {
  const expectations = {
    '400': {
      exceptions: '[{"field":"customerEmail","code":"NotBlank"},{"field":"quantity"}]',
    },
  }
  const matched = judge(
    { outcome: 'error', field: 'customerEmail' },
    400,
    '{"exceptions":[{"field":"quantity","code":"Positive","message":"must be positive"},{"field":"customerEmail","code":"NotBlank"}]}',
    { expectations },
  )
  assert.equal(matched.passed, true)

  const incomplete = judge(
    { outcome: 'success' },
    400,
    '{"exceptions":[{"field":"customerEmail","code":"NotBlank"}]}',
    { expectations },
  )
  assert.equal(incomplete.passed, false)
  assert.match(incomplete.detail, /exceptions expected/)

  const broken = judge(
    { outcome: 'success' },
    400,
    '{"exceptions":[]}',
    { expectations: { '400': { exceptions: '[{' } } },
  )
  assert.match(broken.detail, /JSON array of objects/)

  const reversed = judge(
    { outcome: 'error' },
    400,
    '{"exceptions":[{"field":"quantity","code":"Positive"},{"field":"customerEmail","code":"NotBlank"},{"field":"notes","code":"Size"}]}',
    { expectations: { '400': { exceptions: { value: '[{"field":"customerEmail"},{"field":"quantity"}]', ordered: true } } } },
  )
  assert.equal(reversed.passed, false)
  assert.match(reversed.detail, /\[0\] expected \{"field":"customerEmail"\}/)

  const ordered = judge(
    { outcome: 'error' },
    400,
    '{"exceptions":[{"field":"customerEmail","code":"NotBlank"},{"field":"quantity","code":"Positive"},{"field":"notes","code":"Size"}]}',
    { expectations: { '400': { exceptions: { value: '[{"field":"customerEmail"},{"field":"quantity"}]', ordered: true } } } },
  )
  assert.equal(ordered.passed, true)

  const customOrdered = judge(
    { outcome: 'custom', status: '400' },
    400,
    '{"exceptions":[{"field":"customerEmail","code":"NotBlank"},{"field":"quantity","code":"Positive"}]}',
    { expectations: { '400': { exceptions: { value: '[{"field":"quantity"},{"field":"customerEmail"}]', ordered: true } } } },
  )
  assert.equal(customOrdered.passed, false)
  assert.match(customOrdered.detail, /\[0\] expected \{"field":"quantity"\}/)
})
