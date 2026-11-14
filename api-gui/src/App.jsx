import { useEffect, useMemo, useRef, useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
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
  Collapse,
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
  ListSubheader,
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
  individualChoices,
  individualIncluded,
  caseCount,
  isOmitted,
  casesFor,
  applyErrorOverrides,
  applyErrorRowToGroup,
  errorCheckKey,
  errorColumnDefault,
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
  operationGroups,
  OBJECT_EMPTY,
  OBJECT_FIELDS,
  OBJECT_NULL,
  objectChoice,
  parseSpecText,
  planContinuation,
  readItems,
  readPath,
  responseChecks,
  serverUrl,
  specGaps,
  scalarCombinationField,
  valueText,
  responsesForMode,
  withTextCombinationValues,
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
import { accessTokenFor, derivedAudience, oauthMode, relativeTokenPath } from './jwt'
import { listRuns, loadClientsFile, loadProxy, loadRun, loadSpecFile, saveClientsFile, saveProxy, saveRun, saveSpecFile } from './files'

const EXAMPLES_SEEDED_KEY = 'api-tester.examples-loaded'
const EXAMPLE_CLIENTS_KEY = 'api-tester.example-clients'
const PROXY_SPEC = '/api/v3/api-docs.yaml'

const MODES = [
  {
    id: 'combination',
    label: 'Combinations',
    detail: 'Crosses each selected enum. An optional enum includes null and omit, and a null already in the enum is listed once. An enum that is not crossed uses one selected value. A string or number uses its default plus any other values you add, and can include null and omit when it is optional. Other optional query filters stay off the request. Skip rules are left out. A check passes on a success status, and when each expected response value matches.',
  },
  {
    id: 'individual',
    label: 'Individual',
    detail: 'Each check changes one field. The value on the left is the default kept by every other field. Select the values to try. A check passes when validation accepts the value and the expected response values match.',
  },
  {
    id: 'error',
    label: 'Error',
    detail: 'Sends requests that should be rejected. A required field sent as null is a disallowed value. Choose the HTTP status, then add a column for each response field you want to compare. Use for all copies the values you set on one row to the rest of that category.',
  },
  {
    id: 'custom',
    label: 'Custom',
    detail: 'Runs the cases saved for this operation. Blank request fields use the defaults. A check passes on the HTTP status. A response field with an expected value uses that value. Any other field is compared with the same request field when that value was sent.',
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
  const [apiBase, setApiBase] = useState('http://localhost:8088')
  const [idpBase, setIdpBase] = useState('')
  const [proxyLoaded, setProxyLoaded] = useState(false)
  const [operations, setOperations] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [openTag, setOpenTag] = useState('')
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
  const activeMode = mode === 'boundary' ? 'individual' : mode
  const modeInfo = MODES.find((item) => item.id === activeMode)
  const resolvedFields = useMemo(() => {
    if (!selected) return []
    const applied = applyDefaults(fields, selected.id, defaults)
    if (activeMode !== 'combination') return applied
    return withTextCombinationValues(applied, customCases.values?.[selected.id], defaults.variables)
  }, [activeMode, customCases.values, defaults, fields, selected])
  const operationCases = selected ? customCases.operations[selected.id] : undefined
  const operationExclusions = selected ? customCases.exclusions?.[selected.id] : undefined
  const operationErrorCases = selected ? customCases.errors?.[selected.id] : undefined
  const operationErrorChecks = selected ? customCases.checks?.[selected.id] : undefined
  const builtCases = useMemo(
    () => (selected ? casesFor(activeMode, resolvedFields, resolveCases(operationCases || [], defaults.variables), {
      fieldsets: operationExclusions?.fieldsets || [],
      distinct: operationExclusions?.distinct || [],
      exclusive: selected.exclusive || [],
    }, operationErrorCases || []) : []),
    [activeMode, defaults.variables, operationCases, operationErrorCases, operationExclusions, resolvedFields, selected],
  )
  const planned = useMemo(
    () => applyErrorOverrides(builtCases, operationErrorChecks || {}),
    [builtCases, operationErrorChecks],
  )
  const skippedCombinations = activeMode === 'combination' && selected
    ? Math.max(0, caseCount(resolvedFields) - planned.length)
    : 0

  useEffect(() => {
    let cancelled = false
    loadProxy().then((saved) => {
      if (cancelled) return
      if (saved?.api) setApiBase(saved.api)
      if (typeof saved?.idp === 'string') setIdpBase(saved.idp)
      setProxyLoaded(true)
    }).catch(() => {
      if (!cancelled) setProxyLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!proxyLoaded) return undefined
    const timer = setTimeout(() => {
      saveProxy({ api: apiBase, idp: idpBase }).catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [proxyLoaded, apiBase, idpBase])

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
    setOpenTag('')
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
      const target = specThroughProxy(specUrl, apiBase)
      if (!target.base) throw new Error('Enter the backend base URL.')
      await saveProxy({ api: target.base, idp: idpBase })
      const response = await fetch(target.path, {
        headers: { 'x-tester-base': target.base, Accept: 'application/yaml, application/json, */*' },
      })
      const text = await response.text()
      if (response.status < 200 || response.status >= 300) {
        throw new Error(text || `The spec URL returned HTTP ${response.status}.`)
      }
      await applySpec(text, 'Loaded', { save: true })
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

  function writeObject(field, mode) {
    const globalMode = objectChoice(defaults.global?.[field.name])
    if (mode === 'fields' && globalMode === 'fields') {
      writeEndpoint(field, '', true)
      return
    }
    const raw = mode === 'null' ? OBJECT_NULL : mode === 'empty' ? OBJECT_EMPTY : OBJECT_FIELDS
    writeEndpoint(field, raw)
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
      return { ...current, operations }
    })
  }

  function writeErrorCases(operationId, list) {
    setCustomCases((current) => {
      const errors = { ...(current.errors || {}) }
      if (list.length === 0) delete errors[operationId]
      else errors[operationId] = list
      return { ...current, errors }
    })
  }

  function writeErrorChecks(operationId, next) {
    setCustomCases((current) => {
      const checks = { ...(current.checks || {}) }
      const columns = Array.isArray(next?.columns) ? next.columns : ['exceptions[].code']
      const rows = next?.rows && typeof next.rows === 'object' ? next.rows : {}
      const untouched = columns.length === 1 && columns[0] === 'exceptions[].code' && Object.keys(rows).length === 0
      if (untouched) delete checks[operationId]
      else checks[operationId] = { columns, rows }
      return { ...current, checks }
    })
  }

  function writeCombinationValues(operationId, fieldName, list) {
    setCustomCases((current) => {
      const values = { ...(current.values || {}) }
      const operation = { ...(values[operationId] || {}) }
      const next = []
      for (const item of list || []) {
        const text = String(item ?? '').trim()
        if (!text || next.includes(text)) continue
        next.push(text)
      }
      if (next.length === 0) delete operation[fieldName]
      else operation[fieldName] = next
      if (Object.keys(operation).length === 0) delete values[operationId]
      else values[operationId] = operation
      return { ...current, values }
    })
  }

  function writeExclusions(operationId, exclusion) {
    setCustomCases((current) => {
      const exclusions = { ...(current.exclusions || {}) }
      const fieldsets = exclusion.fieldsets || []
      const distinct = exclusion.distinct || []
      if (fieldsets.length === 0 && distinct.length === 0) delete exclusions[operationId]
      else exclusions[operationId] = { fieldsets, distinct }
      return { ...current, exclusions }
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
    if (!selected || planned.length === 0) {
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
    try {
      await saveProxy({ api: apiBase, idp: idpBase })
    } catch (error) {
      setRunning(false)
      setFileNotice(error.message || 'Could not prepare the proxy.')
      return
    }
    const next = []
    for (let index = 0; index < cases.length; index += 1) {
      if (stopRef.current) {
        break
      }
      const item = cases[index]
      const response = await executeCheck(apiBase, idpBase, selected, item, {
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
        expectations: responseChecks(responsesForMode(selected.responses, activeMode), new Set(fields.map((field) => field.name)), defaults.responses?.[selected.id]),
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
        ...(response.records?.length ? { records: response.records } : {}),
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
          baseUrl: apiBase,
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
              Setting
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
              <TextField
                label="Backend base URL"
                value={apiBase}
                placeholder="http://localhost:8088"
                onChange={(event) => setApiBase(event.target.value)}
                fullWidth
              />
              <Typography variant="caption" color="text.secondary">
                API calls use /api on this page. The tester forwards them to this base URL. HTTPS certificate checks are skipped.
              </Typography>
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
              {operationGroups(operations).map((group) => {
                const open = openTag === group.tag
                return (
                  <Box key={group.tag} component="li" sx={{ display: 'block' }}>
                    <ListItemButton
                      onClick={() => setOpenTag(open ? '' : group.tag)}
                      aria-expanded={open}
                      sx={{ py: 0.75, bgcolor: '#f8fafc', borderBottom: 1, borderColor: 'divider' }}
                    >
                      <ExpandMoreIcon sx={{ mr: 0.75, color: 'text.secondary', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 120ms' }} />
                      <ListItemText
                        primary={group.tag}
                        slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 700, color: 'text.secondary' } } }}
                      />
                      <Chip size="small" label={group.operations.length} variant="outlined" />
                    </ListItemButton>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                      <List dense disablePadding component="div">
                        {group.operations.map((operation) => (
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
                      </List>
                    </Collapse>
                  </Box>
                )
              })}
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
                  key={`${selected.id}-${activeMode}`}
                  responses={responsesForMode(selected.responses, activeMode)}
                  requestNames={new Set(fields.map((field) => field.name))}
                  expected={defaults.responses?.[selected.id] || {}}
                  onExpected={(status, name, raw) => writeResponseExpected(selected.id, status, name, raw)}
                />

                <Stack spacing={1}>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={activeMode}
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

                {activeMode === 'custom' ? (
                  <CustomCases
                    operation={selected}
                    fields={fields}
                    defaults={defaults}
                    exclusive={selected.exclusive || []}
                    responses={selected.responses || []}
                    cases={operationCases || []}
                    onChange={(list) => writeCases(selected.id, list)}
                    onExport={() => downloadJson('custom-cases.json', casesDocument(customCases))}
                    onImport={(file) => importLibrary(file, 'cases')}
                  />
                ) : activeMode === 'error' ? (
                  <ErrorCases
                    fields={resolvedFields}
                    responses={responsesForMode(selected.responses, 'error')}
                    cases={builtCases.filter((item) => item.group !== 'custom')}
                    checks={operationErrorChecks || {}}
                    onChecks={(next) => writeErrorChecks(selected.id, next)}
                    custom={operationErrorCases || []}
                    onChange={(list) => writeErrorCases(selected.id, list)}
                  />
                ) : (
                <Box sx={{ overflow: 'auto', maxHeight: 'min(440px, calc(100vh - 420px))', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHead>
                      {activeMode === 'individual' ? (
                        <TableRow>
                          <TableCell sx={{ width: 210 }}>Field</TableCell>
                          <TableCell sx={{ width: 240 }}>Default</TableCell>
                          <TableCell>Try</TableCell>
                        </TableRow>
                      ) : (
                        <TableRow>
                          <TableCell sx={{ width: 48 }}>Vary</TableCell>
                          <TableCell sx={{ width: activeMode === 'combination' ? 210 : 220 }}>Field</TableCell>
                          {activeMode !== 'combination' && <TableCell sx={{ width: 76 }}>Type</TableCell>}
                          {activeMode !== 'combination' && <TableCell sx={{ width: 120 }}>Constraints</TableCell>}
                          <TableCell sx={{ width: activeMode === 'combination' ? 240 : undefined }}>{activeMode === 'combination' ? 'Default' : 'Sample'}</TableCell>
                          {activeMode === 'combination' && <TableCell>Values</TableCell>}
                        </TableRow>
                      )}
                    </TableHead>
                    <TableBody>
                      {fields.map((field) => {
                        const resolved = resolvedFields.find((item) => item.location === field.location && item.name === field.name) || field
                        if (hiddenByObject(field, resolvedFields)) return null
                        const source = sampleSource(field, selected.id, defaults)
                        const depth = field.name.split('.').length - 1
                        const individualField = { ...resolved, individual: field.individual }
                        const toggleIndividual = (id, checked) => updateField(field.name, { individual: { ...(field.individual || {}), [id]: checked } })
                        if (activeMode === 'individual') {
                          return (
                            <TableRow key={`${field.location}-${field.name}`} hover>
                              <TableCell>
                                <FieldSummary field={field} depth={depth} exclusive={selected.exclusive} />
                              </TableCell>
                              <TableCell>
                                <DefaultValue
                                  field={field}
                                  resolved={resolved}
                                  source={source}
                                  onChange={(sample) => writeEndpoint(field, sample)}
                                  onInherit={() => writeEndpoint(field, '', true)}
                                  onObject={(next) => writeObject(field, next)}
                                />
                              </TableCell>
                              <TableCell>
                                <IndividualChoices field={individualField} onToggle={toggleIndividual} />
                              </TableCell>
                            </TableRow>
                          )
                        }
                        return (
                        <TableRow key={`${field.location}-${field.name}`} hover>
                          <TableCell>
                            <FormControlLabel
                              sx={{ mr: 0 }}
                              control={(
                                <Checkbox
                                  size="small"
                                  checked={resolved.vary}
                                  disabled={activeMode !== 'combination' || resolved.values.length === 0}
                                  onChange={(event) => updateField(field.name, { vary: event.target.checked, textVary: event.target.checked })}
                                />
                              )}
                              label={resolved.values.length > 1 ? String(resolved.values.length) : ''}
                            />
                          </TableCell>
                          <TableCell>
                            <FieldSummary field={field} depth={depth} exclusive={selected.exclusive} />
                          </TableCell>
                          {activeMode !== 'combination' && (
                            <TableCell sx={{ color: 'text.secondary' }}>
                              {fieldTypeLabel(field)}
                            </TableCell>
                          )}
                          {activeMode !== 'combination' && (
                            <TableCell>
                              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                {constraintLabels(field).map((label) => (
                                  <Chip key={label} label={label} size="small" variant="outlined" sx={{ fontWeight: 500 }} />
                                ))}
                              </Stack>
                            </TableCell>
                          )}
                          <TableCell>
                            <DefaultValue
                              field={field}
                              resolved={resolved}
                              source={source}
                              hidden={field.enum && resolved.vary}
                              onChange={(sample) => writeEndpoint(field, sample)}
                              onInherit={() => writeEndpoint(field, '', true)}
                              onObject={(next) => writeObject(field, next)}
                            />
                          </TableCell>
                          {activeMode === 'combination' && (
                            <TableCell>
                              {field.enum && resolved.vary ? (
                                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                                  {resolved.values.map((value, index) => <Chip key={`${valueText(value)}-${index}`} label={loopLabel(value)} size="small" />)}
                                </Stack>
                              ) : scalarCombinationField(field) ? (
                                <CombinationValuesEditor
                                  field={resolved}
                                  values={customCases.values?.[selected.id]?.[field.name] || []}
                                  onChange={(list) => writeCombinationValues(selected.id, field.name, list)}
                                />
                              ) : null}
                            </TableCell>
                          )}
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Box>
                )}

                {activeMode === 'combination' && selected && (
                  <CombinationExclusions
                    key={selected.id}
                    fields={resolvedFields}
                    exclusive={selected.exclusive || []}
                    value={operationExclusions}
                    onChange={(next) => writeExclusions(selected.id, next)}
                  />
                )}

                <Stack spacing={1}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                    <Button
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      disabled={running || planned.length === 0}
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
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {planned.length === 0 && skippedCombinations > 0
                          ? 'Every combination is excluded.'
                          : planned.length === 0
                            ? 'This operation has no checks in the selected mode.'
                            : running
                              ? `${results.length} of ${planned.length} complete${activity ? ` · ${activity}` : ''}`
                              : `List checks follow the spec. Requests stay within this rate.${skippedCombinations > 0 ? ` ${skippedCombinations} combinations skipped.` : ''}`}
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
            idpBase={idpBase}
            onIdpBase={setIdpBase}
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
                          {openResult === result.index && result.request && <PayloadText text={result.request} open />}
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

function ResponseSchema({ responses, requestNames, expected, onExpected }) {
  const preferred = responses.find((item) => item.status === '200') || responses.find((item) => String(item.status).startsWith('2')) || responses[0]
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(preferred ? preferred.status : '')
  const current = responses.find((item) => item.status === status) || preferred
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
        {responses.length === 0 && (
          <Typography variant="caption" color="text.secondary">None for this category.</Typography>
        )}
        {responses.map((item) => {
          const tone = statusTone(item.status)
          const selectedStatus = current && item.status === current.status
          return (
            <Box
              key={item.status}
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
                borderRadius: 1,
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
          )
        })}
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
                {'@{name}'} is the value sent for that request field. Text is compared after leading and trailing spaces are removed, and a value that is only spaces is null. A success field with the same name starts as that reference. Clear a value to skip it. {'${name}'} still reads a variable. For an array of objects, enter a JSON array. Each object must appear, and only the fields you include are compared. In sequence requires those objects to be the first items, in the order you wrote.
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
                    const parent = field.type === 'object' || String(field.type).startsWith('array')
                    const scalar = !parent
                    const depth = field.name.split('.').length - 1
                    const automatic = defaultResponseExpected(field, requestNames, current.status)
                    const stored = expected?.[current.status]
                    const hasOverride = stored && Object.prototype.hasOwnProperty.call(stored, field.name)
                    const storedEntry = hasOverride ? readExpectation(stored[field.name]) : { text: automatic, ordered: false }
                    const shown = storedEntry.text
                    const ordered = storedEntry.ordered
                    const objectArrayError = objectArray ? parseObjectArray(shown)?.error : ''
                    return (
                      <TableRow key={field.name} hover>
                        <TableCell>
                          <Typography
                            variant="body2"
                            title={field.name}
                            sx={{ fontWeight: parent ? 700 : 500, pl: depth * 1.5 }}
                          >
                            {field.name.split('.').pop()}
                          </Typography>
                        </TableCell>
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

const ERROR_STATUSES = ['400', '401', '403', '404', '409', '415', '422', '429', '500']
const DEFAULT_ERROR_COLUMN = 'exceptions[].code'

function errorStatusOptions(current) {
  const statuses = [...ERROR_STATUSES]
  const value = String(current || '')
  if (value && !statuses.includes(value)) statuses.unshift(value)
  return statuses
}

function errorResponseFields(views) {
  const names = []
  for (const view of views || []) {
    if (/^2/.test(String(view.status))) continue
    for (const field of view.fields || []) {
      if (!field?.name || names.includes(field.name)) continue
      const type = String(field.type || '')
      if (type === 'object' || type.startsWith('array')) continue
      names.push(field.name)
    }
  }
  for (const name of ['status', 'exceptions[].field', 'exceptions[].code', 'exceptions[].message']) {
    if (!names.includes(name)) names.push(name)
  }
  return names
}

function nextErrorColumn(columns, fields) {
  const preferred = ['exceptions[].code', 'exceptions[].message', 'exceptions[].field', 'status']
  return [...preferred, ...fields].find((name) => name && !columns.includes(name)) || ''
}

function customResponseFields(views) {
  const content = []
  const error = []
  const objectArrays = new Set()
  const seen = new Set()
  const add = (list, field) => {
    if (!field?.name || seen.has(field.name)) return
    const type = String(field.type || '')
    if (type === 'object') return
    if (type.startsWith('array')) {
      if (!isArrayOfObjects(field)) return
      objectArrays.add(field.name)
    }
    seen.add(field.name)
    list.push(field.name)
  }
  for (const view of views || []) {
    const list = /^[45]/.test(String(view.status)) ? error : content
    for (const field of view.fields || []) add(list, field)
  }
  for (const name of ['exceptions[].field', 'exceptions[].code', 'exceptions[].message', 'status']) {
    if (seen.has(name)) continue
    seen.add(name)
    error.push(name)
  }
  return { content, error, objectArrays }
}

function nextCustomField(used, content, error, status) {
  const preferred = /^[45]/.test(String(status)) ? [...error, ...content] : [...content, ...error]
  return preferred.find((name) => name && !used.has(name)) || ''
}

function ErrorCases({ fields, responses, cases, checks, onChecks, custom, onChange }) {
  const responseFields = errorResponseFields(responses)
  const columns = Array.isArray(checks.columns) ? checks.columns : [DEFAULT_ERROR_COLUMN]
  const rows = checks.rows && typeof checks.rows === 'object' ? checks.rows : {}
  const groups = [
    ['malformed', 'Malformed JSON', 'The body cannot be read.'],
    ['missing', 'Missing fields', 'A required field is left out. Text expects NotBlank. Other fields expect NotNull.'],
    ['disallowed', 'Disallowed value', 'A required field is null, or the value is outside the enum, pattern, length, or numeric range. Null expects NotNull.'],
    ['type', 'Invalid data type', 'A number, boolean, date, or timestamp is sent in the wrong form.'],
  ]
  const publish = (nextColumns, nextRows) => onChecks({ columns: nextColumns, rows: nextRows })
  const changeColumn = (index, name) => {
    const previous = columns[index]
    if (!name || name === previous || columns.includes(name)) return
    const nextColumns = columns.map((column, columnIndex) => (columnIndex === index ? name : column))
    const nextRows = {}
    for (const [key, row] of Object.entries(rows)) {
      const values = { ...(row.values || {}) }
      if (Object.prototype.hasOwnProperty.call(values, previous)) {
        values[name] = values[previous]
        delete values[previous]
      }
      nextRows[key] = { ...row, values }
    }
    publish(nextColumns, nextRows)
  }
  const addColumn = () => {
    const name = nextErrorColumn(columns, responseFields)
    if (name) publish([...columns, name], rows)
  }
  const removeColumn = (index) => {
    const name = columns[index]
    const nextRows = {}
    for (const [key, row] of Object.entries(rows)) {
      const values = { ...(row.values || {}) }
      delete values[name]
      const next = { ...row, values }
      if (next.status || Object.keys(values).length > 0) nextRows[key] = next
    }
    publish(columns.filter((_, columnIndex) => columnIndex !== index), nextRows)
  }
  const commit = (row, patch) => {
    const key = errorCheckKey(row)
    const saved = rows[key] || {}
    const status = patch.status ?? (saved.status || String(row.expect?.status || 400))
    const values = { ...(saved.values || {}) }
    if (patch.column) values[patch.column] = patch.value
    const baseline = String(row.expect?.status || 400)
    const stored = {}
    for (const column of columns) {
      const value = Object.prototype.hasOwnProperty.call(values, column) ? values[column] : errorColumnDefault(row, column)
      if (value !== errorColumnDefault(row, column)) stored[column] = value
    }
    const nextRows = { ...rows }
    if (status !== baseline || Object.keys(stored).length > 0) nextRows[key] = { ...(status !== baseline ? { status } : {}), values: stored }
    else delete nextRows[key]
    publish(columns, nextRows)
  }
  const applyCategory = (row) => publish(columns, applyErrorRowToGroup(rows, cases, row))
  return (
    <Stack spacing={2}>
      <Typography variant="caption" color="text.secondary">
        Choose the HTTP status. Each other column is a response field: select it in the header, and type the expected value in the row. Use for all copies the values set on that row to every other check in the category. @{'{field}'} is the field this check sends, and @{'{name}'} is a value sent on the request.
      </Typography>
      {groups.map(([id, title, detail]) => {
        const groupRows = cases.filter((item) => item.group === id)
        return (
          <Box key={id}>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="caption" color="text.secondary">{detail}</Typography>
            {groupRows.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>No checks for this operation.</Typography>
            ) : (
              <ErrorTable
                rows={groupRows}
                columns={columns}
                saved={rows}
                responseFields={responseFields}
                onColumn={changeColumn}
                onAdd={addColumn}
                onRemove={removeColumn}
                onCommit={commit}
                onApply={applyCategory}
              />
            )}
          </Box>
        )
      })}
      <CustomErrorEditor fields={fields} columns={columns} cases={custom} onChange={onChange} />
    </Stack>
  )
}

function ErrorTable({ rows, columns, saved, responseFields, onColumn, onAdd, onRemove, onCommit, onApply }) {
  const unused = nextErrorColumn(columns, responseFields)
  return (
    <Box sx={{ overflow: 'auto' }}>
      <Table size="small" sx={{ mt: 0.5 }}>
        <TableHead>
          <TableRow>
            <TableCell>Check</TableCell>
            <TableCell sx={{ width: 108 }}>Status</TableCell>
            {columns.map((column, index) => (
              <TableCell key={`${column}-${index}`} sx={{ minWidth: 180 }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <TextField select size="small" value={column} onChange={(event) => onColumn(index, event.target.value)} sx={{ minWidth: 160, flex: 1 }}>
                    {responseFields.map((name) => (
                      <MenuItem key={name} value={name} disabled={columns.includes(name) && name !== column}>{name}</MenuItem>
                    ))}
                  </TextField>
                  <IconButton size="small" aria-label="Remove column" onClick={() => onRemove(index)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </TableCell>
            ))}
            <TableCell sx={{ width: 118 }}>
              <Button size="small" onClick={onAdd} disabled={!unused}>Add</Button>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const key = errorCheckKey(row)
            const rowSaved = saved[key] || {}
            const status = rowSaved.status || String(row.expect?.status || 400)
            return (
              <TableRow key={key}>
                <TableCell>
                  <Typography variant="body2">{row.label}</Typography>
                </TableCell>
                <TableCell>
                  <TextField select size="small" value={status} onChange={(event) => onCommit(row, { status: event.target.value })} sx={{ width: 96 }}>
                    {errorStatusOptions(status).map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                  </TextField>
                </TableCell>
                {columns.map((column) => {
                  const values = rowSaved.values || {}
                  const value = Object.prototype.hasOwnProperty.call(values, column) ? values[column] : errorColumnDefault(row, column)
                  return (
                    <TableCell key={column}>
                      <TextField
                        size="small"
                        placeholder="Expected"
                        value={value}
                        onChange={(event) => onCommit(row, { column, value: event.target.value })}
                        sx={{ width: '100%', minWidth: 120 }}
                      />
                    </TableCell>
                  )
                })}
                <TableCell>
                  <Button
                    size="small"
                    color="inherit"
                    disabled={!rowSaved.status && Object.keys(rowSaved.values || {}).length === 0}
                    onClick={() => onApply(row)}
                    sx={{ minWidth: 0, px: 0.5, whiteSpace: 'nowrap' }}
                  >
                    Use for all
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

function customExpected(item, column) {
  if (item.values && Object.prototype.hasOwnProperty.call(item.values, column)) return item.values[column]
  if (column === 'exceptions[].code') return item.code || ''
  if (column === 'exceptions[].message') return item.message || ''
  return ''
}

function CustomErrorEditor({ fields, columns, cases, onChange }) {
  const [draft, setDraft] = useState({ name: '', status: '400', field: 'body', value: '', omit: false })
  const names = []
  for (const field of fields || []) {
    if (field?.name && !names.includes(field.name)) names.push(field.name)
  }
  if (!names.includes('body')) names.push('body')
  const updateCase = (id, patch) => onChange(cases.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const updateValue = (item, column, value) => {
    const values = { ...(item.values || {}) }
    if (column === 'exceptions[].code' && !item.values && item.code) values['exceptions[].code'] = item.code
    if (column === 'exceptions[].message' && !item.values && item.message) values['exceptions[].message'] = item.message
    values[column] = value
    updateCase(item.id, { values, code: '', message: '' })
  }
  const add = () => {
    const name = draft.name.trim() || 'Custom error'
    onChange([...cases, {
      id: globalThis.crypto?.randomUUID?.() || `error-${Date.now()}`,
      name,
      status: String(draft.status || '400'),
      field: draft.field,
      code: '',
      message: '',
      values: {},
      value: draft.value,
      omit: draft.field !== 'body' && draft.field !== '' && draft.omit,
    }])
    setDraft({ name: '', status: '400', field: draft.field, value: '', omit: false })
  }
  return (
    <Box>
      <Typography variant="subtitle2">Custom</Typography>
      <Typography variant="caption" color="text.secondary">The send field is the request field this check changes. Expected values go in the response columns.</Typography>
      {cases.length > 0 && (
        <Box sx={{ overflow: 'auto' }}>
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>Check</TableCell>
                <TableCell sx={{ width: 108 }}>Status</TableCell>
                {columns.map((column) => <TableCell key={column}>{column}</TableCell>)}
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {cases.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="body2">{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.omit ? `${item.field} omitted` : item.field || 'body'}</Typography>
                  </TableCell>
                  <TableCell>
                    <TextField select size="small" value={item.status || '400'} onChange={(event) => updateCase(item.id, { status: event.target.value })} sx={{ width: 96 }}>
                      {errorStatusOptions(item.status).map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell key={column}>
                      <TextField size="small" placeholder="Expected" value={customExpected(item, column)} onChange={(event) => updateValue(item, column, event.target.value)} sx={{ width: '100%', minWidth: 120 }} />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button size="small" color="inherit" onClick={() => onChange(cases.filter((candidate) => candidate.id !== item.id))} sx={{ minWidth: 0, px: 0.5 }}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap', mt: 1 }}>
        <TextField size="small" label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} sx={{ width: 150 }} />
        <TextField select size="small" label="Status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} sx={{ width: 110 }}>
          {errorStatusOptions(draft.status).map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Send field" value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value, omit: false })} sx={{ width: 170 }}>
          <MenuItem value="">Any</MenuItem>
          {names.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
        <TextField size="small" label={draft.field === 'body' ? 'Body text' : 'Value'} value={draft.value} disabled={draft.omit && draft.field !== 'body'} onChange={(event) => setDraft({ ...draft, value: event.target.value })} sx={{ width: 160 }} />
        {draft.field !== 'body' && draft.field !== '' && (
          <FormControlLabel
            control={<Checkbox size="small" checked={draft.omit} onChange={(event) => setDraft({ ...draft, omit: event.target.checked })} />}
            label="Omit"
          />
        )}
        <Button size="small" variant="outlined" onClick={add}>Add</Button>
      </Stack>
    </Box>
  )
}

function CustomExpected({ responses, status, fields, onChange }) {
  const { content, error, objectArrays } = customResponseFields(responses)
  const used = new Set(fields.map((field) => field.path))
  const next = nextCustomField(used, content, error, status)
  const write = (index, patch) => onChange(fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)))
  const optionsFor = (current) => {
    const known = new Set([...content, ...error])
    const extra = current && !known.has(current) ? [current] : []
    return { content: [...extra.filter((name) => !error.includes(name) && !content.includes(name)), ...content], error }
  }
  return (
    <Box>
      <Typography variant="subtitle2">Expected response</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        Add a field from the error, such as exceptions[].code, or from the content that comes back. {'@{name}'} is the value sent for that request field. Several exceptions[] fields must match the same exception. A field you leave out is compared with the same request field when that value was sent.
      </Typography>
      {fields.length > 0 && (
        <Box sx={{ overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 220 }}>Response field</TableCell>
                <TableCell>Expected</TableCell>
                <TableCell sx={{ width: 72 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field, index) => {
                const options = optionsFor(field.path)
                const objectArray = objectArrays.has(field.path)
                const arrayError = objectArray ? parseObjectArray(field.equals)?.error : ''
                return (
                  <TableRow key={`${field.path}-${index}`}>
                    <TableCell>
                      <TextField select size="small" value={field.path} onChange={(event) => write(index, { path: event.target.value })} sx={{ width: '100%', minWidth: 180 }}>
                        {options.content.length > 0 && <ListSubheader>Returned content</ListSubheader>}
                        {options.content.map((name) => (
                          <MenuItem key={name} value={name} disabled={used.has(name) && name !== field.path}>{name}</MenuItem>
                        ))}
                        {options.error.length > 0 && <ListSubheader>Error</ListSubheader>}
                        {options.error.map((name) => (
                          <MenuItem key={name} value={name} disabled={used.has(name) && name !== field.path}>{name}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <TextField
                          size="small"
                          fullWidth
                          multiline={objectArray}
                          minRows={objectArray ? 2 : undefined}
                          placeholder={objectArray ? '[{"field":"quantity"}]' : '@{name}'}
                          value={field.equals || ''}
                          error={Boolean(arrayError)}
                          helperText={arrayError || undefined}
                          onChange={(event) => write(index, { equals: event.target.value })}
                          sx={{ '& input, & textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
                        />
                        {objectArray && (
                          <FormControlLabel
                            control={<Checkbox size="small" checked={Boolean(field.ordered)} onChange={(event) => write(index, { ordered: event.target.checked || undefined })} />}
                            label="In sequence"
                            sx={{ ml: 0, mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12.5 } }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Button size="small" color="inherit" onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))} sx={{ minWidth: 0, px: 0.5 }}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}
      <Button size="small" sx={{ mt: 0.75 }} disabled={!next} onClick={() => onChange([...fields, { path: next, equals: '' }])}>
        Add field
      </Button>
    </Box>
  )
}

function CustomCases({ operation, fields, defaults, exclusive = [], responses = [], cases, onChange, onExport, onImport }) {
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
                      if (customAncestorClosed(field.name, fields, active, defaults, operation)) return null
                      const omitted = (active.omit || []).includes(field.name)
                      const hasValue = Object.prototype.hasOwnProperty.call(active.request || {}, field.name)
                      const inherited = effectiveSample(field, operation.id, defaults)
                      const depth = field.name.split('.').length - 1
                      return (
                        <TableRow key={`${field.location}-${field.name}`}>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', pl: depth * 1.5 }}>
                              <Typography variant="body2" sx={{ fontWeight: field.object ? 700 : 500 }}>{field.name.split('.').pop()}</Typography>
                              {depth === 0 && <ToneChip label={field.location} tone={LOCATION_TONE[field.location]} />}
                              <ExclusiveMark name={field.name} groups={exclusive} />
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ minWidth: 180 }}>
                            {field.object ? (
                              <ObjectChoice
                                value={objectChoice(hasValue ? active.request[field.name] : inherited)}
                                onChange={(mode) => updateRequest(field.name, mode === 'null' ? OBJECT_NULL : mode === 'empty' ? OBJECT_EMPTY : OBJECT_FIELDS, field)}
                              />
                            ) : (
                            <TextField
                              size="small"
                              fullWidth
                              disabled={omitted}
                              placeholder={omitted ? 'Omitted' : String(inherited ?? '')}
                              value={hasValue ? String(active.request[field.name]) : ''}
                              onChange={(event) => updateRequest(field.name, event.target.value, field)}
                            />
                            )}
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
            <CustomExpected
              responses={responses}
              status={active.expect?.status || ''}
              fields={active.expect?.fields || []}
              onChange={(next) => update({ expect: { ...active.expect, fields: next } })}
            />
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
  idpBase,
  onIdpBase,
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
      <DialogTitle sx={{ pb: 0.5 }}>Setting</DialogTitle>
      <DialogContent sx={{ minHeight: 0, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Each client has its own variables, defaults, custom cases, and signing key. Switch clients from the menu in the top bar. Write ${'{'}name{'}'} for a variable. Date, timestamp, and UUID values are filled when the request is sent: ${'{'}today+1d{'}'}, ${'{'}now-2h{'}'}, ${'{'}uuid:12{'}'}.
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
        <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Access token</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Before every HTTP request, the tester signs a client assertion with this key and requests an access token through /idp, then sends it as Authorization: Bearer. Token calls use /idp on this page and are forwarded to the OAuth base URL. The token path is the path on that server. Audience is the base URL plus that path. HTTPS certificate checks are skipped. Leave the token path blank to call the API without a token.
        </Typography>
        <TextField
          label="OAuth base URL"
          value={idpBase}
          placeholder="https://idp.example"
          onChange={(event) => {
            const next = event.target.value
            onIdpBase(next)
            onOauth({ audience: derivedAudience(oauth.tokenUrl, next) })
          }}
          fullWidth
          sx={{ mb: 1.25 }}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
          <TextField
            label="Token path"
            placeholder="/oauth/token"
            value={relativeTokenPath(oauth.tokenUrl)}
            onChange={(event) => {
              const tokenUrl = relativeTokenPath(event.target.value)
              onOauth({ tokenUrl, audience: derivedAudience(tokenUrl, idpBase) })
            }}
            fullWidth
          />
          <TextField label="Client ID" value={oauth.clientId} onChange={(event) => onOauth({ clientId: event.target.value })} fullWidth />
          <TextField
            label="Audience"
            placeholder="OAuth base URL + token path"
            value={oauth.audience || derivedAudience(oauth.tokenUrl, idpBase)}
            onChange={(event) => onOauth({ audience: event.target.value })}
            helperText="OAuth base URL + token path"
            fullWidth
          />
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
          A global value is used wherever that field name appears. A value for this endpoint replaces it. Every variable and every global default is listed under Setting. Write ${'{'}name{'}'} to use a variable, ${'{'}today+1d{'}'} or ${'{'}now-2h{'}'} for a moving date or timestamp, and ${'{'}uuid:12{'}'} for a random id.
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
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', pl: (field.name.split('.').length - 1) * 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: field.object ? 700 : 650 }}>{field.name.split('.').pop()}</Typography>
                    {field.name.split('.').length === 1 && <ToneChip label={field.location} tone={LOCATION_TONE[field.location]} />}
                  </Stack>
                  <Stack spacing={0.75}>
                    {field.object ? (
                      <>
                        <LabeledValue label="Global">
                          <ObjectChoice
                            value={objectChoice(hasGlobal ? defaults.global[field.name] : '')}
                            onChange={(mode) => onGlobal(field, mode === 'fields' ? '' : mode === 'null' ? OBJECT_NULL : OBJECT_EMPTY)}
                          />
                        </LabeledValue>
                        <LabeledValue label="Endpoint">
                          <ObjectChoice
                            value={objectChoice(hasEndpoint ? endpoint[field.name] : '')}
                            onChange={(mode) => {
                              const inherit = mode === 'fields' && objectChoice(hasGlobal ? defaults.global[field.name] : '') === 'fields'
                              const raw = mode === 'null' ? OBJECT_NULL : mode === 'empty' ? OBJECT_EMPTY : OBJECT_FIELDS
                              onEndpoint(field, inherit ? '' : raw, inherit)
                            }}
                          />
                        </LabeledValue>
                      </>
                    ) : (
                    <>
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
                    </>
                    )}
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

function CombinationExclusions({ fields, exclusive, value, onChange }) {
  const rules = value || { fieldsets: [], distinct: [] }
  const choices = fields.filter((field) => !field.object)
  const [editingId, setEditingId] = useState('')
  function update(next) {
    onChange({ fieldsets: next.fieldsets || [], distinct: next.distinct || [] })
  }
  function addFieldset() {
    const rule = newFieldset(choices)
    setEditingId(rule.id)
    update({ ...rules, fieldsets: [...rules.fieldsets, rule] })
  }
  function addDistinct() {
    const rule = newDistinct(choices)
    setEditingId(rule.id)
    update({ ...rules, distinct: [...rules.distinct, rule] })
  }
  return (
    <Stack spacing={0.75} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 1 }}>
      <Typography variant="subtitle2">Skip combinations</Typography>
      {exclusive.map((group) => (
        <RuleSummary key={group.join('|')} text={exclusiveText(group)} />
      ))}
      {rules.fieldsets.map((rule) => (editingId === rule.id ? (
        <FieldsetEditor
          key={rule.id}
          rule={rule}
          choices={choices}
          onChange={(next) => update({ ...rules, fieldsets: rules.fieldsets.map((item) => item.id === rule.id ? next : item) })}
          onDone={() => setEditingId('')}
          onRemove={() => update({ ...rules, fieldsets: rules.fieldsets.filter((item) => item.id !== rule.id) })}
        />
      ) : (
        <RuleSummary
          key={rule.id}
          text={fieldsetText(rule)}
          onEdit={() => setEditingId(rule.id)}
          onRemove={() => update({ ...rules, fieldsets: rules.fieldsets.filter((item) => item.id !== rule.id) })}
        />
      )))}
      {rules.distinct.map((rule) => (editingId === rule.id ? (
        <Stack key={rule.id} direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label="Field"
            value={rule.fields[0] || ''}
            onChange={(event) => update({ ...rules, distinct: rules.distinct.map((item) => item.id === rule.id ? { ...item, fields: [event.target.value, item.fields[1]] } : item) })}
            sx={{ width: 180 }}
          >
            {choices.map((field) => <MenuItem key={field.name} value={field.name}>{field.name}</MenuItem>)}
          </TextField>
          <Typography variant="body2" color="text.secondary">must differ from</Typography>
          <TextField
            select
            size="small"
            label="Field"
            value={rule.fields[1] || ''}
            onChange={(event) => update({ ...rules, distinct: rules.distinct.map((item) => item.id === rule.id ? { ...item, fields: [item.fields[0], event.target.value] } : item) })}
            sx={{ width: 180 }}
          >
            {choices.map((field) => <MenuItem key={field.name} value={field.name}>{field.name}</MenuItem>)}
          </TextField>
          <Button size="small" onClick={() => setEditingId('')}>Done</Button>
          <Button size="small" color="inherit" onClick={() => update({ ...rules, distinct: rules.distinct.filter((item) => item.id !== rule.id) })}>Remove</Button>
        </Stack>
      ) : (
        <RuleSummary
          key={rule.id}
          text={distinctText(rule)}
          onEdit={() => setEditingId(rule.id)}
          onRemove={() => update({ ...rules, distinct: rules.distinct.filter((item) => item.id !== rule.id) })}
        />
      )))}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" color="inherit" disabled={choices.length === 0} onClick={addFieldset}>
          Add field values
        </Button>
        <Button size="small" variant="outlined" color="inherit" disabled={choices.length < 2} onClick={addDistinct}>
          Add fields that must differ
        </Button>
      </Stack>
    </Stack>
  )
}

function RuleSummary({ text, onEdit, onRemove }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Chip size="small" variant="outlined" label={text} sx={{ height: 'auto', py: 0.25, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
      {onEdit && (
        <IconButton size="small" aria-label={`Edit ${text}`} onClick={onEdit} sx={{ color: 'text.secondary' }}>
          <EditOutlinedIcon fontSize="inherit" />
        </IconButton>
      )}
      {onRemove && (
        <IconButton size="small" aria-label={`Remove ${text}`} onClick={onRemove} sx={{ color: 'text.secondary' }}>
          <CloseIcon fontSize="inherit" />
        </IconButton>
      )}
    </Stack>
  )
}

function ExclusiveMark({ name, groups }) {
  const peers = exclusivePeers(name, groups)
  if (peers.length === 0) return null
  const title = `Cannot be set together with ${peers.join(', ')}`
  return <Chip size="small" variant="outlined" label="exclusive" title={title} sx={{ height: 20, fontSize: 11 }} />
}

function exclusivePeers(name, groups) {
  const peers = []
  for (const group of groups || []) {
    if (!group.includes(name)) continue
    for (const item of group) {
      if (item !== name && !peers.includes(item)) peers.push(item)
    }
  }
  return peers
}

function exclusiveText(group) {
  return `${group.join(' and ')} cannot both be set`
}

function FieldsetEditor({ rule, choices, onChange, onDone, onRemove }) {
  return (
    <Stack spacing={0.75} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ flex: 1 }}>Skip when these values all match</Typography>
        <Button size="small" onClick={onDone}>Done</Button>
        <Button size="small" color="inherit" onClick={onRemove}>Remove</Button>
      </Stack>
      {Object.entries(rule.values).map(([name, raw]) => (
        <Stack key={name} direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label="Field"
            value={name}
            onChange={(event) => onChange(retargetFieldset(rule, name, event.target.value, choices))}
            sx={{ width: 180 }}
          >
            {choices.map((field) => <MenuItem key={field.name} value={field.name}>{field.name}</MenuItem>)}
          </TextField>
          <ExclusionValue
            field={choices.find((field) => field.name === name)}
            value={raw}
            onChange={(next) => onChange({ ...rule, values: { ...rule.values, [name]: next } })}
          />
          <IconButton size="small" aria-label={`Remove ${name}`} onClick={() => onChange(dropFieldsetValue(rule, name))} sx={{ color: 'text.secondary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button
        size="small"
        disabled={choices.every((field) => Object.prototype.hasOwnProperty.call(rule.values, field.name))}
        onClick={() => onChange(addFieldsetValue(rule, choices))}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add field
      </Button>
    </Stack>
  )
}

function fieldsetText(rule) {
  const pairs = Object.entries(rule.values).map(([name, raw]) => `${name} = ${raw === '' ? 'blank' : raw}`)
  return pairs.length ? pairs.join(' and ') : 'Skip when no fields are set'
}

function distinctText(rule) {
  const [left, right] = rule.fields
  return `${left || 'field'} ≠ ${right || 'field'}`
}

function ExclusionValue({ field, value, onChange }) {
  const options = [...new Set((field?.values || []).map((item) => valueText(item)))]
  if (options.length === 0) {
    return <TextField size="small" label="Value" value={value} onChange={(event) => onChange(event.target.value)} sx={{ width: 160 }} />
  }
  const current = options.includes(value) ? value : value
  return (
    <TextField select size="small" label="Value" value={current} onChange={(event) => onChange(event.target.value)} sx={{ width: 160 }}>
      {(options.includes(current) ? options : [current, ...options]).map((option) => (
        <MenuItem key={option} value={option}>{option}</MenuItem>
      ))}
    </TextField>
  )
}

function newFieldset(choices) {
  const field = choices[0]
  return { id: ruleId(), values: field ? { [field.name]: '' } : {} }
}

function addFieldsetValue(rule, choices) {
  const field = choices.find((item) => !Object.prototype.hasOwnProperty.call(rule.values, item.name))
  if (!field) return rule
  return { ...rule, values: { ...rule.values, [field.name]: '' } }
}

function dropFieldsetValue(rule, name) {
  const values = { ...rule.values }
  delete values[name]
  return { ...rule, values }
}

function retargetFieldset(rule, from, to, choices) {
  if (from === to || Object.prototype.hasOwnProperty.call(rule.values, to)) return rule
  const values = {}
  for (const [name, raw] of Object.entries(rule.values)) {
    if (name === from) values[to] = fieldValueText(choices.find((field) => field.name === to), raw)
    else values[name] = raw
  }
  return { ...rule, values }
}

function newDistinct(choices) {
  return { id: ruleId(), fields: [choices[0]?.name || '', choices[1]?.name || ''] }
}

function fieldValueText(field, fallback = '') {
  if (!field) return fallback
  if (field.values?.length) return valueText(field.values[0])
  if (field.sample !== undefined && field.sample !== '') return valueText(field.sample)
  return ''
}

function ruleId() {
  return globalThis.crypto?.randomUUID?.() || `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const summary = responseSummary(result)
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
        {summary ? (
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>{summary}</Typography>
        ) : result.text ? (
          <Typography variant="caption" color="text.secondary">JSON</Typography>
        ) : null}
        {hasRecordList(result) && <RecordsTableButton result={result} />}
      </Stack>
      {open && <ResponseBody result={result} />}
    </Stack>
  )
}

function ResponseBody({ result }) {
  if (result.pages && result.pages.length > 1) {
    return (
      <Stack spacing={0.75}>
        {result.pages.map((page) => (
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
  return <PayloadText text={result.text} open />
}

function responseSummary(result) {
  if (result.pages?.length > 1) return String(result.text || '').split('\n')[0]
  const count = Array.isArray(result.records) ? result.records.length : 0
  if (count > 0) return `${count} ${count === 1 ? 'record' : 'records'}`
  return ''
}

function hasRecordList(result) {
  if (Array.isArray(result?.records) && result.records.length > 0) return true
  return Array.isArray(result?.pages) && result.pages.some((page) => page.count > 0)
}

function RecordsTableButton({ result }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: 11, lineHeight: 1.7, textTransform: 'none', flexShrink: 0 }}
      >
        Table
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} maxWidth="xl" fullWidth>
          <RecordsDialog result={result} onClose={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  )
}

function RecordsDialog({ result, onClose }) {
  const records = useMemo(() => collectRecords(result) || [], [result])
  const columns = useMemo(() => recordColumns(records), [records])
  const pages = [...new Set(records.map((record) => record.page).filter(Boolean))]
  const showPage = pages.length > 1
  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>{records.length} records</Box>
        <Button onClick={onClose}>Close</Button>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ overflow: 'auto', maxHeight: '70vh' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {showPage && <TableCell>Page</TableCell>}
                {columns.map((column) => (
                  <TableCell key={column} sx={{ whiteSpace: 'nowrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>
                    {column}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record, index) => {
                const flat = flattenRecord(record.value)
                return (
                  <TableRow key={`${record.page}-${index}`} hover>
                    {showPage && <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{record.page}</TableCell>}
                    {columns.map((column) => (
                      <TableCell key={column} sx={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{cellText(flat[column])}</TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
    </>
  )
}

const LIST_KEYS = ['content', 'items', 'data', 'results', 'records']

function collectRecords(result) {
  if (Array.isArray(result?.records) && result.records.length) return result.records
  const pages = Array.isArray(result?.pages) && result.pages.length ? result.pages : [{ label: '', text: result?.text }]
  const records = []
  for (const page of pages) {
    const items = listItems(parseJson(page?.text))
    if (!items) continue
    for (const value of items) {
      if (value && typeof value === 'object' && !Array.isArray(value)) records.push({ page: page.label || '', value })
    }
  }
  return records.length ? records : null
}

function listItems(body) {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== 'object') return null
  for (const key of LIST_KEYS) {
    if (Array.isArray(body[key])) return body[key]
  }
  return null
}

function recordColumns(records) {
  const columns = []
  const seen = new Set()
  for (const record of records) {
    for (const key of Object.keys(flattenRecord(record.value))) {
      if (seen.has(key)) continue
      seen.add(key)
      columns.push(key)
    }
  }
  return columns
}

function flattenRecord(value, prefix = '', into = {}) {
  if (Array.isArray(value) || value == null || typeof value !== 'object') {
    into[prefix || 'value'] = value
    return into
  }
  const keys = Object.keys(value)
  if (keys.length === 0) {
    into[prefix || 'value'] = value
    return into
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key
    const child = value[key]
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenRecord(child, path, into)
    else into[path] = child
  }
  return into
}

function cellText(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
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
    detail: 'The request uses size and a cursor such as nextCursor. The response returns that cursor again, plus size or totalSize. The next request sends the same size and the returned cursor until the cursor is empty, the page is shorter than size, or the fetched count reaches totalSize.',
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
    const size = pagination.request.size ? ` and ${pagination.request.size}` : ''
    const total = pagination.response.total ? `, until ${pagination.response.total} is reached` : ''
    return `This operation is treated as cursor pagination via ${pagination.request.cursor}${size}${total}.`
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

function FieldSummary({ field, depth, exclusive }) {
  const leaf = field.name.split('.').pop()
  return (
    <Stack spacing={0.5} sx={{ pl: depth * 1.5 }}>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: field.object ? 700 : 650 }}>{leaf}</Typography>
        {depth === 0 && <ToneChip label={field.location} tone={LOCATION_TONE[field.location]} />}
        {field.required && <Chip label="required" size="small" variant="outlined" />}
        <ExclusiveMark name={field.name} groups={exclusive} />
      </Stack>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary">{fieldTypeLabel(field)}</Typography>
        {constraintLabels(field).map((label) => (
          <Chip key={label} label={label} size="small" variant="outlined" sx={{ fontWeight: 500 }} />
        ))}
      </Stack>
    </Stack>
  )
}

function DefaultValue({ field, resolved, source, hidden = false, onChange, onInherit, onObject }) {
  if (field.object) {
    return <ObjectChoice value={objectChoice(resolved.sample)} onChange={onObject} />
  }
  if (hidden) return null
  return (
    <Box>
      <CombinationDefault field={resolved} onChange={onChange} />
      {(source === 'global' || source === 'endpoint') && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.25 }}>
          {source === 'endpoint' && (
            <Button size="small" onClick={onInherit} sx={{ minWidth: 0, px: 0.5, py: 0, color: 'text.secondary' }}>
              Inherit
            </Button>
          )}
          <Typography variant="caption" color="text.secondary">
            {source === 'global' ? 'Global default' : resolved.sample === '' ? 'This endpoint sends nothing' : 'This endpoint'}
          </Typography>
        </Stack>
      )}
    </Box>
  )
}

function IndividualChoices({ field, onToggle }) {
  const choices = individualChoices(field)
  if (choices.length === 0) {
    return <Typography variant="caption" color="text.secondary">Default only</Typography>
  }
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {choices.map((choice) => {
        const on = individualIncluded(field, choice)
        return (
          <Chip
            key={choice.id}
            size="small"
            label={choice.label}
            variant="outlined"
            onClick={() => onToggle(choice.id, !on)}
            sx={{
              height: 22,
              borderColor: on ? 'primary.main' : 'divider',
              bgcolor: on ? 'rgba(15, 39, 68, 0.06)' : 'transparent',
              color: on ? 'primary.main' : 'text.secondary',
              '& .MuiChip-label': { px: 0.75, fontSize: 12, fontWeight: on ? 650 : 500 },
            }}
          />
        )
      })}
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
  if (field.enum) {
    const count = (field.values || []).filter((value) => value != null && !isOmitted(value)).length
    if (count > 0) labels.push(`${count} values`)
  }
  return labels
}

function loopLabel(value) {
  if (isOmitted(value)) return 'Omit'
  if (value == null) return 'Null'
  return valueText(value)
}

function enumMemberOptions(field) {
  const source = Array.isArray(field.members) && field.members.length > 0
    ? field.members
    : (field.values || []).filter((value) => !isOmitted(value))
  const options = []
  let sawNull = false
  for (const value of source) {
    if (value == null) {
      if (sawNull) continue
      sawNull = true
      options.push(null)
      continue
    }
    if (!options.some((item) => item === value)) options.push(value)
  }
  return options
}

function CombinationDefault({ field, onChange }) {
  if (field.enum) {
    const options = enumMemberOptions(field)
    const current = options.some((option) => option == null ? field.sample == null : option === field.sample) ? field.sample : ''
    const selected = current == null ? '@null' : String(current)
    return (
      <TextField
        select
        size="small"
        fullWidth
        value={selected}
        onChange={(event) => {
          const raw = event.target.value
          onChange(raw === '@null' ? null : parseOption(raw, options.filter((option) => option != null)))
        }}
        slotProps={{ select: { 'aria-label': 'Default' } }}
      >
        {selected === '' && <MenuItem value="">None</MenuItem>}
        {options.map((option) => {
          const value = option == null ? '@null' : String(option)
          return <MenuItem key={value} value={value}>{loopLabel(option)}</MenuItem>
        })}
      </TextField>
    )
  }
  if (field.type === 'boolean') {
    const options = (field.values?.length > 0 ? field.values : [false, true]).filter((option) => option != null && typeof option !== 'symbol')
    return (
      <TextField select size="small" fullWidth value={String(field.sample)} onChange={(event) => onChange(parseOption(event.target.value, options))} slotProps={{ select: { 'aria-label': 'Default' } }}>
        {options.map((option) => (
          <MenuItem key={String(option)} value={String(option)}>{String(option)}</MenuItem>
        ))}
      </TextField>
    )
  }
  return (
    <TextField
      size="small"
      fullWidth
      placeholder={temporalPlaceholder(field.format) || 'Default'}
      value={field.sample ?? ''}
      onChange={(event) => onChange(coerceSample(field, event.target.value))}
      slotProps={{ htmlInput: { 'aria-label': 'Default' } }}
    />
  )
}

function CombinationValuesEditor({ field, values, onChange }) {
  const [draft, setDraft] = useState('')
  const typed = values.filter((item) => item !== '@null' && item !== '@omit')
  const next = draft.trim()
  const taken = new Set([String(field.sample ?? '').trim(), ...typed])
  const add = () => {
    if (!next || next === '@null' || next === '@omit' || taken.has(next)) return
    onChange([...values, next])
    setDraft('')
  }
  const toggle = (token) => onChange(values.includes(token) ? values.filter((item) => item !== token) : [...values, token])
  const choiceSx = (on) => ({
    height: 22,
    borderColor: on ? 'primary.main' : 'divider',
    bgcolor: on ? 'rgba(15, 39, 68, 0.06)' : 'transparent',
    color: on ? 'primary.main' : 'text.secondary',
    '& .MuiChip-label': { px: 0.75, fontSize: 12, fontWeight: on ? 650 : 500 },
  })
  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {typed.map((value) => (
        <Chip key={value} size="small" label={value} onDelete={() => onChange(values.filter((item) => item !== value))} />
      ))}
      {!field.required && (
        <>
          <Chip size="small" variant="outlined" label="Null" onClick={() => toggle('@null')} sx={choiceSx(values.includes('@null'))} />
          <Chip size="small" variant="outlined" label="Omit" onClick={() => toggle('@omit')} sx={choiceSx(values.includes('@omit'))} />
        </>
      )}
      <TextField
        size="small"
        placeholder="Another value"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add()
          }
        }}
        slotProps={{ htmlInput: { 'aria-label': 'Another value' } }}
        sx={{ width: '100%', maxWidth: 180, flex: '1 1 120px' }}
      />
      <Button size="small" variant="outlined" onClick={add} disabled={!next || taken.has(next)} sx={{ flexShrink: 0, px: 1 }}>
        Add
      </Button>
    </Stack>
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

function specThroughProxy(specUrl, apiBase) {
  let path = String(specUrl || '').trim()
  if (path.startsWith('/backend')) path = `/api${path.slice('/backend'.length)}`
  try {
    const absolute = new URL(path)
    return {
      path: `/api${absolute.pathname}${absolute.search}`,
      base: String(apiBase || '').trim() || absolute.origin,
    }
  } catch {
    if (!(path.startsWith('/api/') || path === '/api')) {
      path = `/api${path.startsWith('/') ? path : `/${path}`}`
    }
    return { path, base: String(apiBase || '').trim() }
  }
}

function hiddenByObject(field, resolvedFields) {
  const parts = field.name.split('.')
  for (let length = 1; length < parts.length; length += 1) {
    const parent = resolvedFields.find((item) => item.object && item.name === parts.slice(0, length).join('.'))
    if (parent && objectChoice(parent.sample) !== 'fields') return true
  }
  return false
}

function customAncestorClosed(name, fields, active, defaults, operation) {
  const parts = name.split('.')
  for (let length = 1; length < parts.length; length += 1) {
    const parentName = parts.slice(0, length).join('.')
    const parent = fields.find((item) => item.object && item.name === parentName)
    if (!parent) continue
    if ((active.omit || []).includes(parentName)) return true
    const hasValue = Object.prototype.hasOwnProperty.call(active.request || {}, parentName)
    const raw = hasValue ? active.request[parentName] : effectiveSample(parent, operation.id, defaults)
    if (objectChoice(raw) !== 'fields') return true
  }
  return false
}

function proxiedApiUrl(apiBase, pathOrUrl) {
  const fallback = new URL(joinUrl('/api', pathOrUrl || '/'), 'http://tester.local')
  try {
    const absolute = new URL(pathOrUrl, window.location.origin)
    if (absolute.origin === window.location.origin) return absolute
    const base = new URL(apiBase)
    if (absolute.origin === base.origin) {
      return new URL(joinUrl('/api', `${absolute.pathname}${absolute.search}`), window.location.origin)
    }
  } catch {
    return new URL(fallback.pathname + fallback.search, window.location.origin)
  }
  return new URL(joinUrl('/api', pathOrUrl), window.location.origin)
}

function ObjectChoice({ value, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value === 'null' || value === 'empty' ? value : 'fields'}
      onChange={(_event, next) => {
        if (next) onChange(next)
      }}
      sx={{ '& .MuiToggleButton-root': { py: 0.15, px: 0.9, textTransform: 'none', fontSize: 12, lineHeight: 1.6 } }}
    >
      <ToggleButton value="fields">Fields</ToggleButton>
      <ToggleButton value="null">Null</ToggleButton>
      <ToggleButton value="empty">Empty</ToggleButton>
    </ToggleButtonGroup>
  )
}

async function executeCheck(apiBase, idpBase, operation, item, hooks) {
  const sent = {
    ...item,
    body: evaluateDynamics(item.body),
    query: evaluateDynamics(item.query),
    path: evaluateDynamics(item.path),
  }
  const pagination = operation.pagination
  const followPages = sent.expect?.outcome !== 'error' && sent.expect?.outcome !== 'custom' && pagination
  let query = followPages ? firstPageQuery(pagination, sent.query) : { ...sent.query }
  const request = { body: sent.rawBody != null ? sent.rawBody : sent.body, query: { ...query }, path: sent.path }
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
    const response = await callOperation(apiBase, idpBase, operation, { ...sent, query }, url, hooks.headers, hooks.oauth)
    if (!first) {
      first = response
    }
    const body = parseJson(response.text)
    const items = readItems(body, pagination)
    const pageIndex = pagination ? readPath(body, pagination.response.page) : undefined
    reports.push({
      status: response.status,
      count: items.length,
      items,
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
  const records = reports.flatMap((report) => (report.items || [])
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value))
    .map((value) => ({ page: report.label, value })))
  if (reports.length <= 1) {
    return { ...first, request, ...(records.length ? { records } : {}) }
  }
  return {
    ...describeFetched(reports),
    request,
    ...(records.length ? { records } : {}),
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

async function callOperation(apiBase, idpBase, operation, item, urlOverride, extraHeaders, oauth) {
  if (!String(apiBase || '').trim()) {
    return { status: 0, text: 'Enter the backend base URL.', link: null }
  }
  let url
  if (urlOverride) {
    url = proxiedApiUrl(apiBase, urlOverride)
  } else {
    let path = operation.path
    for (const [name, value] of Object.entries(item.path)) {
      path = path.replace(`{${name}}`, encodeURIComponent(value))
    }
    url = new URL(joinUrl('/api', path), window.location.origin)
    for (const [name, value] of Object.entries(item.query)) {
      if (isOmitted(value)) continue
      url.searchParams.set(name, String(value))
    }
  }
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'x-tester-base': apiBase, ...(extraHeaders || {}) }
  try {
    if (oauthMode(oauth) === 'on') {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'authorization') delete headers[key]
      }
      headers.Authorization = `Bearer ${await accessTokenFor(oauth, idpBase)}`
    } else if (oauthMode(oauth) === 'incomplete') {
      return { status: 0, text: 'Fill the token path, client ID, and key for this client before running checks.', link: null }
    }
    const method = operation.method
    const body = method === 'GET' || method === 'DELETE'
      ? undefined
      : item.rawBody != null
        ? String(item.rawBody)
        : JSON.stringify(item.body)
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
