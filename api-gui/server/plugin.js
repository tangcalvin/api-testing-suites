import { requestHttps } from './https.js'
import { createStore } from './store.js'

const FILE_HEADER = 'x-tester-files'

export function fileApiPlugin() {
  return {
    name: 'tester-files',
    configureServer(server) {
      install(server, server.config.root)
    },
    configurePreviewServer(server) {
      install(server, server.config.root)
    },
  }
}

function install(server, root) {
  const store = createStore(`${root}/data`)
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url || '/', 'http://tester.local')
    if (!url.pathname.startsWith('/files')) {
      next()
      return
    }
    handle(store, request, response, url.pathname).catch((error) => {
      send(response, error.status || 500, error.message || 'Could not use the file store.')
    })
  })
}

async function handle(store, request, response, pathname) {
  if (pathname === '/files/clients' && request.method === 'GET') {
    const text = await store.readClients()
    if (text == null) {
      send(response, 404, 'No clients file yet.')
      return
    }
    send(response, 200, text, 'application/yaml')
    return
  }
  if (pathname === '/files/clients' && request.method === 'PUT') {
    await store.writeClients(await readBody(request))
    send(response, 204, '')
    return
  }
  if (pathname === '/files/openapi' && request.method === 'GET') {
    const text = await store.readSpec()
    if (text == null) {
      send(response, 404, 'No OpenAPI file yet.')
      return
    }
    send(response, 200, text, 'application/yaml')
    return
  }
  if (pathname === '/files/openapi' && request.method === 'PUT') {
    await store.writeSpec(await readBody(request))
    send(response, 204, '')
    return
  }
  if (pathname === '/files/runs' && request.method === 'GET') {
    send(response, 200, JSON.stringify(await store.listRuns()), 'application/json')
    return
  }
  if (pathname === '/files/https' && request.method === 'POST') {
    let payload
    try {
      payload = JSON.parse(await readBody(request))
    } catch {
      send(response, 400, 'The HTTPS call must be JSON.')
      return
    }
    try {
      const result = await requestHttps(payload || {})
      send(response, 200, JSON.stringify(result), 'application/json')
    } catch (error) {
      send(response, 200, JSON.stringify({ status: 0, text: error.message || 'The HTTPS call failed.', link: null }), 'application/json')
    }
    return
  }
  if (pathname === '/files/runs' && request.method === 'POST') {
    const saved = await store.writeRun(JSON.parse(await readBody(request)))
    send(response, 201, JSON.stringify(saved), 'application/json')
    return
  }
  const runName = pathname.startsWith('/files/runs/') ? decodeURIComponent(pathname.slice('/files/runs/'.length)) : ''
  if (runName && request.method === 'GET') {
    send(response, 200, await store.readRun(runName), 'application/yaml')
    return
  }
  send(response, 405, 'That file request is not supported.')
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.statusCode = status
  response.setHeader(FILE_HEADER, '1')
  if (status === 204) {
    response.end()
    return
  }
  response.setHeader('Content-Type', type)
  response.end(body)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 8_000_000) {
        reject(Object.assign(new Error('File is too large.'), { status: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}
