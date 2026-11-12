import assert from 'node:assert/strict'
import test from 'node:test'
import { hasCaCert, shouldUseCa } from './caFetch.js'

const pem = '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----'

test('an internal CA is used only for an outside https address', () => {
  assert.equal(hasCaCert({ caCert: pem }), true)
  assert.equal(hasCaCert({ caCert: '' }), false)
  assert.equal(shouldUseCa('https://orders.internal/api', { caCert: pem }), true)
  assert.equal(shouldUseCa('http://orders.internal/api', { caCert: pem }), false)
  assert.equal(shouldUseCa('/backend/api/orders', { caCert: pem }), false)
  assert.equal(shouldUseCa('https://orders.internal/api', { caCert: '' }), false)
})
