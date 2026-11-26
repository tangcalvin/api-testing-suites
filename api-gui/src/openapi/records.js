const PAGE_NAMES = new Set(['page', 'size', 'limit', 'offset', 'cursor', 'nextcursor', 'pagesize'])
const SORT_NAMES = new Set(['sort', 'sortby', 'orderby', 'direction'])
const COMPARATOR_NAMES = new Set(['comparator', 'operator', 'op'])
const VALUE_NAMES = new Set(['date', 'value', 'amount'])
const BOUND_SIDES = [
  ['from', 'minimum'],
  ['to', 'maximum'],
  ['after', 'greater'],
  ['before', 'less'],
  ['exclusivefrom', 'greater'],
  ['exclusiveto', 'less'],
  ['start', 'minimum'],
  ['end', 'maximum'],
]
const SUFFIXES = [
  ['Min', 'minimum'],
  ['Max', 'maximum'],
  ['From', 'minimum'],
  ['To', 'maximum'],
  ['After', 'greater'],
  ['Before', 'less'],
  ['Not', 'not'],
  ['Empty', 'empty'],
  ['Present', 'present'],
]
const ALIASES = {
  discount: ['discountAmount'],
  delivery: ['requestedDeliveryDate', 'deliveryDate'],
  ordered: ['orderedAt', 'orderedDate'],
}
const SCALAR_MODES = ['equals', 'equalsIgnoreCase', 'contains', 'starts', 'ends', 'minimum', 'maximum', 'greater', 'less', 'in', 'not', 'empty', 'present', 'skip']

export const FILTER_MODE_LABELS = {
  equals: 'Equals',
  equalsIgnoreCase: 'Equals, ignore case',
  contains: 'Contains',
  starts: 'Starts with',
  ends: 'Ends with',
  minimum: 'At least',
  maximum: 'At most',
  greater: 'Greater than',
  less: 'Less than',
  in: 'One of',
  not: 'Not one of',
  empty: 'Empty',
  present: 'Has a value',
  compare: 'Comparator',
  bounds: 'From / to',
  skip: 'Skip',
}

export function filterModeChoices(rule) {
  if (rule?.shape === 'compare') return ['compare', 'skip']
  if (rule?.shape === 'bounds') return ['bounds', 'skip']
  return SCALAR_MODES
}

export function filterSummary(rules) {
  const counts = new Map()
  for (const rule of rules || []) {
    const label = FILTER_MODE_LABELS[rule.mode] || rule.mode
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return [...counts.entries()].map(([label, count]) => `${label} ${count}`).join(' · ')
}

export function filterRules(fields, columns, overrides = {}, pagination = null) {
  const list = Array.isArray(fields) ? fields : []
  const names = pagingNames(pagination)
  const composites = new Set()
  const groups = new Set()
  for (const field of list) {
    if (!field?.object || !field.name) continue
    if (isAnyGroup(field.name)) groups.add(field.name)
    else if (isComposite(field, list)) composites.add(field.name)
  }
  const hidden = new Set()
  for (const field of list) {
    if (!field?.name) continue
    for (const root of [...composites, ...groups]) {
      if (field.name === root || field.name.startsWith(`${root}.`)) hidden.add(field.name)
    }
  }
  const rules = []
  for (const name of composites) {
    const field = list.find((item) => item.name === name)
    rules.push(compositeRule(field, list, columns))
  }
  for (const name of groups) {
    for (const child of childrenOf(list, name)) {
      if (child.object) continue
      const rule = scalarRule(child, columns, names)
      if (!rule || rule.mode === 'skip') continue
      const column = rule.column.includes('.') ? columnFor(leafName(child.name), columns) : rule.column
      rules.push({ ...rule, column, or: name })
    }
  }
  for (const field of list) {
    if (!field?.name || field.object || hidden.has(field.name)) continue
    const rule = scalarRule(field, columns, names)
    if (!rule || rule.mode === 'skip') continue
    if (!String(rule.column).includes('.') && Array.isArray(columns) && columns.length > 0 && !columnKnown(rule.column, columns)) continue
    rules.push(rule)
  }
  return rules.map((rule) => applyOverride(rule, overrides?.[rule.field]))
}

export function filterRecords(rows, rules, sent) {
  const active = []
  for (const rule of rules || []) {
    if (!rule || rule.mode === 'skip') continue
    const value = activeValue(rule, sent)
    if (value === undefined) continue
    active.push({ rule, value })
  }
  const groups = new Map()
  const required = []
  for (const item of active) {
    if (!item.rule.or) {
      required.push(item)
      continue
    }
    const list = groups.get(item.rule.or) || []
    list.push(item)
    groups.set(item.rule.or, list)
  }
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!required.every((item) => matches(row, item.rule, item.value))) return false
    for (const list of groups.values()) {
      if (!list.some((item) => matches(row, item.rule, item.value))) return false
    }
    return true
  })
}

