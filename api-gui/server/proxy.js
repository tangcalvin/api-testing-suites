import http from 'node:http'
import https from 'node:https'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const HOP = /^(host|content-length|connection|transfer-encoding|x-tester-base)$/i

export function createProxy(filePath) {
  let api = 'http://localhost:8088'
  let idp = ''
  const ready = readFile(filePath, 'utf8')
    .then((text) => {
      const data = JSON.parse(text)
      if (typeof data?.api === 'string' && data.api.trim()) api = data.api.trim()
      if (typeof data?.idp === 'string') idp = data.idp.trim()
    })
    .catch(() => {})

  return {
    async snapshot() {
      await ready
      return { api, idp }
    },
    async configure(next = {}) {
      await ready
      if (typeof next.api === 'string') api = next.api.trim()
      if (typeof next.idp === 'string') idp = next.idp.trim()
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, `${JSON.stringify({ api, idp }, null, 2)}\n`, 'utf8')
      return { api, idp }
    },
    baseFor(prefix) {
      return prefix === '/idp' ? idp : api
    },
  }
}

export function upstreamUrl(prefix, requestUrl, base) {
  const label = prefix === '/idp' ? 'OAuth base URL' : 'backend base URL'
  const raw = String(base || '').trim()
  if (!raw) {
    throw Object.assign(new Error(`Enter the ${label}.`), { status: 400 })
  }
  let root
  try {
    root = new URL(raw)
  } catch {
    throw Object.assign(new Error(`The ${label} is not a valid URL.`), { status: 400 })
  }
  if (root.protocol !== 'http:' && root.protocol !== 'https:') {
    throw Object.assign(new Error(`The ${label} must start with http:// or https://.`), { status: 400 })
  }
  const incoming = new URL(requestUrl || '/', 'http://tester.local')
  const rest = incoming.pathname.startsWith(prefix) ? incoming.pathname.slice(prefix.length) || '/' : incoming.pathname
  const basePath = root.pathname.replace(/\/$/, '')
  const suffix = rest.startsWith('/') ? rest : `/${rest}`
  root.pathname = `${basePath}${suffix}`.replace(/\/{2,}/g, '/') || '/'
  root.search = incoming.search
  root.hash = ''
  return root.toString()
}

export function rewriteLinkHeader(header, base, prefix) {
  let origin
  try {
    origin = new URL(base).origin
  } catch {
    return header
  }
  return String(header || '').replace(/<([^>]+)>/g, (match, href) => {
    try {
      const url = new URL(href, base)
      if (url.origin !== origin) return match
      return `<${prefix}${url.pathname}${url.search}>`
    } catch {
      return match
    }
  })
}

export function forward(request, response, { prefix, base }) {
  let target
  try {
    target = new URL(upstreamUrl(prefix, request.url, base))
  } catch (error) {
    response.statusCode = error.status || 400
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end(error.message || 'The proxy target is not valid.')
    return Promise.resolve()
  }
  const transport = target.protocol === 'https:' ? https : http
  const agent = target.protocol === 'https:'
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined
  return new Promise((resolve) => {
    const upstream = transport.request(target, {
      method: request.method,
      headers: outboundHeaders(request.headers),
      agent,
      rejectUnauthorized: false,
      timeout: 20000,
    }, (incoming) => {
      const headers = { ...incoming.headers }
      if (headers.link && prefix === '/api') {
        const value = Array.isArray(headers.link) ? headers.link.join(', ') : headers.link
        headers.link = rewriteLinkHeader(value, base, prefix)
      }
      response.writeHead(incoming.statusCode || 502, headers)
      incoming.pipe(response)
      incoming.on('end', () => {
        agent?.destroy()
        resolve()
      })
    })
    upstream.on('timeout', () => {
      upstream.destroy()
      agent?.destroy()
      if (!response.headersSent) {
        response.statusCode = 504
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
        response.end('The upstream call timed out.')
      }
      resolve()
    })
    upstream.on('error', (error) => {
      agent?.destroy()
      if (!response.headersSent) {
        response.statusCode = 502
        response.setHeader('Content-Type', 'text/plain; charset=utf-8')
        response.end(error.message || 'The upstream call failed.')
      }
      resolve()
    })
    request.pipe(upstream)
  })
}

function outboundHeaders(headers) {
  const next = {}
  for (const [name, value] of Object.entries(headers || {})) {
    if (value == null || value === '' || HOP.test(name)) continue
    next[name] = value
  }
  return next
}
