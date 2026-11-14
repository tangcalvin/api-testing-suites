import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { forward, rewriteLinkHeader, upstreamUrl } from './proxy.js'

test('proxy paths join the configured base URL', () => {
  assert.equal(upstreamUrl('/api', '/api/v3/api-docs.yaml', 'http://localhost:8088'), 'http://localhost:8088/v3/api-docs.yaml')
  assert.equal(upstreamUrl('/api', '/api/api/orders?page=1', 'http://localhost:8088'), 'http://localhost:8088/api/orders?page=1')
  assert.equal(
    upstreamUrl('/idp', '/idp/oauth/token', 'https://login.example/realms/a'),
    'https://login.example/realms/a/oauth/token',
  )
  assert.throws(() => upstreamUrl('/api', '/api/orders', ''), /backend base URL/)
  assert.throws(() => upstreamUrl('/idp', '/idp/token', 'file:///tmp'), /http/)
})

test('link headers stay on the api proxy', () => {
  const header = '<http://localhost:8088/api/orders?page=2>; rel="next", <https://other.example/x>; rel="related"'
  assert.equal(
    rewriteLinkHeader(header, 'http://localhost:8088', '/api'),
    '</api/api/orders?page=2>; rel="next", <https://other.example/x>; rel="related"',
  )
})

test('the proxy forwards /api and /idp to different servers', async () => {
  const backend = await listen((request, response) => {
    response.setHeader('link', `<http://127.0.0.1:${backend.address().port}/api/orders?page=2>; rel="next"`)
    response.end(`backend ${request.url}`)
  })
  const idp = await listen((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => response.end(`idp ${request.url} ${Buffer.concat(chunks).toString('utf8')}`))
  })
  const proxy = await listen((request, response) => {
    const prefix = request.url.startsWith('/idp') ? '/idp' : '/api'
    const base = prefix === '/idp'
      ? `http://127.0.0.1:${idp.address().port}`
      : `http://127.0.0.1:${backend.address().port}`
    return forward(request, response, { prefix, base })
  })
  try {
    const orders = await fetch(`http://127.0.0.1:${proxy.address().port}/api/api/orders`)
    assert.equal(await orders.text(), 'backend /api/orders')
    assert.match(orders.headers.get('link') || '', /\/api\/api\/orders\?page=2/)
    const token = await fetch(`http://127.0.0.1:${proxy.address().port}/idp/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
    assert.equal(await token.text(), 'idp /oauth/token grant_type=client_credentials')
  } finally {
    proxy.close()
    backend.close()
    idp.close()
  }
})

test('https api and idp calls skip certificate checks', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tester-proxy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const key = path.join(root, 'key.pem')
  const cert = path.join(root, 'cert.pem')
  const issued = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert,
    '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1',
  ], { encoding: 'utf8' })
  if (issued.status !== 0) {
    t.skip('openssl could not issue a local certificate')
    return
  }
  const credentials = { key: await readFile(key), cert: await readFile(cert) }
  const backend = https.createServer(credentials, (request, response) => response.end(`api ${request.url}`))
  const idp = https.createServer(credentials, (request, response) => response.end(`idp ${request.url}`))
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve))
  await new Promise((resolve) => idp.listen(0, '127.0.0.1', resolve))
  t.after(() => Promise.all([backend, idp].map((server) => new Promise((resolve) => server.close(resolve)))))
  const proxy = await listen((request, response) => {
    const prefix = request.url.startsWith('/idp') ? '/idp' : '/api'
    const base = prefix === '/idp'
      ? `https://127.0.0.1:${idp.address().port}`
      : `https://127.0.0.1:${backend.address().port}`
    return forward(request, response, { prefix, base })
  })
  try {
    const orders = await fetch(`http://127.0.0.1:${proxy.address().port}/api/api/orders`)
    assert.equal(orders.status, 200)
    assert.equal(await orders.text(), 'api /api/orders')
    const token = await fetch(`http://127.0.0.1:${proxy.address().port}/idp/oauth/token`)
    assert.equal(token.status, 200)
    assert.equal(await token.text(), 'idp /oauth/token')
  } finally {
    proxy.close()
  }
})

function listen(handler) {
  const server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      if (!response.headersSent) {
        response.statusCode = 500
        response.end(error.message)
      }
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}
