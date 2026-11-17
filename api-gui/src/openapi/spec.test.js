import assert from 'node:assert/strict'
import test from 'node:test'
import { OMIT, OBJECT_COMPOSITE, OBJECT_FIELDS, applyPaging, collectPaging, individualChoices, buildIndividualCases, applyErrorOverrides, applyErrorRowToGroup, assignFixture, buildCases, buildCustomCases, buildCustomErrorCases, buildErrorCases, buildTrialCases, caseCount, combinationObjectMode, compilePattern, compositeField, detectPagination, enquiryShouldMiss, enquiryTarget, firstPageQuery, fixtureEnabled, fixtureNote, fixturePlan, fixtureRequest, fixtureSteps, judge, listOperations, operationGroups, operationRole, parseSpecText, planContinuation, readCreatedId, readItems, recordId, detectPayloadId, idNameRank, resolvedId, readExpectation, responseChecks, responseViews, responsesForMode, sampleCall, scalarCombinationField, specGaps, storedExpectation, textCombinationField, underComposite, viewsWithStatuses, withFixtureId, withTextCombinationValues } from './spec.js'
import { resolvePagination, storedPaging } from './pagination.js'

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

test('a POST body cursor with first page 0 treats totalSize as this page', () => {
  const operation = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/shipments/queryShipments:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                nextCursor: { type: string, default: "0", example: "0" }
                size: { type: integer }
                reference: { type: string }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  content: { type: array, items: { type: object } }
                  nextCursor: { type: string }
                  totalSize: { type: integer }
`))[0]
  assert.equal(operation.pagination.style, 'cursor')
  assert.equal(operation.pagination.request.cursor, 'nextCursor')
  assert.deepEqual(operation.pagination.firstCursor, { type: 'string', value: '0' })
  assert.deepEqual(operation.pagination.lastCursor, { type: 'string', value: '0' })
  assert.equal(operation.pagination.response.total, null)
  assert.deepEqual(operation.pagination.response.size, ['totalSize'])
  assert.deepEqual(firstPageQuery(operation.pagination, {}), { nextCursor: '0' })
  const more = planContinuation(operation.pagination, { nextCursor: '0', size: 1 }, {
    content: [{ id: 1 }], totalSize: 1, nextCursor: 'MQ.hash',
  }, [{ count: 1, cursor: '0' }])
  assert.equal(more.query.nextCursor, 'MQ.hash')
  const last = planContinuation(operation.pagination, { nextCursor: 'MQ.hash', size: 1 }, {
    content: [{ id: 2 }], totalSize: 1, nextCursor: '0',
  }, [{ count: 1, cursor: '0' }, { count: 1, cursor: 'MQ.hash' }])
  assert.equal(last, null)

  const override = storedPaging({
    mode: 'cursor',
    request: { size: 'size', cursor: 'nextCursor' },
    response: { cursor: 'nextCursor', pageSize: 'totalSize' },
    firstCursor: { type: 'string', value: '0' },
    lastCursor: { type: 'string', value: '0' },
  })
  const resolved = resolvePagination(null, override)
  assert.equal(resolved.style, 'cursor')
  assert.deepEqual(resolved.response.size, ['totalSize'])
  assert.equal(resolved.response.total, null)
  const paged = applyPaging(
    { query: {}, body: { reference: 'SHP', size: 20 } },
    resolved,
    firstPageQuery(resolved, collectPaging({ query: {}, body: { reference: 'SHP', size: 20 } }, resolved)),
    operation.fields,
  )
  assert.equal(paged.body.nextCursor, '0')
  assert.equal(paged.body.size, 20)
  assert.equal(paged.body.reference, 'SHP')
  assert.equal(paged.query.nextCursor, undefined)
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

test('a composite nested object is one combination value for all of its fields', () => {
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
                  required: [city, region]
                  properties:
                    city:
                      type: string
                      enum: [HK, KL]
                    region:
                      type: object
                      required: [code]
                      properties:
                        code:
                          type: string
                          enum: [N, S]
                        district:
                          type: object
                          properties:
                            name:
                              type: string
                              enum: [Central, East]
`))[0].fields
  assert.equal(compositeField(fields.find((field) => field.name === 'deliveryAddress'), fields), false)
  assert.equal(compositeField(fields.find((field) => field.name === 'deliveryAddress.region'), fields), true)
  assert.equal(compositeField(fields.find((field) => field.name === 'deliveryAddress.region.district'), fields), true)
  assert.equal(underComposite('deliveryAddress.region.code', fields), true)
  assert.equal(underComposite('deliveryAddress.city', fields), false)
  const cases = buildCases(fields)
  assert.equal(cases.length, 2)
  assert.deepEqual(cases.map((item) => item.body.deliveryAddress.city).sort(), ['HK', 'KL'])
  for (const item of cases) {
    assert.equal(item.body.deliveryAddress.region.code, 'N')
    assert.equal(item.body.deliveryAddress.region.district.name, 'Central')
    assert.equal(item.varied['deliveryAddress.region.code'], undefined)
    assert.equal(item.varied['deliveryAddress.region.district.name'], undefined)
  }
})

