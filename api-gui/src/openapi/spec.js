import yaml from 'js-yaml'
import { coerceFieldValue, evaluateDynamics, substitute } from '../library.js'

const METHODS = ['get', 'post', 'put', 'patch', 'delete']

export function parseSpecText(text) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('The OpenAPI document is empty.')
  }
  const spec = trimmed.startsWith('{') ? JSON.parse(trimmed) : yaml.load(trimmed)
  if (!spec || typeof spec !== 'object' || !spec.paths) {
    throw new Error('This document has no OpenAPI paths.')
  }
  return spec
}

export function listOperations(spec) {
  const operations = []
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      continue
    }
    for (const method of METHODS) {
      const operation = pathItem[method]
      if (!operation) {
        continue
      }
      operations.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        tag: operationTag(pathItem, operation),
        summary: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
        fields: fieldsFor(spec, pathItem, operation),
        exclusive: exclusiveGroups(spec, operation),
        pagination: detectPagination(spec, pathItem, operation),
        responses: responseViews(spec, operation),
      })
    }
  }
  const tagOrder = new Map((Array.isArray(spec.tags) ? spec.tags : []).map((tag, index) => [tag?.name, index]))
  operations.sort((left, right) => {
    const tagDelta = (tagOrder.get(left.tag) ?? 999) - (tagOrder.get(right.tag) ?? 999)
    if (tagDelta !== 0) return tagDelta
    return left.tag.localeCompare(right.tag) || left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
  })
  return operations
}

export function operationGroups(operations) {
  const groups = []
  for (const operation of operations || []) {
    const tag = operation.tag || 'Other'
    let group = groups.find((item) => item.tag === tag)
    if (!group) {
      group = { tag, operations: [] }
      groups.push(group)
    }
    group.operations.push(operation)
  }
  return groups
}

function operationTag(pathItem, operation) {
  const tags = Array.isArray(operation?.tags) && operation.tags.length ? operation.tags : pathItem?.tags
  return Array.isArray(tags) && tags[0] ? String(tags[0]) : 'Other'
}

export function serverUrl(spec) {
  const url = spec.servers && spec.servers[0] && spec.servers[0].url
  return typeof url === 'string' ? url : ''
}

export function specGaps(operations, profiles) {
  const operationById = new Map((operations || []).map((operation) => [operation.id, operation]))
  const byId = new Map((operations || []).map((operation) => [operation.id, new Set(operation.fields.map((field) => field.name))]))
  const knownFields = new Set([...byId.values()].flatMap((names) => [...names]))
  const gaps = []
  for (const profile of profiles || []) {
    const label = profile.name || profile.oauth?.clientId || 'Client'
    for (const [operationId, fields] of Object.entries(profile.defaults?.operations || {})) {
      if (!byId.has(operationId)) {
        gaps.push(`${label} defaults ${operationId}`)
        continue
      }
      for (const fieldName of Object.keys(fields || {})) {
        if (!byId.get(operationId).has(fieldName)) gaps.push(`${label} default ${operationId} ${fieldName}`)
      }
    }
    for (const fieldName of Object.keys(profile.defaults?.global || {})) {
      if (!knownFields.has(fieldName)) gaps.push(`${label} global ${fieldName}`)
    }
    for (const [operationId, cases] of Object.entries(profile.cases?.operations || {})) {
      if (!byId.has(operationId)) {
        gaps.push(`${label} cases ${operationId}`)
        continue
      }
      const names = byId.get(operationId)
      for (const item of Array.isArray(cases) ? cases : []) {
        const used = [...Object.keys(item?.request || {}), ...(Array.isArray(item?.omit) ? item.omit : [])]
        for (const fieldName of used) {
          if (!names.has(fieldName)) gaps.push(`${label} case ${operationId} ${fieldName}`)
        }
      }
    }
    for (const [operationId, exclusion] of Object.entries(profile.cases?.exclusions || {})) {
      if (!byId.has(operationId)) {
        gaps.push(`${label} exclusions ${operationId}`)
        continue
      }
      const names = byId.get(operationId)
      const used = [
        ...(exclusion.fieldsets || []).flatMap((rule) => Object.keys(rule.values || {})),
        ...(exclusion.distinct || []).flatMap((rule) => rule.fields || []),
      ]
      for (const fieldName of used) {
        if (fieldName && !names.has(fieldName)) gaps.push(`${label} exclusion ${operationId} ${fieldName}`)
      }
    }
    for (const [operationId, combinationValues] of Object.entries(profile.cases?.values || {})) {
      if (!byId.has(operationId)) {
        gaps.push(`${label} values ${operationId}`)
        continue
      }
      const names = byId.get(operationId)
      for (const fieldName of Object.keys(combinationValues || {})) {
        if (fieldName && !names.has(fieldName)) gaps.push(`${label} value ${operationId} ${fieldName}`)
      }
    }
    for (const [operationId, statuses] of Object.entries(profile.defaults?.responses || {})) {
      const operation = operationById.get(operationId)
      if (!operation) {
        gaps.push(`${label} response ${operationId}`)
        continue
      }
      for (const [status, fields] of Object.entries(statuses || {})) {
        const added = new Set((profile.defaults?.extraStatuses?.[operationId] || []).map((code) => String(code)))
        const view = (operation.responses || []).find((item) => item.status === status)
          || (added.has(String(status)) ? schemaSource(operation.responses || [], status) : null)
        const names = new Set((view?.fields || []).map((field) => field.name))
        if (!view) {
          gaps.push(`${label} response ${operationId} ${status}`)
          continue
        }
        for (const fieldName of Object.keys(fields || {})) {
          if (!names.has(fieldName)) gaps.push(`${label} response ${operationId} ${status} ${fieldName}`)
        }
      }
    }
  }
  return [...new Set(gaps)]
}

export function caseCount(fields) {
  const varied = fields.filter((field) => field.vary && field.values.length > 0)
  if (varied.length === 0) {
    return 1
  }
  return varied.reduce((count, field) => count * field.values.length, 1)
}

export function buildCases(fields, exclusions = {}) {
  const varied = fields.filter((field) => field.vary && field.values.length > 0)
  const groups = varied.map((field) => field.values.map((value) => [field.name, value]))
  const combinations = groups.reduce(
    (current, group) => current.flatMap((prefix) => group.map((pair) => [...prefix, pair])),
    [[]],
  )
  return combinations.map((pairs) => {
    const overrides = Object.fromEntries(pairs)
    return {
      kind: 'combination',
      label: pairs.length ? pairs.map(([name, value]) => `${name}=${valueText(value)}`).join(', ') : 'Valid sample',
      expect: { outcome: 'success' },
      varied: overrides,
      ...assemble(fields, overrides, { combination: true }),
    }
  }).filter((item) => !combinationExcluded(fields, item.varied, exclusions))
}

function combinationExcluded(fields, varied, exclusions) {
  const valueOf = (name) => (Object.prototype.hasOwnProperty.call(varied, name)
    ? varied[name]
    : fields.find((field) => field.name === name)?.sample)
  for (const rule of exclusions.fieldsets || []) {
    const entries = Object.entries(rule.values || {}).filter(([name, expected]) => name && expected !== '')
    if (entries.length > 0 && entries.every(([name, expected]) => valuesMatch(valueOf(name), expected))) return true
  }
  for (const rule of exclusions.distinct || []) {
    const names = Array.isArray(rule.fields) ? rule.fields : []
    const [left, right] = names
    if (!left || !right || left === right) continue
    const leftValue = valueOf(left)
    const rightValue = valueOf(right)
    if (isSet(leftValue) && isSet(rightValue) && valuesMatch(leftValue, rightValue)) return true
  }
  for (const group of exclusions.exclusive || []) {
    if (Array.isArray(group) && group.filter((name) => isSet(valueOf(name))).length > 1) return true
  }
  return false
}

