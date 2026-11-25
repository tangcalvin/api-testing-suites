import { applyDefaults, evaluateDynamics, resolveCases } from '../library.js'
import { buildCustomCases, readCreatedId } from './spec.js'
import { parseRecordCsv } from './records.js'

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g
const RESERVED = new Set(['uuid', 'today', 'now'])

export function newScenario() {
  return {
    id: newId(),
    name: 'New scenario',
    steps: [],
    columns: [],
    iterations: [],
  }
}

export function newScenarioStep(operationId = '') {
  return {
    id: newId(),
    operationId,
    profileId: '',
    request: {},
    omit: [],
    expect: { status: '', fields: [] },
    captures: [],
    cleanup: false,
  }
}

export function newIteration(columns = []) {
  const values = {}
  for (const name of columns) values[name] = ''
  return { id: newId(), values }
}

export function stepShouldRun(step, failedEarlier) {
  if (!failedEarlier) return true
  return Boolean(step?.cleanup)
}

export function scenarioCall(operation, step, defaults, variables) {
  if (!operation) return null
  const names = { ...(defaults?.variables || {}), ...(variables || {}) }
  const request = {}
  for (const [name, value] of Object.entries(step?.request || {})) {
    if (value !== '' && value != null) request[name] = value
  }
  const resolved = resolveCases([{
    name: operation.summary || operation.id,
    request,
    omit: step?.omit || [],
    expect: step?.expect || { status: '', fields: [] },
  }], names)[0]
  const fields = applyDefaults(operation.fields || [], operation.id, { ...defaults, variables: names })
  const [call] = buildCustomCases(fields, [resolved])
  return call || null
}

export function scenarioRequest(call, now = new Date()) {
  if (!call) return { body: {}, query: {}, path: {} }
  return {
    body: evaluateDynamics(call.body, now),
    query: evaluateDynamics(call.query || {}, now),
    path: evaluateDynamics(call.path || {}, now),
  }
}

export function capturedFrom(save, status, text, location) {
  const found = {}
  let body = null
  if (typeof text === 'string' && text.trim()) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }
  for (const entry of capturePairs(save)) {
    const key = String(entry.name || '').trim()
    const pointer = String(entry.path || '').trim()
    if (!NAME.test(key) || !pointer) continue
    const value = pointer === 'id' ? readCreatedId(status, text, location) : dotted(body, pointer)
    if (value == null || typeof value === 'object') continue
    found[key] = value
  }
  return found
}

function capturePairs(save) {
  if (Array.isArray(save)) return save
  if (save && typeof save === 'object') return Object.entries(save).map(([name, path]) => ({ name, path }))
  return []
}

export function columnNames(steps, known = []) {
  const taken = new Set([...(known || []), ...RESERVED])
  const names = []
  for (const step of steps || []) {
    const blobs = [
      ...Object.values(step?.request || {}),
      ...(step?.expect?.fields || []).map((field) => field?.equals),
    ]
    for (const blob of blobs) {
      for (const match of String(blob ?? '').matchAll(PLACEHOLDER)) {
        const name = match[1]
        if (taken.has(name) || names.includes(name)) continue
        names.push(name)
      }
    }
  }
  return names
}

export function iterationsFromCsv(text) {
  const rows = parseRecordCsv(text)
  const columns = []
  for (const row of rows) {
    for (const name of Object.keys(row)) {
      if (NAME.test(name) && !columns.includes(name)) columns.push(name)
    }
  }
  return {
    columns,
    iterations: rows.map((row) => ({
      id: newId(),
      values: Object.fromEntries(columns.map((name) => [name, row[name] == null ? '' : String(row[name])])),
    })),
  }
}

function dotted(value, path) {
  let current = value
  for (const part of String(path).split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return current
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `scenario-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