export function compareRecords(expected, actual, options = {}) {
  const exp = (Array.isArray(expected) ? expected : []).map((row) => flattenRow(row))
  const got = (Array.isArray(actual) ? actual : []).map((row, index) => ({ flat: flattenRow(row), index }))
  const flats = got.map((item) => item.flat)
  const keys = expectedKeys(exp)
  const overlap = sharedKeys(exp, flats)
  const matchKey = pickMatchKey(exp, flats, keys.length ? keys : overlap)
  const problems = []
  if (!matchKey && exp.length > 0 && flats.length > 0 && overlap.length === 0) {
    return { passed: false, detail: 'The uploaded columns do not match the response.', diffs: [] }
  }
  const pairs = []
  const missing = []
  const extra = []
  if (matchKey) {
    const keyOfFlat = (row) => `${matchKey}:${identity(row[matchKey])}`
    const left = tally(exp, keyOfFlat)
    const right = tally(got, (item) => keyOfFlat(item.flat))
    for (const [key, rows] of left.map) {
      const other = right.map.get(key) || []
      const count = Math.min(rows.length, other.length)
      for (let index = 0; index < count; index += 1) {
        pairs.push({
          expected: rows[index],
          actual: other[index].flat,
          actualIndex: other[index].index,
          label: labelFor(key, 1),
          matchKey,
          matchValue: rows[index]?.[matchKey],
        })
      }
      if (rows.length > other.length) missing.push(labelFor(key, rows.length - other.length))
    }
    for (const [key, rows] of right.map) {
      const have = left.map.get(key)?.length || 0
      if (rows.length > have) extra.push(labelFor(key, rows.length - have))
    }
    if (options.ordered && missing.length === 0 && extra.length === 0) {
      const leftOrder = left.order
      const rightOrder = right.order
      if (leftOrder.some((key, index) => rightOrder[index] !== key)) problems.push('Records are out of order.')
    }
  } else {
    const unused = got.map((item) => ({ ...item }))
    const used = new Set()
    exp.forEach((row, index) => {
      let best = -1
      let bestScore = Number.POSITIVE_INFINITY
      for (let cursor = 0; cursor < unused.length; cursor += 1) {
        if (used.has(unused[cursor].index)) continue
        const score = fieldDiffList(row, unused[cursor].flat, keys).length
        if (score < bestScore) {
          best = cursor
          bestScore = score
          if (score === 0) break
        }
      }
      if (best < 0) {
        missing.push(`Excel row ${index + 1}`)
        return
      }
      used.add(unused[best].index)
      pairs.push({
        expected: row,
        actual: unused[best].flat,
        actualIndex: unused[best].index,
        label: `Excel row ${index + 1}`,
        matchKey: '',
        matchValue: null,
      })
    })
    unused.forEach((item) => {
      if (!used.has(item.index)) extra.push(`response row ${item.index + 1}`)
    })
    if (options.ordered && missing.length === 0 && extra.length === 0 && keys.length > 0) {
      const leftOrder = exp.map((row) => signature(row, keys))
      const rightOrder = flats.map((row) => signature(row, keys))
      if (leftOrder.some((key, index) => rightOrder[index] !== key)) problems.push('Records are out of order.')
    }
  }
  if (missing.length) problems.push(`Missing from response: ${missing.slice(0, 4).join(', ')}.`)
  if (extra.length) problems.push(`Extra in response: ${extra.slice(0, 4).join(', ')}.`)
  const diffs = []
  const mismatched = []
  for (const pair of pairs) {
    const fields = fieldDiffList(pair.expected, pair.actual, keys.filter((key) => key !== matchKey))
    if (fields.length === 0) continue
    diffs.push({
      label: pair.label,
      matchKey: pair.matchKey || '',
      matchValue: pair.matchValue,
      actualIndex: pair.actualIndex,
      fields,
    })
    mismatched.push(`Field mismatch on ${pair.label}:\n  ${fields.slice(0, 5).map((item) => item.message).join('\n  ')}`)
  }
  if (mismatched.length) problems.push(mismatched.slice(0, 3).join('\n'))
  if (problems.length > 0) {
    const count = `Expected ${exp.length} Excel row${exp.length === 1 ? '' : 's'} after filters, received ${flats.length} from the response.`
    return { passed: false, detail: [count, ...problems].join('\n'), diffs }
  }
  return {
    passed: true,
    detail: exp.length === 0 ? 'No records match this filter.' : `${exp.length} ${exp.length === 1 ? 'record' : 'records'} matched.`,
    diffs: [],
  }
}

