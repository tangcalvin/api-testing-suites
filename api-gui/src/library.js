import yaml from 'js-yaml'
import { pagingMaps } from './openapi/pagination.js'

export const DEFAULTS_KEY = 'api-tester.defaults'
export const CASES_KEY = 'api-tester.cases'
export const PROFILES_KEY = 'api-tester.profiles'
export const OAUTH_KEY = 'api-tester.oauth'

export const EXAMPLE_DEFAULTS_URL = '/examples/field-defaults.json'
export const EXAMPLE_CASES_URL = '/examples/custom-cases.json'
export const EXAMPLE_PROFILES_URL = '/examples/clients.yaml'

export const DEFAULT_RATE = '30'

export function emptyDefaults() {
  return { variables: {}, patterns: {}, global: {}, headers: {}, operations: {}, responses: {}, extraStatuses: {}, tps: DEFAULT_RATE }
}

export function storedRate(value) {
  if (value == null || String(value).trim() === '') return DEFAULT_RATE
  const rate = Number(String(value).trim())
  if (!Number.isFinite(rate) || rate <= 0) return DEFAULT_RATE
  return String(value).trim()
}

export function emptyCases() {
  return { operations: {}, exclusions: {}, values: {}, vary: {}, errors: {}, checks: {}, steps: {}, ids: {}, filters: {}, paging: {}, scenarios: [], trials: {} }
}

export function loadStored(key, empty, parse) {
  const store = browserStorage()
  if (!store) {
    return empty()
  }
  try {
    const raw = store.getItem(key)
    return raw ? parse(raw) : empty()
  } catch {
    return empty()
  }
}

export function saveStored(key, value) {
  const store = browserStorage()
  if (!store) {
    return
  }
  store.setItem(key, JSON.stringify(value))
}

export function defaultsDocument(defaults) {
  return {
    version: 1,
    kind: 'defaults',
    variables: defaults.variables || {},
    ...(Object.keys(defaults.patterns || {}).length > 0 ? { patterns: defaults.patterns } : {}),
    global: defaults.global || {},
    headers: defaults.headers || {},
    operations: defaults.operations || {},
    ...(storedRate(defaults.tps) !== DEFAULT_RATE ? { tps: storedRate(defaults.tps) } : {}),
    ...(Object.keys(defaults.responses || {}).length > 0 ? { responses: defaults.responses } : {}),
    ...(Object.keys(defaults.extraStatuses || {}).length > 0 ? { extraStatuses: defaults.extraStatuses } : {}),
  }
}

export function casesDocument(cases) {
  const exclusions = cases.exclusions || {}
  const values = cases.values || {}
  const vary = cases.vary || {}
  const errors = cases.errors || {}
  const checks = cases.checks || {}
  const steps = cases.steps || {}
  const ids = cases.ids || {}
  const filters = cases.filters || {}
  const paging = cases.paging || {}
  const scenarios = Array.isArray(cases.scenarios) ? cases.scenarios : []
  const trials = cases.trials || {}
  return {
    version: 1,
    kind: 'cases',
    operations: cases.operations || {},
    ...(Object.keys(exclusions).length > 0 ? { exclusions } : {}),
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...(Object.keys(vary).length > 0 ? { vary } : {}),
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
    ...(Object.keys(checks).length > 0 ? { checks } : {}),
    ...(Object.keys(steps).length > 0 ? { steps } : {}),
    ...(Object.keys(ids).length > 0 ? { ids } : {}),
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    ...(Object.keys(paging).length > 0 ? { paging } : {}),
    ...(scenarios.length > 0 ? { scenarios } : {}),
    ...(Object.keys(trials).length > 0 ? { trials } : {}),
  }
}

export function parseDefaults(value) {
  const data = readObject(value, 'Defaults file must be a JSON object.')
  if (data.kind && data.kind !== 'defaults') {
    throw new Error('This file is not a field defaults export.')
  }
  return {
    variables: valueMap(data.variables),
    patterns: valueMap(data.patterns),
    global: valueMap(data.global),
    headers: valueMap(data.headers),
    operations: operationMaps(data.operations),
    tps: storedRate(data.tps),
    responses: responseMaps(data.responses),
    extraStatuses: statusLists(data.extraStatuses),
  }
}

export function hasSavedDefaults(defaults) {
  if (!defaults) return false
  return Object.keys(defaults.variables || {}).length > 0
    || Object.keys(defaults.patterns || {}).length > 0
    || Object.keys(defaults.global || {}).length > 0
    || Object.keys(defaults.headers || {}).length > 0
    || Object.keys(defaults.operations || {}).length > 0
    || Object.keys(defaults.responses || {}).length > 0
    || Object.keys(defaults.extraStatuses || {}).length > 0
}

