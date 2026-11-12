import { useEffect, useMemo, useRef, useState } from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from '@mui/material'
import {
  MAX_CASES,
  boundaryChoices,
  casesFor,
  createPacer,
  defaultResponseExpected,
  isArrayOfObjects,
  parseObjectArray,
  readExpectation,
  describeFetched,
  firstPageQuery,
  joinUrl,
  judge,
  listOperations,
  parseSpecText,
  planContinuation,
  readItems,
  readPath,
  responseChecks,
  serverUrl,
  specGaps,
  valueText,
  viewsWithStatuses,
} from './openapi/spec'
import {
  CASES_KEY,
  DEFAULTS_KEY,
  OAUTH_KEY,
  PROFILES_KEY,
  applyDefaults,
  EXAMPLE_CASES_URL,
  EXAMPLE_DEFAULTS_URL,
  EXAMPLE_PROFILES_URL,
  casesDocument,
  coerceFieldValue,
  createProfile,
  acceptsTemporal,
  clockToken,
  dynamicKind,
  effectiveSample,
  evaluateDynamics,
  emptyCases,
  emptyDefaults,
  emptyOauth,
  hasSavedCases,
  hasSavedDefaults,
  loadExample,
  loadStored,
  newCustomCase,
  parseClock,
  parseCases,
  parseUuid,
  parseDefaults,
  parseOauth,
  parseProfiles,
  parseProfilesText,
  readDocument,
  profileLabel,
  profilesDocument,
  profilesYaml,
  putNamedValue,
  removeNamedValue,
  resolveCases,
  sampleSource,
  saveStored,
  setNamedValue,
  substitute,
  temporalDraftOk,
  uuidToken,
} from './library'
import { fetchWithCa, shouldUseCa } from './caFetch'
import { accessTokenFor, oauthMode } from './jwt'
import { listRuns, loadClientsFile, loadRun, loadSpecFile, saveClientsFile, saveRun, saveSpecFile } from './files'

const EXAMPLES_SEEDED_KEY = 'api-tester.examples-loaded'
const EXAMPLE_CLIENTS_KEY = 'api-tester.example-clients'
const PROXY_SPEC = '/backend/v3/api-docs.yaml'
const PROXY_BASE = '/backend'
const DIRECT_BASE = 'http://localhost:8088'

const MODES = [
  {
    id: 'combination',
    label: 'Combinations',
    detail: 'Crosses the selected enum fields. A check passes on a success status, and when each expected response value matches.',
  },
  {
    id: 'boundary',
    label: 'Boundaries',
    detail: 'Each selected minimum, maximum, or length is one check for that field. Every other field keeps its default. A check passes when validation accepts the value and the expected response values match.',
  },
  {
    id: 'error',
    label: 'Schema errors',
    detail: 'Breaks one schema constraint at a time, and also omits every required field together. A check passes when the status is 400 and exceptions lists that field.',
  },
  {
    id: 'custom',
    label: 'Custom',
    detail: 'Runs the cases saved for this operation. Blank request fields use the defaults. A check passes on the HTTP status, and when the response schema values for that status match.',
  },
]

const METHOD_TONE = {
  GET: { bg: '#e7f6f3', fg: '#0f766e' },
  POST: { bg: '#e8eefc', fg: '#1d4ed8' },
  PUT: { bg: '#fef3e2', fg: '#b45309' },
  PATCH: { bg: '#f3e8ff', fg: '#6d28d9' },
  DELETE: { bg: '#fdecec', fg: '#b42318' },
}

const LOCATION_TONE = {
  body: { bg: '#eef2ff', fg: '#3730a3' },
  query: { bg: '#f3f0ea', fg: '#7c5a2e' },
  path: { bg: '#f1f5f9', fg: '#334155' },
}

