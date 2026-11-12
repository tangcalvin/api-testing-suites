import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

export function trustedCertificates(ca) {
  const extra = String(ca || '').trim()
  const roots = tls.rootCertificates || []
  if (!extra) return [...roots]
  return [...roots, extra]
}

export function requestHttps({ url, method = 'GET', headers = {}, body = '', ca = '', timeout = 20000 }) {
  let target
  try {
    target = new URL(String(url || ''))
  } catch {
    return Promise.reject(Object.assign(new Error('The HTTPS address is not a valid URL.'), { status: 400 }))
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return Promise.reject(Object.assign(new Error('Only an http or https address can use the internal CA.'), { status: 400 }))
  }
  const transport = target.protocol === 'https:' ? https : http
  const agent = target.protocol === 'https:'
    ? new https.Agent({ ca: trustedCertificates(ca), rejectUnauthorized: true })
    : undefined
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: String(method || 'GET').toUpperCase(),
      headers: outboundHeaders(headers),
      timeout,
      agent,
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        agent?.destroy()
        const link = response.headers.link
        resolve({
          status: response.statusCode || 0,
          text: Buffer.concat(chunks).toString('utf8'),
          link: Array.isArray(link) ? link.join(', ') : (link || null),
        })
      })
    })
    request.on('timeout', () => {
      request.destroy()
      agent?.destroy()
      reject(Object.assign(new Error('The HTTPS call timed out.'), { status: 504 }))
    })
    request.on('error', (error) => {
      agent?.destroy()
      reject(Object.assign(new Error(error.message || 'The HTTPS call failed.'), { status: 502 }))
    })
    const payload = body == null ? '' : String(body)
    if (payload && request.method !== 'GET' && request.method !== 'HEAD') request.write(payload)
    request.end()
  })
}

function outboundHeaders(headers) {
  const next = {}
  for (const [name, value] of Object.entries(headers || {})) {
    if (value == null || value === '') continue
    const key = String(name)
    if (/^(host|content-length|connection|transfer-encoding)$/i.test(key)) continue
    next[key] = String(value)
  }
  return next
}