export function flattenRow(value, prefix = '', into = {}) {
  if (Array.isArray(value)) {
    into[prefix || 'value'] = value
    return into
  }
  if (value == null || typeof value !== 'object') {
    if (prefix) into[prefix] = value
    return into
  }
  const keys = Object.keys(value)
  if (keys.length === 0) {
    if (prefix) into[prefix] = value
    return into
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key
    const child = value[key]
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenRow(child, path, into)
    else into[path] = child
  }
  return prefix ? into : { ...into }
}

export function parseRecordCsv(text) {
  const grid = csvGrid(String(text || '').replace(/^\uFEFF/, ''))
  if (grid.length === 0) return []
  const headers = grid[0].map((header) => cellTextOf(header).trim())
  const rows = []
  for (const line of grid.slice(1)) {
    if (line.every((cell) => cellTextOf(cell).trim() === '')) continue
    const row = {}
    headers.forEach((header, index) => {
      if (!header) return
      row[header] = coerceCell(line[index] === undefined ? '' : line[index])
    })
    rows.push(row)
  }
  return rows
}

export function parseRecordJson(text) {
  let data
  try {
    data = JSON.parse(String(text || ''))
  } catch {
    throw new Error('That JSON could not be read.')
  }
  const rows = Array.isArray(data)
    ? data
    : data?.records || data?.rows || data?.content || data?.items || data?.data
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('The JSON must be a list of records.')
  }
  return rows.map((row) => normalizeRow(row))
}

export async function parseRecordFile(file) {
  const name = String(file?.name || '')
  const buffer = await file.arrayBuffer()
  return parseRecordBuffer(buffer, name)
}

export async function parseRecordBuffer(buffer, name = '') {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer)
  if (/\.xlsx$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    return parseWorkbook(bytes)
  }
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')
  const trimmed = text.trim()
  if (/\.json$/i.test(name) || trimmed.startsWith('[') || trimmed.startsWith('{')) return parseRecordJson(text)
  return parseRecordCsv(text)
}

function pagingNames(pagination) {
  const names = new Set(PAGE_NAMES)
  for (const name of Object.values(pagination?.request || {})) {
    if (name) names.add(String(name).toLowerCase())
  }
  return names
}

function isAnyGroup(name) {
  const leaf = leafName(name)
  return leaf === 'anyOf' || leaf.endsWith('AnyOf')
}

function isComposite(field, fields) {
  const leaf = leafName(field.name)
  if (/DateRange$/i.test(leaf) || /Range$/i.test(leaf)) return true
  const kids = childrenOf(fields, field.name)
  if (kids.some((child) => COMPARATOR_NAMES.has(leafName(child.name).toLowerCase()))) return true
  return kids.some((child) => BOUND_SIDES.some(([side]) => leafName(child.name).toLowerCase() === side))
}

function childrenOf(fields, parent) {
  const prefix = `${parent}.`
  return fields.filter((field) => field?.name?.startsWith(prefix) && !field.name.slice(prefix.length).includes('.'))
}

function compositeRule(field, fields, columns) {
  const kids = childrenOf(fields, field.name)
  const comparator = kids.find((child) => COMPARATOR_NAMES.has(leafName(child.name).toLowerCase()))
  const bounds = kids.filter((child) => BOUND_SIDES.some(([side]) => leafName(child.name).toLowerCase() === side))
  const stem = leafName(field.name).replace(/DateRange$/i, '').replace(/Range$/i, '').replace(/Match$/i, '').replace(/Filter$/i, '')
  const dated = /DateRange$/i.test(leafName(field.name))
  if (comparator && (dated || bounds.length === 0)) {
    const valueChild = valueChildOf(kids, comparator)
    const named = valueChild && !VALUE_NAMES.has(leafName(valueChild.name).toLowerCase())
    return {
      field: field.name,
      location: field.location || 'body',
      column: named ? columnFor(leafName(valueChild.name), columns) : columnFor(stem, columns),
      mode: 'compare',
      shape: 'compare',
      valueFormat: valueFormat(valueChild, field),
      valueKey: valueChild ? leafName(valueChild.name) : (dated ? 'date' : 'value'),
      comparatorKey: leafName(comparator.name),
      sides: [],
      or: '',
    }
  }
  return {
    field: field.name,
    location: field.location || 'body',
    column: columnFor(stem, columns),
    mode: 'bounds',
    shape: 'bounds',
    valueFormat: valueFormat(bounds[0], field),
    valueKey: '',
    comparatorKey: '',
    sides: bounds.map((child) => {
      const leaf = leafName(child.name)
      const match = BOUND_SIDES.find(([side]) => side === leaf.toLowerCase())
      return { key: leaf, mode: match[1] }
    }),
    or: '',
  }
}