function isSet(value) {
  return !isOmitted(value) && value !== undefined && value !== null && value !== ''
}

function valuesMatch(actual, expected) {
  if (isOmitted(actual)) return isOmitted(expected) || expected === 'omit'
  if (actual === null || actual === undefined) return expected === 'null' || expected === null
  return String(actual) === String(expected)
}

export const OMIT = '@omit'

export function isOmitted(value) {
  if (value === OMIT) return true
  if (typeof value === 'symbol') return String(value) === 'Symbol(omit)'
  return value === 'Symbol(omit)'
}
export const OBJECT_NULL = '@null'
export const OBJECT_EMPTY = '@empty'
export const OBJECT_FIELDS = '@fields'

export function objectChoice(value) {
  if (value === OBJECT_NULL || value === null) return 'null'
  if (value === OBJECT_EMPTY) return 'empty'
  return 'fields'
}

export function valueText(value) {
  if (isOmitted(value)) return 'omit'
  if (value === null) return 'null'
  if (value === '') return 'blank'
  return String(value)
}

export function textCombinationField(field) {
  return scalarCombinationField(field) && field.type === 'string' && field.format !== 'date' && field.format !== 'date-time'
}

export function scalarCombinationField(field) {
  return Boolean(
    field
    && !field.object
    && !field.enum
    && (field.type === 'string' || field.type === 'integer' || field.type === 'number'),
  )
}

export function textCombinationValues(sample, extras) {
  return scalarCombinationValues({ type: 'string', sample, required: true }, extras)
}

export function scalarCombinationValues(field, extras) {
  const values = []
  const push = (value) => {
    if (value === undefined) return
    if (values.some((item) => sameCombinationValue(item, value))) return
    values.push(value)
  }
  push(field.sample)
  for (const extra of extras || []) push(parseCombinationExtra(field, extra))
  return values.length < 2 ? [] : values
}

function parseCombinationExtra(field, extra) {
  const text = String(extra ?? '').trim()
  if (!text) return undefined
  if (text === '@null') return field.required ? undefined : null
  if (text === '@omit' || text === OMIT) return field.required ? undefined : OMIT
  if (field.type === 'integer' || field.type === 'number') {
    const value = Number(text)
    return Number.isFinite(value) ? value : undefined
  }
  return text
}

function sameCombinationValue(left, right) {
  if (isOmitted(left) || left === '' || left === undefined) return isOmitted(right) || right === '' || right === undefined
  if (isOmitted(right) || right === '' || right === undefined) return false
  return Object.is(left, right)
}

export function withTextCombinationValues(fields, saved, variables) {
  const source = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  return fields.map((field) => {
    if (!scalarCombinationField(field)) return field
    const raw = Array.isArray(source[field.name]) ? source[field.name] : []
    const extras = raw.map((item) => {
      const resolved = substitute(item, variables)
      return resolved == null ? '' : String(resolved)
    })
    const values = scalarCombinationValues(field, extras)
    if (values.length < 2) return { ...field, values: [] }
    return { ...field, values, vary: field.textVary === false ? false : true }
  })
}

export function casesFor(mode, fields, customCases = [], exclusions = {}) {
  if (mode === 'individual' || mode === 'boundary') {
    return buildIndividualCases(fields)
  }
  if (mode === 'error') {
    return buildErrorCases(fields)
  }
  if (mode === 'custom') {
    return buildCustomCases(fields, customCases)
  }
  return buildCases(fields, exclusions)
}

export function buildCustomCases(fields, cases) {
  return (cases || []).map((item, index) => {
    const overrides = {}
    const request = item.request || {}
    const omitted = new Set(item.omit || [])
    for (const field of fields) {
      if (omitted.has(field.name)) {
        overrides[field.name] = OMIT
      } else if (Object.prototype.hasOwnProperty.call(request, field.name)) {
        overrides[field.name] = coerceFieldValue(field, request[field.name])
      }
    }
    const checks = (item.expect?.fields || []).filter((check) => check && String(check.path || '').trim())
    return {
      kind: 'custom',
      label: String(item.name || '').trim() || `Custom ${index + 1}`,
      expect: {
        outcome: 'custom',
        status: item.expect?.status ? String(item.expect.status) : '',
        fields: checks.map((check) => ({
          path: String(check.path).trim(),
          equals: check.equals === undefined || check.equals === null ? '' : String(check.equals),
          ...(check.ordered ? { ordered: true } : {}),
        })),
      },
      varied: {},
      ...assemble(fields, overrides),
    }
  })
}

export function individualChoices(field) {
  if (!field || (field.location !== 'body' && field.location !== 'query')) return []
  const choices = []
  if (field.object) {
    if (!field.required) choices.push(nullChoice(field), omitChoice(field))
    return distinctChoices(field, choices)
  }
  if (field.enum) {
    for (const value of field.values || []) {
      if (value == null || isOmitted(value)) continue
      const label = valueText(value)
      choices.push({ id: `enum:${label}`, label, value, text: `${field.name}=${label}` })
    }
  } else if (field.type === 'boolean') {
    for (const value of [false, true]) {
      choices.push({ id: `bool:${value}`, label: String(value), value, text: `${field.name}=${value}` })
    }
  } else {
    const limits = numericLimits(field)
    if (limits.min != null) {
      choices.push({ id: 'min', label: `Min ${limits.min}`, value: limits.min, text: `${field.name} at minimum ${limits.min}` })
    }
    if (limits.max != null && limits.max !== limits.min) {
      choices.push({ id: 'max', label: `Max ${limits.max}`, value: limits.max, text: `${field.name} at maximum ${limits.max}` })
    }
    if (field.type === 'string') {
      const minLength = field.constraints?.minLength
      if (plainText(field) && minLength > 0) {
        choices.push({ id: 'minLength', label: `Min ${minLength}`, value: 'A'.repeat(minLength), text: `${field.name} at minimum length ${minLength}` })
      }
      const exact = exactLength(field)
      if (exact) {
        choices.push({ id: 'maxLength', label: `Max ${field.constraints.maxLength}`, value: exact.value, text: `${field.name} ${exact.label}` })
      }
      for (const edge of patternEdges(field)) {
        choices.push({ id: `pattern:${edge.value}`, label: edge.label, value: edge.value, text: `${field.name} ${edge.label}` })
      }
      choices.push(...spaceChoices(field))
    }
  }
  if (!field.required) choices.push(nullChoice(field), omitChoice(field))
  return distinctChoices(field, choices)
}

function distinctChoices(field, choices) {
  const kept = []
  for (const choice of choices) {
    if (sameSent(choice.value, field.sample)) continue
    if (isOmitted(choice.value) && defaultAbsent(field)) continue
    if (kept.some((item) => sameSent(item.value, choice.value))) continue
    kept.push(choice)
  }
  return kept
}

function sameSent(left, right) {
  return Object.is(left, right)
}

export function individualIncluded(field, choice) {
  return field.individual?.[choice.id] !== false && field.boundary?.[choice.id] !== false
}

function nullChoice(field) {
  return { id: 'null', label: 'Null', value: null, text: `${field.name}=null` }
}

function omitChoice(field) {
  return { id: 'omit', label: 'Omit', value: OMIT, text: `${field.name}=omit` }
}

function defaultAbsent(field) {
  if (field.object) return isOmitted(field.sample)
  return isOmitted(field.sample) || field.sample === undefined || field.sample === ''
}

