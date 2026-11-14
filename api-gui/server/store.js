import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'

const CLIENTS_FILE = 'clients.yaml'
const SPEC_FILE = 'openapi.yaml'
const RUNS_DIR = 'runs'
const RUN_NAME = /^[0-9]{8}T[0-9]{9}Z(?:-\d+)?\.yaml$/

export function createStore(root) {
  const dataDir = path.resolve(root)
  const runsDir = path.join(dataDir, RUNS_DIR)

  return {
    dataDir,
    async readClients() {
      return readOptional(path.join(dataDir, CLIENTS_FILE))
    },
    async readSpec() {
      return readOptional(path.join(dataDir, SPEC_FILE))
    },
    async writeSpec(text) {
      const trimmed = String(text || '').trim()
      if (!trimmed) throw httpError(400, 'OpenAPI document is empty.')
      let document
      try {
        document = trimmed.startsWith('{') ? JSON.parse(trimmed) : yaml.load(trimmed)
      } catch {
        throw httpError(400, 'OpenAPI document must be YAML or JSON.')
      }
      if (!document || typeof document !== 'object' || !document.paths) {
        throw httpError(400, 'OpenAPI document has no paths.')
      }
      await mkdir(dataDir, { recursive: true })
      const body = trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`
      await writeFile(path.join(dataDir, SPEC_FILE), body, 'utf8')
    },
    async writeClients(text) {
      const document = parseYaml(text, 'Clients file must be YAML.')
      if (!document || document.kind !== 'profiles' || !Array.isArray(document.profiles)) {
        throw httpError(400, 'Clients file must contain the profiles document.')
      }
      await mkdir(dataDir, { recursive: true })
      const body = text.endsWith('\n') ? text : `${text}\n`
      await writeFile(path.join(dataDir, CLIENTS_FILE), body, 'utf8')
    },
    async listRuns() {
      let names = []
      try {
        names = await readdir(runsDir)
      } catch (error) {
        if (error.code === 'ENOENT') return []
        throw error
      }
      const runs = []
      for (const name of names.filter((item) => RUN_NAME.test(item)).sort().reverse()) {
        try {
          const document = parseYaml(await readFile(path.join(runsDir, name), 'utf8'), name)
          runs.push(summarizeRun(name, document))
        } catch {
          runs.push({ name, savedAt: '', client: '', operation: '', passed: 0, failed: 0, stopped: false })
        }
      }
      return runs.slice(0, 100)
    },
    async readRun(name) {
      const file = runPath(runsDir, name)
      try {
        return await readFile(file, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') throw httpError(404, 'That saved run does not exist.')
        throw error
      }
    },
    async writeRun(input) {
      const results = Array.isArray(input?.results) ? input.results.map(cleanResult) : null
      if (!results || results.length === 0) throw httpError(400, 'A run needs at least one result.')
      const savedAt = new Date().toISOString()
      const passed = results.filter((item) => item.passed).length
      const document = {
        version: 1,
        kind: 'run',
        savedAt,
        client: text(input.client),
        clientId: text(input.clientId),
        operation: text(input.operation),
        mode: text(input.mode),
        baseUrl: text(input.baseUrl),
        stopped: Boolean(input.stopped),
        passed,
        failed: results.length - passed,
        results,
      }
      await mkdir(runsDir, { recursive: true })
      const name = await uniqueRunName(runsDir, savedAt)
      const body = yaml.dump(document, { lineWidth: 120, noRefs: true })
      await writeFile(path.join(runsDir, name), body.endsWith('\n') ? body : `${body}\n`, 'utf8')
      return { name, ...summarizeRun(name, document) }
    },
  }
}

function summarizeRun(name, document) {
  return {
    name,
    savedAt: text(document?.savedAt),
    client: text(document?.client),
    operation: text(document?.operation),
    mode: text(document?.mode),
    passed: Number(document?.passed) || 0,
    failed: Number(document?.failed) || 0,
    stopped: Boolean(document?.stopped),
  }
}

function cleanResult(item) {
  const pages = Array.isArray(item?.pages)
    ? item.pages.map((page) => ({
      label: text(page?.label),
      status: Number(page?.status) || 0,
      count: Number(page?.count) || 0,
      text: text(page?.text),
    }))
    : null
  const enquiry = item?.enquiry && typeof item.enquiry === 'object'
    ? { label: text(item.enquiry.label), status: Number(item.enquiry.status) || 0, text: text(item.enquiry.text) }
    : null
  return {
    index: Number(item?.index) || 0,
    label: text(item?.label),
    status: Number(item?.status) || 0,
    passed: Boolean(item?.passed),
    detail: text(item?.detail),
    text: text(item?.text),
    pages,
    ...(item?.step ? { step: text(item.step) } : {}),
    ...(enquiry ? { enquiry } : {}),
  }
}

async function uniqueRunName(runsDir, savedAt) {
  const date = new Date(savedAt)
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${pad(date.getUTCMilliseconds(), 3)}Z`
  let name = `${stamp}.yaml`
  let suffix = 2
  const existing = new Set(await readdir(runsDir).catch(() => []))
  while (existing.has(name)) {
    name = `${stamp}-${suffix}.yaml`
    suffix += 1
  }
  return name
}

function runPath(runsDir, name) {
  if (!RUN_NAME.test(String(name || ''))) throw httpError(400, 'Unknown run name.')
  const file = path.resolve(runsDir, name)
  if (path.dirname(file) !== path.resolve(runsDir)) throw httpError(400, 'Unknown run name.')
  return file
}

function parseYaml(text, message) {
  try {
    return yaml.load(text)
  } catch {
    throw httpError(400, message)
  }
}

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function text(value) {
  return value == null ? '' : String(value)
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}
