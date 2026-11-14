import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { requestHttps } from './https.js'

test('only http and https addresses are called', async () => {
  await assert.rejects(() => requestHttps({ url: 'file:///tmp/secret' }), /http or https/)
  await assert.rejects(() => requestHttps({ url: 'not a url' }), /valid URL/)
})

test('a self-signed server is accepted without a certificate', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'tester-ca-'))
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
  const certificate = await readFile(cert, 'utf8')
  const server = https.createServer({ key: await readFile(key), cert: certificate }, (request, response) => {
    response.setHeader('Link', '<https://127.0.0.1/next>; rel="next"')
    response.end(request.url)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `https://127.0.0.1:${server.address().port}/orders`
  const trusted = await requestHttps({ url })
  assert.equal(trusted.status, 200)
  assert.equal(trusted.text, '/orders')
  assert.match(trusted.link, /rel="next"/)
  assert.ok(certificate.includes('BEGIN CERTIFICATE'))
})