export default function App() {
  const [specUrl, setSpecUrl] = useState(PROXY_SPEC)
  const [baseUrl, setBaseUrl] = useState(PROXY_BASE)
  const [operations, setOperations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [fields, setFields] = useState([])
  const [mode, setMode] = useState('combination')
  const [loadError, setLoadError] = useState('')
  const [info, setInfo] = useState('')
  const [profiles, setProfiles] = useState([])
  const [activeId, setActiveId] = useState('')
  const [profileName, setProfileName] = useState('')
  const [defaults, setDefaults] = useState(emptyDefaults)
  const [customCases, setCustomCases] = useState(emptyCases)
  const [libraryReady, setLibraryReady] = useState(false)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [oauth, setOauth] = useState(emptyOauth)
  const [libraryNotice, setLibraryNotice] = useState('')
  const [fileNotice, setFileNotice] = useState('')
  const [savedRuns, setSavedRuns] = useState([])
  const [savedRunName, setSavedRunName] = useState('')
  const [tps, setTps] = useState('30')
  const [activity, setActivity] = useState('')
  const [running, setRunning] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [results, setResults] = useState([])
  const [onlyFailed, setOnlyFailed] = useState(false)
  const [openResult, setOpenResult] = useState(null)
  const stopRef = useRef(false)
  const specReady = useRef(false)
  const clientsWrite = useRef(Promise.resolve())
  const clientsBody = useRef('')

  const selected = operations.find((operation) => operation.id === selectedId) || null
  const modeInfo = MODES.find((item) => item.id === mode)
  const resolvedFields = useMemo(
    () => (selected ? applyDefaults(fields, selected.id, defaults) : []),
    [defaults, fields, selected],
  )
  const operationCases = selected ? customCases.operations[selected.id] : undefined
  const planned = useMemo(
    () => (selected ? casesFor(mode, resolvedFields, resolveCases(operationCases || [], defaults.variables)) : []),
    [defaults.variables, mode, operationCases, resolvedFields, selected],
  )

  useEffect(() => {
    let cancelled = false
    async function loadProjectExamples() {
      let storedProfiles = null
      try {
        const clientsFile = await loadClientsFile()
        if (clientsFile) storedProfiles = parseProfilesText(clientsFile)
      } catch (error) {
        if (!cancelled) setFileNotice(error.message || 'Could not read data/clients.yaml.')
      }
      if (!storedProfiles?.profiles?.length) storedProfiles = loadStored(PROFILES_KEY, () => null, parseProfiles)
      const runs = await listRuns()
      if (!cancelled) setSavedRuns(runs)
      const exampleProfiles = exampleClientsAlreadyApplied()
        ? null
        : await loadExample(EXAMPLE_PROFILES_URL, parseProfilesText, () => null)
      if (cancelled) return
      if (storedProfiles?.profiles?.length) {
        const profiles = mergeExampleClients(storedProfiles.profiles, exampleProfiles)
        const active = profiles.find((profile) => profile.id === storedProfiles.activeId) || profiles[0]
        showProfile(active)
        setProfiles(profiles)
        markExamplesApplied()
        if (exampleProfiles?.profiles?.length) markExampleClientsApplied()
        setLibraryReady(true)
        await openSavedSpec(profiles)
        return
      }
      if (!examplesAlreadyApplied() && exampleProfiles?.profiles?.length) {
        const active = exampleProfiles.profiles.find((profile) => profile.id === exampleProfiles.activeId) || exampleProfiles.profiles[0]
        showProfile(active)
        setProfiles(exampleProfiles.profiles)
        markExamplesApplied()
        markExampleClientsApplied()
        setLibraryReady(true)
        await openSavedSpec(exampleProfiles.profiles)
        return
      }
      const storedDefaults = loadStored(DEFAULTS_KEY, emptyDefaults, parseDefaults)
      const storedCases = loadStored(CASES_KEY, emptyCases, parseCases)
      const storedOauth = loadStored(OAUTH_KEY, emptyOauth, parseOauth)
      const seeded = examplesAlreadyApplied()
      const hasLegacy = hasSavedDefaults(storedDefaults) || hasSavedCases(storedCases) || oauthMode(storedOauth) !== 'off'
      const nextDefaults = hasLegacy || seeded
        ? storedDefaults
        : await loadExample(EXAMPLE_DEFAULTS_URL, parseDefaults, emptyDefaults)
      const nextCases = hasLegacy || seeded
        ? storedCases
        : await loadExample(EXAMPLE_CASES_URL, parseCases, emptyCases)
      if (cancelled) return
      const profile = createProfile({
        name: storedOauth.clientId || 'Example',
        defaults: nextDefaults,
        cases: nextCases,
        oauth: storedOauth,
      })
      showProfile(profile)
      setProfiles([profile])
      if (seeded || hasLegacy || hasSavedDefaults(nextDefaults) || hasSavedCases(nextCases)) markExamplesApplied()
      setLibraryReady(true)
      await openSavedSpec([profile])
    }
    async function openSavedSpec(profileList) {
      try {
        const specText = await loadSpecFile()
        if (cancelled || !specText || specReady.current) return
        await applySpec(specText, 'Saved spec', { profiles: profileList })
      } catch (error) {
        if (!cancelled) setLoadError(error.message || 'Could not read data/openapi.yaml.')
      }
    }
    loadProjectExamples()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!libraryReady || !activeId) return
    const snapshot = profiles.map((profile) => (profile.id === activeId
      ? { ...profile, name: profileName, defaults, cases: customCases, oauth }
      : profile))
    saveStored(PROFILES_KEY, profilesDocument(snapshot, activeId))
    const handle = setTimeout(() => persistClients(snapshot, activeId), 400)
    return () => clearTimeout(handle)
  }, [profiles, activeId, profileName, defaults, customCases, oauth, libraryReady])
  const passed = results.filter((result) => result.passed).length
  const visible = onlyFailed ? results.filter((result) => !result.passed) : results

  async function applySpec(text, sourceLabel, { save = false, profiles: gapProfiles } = {}) {
    const spec = parseSpecText(text)
    const nextOperations = listOperations(spec)
    if (nextOperations.length === 0) {
      throw new Error('The document does not contain any operations.')
    }
    specReady.current = true
    let saved = ''
    if (save) {
      try {
        await saveSpecFile(text)
        saved = ' Saved as data/openapi.yaml.'
      } catch (error) {
        setFileNotice(error.message || 'Could not save data/openapi.yaml.')
      }
    }
    setOperations(nextOperations)
    setSelectedId(nextOperations[0].id)
    setFields(nextOperations[0].fields.map((field) => ({ ...field })))
    setResults([])
    setLoadError('')
    const discovered = serverUrl(spec)
    const gaps = specGaps(nextOperations, gapProfiles || commitProfiles())
    const mismatch = gaps.length
      ? ` Saved clients still use ${gaps.slice(0, 3).join('; ')}${gaps.length > 3 ? `; and ${gaps.length - 3} more` : ''}.`
      : ''
    setInfo(`${sourceLabel}: ${nextOperations.length} operations${discovered ? `. Document server: ${discovered}` : ''}.${saved}${mismatch}`)
  }

  async function loadFromUrl() {
    setLoadError('')
    try {
      const response = shouldUseCa(specUrl, oauth)
        ? await fetchWithCa(specUrl, { ca: oauth.caCert })
        : await fetch(specUrl).then(async (result) => ({ status: result.status, text: await result.text() }))
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`The spec URL returned HTTP ${response.status}.`)
      }
      await applySpec(response.text, 'Loaded', { save: true })
    } catch (error) {
      setLoadError(error.message || 'Could not load the OpenAPI document.')
    }
  }

  async function loadFromFile(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setLoadError('')
    try {
      await applySpec(await file.text(), file.name, { save: true })
    } catch (error) {
      setLoadError(error.message || 'Could not read that file.')
    }
  }

  function selectOperation(operation) {
    setSelectedId(operation.id)
    setFields(operation.fields.map((field) => ({ ...field })))
    setResults([])
    setOpenResult(null)
  }

  function updateField(name, patch) {
    setFields((current) => current.map((field) => (field.name === name ? { ...field, ...patch } : field)))
  }

  function writeVariable(name, value) {
    const key = String(name || '').trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return
    setDefaults((current) => ({ ...current, variables: { ...current.variables, [key]: value } }))
  }

  function renameVariable(currentName, nextName) {
    const key = String(nextName || '').trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return false
    if (key !== currentName && Object.prototype.hasOwnProperty.call(defaults.variables || {}, key)) return false
    setDefaults((current) => {
      const variables = { ...current.variables }
      const value = variables[currentName]
      delete variables[currentName]
      variables[key] = value ?? ''
      return { ...current, variables }
    })
    return true
  }

  function removeVariable(name) {
    setDefaults((current) => {
      const variables = { ...current.variables }
      delete variables[name]
      return { ...current, variables }
    })
  }

  function addVariable() {
    setDefaults((current) => {
      const variables = { ...current.variables }
      let name = 'name'
      let suffix = 2
      while (Object.prototype.hasOwnProperty.call(variables, name)) {
        name = `name${suffix}`
        suffix += 1
      }
      variables[name] = ''
      return { ...current, variables }
    })
  }

  function writeGlobal(field, raw) {
    setDefaults((current) => ({ ...current, global: setNamedValue(current.global, field.name, raw, field) }))
  }

  function writeNamed(section, name, raw) {
    setDefaults((current) => ({
      ...current,
      [section]: setNamedValue(current[section], name, raw, { type: 'string' }),
    }))
  }

  function renameNamed(section, currentName, nextName) {
    const key = String(nextName || '').trim()
    if (!key || /\s/.test(key)) return false
    if (key !== currentName && Object.prototype.hasOwnProperty.call(defaults[section] || {}, key)) return false
    setDefaults((current) => {
      const map = { ...(current[section] || {}) }
      const value = map[currentName]
      delete map[currentName]
      map[key] = value ?? ''
      return { ...current, [section]: map }
    })
    return true
  }

  function removeNamed(section, name) {
    setDefaults((current) => ({ ...current, [section]: removeNamedValue(current[section], name) }))
  }

  function addNamed(section, seed) {
    setDefaults((current) => {
      const map = { ...(current[section] || {}) }
      let name = seed
      let suffix = 2
      while (Object.prototype.hasOwnProperty.call(map, name)) {
        name = `${seed}${suffix}`
        suffix += 1
      }
      map[name] = ''
      return { ...current, [section]: map }
    })
  }

  function updateOauth(patch) {
    setOauth((current) => ({ ...current, ...patch }))
  }

  async function openSavedRun(name) {
    try {
      const document = readDocument(await loadRun(name))
      setResults(Array.isArray(document?.results) ? document.results : [])
      setSavedRunName(name)
      setOpenResult(null)
      setOnlyFailed(false)
    } catch (error) {
      setFileNotice(error.message || 'Could not open that saved run.')
    }
  }

  function showProfile(profile) {
    setActiveId(profile.id)
    setProfileName(profile.name || '')
    setDefaults(structuredClone(profile.defaults))
    setCustomCases(structuredClone(profile.cases))
    setOauth(structuredClone(profile.oauth))
    setResults([])
    setSavedRunName('')
    setOpenResult(null)
  }

  function commitProfiles(list = profiles) {
    return list.map((profile) => (profile.id === activeId
      ? { ...profile, name: profileName, defaults, cases: customCases, oauth }
      : profile))
  }

  function persistClients(list, nextActiveId = activeId) {
    const body = profilesYaml(list, nextActiveId)
    clientsBody.current = body
    saveStored(PROFILES_KEY, profilesDocument(list, nextActiveId))
    clientsWrite.current = clientsWrite.current
      .catch(() => {})
      .then(() => {
        if (clientsBody.current !== body) return
        return saveClientsFile(body)
      })
      .catch((error) => {
        if (clientsBody.current === body) setFileNotice(error.message || 'Could not save data/clients.yaml.')
      })
  }

  function switchProfile(id) {
    if (!id || id === activeId) return
    const committed = commitProfiles()
    const target = committed.find((profile) => profile.id === id)
    if (!target) return
    setProfiles(committed)
    showProfile(target)
    persistClients(committed, id)
  }

  function renameProfile(name) {
    setProfileName(name)
    setProfiles((current) => current.map((profile) => (profile.id === activeId ? { ...profile, name } : profile)))
  }

  function addProfile() {
    const created = createProfile()
    const next = [...commitProfiles(), created]
    setProfiles(next)
    showProfile(created)
    persistClients(next, created.id)
  }

  function duplicateProfile() {
    const created = createProfile({
      name: `${profileLabel({ name: profileName, oauth })} copy`,
      defaults,
      cases: customCases,
      oauth,
    })
    const next = [...commitProfiles(), created]
    setProfiles(next)
    showProfile(created)
    persistClients(next, created.id)
  }

  function removeProfile() {
    const remaining = commitProfiles().filter((profile) => profile.id !== activeId)
    if (remaining.length === 0) return
    setProfiles(remaining)
    showProfile(remaining[0])
    persistClients(remaining, remaining[0].id)
  }

  function writeResponseExpected(operationId, status, fieldName, raw) {
    setDefaults((current) => {
      const responses = { ...(current.responses || {}) }
      const operation = { ...(responses[operationId] || {}) }
      const values = { ...(operation[status] || {}) }
      if (raw == null) delete values[fieldName]
      else values[fieldName] = raw
      if (Object.keys(values).length === 0) delete operation[status]
      else operation[status] = values
      if (Object.keys(operation).length === 0) delete responses[operationId]
      else responses[operationId] = operation
      return { ...current, responses }
    })
  }

  function addResponseStatus(operationId, status) {
    setDefaults((current) => {
      const extraStatuses = { ...(current.extraStatuses || {}) }
      const codes = new Set(extraStatuses[operationId] || [])
      codes.add(status)
      extraStatuses[operationId] = [...codes]
      return { ...current, extraStatuses }
    })
  }

  function removeResponseStatus(operationId, status) {
    setDefaults((current) => {
      const extraStatuses = { ...(current.extraStatuses || {}) }
      const codes = (extraStatuses[operationId] || []).filter((code) => code !== status)
      if (codes.length === 0) delete extraStatuses[operationId]
      else extraStatuses[operationId] = codes
      const responses = { ...(current.responses || {}) }
      if (responses[operationId]) {
        const operation = { ...responses[operationId] }
        delete operation[status]
        if (Object.keys(operation).length === 0) delete responses[operationId]
        else responses[operationId] = operation
      }
      return { ...current, extraStatuses, responses }
    })
  }

  function writeEndpoint(field, raw, inherit = false) {
    if (!selected) {
      return
    }
    const operationId = selected.id
    setDefaults((current) => {
      const operations = { ...current.operations }
      const next = inherit
        ? removeNamedValue(operations[operationId], field.name)
        : putNamedValue(operations[operationId], field.name, coerceFieldValue(field, raw))
      if (Object.keys(next).length === 0) {
        delete operations[operationId]
      } else {
        operations[operationId] = next
      }
      return { ...current, operations }
    })
  }

  function writeCases(operationId, list) {
    setCustomCases((current) => {
      const operations = { ...current.operations }
      if (list.length === 0) {
        delete operations[operationId]
      } else {
        operations[operationId] = list
      }
      return { operations }
    })
  }

  async function importLibrary(file, kind) {
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const document = readDocument(text)
      if (kind === 'profiles' || document?.kind === 'profiles') {
        const imported = parseProfiles(document, { newIds: true })
        const next = [...commitProfiles(), ...imported.profiles]
        setProfiles(next)
        showProfile(imported.profiles[0])
        persistClients(next, imported.profiles[0].id)
        setLibraryNotice(imported.profiles.length === 1 ? 'Imported 1 client.' : `Imported ${imported.profiles.length} clients.`)
      } else if (kind === 'defaults' || document?.kind === 'defaults') {
        setDefaults(parseDefaults(document))
        setLibraryNotice('Imported field defaults into this client.')
      } else {
        setCustomCases(parseCases(document))
        setLibraryNotice('Imported custom cases into this client.')
      }
    } catch (error) {
      setLibraryNotice(error.message || 'Could not import that file.')
    }
  }

  async function run() {
    if (!selected || planned.length === 0 || planned.length > MAX_CASES) {
      return
    }
    const cases = planned
    const pace = createPacer(tps)
    stopRef.current = false
    setRunning(true)
    setStopRequested(false)
    setActivity('')
    setResults([])
    setSavedRunName('')
    setOpenResult(null)
    const next = []
    for (let index = 0; index < cases.length; index += 1) {
      if (stopRef.current) {
        break
      }
      const item = cases[index]
      const response = await executeCheck(baseUrl, selected, item, {
        pace,
        shouldStop: () => stopRef.current,
        onActivity: setActivity,
        headers: requestHeaders(defaults),
        oauth,
      })
      if (!response) {
        break
      }
      const bodyText = item.expect?.outcome === 'custom' && response.pages?.[0] ? response.pages[0].text : response.text
      const verdict = judge(item.expect, response.status, bodyText, {
        request: response.request || { body: item.body, query: item.query, path: item.path },
        expectations: responseChecks(viewsWithStatuses(selected.responses, defaults.extraStatuses?.[selected.id]), new Set(fields.map((field) => field.name)), defaults.responses?.[selected.id]),
        variables: defaults.variables,
        pages: response.pages,
      })
      const request = formatRequestBody(response.request?.body ?? item.body)
      next.push({
        index: index + 1,
        label: item.label,
        status: response.status,
        passed: verdict.passed,
        detail: verdict.detail,
        text: response.pages ? response.text : pretty(response.text),
        pages: response.pages ? response.pages.map((page) => ({ ...page, text: pretty(page.text) })) : null,
        ...(request ? { request } : {}),
      })
      setResults([...next])
    }
    setActivity('')
    setRunning(false)
    if (next.length > 0) {
      try {
        const saved = await saveRun({
          client: profileLabel({ name: profileName, oauth }),
          clientId: oauth.clientId || '',
          operation: selected.id,
          mode: modeInfo?.label || mode,
          baseUrl,
          stopped: stopRef.current,
          results: next,
        })
        setSavedRunName(saved.name)
        setSavedRuns(await listRuns())
      } catch (error) {
        setFileNotice(error.message || 'Could not save that run.')
      }
    }
  }

  const failed = results.length - passed
  const showRequest = visible.some((result) => result.request)

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#0f2744', borderBottom: '1px solid #1c3d66' }}>
        <Toolbar variant="dense" sx={{ gap: 1.5, minHeight: 56 }}>
          <ScienceOutlinedIcon sx={{ fontSize: 22, color: '#99f6e4' }} />
          <Typography variant="h6" sx={{ color: '#fff' }}>API Tester</Typography>
          <Typography variant="body2" sx={{ color: '#b7c6d6', display: { xs: 'none', sm: 'block' } }}>
            Contract checks from an OpenAPI document
          </Typography>
          <Stack direction="row" spacing={1} sx={{ ml: 'auto', alignItems: 'center' }}>
            {libraryReady && activeId && (
              <TextField
                select
                size="small"
                label="Client"
                value={activeId}
                onChange={(event) => switchProfile(event.target.value)}
                sx={{
                  minWidth: 220,
                  maxWidth: 320,
                  '& .MuiSelect-select': { overflow: 'hidden', textOverflow: 'ellipsis' },
                  '& .MuiInputLabel-root': { color: '#b7c6d6' },
                  '& .MuiInputLabel-root.Mui-focused': { color: '#99f6e4' },
                  '& .MuiOutlinedInput-root': { color: '#fff' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3d5a80' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#99f6e4' },
                  '& .MuiSvgIcon-root': { color: '#b7c6d6' },
                }}
              >
                {profiles.map((profile) => (
                  <MenuItem key={profile.id} value={profile.id}>
                    {profileLabel(profile, profile.id === activeId ? { name: profileName, oauth } : null)}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button color="inherit" onClick={() => setLibraryOpen(true)} sx={{ color: '#fff' }}>
              Library
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ width: '100%', px: { xs: 1.5, md: 2.5 }, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: { xs: 1.5, md: 2 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.35fr 1fr' }, gap: 2 }}>
            <Stack spacing={0.75}>
              <Typography variant="overline" color="text.secondary">Specification</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
                <TextField
                  label="OpenAPI URL"
                  value={specUrl}
                  onChange={(event) => setSpecUrl(event.target.value)}
                  fullWidth
                />
                <Button variant="contained" onClick={loadFromUrl} sx={{ flexShrink: 0 }}>Load</Button>
                <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Import file
                  <input hidden type="file" accept=".yaml,.yml,.json,text/yaml,application/json" onChange={loadFromFile} />
                </Button>
              </Stack>
            </Stack>
            <Stack spacing={0.75}>
              <Typography variant="overline" color="text.secondary">Target</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' } }}>
                <TextField
                  label="API base URL"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  fullWidth
                />
                <Button variant="outlined" onClick={() => { setSpecUrl(PROXY_SPEC); setBaseUrl(PROXY_BASE) }} sx={{ flexShrink: 0 }}>
                  Dev proxy
                </Button>
                <Button variant="outlined" onClick={() => { setSpecUrl(`${DIRECT_BASE}/v3/api-docs.yaml`); setBaseUrl(DIRECT_BASE) }} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                  localhost:8088
                </Button>
              </Stack>
            </Stack>
          </Box>
          {loadError && <Alert severity="error" sx={{ mt: 1.5 }}>{loadError}</Alert>}
          {fileNotice && <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setFileNotice('')}>{fileNotice}</Alert>}
          {info && !loadError && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{info}</Typography>
          )}
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '320px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.5, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2">Operations</Typography>
              {operations.length > 0 && <Chip size="small" label={operations.length} variant="outlined" />}
            </Stack>
            <List dense disablePadding sx={{ maxHeight: { lg: 'calc(100vh - 250px)' }, overflow: 'auto' }}>
              {operations.map((operation) => (
                <ListItemButton
                  key={operation.id}
                  selected={operation.id === selectedId}
                  onClick={() => selectOperation(operation)}
                  sx={{ py: 1, gap: 1.25, alignItems: 'flex-start' }}
                >
                  <MethodBadge method={operation.method} />
                  <ListItemText
                    primary={operation.path}
                    secondary={operation.summary}
                    slotProps={{
                      primary: { noWrap: true, variant: 'body2', sx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } },
                      secondary: { noWrap: true },
                    }}
                  />
                  <PaginationMark pagination={operation.pagination} />
                </ListItemButton>
              ))}
              {operations.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
                  Load an OpenAPI document to list operations.
                </Typography>
              )}
            </List>
          </Paper>

          <Paper sx={{ p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
            {selected ? (
              <Stack spacing={1.75}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <MethodBadge method={selected.method} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15 }}>
                      {selected.path}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{selected.summary}</Typography>
                  </Box>
                  <Button size="small" variant="text" onClick={() => setDefaultsOpen(true)} sx={{ color: 'text.secondary', flexShrink: 0 }}>
                    Defaults
                  </Button>
                  <PaginationMark pagination={selected.pagination} />
                </Stack>

                <ResponseSchema
                  key={selected.id}
                  responses={viewsWithStatuses(selected.responses, defaults.extraStatuses?.[selected.id])}
                  requestNames={new Set(fields.map((field) => field.name))}
                  expected={defaults.responses?.[selected.id] || {}}
                  onExpected={(status, name, raw) => writeResponseExpected(selected.id, status, name, raw)}
                  onAddStatus={(status) => addResponseStatus(selected.id, status)}
                  onRemoveStatus={(status) => removeResponseStatus(selected.id, status)}
                />

                <Stack spacing={1}>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={mode}
                    sx={{ flexWrap: 'wrap' }}
                    onChange={(_event, value) => {
                      if (value) {
                        setMode(value)
                        setResults([])
                      }
                    }}
                  >
                    {MODES.map((item) => (
                      <ToggleButton key={item.id} value={item.id}>{item.label}</ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <Typography variant="body2" color="text.secondary">{modeInfo.detail}</Typography>
                  {libraryNotice && <Alert severity="info" onClose={() => setLibraryNotice('')}>{libraryNotice}</Alert>}
                </Stack>

                {mode === 'custom' ? (
                  <CustomCases
                    operation={selected}
                    fields={fields}
                    defaults={defaults}
                    cases={operationCases || []}
                    onChange={(list) => writeCases(selected.id, list)}
                    onExport={() => downloadJson('custom-cases.json', casesDocument(customCases))}
                    onImport={(file) => importLibrary(file, 'cases')}
                  />
                ) : (
                <Box sx={{ overflow: 'auto', maxHeight: 'min(440px, calc(100vh - 420px))', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 48 }}>{mode === 'boundary' ? 'Use' : 'Vary'}</TableCell>
                        <TableCell sx={{ width: 128 }}>Field</TableCell>
                        <TableCell sx={{ width: 76 }}>Type</TableCell>
                        <TableCell sx={{ width: 120 }}>Constraints</TableCell>
                        <TableCell>{mode === 'boundary' ? 'Include' : 'Sample'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fields.map((field) => {
                        const resolved = resolvedFields.find((item) => item.location === field.location && item.name === field.name) || field
                        const source = sampleSource(field, selected.id, defaults)
                        return (
                        <TableRow key={`${field.location}-${field.name}`} hover>
                          <TableCell>
                            {mode === 'boundary' ? (
                              <Typography variant="caption" color="text.secondary">
                                {boundaryChoices(field).filter((choice) => field.boundary?.[choice.id] !== false).length || ''}
                              </Typography>
                            ) : (
                              <FormControlLabel
                                sx={{ mr: 0 }}
                                control={(
                                  <Checkbox
                                    size="small"
                                    checked={field.vary}
                                    disabled={mode !== 'combination' || field.values.length === 0}
                                    onChange={(event) => updateField(field.name, { vary: event.target.checked })}
                                  />
                                )}
                                label={field.values.length > 1 ? String(field.values.length) : ''}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                              <Typography variant="body2" sx={{ fontWeight: 650 }}>{field.name}</Typography>
                              <ToneChip label={field.location} tone={LOCATION_TONE[field.location]} />
                              {field.required && <Chip label="required" size="small" variant="outlined" />}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>
                            {fieldTypeLabel(field)}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                              {constraintLabels(field).map((label) => (
                                <Chip key={label} label={label} size="small" variant="outlined" sx={{ fontWeight: 500 }} />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {mode === 'boundary' ? (
                              <BoundaryChoices
                                field={field}
                                sample={resolved.sample}
                                onToggle={(id, checked) => updateField(field.name, { boundary: { ...(field.boundary || {}), [id]: checked } })}
                              />
                            ) : mode === 'combination' && field.vary && field.values.length > 0 ? (
                              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                {field.values.map((value) => <Chip key={valueText(value)} label={valueText(value)} size="small" />)}
                              </Stack>
                            ) : (
                              <Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 0.75, alignItems: 'center' }}>
                                  <SampleEditor field={resolved} onChange={(sample) => writeEndpoint(field, sample)} />
                                  <Box>
                                    {source === 'endpoint' && (
                                      <Button size="small" onClick={() => writeEndpoint(field, '', true)} sx={{ minWidth: 0, px: 0.75, color: 'text.secondary' }}>
                                        Inherit
                                      </Button>
                                    )}
                                  </Box>
                                </Box>
                                {source === 'global' && <Typography variant="caption" color="text.secondary">Global default</Typography>}
                                {source === 'endpoint' && (
                                  <Typography variant="caption" color="text.secondary">
                                    {resolved.sample === '' ? 'This endpoint sends nothing' : 'This endpoint'}
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Box>
                )}

                <Stack spacing={1}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                    <Button
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      disabled={running || planned.length === 0 || planned.length > MAX_CASES}
                      onClick={run}
                    >
                      Run {planned.length} {planned.length === 1 ? 'check' : 'checks'}
                    </Button>
                    <Button
                      variant="outlined"
                      color="inherit"
                      startIcon={<StopIcon />}
                      disabled={!running}
                      onClick={() => {
                        stopRef.current = true
                        setStopRequested(true)
                      }}
                    >
                      Stop
                    </Button>
                    <TextField
                      label="Requests / second"
                      type="number"
                      value={tps}
                      disabled={running}
                      onChange={(event) => setTps(event.target.value)}
                      sx={{ width: { xs: '100%', sm: 170 } }}
                      slotProps={{ htmlInput: { min: 0.1, step: 1 } }}
                    />
                    <Typography variant="body2" color={planned.length > MAX_CASES ? 'error' : 'text.secondary'} sx={{ flex: 1 }}>
                      {planned.length > MAX_CASES
                        ? `${planned.length} checks exceeds the ${MAX_CASES} limit.`
                        : planned.length === 0
                          ? 'This operation has no checks in the selected mode.'
                          : running
                            ? `${results.length} of ${planned.length} complete${activity ? ` · ${activity}` : ''}`
                            : 'List checks follow the spec. Requests stay within this rate.'}
                    </Typography>
                    <PaginationHelp pagination={selected.pagination} />
                  </Stack>
                  {running && (
                    <LinearProgress
                      variant="determinate"
                      value={results.length === 0 ? 0 : (results.length / planned.length) * 100}
                      sx={{ borderRadius: 99, height: 6 }}
                    />
                  )}
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={0.5} sx={{ py: 6, alignItems: 'center', textAlign: 'center' }}>
                <ScienceOutlinedIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
                <Typography variant="subtitle1">No operation selected</Typography>
                <Typography variant="body2" color="text.secondary">Load a document, then choose an operation.</Typography>
              </Stack>
            )}
          </Paper>
          <DefaultsDialog
            open={defaultsOpen}
            operation={selected}
            fields={fields}
            defaults={defaults}
            onClose={() => setDefaultsOpen(false)}
            onGlobal={writeGlobal}
            onEndpoint={writeEndpoint}
            onImport={(file) => importLibrary(file, 'defaults')}
          />
          <LibraryDialog
            open={libraryOpen}
            defaults={defaults}
            oauth={oauth}
            profileName={profileName}
            profileCount={profiles.length}
            notice={libraryNotice}
            onClose={() => {
              persistClients(commitProfiles(), activeId)
              setLibraryOpen(false)
            }}
            onRenameProfile={renameProfile}
            onAddProfile={addProfile}
            onDuplicateProfile={duplicateProfile}
            onRemoveProfile={removeProfile}
            onAddVariable={addVariable}
            onRenameVariable={renameVariable}
            onWriteVariable={writeVariable}
            onRemoveVariable={removeVariable}
            onWriteNamed={writeNamed}
            onRenameNamed={renameNamed}
            onRemoveNamed={removeNamed}
            onAddNamed={addNamed}
            onOauth={updateOauth}
            onExport={() => downloadText('clients.yaml', profilesYaml(commitProfiles(), activeId), 'application/yaml')}
            onImport={(file) => importLibrary(file, 'defaults')}
            onImportProfiles={(file) => importLibrary(file, 'profiles')}
            onDismissNotice={() => setLibraryNotice('')}
          />
        </Box>

        {(results.length > 0 || savedRuns.length > 0) && (
          <Paper sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, py: 1.5, alignItems: 'center', flexWrap: 'wrap', borderBottom: results.length > 0 ? 1 : 0, borderColor: 'divider' }}>
              <Typography variant="subtitle2">Results</Typography>
              {savedRuns.length > 0 && (
                <TextField
                  select
                  size="small"
                  label="Saved runs"
                  value={savedRuns.some((run) => run.name === savedRunName) ? savedRunName : ''}
                  onChange={(event) => openSavedRun(event.target.value)}
                  sx={{ minWidth: 280 }}
                >
                  {savedRuns.map((run) => (
                    <MenuItem key={run.name} value={run.name}>{runLabel(run)}</MenuItem>
                  ))}
                </TextField>
              )}
              {results.length > 0 && (
                <>
                  <Chip size="small" label={`${passed} passed`} sx={{ bgcolor: '#e7f6f3', color: '#0f766e' }} />
                  <Chip size="small" label={`${failed} failed`} sx={{ bgcolor: failed ? '#fdecec' : '#f1f5f9', color: failed ? '#b42318' : '#526070' }} />
                  {stopRequested && <Chip size="small" label="Stopped" variant="outlined" />}
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" variant={onlyFailed ? 'contained' : 'text'} onClick={() => setOnlyFailed((current) => !current)}>
                    {onlyFailed ? 'Show all' : 'Failed only'}
                  </Button>
                </>
              )}
            </Stack>
            {results.length > 0 && <Box sx={{ overflow: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={56}>#</TableCell>
                    <TableCell width={90}>Check</TableCell>
                    <TableCell width={80}>HTTP</TableCell>
                    <TableCell>Case</TableCell>
                    <TableCell>Assertion</TableCell>
                    {showRequest && <TableCell width="28%">Request</TableCell>}
                    <TableCell width="32%">Response</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((result) => (
                    <TableRow
                      key={result.index}
                      hover
                      onClick={() => setOpenResult(openResult === result.index ? null : result.index)}
                      sx={{
                        cursor: 'pointer',
                        boxShadow: result.passed ? 'none' : 'inset 3px 0 0 #b42318',
                        bgcolor: result.passed ? 'inherit' : '#fff8f7',
                      }}
                    >
                      <TableCell sx={{ color: 'text.secondary' }}>{result.index}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={result.passed ? 'Pass' : 'Fail'}
                          sx={{
                            bgcolor: result.passed ? '#e7f6f3' : '#fdecec',
                            color: result.passed ? '#0f766e' : '#b42318',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{result.status || '—'}</TableCell>
                      <TableCell>{result.label}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{result.detail}</TableCell>
                      {showRequest && (
                        <TableCell>
                          {result.request && <PayloadText text={result.request} open={openResult === result.index} />}
                        </TableCell>
                      )}
                      <TableCell>
                        <ResponsePreview result={result} open={openResult === result.index} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>}
          </Paper>
        )}
      </Box>
    </Box>
  )
}

function runLabel(run) {
  const when = run.savedAt ? run.savedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z').slice(0, 19) : run.name
  return [when, run.client, run.operation, `${run.passed} passed, ${run.failed} failed`].filter(Boolean).join(' · ')
}

const PAGINATION_TONE = {
  page: { label: 'Page', bg: '#e8eef8', fg: '#1d4ed8' },
  cursor: { label: 'Cursor', bg: '#e7f6f3', fg: '#0f766e' },
  offset: { label: 'Offset', bg: '#fef3e2', fg: '#b45309' },
  link: { label: 'Link', bg: '#f3e8ff', fg: '#6d28d9' },
}

function PaginationMark({ pagination }) {
  if (!pagination) {
    return null
  }
  const tone = PAGINATION_TONE[pagination.style] || PAGINATION_TONE.link
  return (
    <Chip
      size="small"
      label={tone.label}
      title={paginationSummary(pagination)}
      sx={{ bgcolor: tone.bg, color: tone.fg, fontWeight: 700, height: 22, flexShrink: 0, mt: 0.25 }}
    />
  )
}

function MethodBadge({ method }) {
  const tone = METHOD_TONE[method] || { bg: '#eef2f6', fg: '#334155' }
  return <ToneChip label={method} tone={tone} wide />
}

function ToneChip({ label, tone, wide = false }) {
  const colors = tone || { bg: '#eef2f6', fg: '#334155' }
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: wide ? 58 : 0,
        px: 0.75,
        height: 22,
        borderRadius: 0.75,
        bgcolor: colors.bg,
        color: colors.fg,
        fontSize: 11,
        fontWeight: 750,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {label}
    </Box>
  )
}

function ResponseSchema({ responses, requestNames, expected, onExpected, onAddStatus, onRemoveStatus }) {
  const preferred = responses.find((item) => item.status === '200') || responses.find((item) => item.status.startsWith('2')) || responses[0]
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(preferred ? preferred.status : '')
  const [draft, setDraft] = useState('')
  const current = responses.find((item) => item.status === status) || preferred
  function addStatus() {
    if (!/^\d{3}$/.test(draft) || responses.some((item) => item.status === draft)) return
    onAddStatus(draft)
    setStatus(draft)
    setOpen(true)
    setDraft('')
  }
  return (
    <Box>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', minHeight: 32 }}>
        <Button
          size="small"
          color="inherit"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          startIcon={<ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />}
          sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 650, px: 0.5, minWidth: 0 }}
        >
          Response schema
        </Button>
        {responses.map((item) => {
          const tone = statusTone(item.status)
          const selectedStatus = current && item.status === current.status
          return (
            <Stack key={item.status} direction="row" spacing={0} sx={{ alignItems: 'center' }}>
              <Box
                component="button"
                type="button"
                onClick={() => {
                  setStatus(item.status)
                  setOpen(true)
                }}
                sx={{
                  border: 1,
                  borderColor: open && selectedStatus ? tone.fg : 'transparent',
                  bgcolor: tone.bg,
                  color: tone.fg,
                  borderRadius: item.added ? '4px 0 0 4px' : 1,
                  px: 0.75,
                  py: 0.1,
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {item.status}
              </Box>
              {item.added && (
                <Box
                  component="button"
                  type="button"
                  aria-label={`Remove ${item.status}`}
                  onClick={() => {
                    onRemoveStatus(item.status)
                    if (item.status === status) setStatus(preferred ? preferred.status : '')
                  }}
                  sx={{
                    border: 1,
                    borderLeft: 0,
                    borderColor: open && selectedStatus ? tone.fg : 'transparent',
                    bgcolor: tone.bg,
                    color: tone.fg,
                    borderRadius: '0 4px 4px 0',
                    px: 0.4,
                    py: 0.1,
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    lineHeight: 1.4,
                  }}
                >
                  ×
                </Box>
              )}
            </Stack>
          )
        })}
        <TextField
          size="small"
          placeholder="404"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 3))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addStatus()
          }}
          slotProps={{ htmlInput: { 'aria-label': 'Add HTTP status', inputMode: 'numeric' } }}
          sx={{ width: 72, '& input': { py: 0.4, fontSize: 12.5 } }}
        />
        <Button size="small" disabled={draft.length !== 3 || responses.some((item) => item.status === draft)} onClick={addStatus}>
          Add
        </Button>
        {!open && current?.description && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 80 }}>
            {current.description}
          </Typography>
        )}
      </Stack>
      {open && current && (
        <Box sx={{ mt: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          {current.description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 0.75, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider' }}>
              {current.description}
            </Typography>
          )}
          {current.fields.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.25 }}>No response body.</Typography>
          ) : (
            <Box sx={{ maxHeight: 280, overflow: 'auto' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                {'@{name}'} is the value sent for that request field. A success field with the same name starts as that reference. Clear a value to skip it. {'${name}'} still reads a variable. For an array of objects, enter a JSON array. Each object must appear, and only the fields you include are compared. In sequence requires those objects to be the first items, in the order you wrote.
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Field</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell width={90}>Required</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>Expected</TableCell>
                    <TableCell>Notes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {current.fields.map((field) => {
                    const objectArray = isArrayOfObjects(field)
                    const scalar = field.type !== 'object' && !String(field.type).startsWith('array')
                    const automatic = defaultResponseExpected(field, requestNames, current.status)
                    const stored = expected?.[current.status]
                    const hasOverride = stored && Object.prototype.hasOwnProperty.call(stored, field.name)
                    const storedEntry = hasOverride ? readExpectation(stored[field.name]) : { text: automatic, ordered: false }
                    const shown = storedEntry.text
                    const ordered = storedEntry.ordered
                    const objectArrayError = objectArray ? parseObjectArray(shown)?.error : ''
                    return (
                      <TableRow key={field.name} hover>
                        <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }}>{field.name}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          <Stack spacing={0.25} sx={{ alignItems: 'flex-start' }}>
                            <span>{field.type}</span>
                            {objectArray && (
                              <FormControlLabel
                                control={(
                                  <Checkbox
                                    size="small"
                                    checked={ordered}
                                    onChange={(event) => onExpected(
                                      current.status,
                                      field.name,
                                      event.target.checked || shown ? { value: shown, ordered: event.target.checked } : undefined,
                                    )}
                                  />
                                )}
                                label="In sequence"
                                sx={{ ml: 0, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5, color: 'text.primary' } }}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{field.required ? 'yes' : ''}</TableCell>
                        <TableCell>
                          {(scalar || objectArray) && (
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                              <TextField
                                size="small"
                                fullWidth
                                multiline={objectArray}
                                minRows={objectArray ? 2 : undefined}
                                value={shown}
                                placeholder={objectArray ? '[{"field":"quantity"},{"field":"customerEmail"}]' : (hasOverride ? 'Not checked' : (automatic || 'Not checked'))}
                                error={Boolean(objectArrayError)}
                                helperText={objectArrayError || undefined}
                                onChange={(event) => {
                                  const next = event.target.value
                                  if (objectArray) onExpected(current.status, field.name, next || ordered ? (ordered ? { value: next, ordered: true } : next) : undefined)
                                  else onExpected(current.status, field.name, next === automatic ? undefined : next)
                                }}
                                sx={{ minWidth: 220, '& input, & textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
                              />
                              {hasOverride && (
                                <Button size="small" onClick={() => onExpected(current.status, field.name, undefined)} sx={{ flexShrink: 0, minWidth: 0, color: 'text.secondary' }}>
                                  Default
                                </Button>
                              )}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{field.note}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

function CustomCases({ operation, fields, defaults, cases, onChange, onExport, onImport }) {
  const [activeId, setActiveId] = useState(cases[0]?.id || '')
  const active = cases.find((item) => item.id === activeId) || cases[0] || null

  function update(patch) {
    if (!active) {
      return
    }
    onChange(cases.map((item) => (item.id === active.id ? { ...item, ...patch } : item)))
  }

  function updateRequest(name, raw, field) {
    const request = { ...active.request }
    if (raw === '') {
      delete request[name]
    } else {
      request[name] = coerceFieldValue(field, raw)
    }
    update({ request })
  }

  function toggleOmit(name) {
    const omit = new Set(active.omit || [])
    if (omit.has(name)) omit.delete(name)
    else omit.add(name)
    update({ omit: [...omit] })
  }

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {cases.map((item) => (
          <Chip
            key={item.id}
            label={item.name || 'Custom case'}
            clickable
            onClick={() => setActiveId(item.id)}
            sx={item.id === (active && active.id) ? { bgcolor: '#0f2744', color: '#fff' } : { bgcolor: '#f1f5f9', color: '#334155' }}
          />
        ))}
        <Button size="small" onClick={() => {
          const created = newCustomCase()
          onChange([...cases, created])
          setActiveId(created.id)
        }}
        >
          Add case
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={onExport}>Export</Button>
        <ImportButton label="Import" onFile={onImport} />
      </Stack>
      {!active ? (
        <Typography variant="body2" color="text.secondary">No custom cases for this operation yet.</Typography>
      ) : (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 1.25, md: 1.5 } }}>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <TextField
                size="small"
                label="Case name"
                value={active.name}
                onChange={(event) => update({ name: event.target.value })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="HTTP status"
                placeholder="2xx"
                value={active.expect?.status || ''}
                onChange={(event) => update({ expect: { ...active.expect, status: event.target.value.replace(/\D/g, '').slice(0, 3) } })}
                sx={{ width: { xs: '100%', sm: 140 } }}
              />
              <Button size="small" color="inherit" onClick={() => {
                const next = cases.filter((item) => item.id !== active.id)
                onChange(next)
                setActiveId(next[0]?.id || '')
              }}
              >
                Delete
              </Button>
            </Stack>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Request</Typography>
              <Box sx={{ overflow: 'auto', maxHeight: 280, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Field</TableCell>
                      <TableCell>Value</TableCell>
                      <TableCell width={72}>Omit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fields.map((field) => {
                      const omitted = (active.omit || []).includes(field.name)
                      const hasValue = Object.prototype.hasOwnProperty.call(active.request || {}, field.name)
                      const inherited = effectiveSample(field, operation.id, defaults)
                      return (
                        <TableRow key={`${field.location}-${field.name}`}>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                              <Typography variant="body2">{field.name}</Typography>
                              <ToneChip label={field.location} tone={LOCATION_TONE[field.location]} />
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ minWidth: 180 }}>
                            <TextField
                              size="small"
                              fullWidth
                              disabled={omitted}
                              placeholder={omitted ? 'Omitted' : String(inherited ?? '')}
                              value={hasValue ? String(active.request[field.name]) : ''}
                              onChange={(event) => updateRequest(field.name, event.target.value, field)}
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox size="small" checked={omitted} onChange={() => toggleOmit(field.name)} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              The response schema above supplies the expected values for the status this case receives.
            </Typography>
          </Stack>
        </Box>
      )}
    </Stack>
  )
}

function LibraryDialog({
  open,
  defaults,
  oauth,
  profileName,
  profileCount,
  notice,
  onClose,
  onRenameProfile,
  onAddProfile,
  onDuplicateProfile,
  onRemoveProfile,
  onAddVariable,
  onRenameVariable,
  onWriteVariable,
  onRemoveVariable,
  onWriteNamed,
  onRenameNamed,
  onRemoveNamed,
  onAddNamed,
  onOauth,
  onExport,
  onImport,
  onImportProfiles,
  onDismissNotice,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      slotProps={{ paper: { sx: { height: 'min(820px, calc(100% - 48px))' } } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>Library</DialogTitle>
      <DialogContent sx={{ minHeight: 0, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Each client has its own variables, defaults, custom cases, signing key, and internal CA. Switch clients from the menu in the top bar. Write ${'{'}name{'}'} for a variable. Date, timestamp, and UUID values are filled when the request is sent: ${'{'}today+1d{'}'}, ${'{'}now-2h{'}'}, ${'{'}uuid:12{'}'}.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
          <TextField
            label="Client name"
            value={profileName}
            placeholder={oauth.clientId || 'Uses the client ID when blank'}
            onChange={(event) => onRenameProfile(event.target.value)}
            fullWidth
          />
          <Button onClick={onAddProfile} sx={{ flexShrink: 0 }}>Add</Button>
          <Button onClick={onDuplicateProfile} sx={{ flexShrink: 0 }}>Duplicate</Button>
          <Button onClick={onRemoveProfile} disabled={profileCount < 2} sx={{ flexShrink: 0 }}>Remove</Button>
        </Stack>
        <NamedMap
          title="Variables"
          typed
          entries={Object.entries(defaults.variables || {})}
          addLabel="Add variable"
          onAdd={onAddVariable}
          onRename={onRenameVariable}
          onValue={onWriteVariable}
          onRemove={onRemoveVariable}
        />
        <NamedMap
          title="Global defaults"
          typed
          hint="Used for every field with this name, on every operation. A date, timestamp, or UUID is generated for each request."
          entries={Object.entries(defaults.global || {})}
          addLabel="Add default"
          onAdd={() => onAddNamed('global', 'field')}
          onRename={(current, next) => onRenameNamed('global', current, next)}
          onValue={(name, value) => onWriteNamed('global', name, value)}
          onRemove={(name) => onRemoveNamed('global', name)}
        />
        <NamedMap
          title="Request headers"
          hint="Extra headers sent with every check. Authorization is replaced by the access token when this client has a token URL and key."
          entries={Object.entries(defaults.headers || {})}
          addLabel="Add header"
          onAdd={() => onAddNamed('headers', 'Authorization')}
          onRename={(current, next) => onRenameNamed('headers', current, next)}
          onValue={(name, value) => onWriteNamed('headers', name, value)}
          onRemove={(name) => onRemoveNamed('headers', name)}
        />
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Internal CA certificate</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Paste the PEM for an internal certificate authority. HTTPS calls for this client, including the token request and an HTTPS OpenAPI URL, are made by the tester and trust this CA together with the public roots. Leave it blank to use the browser.
        </Typography>
        <TextField
          label="Internal CA (PEM)"
          value={oauth.caCert || ''}
          placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
          onChange={(event) => onOauth({ caCert: event.target.value })}
          fullWidth
          multiline
          minRows={4}
          sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 } }}
        />
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Access token</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Before every HTTP request, the tester signs a client assertion with this key and requests an access token, then sends it as Authorization: Bearer. Leave these blank to call the API without a token. The token server must allow this page’s origin. A new client is written to data/clients.yaml immediately, and later edits follow. Export downloads that same file, including the key.
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
          <TextField label="Token URL" value={oauth.tokenUrl} onChange={(event) => onOauth({ tokenUrl: event.target.value })} fullWidth />
          <TextField label="Client ID" value={oauth.clientId} onChange={(event) => onOauth({ clientId: event.target.value })} fullWidth />
          <TextField label="Audience" placeholder="Defaults to the token URL" value={oauth.audience} onChange={(event) => onOauth({ audience: event.target.value })} fullWidth />
          <TextField select label="Algorithm" value={oauth.algorithm} onChange={(event) => onOauth({ algorithm: event.target.value })}>
            <MenuItem value="RS256">RS256</MenuItem>
            <MenuItem value="ES256">ES256</MenuItem>
            <MenuItem value="HS256">HS256</MenuItem>
          </TextField>
          <TextField label="Scope" value={oauth.scope} onChange={(event) => onOauth({ scope: event.target.value })} fullWidth />
          <TextField label="Lifetime (seconds)" value={oauth.lifetime} onChange={(event) => onOauth({ lifetime: event.target.value })} fullWidth />
        </Box>
        <TextField
          label={oauth.algorithm === 'HS256' ? 'Shared secret' : 'Private key (PKCS#8 PEM)'}
          value={oauth.privateKey}
          onChange={(event) => onOauth({ privateKey: event.target.value })}
          fullWidth
          multiline
          minRows={4}
          sx={{ mt: 1.25, '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 } }}
        />
        {notice && <Alert severity="info" sx={{ mt: 1.5 }} onClose={onDismissNotice}>{notice}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <ImportButton label="Import defaults" onFile={onImport} />
        <ImportButton label="Import YAML" accept=".yaml,.yml,.json,application/json,text/yaml" onFile={onImportProfiles} />
        <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={onExport}>Export YAML</Button>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

function NamedMap({ title, hint, entries, addLabel, onAdd, onRename, onValue, onRemove, typed = false }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2">{title}</Typography>
          {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
        </Box>
        <Button size="small" onClick={onAdd}>{addLabel}</Button>
      </Stack>
      <Box sx={{ overflow: 'auto', maxHeight: 280, minWidth: 0, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.25 }}>None yet.</Typography>
        ) : (
          <Table size="small" stickyHeader sx={{ minWidth: typed ? 520 : 420 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: typed ? 168 : '36%' }}>Name</TableCell>
                <TableCell>Value</TableCell>
                <TableCell width={88} />
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map(([name, value]) => (
                <VariableRow key={name} name={name} value={value} typed={typed} onRename={onRename} onValue={onValue} onRemove={onRemove} />
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </Box>
  )
}

function DefaultsDialog({ open, operation, fields, defaults, onClose, onGlobal, onEndpoint, onImport }) {
  const endpoint = operation ? defaults.operations[operation.id] || {} : {}
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      slotProps={{ paper: { sx: { height: 'min(760px, calc(100% - 48px))' } } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>Field defaults</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, flexShrink: 0 }}>
          A global value is used wherever that field name appears. A value for this endpoint replaces it. Every variable and every global default is listed under Library. Write ${'{'}name{'}'} to use a variable, ${'{'}today+1d{'}'} or ${'{'}now-2h{'}'} for a moving date or timestamp, and ${'{'}uuid:12{'}'} for a random id.
        </Typography>
        {operation ? (
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto', flex: 1, minHeight: 0 }}>
            {fields.map((field) => {
              const hasGlobal = Object.prototype.hasOwnProperty.call(defaults.global, field.name)
              const hasEndpoint = Object.prototype.hasOwnProperty.call(endpoint, field.name)
              return (
                <Box
                  key={`${field.location}-${field.name}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '168px minmax(0, 1fr)' },
                    gap: 1.25,
                    alignItems: 'center',
                    px: 1.5,
                    py: 1.25,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 0 },
                  }}
                >
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>{field.name}</Typography>
                    <ToneChip label={field.location} tone={LOCATION_TONE[field.location]} />
                  </Stack>
                  <Stack spacing={0.75}>
                    <LabeledValue label="Global">
                      <TypedValue
                        value={hasGlobal ? defaults.global[field.name] : ''}
                        kinds={valueKinds(field)}
                        format={field.format}
                        placeholder={String(field.sample ?? '') || temporalPlaceholder(field.format)}
                        onChange={(raw) => onGlobal(field, raw)}
                      />
                    </LabeledValue>
                    <LabeledValue label="Endpoint">
                      <TypedValue
                        value={hasEndpoint ? endpoint[field.name] : ''}
                        kinds={valueKinds(field)}
                        format={field.format}
                        placeholder={hasEndpoint ? '' : 'Inherit'}
                        helper={hasEndpoint && endpoint[field.name] === '' ? 'Not sent' : ''}
                        onChange={(raw) => {
                          if (raw === '') onEndpoint(field, '', true)
                          else onEndpoint(field, raw)
                        }}
                      />
                    </LabeledValue>
                  </Stack>
                </Box>
              )
            })}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">Select an operation to edit its defaults.</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <ImportButton label="Import JSON" onFile={onImport} />
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

function VariableRow({ name, value, typed = false, onRename, onValue, onRemove }) {
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])
  return (
    <TableRow>
      <TableCell sx={{ verticalAlign: 'middle' }}>
        <TextField
          size="small"
          fullWidth
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === name) return
            if (!onRename(name, draft)) setDraft(name)
          }}
          slotProps={{ htmlInput: { 'aria-label': 'Name' } }}
        />
      </TableCell>
      <TableCell sx={{ verticalAlign: 'middle' }}>
        {typed ? (
          <TypedValue value={value} kinds={VALUE_KINDS} onChange={(raw) => onValue(name, raw)} />
        ) : (
          <TextField size="small" fullWidth value={String(value ?? '')} onChange={(event) => onValue(name, event.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Value' } }} />
        )}
      </TableCell>
      <TableCell sx={{ verticalAlign: 'middle' }}>
        <Button size="small" color="inherit" onClick={() => onRemove(name)}>Remove</Button>
      </TableCell>
    </TableRow>
  )
}

function ImportButton({ label, onFile, accept = 'application/json,.json' }) {
  const input = useRef(null)
  return (
    <>
      <input
        hidden
        type="file"
        accept={accept}
        ref={input}
        onChange={(event) => {
          const file = event.target.files && event.target.files[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      <Button size="small" color="inherit" startIcon={<FileUploadOutlinedIcon />} onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  )
}

function mergeExampleClients(current, example) {
  if (!example?.profiles?.length) return current
  const known = new Set(current.map((profile) => String(profile.oauth?.clientId || '').trim()).filter(Boolean))
  const extras = example.profiles.filter((profile) => {
    const clientId = String(profile.oauth?.clientId || '').trim()
    return clientId && !known.has(clientId)
  })
  return extras.length ? [...current, ...extras] : current
}

function exampleClientsAlreadyApplied() {
  try {
    return localStorage.getItem(EXAMPLE_CLIENTS_KEY) === '1'
  } catch {
    return false
  }
}

function markExampleClientsApplied() {
  try {
    localStorage.setItem(EXAMPLE_CLIENTS_KEY, '1')
  } catch {
    // The browser can refuse storage; the example clients still loaded for this visit.
  }
}

function examplesAlreadyApplied() {
  try {
    return localStorage.getItem(EXAMPLES_SEEDED_KEY) === '1'
  } catch {
    return false
  }
}

function markExamplesApplied() {
  try {
    localStorage.setItem(EXAMPLES_SEEDED_KEY, '1')
  } catch {
    // The browser can refuse storage; the example files still loaded for this visit.
  }
}

function downloadText(filename, text, type) {
  const body = String(text).endsWith('\n') ? String(text) : `${text}\n`
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadJson(filename, data) {
  downloadText(filename, `${JSON.stringify(data, null, 2)}\n`, 'application/json')
}

function statusTone(code) {
  if (String(code).startsWith('2')) return { bg: '#e7f6f3', fg: '#0f766e' }
  if (String(code).startsWith('4')) return { bg: '#fdecec', fg: '#b42318' }
  if (String(code).startsWith('5')) return { bg: '#fef3e2', fg: '#b45309' }
  return { bg: '#f1f5f9', fg: '#334155' }
}

function ResponsePreview({ result, open }) {
  if (result.pages && result.pages.length > 1) {
    const headline = String(result.text || '').split('\n')[0]
    return (
      <Stack spacing={0.75}>
        <Typography variant="body2" color="text.secondary">{headline}</Typography>
        {open && result.pages.map((page) => (
          <Box key={`${page.label}-${page.status}`} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Typography variant="caption" sx={{ display: 'block', px: 1.25, py: 0.4, bgcolor: '#f8fafc', color: 'text.secondary', fontWeight: 700 }}>
              {page.label} · HTTP {page.status} · {page.count} records
            </Typography>
            <PayloadText text={page.text} open />
          </Box>
        ))}
      </Stack>
    )
  }
  return <PayloadText text={result.text} open={open} />
}

function PayloadText({ text, open }) {
  return (
    <Box sx={{
      whiteSpace: open ? 'pre' : 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.45,
      color: '#1e293b',
      bgcolor: open ? '#f8fafc' : 'transparent',
      borderRadius: 1,
      px: open ? 1 : 0,
      py: open ? 0.75 : 0,
      maxHeight: open ? 220 : 'none',
      overflow: open ? 'auto' : 'hidden',
    }}
    >
      {open ? text : truncate(text)}
    </Box>
  )
}

function formatRequestBody(body) {
  if (body == null || body === '') return ''
  if (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) return ''
  try {
    return JSON.stringify(body, null, 2)
  } catch {
    return String(body)
  }
}

function PaginationHelp({ pagination }) {
  const [anchor, setAnchor] = useState(null)
  return (
    <>
      <IconButton
        size="small"
        aria-label="How pagination is chosen"
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ color: 'text.secondary' }}
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: { xs: 320, sm: 460 }, p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>How list pages are followed</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {paginationSummary(pagination)} The tester reads the query parameters and the success response of the loaded operation. A name it does not recognize is sent only when you fill that sample.
          </Typography>
          <Stack spacing={1.25}>
            {PAGINATION_RULES.map((rule) => (
              <Box key={rule.title}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{rule.title}</Typography>
                <Typography variant="body2" color="text.secondary">{rule.detail}</Typography>
              </Box>
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Requests / second spaces every call, including each extra page. A run stops after 100 pages.
          </Typography>
        </Box>
      </Popover>
    </>
  )
}

const PAGINATION_RULES = [
  {
    title: 'Cursor',
    detail: 'Parameters named cursor, nextCursor, pageToken, nextPageToken, continuationToken, after, or startingAfter. The next request sends the cursor returned in the response until that value is empty.',
  },
  {
    title: 'Page',
    detail: 'Parameters named page, pageNumber, or pageIndex, usually with size, pageSize, limit, perPage, or maxResults. Pages continue while totalPages or hasMore says so, or until a page comes back short.',
  },
  {
    title: 'Offset',
    detail: 'Parameters named offset or skip. The next offset moves forward by the number of records in the page.',
  },
  {
    title: 'Link',
    detail: 'A response field named next or nextLink, or a Link header with rel="next". The tester requests that URL.',
  },
]

function paginationSummary(pagination) {
  if (!pagination) {
    return 'This operation has no recognized pagination parameter, so each check sends one request.'
  }
  if (pagination.style === 'cursor') {
    return `This operation is treated as cursor pagination via ${pagination.request.cursor}.`
  }
  if (pagination.style === 'offset') {
    return `This operation is treated as offset pagination via ${pagination.request.offset}${pagination.request.size ? ` and ${pagination.request.size}` : ''}.`
  }
  if (pagination.style === 'link') {
    return 'This operation is treated as link pagination.'
  }
  const names = [pagination.request.page, pagination.request.size].filter(Boolean).join(' and ')
  return `This operation is treated as page pagination${names ? ` via ${names}` : ''}.`
}

function fieldTypeLabel(field) {
  if (field.enum) return 'enum'
  if (field.format) return `${field.type} / ${field.format}`
  return field.type
}

function BoundaryChoices({ field, sample, onToggle }) {
  const choices = boundaryChoices(field)
  if (choices.length === 0) {
    const shown = sample === '' || sample == null ? 'empty' : valueText(sample)
    return <Typography variant="caption" color="text.secondary">Default {shown}</Typography>
  }
  return (
    <Stack direction="row" spacing={0.25} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {choices.map((choice) => (
        <FormControlLabel
          key={choice.id}
          sx={{ mr: 0.75 }}
          control={(
            <Checkbox
              size="small"
              checked={field.boundary?.[choice.id] !== false}
              onChange={(event) => onToggle(choice.id, event.target.checked)}
            />
          )}
          label={<Typography variant="caption">{choice.label}</Typography>}
        />
      ))}
    </Stack>
  )
}

function constraintLabels(field) {
  const labels = []
  const { constraints } = field
  if (constraints.minimum != null) labels.push(`min ${constraints.minimum}`)
  if (constraints.maximum != null) labels.push(`max ${constraints.maximum}`)
  if (constraints.minLength) labels.push(`minLen ${constraints.minLength}`)
  if (constraints.maxLength) labels.push(`maxLen ${constraints.maxLength}`)
  if (constraints.pattern) labels.push(constraints.pattern)
  if (field.values.length > 0 && field.type !== 'boolean') labels.push(`${field.values.length} values`)
  return labels
}

function SampleEditor({ field, onChange }) {
  if (field.type === 'boolean' || (field.values.length > 0 && field.type !== 'number' && field.type !== 'integer')) {
    const options = (field.values.length > 0 ? field.values : [false, true]).filter((option) => option != null && typeof option !== 'symbol')
    return (
      <TextField select size="small" fullWidth value={String(field.sample)} onChange={(event) => onChange(parseOption(event.target.value, options))}>
        {options.map((option) => (
          <MenuItem key={String(option)} value={String(option)}>{String(option)}</MenuItem>
        ))}
      </TextField>
    )
  }
  return (
    <TypedValue
      value={field.sample ?? ''}
      kinds={valueKinds(field)}
      format={field.format}
      placeholder={temporalPlaceholder(field.format)}
      onChange={(raw) => onChange(coerceSample(field, raw))}
    />
  )
}

const VALUE_KINDS = ['text', 'number', 'boolean', 'date', 'timestamp', 'uuid']

function valueKinds(field) {
  if (!field) return ['text']
  if (field.format === 'date') return ['date']
  if (field.format === 'date-time') return ['timestamp']
  if (field.type === 'boolean') return ['text', 'boolean']
  if (field.type === 'integer' || field.type === 'number') return ['text', 'number']
  if (field.type === 'string' && !(field.values?.length > 0)) return ['text', 'uuid']
  return ['text']
}

function temporalPlaceholder(format) {
  if (format === 'date') return 'YYYY-MM-DD'
  if (format === 'date-time') return 'YYYY-MM-DDThh:mm:ssZ'
  return ''
}

function LabeledValue({ label, children }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', columnGap: 1, alignItems: 'start' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textAlign: 'right', pt: '10px' }}>{label}</Typography>
      {children}
    </Box>
  )
}

function TypedValue({ value, onChange, kinds = ['text'], format = '', placeholder = '', helper = '' }) {
  const [draft, setDraft] = useState(null)
  useEffect(() => setDraft(null), [value])
  const text = draft ?? String(value ?? '')
  const shown = shownKind(text, kinds)
  const clock = parseClock(text)
  const uuid = parseUuid(text)
  const kind = format === 'date' ? 'date' : (format === 'date-time' ? 'timestamp' : '')
  const invalid = kind && draft == null && text !== '' && !acceptsTemporal(kind, text)
  const hint = invalid
    ? (kind === 'date' ? 'Use YYYY-MM-DD, ${today}, or ${name}' : 'Use a timestamp, ${now}, or ${name}')
    : helper
  const showClock = (shown === 'date' || shown === 'timestamp') && (text === '' || clock)
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px', columnGap: 0.75, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 0.75, minWidth: 0, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder={placeholder}
            value={text}
            error={Boolean(invalid)}
            onChange={(event) => editTemporal(kind, event.target.value, onChange, setDraft)}
            onBlur={() => setDraft(null)}
            slotProps={{ htmlInput: { 'aria-label': 'Value' } }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          {showClock && (
            <TextField
              size="small"
              type="number"
              value={clock?.amount ?? 0}
              onChange={(event) => onChange(clockToken(shown, event.target.value, shown === 'date' ? 'd' : (clock?.unit || 'h')))}
              slotProps={{
                input: { startAdornment: <DeltaAdornment>{shown === 'date' ? 'Days' : '±'}</DeltaAdornment> },
                htmlInput: { 'aria-label': shown === 'date' ? 'Days from today' : 'Time delta' },
              }}
              sx={{ width: shown === 'date' ? 108 : 84, flexShrink: 0 }}
            />
          )}
          {showClock && shown === 'timestamp' && (
            <TextField
              select
              size="small"
              value={clock?.unit || 'h'}
              onChange={(event) => onChange(clockToken('timestamp', clock?.amount || 0, event.target.value))}
              slotProps={{ select: { 'aria-label': 'Unit' } }}
              sx={{ width: 84, flexShrink: 0 }}
            >
              <MenuItem value="s">sec</MenuItem>
              <MenuItem value="m">min</MenuItem>
              <MenuItem value="h">hour</MenuItem>
              <MenuItem value="d">day</MenuItem>
            </TextField>
          )}
          {shown === 'uuid' && (
            <TextField
              size="small"
              type="number"
              placeholder="36"
              value={uuid?.length ?? ''}
              onChange={(event) => onChange(uuidToken(event.target.value))}
              slotProps={{
                input: { startAdornment: <DeltaAdornment>Len</DeltaAdornment> },
                htmlInput: { 'aria-label': 'UUID length', min: 1, max: 128 },
              }}
              sx={{ width: 108, flexShrink: 0 }}
            />
          )}
        </Box>
        <TextField
          select
          size="small"
          fullWidth
          disabled={kinds.length <= 1}
          value={shown}
          onChange={(event) => onChange(valueForKind(event.target.value, text))}
          slotProps={{ select: { 'aria-label': 'Type' } }}
        >
          {(kinds.length > 1 ? kinds : [shown]).map((kind) => <MenuItem key={kind} value={kind}>{kindLabel(kind)}</MenuItem>)}
        </TextField>
      </Box>
      {hint && <Typography variant="caption" color={invalid ? 'error' : 'text.secondary'}>{hint}</Typography>}
    </Box>
  )
}

function DeltaAdornment({ children }) {
  return (
    <InputAdornment position="start" sx={{ mr: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{children}</Typography>
    </InputAdornment>
  )
}

function editTemporal(kind, next, onChange, setDraft) {
  if (!kind) {
    setDraft(null)
    onChange(next)
    return
  }
  if (!temporalDraftOk(kind, next)) return
  if (next === '' || acceptsTemporal(kind, next)) {
    setDraft(null)
    onChange(next)
    return
  }
  setDraft(next)
}

function shownKind(text, kinds) {
  const active = dynamicKind(text)
  if (active && kinds.includes(active)) return active
  const inferred = inferredKind(text)
  if (kinds.includes(inferred)) return inferred
  return kinds[0] || 'text'
}

function inferredKind(value) {
  if (value === 'true' || value === 'false') return 'boolean'
  if (value !== '' && Number.isFinite(Number(value)) && String(Number(value)) === String(value).trim()) return 'number'
  return 'text'
}

function valueForKind(kind, current) {
  if (kind === 'date') return '${today}'
  if (kind === 'timestamp') return '${now}'
  if (kind === 'uuid') return '${uuid}'
  if (kind === 'boolean') return 'true'
  if (kind === 'number') return Number.isFinite(Number(current)) && String(current).trim() !== '' ? String(Number(current)) : '0'
  return dynamicKind(current) ? '' : String(current ?? '')
}

function kindLabel(kind) {
  if (kind === 'timestamp') return 'Timestamp'
  if (kind === 'uuid') return 'UUID'
  if (kind === 'date') return 'Date'
  if (kind === 'number') return 'Number'
  if (kind === 'boolean') return 'Boolean'
  return 'Text'
}

function parseOption(raw, options) {
  const match = options.find((option) => String(option) === raw)
  return match === undefined ? raw : match
}

function coerceSample(field, raw) {
  if (raw === '') return ''
  if (field.type === 'integer' || field.type === 'number') {
    const value = Number(raw)
    return Number.isFinite(value) ? value : raw
  }
  return raw
}

function truncate(text) {
  const oneLine = String(text || '').replace(/\s+/g, ' ')
  return oneLine.length > 180 ? `${oneLine.slice(0, 180)}…` : oneLine
}

async function executeCheck(baseUrl, operation, item, hooks) {
  const sent = {
    ...item,
    body: evaluateDynamics(item.body),
    query: evaluateDynamics(item.query),
    path: evaluateDynamics(item.path),
  }
  const pagination = operation.pagination
  const followPages = sent.expect?.outcome !== 'error' && sent.expect?.outcome !== 'custom' && pagination
  let query = followPages ? firstPageQuery(pagination, sent.query) : { ...sent.query }
  const request = { body: sent.body, query: { ...query }, path: sent.path }
  let url = null
  const reports = []
  let first = null
  while (reports.length < 100) {
    if (hooks.shouldStop()) {
      return null
    }
    await hooks.pace()
    if (hooks.shouldStop()) {
      return null
    }
    if (oauthMode(hooks.oauth) === 'on') hooks.onActivity('requesting access token')
    const response = await callOperation(baseUrl, operation, { ...sent, query }, url, hooks.headers, hooks.oauth)
    if (!first) {
      first = response
    }
    const body = parseJson(response.text)
    const items = readItems(body, pagination)
    const pageIndex = pagination ? readPath(body, pagination.response.page) : undefined
    reports.push({
      status: response.status,
      count: items.length,
      text: response.text,
      label: stepLabel(pagination, reports.length, pageIndex, query),
      pageIndex,
      offset: pagination?.request.offset ? Number(query[pagination.request.offset] ?? 0) : 0,
      cursor: pagination?.request.cursor ? query[pagination.request.cursor] : undefined,
    })
    const followed = followPages && response.status >= 200 && response.status < 300
    const step = followed ? planContinuation(pagination, query, body, reports, response.link) : null
    if (!step) {
      break
    }
    hooks.onActivity(step.label)
    query = step.query || query
    url = step.url || null
  }
  if (!first) return null
  if (reports.length <= 1) {
    return { ...first, request }
  }
  return {
    ...describeFetched(reports),
    request,
    pages: reports.map((report) => ({
      label: report.label,
      status: report.status,
      count: report.count,
      text: report.text,
    })),
  }
}

function stepLabel(pagination, index, pageIndex, query) {
  if (pagination?.style === 'cursor') {
    return index === 0 ? 'first page' : `cursor ${String(query[pagination.request.cursor] ?? '').slice(0, 24)}`
  }
  if (pagination?.style === 'offset') {
    return `offset ${query[pagination.request.offset] ?? 0}`
  }
  if (pagination?.style === 'page' && pageIndex != null && pageIndex !== '') {
    return `page ${pageIndex}`
  }
  return `page ${index + 1}`
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function requestHeaders(defaults) {
  const headers = {}
  for (const [name, value] of Object.entries(defaults?.headers || {})) {
    const resolved = String(evaluateDynamics(substitute(String(value), defaults.variables || {})) ?? '')
    if (!resolved.trim() || /\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(resolved) || /^Bearer\s*$/i.test(resolved)) continue
    headers[name] = resolved
  }
  return headers
}

async function callOperation(baseUrl, operation, item, urlOverride, extraHeaders, oauth) {
  let url
  if (urlOverride) {
    url = new URL(urlOverride, window.location.origin)
  } else {
    let path = operation.path
    for (const [name, value] of Object.entries(item.path)) {
      path = path.replace(`{${name}}`, encodeURIComponent(value))
    }
    url = new URL(joinUrl(baseUrl, path), window.location.origin)
    for (const [name, value] of Object.entries(item.query)) {
      url.searchParams.set(name, String(value))
    }
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...(extraHeaders || {}) }
  try {
    if (oauthMode(oauth) === 'on') {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'authorization') delete headers[key]
      }
      headers.Authorization = `Bearer ${await accessTokenFor(oauth)}`
    } else if (oauthMode(oauth) === 'incomplete') {
      return { status: 0, text: 'Fill the token URL, client ID, and key for this client before running checks.', link: null }
    }
    const method = operation.method
    const body = method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(item.body)
    if (shouldUseCa(url, oauth)) {
      return fetchWithCa(url, { method, headers, body, ca: oauth.caCert })
    }
    const response = await fetch(url, { method, headers, body })
    return { status: response.status, text: await response.text(), link: response.headers.get('link') }
  } catch (error) {
    return { status: 0, text: error.message || 'Request failed', link: null }
  }
}

function pretty(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}