test('a marked composite object crosses child value sets together', () => {
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
                  required: [city, region]
                  properties:
                    city:
                      type: string
                      enum: [HK, KL]
                    region:
                      type: object
                      required: [code, name]
                      properties:
                        code: { type: string, example: HK-IS }
                        name: { type: string, example: Island }
`))[0].fields
  const region = fields.find((field) => field.name === 'deliveryAddress.region')
  assert.equal(combinationObjectMode(region, fields), 'fields')
  const marked = fields.map((field) => field.name === 'deliveryAddress' ? { ...field, sample: OBJECT_COMPOSITE } : field)
  assert.equal(compositeField(marked.find((field) => field.name === 'deliveryAddress'), marked), true)
  assert.equal(underComposite('deliveryAddress.city', marked), true)
  const independent = fields.map((field) => field.name === 'deliveryAddress.region' ? { ...field, sample: OBJECT_FIELDS } : field)
  assert.equal(compositeField(independent.find((field) => field.name === 'deliveryAddress.region'), independent), true)
  const crossed = withTextCombinationValues(fields, {
    'deliveryAddress.region': [
      { code: 'A', name: 'RegA' },
      { code: 'B', name: 'RegB' },
    ],
  }, {})
  const regionField = crossed.find((field) => field.name === 'deliveryAddress.region')
  assert.equal(regionField.vary, true)
  assert.equal(regionField.values.length, 2)
  const cases = buildCases(crossed)
  assert.equal(cases.length, 4)
  assert.deepEqual(
    [...new Set(cases.map((item) => `${item.body.deliveryAddress.region.code}|${item.body.deliveryAddress.region.name}`))].sort(),
    ['A|RegA', 'B|RegB'],
  )
})

test('a composite without try values uses the default only', () => {
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
                  properties:
                    region:
                      type: object
                      properties:
                        code: { type: string, example: HK-IS }
                        name: { type: string, example: Island }
`))[0].fields
  const region = fields.find((field) => field.name === 'deliveryAddress.region')
  assert.equal(compositeField(region, fields), true)
  const untouched = withTextCombinationValues(fields, {}, {})
  assert.equal(untouched.find((field) => field.name === 'deliveryAddress.region').vary, false)
  const cases = buildCases(untouched)
  assert.equal(cases.length, 1)
  assert.equal(cases[0].body.deliveryAddress.region.code, 'HK-IS')
  assert.equal(cases[0].body.deliveryAddress.region.name, 'Island')
  const withNull = withTextCombinationValues(fields, { 'deliveryAddress.region': ['@null', '@empty', '@omit'] }, {})
  assert.equal(withNull.find((field) => field.name === 'deliveryAddress.region').values.length, 3)
  const mixed = buildCases(withNull)
  assert.equal(mixed.filter((item) => item.body.deliveryAddress?.region?.code === 'HK-IS').length, 0)
  assert.equal(mixed.filter((item) => item.body.deliveryAddress?.region === null).length, 1)
  assert.equal(mixed.filter((item) => item.body.deliveryAddress?.region && Object.keys(item.body.deliveryAddress.region).length === 0).length, 1)
  assert.equal(mixed.filter((item) => item.varied['deliveryAddress.region'] === OMIT).length, 1)
})

test('a composite default is not counted again as a try value', () => {
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
                  required: [region]
                  properties:
                    region:
                      type: object
                      required: [code, name]
                      properties:
                        code: { type: string, example: HK-IS }
                        name: { type: string, example: Island }
`))[0].fields
  const crossed = withTextCombinationValues(fields, {
    'deliveryAddress.region': [
      { code: 'HK-IS', name: 'Island' },
      { code: 'B', name: 'RegB' },
      '@null',
      '@empty',
      '@omit',
    ],
  }, {})
  const region = crossed.find((field) => field.name === 'deliveryAddress.region')
  assert.equal(region.vary, true)
  assert.equal(region.values.length, 2)
  const cases = buildCases(crossed)
  assert.equal(cases.length, 2)
  assert.deepEqual(
    [...new Set(cases.map((item) => `${item.body.deliveryAddress.region.code}|${item.body.deliveryAddress.region.name}`))].sort(),
    ['B|RegB', 'HK-IS|Island'],
  )
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

test('combination and individual keep success schemas and error keeps the error schemas', () => {
  const views = [
    { status: '200', fields: [{ name: 'id' }] },
    { status: '201', fields: [{ name: 'id' }] },
    { status: '400', fields: [{ name: 'exceptions[].code' }] },
    { status: '404', fields: [{ name: 'exceptions[].code' }] },
  ]
  assert.deepEqual(responsesForMode(views, 'combination').map((view) => view.status), ['200', '201'])
  assert.deepEqual(responsesForMode(views, 'individual').map((view) => view.status), ['200', '201'])
  assert.deepEqual(responsesForMode(views, 'error').map((view) => view.status), ['400', '404'])
  assert.deepEqual(responsesForMode(views, 'custom').map((view) => view.status), ['200', '201', '400', '404'])
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

test('combination enums can hold a subset of values or skip the field', () => {
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
              required: [status]
              properties:
                status:
                  type: string
                  enum: [DRAFT, CONFIRMED, CANCELLED, FAILED, CLOSED]
`))[0].fields
  const subset = withTextCombinationValues(fields, { status: ['DRAFT', 'CONFIRMED', 'FAILED'] }, {})
  const status = subset.find((field) => field.name === 'status')
  assert.equal(status.vary, true)
  assert.deepEqual(status.values, ['DRAFT', 'CONFIRMED', 'FAILED'])
  assert.equal(buildCases(subset).length, 3)
  const held = withTextCombinationValues(fields, { status: ['DRAFT', 'CONFIRMED'] }, {}, { status: false })
  assert.equal(held.find((field) => field.name === 'status').vary, false)
  assert.equal(buildCases(held).length, 1)
  assert.equal(buildCases(held)[0].body.status, 'DRAFT')
})