function spaceChoices(field) {
  if (!plainText(field) || field.enum || field.object) return []
  const modes = [
    { id: 'space:leading', label: 'Leading', text: 'leading space', edges: ['leading'] },
    { id: 'space:trailing', label: 'Trailing', text: 'trailing space', edges: ['trailing'] },
    { id: 'space:both', label: 'Both', text: 'both spaces', edges: ['leading', 'trailing'] },
  ]
  const maxLength = field.constraints?.maxLength
  const core = field.sample == null ? '' : String(field.sample)
  return modes.flatMap((mode) => {
    const value = spacedText(core, mode.edges, maxLength)
    if (value == null) return []
    return [{
      id: mode.id,
      label: mode.label,
      value,
      text: `${field.name} ${mode.text}`,
    }]
  })
}

function spacedText(core, edges, maxLength) {
  const lead = edges.includes('leading') ? ' ' : ''
  const trail = edges.includes('trailing') ? ' ' : ''
  core = String(core ?? '')
  if (typeof maxLength === 'number' && maxLength > 0) {
    const room = maxLength - lead.length - trail.length
    if (room < 1) return null
    if (core.length > room) core = core.slice(0, room)
  }
  const value = `${lead}${core}${trail}`
  return value === core ? null : value
}

export function buildIndividualCases(fields) {
  const cases = []
  for (const field of fields) {
    for (const choice of individualChoices(field)) {
      if (!individualIncluded(field, choice)) continue
      cases.push({
        kind: 'individual',
        label: choice.text,
        expect: { outcome: 'accepted' },
        varied: { [field.name]: choice.value },
        ...assemble(fields, { [field.name]: choice.value }),
      })
    }
  }
  return cases
}

export function buildErrorCases(input) {
  const fields = input.map((field) => (field.object ? { ...field, sample: '' } : field))
  const cases = []
  const required = fields.filter((field) => field.required && field.location === 'body')
  if (required.length > 0) {
    const overrides = Object.fromEntries(required.map((field) => [field.name, OMIT]))
    cases.push({
      kind: 'error',
      label: 'omit every required field',
      expect: { outcome: 'error', minCount: Math.min(required.length, 2) },
      varied: { body: '(required fields omitted)' },
      ...assemble(fields, overrides),
    })
  }

  for (const field of fields) {
    if (field.required && field.location !== 'path') {
      cases.push(single(fields, field, OMIT, 'error', `omit ${field.name}`, { field: field.name }))
    }
    if (field.values.length > 0 && field.type !== 'boolean') {
      cases.push(single(fields, field, '__INVALID__', 'error', `${field.name} is not an allowed value`, { field: field.name }))
    }
    if (field.format === 'email') {
      cases.push(single(fields, field, 'not-an-email', 'error', `${field.name} is not an email`, { field: field.name }))
    }
    if (field.constraints.pattern) {
      cases.push(single(fields, field, invalidPattern(field), 'error', `${field.name} does not match its pattern`, { field: field.name }))
    }
    const limits = numericLimits(field)
    if (limits.below != null) {
      cases.push(single(fields, field, limits.below, 'error', `${field.name} below minimum`, { field: field.name }))
    }
    if (limits.above != null) {
      cases.push(single(fields, field, limits.above, 'error', `${field.name} above maximum`, { field: field.name }))
    }
    if (field.constraints.maxLength != null && field.constraints.maxLength > 0 && !field.constraints.pattern && field.format !== 'email') {
      const value = 'A'.repeat(field.constraints.maxLength + 1)
      cases.push(single(fields, field, value, 'error', `${field.name} longer than ${field.constraints.maxLength}`, { field: field.name }))
    }
    const temporal = invalidTemporal(field)
    if (temporal) {
      cases.push(single(fields, field, temporal.value, 'error', `${field.name} ${temporal.label}`, { field: field.name }))
    }
    const format = invalidFormat(field)
    if (format) {
      cases.push(single(fields, field, format.value, 'error', `${field.name} ${format.label}`, { field: field.name }))
    }
    if (field.location === 'path' && field.type === 'integer') {
      cases.push(single(fields, field, 'abc', 'error', `${field.name} is not an integer`, { field: field.name }))
    }
  }
  return cases
}

const ARRAY_ITEM_SCALARS = new Set(['string', 'integer', 'number', 'boolean', 'enum'])

export function isArrayOfObjects(field) {
  const type = String(field?.type || '')
  if (!type.startsWith('array of ')) return false
  return !ARRAY_ITEM_SCALARS.has(type.slice('array of '.length))
}

export function readExpectation(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { text: raw.value == null ? '' : String(raw.value), ordered: Boolean(raw.ordered) }
  }
  return { text: raw == null ? '' : String(raw), ordered: false }
}

export function parseObjectArray(text) {
  if (Array.isArray(text)) {
    if (text.some((item) => !plainObject(item))) return { error: 'Each entry must be an object.' }
    return { objects: text }
  }
  if (typeof text !== 'string') return null
  const raw = text.trim()
  if (!raw.startsWith('[') && !raw.startsWith('{')) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: 'Enter a JSON array of objects.' }
  }
  const objects = Array.isArray(parsed) ? parsed : [parsed]
  if (objects.some((item) => !plainObject(item))) return { error: 'Each entry must be an object.' }
  return { objects }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function defaultResponseExpected(field, requestNames, status) {
  if (!String(status).startsWith('2') || !scalarResponseField(field)) return ''
  if (requestNames?.has(field.name)) return `@{${field.name}}`
  const leaf = responseLeaf(field.name)
  if (!leaf || !requestNames?.has(leaf)) return ''
  return `@{${leaf}}`
}

export function responseChecks(views, requestNames, overridesByStatus = {}) {
  const checks = {}
  for (const view of views || []) {
    const overrides = overridesByStatus?.[view.status] || {}
    const fields = {}
    for (const field of view.fields || []) {
      if (Object.prototype.hasOwnProperty.call(overrides, field.name)) {
        const expectation = readExpectation(overrides[field.name])
        if (expectation.text !== '') {
          fields[field.name] = expectation.ordered ? { value: expectation.text, ordered: true } : expectation.text
        }
        continue
      }
      const automatic = defaultResponseExpected(field, requestNames, view.status)
      if (automatic) fields[field.name] = automatic
    }
    if (Object.keys(fields).length > 0) checks[view.status] = fields
  }
  return checks
}

export function judge(expect, status, text, context = {}) {
  const statusVerdict = judgeOutcome(expect, status, text)
  const valueVerdict = judgeExpectedValues(context, status, text)
  if (!valueVerdict) return statusVerdict
  if (statusVerdict.passed && valueVerdict.passed) {
    return { passed: true, detail: valueVerdict.checked ? 'Response matched' : statusVerdict.detail }
  }
  const reasons = []
  if (!statusVerdict.passed) reasons.push(statusVerdict.detail)
  if (!valueVerdict.passed) reasons.push(valueVerdict.detail)
  return { passed: false, detail: reasons.join('; ') }
}