function valueChildOf(kids, comparator) {
  const rest = kids.filter((child) => child !== comparator && !child.object)
  return rest.find((child) => child.format === 'date' || child.format === 'date-time')
    || rest.find((child) => VALUE_NAMES.has(leafName(child.name).toLowerCase()))
    || rest[0]
    || null
}

function valueFormat(field, parent) {
  if (field?.format === 'date' || field?.format === 'date-time') return field.format
  if (field?.type === 'integer' || field?.type === 'number') return field.type
  if (/DateRange$/i.test(leafName(parent?.name || ''))) return 'date'
  return 'string'
}

function scalarRule(field, columns, paging) {
  const leaf = leafName(field.name)
  if (paging.has(leaf.toLowerCase()) || SORT_NAMES.has(leaf.toLowerCase())) return null
  const split = splitSuffix(leaf)
  if (split) {
    const column = columnFor(split.stem, columns)
    if (columnKnown(column, columns)) return rule(field, column, split.mode, formatOf(field))
  }
  const flag = leaf.match(/^has([A-Z].*)$/)
  if (flag && field.type === 'boolean') {
    const stem = `${flag[1].slice(0, 1).toLowerCase()}${flag[1].slice(1)}`
    const column = columnFor(stem, columns)
    if (columnKnown(column, columns)) return rule(field, column, 'present', 'string')
  }
  let column = field.name.includes('.') ? field.name : columnFor(leaf, columns)
  if (/^data\.[^.]+$/.test(field.name) && !columnKnown(column, columns)) {
    column = columnFor(leaf, columns)
  }
  if (!field.name.includes('.') && !columnKnown(column, columns)) {
    const plural = pluralColumn(leaf, columns)
    if (plural) column = plural
  }
  return rule(field, column, scalarMode(field), formatOf(field))
}

function pluralColumn(leaf, columns) {
  const candidates = []
  if (leaf.endsWith('ies') && leaf.length > 3) candidates.push(`${leaf.slice(0, -3)}y`)
  if (leaf.endsWith('es') && leaf.length > 2) candidates.push(leaf.slice(0, -2))
  if (leaf.endsWith('s') && leaf.length > 1) candidates.push(leaf.slice(0, -1))
  for (const candidate of candidates) {
    const found = columnFor(candidate, columns)
    if (columnKnown(found, columns) && found.toLowerCase() === candidate.toLowerCase()) return found
  }
  return ''
}

function rule(field, column, mode, valueFormatName) {
  return {
    field: field.name,
    location: field.location || 'query',
    column,
    mode,
    shape: 'scalar',
    valueFormat: valueFormatName,
    valueKey: '',
    comparatorKey: '',
    sides: [],
    or: '',
  }
}

function scalarMode(field) {
  if (field.enum || field.type === 'boolean' || field.type === 'integer' || field.type === 'number') return 'equals'
  if (field.format === 'date' || field.format === 'date-time') return 'equals'
  if (field.type === 'array') return 'in'
  return 'contains'
}

function formatOf(field) {
  if (field.format === 'date' || field.format === 'date-time') return field.format
  if (field.type === 'integer' || field.type === 'number') return field.type
  return 'string'
}

function splitSuffix(leaf) {
  for (const [suffix, mode] of SUFFIXES) {
    if (!leaf.endsWith(suffix) || leaf.length === suffix.length) continue
    return { stem: leaf.slice(0, -suffix.length), mode }
  }
  return null
}

function applyOverride(rule, override) {
  if (!override || typeof override !== 'object') return rule
  const mode = override.mode && compatible(rule.shape, override.mode) ? override.mode : rule.mode
  const column = typeof override.column === 'string' && override.column.trim() ? override.column.trim() : rule.column
  return { ...rule, mode, column }
}

function compatible(shape, mode) {
  if (!FILTER_MODE_LABELS[mode]) return false
  if (shape === 'compare') return mode === 'compare' || mode === 'skip'
  if (shape === 'bounds') return mode === 'bounds' || mode === 'skip'
  return mode !== 'compare' && mode !== 'bounds'
}

function columnFor(stem, columns) {
  const list = Array.isArray(columns) ? columns : []
  const exact = list.find((name) => name.toLowerCase() === String(stem).toLowerCase())
  if (exact) return exact
  for (const name of ALIASES[String(stem).toLowerCase()] || []) {
    const found = list.find((column) => column.toLowerCase() === name.toLowerCase())
    if (found) return found
  }
  if (String(stem).length >= 4) {
    const hits = list.filter((name) => name.toLowerCase().includes(String(stem).toLowerCase()))
    if (hits.length === 1) return hits[0]
  }
  return stem
}

function columnKnown(column, columns) {
  if (!Array.isArray(columns) || columns.length === 0) return true
  return columns.some((name) => name.toLowerCase() === String(column).toLowerCase())
}