export function hasSavedCases(cases) {
  return Object.values(cases?.operations || {}).some((list) => Array.isArray(list) && list.length > 0)
    || Object.keys(cases?.exclusions || {}).length > 0
    || Object.keys(cases?.values || {}).length > 0
    || Object.keys(cases?.vary || {}).length > 0
    || Object.keys(cases?.steps || {}).length > 0
    || Object.keys(cases?.ids || {}).length > 0
    || Object.keys(cases?.filters || {}).length > 0
    || Object.keys(cases?.paging || {}).length > 0
    || (cases?.scenarios || []).length > 0
    || Object.keys(cases?.trials || {}).length > 0
}

export function emptyOauth() {
  return {
    tokenUrl: '',
    clientId: '',
    audience: '',
    algorithm: 'RS256',
    privateKey: '',
    scope: '',
    lifetime: '300',
    caCert: '',
  }
}

export function parseOauth(value) {
  let data = value
  if (typeof value === 'string') data = JSON.parse(value)
  if (data == null) data = {}
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('OAuth settings must be a JSON object.')
  }
  const next = emptyOauth()
  for (const key of Object.keys(next)) {
    if (typeof data[key] === 'string') next[key] = data[key]
  }
  if (!['RS256', 'ES256', 'HS256'].includes(next.algorithm)) next.algorithm = 'RS256'
  return next
}

export function createProfile({ id, name = '', defaults, cases, oauth } = {}) {
  return {
    id: id || newId(),
    name: String(name || ''),
    defaults: defaults ? parseDefaults(defaults) : emptyDefaults(),
    cases: cases ? parseCases(cases) : emptyCases(),
    oauth: parseOauth(oauth),
  }
}

export function profileLabel(profile, live) {
  const name = String(live?.name ?? profile?.name ?? '').trim()
  const clientId = String(live?.oauth?.clientId ?? profile?.oauth?.clientId ?? '').trim()
  if (name && clientId && name !== clientId) return `${name} · ${clientId}`
  return clientId || name || 'Client'
}

const textSchema = new yaml.Schema({
  implicit: collectTypes(yaml.DEFAULT_SCHEMA).filter((type) => type.tag !== 'tag:yaml.org,2002:timestamp'),
})

function collectTypes(schema, seen = new Set()) {
  if (!schema || seen.has(schema)) return []
  seen.add(schema)
  return [
    ...(schema.include || []).flatMap((included) => collectTypes(included, seen)),
    ...(schema.explicit || []),
    ...(schema.implicit || []),
  ]
}

export function readDocument(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    throw new Error('The file is empty.')
  }
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(trimmed) : yaml.load(trimmed, { schema: textSchema })
}

export function parseRunDocument(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    throw new Error('The file is empty.')
  }
  const data = trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(trimmed) : yaml.load(trimmed)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('This file is not a saved run.')
  }
  return {
    ...data,
    savedAt: isoText(data.savedAt),
    results: loadedRunResults(data.results),
  }
}

export function loadedRunResults(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    const pages = Array.isArray(item?.pages)
      ? item.pages.map((page) => ({
        label: page?.label == null ? '' : String(page.label),
        status: Number(page?.status) || 0,
        count: Number(page?.count) || 0,
        text: payloadText(page?.text),
        ...(page?.request ? { request: storedPayload(page.request) } : {}),
      }))
      : null
    const result = {
      index: Number(item?.index) || index + 1,
      label: item?.label == null ? '' : String(item.label),
      status: Number(item?.status) || 0,
      passed: asBool(item?.passed),
      detail: item?.detail == null ? '' : String(item.detail),
      text: payloadText(item?.text),
      pages,
    }
    if (asBool(item?.skipped)) result.skipped = true
    if (item?.request) result.request = storedPayload(item.request)
    if (Array.isArray(item?.records) && item.records.length) result.records = item.records
    if (item?.step) result.step = String(item.step)
    if (item?.enquiry && typeof item.enquiry === 'object') {
      result.enquiry = {
        label: String(item.enquiry.label || ''),
        status: Number(item.enquiry.status) || 0,
        text: payloadText(item.enquiry.text),
      }
    }
    return result
  })
}

function asBool(value) {
  return value === true || value === 'true'
}

function isoText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return value == null ? '' : String(value)
}

function payloadText(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function storedPayload(value) {
  if (value == null || value === '' || value === '[object Object]') return undefined
  if (typeof value === 'string' || typeof value === 'object') return value
  return String(value)
}

export function parseProfilesText(text) {
  return parseProfiles(readDocument(text))
}

export function parseProfiles(value, options = {}) {
  const data = readObject(value, 'Clients file must be a JSON object.')
  if (data.kind && data.kind !== 'profiles') {
    throw new Error('This file is not a clients export.')
  }
  const source = Array.isArray(data.profiles) ? data.profiles : []
  const profiles = source.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    return createProfile({
      id: options.newIds ? undefined : (typeof item.id === 'string' && item.id ? item.id : undefined),
      name: item.name,
      defaults: item.defaults,
      cases: item.cases,
      oauth: item.oauth,
    })
  }).filter(Boolean)
  if (profiles.length === 0) {
    throw new Error('The file does not contain any clients.')
  }
  const activeId = profiles.some((item) => item.id === data.activeId) ? data.activeId : profiles[0].id
  return { activeId, profiles }
}

