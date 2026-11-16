export const PAGING_MODES = [
  { id: 'detected', label: 'Detected' },
  { id: 'none', label: 'None' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'page', label: 'Page' },
  { id: 'offset', label: 'Offset' },
  { id: 'link', label: 'Link' },
]

export const CURSOR_TYPES = [
  { id: 'string', label: 'string' },
  { id: 'integer', label: 'integer' },
  { id: 'null', label: 'null' },
  { id: 'omit', label: 'omit' },
]

export function emptyPaging() {
  return {
    mode: 'detected',
    request: { size: '', cursor: '', page: '', offset: '' },
    response: { cursor: '', pageSize: '', total: '', page: '', totalPages: '', items: '', nextLink: '' },
    firstCursor: { type: 'string', value: '0' },
    lastCursor: { type: 'string', value: '0' },
    pageBase: 0,
  }
}

export function pagingMaps(source) {
  const paging = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return paging
  for (const [operationId, raw] of Object.entries(source)) {
    const saved = storedPaging(raw)
    if (saved) paging[operationId] = saved
  }
  return paging
}

export function storedPaging(value) {
  const item = normalizePaging(value)
  if (!item) return null
  return compactPaging(item)
}

export function normalizePaging(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const mode = String(value.mode || '').trim()
  if (!['none', 'cursor', 'page', 'offset', 'link'].includes(mode)) return null
  const request = value.request && typeof value.request === 'object' && !Array.isArray(value.request) ? value.request : {}
  const response = value.response && typeof value.response === 'object' && !Array.isArray(value.response) ? value.response : {}
  const pageBase = Number(value.pageBase)
  return {
    mode,
    request: {
      size: fieldName(request.size),
      cursor: fieldName(request.cursor),
      page: fieldName(request.page),
      offset: fieldName(request.offset),
    },
    response: {
      cursor: fieldName(response.cursor ?? response.nextCursor),
      pageSize: fieldName(response.pageSize ?? response.size),
      total: fieldName(response.total),
      page: fieldName(response.page),
      totalPages: fieldName(response.totalPages),
      items: fieldName(response.items),
      nextLink: fieldName(response.nextLink),
    },
    firstCursor: normalizeSentinel(value.firstCursor),
    lastCursor: normalizeSentinel(value.lastCursor),
    pageBase: Number.isFinite(pageBase) ? pageBase : 0,
  }
}

export function pagingForm(detected, saved) {
  const blank = emptyPaging()
  const current = normalizePaging(saved)
  const source = detected || {}
  const mode = current?.mode || 'detected'
  const request = { ...blank.request, ...(current?.request || {}) }
  const response = { ...blank.response, ...(current?.response || {}) }
  return {
    mode,
    request: {
      size: request.size || source.request?.size || '',
      cursor: request.cursor || source.request?.cursor || '',
      page: request.page || source.request?.page || '',
      offset: request.offset || source.request?.offset || '',
    },
    response: {
      cursor: response.cursor || pathName(source.response?.nextCursor),
      pageSize: response.pageSize || pathName(source.response?.size),
      total: response.total || pathName(source.response?.total),
      page: response.page || pathName(source.response?.page),
      totalPages: response.totalPages || pathName(source.response?.totalPages),
      items: response.items || pathName(source.response?.items),
      nextLink: response.nextLink || pathName(source.response?.nextLink),
    },
    firstCursor: current?.firstCursor || source.firstCursor || blank.firstCursor,
    lastCursor: current?.lastCursor || source.lastCursor || blank.lastCursor,
    pageBase: current ? current.pageBase : (source.pageBase ?? 0),
  }
}

export function resolvePagination(detected, override) {
  const saved = normalizePaging(override)
  if (!saved) return detected || null
  if (saved.mode === 'none') return null
  const base = detected && detected.style === saved.mode ? detected : emptyDetected(saved.mode)
  const request = {
    page: saved.request.page || base.request?.page || null,
    offset: saved.request.offset || base.request?.offset || null,
    size: saved.request.size || base.request?.size || null,
    cursor: saved.request.cursor || base.request?.cursor || null,
  }
  const response = {
    items: fieldPath(saved.response.items) || base.response?.items || null,
    totalPages: fieldPath(saved.response.totalPages) || base.response?.totalPages || null,
    total: fieldPath(saved.response.total),
    page: fieldPath(saved.response.page) || base.response?.page || null,
    size: fieldPath(saved.response.pageSize) || base.response?.size || null,
    nextCursor: fieldPath(saved.response.cursor) || base.response?.nextCursor || null,
    hasMore: base.response?.hasMore || null,
    nextLink: fieldPath(saved.response.nextLink) || base.response?.nextLink || null,
  }
  if (saved.mode !== 'cursor' && response.total == null) response.total = base.response?.total || null
  return {
    style: saved.mode,
    pageBase: saved.mode === 'page' ? saved.pageBase : (base.pageBase ?? 0),
    request,
    response,
    firstCursor: saved.mode === 'cursor' ? saved.firstCursor : base.firstCursor,
    lastCursor: saved.mode === 'cursor' ? saved.lastCursor : base.lastCursor,
  }
}