function judgeOutcome(expect, status, text) {
  if (!expect || expect.outcome === 'success') {
    const passed = status >= 200 && status < 300
    return { passed, detail: passed ? 'Accepted' : `Expected a success status, received ${status || 'no response'}` }
  }
  if (expect.outcome === 'accepted') {
    const passed = status !== 400 && status !== 0
    return {
      passed,
      detail: passed ? `Validation accepted (${status})` : `Expected validation to accept the value, received ${status || 'no response'}`,
    }
  }
  if (expect.outcome === 'custom') {
    return judgeCustom(expect, status, text)
  }
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  const exceptions = parsed && Array.isArray(parsed.exceptions) ? parsed.exceptions : []
  const fieldMatched = !expect.field || exceptions.some((item) => item && item.field === expect.field)
  const countMatched = !expect.minCount || exceptions.length >= expect.minCount
  const passed = status === 400 && fieldMatched && countMatched
  if (passed) {
    return { passed, detail: expect.field ? `${expect.field} listed in exceptions` : `${exceptions.length} field errors` }
  }
  if (status !== 400) {
    return { passed: false, detail: `Expected 400, received ${status || 'no response'}` }
  }
  if (!fieldMatched) {
    return { passed: false, detail: `400 response did not list ${expect.field}` }
  }
  return { passed: false, detail: `Expected at least ${expect.minCount} field errors` }
}

function judgeExpectedValues(context, status, text) {
  const expectations = context?.expectations
  if (!expectations || Object.keys(expectations).length === 0) return null
  const pages = Array.isArray(context.pages) && context.pages.length
    ? context.pages
    : [{ status, text, label: '' }]
  const misses = []
  let checked = false
  for (const page of pages) {
    const fields = expectations[String(page.status)]
    if (!fields) continue
    let parsed = null
    try {
      parsed = JSON.parse(page.text)
    } catch {
      parsed = null
    }
    let reportedJson = false
    for (const [path, template] of Object.entries(fields)) {
      const expectation = readExpectation(template)
      const resolved = resolveRequestTemplate(expectation.text, context.request, context.variables)
      if (resolved.skip) continue
      checked = true
      if (parsed == null || typeof parsed !== 'object') {
        if (!reportedJson) {
          misses.push(page.label ? `${page.label}: response was not JSON` : 'Response was not JSON')
          reportedJson = true
        }
        continue
      }
      const compared = comparePath(parsed, path, resolved.value, expectation.ordered)
      if (compared.skip || compared.ok) continue
      const where = page.label ? `${page.label} ` : ''
      misses.push(compared.detail
        ? `${where}${path} ${compared.detail}`
        : `${where}${path} expected ${describeExpected(resolved.value)}, got ${describeActual(compared.actual)}`)
    }
  }
  if (misses.length > 0) return { passed: false, detail: misses.join('; ') }
  return { passed: true, checked }
}

function resolveRequestTemplate(template, request, variables) {
  const substituted = evaluateDynamics(substitute(template, variables || {}))
  if (typeof substituted !== 'string') return { skip: false, value: substituted }
  const whole = substituted.match(/^@\{([A-Za-z_][A-Za-z0-9_.]*)\}$/)
  if (whole) {
    const found = sentValue(request, whole[1])
    if (!found.sent) return { skip: true }
    return { skip: false, value: found.value }
  }
  let missing = false
  const text = substituted.replace(/@\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, (token, name) => {
    const found = sentValue(request, name)
    if (!found.sent) {
      missing = true
      return token
    }
    return found.value == null ? '' : String(found.value)
  })
  if (missing) return { skip: true }
  return { skip: false, value: text }
}

