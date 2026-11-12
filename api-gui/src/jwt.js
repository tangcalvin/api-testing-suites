import { fetchWithCa, shouldUseCa } from './caFetch.js'

const textEncoder = new TextEncoder()

export async function signClientAssertion({ algorithm = 'RS256', privateKey, clientId, audience, lifetimeSeconds = 300 }) {
  if (!clientId) throw new Error('Client ID is required.')
  if (!audience) throw new Error('Audience is required.')
  if (!privateKey) throw new Error(algorithm === 'HS256' ? 'Shared secret is required.' : 'Private key is required.')
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: algorithm, typ: 'JWT' }
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: audience,
    iat: now,
    exp: now + Number(lifetimeSeconds || 300),
    jti: globalThis.crypto.randomUUID(),
  }
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const key = await importSigningKey(algorithm, privateKey)
  const signature = await globalThis.crypto.subtle.sign(signAlgorithm(algorithm), key, textEncoder.encode(unsigned))
  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`
}

export function oauthMode(oauth) {
  const tokenUrl = String(oauth?.tokenUrl || '').trim()
  const clientId = String(oauth?.clientId || '').trim()
  const privateKey = String(oauth?.privateKey || '').trim()
  if (!tokenUrl) return 'off'
  if (!clientId || !privateKey) return 'incomplete'
  return 'on'
}

export async function accessTokenFor(oauth) {
  const mode = oauthMode(oauth)
  if (mode === 'off') return ''
  if (mode === 'incomplete') {
    throw new Error('Fill the token URL, client ID, and key for this client before running checks.')
  }
  const tokenUrl = String(oauth.tokenUrl).trim()
  const assertion = await signClientAssertion({
    algorithm: oauth.algorithm || 'RS256',
    privateKey: oauth.privateKey,
    clientId: String(oauth.clientId).trim(),
    audience: String(oauth.audience || '').trim() || tokenUrl,
    lifetimeSeconds: Number(oauth.lifetime) || 300,
  })
  const result = await requestAccessToken({
    tokenUrl,
    assertion,
    scope: String(oauth.scope || '').trim(),
    ca: oauth.caCert,
  })
  if (!result.ok) {
    throw new Error(result.error || `Token request failed (${result.status}).`)
  }
  return result.accessToken
}

export async function requestAccessToken({ tokenUrl, assertion, scope, ca }) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
  })
  if (scope) body.set('scope', scope)
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  const sent = shouldUseCa(tokenUrl, { caCert: ca })
    ? await fetchWithCa(tokenUrl, { method: 'POST', headers, body: body.toString(), ca })
    : await readFetch(await fetch(tokenUrl, { method: 'POST', headers, body }))
  let parsed = null
  try {
    parsed = JSON.parse(sent.text)
  } catch {
    parsed = null
  }
  const ok = sent.status >= 200 && sent.status < 300
  return {
    ok: ok && Boolean(parsed?.access_token),
    status: sent.status,
    accessToken: parsed?.access_token || '',
    expiresIn: parsed?.expires_in,
    error: parsed?.error_description || parsed?.error || (ok ? '' : sent.text),
  }
}

async function readFetch(response) {
  return { status: response.status, text: await response.text(), link: response.headers?.get?.('link') || null }
}

export function decodeJwtPayload(token) {
  const part = String(token || '').split('.')[1]
  if (!part) return null
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
  return JSON.parse(json)
}

async function importSigningKey(algorithm, material) {
  if (algorithm === 'HS256') {
    return globalThis.crypto.subtle.importKey(
      'raw',
      textEncoder.encode(material),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }
  const name = algorithm === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  return globalThis.crypto.subtle.importKey('pkcs8', pemToBytes(material), name, false, ['sign'])
}

function signAlgorithm(algorithm) {
  if (algorithm === 'HS256') return { name: 'HMAC' }
  if (algorithm === 'ES256') return { name: 'ECDSA', hash: 'SHA-256' }
  return { name: 'RSASSA-PKCS1-v1_5' }
}

function pemToBytes(pem) {
  const body = String(pem).replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

function base64UrlJson(value) {
  return base64UrlBytes(textEncoder.encode(JSON.stringify(value)))
}

function base64UrlBytes(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
