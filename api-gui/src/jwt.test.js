import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeJwtPayload, oauthMode, signClientAssertion } from './jwt.js'

test('oauth runs only when the client has a token URL, client id, and key', () => {
  assert.equal(oauthMode({}), 'off')
  assert.equal(oauthMode({ clientId: 'orders-a' }), 'off')
  assert.equal(oauthMode({ tokenUrl: 'https://auth.example/token', clientId: 'orders-a' }), 'incomplete')
  assert.equal(oauthMode({ tokenUrl: 'https://auth.example/token', clientId: 'orders-a', privateKey: 'secret' }), 'on')
})

test('signs a client assertion with HS256', async () => {
  const token = await signClientAssertion({
    algorithm: 'HS256',
    privateKey: 'test-secret',
    clientId: 'order-tester',
    audience: 'https://auth.example/token',
    lifetimeSeconds: 120,
  })
  const payload = decodeJwtPayload(token)
  assert.equal(payload.iss, 'order-tester')
  assert.equal(payload.sub, 'order-tester')
  assert.equal(payload.aud, 'https://auth.example/token')
  assert.equal(payload.exp - payload.iat, 120)
  assert.ok(payload.jti)

  const [header, body, signaturePart] = token.split('.')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify({ name: 'HMAC' }, key, base64UrlToBytes(signaturePart), new TextEncoder().encode(`${header}.${body}`))
  assert.equal(valid, true)
})

test('signs a client assertion with an RS256 private key', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const pem = toPem(pkcs8, 'PRIVATE KEY')
  const token = await signClientAssertion({
    algorithm: 'RS256',
    privateKey: pem,
    clientId: 'order-tester',
    audience: 'https://auth.example/token',
  })
  assert.equal(decodeJwtPayload(token).iss, 'order-tester')
  const [header, body, signaturePart] = token.split('.')
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    pair.publicKey,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${header}.${body}`),
  )
  assert.equal(valid, true)
})

function base64UrlToBytes(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

function toPem(buffer, label) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const body = btoa(binary).match(/.{1,64}/g).join('\n')
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`
}