export function profilesYaml(profiles, activeId) {
  return yaml.dump(profilesDocument(profiles, activeId), { lineWidth: 120, noRefs: true })
}

export function profilesDocument(profiles, activeId) {
  return {
    version: 1,
    kind: 'profiles',
    activeId,
    profiles: (profiles || []).map((profile) => ({
      id: profile.id,
      name: profile.name || '',
      defaults: defaultsDocument(profile.defaults || emptyDefaults()),
      cases: casesDocument(profile.cases || emptyCases()),
      oauth: parseOauth(profile.oauth),
    })),
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function loadExample(url, parse, empty) {
  try {
    const response = await fetch(url)
    if (!response.ok) return empty()
    return parse(await response.text())
  } catch {
    return empty()
  }
}

export function parseCases(value) {
  const data = readObject(value, 'Custom cases file must be a JSON object.')
  if (data.kind && data.kind !== 'cases') {
    throw new Error('This file is not a custom cases export.')
  }
  const operations = {}
  const source = data.operations && typeof data.operations === 'object' ? data.operations : {}
  for (const [operationId, list] of Object.entries(source)) {
    if (!Array.isArray(list)) {
      continue
    }
    operations[operationId] = list.map(normalizeCase).filter(Boolean)
  }
  return {
    operations,
    exclusions: exclusionMaps(data.exclusions),
    values: combinationValueMaps(data.values),
    vary: varyMaps(data.vary),
    errors: errorMaps(data.errors),
    checks: errorCheckMaps(data.checks),
    steps: stepMaps(data.steps),
    ids: idMaps(data.ids),
    filters: filterMaps(data.filters),
    paging: pagingMaps(data.paging),
    scenarios: scenarioList(data.scenarios),
    trials: trialMaps(data.trials),
  }
}

function trialMaps(source) {
  const trials = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return trials
  for (const [operationId, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const request = valueMap(raw.request)
    const omit = Array.isArray(raw.omit) ? raw.omit.filter((name) => typeof name === 'string' && name) : []
    if (Object.keys(request).length === 0 && omit.length === 0) continue
    trials[operationId] = { request, omit }
  }
  return trials
}

const FILTER_MODES = new Set(['equals', 'equalsIgnoreCase', 'contains', 'starts', 'ends', 'minimum', 'maximum', 'greater', 'less', 'in', 'not', 'empty', 'present', 'compare', 'bounds', 'skip'])
const EXPECT_MATCHES = new Set(['contains', 'pattern', 'regex', 'expression'])

function expectedMatch(raw) {
  const match = String(raw || '').trim()
  return EXPECT_MATCHES.has(match) ? match : ''
}

function normalizeExpectedField(field) {
  if (!field || typeof field.path !== 'string' || !field.path.trim()) return null
  const match = expectedMatch(field.match)
  return {
    path: field.path.trim(),
    equals: field.equals === undefined || field.equals === null ? '' : String(field.equals),
    ...(match ? { match } : {}),
    ...(field.ordered ? { ordered: true } : {}),
  }
}

function filterMaps(source) {
  const filters = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return filters
  for (const [operationId, fields] of Object.entries(source)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue
    const next = {}
    for (const [name, raw] of Object.entries(fields)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const item = {}
      if (typeof raw.mode === 'string' && FILTER_MODES.has(raw.mode)) item.mode = raw.mode
      if (typeof raw.column === 'string' && raw.column.trim()) item.column = raw.column.trim()
      if (Object.keys(item).length > 0) next[name] = item
    }
    if (Object.keys(next).length > 0) filters[operationId] = next
  }
  return filters
}

function scenarioList(source) {
  if (!Array.isArray(source)) return []
  return source.map(normalizeScenario).filter(Boolean)
}

function normalizeScenario(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const columns = []
  for (const name of Array.isArray(item.columns) ? item.columns : []) {
    const key = String(name || '').trim()
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !columns.includes(key)) columns.push(key)
  }
  const steps = (Array.isArray(item.steps) ? item.steps : []).map(normalizeScenarioStep).filter(Boolean)
  const iterations = (Array.isArray(item.iterations) ? item.iterations : []).map((row) => normalizeIteration(row, columns)).filter(Boolean)
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Scenario',
    steps,
    columns,
    iterations,
  }
}

function normalizeScenarioStep(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const request = {}
  const source = item.request && typeof item.request === 'object' && !Array.isArray(item.request) ? item.request : {}
  for (const [name, value] of Object.entries(source)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') request[name] = value
  }
  const captures = []
  const listed = Array.isArray(item.captures)
    ? item.captures
    : Object.entries(item.save && typeof item.save === 'object' && !Array.isArray(item.save) ? item.save : {}).map(([name, path]) => ({ name, path }))
  for (const entry of listed) {
    if (!entry || typeof entry !== 'object') continue
    captures.push({
      name: typeof entry.name === 'string' ? entry.name : '',
      path: typeof entry.path === 'string' ? entry.path : '',
    })
  }
  const fields = (Array.isArray(item.expect?.fields) ? item.expect.fields : []).map(normalizeExpectedField).filter(Boolean)
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    operationId: typeof item.operationId === 'string' ? item.operationId : '',
    request,
    omit: Array.isArray(item.omit) ? item.omit.filter((name) => typeof name === 'string' && name) : [],
    expect: { status: item.expect?.status ? String(item.expect.status).replace(/\D/g, '').slice(0, 3) : '', fields },
    captures,
    cleanup: Boolean(item.cleanup),
  }
}