function leafName(name) {
  const parts = String(name || '').split('.')
  return parts[parts.length - 1]
}

function activeValue(rule, sent) {
  const raw = readSent(sent, rule)
  if (raw === undefined || raw === null || isOmitted(raw)) return undefined
  if (typeof raw === 'string' && raw.trim() === '') return undefined
  if (rule.mode === 'compare') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const op = normalizeOp(raw[rule.comparatorKey])
    const value = raw[rule.valueKey]
    const missing = value == null || value === ''
    if (op === 'empty' || op === 'present') return raw
    if (!op || missing) return undefined
    return raw
  }
  if (rule.mode === 'bounds') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
    const live = (rule.sides || []).some((side) => raw[side.key] != null && raw[side.key] !== '')
    return live ? raw : undefined
  }
  return raw
}

function readSent(sent, rule) {
  const bag = rule.location === 'query' ? sent?.query : rule.location === 'path' ? sent?.path : sent?.body
  return readDotted(bag, rule.field)
}

function readDotted(value, path) {
  let current = value
  for (const part of String(path || '').split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

function matches(row, rule, raw) {
  const actual = readDotted(row, rule.column)
  if (rule.mode === 'compare') return matchCompare(actual, raw, rule)
  if (rule.mode === 'bounds') return matchBounds(actual, raw, rule)
  if (rule.mode === 'contains') return textIncludes(actual, raw)
  if (rule.mode === 'starts') return textEdge(actual, raw, 'starts')
  if (rule.mode === 'ends') return textEdge(actual, raw, 'ends')
  if (rule.mode === 'in') return listHas(actual, raw)
  if (rule.mode === 'not') return !listHas(actual, raw)
  if (rule.mode === 'empty') return truthy(raw) ? isEmpty(actual) : !isEmpty(actual)
  if (rule.mode === 'present') return truthy(raw) ? !isEmpty(actual) : isEmpty(actual)
  if (rule.mode === 'minimum') return compareOrdered(actual, raw, 'gte', rule.valueFormat)
  if (rule.mode === 'maximum') return compareOrdered(actual, raw, 'lte', rule.valueFormat)
  if (rule.mode === 'greater') return compareOrdered(actual, raw, 'gt', rule.valueFormat)
  if (rule.mode === 'less') return compareOrdered(actual, raw, 'lt', rule.valueFormat)
  if (rule.mode === 'equalsIgnoreCase') return sameScalar(actual, raw, true)
  return sameScalar(actual, raw, false)
}

function matchCompare(actual, raw, rule) {
  const op = normalizeOp(raw[rule.comparatorKey])
  if (op === 'empty') return isEmpty(actual)
  if (op === 'present') return !isEmpty(actual)
  if (op === 'contains') return textIncludes(actual, raw[rule.valueKey])
  if (op === 'starts') return textEdge(actual, raw[rule.valueKey], 'starts')
  if (op === 'ends') return textEdge(actual, raw[rule.valueKey], 'ends')
  if (op === 'in') return listHas(actual, raw[rule.valueKey])
  if (op === 'not') return !listHas(actual, raw[rule.valueKey])
  return compareOrdered(actual, raw[rule.valueKey], op, rule.valueFormat)
}

function matchBounds(actual, raw, rule) {
  return (rule.sides || []).every((side) => {
    const value = raw[side.key]
    if (value == null || value === '') return true
    return compareOrdered(actual, value, sideToOp(side.mode), rule.valueFormat)
  })
}

function sideToOp(mode) {
  if (mode === 'minimum') return 'gte'
  if (mode === 'maximum') return 'lte'
  if (mode === 'greater') return 'gt'
  if (mode === 'less') return 'lt'
  return 'eq'
}

function normalizeOp(value) {
  const text = String(value ?? '').trim()
  const key = text.toLowerCase()
  const table = {
    '=': 'eq', '==': 'eq', eq: 'eq', equals: 'eq',
    '>=': 'gte', gte: 'gte',
    '<=': 'lte', lte: 'lte',
    '>': 'gt', gt: 'gt',
    '<': 'lt', lt: 'lt',
    contains: 'contains',
    startswith: 'starts', starts: 'starts',
    endswith: 'ends', ends: 'ends',
    empty: 'empty',
    present: 'present',
    in: 'in',
    not: 'not',
  }
  return table[text] || table[key] || ''
}

function compareOrdered(actual, expected, op, format) {
  if (isEmpty(actual)) return false
  const left = temporalOf(actual)
  const right = temporalOf(expected)
  if (left && right) return compareTemporal(left, right, op)
  if (format === 'number' || format === 'integer' || (numericText(actual) && numericText(expected))) {
    const a = asNumber(actual)
    const b = asNumber(expected)
    if (a == null || b == null) return false
    return compareNumber(a, b, op)
  }
  const as = String(actual).trim()
  const bs = String(expected).trim()
  if (op === 'eq') return as === bs
  if (op === 'gte') return as >= bs
  if (op === 'lte') return as <= bs
  if (op === 'gt') return as > bs
  if (op === 'lt') return as < bs
  return false
}

function compareTemporal(actual, expected, op) {
  if (actual.kind === 'instant' && expected.kind === 'instant') return compareNumber(actual.time, expected.time, op)
  if (actual.kind === 'date' && expected.kind === 'date') return compareNumber(dateNumber(actual.text), dateNumber(expected.text), op)
  if (expected.kind === 'date' && actual.kind === 'instant') {
    const start = Date.parse(`${expected.text}T00:00:00.000Z`)
    const end = nextUtcDay(expected.text)
    if (op === 'eq') return actual.time >= start && actual.time < end
    if (op === 'gte') return actual.time >= start
    if (op === 'lte') return actual.time < end
    if (op === 'gt') return actual.time >= end
    if (op === 'lt') return actual.time < start
  }
  if (actual.kind === 'date' && expected.kind === 'instant') {
    return compareNumber(Date.parse(`${actual.text}T00:00:00.000Z`), expected.time, op)
  }
  return false
}

function temporalOf(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { kind: 'instant', time: value.getTime() }
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { kind: 'date', text }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    const time = Date.parse(text)
    if (!Number.isNaN(time)) return { kind: 'instant', time }
  }
  return null
}

function dateNumber(text) {
  return Date.parse(`${text}T00:00:00.000Z`)
}

function nextUtcDay(text) {
  const [year, month, day] = text.split('-').map(Number)
  return Date.UTC(year, month - 1, day + 1)
}

function compareNumber(left, right, op) {
  if (op === 'eq') return left === right
  if (op === 'gte') return left >= right
  if (op === 'lte') return left <= right
  if (op === 'gt') return left > right
  if (op === 'lt') return left < right
  return false
}

function sameScalar(actual, expected, ignoreCase) {
  if (actual == null && expected == null) return true
  if (actual == null || expected == null) return false
  if (typeof actual === 'boolean' || typeof expected === 'boolean' || expected === 'true' || expected === 'false') {
    return Boolean(actual) === truthy(expected)
  }
  const left = temporalOf(actual)
  const right = temporalOf(expected)
  if (left && right) return compareTemporal(left, right, 'eq')
  if (numericText(actual) && numericText(expected)) return asNumber(actual) === asNumber(expected)
  const as = String(actual)
  const bs = String(expected)
  if (ignoreCase) return as.toLowerCase() === bs.toLowerCase()
  return as === bs
}

function textIncludes(actual, expected) {
  if (isEmpty(actual) || isEmpty(expected)) return false
  return String(actual).toLowerCase().includes(String(expected).trim().toLowerCase())
}

function textEdge(actual, expected, edge) {
  if (isEmpty(actual) || isEmpty(expected)) return false
  const left = String(actual).trim().toLowerCase()
  const right = String(expected).trim().toLowerCase()
  return edge === 'starts' ? left.startsWith(right) : left.endsWith(right)
}

function listHas(actual, expected) {
  const list = Array.isArray(expected) ? expected : [expected]
  return list.some((item) => sameScalar(actual, item, false))
}

function truthy(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value ?? '').trim().toLowerCase()
  return text === 'true' || text === 'yes' || text === '1'
}