test('a nested records path can be read and overridden', () => {
  const operation = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/orders:
    get:
      parameters:
        - name: page
          in: query
          schema: { type: integer }
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
                  data:
                    type: object
                    properties:
                      page:
                        type: object
                        properties:
                          content: { type: array, items: { type: object } }
                  totalPages: { type: integer }
`))[0]
  assert.equal(operation.pagination.style, 'page')
  const overlay = storedPaging({ mode: 'detected', response: { items: 'data.page.content' } })
  const pagination = resolvePagination(operation.pagination, overlay)
  assert.deepEqual(pagination.response.items, ['data', 'page', 'content'])
  const rows = readItems({ data: { page: { content: [{ id: 1 }, { id: 2 }] } } }, pagination)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, 1)
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

test('an optional object is filled, null, or omitted in combinations', () => {
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
              required: [status]
              properties:
                status:
                  type: string
                  enum: [DRAFT, CONFIRMED]
                deliveryAddress:
                  type: object
                  required: [line1, city]
                  properties:
                    line1:
                      type: string
                      example: 1 Road
                    city:
                      type: string
                      enum: [Hong Kong, Kowloon]
`))[0].fields
  const address = fields.find((field) => field.name === 'deliveryAddress')
  assert.equal(address.required, false)
  assert.equal(address.vary, true)
  assert.deepEqual(address.values, [OBJECT_FIELDS, null, OMIT])
  const cases = buildCases(fields)
  assert.equal(caseCount(fields), 8)
  assert.equal(cases.length, 8)
  const filled = cases.filter((item) => item.varied.deliveryAddress === OBJECT_FIELDS)
  assert.equal(filled.length, 4)
  assert.equal(filled[0].body.deliveryAddress.line1, '1 Road')
  assert.ok(filled.some((item) => item.body.deliveryAddress.city === 'Hong Kong' && item.body.status === 'DRAFT'))
  assert.ok(filled.some((item) => item.body.deliveryAddress.city === 'Kowloon' && item.body.status === 'CONFIRMED'))
  const nulled = cases.filter((item) => item.body.deliveryAddress === null)
  assert.equal(nulled.length, 2)
  assert.equal(nulled[0].body.status, 'DRAFT')
  assert.equal(nulled[1].body.status, 'CONFIRMED')
  assert.equal(nulled[0].varied['deliveryAddress.city'], undefined)
  const omitted = cases.filter((item) => item.body.deliveryAddress === undefined && item.varied.deliveryAddress === OMIT)
  assert.equal(omitted.length, 2)
  assert.equal(omitted[0].body.status, 'DRAFT')
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
  assert.equal(omitted.group, 'missing')
  assert.equal(omitted.expect.code, 'NotNull')
  const quantityNull = cases.find((item) => item.label === 'quantity is null')
  assert.equal(quantityNull.group, 'disallowed')
  assert.equal(quantityNull.body.quantity, null)
  assert.equal(quantityNull.expect.code, 'NotNull')
  assert.equal(quantityNull.body.customerEmail, 'ada@example.com')
  const emailNull = cases.find((item) => item.label === 'customerEmail is null')
  assert.equal(emailNull.body.customerEmail, null)
  assert.equal(emailNull.expect.code, 'NotNull')
  assert.equal(cases.find((item) => item.label === 'notes is null'), undefined)
  assert.equal(cases.find((item) => item.label === 'status is null'), undefined)
  assert.equal(judge(omitted.expect, 400, JSON.stringify({ exceptions: [{ field: 'quantity', code: 'NotNull' }] })).passed, true)
  assert.equal(judge(omitted.expect, 400, JSON.stringify({ exceptions: [{ field: 'quantity', code: 'NotBlank' }] })).passed, false)
  assert.equal(judge(below.expect, 200, '{}').passed, false)
  assert.equal(judge({ outcome: 'accepted' }, 404, '').detail, 'Validation accepted (404)')
  const malformed = cases.find((item) => item.label === 'Malformed JSON')
  assert.equal(malformed.group, 'malformed')
  assert.equal(malformed.rawBody, '{')
  assert.equal(malformed.expect.code, 'MalformedJson')
  assert.equal(cases.find((item) => item.label === 'quantity below minimum').expect.code, 'Min')
  assert.equal(cases.find((item) => item.label === 'customerEmail is not an email').group, 'disallowed')
  assert.equal(cases.find((item) => item.label === 'orderNumber longer than 4').expect.code, 'Size')

  const nullable = buildErrorCases([{
    name: 'status', location: 'body', type: 'string', required: true, enum: true, object: false,
    members: [null, 'DRAFT'], values: [null, 'DRAFT'], sample: 'DRAFT', constraints: {},
  }])
  assert.equal(nullable.find((item) => item.label === 'status is null'), undefined)

  const objectCases = buildErrorCases([
    { name: 'deliveryAddress', location: 'body', type: 'object', object: true, required: true, sample: '', values: [], constraints: {} },
    { name: 'deliveryAddress.line1', location: 'body', type: 'string', required: true, sample: '1 Road', values: [], constraints: {} },
  ])
  assert.equal(objectCases.find((item) => item.label === 'deliveryAddress is null').body.deliveryAddress, null)
  assert.equal(objectCases.find((item) => item.label === 'deliveryAddress.line1 is null').body.deliveryAddress.line1, null)
})