function normalizeIteration(item, columns) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const source = item.values && typeof item.values === 'object' && !Array.isArray(item.values) ? item.values : {}
  const values = {}
  for (const name of columns) {
    const raw = source[name]
    values[name] = raw == null ? '' : String(raw)
  }
  return { id: typeof item.id === 'string' && item.id ? item.id : newId(), values }
}

function idMaps(source) {
  const ids = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return ids
  for (const [operationId, name] of Object.entries(source)) {
    if (typeof name === 'string') ids[operationId] = name
  }
  return ids
}

function stepMaps(source) {
  const steps = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return steps
  for (const [operationId, item] of Object.entries(source)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const next = {}
    for (const role of ['before', 'after', 'enquiry']) {
      if (typeof item[role] === 'boolean') next[role] = item[role]
      if (typeof item[`${role}Op`] === 'string' && item[`${role}Op`].trim()) next[`${role}Op`] = item[`${role}Op`].trim()
      const fields = aroundFieldsMap(item[`${role}Fields`])
      if (Object.keys(fields).length > 0) next[`${role}Fields`] = fields
    }
    if (Object.keys(next).length > 0) steps[operationId] = next
  }
  return steps
}

function aroundFieldsMap(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const out = {}
  for (const [name, item] of Object.entries(source)) {
    const field = String(name || '').trim()
    if (!field) continue
    if (typeof item === 'string') {
      out[field] = { source: 'value', value: item }
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const sourceName = item.source === 'default' || item.source === 'request' || item.source === 'response' || item.source === 'value'
      ? item.source
      : (item.source === 'auto' ? 'auto' : '')
    if (!sourceName) continue
    const entry = { source: sourceName }
    if (typeof item.path === 'string' && item.path.trim()) entry.path = item.path.trim()
    if (item.value != null && String(item.value) !== '') entry.value = String(item.value)
    if (sourceName === 'auto' && !entry.path && !entry.value) continue
    out[field] = entry
  }
  return out
}

function errorMaps(source) {
  const errors = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return errors
  for (const [operationId, list] of Object.entries(source)) {
    if (!Array.isArray(list)) continue
    const next = list.map(normalizeErrorCase).filter(Boolean)
    if (next.length > 0) errors[operationId] = next
  }
  return errors
}

function normalizeErrorCase(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const status = item.status === undefined || item.status === null ? '400' : String(item.status).trim()
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newId(),
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Custom error',
    status: status || '400',
    field: typeof item.field === 'string' ? item.field.trim() : '',
    code: typeof item.code === 'string' ? item.code.trim() : '',
    message: typeof item.message === 'string' ? item.message : '',
    values: errorValueMap(item.values),
    value: item.value === undefined || item.value === null ? '' : String(item.value),
    omit: Boolean(item.omit),
    ...(item.include === false ? { include: false } : {}),
  }
}

function errorValueMap(source) {
  const values = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return values
  for (const [path, raw] of Object.entries(source)) {
    if (typeof raw !== 'string') continue
    values[path] = raw
  }
  return values
}

function errorCheckMaps(source) {
  const checks = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return checks
  for (const [operationId, item] of Object.entries(source)) {
    const saved = normalizeErrorChecks(item)
    if (saved) checks[operationId] = saved
  }
  return checks
}