function isEmpty(value) {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

function isOmitted(value) {
  if (value === '@omit') return true
  if (typeof value === 'symbol') return String(value) === 'Symbol(omit)'
  return value === 'Symbol(omit)'
}

function numericText(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const text = value.trim()
  return text !== '' && Number.isFinite(Number(text))
}

function asNumber(value) {
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(number) ? number : null
}

function hasId(row) {
  return row && row.id != null && row.id !== ''
}

function identity(value) {
  if (numericText(value)) return String(asNumber(value))
  return String(value).trim()
}

function expectedKeys(expected) {
  const keys = new Set()
  for (const row of expected) {
    for (const key of Object.keys(row || {})) keys.add(key)
  }
  return [...keys]
}

function sharedKeys(expected, actual) {
  const have = new Set(actual.flatMap((row) => Object.keys(row || {})))
  const keys = new Set()
  for (const row of expected) {
    for (const key of Object.keys(row || {})) {
      if (have.has(key)) keys.add(key)
    }
  }
  return [...keys]
}

function signature(row, keys) {
  return JSON.stringify(keys.map((key) => [key, canonical(row?.[key])]))
}

function canonical(value) {
  if (value == null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => canonical(item))
  if (typeof value === 'object') {
    const next = {}
    for (const key of Object.keys(value).sort()) next[key] = canonical(value[key])
    return next
  }
  return String(value)
}

function tally(rows, keyOf) {
  const map = new Map()
  const order = []
  for (const row of rows) {
    const key = keyOf(row)
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key).push(row)
  }
  return { map, order }
}