function storedText(value) {
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function sentValue(request, name) {
  for (const source of [request?.body, request?.path, request?.query]) {
    const found = valueAt(source, name)
    if (!found.present) continue
    if (found.value === undefined || found.value === null || found.value === '') return { sent: false }
    if (typeof found.value !== 'string') return { sent: true, value: found.value }
    return { sent: true, value: storedText(found.value) }
  }
  return { sent: false }
}

function valueAt(source, name) {
  if (!source || typeof source !== 'object') return { present: false }
  if (Object.prototype.hasOwnProperty.call(source, name)) return { present: true, value: source[name] }
  if (!String(name).includes('.')) return { present: false }
  let current = source
  for (const part of String(name).split('.')) {
    if (current == null || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { present: false }
    }
    current = current[part]
  }
  return { present: true, value: current }
}

function comparePath(body, path, expected, ordered = false) {
  const listed = parseObjectArray(expected)
  const values = valuesAt(body, path)
  if (listed) {
    if (listed.error) return { ok: false, detail: listed.error }
    const actual = String(path).includes('[]') ? values : values[0]
    return matchObjectArray(actual, listed.objects, ordered)
  }
  if (String(path).includes('[]')) {
    if (values.length === 0) return { skip: true }
    const actual = values.find((value) => !sameValue(value, expected))
    return actual === undefined ? { ok: true } : { ok: false, actual }
  }
  if (values.length === 0) return { ok: false, actual: undefined }
  return sameValue(values[0], expected) ? { ok: true } : { ok: false, actual: values[0] }
}

function matchObjectArray(actual, objects, ordered = false) {
  if (!Array.isArray(actual)) return { ok: false, actual }
  if (objects.length === 0) return actual.length === 0 ? { ok: true } : { ok: false, actual }
  if (ordered) {
    for (let index = 0; index < objects.length; index += 1) {
      const item = actual[index]
      if (!plainObject(item) || !objectCovers(item, objects[index])) {
        return {
          ok: false,
          actual,
          detail: `[${index}] expected ${describeExpected(objects[index])}, got ${describeActual(item)}`,
        }
      }
    }
    return { ok: true }
  }
  const used = new Set()
  for (const expected of objects) {
    const index = actual.findIndex((item, itemIndex) => !used.has(itemIndex) && plainObject(item) && objectCovers(item, expected))
    if (index < 0) return { ok: false, actual }
    used.add(index)
  }
  return { ok: true }
}

function objectCovers(actual, expected) {
  return Object.keys(expected).every((key) => sameValue(actual[key], expected[key]))
}

function valuesAt(body, path) {
  const parts = String(path).split('.').filter(Boolean)
  let currents = [body]
  for (const part of parts) {
    const array = part.endsWith('[]')
    const key = array ? part.slice(0, -2) : part
    const next = []
    for (const current of currents) {
      if (current == null || typeof current !== 'object') continue
      const value = current[key]
      if (array) {
        if (Array.isArray(value)) next.push(...value)
      } else if (value !== undefined) {
        next.push(value)
      }
    }
    currents = next
  }
  return currents
}

function sameValue(actual, expected) {
  if (actual === expected) return true
  if (actual == null || expected == null) return false
  if (typeof actual === 'object') {
    return JSON.stringify(actual) === (typeof expected === 'string' ? expected : JSON.stringify(expected))
  }
  if (sameInstant(actual, expected)) return true
  return String(actual) === String(expected)
}

function sameInstant(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  if (!/\d{4}-\d{2}-\d{2}T/.test(actual) || !/\d{4}-\d{2}-\d{2}T/.test(expected)) return false
  const left = Date.parse(actual)
  const right = Date.parse(expected)
  return Number.isFinite(left) && left === right
}

function describeExpected(value) {
  if (value == null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function scalarResponseField(field) {
  return field?.type !== 'object' && !String(field?.type || '').startsWith('array')
}

function responseLeaf(path) {
  const last = String(path || '').split('.').pop() || ''
  return last.endsWith('[]') ? '' : last
}

export const MAX_PAGES = 100

const PAGE_PARAMS = new Set(['page', 'pagenumber', 'pageindex', 'pageno'])
const OFFSET_PARAMS = new Set(['offset', 'skip'])
const SIZE_PARAMS = new Set(['size', 'pagesize', 'limit', 'perpage', 'maxresults'])
const CURSOR_PARAMS = new Set(['cursor', 'nextcursor', 'pagetoken', 'nextpagetoken', 'continuationtoken', 'after', 'startingafter', 'startafter'])
const ITEM_NAMES = ['content', 'items', 'data', 'results', 'records', 'values', 'elements']

export function detectPagination(spec, pathItem, operation) {
  const parameters = [...(pathItem?.parameters || []), ...(operation?.parameters || [])]
    .map((parameter) => (parameter.$ref ? resolveRef(spec, parameter.$ref) : parameter))
    .filter((parameter) => parameter && parameter.name && (parameter.in || 'query') === 'query')
    .map((parameter) => ({
      raw: parameter.name,
      key: normalizeName(parameter.name),
      schema: resolveSchema(spec, parameter.schema || {}),
    }))
  const cursor = parameters.find((parameter) => CURSOR_PARAMS.has(parameter.key))
  const page = parameters.find((parameter) => PAGE_PARAMS.has(parameter.key))
  const offset = parameters.find((parameter) => OFFSET_PARAMS.has(parameter.key))
  const size = parameters.find((parameter) => SIZE_PARAMS.has(parameter.key))
  const fields = schemaFields(spec, successSchema(spec, operation))
  const itemsField = findItems(fields)
  const totalPages = findField(fields, ['totalpages', 'pagecount'])
  const total = findField(fields, ['totalsize', 'totalelements', 'totalcount', 'totalitems', 'total'])
  const pageField = findField(fields, ['page', 'pagenumber', 'number'])
  const sizeField = findField(fields, ['size', 'pagesize', 'limit', 'perpage'])
  const nextCursor = findField(fields, ['nextcursor', 'nextpagetoken', 'nexttoken', 'continuationtoken', cursor?.key].filter(Boolean))
  const hasMore = findField(fields, ['hasmore', 'hasnext'])
  const nextLink = findField(fields, ['next', 'nextlink', 'nexthref'])

  let style = null
  if (cursor) {
    style = 'cursor'
  } else if (offset && !page) {
    style = 'offset'
  } else if (page || totalPages || hasMore) {
    style = 'page'
  } else if (nextLink && (nextLink.schema.format === 'uri' || nextLink.key !== 'next')) {
    style = 'link'
  }
  if (!style) {
    return null
  }

  let pageBase = 0
  if (page && (page.schema.minimum === 1 || page.schema.default === 1)) {
    pageBase = 1
  }

  return {
    style,
    pageBase,
    request: {
      page: page ? page.raw : null,
      offset: offset ? offset.raw : null,
      size: size ? size.raw : null,
      cursor: cursor ? cursor.raw : (style === 'cursor' ? nextCursor?.name : null),
    },
    response: {
      items: itemsField ? itemsField.path : null,
      totalPages: totalPages ? totalPages.path : null,
      total: total ? total.path : null,
      page: pageField ? pageField.path : null,
      size: sizeField ? sizeField.path : null,
      nextCursor: nextCursor ? nextCursor.path : null,
      hasMore: hasMore ? hasMore.path : null,
      nextLink: nextLink ? nextLink.path : null,
    },
  }
}

export function firstPageQuery(pagination, query) {
  const next = { ...query }
  if (!pagination) {
    return next
  }
  if (pagination.request.page) delete next[pagination.request.page]
  if (pagination.request.offset) delete next[pagination.request.offset]
  if (pagination.request.cursor) delete next[pagination.request.cursor]
  return next
}

export function planContinuation(pagination, query, body, fetched, linkHeader) {
  if (!pagination || !Array.isArray(fetched) || fetched.length === 0 || fetched.length >= MAX_PAGES) {
    return null
  }
  const headerLink = nextLinkFromHeader(linkHeader)
  if (pagination.style === 'link') {
    const href = headerLink || readPath(body, pagination.response.nextLink)
    return href ? { url: href, label: `link ${fetched.length + 1}` } : null
  }
  if (pagination.style === 'cursor') {
    const items = readItems(body, pagination)
    const total = numberOrNull(readPath(body, pagination.response.total))
    const fetchedCount = fetched.reduce((sum, step) => sum + (Number(step.count) || 0), 0)
    if (items.length === 0 || (total != null && fetchedCount >= total)) {
      return null
    }
    const size = numberOrNull(readPath(body, pagination.response.size)) ?? numberOrNull(query[pagination.request.size])
    if (size != null && items.length < size) {
      return null
    }
    const token = readPath(body, pagination.response.nextCursor)
    if (token == null || token === '') {
      return null
    }
    if (fetched.some((step) => step.cursor === token)) {
      return null
    }
    const nextQuery = { ...query, [pagination.request.cursor]: token }
    if (pagination.request.size && nextQuery[pagination.request.size] == null && size != null) {
      nextQuery[pagination.request.size] = size
    }
    return {
      query: nextQuery,
      cursor: token,
      label: `cursor ${String(token).slice(0, 24)}`,
    }
  }
  if (pagination.style === 'offset') {
    const items = readItems(body, pagination)
    const current = Number(fetched[fetched.length - 1].offset ?? 0)
    const nextOffset = current + items.length
    const size = numberOrNull(query[pagination.request.size]) ?? numberOrNull(readPath(body, pagination.response.size))
    const total = numberOrNull(readPath(body, pagination.response.total))
    if (items.length === 0 || (size != null && items.length < size) || (total != null && nextOffset >= total)) {
      return null
    }
    return {
      query: { ...query, [pagination.request.offset]: nextOffset },
      offset: nextOffset,
      label: `offset ${nextOffset}`,
    }
  }

  const totalPages = numberOrNull(readPath(body, pagination.response.totalPages))
  if (totalPages != null && fetched.length >= totalPages) {
    return null
  }
  const reportedPage = numberOrNull(readPath(body, pagination.response.page))
  const firstPage = numberOrNull(fetched[0].pageIndex) ?? reportedPage ?? pagination.pageBase
  const nextIndex = firstPage + fetched.length
  const items = readItems(body, pagination)
  const size = numberOrNull(query[pagination.request.size]) ?? numberOrNull(readPath(body, pagination.response.size))
  const hasMore = readPath(body, pagination.response.hasMore)
  if (totalPages == null) {
    if (hasMore === false || items.length === 0) {
      return null
    }
    if (hasMore !== true && size != null && items.length < size) {
      return null
    }
  }
  const pageName = pagination.request.page || 'page'
  const nextQuery = { ...query, [pageName]: nextIndex }
  if (pagination.request.size && nextQuery[pagination.request.size] == null && size != null) {
    nextQuery[pagination.request.size] = size
  }
  return {
    query: nextQuery,
    pageIndex: nextIndex,
    label: totalPages != null ? `page ${nextIndex} of ${totalPages}` : `page ${nextIndex}`,
  }
}

export function readItems(body, pagination) {
  if (!pagination) {
    return []
  }
  if (!pagination.response.items) {
    return Array.isArray(body) ? body : []
  }
  const value = readPath(body, pagination.response.items)
  return Array.isArray(value) ? value : []
}

export function readJsonPath(value, path) {
  if (!path || value == null) {
    return undefined
  }
  const parts = String(path).replace(/\[\]/g, '[0]').split(/\.|\[|\]/).filter(Boolean)
  let current = value
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    current = current[part]
  }
  return current
}

function judgeCustom(expect, status) {
  const wanted = expect.status ? Number(expect.status) : null
  const passed = wanted ? status === wanted : status >= 200 && status < 300
  if (passed) {
    return { passed, detail: wanted ? `HTTP ${wanted}` : 'Accepted' }
  }
  return {
    passed: false,
    detail: wanted ? `Expected HTTP ${wanted}, received ${status || 'no response'}` : `Expected a success status, received ${status || 'no response'}`,
  }
}

function describeActual(actual) {
  if (actual === undefined || actual === null) {
    return 'missing'
  }
  if (typeof actual === 'object') {
    return JSON.stringify(actual)
  }
  return String(actual)
}

export function readPath(value, path) {
  if (!path) {
    return undefined
  }
  let current = value
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return undefined
    }
    current = current[key]
  }
  return current
}

