const FILE_HEADER = 'x-tester-files'

export async function loadClientsFile() {
  const response = await fetch('/files/clients')
  if (!fromFileApi(response)) return null
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Could not read data/clients.yaml.')
  return response.text()
}

export async function loadSpecFile() {
  const response = await fetch('/files/openapi')
  if (!fromFileApi(response)) return null
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Could not read data/openapi.yaml.')
  return response.text()
}

export async function saveSpecFile(text) {
  const response = await fetch('/files/openapi', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/yaml' },
    body: text,
  })
  if (!fromFileApi(response)) throw new Error('Restart the tester to write data/openapi.yaml.')
  if (!response.ok && response.status !== 204) throw new Error(await response.text() || 'Could not save openapi.yaml.')
}

export async function saveClientsFile(yamlText) {
  const response = await fetch('/files/clients', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/yaml' },
    body: yamlText,
  })
  if (!fromFileApi(response)) throw new Error('Restart the tester to write data/clients.yaml.')
  if (!response.ok && response.status !== 204) throw new Error(await response.text() || 'Could not save clients.yaml.')
}

export async function listRuns() {
  const response = await fetch('/files/runs')
  if (!fromFileApi(response) || !response.ok) return []
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function saveRun(run) {
  const response = await fetch('/files/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  })
  if (!fromFileApi(response)) throw new Error('Restart the tester to save run files.')
  if (!response.ok) throw new Error(await response.text() || 'Could not save that run.')
  return response.json()
}

export async function loadRun(name) {
  const response = await fetch(`/files/runs/${encodeURIComponent(name)}`)
  if (!fromFileApi(response) || !response.ok) throw new Error('Could not open that saved run.')
  return response.text()
}

function fromFileApi(response) {
  return response.headers.get(FILE_HEADER) === '1'
}