test('an expected value can be copied to the rest of its category', () => {
  const rows = [
    { group: 'disallowed', label: 'quantity is null', expect: { code: 'NotNull' } },
    { group: 'disallowed', label: 'customerEmail is null', expect: { code: 'NotNull' } },
    { group: 'missing', label: 'omit quantity', expect: { code: 'NotNull' } },
  ]
  const saved = {
    'disallowed:quantity is null': { values: { 'exceptions[].message': '@{field} is null' } },
    'disallowed:customerEmail is null': { values: { 'exceptions[].code': 'Size' } },
  }
  const next = applyErrorRowToGroup(saved, rows, rows[0])
  assert.equal(next['disallowed:customerEmail is null'].values['exceptions[].message'], '@{field} is null')
  assert.equal(next['disallowed:customerEmail is null'].values['exceptions[].code'], 'Size')
  assert.equal(next['missing:omit quantity'], undefined)
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

test('an error message template finds the selected field inside the exception text', () => {
  const embedded = { outcome: 'error', status: 400, field: 'orderNumber', code: 'Size', message: '@{field} is too long' }
  const body = JSON.stringify({ exceptions: [{ field: 'body', code: 'Size', message: 'orderNumber is too long' }] })
  assert.equal(judge(embedded, 400, body).passed, true)
  const property = { outcome: 'error', status: 400, field: 'orderNumber', code: 'Size', message: 'is too long' }
  assert.equal(judge(property, 400, body).passed, false)
  const aligned = JSON.stringify({ exceptions: [{ field: 'orderNumber', code: 'Size', message: 'is too long' }] })
  assert.equal(judge(property, 400, aligned).passed, true)
  const sent = judge(
    { outcome: 'error', status: 400, field: 'orderNumber', message: 'rejected @{orderNumber}' },
    400,
    JSON.stringify({ exceptions: [{ field: 'note', code: 'Size', message: 'rejected ABC' }] }),
    { request: { body: { orderNumber: 'ABC' } } },
  )
  assert.equal(sent.passed, true)
  const [overridden] = applyErrorOverrides([{
    group: 'disallowed',
    label: 'status is not an allowed value',
    expect: { outcome: 'error', status: 400, field: 'status', code: 'InvalidFormat' },
  }], {
    columns: ['exceptions[].code', 'exceptions[].message'],
    rows: { 'disallowed:status is not an allowed value': { status: '422', values: { 'exceptions[].message': '@{field} is not allowed' } } },
  })
  assert.equal(overridden.expect.status, 422)
  assert.equal(overridden.expect.subject, 'status')
  assert.equal(overridden.expect.field, undefined)
  assert.equal(overridden.expect.values['exceptions[].code'], 'InvalidFormat')
  assert.equal(overridden.expect.values['exceptions[].message'], '@{field} is not allowed')
  const matched = judge(overridden.expect, 422, JSON.stringify({
    exceptions: [{ field: 'other', code: 'InvalidFormat', message: 'status is not allowed' }],
  }))
  assert.equal(matched.passed, true)
  const split = judge(overridden.expect, 422, JSON.stringify({
    exceptions: [
      { field: 'other', code: 'InvalidFormat', message: 'nope' },
      { field: 'status', code: 'Size', message: 'status is not allowed' },
    ],
  }))
  assert.equal(split.passed, false)
})

test('a custom error sends one value and expects its status and code', () => {
  const fields = listOperations(parseSpecText(BOUNDED))[0].fields
  const [item] = buildCustomErrorCases(fields, [{ name: 'Unknown status', status: '409', field: 'status', code: 'Conflict', value: 'NOPE' }])
  assert.equal(item.group, 'custom')
  assert.equal(item.body.status, 'NOPE')
  assert.equal(item.expect.status, 409)
  assert.equal(item.expect.values['exceptions[].code'], 'Conflict')
  assert.equal(item.expect.field, undefined)
  assert.equal(judge(item.expect, 409, JSON.stringify({ exceptions: [{ field: 'status', code: 'Conflict' }] })).passed, true)
  assert.equal(judge(item.expect, 400, JSON.stringify({ exceptions: [{ field: 'status', code: 'Conflict' }] })).passed, false)
})

test('list filters reject a bad date format and use the published page bounds', () => {
  const fields = listOperations(parseSpecText(LIST_BOUNDS))[0].fields
  const errors = buildErrorCases(fields).map((item) => item.label)

  assert.ok(errors.includes('status is not an allowed value'))
  assert.ok(errors.includes('orderedFrom is not a timestamp'))
  assert.equal(buildErrorCases(fields).find((item) => item.label === 'orderedFrom is not a timestamp').group, 'type')
  assert.equal(buildErrorCases(fields).find((item) => item.label === 'orderedFrom is not a timestamp').expect.code, 'InvalidFormat')
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
  const cursorViews = [{
    status: '200',
    fields: [
      { name: 'nextCursor', type: 'string' },
      { name: 'size', type: 'integer' },
      { name: 'reference', type: 'string' },
    ],
  }]
  assert.deepEqual(
    responseChecks(cursorViews, new Set(['nextCursor', 'size', 'reference'])),
    { '200': { size: '@{size}', reference: '@{reference}' } },
  )

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

  const any = judge(
    { outcome: 'success' },
    200,
    '{"content":[{"status":"CONFIRMED"},{"status":"DRAFT"}]}',
    { request: { body: {}, query: { status: '' }, path: {} }, expectations: { '200': { 'content[].status': '@{status}' } } },
  )
  assert.equal(any.passed, true)

  const filterOmitted = judge(
    { outcome: 'success' },
    200,
    '{"content":[{"status":"CONFIRMED"},{"status":"DRAFT"}]}',
    { request: { body: {}, query: {}, path: {} }, expectations: { '200': { 'content[].status': '@{status}' } } },
  )
  assert.equal(filterOmitted.passed, true)

  const bodyNull = judge(
    { outcome: 'success' },
    200,
    '{"content":[{"reference":"A"},{"reference":"B"}]}',
    { request: { body: { reference: null }, query: {}, path: {} }, expectations: { '200': { 'content[].reference': '@{reference}' } } },
  )
  assert.equal(bodyNull.passed, true)

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

test('a response field can match a typed regex or a named pattern', () => {
  assert.equal(compilePattern('^[A-Z]{2}$').regex.test('HK'), true)
  assert.equal(compilePattern('/ord-\\d+/i').regex.test('ORD-12'), true)
  assert.equal(Boolean(compilePattern('(').error), true)
  assert.deepEqual(storedExpectation({ match: 'regex', text: '^[0-9]+$' }), { regex: '^[0-9]+$' })
  assert.deepEqual(storedExpectation({ match: 'pattern', text: 'uuid' }), { pattern: 'uuid' })
  assert.equal(readExpectation({ regex: '^[0-9]+$' }).match, 'regex')
  assert.equal(readExpectation({ pattern: 'uuid' }).text, 'uuid')

  const views = [{ status: '201', fields: [{ name: 'id', type: 'integer' }, { name: 'status', type: 'string' }] }]
  assert.deepEqual(
    responseChecks(views, new Set(['status']), { '201': { id: { regex: '^[0-9]+$' } } }),
    { '201': { id: { regex: '^[0-9]+$' }, status: '@{status}' } },
  )
  assert.deepEqual(
    responseChecks(views, new Set(['status']), { '201': { id: { match: 'regex' } } }),
    { '201': { status: '@{status}' } },
  )

  const matched = judge(
    { outcome: 'success' },
    201,
    '{"id":42,"status":"CONFIRMED"}',
    { request: { body: { status: 'CONFIRMED' }, query: {}, path: {} }, expectations: { '201': { id: { regex: '^[0-9]+$' }, status: '@{status}' } } },
  )
  assert.equal(matched.passed, true)

  const missed = judge(
    { outcome: 'success' },
    201,
    '{"id":"ORD-1","status":"CONFIRMED"}',
    { request: { body: {}, query: {}, path: {} }, expectations: { '201': { id: { regex: '^[0-9]+$' } } } },
  )
  assert.equal(missed.passed, false)
  assert.match(missed.detail, /id expected to match/)

  const named = judge(
    { outcome: 'success' },
    201,
    '{"id":"a1b2"}',
    { request: { body: {}, query: {}, path: {} }, expectations: { '201': { id: { pattern: 'hex' } } }, patterns: { hex: '^[0-9a-f]+$' } },
  )
  assert.equal(named.passed, true)

  const unknown = judge(
    { outcome: 'success' },
    201,
    '{"id":"a1b2"}',
    { request: { body: {}, query: {}, path: {} }, expectations: { '201': { id: { pattern: 'hex' } } }, patterns: {} },
  )
  assert.equal(unknown.passed, false)
  assert.match(unknown.detail, /unknown pattern hex/)
})

test('a trial sends one request from typed values and defaults', () => {
  const fields = [
    { name: 'status', location: 'body', type: 'string', sample: 'DRAFT', values: [], constraints: {} },
    { name: 'notes', location: 'body', type: 'string', sample: 'Leave at reception', values: [], constraints: {} },
  ]
  const [item] = buildTrialCases(fields, { request: { status: 'CONFIRMED' }, omit: [] })
  assert.equal(item.kind, 'trial')
  assert.equal(item.body.status, 'CONFIRMED')
  assert.equal(item.body.notes, 'Leave at reception')
  assert.equal(item.expect.outcome, 'success')
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

test('a custom case checks its own error code and returned content', () => {
  const created = judge(
    {
      outcome: 'custom',
      status: '201',
      fields: [
        { path: 'orderNumber', equals: '@{orderNumber}' },
        { path: 'status', equals: 'CONFIRMED' },
        { path: 'content', equals: '' },
      ],
    },
    201,
    '{"orderNumber":"ORD-1","status":"CONFIRMED"}',
    {
      request: { body: { orderNumber: 'ORD-1', status: 'CONFIRMED' }, query: {}, path: {} },
      expectations: { '201': { orderNumber: 'SHOULD-NOT-APPLY' } },
    },
  )
  assert.equal(created.passed, true)
  assert.equal(created.detail, 'Response matched')

  const echoed = judge(
    { outcome: 'custom', status: '201', fields: [{ path: 'status', equals: 'CONFIRMED' }] },
    201,
    '{"orderNumber":"ORD-1","customerEmail":"ada@example.com","status":"CONFIRMED"}',
    {
      request: { body: { orderNumber: 'ORD-1', status: 'CONFIRMED' }, query: {}, path: {} },
      expectations: { '201': { orderNumber: '@{orderNumber}', customerEmail: '@{customerEmail}', status: '@{status}' } },
    },
  )
  assert.equal(echoed.passed, true)

  const different = judge(
    { outcome: 'custom', status: '201', fields: [{ path: 'status', equals: 'CONFIRMED' }] },
    201,
    '{"orderNumber":"OTHER","status":"CONFIRMED"}',
    {
      request: { body: { orderNumber: 'ORD-1', status: 'CONFIRMED' }, query: {}, path: {} },
      expectations: { '201': { orderNumber: '@{orderNumber}' } },
    },
  )
  assert.equal(different.passed, false)
  assert.match(different.detail, /orderNumber expected ORD-1/)

  const wrongContent = judge(
    { outcome: 'custom', status: '201', fields: [{ path: 'status', equals: 'CONFIRMED' }] },
    201,
    '{"status":"DRAFT"}',
  )
  assert.equal(wrongContent.passed, false)
  assert.match(wrongContent.detail, /status expected CONFIRMED/)

  const rejected = {
    outcome: 'custom',
    status: '400',
    fields: [
      { path: 'exceptions[].field', equals: 'customerEmail' },
      { path: 'exceptions[].code', equals: 'NotBlank' },
    ],
  }
  const same = judge(rejected, 400, '{"exceptions":[{"field":"customerEmail","code":"NotBlank","message":"must not be blank"}]}')
  assert.equal(same.passed, true)
  const split = judge(rejected, 400, '{"exceptions":[{"field":"customerEmail","code":"Size"},{"field":"notes","code":"NotBlank"}]}')
  assert.equal(split.passed, false)
  assert.match(split.detail, /exceptions\[\]/)

  const listed = judge(
    {
      outcome: 'custom',
      status: '200',
      fields: [{ path: 'content', equals: '[{"orderNumber":"ORD-1"}]', ordered: true }],
    },
    200,
    '{"content":[{"orderNumber":"ORD-1","status":"DRAFT"}]}',
  )
  assert.equal(listed.passed, true)
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

const RESOURCE = `
openapi: 3.1.0
tags:
  - name: Orders
paths:
  /api/orders:
    get:
      tags: [Orders]
      summary: List orders
    post:
      tags: [Orders]
      summary: Create an order
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [orderNumber]
              properties:
                orderNumber:
                  type: string
                  example: ORD-1
  /api/orders/{id}:
    get:
      tags: [Orders]
      summary: Get one order
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
    put:
      tags: [Orders]
      summary: Replace an order
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [orderNumber]
              properties:
                orderNumber:
                  type: string
                  example: ORD-1
    delete:
      tags: [Orders]
      summary: Delete an order
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
`

test('a run for one record creates it from the collection and deletes it afterwards', () => {
  const operations = listOperations(parseSpecText(RESOURCE))
  const byId = Object.fromEntries(operations.map((operation) => [operation.id, operation]))
  const getOne = byId['GET /api/orders/{id}']
  const plan = fixturePlan(getOne, operations, {})
  assert.equal(plan.create.id, 'POST /api/orders')
  assert.equal(plan.cleanup.id, 'DELETE /api/orders/{id}')
  assert.equal(plan.idField, 'id')
  assert.equal(recordId(getOne).name, 'id')
  assert.equal(recordId(getOne).source, 'path')
  assert.equal(recordId(byId['POST /api/orders']), null)
  assert.equal(recordId(byId['GET /api/orders']), null)
  assert.equal(plan.placeholder, 1)
  assert.equal(plan.missingId, 0)
  assert.equal(plan.consumeSuccess, false)

  const fields = getOne.fields
  const success = buildCases(fields, {})
  const errors = buildErrorCases(fields)
  const missing = buildCustomErrorCases(fields, [{ name: 'Missing order', status: '404', code: 'NotFound' }])
  const chosen = buildCustomCases(fields, [{ name: 'Known order', request: { id: 42 }, expect: { status: '200' } }])
  const assigned = assignFixture([...success, ...errors, ...missing, ...chosen], plan)
  assert.equal(assigned[0].needsFixture, true)
  assert.equal(assigned[0].path.id, 1)
  const invalid = assigned.find((item) => item.path.id === 'abc')
  assert.ok(invalid)
  assert.equal(invalid.needsFixture, undefined)
  const notFound = assigned.find((item) => item.label === 'Missing order')
  assert.equal(notFound.path.id, 0)
  assert.equal(notFound.needsFixture, false)
  const known = assigned.find((item) => item.label === 'Known order')
  assert.equal(known.path.id, 42)
  assert.equal(known.needsFixture, undefined)
  assert.match(fixtureNote(plan, success), /creates a record first/)

  const replaced = withFixtureId(assigned[0], 'id', 15)
  assert.equal(replaced.path.id, 15)
  assert.equal(replaced.label, 'id=15')
  assert.equal(replaced.needsFixture, false)

  assert.equal(fixturePlan(byId['POST /api/orders'], operations, {}), null)
  assert.equal(fixturePlan(byId['GET /api/orders'], operations, {}), null)
  assert.equal(fixturePlan(getOne, operations, { operations: { 'GET /api/orders/{id}': { id: '${orderId}' } } }), null)
  assert.equal(fixturePlan(getOne, operations, { global: { id: 7 } }), null)

  const remove = fixturePlan(byId['DELETE /api/orders/{id}'], operations, {})
  assert.equal(remove.consumeSuccess, true)
  const deleted = assignFixture(buildCases(byId['DELETE /api/orders/{id}'].fields, {}), remove)
  assert.equal(deleted[0].ownRecord, true)
  assert.equal(deleted[0].needsFixture, undefined)
  assert.match(fixtureNote(remove, deleted), /own record/)

  const call = sampleCall(byId['POST /api/orders'], { operations: { 'POST /api/orders': { orderNumber: 'ORD-9' } } })
  assert.equal(call.body.orderNumber, 'ORD-9')
  assert.equal(readCreatedId(201, '{"id":15,"orderNumber":"ORD-9"}', null), 15)
  assert.equal(readCreatedId(201, '{}', '/api/orders/15'), 15)
  assert.equal(readCreatedId(201, 'not-json', 'http://localhost:8088/api/orders/9'), 9)
  assert.equal(readCreatedId(400, '{"id":1}', '/api/orders/1'), null)

  const getSteps = fixtureSteps(getOne, operations, {})
  assert.deepEqual(getSteps.calls.map((call) => call.role), ['before', 'after'])
  assert.equal(getSteps.calls[0].operation.id, 'POST /api/orders')
  assert.equal(getSteps.calls[1].operation.id, 'DELETE /api/orders/{id}')
  assert.equal(getSteps.enquiry, null)
  const replaceSteps = fixtureSteps(byId['PUT /api/orders/{id}'], operations, {})
  assert.deepEqual(replaceSteps.calls.map((call) => `${call.role} ${call.operation.method} ${call.operation.path}`), [
    'before POST /api/orders',
    'enquiry GET /api/orders/{id}',
    'after DELETE /api/orders/{id}',
  ])
  assert.equal(fixtureEnabled(undefined, 'before'), true)
  assert.equal(fixtureEnabled(undefined, 'enquiry'), false)
  assert.equal(fixtureEnabled({ before: false }, 'before'), false)
  assert.equal(enquiryTarget({ path: { id: 15 } }, 'id'), 15)
  assert.equal(enquiryTarget({ path: { id: 'abc' } }, 'id'), null)
  assert.equal(enquiryShouldMiss({ expect: { status: 404 } }, 400, false), true)
  assert.equal(enquiryShouldMiss({ expect: { outcome: 'success' } }, 204, true), true)
  assert.equal(enquiryShouldMiss({ expect: { outcome: 'success' } }, 200, false), false)
})

test('an operation name gives its create, read, update, or delete role', () => {
  assert.equal(operationRole({ operationId: 'createOrder' }), 'create')
  assert.equal(operationRole({ path: '/orders/inputOrder' }), 'create')
  assert.equal(operationRole({ summary: 'Create an order' }), 'create')
  assert.equal(operationRole({ operationId: 'updateOrder' }), 'update')
  assert.equal(operationRole({ path: '/orders/changeStatus' }), 'update')
  assert.equal(operationRole({ operationId: 'readOrder' }), 'read')
  assert.equal(operationRole({ operationId: 'getOrder' }), 'read')
  assert.equal(operationRole({ path: '/orders/queryOrders' }), 'read')
  assert.equal(operationRole({ operationId: 'enquireOrder' }), 'read')
  assert.equal(operationRole({ operationId: 'enquiryOrder' }), 'read')
  assert.equal(operationRole({ operationId: 'deleteOrder' }), 'delete')
  assert.equal(operationRole({ path: '/orders/revokeAccess' }), 'delete')
  assert.equal(operationRole({ summary: 'Cancel an order' }), 'delete')
  assert.equal(operationRole({ operationId: 'listOrders' }), '')
  assert.equal(operationRole({ operationId: 'replaceOrder' }), '')
  assert.equal(operationRole({ summary: 'createdAt is returned' }), '')
  assert.equal(operationRole({ method: 'GET', operationId: 'listOrders' }), 'read')
  assert.equal(operationRole({ method: 'PUT', operationId: 'replaceProduct' }), 'update')
  assert.equal(operationRole({ method: 'PATCH', summary: 'Amend a note' }), 'update')
  assert.equal(operationRole({ method: 'DELETE', path: '/orders/{id}' }), 'delete')
  assert.equal(operationRole({ method: 'POST', path: '/orders' }), 'create')
  assert.equal(operationRole({ method: 'POST', operationId: 'getShipment' }), 'read')

  const operations = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /orders/queryOrders:
    post:
      operationId: queryOrders
      summary: Query orders
      parameters:
        - name: page
          in: query
          schema: { type: integer }
        - name: size
          in: query
          schema: { type: integer }
  /orders/createOrder:
    post:
      operationId: createOrder
      summary: Create order
  /orders/updateOrder:
    post:
      operationId: updateOrder
      summary: Update order
  /orders/deleteOrder:
    post:
      operationId: deleteOrder
      summary: Delete order
`))
  const byPath = Object.fromEntries(operations.map((operation) => [operation.path, operation]))
  assert.equal(byPath['/orders/queryOrders'].role, 'read')
  assert.equal(byPath['/orders/queryOrders'].pagination.style, 'page')
  assert.equal(byPath['/orders/createOrder'].role, 'create')
  assert.equal(byPath['/orders/updateOrder'].role, 'update')
  assert.equal(byPath['/orders/deleteOrder'].role, 'delete')

  const posted = listOperations(parseSpecText(`
openapi: 3.1.0
paths:
  /api/shipments/queryShipments:
    post:
      operationId: queryShipments
      summary: Query shipments
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                page: { type: integer, minimum: 0 }
                size: { type: integer, minimum: 1, maximum: 100 }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  content: { type: array, items: { type: object } }
                  page: { type: integer }
                  totalPages: { type: integer }
`))[0]
  assert.equal(posted.role, 'read')
  assert.equal(posted.pagination.style, 'page')
  assert.equal(posted.pagination.request.page, 'page')
  assert.equal(posted.pagination.request.size, 'size')
})

test('a payload id accepts names such as instructionNumber and can be changed', () => {
  assert.equal(idNameRank('id'), 0)
  assert.equal(idNameRank('ID'), 0)
  assert.equal(idNameRank('orderId'), 1)
  assert.equal(idNameRank('instruction_number'), 3)
  assert.equal(idNameRank('instructionNumber'), 3)
  assert.equal(idNameRank('inputNumber'), 3)
  assert.equal(idNameRank('orderNo'), 5)
  assert.equal(idNameRank('shipmentUuid'), 2)
  assert.equal(idNameRank('paid'), null)
  assert.equal(idNameRank('number'), null)
  assert.equal(idNameRank('piano'), null)
  assert.equal(idNameRank('delivery.instructionNumber'), null)

  const read = {
    role: 'read',
    method: 'POST',
    path: '/orders/getOrder',
    fields: [
      { name: 'instructionNumber', location: 'body', type: 'string', required: true },
      { name: 'note', location: 'body', type: 'string', required: false },
      { name: 'address.instructionNumber', location: 'body', type: 'string', required: true },
    ],
  }
  assert.equal(detectPayloadId(read).name, 'instructionNumber')
  assert.equal(resolvedId(read).source, 'detected')
  assert.equal(resolvedId(read, 'note').source, 'user')
  assert.equal(resolvedId(read, 'note').name, 'note')
  assert.equal(resolvedId(read, ''), null)

  const both = {
    role: 'update',
    path: '/orders/changeOrder',
    fields: [
      { name: 'instructionNumber', location: 'body', type: 'string', required: true },
      { name: 'id', location: 'body', type: 'integer', required: false },
    ],
  }
  assert.equal(detectPayloadId(both).name, 'id')

  const create = {
    role: 'create',
    path: '/orders/createOrder',
    fields: [{ name: 'orderNumber', location: 'body', type: 'string', required: true }],
  }
  assert.equal(detectPayloadId(create), null)
  assert.equal(resolvedId(create, 'orderNumber').name, 'orderNumber')

  const pathOp = {
    role: 'read',
    method: 'GET',
    path: '/api/orders/{id}',
    fields: [{ name: 'id', location: 'path', type: 'integer', required: true }],
  }
  assert.equal(resolvedId(pathOp, 'other').source, 'path')
  assert.equal(detectPayloadId(pathOp), null)
})

test('an all-POST read, update, or delete can create and remove the record around the run', () => {
  const operations = listOperations(parseSpecText(`
openapi: 3.1.0
tags:
  - name: Shipments
paths:
  /api/shipments/createShipment:
    post:
      tags: [Shipments]
      operationId: createShipment
      summary: Create a shipment
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [reference]
              properties:
                reference: { type: string, example: SHP-1 }
  /api/shipments/getShipment:
    post:
      tags: [Shipments]
      operationId: getShipment
      summary: Get a shipment
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [instructionNumber]
              properties:
                instructionNumber: { type: string, example: IN-1 }
  /api/shipments/queryShipments:
    post:
      tags: [Shipments]
      operationId: queryShipments
      summary: Query shipments
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                page: { type: integer, minimum: 0 }
                size: { type: integer, minimum: 1 }
      responses:
        "200":
          content:
            application/json:
              schema:
                type: object
                properties:
                  content: { type: array, items: { type: object } }
                  totalPages: { type: integer }
  /api/shipments/updateShipment:
    post:
      tags: [Shipments]
      operationId: updateShipment
      summary: Update a shipment
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [instructionNumber, reference]
              properties:
                instructionNumber: { type: string, example: IN-1 }
                reference: { type: string, example: SHP-1 }
  /api/shipments/deleteShipment:
    post:
      tags: [Shipments]
      operationId: deleteShipment
      summary: Delete a shipment
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [instructionNumber]
              properties:
                instructionNumber: { type: string, example: IN-1 }
`))
  const byPath = Object.fromEntries(operations.map((operation) => [operation.path, operation]))
  const getOne = byPath['/api/shipments/getShipment']
  const update = byPath['/api/shipments/updateShipment']
  const remove = byPath['/api/shipments/deleteShipment']
  const query = byPath['/api/shipments/queryShipments']

  assert.equal(fixturePlan(query, operations, {}), null)
  const getPlan = fixturePlan(getOne, operations, {})
  assert.equal(getPlan.location, 'body')
  assert.equal(getPlan.idField, 'instructionNumber')
  assert.equal(getPlan.create.path, '/api/shipments/createShipment')
  assert.equal(getPlan.cleanup.path, '/api/shipments/deleteShipment')
  assert.equal(getPlan.enquiry, null)
  const getSteps = fixtureSteps(getOne, operations, {})
  assert.deepEqual(getSteps.calls.map((call) => call.role), ['before', 'after'])

  const assigned = assignFixture(buildCases(getOne.fields, {}), getPlan)
  assert.equal(assigned[0].needsFixture, true)
  assert.equal(assigned[0].body.instructionNumber, 'IN-1')
  const filled = withFixtureId(assigned[0], 'instructionNumber', 'IN-15', 'body')
  assert.equal(filled.body.instructionNumber, 'IN-15')
  assert.equal(filled.path.instructionNumber, undefined)
  assert.equal(enquiryTarget(filled, 'instructionNumber', 'body'), 'IN-15')
  assert.deepEqual(fixtureRequest(getPlan.cleanup, getPlan, 'IN-15', {}).body, { instructionNumber: 'IN-15' })

  const updateSteps = fixtureSteps(update, operations, {})
  assert.deepEqual(updateSteps.calls.map((call) => `${call.role} ${call.operation.path}`), [
    'before /api/shipments/createShipment',
    'enquiry /api/shipments/getShipment',
    'after /api/shipments/deleteShipment',
  ])
  const removePlan = fixturePlan(remove, operations, {})
  assert.equal(removePlan.consumeSuccess, true)
  assert.equal(removePlan.cleanup.id, remove.id)
  assert.equal(fixturePlan(getOne, operations, {}, ''), null)
})