export function nextLinkFromHeader(header) {
  if (!header) {
    return null
  }
  for (const part of String(header).split(',')) {
    const match = part.match(/<([^>]+)>/)
    if (match && /rel="?next"?/i.test(part)) {
      return match[1]
    }
  }
  return null
}

export function describeFetched(reports) {
  const failed = reports.find((report) => report.status < 200 || report.status >= 300)
  const counted = reports.reduce((sum, report) => sum + report.count, 0)
  const lines = [
    `${reports.length} pages fetched, ${counted} records`,
    ...reports.map((report) => `${report.label}: HTTP ${report.status}, ${report.count} records`),
  ]
  if (reports.length >= MAX_PAGES) {
    lines.push(`Stopped after ${MAX_PAGES} pages.`)
  }
  return {
    status: failed ? failed.status : (reports[0] ? reports[0].status : 0),
    text: lines.join('\n'),
  }
}

export function createPacer(requestsPerSecond) {
  const rate = Number(requestsPerSecond)
  const interval = Number.isFinite(rate) && rate > 0 ? 1000 / rate : 0
  let nextAt = 0
  return async function pace() {
    if (interval <= 0) {
      return
    }
    const now = Date.now()
    const wait = Math.max(0, nextAt - now)
    nextAt = Math.max(now, nextAt) + interval
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

export function joinUrl(base, path) {
  const left = base.endsWith('/') ? base.slice(0, -1) : base
  const right = path.startsWith('/') ? path : `/${path}`
  return `${left}${right}`
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[_-]/g, '')
}

export function viewsWithStatuses(views, codes) {
  const listed = Array.isArray(views) ? views : []
  const known = new Set(listed.map((view) => String(view.status)))
  const extras = []
  for (const code of codes || []) {
    const status = String(code)
    if (!/^\d{3}$/.test(status) || known.has(status)) continue
    known.add(status)
    const source = schemaSource(listed, status)
    extras.push({
      status,
      description: source ? `Same fields as HTTP ${source.status}.` : 'Added for this endpoint.',
      fields: source ? source.fields : [],
      added: true,
    })
  }
  return [...listed, ...extras].sort((left, right) => String(left.status).localeCompare(String(right.status), undefined, { numeric: true }))
}

function schemaSource(views, status) {
  const withFields = (view) => Array.isArray(view?.fields) && view.fields.length > 0
  const head = String(status).charAt(0)
  const same = views.find((view) => withFields(view) && String(view.status).startsWith(head))
  if (same) return same
  if (head === '4' || head === '5') {
    const error = views.find((view) => withFields(view) && /^[45]/.test(String(view.status)))
    if (error) return error
  }
  return views.find(withFields) || null
}

export function responseViews(spec, operation) {
  const responses = operation?.responses || {}
  return Object.keys(responses).sort().map((status) => {
    const raw = responses[status] || {}
    const resolved = raw.$ref ? resolveRef(spec, raw.$ref) : raw
    const content = resolved.content || {}
    const media = content['application/json'] || content['application/*+json'] || Object.values(content)[0] || null
    const schema = media ? resolveSchema(spec, media.schema || {}) : null
    return {
      status,
      description: resolved.description || '',
      fields: schema ? schemaRows(spec, schema, '', 0) : [],
    }
  })
}

function schemaRows(spec, schema, prefix, depth) {
  const resolved = resolveSchema(spec, schema)
  if (!resolved || depth > 8) {
    return []
  }
  if (resolved.type === 'array' || resolved.items) {
    const item = resolveSchema(spec, resolved.items || {})
    const itemType = item.properties ? (item.title || 'object') : schemaType(item)
    const name = prefix || '[]'
    const rows = [{ name, type: `array of ${itemType}`, required: false, note: '' }]
    if (item.properties) {
      rows.push(...objectRows(spec, item, `${name}[]`, depth + 1))
    }
    return rows
  }
  if (resolved.properties) {
    return objectRows(spec, resolved, prefix, depth)
  }
  if (!prefix) {
    return [{ name: 'body', type: schemaType(resolved), required: false, note: resolved.format || '' }]
  }
  return []
}

function objectRows(spec, schema, prefix, depth) {
  const required = new Set(schema.required || [])
  const rows = []
  for (const [name, property] of Object.entries(schema.properties || {})) {
    const resolved = resolveSchema(spec, property)
    const path = prefix ? `${prefix}.${name}` : name
    const note = [resolved.format, Array.isArray(resolved.enum) ? resolved.enum.join(' | ') : '', resolved.description]
      .filter(Boolean)
      .join(' · ')
    if (resolved.type === 'array' || resolved.items) {
      const nested = schemaRows(spec, resolved, path, depth + 1)
      if (nested[0]) {
        nested[0].required = required.has(name)
        if (!nested[0].note) nested[0].note = note
      }
      rows.push(...nested)
    } else if (resolved.properties) {
      rows.push({ name: path, type: 'object', required: required.has(name), note })
      rows.push(...objectRows(spec, resolved, path, depth + 1))
    } else {
      rows.push({ name: path, type: Array.isArray(resolved.enum) && resolved.enum.length > 0 ? 'enum' : schemaType(resolved), required: required.has(name), note })
    }
  }
  return rows
}

function successSchema(spec, operation) {
  const responses = operation?.responses || {}
  const response = responses['200'] || responses['201'] || responses.default
  if (!response) {
    return null
  }
  const resolved = response.$ref ? resolveRef(spec, response.$ref) : response
  const content = resolved.content || {}
  const media = content['application/json'] || content['application/*+json'] || Object.values(content)[0]
  if (!media) {
    return null
  }
  return resolveSchema(spec, media.schema || {})
}

function schemaFields(spec, schema, prefix = [], depth = 0, into = []) {
  if (!schema || schema.type === 'array' || depth > 8) {
    return into
  }
  for (const [name, property] of Object.entries(schema.properties || {})) {
    const resolved = resolveSchema(spec, property)
    const path = [...prefix, name]
    into.push({ key: normalizeName(name), name, path, schema: resolved })
    if (resolved.type !== 'array' && resolved.properties) {
      schemaFields(spec, resolved, path, depth + 1, into)
    }
  }
  return into
}

function findField(fields, keys) {
  for (const key of keys) {
    const found = fields.find((field) => field.key === key)
    if (found) {
      return found
    }
  }
  return null
}

function findItems(fields) {
  for (const name of ITEM_NAMES) {
    const found = fields.find((field) => field.key === name && (field.schema.type === 'array' || field.schema.items))
    if (found) {
      return found
    }
  }
  return fields.find((field) => field.schema.type === 'array' || field.schema.items) || null
}

function exclusiveGroups(spec, operation) {
  const content = operation.requestBody && operation.requestBody.content
  const media = content && (content['application/json'] || content['application/*+json'] || content['*/*'] || Object.values(content)[0])
  if (!media) return []
  const groups = []
  collectExclusive(spec, resolveSchema(spec, media.schema || {}), '', groups, 0, new Set())
  return groups
}

function collectExclusive(spec, schema, prefix, into, depth, seen) {
  if (!schema || depth > 8) return
  for (const group of readExclusiveGroups(schema)) {
    const names = group.map((name) => (prefix ? `${prefix}.${name}` : name))
    if (names.length > 1) into.push(names)
  }
  for (const [name, property] of Object.entries(schema.properties || {})) {
    const resolved = resolveSchema(spec, property)
    if (!isObjectSchema(resolved)) continue
    const path = prefix ? `${prefix}.${name}` : name
    const ref = property && property.$ref
    if (ref && seen.has(ref)) continue
    const nextSeen = new Set(seen)
    if (ref) nextSeen.add(ref)
    collectExclusive(spec, resolved, path, into, depth + 1, nextSeen)
  }
}

function readExclusiveGroups(schema) {
  const raw = schema?.['x-mutually-exclusive']
  const source = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.groups) ? raw.groups : null)
  if (!source) return []
  return source
    .map((group) => (Array.isArray(group) ? group.filter((name) => typeof name === 'string' && name) : []))
    .filter((group) => group.length > 1)
}