function labelFor(key, count) {
  const split = String(key || '').indexOf(':')
  const name = split > 0 ? `${key.slice(0, split)} ${key.slice(split + 1)}` : 'a record'
  return count > 1 ? `${name} ×${count}` : name
}

function pickMatchKey(expected, actual, keys) {
  if (expected.length === 0 || actual.length === 0) return ''
  for (const candidate of ['id', 'reference', 'orderNumber']) {
    if (keys.length && !keys.includes(candidate)) continue
    if (!expected.every((row) => row?.[candidate] != null && row[candidate] !== '')) continue
    if (!actual.every((row) => row?.[candidate] != null && row[candidate] !== '')) continue
    const left = new Set(expected.map((row) => identity(row[candidate])))
    const right = new Set(actual.map((row) => identity(row[candidate])))
    if (left.size === expected.length && right.size === actual.length) return candidate
  }
  return ''
}

function fieldDiffList(expected, actual, keys) {
  const diffs = []
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(expected || {}, key)) continue
    const want = expected[key]
    const got = readPath(actual, key)
    if (got.missing) {
      if (want == null) continue
      diffs.push({
        path: key,
        expected: want,
        actual: undefined,
        message: `${key}: expected ${quoteValue(want)}, got (missing)`,
      })
      continue
    }
    if (sameValue(want, got.value)) continue
    diffs.push({
      path: key,
      expected: want,
      actual: got.value,
      message: `${key}: expected ${quoteValue(want)}, got ${quoteValue(got.value)}`,
    })
  }
  return diffs
}

export function annotateJsonLines(text, diffs) {
  const lines = String(text || '').split('\n')
  const notes = Array.from({ length: lines.length }, () => '')
  for (const diff of diffs || []) {
    if (!diff?.fields?.length) continue
    const range = recordLineRange(lines, diff)
    if (!range) continue
    for (const field of diff.fields) {
      let line = findFieldLine(lines, range.start, range.end, field.path)
      if (line < 0) {
        const parts = String(field.path || '').split('.').filter(Boolean)
        while (line < 0 && parts.length > 1) {
          parts.pop()
          line = findFieldLine(lines, range.start, range.end, parts.join('.'))
        }
      }
      if (line < 0) continue
      const note = field.message || `${field.path} mismatch`
      notes[line] = notes[line] ? `${notes[line]} · ${note}` : note
    }
  }
  return { lines, notes }
}

function recordLineRange(lines, diff) {
  if (diff.matchKey != null && String(diff.matchKey) !== '' && diff.matchValue != null && diff.matchValue !== '') {
    const idLine = findKeyValueLine(lines, 0, lines.length, diff.matchKey, diff.matchValue)
    if (idLine >= 0) return objectBounds(lines, idLine)
  }
  if (Number.isInteger(diff.actualIndex) && diff.actualIndex >= 0) {
    const starts = recordObjectStarts(lines)
    if (diff.actualIndex < starts.length) return objectBounds(lines, starts[diff.actualIndex])
  }
  return null
}

function recordObjectStarts(lines) {
  const starts = []
  let depth = 0
  let arrayDepth = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const openArr = (line.match(/\[/g) || []).length
    const closeArr = (line.match(/\]/g) || []).length
    const openObj = (line.match(/\{/g) || []).length
    const closeObj = (line.match(/\}/g) || []).length
    if (arrayDepth >= 1 && depth === arrayDepth && /^\s*\{/.test(line)) starts.push(index)
    arrayDepth += openArr - closeArr
    depth += openObj - closeObj
  }
  return starts
}

function findFieldLine(lines, start, end, path) {
  const parts = String(path || '').split('.').filter(Boolean)
  if (parts.length === 0) return -1
  let from = start
  let to = end
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    const line = findKeyLine(lines, from, to, part)
    if (line < 0) return -1
    if (index === parts.length - 1) return line
    const nested = objectBounds(lines, line)
    if (!nested) return -1
    from = nested.start
    to = nested.end
  }
  return -1
}

function findKeyLine(lines, start, end, key) {
  const pattern = new RegExp(`^\\s*"${escapeRegExp(key)}"\\s*:`)
  for (let index = start; index < end; index += 1) {
    if (pattern.test(lines[index])) return index
  }
  return -1
}