function normalizeErrorChecks(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const columns = Array.isArray(item.columns)
    ? item.columns.map((column) => String(column || '').trim()).filter(Boolean)
    : []
  const rows = {}
  const source = item.rows && typeof item.rows === 'object' && !Array.isArray(item.rows) ? item.rows : {}
  for (const [key, row] of Object.entries(source)) {
    const next = normalizeErrorRow(row)
    if (next) rows[key] = next
  }
  const matches = {}
  const sourceMatches = item.matches && typeof item.matches === 'object' && !Array.isArray(item.matches) ? item.matches : {}
  for (const [path, raw] of Object.entries(sourceMatches)) {
    const match = String(raw || '').trim()
    if (match === 'contains' || match === 'pattern' || match === 'regex' || match === 'expression') matches[path] = match
  }
  if (columns.length === 0 && Object.keys(rows).length === 0 && Object.keys(matches).length === 0 && !Array.isArray(item.columns)) return null
  return { columns, rows, ...(Object.keys(matches).length > 0 ? { matches } : {}) }
}

function normalizeErrorRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const status = row.status === undefined || row.status === null ? '' : String(row.status).replace(/\D/g, '').slice(0, 3)
  const values = errorValueMap(row.values)
  const include = row.include === false
  if (!status && Object.keys(values).length === 0 && !include) return null
  if (include && !status && Object.keys(values).length === 0) return { include: false }
  return { ...(status ? { status } : {}), values, ...(include ? { include: false } : {}) }
}

function varyMaps(source) {
  const vary = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return vary
  for (const [operationId, fields] of Object.entries(source)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue
    const next = {}
    for (const [name, value] of Object.entries(fields)) {
      if (value === false) next[name] = false
    }
    if (Object.keys(next).length > 0) vary[operationId] = next
  }
  return vary
}

function combinationValueMaps(source) {
  const values = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return values
  for (const [operationId, fields] of Object.entries(source)) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue
    const next = {}
    for (const [name, list] of Object.entries(fields)) {
      if (!Array.isArray(list)) continue
      const items = []
      for (const item of list) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const composition = storedCombinationComposition(item)
          if (!composition || items.some((existing) => sameStoredComposition(existing, composition))) continue
          items.push(composition)
          continue
        }
        if (typeof item !== 'string') continue
        const text = item.trim()
        if (!text || items.includes(text)) continue
        items.push(text)
      }
      if (items.length > 0) next[name] = items
    }
    if (Object.keys(next).length > 0) values[operationId] = next
  }
  return values
}

function storedCombinationComposition(value) {
  const stored = {}
  const walk = (node, prefix) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    for (const [key, item] of Object.entries(node)) {
      const name = String(key || '').trim()
      if (!name) continue
      const path = prefix ? `${prefix}.${name}` : name
      if (item && typeof item === 'object' && !Array.isArray(item)) walk(item, path)
      else if (item != null && item !== '') {
        const text = String(item).trim()
        if (text) stored[path] = text
      }
    }
  }
  walk(value, '')
  return Object.keys(stored).length > 0 ? stored : null
}

function sameStoredComposition(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function exclusionMaps(source) {
  const exclusions = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return exclusions
  for (const [operationId, raw] of Object.entries(source)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const fieldsets = (Array.isArray(raw.fieldsets) ? raw.fieldsets : []).map(normalizeFieldset).filter(Boolean)
    const distinct = (Array.isArray(raw.distinct) ? raw.distinct : []).map(normalizeDistinct).filter(Boolean)
    if (fieldsets.length || distinct.length) exclusions[operationId] = { fieldsets, distinct }
  }
  return exclusions
}

function normalizeFieldset(rule) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null
  const values = {}
  const source = rule.values && typeof rule.values === 'object' && !Array.isArray(rule.values) ? rule.values : {}
  for (const [name, raw] of Object.entries(source)) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') values[name] = String(raw)
  }
  if (Object.keys(values).length === 0) return null
  return { id: typeof rule.id === 'string' && rule.id ? rule.id : newId(), values }
}

function normalizeDistinct(rule) {
  const names = Array.isArray(rule?.fields) ? rule.fields.filter((name) => typeof name === 'string' && name) : []
  if (names.length < 2) return null
  return { id: typeof rule.id === 'string' && rule.id ? rule.id : newId(), fields: [names[0], names[1]] }
}