function fieldsFor(spec, pathItem, operation) {
  const fields = []
  for (const parameter of [...(pathItem.parameters || []), ...(operation.parameters || [])]) {
    const resolved = parameter.$ref ? resolveRef(spec, parameter.$ref) : parameter
    const schema = resolveSchema(spec, resolved.schema || {})
    fields.push(fieldFromSchema(resolved.name, schema, Boolean(resolved.required), resolved.in || 'query'))
  }

  const content = operation.requestBody && operation.requestBody.content
  const media = content && (content['application/json'] || content['application/*+json'] || content['*/*'] || Object.values(content)[0])
  if (!media) {
    return fields
  }
  const schema = resolveSchema(spec, media.schema || {})
  appendBodyFields(spec, schema, '', fields, 0, new Set())
  return fields
}

function appendBodyFields(spec, schema, prefix, into, depth, seen) {
  if (!schema || depth > 8) {
    return
  }
  const required = new Set(schema.required || [])
  for (const [name, property] of Object.entries(schema.properties || {})) {
    const resolved = resolveSchema(spec, property)
    const path = prefix ? `${prefix}.${name}` : name
    if (isObjectSchema(resolved)) {
      into.push(fieldFromSchema(path, resolved, required.has(name), 'body', true))
      const ref = property && property.$ref
      if (ref && seen.has(ref)) continue
      const nextSeen = new Set(seen)
      if (ref) nextSeen.add(ref)
      appendBodyFields(spec, resolved, path, into, depth + 1, nextSeen)
    } else {
      into.push(fieldFromSchema(path, resolved, required.has(name), 'body', false))
    }
  }
}

function isObjectSchema(schema) {
  if (!schema) return false
  const types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : [])
  if (types.includes('array') || schema.items) return false
  return Boolean(schema.properties) || types.includes('object')
}

function fieldFromSchema(name, schema, required, location, object = false) {
  const values = discreteValues(schema)
  const isEnum = Array.isArray(schema.enum) && schema.enum.length > 0
  // Optional query filters stay empty so a list call is not narrowed to a placeholder range.
  const optionalQuery = location === 'query' && !required
  const sample = object || optionalQuery ? undefined : sampleFor(schema, name, required)
  return {
    name,
    location,
    type: object ? 'object' : schemaType(schema),
    object,
    enum: object ? false : isEnum,
    format: object ? '' : (schema.format || ''),
    required,
    members: isEnum ? uniqueMembers(values) : undefined,
    values: object ? [] : (isEnum ? enumLoopValues(uniqueMembers(values), required) : (values || [])),
    vary: object ? false : isEnum,
    sample: sample === undefined ? '' : sample,
    constraints: {
      minimum: numberOrNull(schema.minimum),
      maximum: numberOrNull(schema.maximum),
      exclusiveMinimum: schema.exclusiveMinimum === undefined ? null : schema.exclusiveMinimum,
      exclusiveMaximum: schema.exclusiveMaximum === undefined ? null : schema.exclusiveMaximum,
      minLength: numberOrNull(schema.minLength),
      maxLength: numberOrNull(schema.maxLength),
      pattern: schema.pattern || '',
    },
  }
}

function uniqueMembers(values) {
  const members = []
  let sawNull = false
  for (const value of values || []) {
    if (isOmitted(value)) continue
    if (value == null) {
      if (sawNull) continue
      sawNull = true
      members.push(null)
      continue
    }
    if (members.some((item) => item === value)) continue
    members.push(value)
  }
  return members
}

function enumLoopValues(members, required) {
  const loop = [...members]
  if (!required) {
    if (!loop.some((value) => value == null)) loop.push(null)
    loop.push(OMIT)
  }
  return loop
}

function discreteValues(schema) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum
  }
  if (schemaType(schema) === 'boolean') {
    return [false, true]
  }
  return null
}

function sampleFor(schema, name, required) {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }
  if (schema.example !== undefined) {
    return schema.example
  }
  if (schema.default !== undefined) {
    return schema.default
  }

  const type = schemaType(schema)
  if (type === 'boolean') {
    return false
  }
  if (type === 'integer') {
    if (typeof schema.minimum === 'number') {
      return schema.exclusiveMinimum === true ? schema.minimum + 1 : schema.minimum
    }
    return 1
  }
  if (type === 'number') {
    if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number' && schema.maximum <= 1) {
      return schema.minimum
    }
    if (typeof schema.minimum === 'number') {
      return schema.minimum
    }
    return 1
  }
  if (type !== 'string') {
    return undefined
  }

  if (schema.format === 'email') {
    return 'ada@example.com'
  }
  if (schema.format === 'date' || schema.format === 'date-time') {
    if (!required) {
      return undefined
    }
    return temporalSample(name, schema.format)
  }
  const fromPattern = sampleFromPattern(schema.pattern)
  if (fromPattern) {
    return fromPattern
  }
  if (!required) {
    return undefined
  }
  const text = 'Sample'
  return typeof schema.maxLength === 'number' && schema.maxLength > 0 ? text.slice(0, schema.maxLength) : text
}

function temporalSample(name, format) {
  const future = /due|deliver|arrival|expir/i.test(name)
  if (format === 'date') {
    return future ? '2099-12-01' : '1990-05-20'
  }
  if (/captured|local/i.test(name)) {
    return '2020-01-15T12:00:00'
  }
  return future ? '2099-12-01T00:00:00Z' : '2020-01-15T10:15:30Z'
}

function sampleFromPattern(pattern) {
  if (!pattern) {
    return null
  }
  const normalized = pattern.replace(/^\^/, '').replace(/\$$/, '')
  if (normalized === '[A-Z]{2}') {
    return 'HK'
  }
  if (normalized === '\\d{4}' || normalized === '[0-9]{4}') {
    return '4242'
  }
  if (normalized === '\\+?[0-9]{8,15}') {
    return '+85291234567'
  }
  return null
}

function single(fields, field, value, kind, label, errorExpect = {}) {
  const overrides = { [field.name]: value }
  for (const other of fields) {
    if (other.name === field.name || other.required) continue
    if (other.object && (field.name === other.name || field.name.startsWith(`${other.name}.`))) continue
    if (field.object && (other.name === field.name || other.name.startsWith(`${field.name}.`))) continue
    overrides[other.name] = OMIT
  }
  return {
    kind,
    label,
    expect: kind === 'error' ? { outcome: 'error', ...errorExpect } : { outcome: 'accepted' },
    varied: { [field.name]: isOmitted(value) ? '(omitted)' : value },
    ...assemble(fields, overrides),
  }
}