function findKeyValueLine(lines, start, end, key, value) {
  const pattern = new RegExp(`^\\s*"${escapeRegExp(key)}"\\s*:\\s*${jsonLiteralPattern(value)}\\s*,?\\s*$`)
  for (let index = start; index < end; index += 1) {
    if (pattern.test(lines[index])) return index
  }
  return -1
}

function jsonLiteralPattern(value) {
  if (value == null) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const text = String(value)
  if (/^-?\d+(\.\d+)?$/.test(text)) return `(?:${escapeRegExp(text)}|"${escapeRegExp(text)}")`
  return `"${escapeRegExp(text)}"`
}

function objectBounds(lines, anchor) {
  if (anchor < 0 || anchor >= lines.length) return null
  let start = anchor
  while (start > 0 && !/\{/.test(lines[start])) start -= 1
  if (!/\{/.test(lines[start])) start = anchor
  let depth = 0
  let begun = false
  for (let index = start; index < lines.length; index += 1) {
    const open = (lines[index].match(/\{/g) || []).length
    const close = (lines[index].match(/\}/g) || []).length
    depth += open - close
    if (open > 0) begun = true
    if (begun && depth <= 0) return { start, end: index + 1 }
  }
  return { start, end: lines.length }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readPath(row, key) {
  if (Object.prototype.hasOwnProperty.call(row || {}, key)) return { missing: false, value: row[key] }
  const parts = String(key || '').split('.').filter(Boolean)
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const parent = parts.slice(0, index).join('.')
    if (!Object.prototype.hasOwnProperty.call(row || {}, parent)) continue
    if (isEmpty(row[parent])) return { missing: true, value: undefined }
  }
  return { missing: true, value: undefined }
}

function quoteValue(value) {
  if (value === undefined) return '(missing)'
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const text = value.length > 60 ? `${value.slice(0, 57)}...` : value
    return JSON.stringify(text)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const text = JSON.stringify(canonical(value))
    return text.length > 60 ? `${text.slice(0, 57)}...` : text
  } catch {
    return String(value)
  }
}

function sameValue(expected, actual) {
  if (expected == null && actual == null) return true
  if (expected == null || actual == null) return false
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    if (Array.isArray(expected) || Array.isArray(actual)) return JSON.stringify(canonical(expected)) === JSON.stringify(canonical(actual))
    const keys = Object.keys(expected)
    return keys.every((key) => sameValue(expected[key], actual[key]))
  }
  return sameScalar(expected, actual, false) || sameScalar(actual, expected, false)
}

function csvGrid(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let wasQuoted = false
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const pushCell = () => {
    row.push(wasQuoted ? { quoted: true, text: cell } : cell)
    cell = ''
    wasQuoted = false
  }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"' && cell === '') {
      quoted = true
      wasQuoted = true
      continue
    }
    if (char === ',') {
      pushCell()
      continue
    }
    if (char === '\n') {
      pushCell()
      rows.push(row)
      row = []
      continue
    }
    cell += char
  }
  if (cell !== '' || wasQuoted || row.length > 0) {
    pushCell()
    rows.push(row)
  }
  return rows.filter((line) => line.some((item) => cellTextOf(item).trim() !== ''))
}

function cellTextOf(value) {
  if (value == null) return ''
  if (typeof value === 'object' && value.quoted) return String(value.text ?? '')
  return String(value)
}

function coerceCell(value) {
  if (value == null) return null
  if (typeof value === 'object' && value.quoted) return coerceExactText(String(value.text ?? ''))
  if (value === '') return null
  return coerceExactText(String(value))
}

function coerceExactText(text) {
  if (text === 'true') return true
  if (text === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(text) && !/^0\d/.test(text)) return Number(text)
  return text
}

function normalizeRow(row) {
  const next = {}
  for (const [key, value] of Object.entries(row || {})) {
    const name = String(key || '').trim()
    if (!name) continue
    next[name] = normalizeCell(value)
  }
  return next
}

function normalizeCell(value) {
  if (value instanceof Date) return excelDate(value)
  if (typeof value === 'string') return coerceExactText(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean' || value == null) return value ?? null
  if (Array.isArray(value)) return value.map((item) => normalizeCell(item))
  if (typeof value === 'object') return normalizeRow(value)
  return String(value)
}

async function parseWorkbook(bytes) {
  const loaded = await import('xlsx')
  const XLSX = loaded.default || loaded
  const book = XLSX.read(bytes, { type: 'array', cellDates: true })
  const name = book.SheetNames[0]
  if (!name) throw new Error('The workbook has no sheet.')
  const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { defval: null, raw: true })
  if (!Array.isArray(rows)) throw new Error('The workbook has no records.')
  return rows.map((row) => normalizeRow(row))
}

function excelDate(value) {
  if (Number.isNaN(value.getTime())) return null
  if (value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0 && value.getMilliseconds() === 0) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  return value.toISOString()
}