export function sentinelFrom(schema) {
  if (!schema || typeof schema !== 'object') return null
  const raw = schema.default !== undefined ? schema.default : schema.example
  if (raw === null) return { type: 'null', value: '' }
  if (typeof raw === 'number' && Number.isFinite(raw)) return { type: 'integer', value: String(Math.trunc(raw)) }
  if (typeof raw === 'string') return { type: 'string', value: raw }
  return null
}

export function isZeroSentinel(spec) {
  if (!spec) return false
  if (spec.type === 'integer') return Number(spec.value) === 0
  return spec.type === 'string' && String(spec.value) === '0'
}

export function cursorValue(spec) {
  if (!spec || spec.type === 'omit') return { omit: true }
  if (spec.type === 'null') return { value: null }
  if (spec.type === 'integer') {
    const n = Number(spec.value)
    return { value: Number.isFinite(n) ? Math.trunc(n) : 0 }
  }
  return { value: spec.value == null ? '' : String(spec.value) }
}

export function sameCursor(left, right) {
  if (left == null && right == null) return true
  if (left == null || right == null) return false
  return String(left) === String(right)
}

export function isLastCursor(pagination, token) {
  if (token == null || token === '') return true
  const last = pagination?.lastCursor
  if (!last || last.type === 'omit') return false
  if (last.type === 'null') return false
  return sameCursor(token, cursorValue(last).value)
}

export function pathName(path) {
  if (!path) return ''
  if (Array.isArray(path)) return path.join('.')
  return String(path)
}

export function fieldPath(name) {
  if (!name) return null
  if (Array.isArray(name)) return name.filter(Boolean)
  const parts = String(name).split('.').filter(Boolean)
  return parts.length ? parts : null
}

function emptyDetected(style) {
  return {
    style,
    pageBase: 0,
    request: { page: null, offset: null, size: null, cursor: null },
    response: { items: null, totalPages: null, total: null, page: null, size: null, nextCursor: null, hasMore: null, nextLink: null },
  }
}

function compactPaging(item) {
  const next = { mode: item.mode }
  const request = filledMap(item.request)
  const response = filledMap(item.response)
  if (Object.keys(request).length > 0) next.request = request
  if (Object.keys(response).length > 0) next.response = response
  if (item.mode === 'cursor') {
    const first = compactSentinel(item.firstCursor)
    const last = compactSentinel(item.lastCursor)
    if (first) next.firstCursor = first
    if (last) next.lastCursor = last
  }
  if (item.mode === 'page' && item.pageBase !== 0) next.pageBase = item.pageBase
  return next
}

function filledMap(source) {
  const next = {}
  for (const [name, value] of Object.entries(source || {})) {
    if (value) next[name] = value
  }
  return next
}

function fieldName(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function normalizeSentinel(value) {
  if (value == null) return { type: 'string', value: '0' }
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'integer', value: String(Math.trunc(value)) }
  if (typeof value === 'string') {
    if (value === 'null') return { type: 'null', value: '' }
    return { type: 'string', value }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return { type: 'string', value: '0' }
  const type = CURSOR_TYPES.some((item) => item.id === value.type) ? value.type : 'string'
  if (type === 'null' || type === 'omit') return { type, value: '' }
  if (type === 'integer') {
    const n = Number(value.value)
    return { type, value: Number.isFinite(n) ? String(Math.trunc(n)) : '0' }
  }
  return { type: 'string', value: value.value == null ? '' : String(value.value) }
}

function compactSentinel(spec) {
  if (!spec) return null
  if (spec.type === 'omit') return { type: 'omit' }
  if (spec.type === 'null') return { type: 'null' }
  if (spec.type === 'integer') return { type: 'integer', value: spec.value }
  if (spec.type === 'string' && spec.value === '0') return { type: 'string', value: '0' }
  if (spec.type === 'string') return { type: 'string', value: spec.value }
  return spec
}