export function newCustomCase() {
  const id = globalThis.crypto?.randomUUID?.() || `case-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return {
    id,
    name: 'New case',
    request: {},
    omit: [],
    expect: { status: '', fields: [] },
  }
}

export function applyDefaults(fields, operationId, defaults) {
  return fields.map((field) => ({ ...field, sample: effectiveSample(field, operationId, defaults) }))
}

export function effectiveSample(field, operationId, defaults) {
  const endpoint = defaults?.operations?.[operationId]
  let raw = field.sample
  if (endpoint && Object.prototype.hasOwnProperty.call(endpoint, field.name)) {
    raw = endpoint[field.name]
  } else if (defaults?.global && Object.prototype.hasOwnProperty.call(defaults.global, field.name)) {
    raw = defaults.global[field.name]
  }
  return keptTemporal(field, coerceFieldValue(field, substitute(raw, defaults?.variables)))
}

export function substitute(value, variables, depth = 0) {
  if (typeof value !== 'string' || depth > 4 || !variables) {
    return value
  }
  const whole = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/)
  if (whole) {
    if (!Object.prototype.hasOwnProperty.call(variables, whole[1])) return value
    const resolved = variables[whole[1]]
    return typeof resolved === 'string' ? substitute(resolved, variables, depth + 1) : resolved
  }
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) return token
    const resolved = variables[name]
    if (typeof resolved === 'string') return substitute(resolved, variables, depth + 1)
    return String(resolved)
  })
}

export function parseClock(value) {
  const match = String(value ?? '').match(/^\$\{(now|today)(?:([+-])(\d+)([smhd]))?\}$/)
  if (!match) return null
  return {
    kind: match[1] === 'now' ? 'timestamp' : 'date',
    amount: match[3] ? (match[2] === '-' ? -Number(match[3]) : Number(match[3])) : 0,
    unit: match[4] || (match[1] === 'now' ? 'h' : 'd'),
  }
}

export function parseUuid(value) {
  const match = String(value ?? '').match(/^\$\{uuid(?::(\d+))?\}$/)
  if (!match) return null
  return { length: match[1] ? Number(match[1]) : '' }
}

export function dynamicKind(value) {
  const clock = parseClock(value)
  if (clock) return clock.kind
  if (parseUuid(value)) return 'uuid'
  return ''
}

export function clockToken(kind, amount, unit) {
  const name = kind === 'date' ? 'today' : 'now'
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) return `\${${name}}`
  const abs = Math.abs(Math.trunc(n))
  const sign = n < 0 ? '-' : '+'
  const chosen = kind === 'date' ? 'd' : (['s', 'm', 'h', 'd'].includes(unit) ? unit : 'h')
  return `\${${name}${sign}${abs}${chosen}}`
}

export function uuidToken(length) {
  const n = Number(length)
  if (!Number.isFinite(n) || n <= 0) return '${uuid}'
  return `\${uuid:${Math.min(128, Math.max(1, Math.trunc(n)))}}`
}

export function formatClock(kind, delta, now = new Date()) {
  const date = new Date(now.getTime())
  const match = String(delta || '').match(/^([+-])(\d+)([smhd])$/)
  if (match) {
    const amount = (match[1] === '-' ? -1 : 1) * Number(match[2])
    if (match[3] === 's') date.setSeconds(date.getSeconds() + amount)
    else if (match[3] === 'm') date.setMinutes(date.getMinutes() + amount)
    else if (match[3] === 'h') date.setHours(date.getHours() + amount)
    else date.setDate(date.getDate() + amount)
  }
  const pad = (value) => String(value).padStart(2, '0')
  if (kind === 'today') {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export function evaluateDynamics(value, now = new Date()) {
  if (Array.isArray(value)) return value.map((item) => evaluateDynamics(item, now))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluateDynamics(item, now)]))
  }
  if (typeof value !== 'string' || !value.includes('${')) return value
  return value.replace(/\$\{(now|today)([+-]\d+[smhd])?\}|\$\{uuid(?::(\d+))?\}/g, (token, clock, delta, length) => {
    if (token.startsWith('${uuid')) return uuidText(length)
    return formatClock(clock, delta || '', now)
  })
}

function uuidText(length) {
  if (!length) return globalThis.crypto?.randomUUID?.() || fallbackUuid()
  const size = Math.min(128, Math.max(1, Number(length)))
  const bytes = new Uint8Array(Math.ceil(size / 2))
  globalThis.crypto?.getRandomValues?.(bytes)
  return [...bytes].map((item) => item.toString(16).padStart(2, '0')).join('').slice(0, size)
}

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16)
    const value = char === 'x' ? rand : ((rand & 0x3) | 0x8)
    return value.toString(16)
  })
}

export function resolveCases(cases, variables) {
  return (cases || []).map((item) => ({
    ...item,
    name: substitute(item.name, variables),
    request: Object.fromEntries(Object.entries(item.request || {}).map(([name, value]) => [name, substitute(value, variables)])),
    expect: {
      status: substitute(item.expect?.status || '', variables),
      fields: (item.expect?.fields || []).map((field) => ({
        path: field.path,
        equals: substitute(field.equals, variables),
        ...(expectedMatch(field.match) ? { match: expectedMatch(field.match) } : {}),
        ...(field.ordered ? { ordered: true } : {}),
      })),
    },
  }))
}

export function sampleSource(field, operationId, defaults) {
  const endpoint = defaults?.operations?.[operationId]
  if (endpoint && Object.prototype.hasOwnProperty.call(endpoint, field.name)) {
    return 'endpoint'
  }
  if (defaults?.global && Object.prototype.hasOwnProperty.call(defaults.global, field.name)) {
    return 'global'
  }
  return 'spec'
}

export function coerceFieldValue(field, raw) {
  if (raw === '' || raw === undefined || raw === null) {
    return ''
  }
  if (field?.type === 'boolean') {
    if (raw === true || raw === 'true') return true
    if (raw === false || raw === 'false') return false
    return raw
  }
  if (field?.type === 'integer' || field?.type === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    const value = Number(raw)
    return String(raw).trim() !== '' && Number.isFinite(value) ? value : raw
  }
  return raw
}

const VARIABLE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/

export function temporalKind(field) {
  if (field?.format === 'date') return 'date'
  if (field?.format === 'date-time') return 'timestamp'
  return ''
}

export function keptTemporal(field, value) {
  const kind = temporalKind(field)
  if (!kind || value === '' || value == null) return value
  return acceptsTemporal(kind, value) ? value : ''
}

export function acceptsTemporal(kind, value) {
  if (value === '' || value == null) return true
  const text = String(value)
  if (parseUuid(text)) return false
  const clock = parseClock(text)
  if (clock) return clock.kind === kind
  if (VARIABLE.test(text)) return true
  if (kind === 'date') return realDate(text)
  if (kind === 'timestamp') return realTimestamp(text)
  return true
}

export function temporalDraftOk(kind, value) {
  if (value === '' || value == null) return true
  const text = String(value)
  if (acceptsTemporal(kind, text)) return true
  if (text.startsWith('$')) return tokenDraftOk(kind, text)
  if (kind === 'date') return dateDraftOk(text)
  if (kind === 'timestamp') return timestampDraftOk(text)
  return true
}

function tokenDraftOk(kind, value) {
  if (value === '$') return true
  if (!value.startsWith('${') || value.endsWith('}')) return false
  const body = value.slice(2)
  if (body === '') return true
  if (body === 'now' || body.startsWith('now+') || body.startsWith('now-')) return kind === 'timestamp'
  if (body === 'today' || body.startsWith('today+') || body.startsWith('today-')) return kind === 'date'
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(body)) return true
  const name = kind === 'date' ? 'today' : 'now'
  const units = kind === 'date' ? 'd' : 'smhd'
  return new RegExp(`^${name}[+-](\\d{1,6}[${units}]?)?$`).test(body)
}

function realDate(text) {
  const match = String(text).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function realTimestamp(text) {
  const match = String(text).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$/)
  if (!match || !realDate(match[1])) return false
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return false
  if (!match[6] || match[6] === 'Z') return true
  const offset = match[6].match(/^[+-](\d{2}):(\d{2})$/)
  return Boolean(offset) && Number(offset[1]) <= 23 && Number(offset[2]) <= 59
}

function dateDraftOk(value) {
  const match = String(value).match(/^(\d{0,4})(?:-(\d{0,2})(?:-(\d{0,2}))?)?$/)
  if (!match) return false
  const year = match[1]
  const month = match[2]
  const day = match[3]
  if (month == null) return true
  if (year.length !== 4) return false
  if (day != null && month.length < 2) return false
  if (!typedPart(month, 12, 1)) return false
  if (month.length === 2 && Number(month) === 0) return false
  if (day == null) return true
  if (!typedPart(day, 31, 3)) return false
  if (day.length < 2) return true
  if (Number(day) === 0) return false
  return realDate(`${year}-${month.padStart(2, '0')}-${day}`)
}

function timestampDraftOk(text) {
  const parts = String(text).split('T')
  if (parts.length > 2) return false
  if (parts.length === 1) return dateDraftOk(text)
  if (!realDate(parts[0])) return false
  return timeDraftOk(parts[1])
}

function timeDraftOk(time) {
  if (time === '') return true
  const match = time.match(/^(\d{0,2})(?::(\d{0,2})(?::(\d{0,2})(?:\.\d{0,9})?)?)?(Z|[+-]\d{0,2}(?::\d{0,2})?)?$/)
  if (!match || match[0] !== time) return false
  if (!typedPart(match[1], 23, 2)) return false
  if (!typedPart(match[2], 59, 5)) return false
  if (!typedPart(match[3], 59, 5)) return false
  const zone = match[4]
  if (!zone || zone === 'Z') return true
  const offset = zone.match(/^[+-](\d{0,2})(?::(\d{0,2}))?$/)
  if (!offset) return false
  return typedPart(offset[1], 23, 2) && typedPart(offset[2], 59, 5)
}

function typedPart(part, max, firstDigitMax) {
  if (part == null || part === '') return true
  if (part.length === 1) return Number(part) <= firstDigitMax
  if (part.length === 2) return Number(part) <= max
  return false
}

export function putNamedValue(map, name, value) {
  return { ...(map || {}), [name]: value }
}

export function removeNamedValue(map, name) {
  const next = { ...(map || {}) }
  delete next[name]
  return next
}

export function setNamedValue(map, name, raw, field) {
  const next = { ...(map || {}) }
  if (raw === undefined || raw === null || raw === '') {
    delete next[name]
    return next
  }
  next[name] = coerceFieldValue(field, raw)
  return next
}

function browserStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function readObject(value, message) {
  const data = typeof value === 'string' ? JSON.parse(value) : value
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(message)
  }
  return data
}

function valueMap(source) {
  const map = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return map
  }
  for (const [name, raw] of Object.entries(source)) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      map[name] = raw
    }
  }
  return map
}

function statusLists(source) {
  const operations = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return operations
  for (const [operationId, list] of Object.entries(source)) {
    const codes = [...new Set((Array.isArray(list) ? list : []).map((code) => String(code)).filter((code) => /^\d{3}$/.test(code)))]
    if (codes.length > 0) operations[operationId] = codes
  }
  return operations
}

function responseMaps(source) {
  const operations = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return operations
  for (const [operationId, statuses] of Object.entries(source)) {
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) continue
    const statusMap = {}
    for (const [status, fields] of Object.entries(statuses)) {
      const values = responseFieldMap(fields)
      if (Object.keys(values).length > 0) statusMap[status] = values
    }
    if (Object.keys(statusMap).length > 0) operations[operationId] = statusMap
  }
  return operations
}

function responseFieldMap(source) {
  const map = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return map
  for (const [name, raw] of Object.entries(source)) {
    const stored = storedResponseField(raw)
    if (stored !== undefined) map[name] = stored
  }
  return map
}

function storedResponseField(raw) {
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  if (Array.isArray(raw.rules)) {
    const rules = raw.rules.map(storedWhenField).filter(Boolean)
    return rules.length ? { rules } : undefined
  }
  if (typeof raw.pattern === 'string') {
    const name = raw.pattern.trim()
    return name ? { pattern: name } : { match: 'pattern' }
  }
  if (typeof raw.regex === 'string') return raw.regex ? { regex: raw.regex } : { match: 'regex' }
  if (raw.match === 'pattern' || raw.match === 'regex') {
    const text = raw.value == null ? '' : String(raw.value)
    if (raw.match === 'pattern') return text.trim() ? { pattern: text.trim() } : { match: 'pattern' }
    return text ? { regex: text } : { match: 'regex' }
  }
  if (raw.value != null || raw.ordered || raw.ignoreCase === true) {
    const text = raw.value == null ? '' : String(raw.value)
    if (raw.ordered || raw.ignoreCase === true) {
      const stored = { value: text }
      if (raw.ordered) stored.ordered = true
      if (raw.ignoreCase === true) stored.ignoreCase = true
      return stored
    }
    if (text !== '') return text
  }
  return undefined
}

function storedWhenField(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rest = { ...raw }
  delete rest.when
  delete rest.rules
  const then = storedResponseField(Object.keys(rest).length ? rest : { value: '' })
  const when = storedWhenMap(raw.when)
  if (then && typeof then === 'object' && !Array.isArray(then)) return { when, ...then }
  return { when, value: then == null ? '' : then }
}

function storedWhenMap(when) {
  if (!when || typeof when !== 'object' || Array.isArray(when)) return {}
  const stored = {}
  for (const [field, value] of Object.entries(when)) {
    const name = String(field || '').trim()
    if (!name) continue
    if (value === null || value === '@null') stored[name] = '@null'
    else if (value === '@not-null' || value === '@notnull') stored[name] = '@not-null'
    else stored[name] = String(value ?? '')
  }
  return stored
}

function operationMaps(source) {
  const operations = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return operations
  }
  for (const [operationId, values] of Object.entries(source)) {
    operations[operationId] = valueMap(values)
  }
  return operations
}

function normalizeCase(item) {
  if (!item || typeof item !== 'object') {
    return null
  }
  const request = valueMap(item.request)
  const omit = Array.isArray(item.omit) ? item.omit.filter((name) => typeof name === 'string') : []
  const expect = item.expect && typeof item.expect === 'object' ? item.expect : {}
  const fields = Array.isArray(expect.fields) ? expect.fields.filter((field) => field && typeof field.path === 'string' && field.path.trim()) : []
  return {
    id: typeof item.id === 'string' && item.id ? item.id : newCustomCase().id,
    name: typeof item.name === 'string' && item.name.trim() ? item.name : 'Custom case',
    request,
    omit,
    expect: {
      status: expect.status === undefined || expect.status === null ? '' : String(expect.status),
      fields: fields.map(normalizeExpectedField).filter(Boolean),
    },
  }
}
