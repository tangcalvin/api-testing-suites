export function hasCaCert(oauth) {
  return /-----BEGIN CERTIFICATE-----/.test(String(oauth?.caCert || ''))
}

export function shouldUseCa(url, oauth) {
  if (!hasCaCert(oauth)) return false
  try {
    const parsed = new URL(String(url), pageOrigin() || 'http://tester.local')
    return parsed.protocol === 'https:' && parsed.origin !== pageOrigin()
  } catch {
    return false
  }
}

export async function fetchWithCa(url, { method = 'GET', headers = {}, body, ca } = {}) {
  let response
  try {
    response = await fetch('/files/https', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        url: String(url),
        method,
        headers,
        body: body == null ? '' : String(body),
        ca: String(ca || ''),
      }),
    })
  } catch (error) {
    return { status: 0, text: error.message || 'The tester could not make the HTTPS call.', link: null }
  }
  const payload = await response.json().catch(() => null)
  if (!payload) {
    return { status: 0, text: 'The tester could not read the HTTPS call.', link: null }
  }
  return { status: Number(payload.status) || 0, text: payload.text || '', link: payload.link || null }
}

function pageOrigin() {
  if (typeof window === 'undefined' || !window.location) return ''
  return window.location.origin
}