function numericLimits(field) {
  if (field.type !== 'integer' && field.type !== 'number') {
    return { min: null, max: null, below: null, above: null }
  }
  const constraints = field.constraints
  let min = constraints.minimum
  let max = constraints.maximum
  let minExclusive = constraints.exclusiveMinimum === true
  let maxExclusive = constraints.exclusiveMaximum === true
  if (typeof constraints.exclusiveMinimum === 'number') {
    min = constraints.exclusiveMinimum
    minExclusive = true
  }
  if (typeof constraints.exclusiveMaximum === 'number') {
    max = constraints.exclusiveMaximum
    maxExclusive = true
  }
  const delta = field.type === 'integer' ? 1 : 0.01
  const adjust = (value) => (field.type === 'integer' ? value : Math.round(value * 100) / 100)
  return {
    min: min == null ? null : (minExclusive ? adjust(min + delta) : min),
    max: max == null ? null : (maxExclusive ? adjust(max - delta) : max),
    below: min == null ? null : (minExclusive ? min : adjust(min - delta)),
    above: max == null ? null : (maxExclusive ? max : adjust(max + delta)),
  }
}

function plainText(field) {
  return field.type === 'string' && !field.constraints?.pattern && field.format !== 'email' && field.format !== 'date' && field.format !== 'date-time'
}

function exactLength(field) {
  const maxLength = field.constraints.maxLength
  if (field.type !== 'string' || !maxLength || maxLength < 1 || field.constraints.pattern) {
    return null
  }
  if (field.format === 'email' || field.format === 'date' || field.format === 'date-time') {
    return null
  }
  return { value: 'A'.repeat(maxLength), label: `at length ${maxLength}` }
}

function patternEdges(field) {
  const match = String(field.constraints.pattern || '').match(/^\[(A-Z|0-9)\]\{(\d+)\}$/)
  if (!match || field.type !== 'string') {
    return []
  }
  const alphabet = match[1] === 'A-Z' ? ['A', 'Z'] : ['0', '9']
  const length = Number(match[2])
  return alphabet.map((character) => ({
    value: character.repeat(length),
    label: `pattern ${character.repeat(length)}`,
  }))
}

function invalidPattern(field) {
  const pattern = String(field.constraints.pattern || '')
  if (pattern.includes('A-Z')) {
    return 'a'.repeat(Math.max(patternLength(pattern), 1))
  }
  if (pattern.includes('0-9') || pattern.includes('\\d')) {
    return 'A'.repeat(Math.max(patternLength(pattern), 1))
  }
  return '!!!'
}

function patternLength(pattern) {
  const match = pattern.match(/\{(\d+)\}/)
  return match ? Number(match[1]) : 1
}

function invalidFormat(field) {
  if (field.format === 'date') {
    return { value: 'not-a-date', label: 'is not a date' }
  }
  if (field.format === 'date-time') {
    return { value: 'not-a-date', label: 'is not a timestamp' }
  }
  return null
}

function invalidTemporal(field) {
  if (field.location !== 'body' || (field.format !== 'date' && field.format !== 'date-time')) {
    return null
  }
  const futureAllowed = /due|deliver|arrival|expir/i.test(field.name)
  const pastAllowed = /birth|ordered|registered|authorized|captured|shipped|issued|paid|At$|Date$/i.test(field.name)
  if (!futureAllowed && !pastAllowed) {
    return null
  }
  if (futureAllowed) {
    return field.format === 'date'
      ? { value: '1990-01-01', label: 'is earlier than allowed' }
      : { value: '1990-01-01T00:00:00Z', label: 'is earlier than allowed' }
  }
  return field.format === 'date'
    ? { value: '2099-12-01', label: 'is later than allowed' }
    : { value: '2099-12-01T00:00:00Z', label: 'is later than allowed' }
}

function numberOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return null
}

const PAGINATION_QUERY = new Set(['page', 'size', 'limit', 'offset', 'cursor', 'nextcursor'])

function assemble(fields, overrides, options = {}) {
  const body = {}
  const query = {}
  const path = {}
  const suppressed = new Set()
  for (const field of fields) {
    if (!field.object || field.location !== 'body') continue
    const value = Object.prototype.hasOwnProperty.call(overrides, field.name) ? overrides[field.name] : field.sample
    if (isOmitted(value) || objectChoice(value) !== 'fields') suppressed.add(field.name)
  }
  for (const field of fields) {
    if (nestedUnder(field.name, suppressed)) continue
    if (options.combination && field.location === 'query' && !field.required && !Object.prototype.hasOwnProperty.call(overrides, field.name) && !PAGINATION_QUERY.has(String(field.name).toLowerCase())) {
      continue
    }
    const value = Object.prototype.hasOwnProperty.call(overrides, field.name) ? overrides[field.name] : field.sample
    if (field.object) {
      if (isOmitted(value) || objectChoice(value) === 'fields') continue
      place(body, field.name, objectChoice(value) === 'null' ? null : {})
      continue
    }
    if (isOmitted(value) || value === undefined || value === '') {
      continue
    }
    if (value === null) {
      if (field.location === 'body') place(body, field.name, null)
      else if (field.location === 'query') query[field.name] = ''
      continue
    }
    if (field.location === 'query') {
      query[field.name] = value
    } else if (field.location === 'path') {
      path[field.name] = value
    } else if (field.location === 'body') {
      place(body, field.name, value)
    }
  }
  return { body, query, path }
}

function nestedUnder(name, roots) {
  const parts = String(name).split('.')
  for (let length = 1; length < parts.length; length += 1) {
    if (roots.has(parts.slice(0, length).join('.'))) return true
  }
  return false
}

function place(body, name, value) {
  const parts = String(name).split('.')
  let node = body
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    if (!node[part] || typeof node[part] !== 'object') node[part] = {}
    node = node[part]
  }
  node[parts[parts.length - 1]] = value
}

function schemaType(schema) {
  if (Array.isArray(schema.type)) {
    return schema.type.find((type) => type !== 'null') || 'string'
  }
  if (schema.type) {
    return schema.type
  }
  if (schema.enum) {
    return 'string'
  }
  return 'string'
}

function resolveSchema(spec, schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') {
    return {}
  }
  if (schema.$ref) {
    if (seen.has(schema.$ref)) {
      return {}
    }
    const next = new Set(seen)
    next.add(schema.$ref)
    return resolveSchema(spec, resolveRef(spec, schema.$ref), next)
  }
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((part) => resolveSchema(spec, part, seen))
    const objectParts = parts.filter((part) => part?.properties || part?.type === 'object')
    if (objectParts.length === 0 && !schema.properties) {
      return { ...(parts.find((part) => part?.type && part.type !== 'object') || parts[0] || {}), ...schema, allOf: undefined }
    }
    const merged = { type: 'object', properties: {}, required: [] }
    for (const resolved of parts) {
      Object.assign(merged.properties, resolved.properties || {})
      merged.required.push(...(resolved.required || []))
    }
    Object.assign(merged.properties, schema.properties || {})
    merged.required.push(...(schema.required || []))
    return merged
  }
  const branches = schema.oneOf || schema.anyOf
  if (Array.isArray(branches)) {
    const objects = branches
      .map((part) => resolveSchema(spec, part, seen))
      .filter((part) => part && part.properties && !part.items)
    if (objects.length > 0) {
      return objects.sort((left, right) => Object.keys(right.properties).length - Object.keys(left.properties).length)[0]
    }
  }
  return schema
}

function resolveRef(spec, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    throw new Error(`Unsupported schema reference: ${ref}`)
  }
  let node = spec
  for (const part of ref.slice(2).split('/')) {
    if (!node || typeof node !== 'object') {
      throw new Error(`Cannot resolve ${ref}`)
    }
    node = node[decodeURIComponent(part)]
  }
  return node
}
