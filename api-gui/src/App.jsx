import { useEffect, useMemo, useRef, useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
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
  Tooltip,
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
  compositeField,
  isOmitted,
  OMIT,
  casesFor,
  recordId,
  detectPayloadId,
  resolvedId,
  payloadIdFields,
  aroundRequest,
  assignFixture,
  enquiryShouldMiss,
  enquiryTarget,
  fixtureEnabled,
  fixtureSteps,
  parseJsonBody,
  readCreatedId,
  withFixtureId,
  applyErrorOverrides,
  applyErrorInclude,
  applyErrorRowToGroup,
  errorCheckKey,
  errorMatchType,
  includedErrorCases,
  errorColumnDefault,
  createPacer,
  compilePattern,
  defaultResponseExpected,
  isArrayOfObjects,
  parseObjectArray,
  readExpectation,
  storedExpectation,
  applyPaging,
  collectPaging,
  describeFetched,
  fillRunRequests,
  firstPageQuery,
  joinUrl,
  judge,
  listOperations,
  operationGroups,
  OBJECT_COMPOSITE,
  OBJECT_EMPTY,
  OBJECT_FIELDS,
  OBJECT_NULL,
  objectChoice,
  objectDefaultChoice,
  combinationObjectMode,
  storedObjectSample,
  descendantScalars,
  defaultComposition,
  objectHasChildren,
  storedComposition,
  parseSpecText,
  planContinuation,
  readItems,
  readPath,
  responseChecks,
  serverUrl,
  specGaps,
  scalarCombinationField,
  combinationEnumValues,
  storedEnumValue,
  underComposite,
  valueText,
  responsesForMode,
  withTextCombinationValues,
} from './openapi/spec'
import { annotateJsonLines, compareRecords, filterModeChoices, filterRecords, filterRules, filterSummary, FILTER_MODE_LABELS, parseRecordFile } from './openapi/records'
import { CURSOR_TYPES, PAGING_MODES, pagingForm, pathName, resolvePagination, storedPaging } from './openapi/pagination.js'
import { capturedFrom, scenarioCall, scenarioRequest, stepShouldRun } from './openapi/scenarios'
import ScenarioEditor from './ScenarioEditor'
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
  storedRate,
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
  parseRunDocument,
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
import { listRuns, loadClientsFile, loadDatasets, loadProxy, loadRun, loadSpecFile, saveClientsFile, saveDatasets, saveProxy, saveRun, saveSpecFile } from './files'

const EXAMPLES_SEEDED_KEY = 'api-tester.examples-loaded'
const EXAMPLE_CLIENTS_KEY = 'api-tester.example-clients'
const PROXY_SPEC = '/api/v3/api-docs.yaml'

function resolvedOperationFields(operation, modeId, defaults, customCases) {
  const applied = applyDefaults(operation.fields.map((field) => ({ ...field })), operation.id, defaults)
  return modeId === 'combination'
    ? withTextCombinationValues(applied, customCases?.values?.[operation.id], defaults?.variables, customCases?.vary?.[operation.id])
    : applied
}

function casesForOperation(operation, modeId, defaults, customCases) {
  if (!operation) return { fields: [], cases: [] }
  const fields = resolvedOperationFields(operation, modeId, defaults, customCases)
  return {
    fields,
    cases: casesFor(modeId, fields, resolveCases(customCases?.operations?.[operation.id] || [], defaults?.variables), {
      fieldsets: customCases?.exclusions?.[operation.id]?.fieldsets || [],
      distinct: customCases?.exclusions?.[operation.id]?.distinct || [],
      exclusive: operation.exclusive || [],
    }, customCases?.errors?.[operation.id] || [], customCases?.trials?.[operation.id]),
  }
}

const MODES = [
  {
    id: 'combination',
    label: 'Combinations',
    detail: 'Crosses each selected enum. Clear a field checkbox to keep that field on its default. The Vary header checkbox clears every field at once. An optional enum includes null and omit, and a null already in the enum is listed once. With a field checked you can turn off some of its possible values, such as 3 of 5 enum values. An optional object is sent filled, as null, and omitted. Mark an object with children as Composite to send those children as one value. The composite default is the field values, null, or empty; with no try values that default is the only value used. Try values in the Values column are the compositions that are combined; the default is not listed there. An optional composite can also try null, empty, or omit; a required composite does not. An enum that is not crossed uses one selected value. A string or number uses its default plus any other values you add, and can include null and omit when it is optional. Other optional query filters stay off the request. Skip rules are left out. A check passes on a success status, and when each expected response value matches. With a record set uploaded, each check filters that set and compares it with the rows from every page.',
  },
  {
    id: 'individual',
    label: 'Individual',
    detail: 'Each check changes one field. The value on the left is the default kept by every other field. Select the values to try. A check passes when validation accepts the value and the expected response values match.',
  },
  {
    id: 'error',
    label: 'Error',
    detail: 'Sends requests that should be rejected. Include a row to run it. Each column is a response field and how that field is compared.',
  },
  {
    id: 'custom',
    label: 'Custom',
    detail: 'Runs the cases saved for this operation. Blank request fields use the defaults. A check passes on the HTTP status. Each expected response field has its own comparison: Value, Expression, Contains, Pattern, or Regex. Any other field is compared with the same request field when that value was sent.',
  },
  {
    id: 'trial',
    label: 'Trial',
    detail: 'Fields start on their defaults. Defaults in the Value header fills every field. Clear empties them. A cleared field is left off the request. Pagination is not followed. A 2xx status is a pass.',
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
  const [datasets, setDatasets] = useState({})
  const [showScenarios, setShowScenarios] = useState(false)
  const [scenarioId, setScenarioId] = useState('')
  const [libraryReady, setLibraryReady] = useState(false)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [oauth, setOauth] = useState(emptyOauth)
  const [libraryNotice, setLibraryNotice] = useState('')
  const [fileNotice, setFileNotice] = useState('')
  const [savedRuns, setSavedRuns] = useState([])
  const [savedRunName, setSavedRunName] = useState('')
  const [tps, setTps] = useState('30')
  const pageRate = useRef({ id: '', touched: false })
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
  const selectedPaging = resolvePagination(selected?.pagination, customCases.paging?.[selected?.id])
  const activeMode = mode === 'boundary' ? 'individual' : mode
  const modeInfo = MODES.find((item) => item.id === activeMode)
  const resolvedFields = useMemo(() => {
    if (!selected) return []
    const applied = applyDefaults(fields, selected.id, defaults)
    if (activeMode !== 'combination') return applied
    return withTextCombinationValues(applied, customCases.values?.[selected.id], defaults.variables, customCases.vary?.[selected.id])
  }, [activeMode, customCases.values, customCases.vary, defaults, fields, selected])
  const operationCases = selected ? customCases.operations[selected.id] : undefined
  const operationExclusions = selected ? customCases.exclusions?.[selected.id] : undefined
  const operationErrorCases = selected ? customCases.errors?.[selected.id] : undefined
  const operationErrorChecks = selected ? customCases.checks?.[selected.id] : undefined
  const operationTrial = selected ? customCases.trials?.[selected.id] : undefined
  const builtCases = useMemo(
    () => (selected ? casesFor(activeMode, resolvedFields, resolveCases(operationCases || [], defaults.variables), {
      fieldsets: operationExclusions?.fieldsets || [],
      distinct: operationExclusions?.distinct || [],
      exclusive: selected.exclusive || [],
    }, operationErrorCases || [], operationTrial) : []),
    [activeMode, defaults.variables, operationCases, operationErrorCases, operationExclusions, operationTrial, resolvedFields, selected],
  )
  const planned = useMemo(() => {
    const cases = applyErrorOverrides(builtCases, operationErrorChecks || {})
    if (activeMode !== 'error') return cases
    return includedErrorCases(cases, operationErrorChecks || {})
  }, [activeMode, builtCases, operationErrorChecks])
  const skippedCombinations = activeMode === 'combination' && selected
    ? Math.max(0, caseCount(resolvedFields) - planned.length)
    : 0
  const skippedErrors = activeMode === 'error'
    ? Math.max(0, builtCases.length - planned.length)
    : 0
  const combinationVaryNames = useMemo(
    () => (activeMode === 'combination' && selected ? combinationVaryTargets(fields, resolvedFields) : []),
    [activeMode, fields, resolvedFields, selected],
  )
  const combinationVarying = combinationVaryNames.filter((name) => resolvedFields.find((item) => item.name === name)?.vary).length
  const anyCombinationVary = combinationVarying > 0
  const allCombinationVary = combinationVaryNames.length > 0 && combinationVarying === combinationVaryNames.length
  const savedRecordId = selected ? customCases.ids?.[selected.id] : undefined
  useEffect(() => {
    const id = `${activeId || ''}:${selectedId || ''}`
    if (pageRate.current.id !== id) {
      pageRate.current = { id, touched: false }
      setTps(storedRate(defaults.tps))
      return
    }
    if (!pageRate.current.touched) setTps(storedRate(defaults.tps))
  }, [activeId, selectedId, defaults.tps])
  const preparation = useMemo(
    () => (selected ? fixtureSteps(selected, operations, defaults, savedRecordId, customCases.steps?.[selected.id] || {}) : null),
    [customCases.steps, defaults, operations, savedRecordId, selected],
  )
  const finishedChecks = results.filter((result) => !result.step).length

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
    if (!libraryReady || !activeId) return undefined
    let cancelled = false
    loadDatasets(activeId).then((data) => {
      if (!cancelled) setDatasets(data)
    }).catch(() => {
      if (!cancelled) setDatasets({})
    })
    return () => {
      cancelled = true
    }
  }, [libraryReady, activeId])

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
  const skippedCount = results.filter((result) => result.skipped).length
  const visible = onlyFailed ? results.filter((result) => !result.passed && !result.skipped) : results

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
    setShowScenarios(false)
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

  function writePattern(name, value) {
    const key = String(name || '').trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return
    setDefaults((current) => ({ ...current, patterns: { ...current.patterns, [key]: value } }))
  }

  function renamePattern(currentName, nextName) {
    const key = String(nextName || '').trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return false
    if (key !== currentName && Object.prototype.hasOwnProperty.call(defaults.patterns || {}, key)) return false
    setDefaults((current) => {
      const patterns = { ...current.patterns }
      const value = patterns[currentName]
      delete patterns[currentName]
      patterns[key] = value ?? ''
      return { ...current, patterns }
    })
    return true
  }

  function removePattern(name) {
    setDefaults((current) => {
      const patterns = { ...current.patterns }
      delete patterns[name]
      return { ...current, patterns }
    })
  }

  function addPattern() {
    setDefaults((current) => {
      const patterns = { ...(current.patterns || {}) }
      let name = 'name'
      let suffix = 2
      while (Object.prototype.hasOwnProperty.call(patterns, name)) {
        name = `name${suffix}`
        suffix += 1
      }
      patterns[name] = ''
      return { ...current, patterns }
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
      const document = parseRunDocument(await loadRun(name))
      const current = profiles.find((item) => item.id === activeId)
      const profile = profiles.find((item) => profileLabel(item) === document.client)
        || (current?.oauth?.clientId === document.clientId ? current : null)
        || profiles.find((item) => item.oauth?.clientId && item.oauth.clientId === document.clientId)
      if (profile && profile.id !== activeId) {
        showProfile(profile)
      }
      const sourceDefaults = profile && profile.id !== activeId ? profile.defaults : defaults
      const sourceCases = profile && profile.id !== activeId ? profile.cases : customCases
      let loaded = document.results
      if (document.mode === 'Scenarios') {
        setShowScenarios(true)
        const scenarios = sourceCases?.scenarios || []
        const scenario = scenarios.find((item) => item.name === document.operation)
        if (scenario) setScenarioId(scenario.id)
      } else {
        const nextMode = MODES.find((item) => item.label === document.mode)?.id
        if (nextMode) setMode(nextMode)
        const operation = operations.find((item) => item.id === document.operation)
        if (operation) {
          setShowScenarios(false)
          setSelectedId(operation.id)
          setFields(operation.fields.map((field) => ({ ...field })))
          setOpenTag(operation.tag || '')
          const rebuilt = casesForOperation(operation, nextMode || activeMode, sourceDefaults, sourceCases)
          loaded = fillRunRequests(
            document.results,
            rebuilt.cases,
            operation,
            sourceCases?.paging?.[operation.id],
            rebuilt.fields,
          )
        }
      }
      setResults(loaded)
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
    if (mode === 'composite' || compositeField(field, fields)) {
      writeEndpoint(field, storedObjectSample(field, mode, fields))
      return
    }
    if (mode === 'fields') {
      if (objectHasChildren(field, fields) && String(field.name || '').includes('.')) {
        writeEndpoint(field, OBJECT_FIELDS)
        return
      }
      const globalMode = objectChoice(defaults.global?.[field.name])
      if (globalMode === 'fields') {
        writeEndpoint(field, '', true)
        return
      }
      writeEndpoint(field, OBJECT_FIELDS)
      return
    }
    writeEndpoint(field, mode === 'null' ? OBJECT_NULL : OBJECT_EMPTY)
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

  function writeTrial(operationId, patch) {
    setCustomCases((current) => {
      const trials = { ...(current.trials || {}) }
      const previous = trials[operationId] || { request: {}, omit: [] }
      const next = {
        request: patch.request !== undefined ? patch.request : previous.request,
        omit: patch.omit !== undefined ? patch.omit : previous.omit,
      }
      if (Object.keys(next.request || {}).length === 0 && (next.omit || []).length === 0) delete trials[operationId]
      else trials[operationId] = next
      return { ...current, trials }
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
      const matches = {}
      for (const column of columns) {
        const match = errorMatchType(next?.matches?.[column])
        if (match !== 'equals') matches[column] = match
      }
      const untouched = columns.length === 1 && columns[0] === 'exceptions[].code' && Object.keys(rows).length === 0 && Object.keys(matches).length === 0
      if (untouched) delete checks[operationId]
      else checks[operationId] = { columns, rows, ...(Object.keys(matches).length > 0 ? { matches } : {}) }
      return { ...current, checks }
    })
  }

  function writeVary(operationId, fieldName, on) {
    writeVaryNames(operationId, [fieldName], on)
  }

  function applyCombinationVary(operationId, names, on) {
    const set = new Set(names)
    setFields((current) => current.map((field) => (set.has(field.name) ? { ...field, vary: on, textVary: on } : field)))
    writeVaryNames(operationId, names, on)
  }

  function writeVaryNames(operationId, names, on) {
    setCustomCases((current) => {
      const vary = { ...(current.vary || {}) }
      const operation = { ...(vary[operationId] || {}) }
      for (const fieldName of names) {
        if (on) delete operation[fieldName]
        else operation[fieldName] = false
      }
      if (Object.keys(operation).length === 0) delete vary[operationId]
      else vary[operationId] = operation
      return { ...current, vary }
    })
  }

  function writeCombinationValues(operationId, fieldName, list) {
    setCustomCases((current) => {
      const values = { ...(current.values || {}) }
      const operation = { ...(values[operationId] || {}) }
      const next = []
      for (const item of list || []) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const composition = storedComposition(item)
          if (!composition || next.some((existing) => JSON.stringify(existing) === JSON.stringify(composition))) continue
          next.push(composition)
          continue
        }
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

  function writePayloadId(operation, name) {
    const detected = detectPayloadId(operation)?.name || ''
    setCustomCases((current) => {
      const ids = { ...(current.ids || {}) }
      if (name === detected) delete ids[operation.id]
      else ids[operation.id] = name
      return { ...current, ids }
    })
  }

  function writeFixtureStep(operationId, patch) {
    setCustomCases((current) => {
      const steps = { ...(current.steps || {}) }
      const operation = { ...(steps[operationId] || {}), ...patch }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') delete operation[key]
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) delete operation[key]
      }
      if (Object.keys(operation).length === 0) delete steps[operationId]
      else steps[operationId] = operation
      return { ...current, steps }
    })
  }

  function writeDataset(operationId, next) {
    const map = { ...datasets }
    if (next) map[operationId] = next
    else delete map[operationId]
    setDatasets(map)
    if (!activeId) return
    saveDatasets(activeId, map).catch((error) => {
      setFileNotice(error.message || 'Could not save the uploaded records.')
    })
  }

  function writeScenarios(list) {
    setCustomCases((current) => ({ ...current, scenarios: list }))
  }

  function writePaging(operationId, next) {
    setCustomCases((current) => {
      const paging = { ...(current.paging || {}) }
      const saved = storedPaging(next)
      if (!saved) delete paging[operationId]
      else paging[operationId] = saved
      return { ...current, paging }
    })
  }

  function writeFilter(operationId, field, patch, detected) {
    setCustomCases((current) => {
      const filters = { ...(current.filters || {}) }
      const operation = { ...(filters[operationId] || {}) }
      const next = { ...patch }
      const mode = next.mode && next.mode !== detected.mode ? next.mode : ''
      const column = typeof next.column === 'string' && next.column.trim() && next.column.trim() !== detected.column ? next.column.trim() : ''
      if (!mode && !column) delete operation[field]
      else operation[field] = { ...(mode ? { mode } : {}), ...(column ? { column } : {}) }
      if (Object.keys(operation).length === 0) delete filters[operationId]
      else filters[operationId] = operation
      return { ...current, filters }
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
    const savedSteps = customCases.steps?.[selected.id] || {}
    const around = fixtureSteps(selected, operations, defaults, customCases.ids?.[selected.id], savedSteps)
    const plan = around?.plan || null
    const beforeOp = around?.calls?.find((call) => call.role === 'before')?.operation || null
    const afterOp = around?.calls?.find((call) => call.role === 'after')?.operation || null
    const enquiryOp = around?.enquiry || null
    const useBefore = activeMode !== 'trial' && Boolean(beforeOp) && fixtureEnabled(savedSteps, 'before')
    const useAfter = activeMode !== 'trial' && Boolean(afterOp) && fixtureEnabled(savedSteps, 'after')
    const useEnquiry = activeMode !== 'trial' && Boolean(enquiryOp) && fixtureEnabled(savedSteps, 'enquiry')
    const assigned = useBefore && plan ? assignFixture(cases, plan) : cases
    let sharedId = null
    let beforeContext = null
    const releaseIds = []
    const headers = requestHeaders(defaults)
    const sendOnce = async (operation, item, honorStop) => {
      if (honorStop && stopRef.current) return null
      await pace()
      if (honorStop && stopRef.current) return null
      if (oauthMode(oauth) === 'on') setActivity('requesting access token')
      const sent = {
        body: evaluateDynamics(item.body),
        query: evaluateDynamics(item.query || {}),
        path: evaluateDynamics(item.path || {}),
      }
      const response = await callOperation(apiBase, idpBase, operation, sent, null, headers, oauth)
      return { ...response, request: { body: item.rawBody != null ? item.rawBody : sent.body, query: sent.query, path: sent.path } }
    }
    const createRecord = async () => {
      setActivity('creating a record to test')
      const request = aroundRequest(beforeOp, around.fields.before, null, defaults)
      const response = await sendOnce(beforeOp, request, true)
      if (!response) return { stopped: true }
      const id = readCreatedId(response.status, response.text, response.location)
      beforeContext = { request: response.request, response: parseJsonBody(response.text) }
      return { id, response }
    }
    const pushResult = (entry) => {
      next.push({ index: next.length + 1, ...entry })
      setResults([...next])
    }
    const noteCreate = (response, id, label) => {
      const ok = response.status >= 200 && response.status < 300
      pushResult({
        step: 'before',
        label,
        status: response.status,
        passed: plan ? id != null : ok,
        detail: id != null
          ? `Created id ${id}.`
          : (ok ? 'Before call succeeded.' : 'Before call failed.'),
        text: pretty(response.text),
        ...(response.request ? { request: response.request } : {}),
      })
    }
    try {
      const needsShared = Boolean(plan) && assigned.some((item) => item.needsFixture)
      if (useBefore && (needsShared || !plan)) {
        const created = await createRecord()
        if (created.stopped) return
        noteCreate(created.response, created.id, `Before · ${beforeOp.method} ${beforeOp.path}`)
        if (needsShared) {
          if (created.id == null) return
          sharedId = created.id
        }
      }
      for (let index = 0; index < assigned.length; index += 1) {
        if (stopRef.current) break
        let item = assigned[index]
        let ownId = null
        if (item.ownRecord) {
          const created = await createRecord()
          if (created.stopped) break
          noteCreate(created.response, created.id, `Before · ${beforeOp.method} ${beforeOp.path}`)
          if (created.id == null) break
          ownId = created.id
          item = withFixtureId(item, plan.idField, ownId, plan.location)
        } else if (item.needsFixture) {
          item = withFixtureId(item, plan.idField, sharedId, plan.location)
        }
        const response = await executeCheck(apiBase, idpBase, selected, item, {
          pace,
          shouldStop: () => stopRef.current,
          onActivity: setActivity,
          headers,
          oauth,
          paging: customCases.paging?.[selected.id],
        })
        if (!response) {
          if (ownId != null) releaseIds.push(ownId)
          break
        }
        if (ownId != null && !(response.status >= 200 && response.status < 300)) releaseIds.push(ownId)
        const bodyText = item.expect?.outcome === 'custom' && response.pages?.[0] ? response.pages[0].text : response.text
        const verdict = judge(item.expect, response.status, bodyText, {
          request: response.request || { body: item.body, query: item.query, path: item.path },
          expectations: activeMode === 'trial'
            ? {}
            : responseChecks(responsesForMode(selected.responses, activeMode), new Set(fields.map((field) => field.name)), defaults.responses?.[selected.id]),
          variables: defaults.variables,
          patterns: defaults.patterns,
          pages: response.pages,
        })
        const table = datasets[selected.id]
        if (activeMode === 'combination' && table?.rows?.length && response.status >= 200 && response.status < 300) {
          const rules = filterRules(selected.fields, selected.recordColumns, customCases.filters?.[selected.id], selected.pagination)
          const expectedRows = filterRecords(table.rows, rules, response.request || { body: item.body, query: item.query, path: item.path })
          const actualRows = (response.records || []).map((record) => record.value)
          const compared = compareRecords(expectedRows, actualRows, { ordered: Boolean(table.ordered) })
          verdict.detail = [verdict.detail, compared.detail].filter(Boolean).join('\n')
          if (!compared.passed) verdict.passed = false
          if (compared.diffs?.length) verdict.recordDiffs = compared.diffs
        }
        const request = response.request || { body: item.body, query: item.query, path: item.path }
        let enquiry = null
        if (useEnquiry && enquiryOp && !stopRef.current) {
          setActivity('reading the record back')
          const target = plan ? enquiryTarget(item, plan.idField, plan.location) : null
          const previous = {
            request,
            response: parseJsonBody(bodyText),
          }
          const inject = plan && target != null ? { [plan.idField]: target } : {}
          const follow = await sendOnce(enquiryOp, aroundRequest(enquiryOp, around.fields.enquiry, previous, defaults, inject), true)
          if (follow) {
            const miss = enquiryShouldMiss(item, response.status, ownId != null)
            const ok = miss ? follow.status === 404 : follow.status >= 200 && follow.status < 300
            const call = `${enquiryOp.method} ${enquiryOp.path}`
            enquiry = { status: follow.status, text: pretty(follow.text), label: call }
            const note = ok
              ? `Enquiry ${call} returned ${follow.status}.`
              : `Enquiry ${call} returned ${follow.status}; ${miss ? 'expected the record to be gone' : 'expected the record to still be there'}.`
            verdict.detail = [verdict.detail, note].filter(Boolean).join(' ')
            if (!ok) verdict.passed = false
          }
        }
        pushResult({
          label: item.label,
          status: response.status,
          passed: verdict.passed,
          detail: verdict.detail,
          text: response.pages ? response.text : pretty(response.text),
          pages: response.pages ? response.pages.map((page) => ({ ...page, text: pretty(page.text), ...(page.request ? { request: page.request } : {}) })) : null,
          ...(response.records?.length ? { records: response.records } : {}),
          ...(verdict.recordDiffs?.length ? { recordDiffs: verdict.recordDiffs } : {}),
          ...(request ? { request } : {}),
          ...(enquiry ? { enquiry } : {}),
        })
      }
    } finally {
      const leftover = [...releaseIds]
      if (sharedId != null) leftover.push(sharedId)
      if (useAfter && afterOp) {
        setActivity('removing the record created for this run')
        const ids = leftover.length > 0 ? leftover : [null]
        for (const id of ids) {
          const inject = plan && id != null ? { [plan.idField]: id } : {}
          const previous = beforeContext || { request: null, response: null }
          const response = await sendOnce(afterOp, aroundRequest(afterOp, around.fields.after, previous, defaults, inject), false)
          const removed = Boolean(response) && (response.status === 404 || (response.status >= 200 && response.status < 300))
          pushResult({
            step: 'after',
            label: `After · ${afterOp.method} ${afterOp.path}`,
            status: response?.status || 0,
            passed: removed,
            detail: id != null
              ? (removed ? `Removed id ${id}.` : 'The record created for this run could not be removed.')
              : (removed ? 'After call succeeded.' : 'After call failed.'),
            text: pretty(response?.text || ''),
            ...(response?.request ? { request: response.request } : {}),
          })
        }
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
  }

  function resolveScenarioClient(step, clients) {
    const id = String(step?.profileId || '').trim()
    if (!id || id === activeId) {
      return {
        defaults,
        oauth,
        label: profileLabel({ name: profileName, oauth }),
        overridden: Boolean(id),
      }
    }
    const profile = (clients || []).find((item) => item.id === id)
    if (!profile) return { missing: true, label: id, overridden: true }
    return {
      defaults: profile.defaults,
      oauth: profile.oauth,
      label: profileLabel(profile),
      overridden: true,
    }
  }

  async function runScenario() {
    const scenario = (customCases.scenarios || []).find((item) => item.id === scenarioId)
    if (!scenario || scenario.steps.length === 0 || running) return
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
    const clients = commitProfiles()
    const iterations = scenario.iterations.length > 0 ? scenario.iterations : [{ id: 'once', values: {} }]
    const push = (entry) => {
      next.push({ index: next.length + 1, ...entry })
      setResults([...next])
    }
    try {
      for (let rowIndex = 0; rowIndex < iterations.length; rowIndex += 1) {
        if (stopRef.current) break
        const captured = {}
        let rowFailed = false
        for (const step of scenario.steps) {
          if (stopRef.current) break
          const operation = operations.find((item) => item.id === step.operationId)
          const client = resolveScenarioClient(step, clients)
          const label = [
            `${rowIndex + 1} · ${operation?.summary || step.operationId || 'Step'}`,
            client.overridden ? client.label : '',
          ].filter(Boolean).join(' · ')
          if (!operation) {
            rowFailed = true
            push({ label, status: 0, passed: false, detail: 'That endpoint is not in the loaded document.' })
            continue
          }
          if (client.missing) {
            rowFailed = true
            push({ label, status: 0, passed: false, detail: 'That client is not in the library anymore.' })
            continue
          }
          if (!stepShouldRun(step, rowFailed)) {
            push({ label, status: 0, passed: false, skipped: true, detail: 'Skipped because an earlier step failed.' })
            continue
          }
          const stepDefaults = client.defaults
          const stepOauth = client.oauth
          const variables = { ...iterations[rowIndex].values, ...captured }
          const call = scenarioCall(operation, step, stepDefaults, variables)
          setActivity(`iteration ${rowIndex + 1} of ${iterations.length} · ${operation.summary || operation.path}`)
          await pace()
          if (stopRef.current) break
          const sent = scenarioRequest(call)
          const response = await callOperation(apiBase, idpBase, operation, sent, null, requestHeaders(stepDefaults), stepOauth)
          const verdict = judge(call.expect, response.status, response.text, {
            request: sent,
            variables: { ...(stepDefaults.variables || {}), ...variables },
            patterns: stepDefaults.patterns,
          })
          if (!verdict.passed) rowFailed = true
          Object.assign(captured, capturedFrom(step.captures, response.status, response.text, response.location))
          push({
            label,
            status: response.status,
            passed: verdict.passed,
            detail: verdict.detail,
            text: pretty(response.text),
            request: sent,
          })
        }
      }
    } finally {
      setActivity('')
      setRunning(false)
    }
    if (next.length > 0) {
      try {
        const saved = await saveRun({
          client: profileLabel({ name: profileName, oauth }),
          clientId: oauth.clientId || '',
          operation: scenario.name || 'Scenario',
          mode: 'Scenarios',
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

  const failed = results.filter((result) => !result.passed && !result.skipped).length
  const viewed = results.find((result) => result.index === openResult) || null

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
            <ListItemButton
              selected={showScenarios}
              onClick={() => {
                const list = customCases.scenarios || []
                if (!showScenarios) {
                  setResults([])
                  setOpenResult(null)
                }
                setShowScenarios(true)
                setScenarioId((current) => (list.some((item) => item.id === current) ? current : (list[0]?.id || '')))
              }}
              sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
            >
              <ListItemText primary="Scenarios" slotProps={{ primary: { variant: 'subtitle2' } }} />
              {(customCases.scenarios || []).length > 0 && <Chip size="small" label={customCases.scenarios.length} variant="outlined" />}
            </ListItemButton>
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
                            selected={operation.id === selectedId && !showScenarios}
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
                            <RoleMark operation={operation} />
                            <IdMark operation={operation} saved={customCases.ids?.[operation.id]} />
                            <PaginationMark pagination={resolvePagination(operation.pagination, customCases.paging?.[operation.id])} />
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
            {showScenarios ? (
              <ScenarioEditor
                scenarios={customCases.scenarios || []}
                scenarioId={scenarioId}
                operations={operations}
                profiles={profiles.map((profile) => ({
                  id: profile.id,
                  label: profile.id === activeId
                    ? profileLabel({ name: profileName, oauth })
                    : profileLabel(profile),
                }))}
                activeProfileId={activeId}
                variableNames={Object.keys(defaults.variables || {})}
                running={running}
                activity={activity}
                tps={tps}
                onTps={setTps}
                onSelect={setScenarioId}
                onChange={writeScenarios}
                onRun={runScenario}
                onStop={() => {
                  stopRef.current = true
                  setStopRequested(true)
                }}
              />
            ) : selected ? (
              <Stack spacing={1.75}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                  <MethodBadge method={selected.method} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle1" noWrap sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15 }}>
                      {selected.path}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{selected.summary}</Typography>
                  </Box>
                  <PayloadIdChoice
                    operation={selected}
                    saved={customCases.ids?.[selected.id]}
                    onChange={(name) => writePayloadId(selected, name)}
                  />
                  <Button size="small" variant="text" onClick={() => setDefaultsOpen(true)} sx={{ color: 'text.secondary', flexShrink: 0 }}>
                    Defaults
                  </Button>
                  <PaginationMark pagination={selectedPaging} />
                </Stack>

                <ResponseSchema
                  key={`${selected.id}-${activeMode}`}
                  responses={responsesForMode(selected.responses, activeMode)}
                  requestNames={new Set(fields.map((field) => field.name))}
                  expected={defaults.responses?.[selected.id] || {}}
                  patterns={defaults.patterns || {}}
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
                    patterns={defaults.patterns || {}}
                  />
                ) : activeMode === 'trial' ? (
                  <TrialForm
                    operation={selected}
                    fields={resolvedFields}
                    defaults={defaults}
                    exclusive={selected.exclusive || []}
                    trial={operationTrial || { request: {}, omit: [] }}
                    onChange={(next) => writeTrial(selected.id, next)}
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
                          <TableCell sx={{ width: 72, px: 0.75 }}>
                            {activeMode === 'combination' ? (
                              <Tooltip title={anyCombinationVary ? 'Uncheck all' : 'Check fields that can vary'}>
                                <FormControlLabel
                                  sx={{ mr: 0, ml: -0.75 }}
                                  control={(
                                    <Checkbox
                                      size="small"
                                      checked={allCombinationVary}
                                      indeterminate={anyCombinationVary && !allCombinationVary}
                                      disabled={combinationVaryNames.length === 0}
                                      inputProps={{ 'aria-label': anyCombinationVary ? 'Uncheck all' : 'Check fields that can vary' }}
                                      onChange={() => applyCombinationVary(selected.id, combinationVaryNames, !anyCombinationVary)}
                                    />
                                  )}
                                  label="Vary"
                                />
                              </Tooltip>
                            ) : 'Vary'}
                          </TableCell>
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
                        const nestedComposite = underComposite(field.name, resolvedFields)
                        const composite = compositeField(field, resolvedFields)
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
                                  checked={nestedComposite ? false : resolved.vary}
                                  disabled={activeMode !== 'combination' || nestedComposite || (!resolved.vary && resolved.values.length === 0 && !field.enum)}
                                  onChange={(event) => {
                                    const on = event.target.checked
                                    updateField(field.name, { vary: on, textVary: on })
                                    writeVary(selected.id, field.name, on)
                                  }}
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
                              hidden={nestedComposite || ((field.enum || (field.object && !field.required && !objectHasChildren(field, resolvedFields))) && resolved.vary)}
                              objectComposite={activeMode === 'combination' && objectHasChildren(field, resolvedFields) && !composite}
                              objectMode={activeMode === 'combination' ? combinationObjectMode(resolved, resolvedFields) : undefined}
                              childFields={composite ? descendantScalars(resolved, resolvedFields) : []}
                              onChange={(sample) => writeEndpoint(field, sample)}
                              onInherit={() => writeEndpoint(field, '', true)}
                              onObject={(next) => writeObject(field, next)}
                              onChild={(child, sample) => writeEndpoint(child, sample)}
                            />
                          </TableCell>
                          {activeMode === 'combination' && (
                            <TableCell>
                              {nestedComposite ? (
                                <Typography variant="caption" color="text.secondary">Set with {compositeParentName(field.name, resolvedFields)}</Typography>
                              ) : composite ? (
                                <CompositionSetsEditor
                                  field={resolved}
                                  fields={resolvedFields}
                                  values={customCases.values?.[selected.id]?.[field.name] || []}
                                  onChange={(list) => writeCombinationValues(selected.id, field.name, list)}
                                />
                              ) : field.enum ? (
                                <CombinationEnumEditor
                                  field={resolved}
                                  disabled={!resolved.vary}
                                  values={customCases.values?.[selected.id]?.[field.name]}
                                  onChange={(list) => writeCombinationValues(selected.id, field.name, list)}
                                />
                              ) : (field.object && !field.required) && resolved.vary ? (
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

                {activeMode === 'combination' && selectedPaging && (
                  <RecordSet
                    fields={fields}
                    columns={selected.recordColumns}
                    pagination={selectedPaging}
                    dataset={datasets[selected.id]}
                    overrides={customCases.filters?.[selected.id]}
                    onDataset={(next) => writeDataset(selected.id, next)}
                    onFilter={(field, patch, detected) => writeFilter(selected.id, field, patch, detected)}
                  />
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
                  {preparation && activeMode !== 'trial' && (
                    <FixtureCalls
                      calls={preparation.calls}
                      operations={operations}
                      saved={customCases.steps?.[selected.id]}
                      fields={preparation.fields}
                      disabled={running}
                      onChange={(patch) => writeFixtureStep(selected.id, patch)}
                    />
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                    <Button
                      variant="contained"
                      startIcon={<PlayArrowIcon />}
                      disabled={running || planned.length === 0}
                      onClick={run}
                    >
                      {activeMode === 'trial' ? 'Send request' : `Run ${planned.length} ${planned.length === 1 ? 'check' : 'checks'}`}
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
                      onChange={(event) => {
                        pageRate.current.touched = true
                        setTps(event.target.value)
                      }}
                      sx={{ width: { xs: '100%', sm: 170 } }}
                      slotProps={{ htmlInput: { min: 0.1, step: 1 } }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      {planned.length === 0 && skippedCombinations > 0
                          ? 'Every combination is excluded.'
                          : planned.length === 0 && skippedErrors > 0
                            ? 'Every error check is excluded.'
                          : planned.length === 0
                            ? 'This operation has no checks in the selected mode.'
                            : running
                              ? `${finishedChecks} of ${planned.length} complete${activity ? ` · ${activity}` : ''}`
                              : activeMode === 'trial'
                              ? 'Sends one request at this rate. Pagination is not followed.'
                            : `List checks follow the spec. Requests stay within this rate.${skippedCombinations > 0 ? ` ${skippedCombinations} combinations skipped.` : ''}${skippedErrors > 0 ? ` ${skippedErrors} error ${skippedErrors === 1 ? 'check is' : 'checks are'} skipped.` : ''}${activeMode === 'combination' && datasets[selected?.id]?.rows?.length ? ` ${datasets[selected.id].rows.length} uploaded ${datasets[selected.id].rows.length === 1 ? 'record is' : 'records are'} filtered for each check.` : ''}`}
                    </Typography>
                    <PaginationHelp pagination={selectedPaging} />
                  </Stack>
                  {running && (
                    <LinearProgress
                      variant="determinate"
                      value={finishedChecks === 0 ? 0 : (finishedChecks / planned.length) * 100}
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
            onAddPattern={addPattern}
            onRenamePattern={renamePattern}
            onWritePattern={writePattern}
            onRemovePattern={removePattern}
            onWriteNamed={writeNamed}
            onRenameNamed={renameNamed}
            onRemoveNamed={removeNamed}
            onAddNamed={addNamed}
            onOauth={updateOauth}
            onRate={(value) => setDefaults((current) => ({ ...current, tps: value }))}
            onExport={() => downloadText('clients.yaml', profilesYaml(commitProfiles(), activeId), 'application/yaml')}
            onImport={(file) => importLibrary(file, 'defaults')}
            onImportProfiles={(file) => importLibrary(file, 'profiles')}
            onDismissNotice={() => setLibraryNotice('')}
            operations={operations}
            selectedId={selectedId}
            paging={customCases.paging}
            onPaging={writePaging}
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
                  onOpen={() => { listRuns().then(setSavedRuns).catch(() => {}) }}
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
                  {skippedCount > 0 && <Chip size="small" label={`${skippedCount} skipped`} variant="outlined" />}
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
                    <TableCell width="32%">Response</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((result) => (
                    <TableRow
                      key={result.index}
                      hover
                      onClick={() => {
                        if (ignoreResultOpen()) return
                        setOpenResult(result.index)
                      }}
                      sx={{
                        cursor: 'pointer',
                        boxShadow: result.passed || result.skipped ? 'none' : 'inset 3px 0 0 #b42318',
                        bgcolor: result.passed || result.skipped ? 'inherit' : '#fff8f7',
                      }}
                    >
                      <TableCell sx={{ color: 'text.secondary' }}>{result.index}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={result.skipped ? 'Skip' : result.passed ? 'Pass' : 'Fail'}
                          sx={{
                            bgcolor: result.skipped ? '#f1f5f9' : result.passed ? '#e7f6f3' : '#fdecec',
                            color: result.skipped ? '#526070' : result.passed ? '#0f766e' : '#b42318',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{result.status || '—'}</TableCell>
                      <TableCell>{result.label}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{String(result.detail || '').replace(/\n+/g, ' ')}</TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                        <ResponsePreview result={result} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>}
            {viewed && (
              <Dialog open onClose={() => setOpenResult(null)} maxWidth="md" fullWidth>
                <ResultDialog result={viewed} onClose={() => setOpenResult(null)} />
              </Dialog>
            )}
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

const ROLE_TONE = {
  create: { label: 'C', title: 'Create', bg: '#ecfdf3', fg: '#166534' },
  read: { label: 'R', title: 'Read', bg: '#f0f9ff', fg: '#0369a1' },
  update: { label: 'U', title: 'Update', bg: '#f5f3ff', fg: '#6d28d9' },
  delete: { label: 'D', title: 'Delete', bg: '#fdecec', fg: '#b42318' },
}

function RoleMark({ operation }) {
  const tone = ROLE_TONE[operation?.role]
  if (!tone) return null
  const paged = operation.role === 'read' && operation.pagination
  return (
    <Chip
      size="small"
      label={tone.label}
      title={paged ? `${tone.title}, with pagination` : tone.title}
      sx={{ bgcolor: tone.bg, color: tone.fg, fontWeight: 700, height: 22, flexShrink: 0, mt: 0.25 }}
    />
  )
}

function IdMark({ operation, saved }) {
  const record = resolvedId(operation, saved)
  if (!record) return null
  const title = record.source === 'path' ? `Needs ${record.name}` : `Payload field ${record.name}`
  return (
    <Chip
      size="small"
      label="ID"
      title={title}
      sx={{ bgcolor: '#eef2ff', color: '#3730a3', fontWeight: 700, height: 22, flexShrink: 0, mt: 0.25 }}
    />
  )
}

function PayloadIdChoice({ operation, saved, onChange }) {
  if (recordId(operation)) return null
  if (!['read', 'update', 'delete'].includes(operation?.role)) return null
  const fields = payloadIdFields(operation)
  if (!fields.length) return null
  const detected = detectPayloadId(operation)
  const current = resolvedId(operation, saved)
  return (
    <TextField
      select
      size="small"
      label="ID field"
      value={current?.name || ''}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 180, flexShrink: 0 }}
    >
      <MenuItem value="">None</MenuItem>
      {fields.map((field) => (
        <MenuItem key={field.name} value={field.name}>
          {field.name}{detected?.name === field.name ? ' · detected' : ''}
        </MenuItem>
      ))}
    </TextField>
  )
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

function ExpectedField({ field, status, automatic, stored, hasOverride, objectArray, patterns, fields = [], onExpected }) {
  const match = objectArray ? 'equals' : (hasOverride ? (stored.match || 'equals') : 'equals')
  const shown = stored.text
  const ordered = stored.ordered
  const ignoreCase = stored.ignoreCase === true
  const nullable = stored.nullable === true
  const rules = stored.rules || []
  const objectArrayError = objectArray ? parseObjectArray(shown)?.error : ''
  const regexIssue = match === 'regex' && shown ? compilePattern(shown).error : ''
  const names = Object.keys(patterns || {})
  const patternOptions = shown && match === 'pattern' && !names.includes(shown) ? [shown, ...names] : names

  function write(patch) {
    const next = { text: shown, ordered, match, ignoreCase, nullable, rules, ...patch }
    if (next.match === 'null') next.nullable = false
    if (objectArray) {
      onExpected(status, field.name, next.ordered || next.text || next.nullable ? storedExpectation({ ...next, match: 'equals' }) : undefined)
      return
    }
    if (next.match === 'null') {
      onExpected(status, field.name, storedExpectation({ ...next, match: 'null', text: '', nullable: false }))
      return
    }
    if (next.match === 'equals' && next.text === automatic && !next.ordered && !next.ignoreCase && !next.nullable) {
      onExpected(status, field.name, undefined)
      return
    }
    onExpected(status, field.name, storedExpectation(next))
  }

  return (
    <Stack spacing={0.5} sx={{ minWidth: 240 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
        {!objectArray && (
          <TextField
            select
            size="small"
            value={match}
            onChange={(event) => {
              const next = event.target.value
              if (next === 'when') {
                write({
                  match: 'when',
                  rules: rules.length > 0 ? rules : [{ when: [], match: 'equals', text: shown || automatic || '', ignoreCase: false }],
                })
                return
              }
              write({
                match: next,
                text: next === match ? shown : (next === 'equals' || next === 'expression' ? automatic : ''),
                ignoreCase: next === 'equals' || next === 'expression' ? ignoreCase : false,
                rules: [],
              })
            }}
            slotProps={{ htmlInput: { 'aria-label': 'Match' } }}
            sx={{ width: 118, flexShrink: 0 }}
          >
            <MenuItem value="equals">Value</MenuItem>
            <MenuItem value="expression">Expression</MenuItem>
            <MenuItem value="null">Null</MenuItem>
            <MenuItem value="pattern">Pattern</MenuItem>
            <MenuItem value="regex">Regex</MenuItem>
            <MenuItem value="when">When</MenuItem>
          </TextField>
        )}
        {match === 'null' && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Expects null
          </Typography>
        )}
        {match !== 'when' && match !== 'null' && (match === 'pattern' ? (
          <TextField
            select
            size="small"
            fullWidth
            value={patternOptions.includes(shown) ? shown : ''}
            onChange={(event) => write({ match: 'pattern', text: event.target.value })}
            helperText={names.length === 0 ? 'Add named patterns in Setting.' : undefined}
            slotProps={{
              htmlInput: { 'aria-label': 'Pattern' },
              select: { renderValue: (value) => value || 'Choose a pattern' },
            }}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Choose a pattern</MenuItem>
            {patternOptions.map((name) => (
              <MenuItem key={name} value={name}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">{name}</Typography>
                  {patterns[name] ? (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {patterns[name]}
                    </Typography>
                  ) : null}
                </Box>
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            size="small"
            fullWidth
            multiline={objectArray}
            minRows={objectArray ? 2 : undefined}
            value={shown}
            placeholder={
              objectArray
                ? '[{"field":"quantity"},{"field":"customerEmail"}]'
                : (match === 'regex' ? '^[A-Z0-9-]+$' : match === 'expression' ? (automatic || '@{name}') : (hasOverride ? 'Not checked' : (automatic || 'Not checked')))
            }
            error={Boolean(objectArrayError || regexIssue)}
            helperText={objectArrayError || regexIssue || undefined}
            onChange={(event) => write({ text: event.target.value })}
            slotProps={{ htmlInput: { 'aria-label': match === 'regex' ? 'Regex' : 'Expected' } }}
            sx={{ minWidth: 160, '& input, & textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
          />
        ))}
        {(match === 'equals' || match === 'expression') && !objectArray && (
          <Tooltip title="Case sensitive">
            <FormControlLabel
              sx={{ mr: 0, ml: 0, flexShrink: 0 }}
              control={(
                <Checkbox
                  size="small"
                  checked={!ignoreCase}
                  onChange={(event) => write({ ignoreCase: !event.target.checked })}
                  inputProps={{ 'aria-label': 'Case sensitive' }}
                />
              )}
              label="Case"
            />
          </Tooltip>
        )}
        {match !== 'null' && !objectArray && (
          <Tooltip title="Also accept JSON null">
            <FormControlLabel
              sx={{ mr: 0, ml: 0, flexShrink: 0 }}
              control={(
                <Checkbox
                  size="small"
                  checked={nullable}
                  onChange={(event) => write({ nullable: event.target.checked })}
                  inputProps={{ 'aria-label': 'Nullable' }}
                />
              )}
              label="Nullable"
            />
          </Tooltip>
        )}
        {hasOverride && (
          <Button size="small" onClick={() => onExpected(status, field.name, undefined)} sx={{ flexShrink: 0, minWidth: 0, color: 'text.secondary' }}>
            Default
          </Button>
        )}
      </Stack>
      {match === 'when' && (
        <ExpectedWhenEditor
          rules={rules}
          fields={fields}
          patterns={patterns}
          onChange={(next) => write({ match: 'when', rules: next })}
        />
      )}
    </Stack>
  )
}

function ExpectedWhenEditor({ rules, fields, patterns, onChange }) {
  const names = conditionFieldNames(fields, rules)
  const listed = rules.length > 0 ? rules : [{ when: [], match: 'equals', text: '', ignoreCase: false }]

  function update(index, patch) {
    onChange(listed.map((rule, itemIndex) => (itemIndex === index ? { ...emptyWhenRule(rule), ...patch } : emptyWhenRule(rule))))
  }

  function updateWhen(index, nextWhen) {
    update(index, { when: nextWhen })
  }

  return (
    <Stack spacing={0.75}>
      {listed.map((rule, index) => {
        const current = emptyWhenRule(rule)
        return (
          <Box key={index} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.75 }}>
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                {current.when.length === 0 ? 'Else' : 'When'}
              </Typography>
              {current.when.map((condition, conditionIndex) => (
                <Stack key={conditionIndex} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                  <TextField
                    select
                    size="small"
                    value={names.includes(condition.field) ? condition.field : (condition.field || '')}
                    onChange={(event) => {
                      const next = [...current.when]
                      next[conditionIndex] = { ...condition, field: event.target.value }
                      updateWhen(index, compactWhen(next))
                    }}
                    slotProps={{ htmlInput: { 'aria-label': 'When field' } }}
                    sx={{ minWidth: 140, flex: 1 }}
                  >
                    <MenuItem value="">Field</MenuItem>
                    {names.map((name) => (
                      <MenuItem key={name} value={name}>{name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    value={condition.op || 'eq'}
                    onChange={(event) => {
                      const next = [...current.when]
                      next[conditionIndex] = { ...condition, op: event.target.value }
                      updateWhen(index, compactWhen(next))
                    }}
                    slotProps={{ htmlInput: { 'aria-label': 'When compare' } }}
                    sx={{ width: 108, flexShrink: 0 }}
                  >
                    <MenuItem value="eq">=</MenuItem>
                    <MenuItem value="null">Null</MenuItem>
                    <MenuItem value="not-null">Not null</MenuItem>
                  </TextField>
                  {condition.op !== 'null' && condition.op !== 'not-null' && (
                    <TextField
                      size="small"
                      value={condition.value || ''}
                      placeholder="Value"
                      onChange={(event) => {
                        const next = [...current.when]
                        next[conditionIndex] = { ...condition, value: event.target.value }
                        updateWhen(index, compactWhen(next))
                      }}
                      slotProps={{ htmlInput: { 'aria-label': 'When value' } }}
                      sx={{ minWidth: 90, flex: 1, '& input': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
                    />
                  )}
                  <Button
                    size="small"
                    onClick={() => updateWhen(index, compactWhen(current.when.filter((_, itemIndex) => itemIndex !== conditionIndex)))}
                    sx={{ minWidth: 0, flexShrink: 0, color: 'text.secondary' }}
                  >
                    Remove
                  </Button>
                </Stack>
              ))}
              <Button
                size="small"
                onClick={() => {
                  const used = new Set(current.when.map((item) => item.field))
                  const nextField = names.find((name) => !used.has(name)) || names[0] || ''
                  updateWhen(index, compactWhen([...current.when, { field: nextField, op: 'eq', value: '' }]))
                }}
                sx={{ alignSelf: 'flex-start', minWidth: 0 }}
              >
                And
              </Button>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  select
                  size="small"
                  value={current.match}
                  onChange={(event) => update(index, { match: event.target.value, text: event.target.value === current.match ? current.text : '' })}
                  slotProps={{ htmlInput: { 'aria-label': 'Then match' } }}
                  sx={{ width: 118, flexShrink: 0 }}
                >
                  <MenuItem value="equals">Value</MenuItem>
                  <MenuItem value="expression">Expression</MenuItem>
                  <MenuItem value="null">Null</MenuItem>
                  <MenuItem value="pattern">Pattern</MenuItem>
                  <MenuItem value="regex">Regex</MenuItem>
                </TextField>
                {current.match === 'null' ? (
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    Expects null
                  </Typography>
                ) : (
                <ExpectedThenInput
                  match={current.match}
                  text={current.text}
                  patterns={patterns}
                  onChange={(text) => update(index, { text })}
                />
                )}
                {(current.match === 'equals' || current.match === 'expression') && (
                  <Tooltip title="Case sensitive">
                    <FormControlLabel
                      sx={{ mr: 0, ml: 0, flexShrink: 0 }}
                      control={(
                        <Checkbox
                          size="small"
                          checked={!current.ignoreCase}
                          onChange={(event) => update(index, { ignoreCase: !event.target.checked })}
                          inputProps={{ 'aria-label': 'Case sensitive' }}
                        />
                      )}
                      label="Case"
                    />
                  </Tooltip>
                )}
              </Stack>
              {listed.length > 1 && (
                <Button size="small" onClick={() => onChange(listed.filter((_, itemIndex) => itemIndex !== index).map(emptyWhenRule))} sx={{ alignSelf: 'flex-start', minWidth: 0, color: 'text.secondary' }}>
                  Remove rule
                </Button>
              )}
            </Stack>
          </Box>
        )
      })}
      <Button
        size="small"
        onClick={() => onChange([...listed.map(emptyWhenRule), { when: [], match: 'equals', text: '', ignoreCase: false }])}
        sx={{ alignSelf: 'flex-start', minWidth: 0 }}
      >
        Add rule
      </Button>
    </Stack>
  )
}

function ExpectedThenInput({ match, text, patterns, onChange }) {
  const names = Object.keys(patterns || {})
  const patternOptions = text && match === 'pattern' && !names.includes(text) ? [text, ...names] : names
  const regexIssue = match === 'regex' && text ? compilePattern(text).error : ''
  if (match === 'pattern') {
    return (
      <TextField
        select
        size="small"
        fullWidth
        value={patternOptions.includes(text) ? text : ''}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Then pattern' },
          select: { renderValue: (value) => value || 'Choose a pattern' },
        }}
        sx={{ minWidth: 140 }}
      >
        <MenuItem value="">Choose a pattern</MenuItem>
        {patternOptions.map((name) => (
          <MenuItem key={name} value={name}>{name}</MenuItem>
        ))}
      </TextField>
    )
  }
  return (
    <TextField
      size="small"
      fullWidth
      value={text}
      placeholder={match === 'regex' ? '^[A-Z0-9-]+$' : match === 'expression' ? 'Missing field: @{leaf}' : 'Expected'}
      error={Boolean(regexIssue)}
      helperText={regexIssue || undefined}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ htmlInput: { 'aria-label': match === 'regex' ? 'Then regex' : 'Then value' } }}
      sx={{ minWidth: 140, '& input': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
    />
  )
}

function emptyWhenRule(rule) {
  return {
    when: Array.isArray(rule?.when) ? rule.when : [],
    match: rule?.match === 'pattern' || rule?.match === 'regex' || rule?.match === 'expression' || rule?.match === 'null'
      ? rule.match
      : 'equals',
    text: rule?.text == null ? '' : String(rule.text),
    ignoreCase: rule?.ignoreCase === true,
  }
}

function compactWhen(conditions) {
  return (conditions || []).filter((item) => String(item.field || '').trim())
}

function conditionFieldNames(fields, rules) {
  const names = []
  for (const field of fields || []) {
    const type = String(field.type || '')
    if (type === 'object') continue
    if (type.startsWith('array of ') && !['string', 'integer', 'number', 'boolean', 'enum'].includes(type.slice('array of '.length))) continue
    if (field.name) names.push(field.name)
  }
  for (const rule of rules || []) {
    for (const condition of rule.when || []) {
      const name = String(condition.field || '').trim()
      if (name && !names.includes(name)) names.push(name)
    }
  }
  return names
}

function ResponseSchema({ responses, requestNames, expected, patterns = {}, onExpected }) {
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
                {'@{name}'} is the value sent for that request field. A null or omitted request field, including a blank list filter, is treated as any value and is not compared. Text is compared after leading and trailing spaces are removed, and a value that is only spaces is null. A success field with the same name starts as that reference, except nextCursor, which is a new token for the next page. Clear a value to skip it. {'${name}'} still reads a variable. Null expects the JSON value null. Nullable accepts null in addition to the expected value, pattern, or regex. Pattern uses a named regular expression from Setting. Regex accepts a pattern here, optionally written as /pattern/flags. When applies the first matching rule: each rule can require other fields to equal a value, be null, or be not null, then check this field as a value, null, pattern, or regex. Case keeps a value comparison case sensitive. For an array of objects, enter a JSON array. Each object must appear, and only the fields you include are compared. In sequence requires those objects to be the first items, in the order you wrote.
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
                    const storedEntry = hasOverride ? readExpectation(stored[field.name]) : { text: automatic, ordered: false, match: 'equals' }
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
                                    checked={storedEntry.ordered}
                                    onChange={(event) => onExpected(
                                      current.status,
                                      field.name,
                                      event.target.checked || storedEntry.text ? { value: storedEntry.text, ordered: event.target.checked } : undefined,
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
                            <ExpectedField
                              field={field}
                              status={current.status}
                              automatic={automatic}
                              stored={storedEntry}
                              hasOverride={hasOverride}
                              objectArray={objectArray}
                              patterns={patterns}
                              fields={current.fields}
                              onExpected={onExpected}
                            />
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
  for (const name of ['status', 'code', 'message', 'exceptions[].field', 'exceptions[].code', 'exceptions[].message', 'exception[].type', 'exception[].code', 'exception[].message']) {
    if (!names.includes(name)) names.push(name)
  }
  return names
}

function nextErrorColumn(columns, fields) {
  const preferred = ['exceptions[].code', 'exception[].code', 'exceptions[].message', 'exception[].message', 'exceptions[].field', 'exception[].type', 'status']
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
  for (const name of ['exceptions[].field', 'exceptions[].code', 'exceptions[].message', 'exception[].type', 'exception[].code', 'exception[].message', 'status']) {
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

const ERROR_GROUPS = [
  ['malformed', 'Malformed JSON', 'The body cannot be read.'],
  ['missing', 'Missing fields', 'A required field is left out. Text expects NotBlank. Other fields expect NotNull.'],
  ['disallowed', 'Disallowed value', 'A required field is null, or the value is outside the enum, pattern, length, or numeric range. Null expects NotNull.'],
  ['type', 'Invalid data type', 'A number, boolean, date, or timestamp is sent in the wrong form.'],
]

const ERROR_TABLE_SX = {
  width: '100%',
  '& th, & td': { py: 0.55, px: 1, verticalAlign: 'middle' },
  '& th': { bgcolor: 'background.paper', color: 'text.secondary', fontSize: 12, fontWeight: 600, borderBottomColor: 'divider' },
}

function ErrorCases({ fields, responses, cases, checks, onChecks, custom, onChange, patterns = {} }) {
  const responseFields = errorResponseFields(responses)
  const columns = Array.isArray(checks.columns) ? checks.columns : [DEFAULT_ERROR_COLUMN]
  const rows = checks.rows && typeof checks.rows === 'object' ? checks.rows : {}
  const matches = checks.matches && typeof checks.matches === 'object' ? checks.matches : {}
  const [openGroups, setOpenGroups] = useState({ malformed: true, missing: true, disallowed: true, type: true, custom: true })
  const publish = (nextColumns, nextRows, nextMatches = matches) => onChecks({ columns: nextColumns, rows: nextRows, matches: nextMatches })
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
    const nextMatches = { ...matches }
    if (Object.prototype.hasOwnProperty.call(nextMatches, previous)) {
      nextMatches[name] = nextMatches[previous]
      delete nextMatches[previous]
    }
    publish(nextColumns, nextRows, nextMatches)
  }
  const changeMatch = (column, match) => {
    const nextMatches = { ...matches }
    if (errorMatchType(match) === 'equals') delete nextMatches[column]
    else nextMatches[column] = errorMatchType(match)
    publish(columns, rows, nextMatches)
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
    const nextMatches = { ...matches }
    delete nextMatches[name]
    publish(columns.filter((_, columnIndex) => columnIndex !== index), nextRows, nextMatches)
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
      const match = errorMatchType(matches[column])
      const fallback = match === 'equals' ? errorColumnDefault(row, column) : ''
      const value = Object.prototype.hasOwnProperty.call(values, column) ? values[column] : fallback
      if (String(value ?? '') !== String(fallback ?? '')) stored[column] = value
    }
    const next = {}
    if (status !== baseline) next.status = status
    if (Object.keys(stored).length > 0) next.values = stored
    if (saved.include === false) next.include = false
    const nextRows = { ...rows }
    if (Object.keys(next).length > 0) nextRows[key] = next
    else delete nextRows[key]
    publish(columns, nextRows)
  }
  const applyCategory = (row) => publish(columns, applyErrorRowToGroup(rows, cases, row))
  const applyInclude = (groupRows, included) => publish(columns, applyErrorInclude(rows, groupRows, included))
  const listed = ERROR_GROUPS.map(([id, title, detail]) => ({
    id,
    title,
    detail,
    rows: cases.filter((item) => item.group === id),
  }))
  const emptyTitles = listed.filter((group) => group.rows.length === 0).map((group) => group.title)
  return (
    <Stack spacing={1.25}>
      <ErrorColumnBar
        columns={columns}
        matches={matches}
        responseFields={responseFields}
        onColumn={changeColumn}
        onMatch={changeMatch}
        onAdd={addColumn}
        onRemove={removeColumn}
      />
      {emptyTitles.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {emptyTitles.join(' and ')} {emptyTitles.length === 1 ? 'is' : 'are'} not generated for this operation.
        </Typography>
      )}
      {listed.filter((group) => group.rows.length > 0).map((group) => (
        <ErrorGroupCard
          key={group.id}
          title={group.title}
          open={openGroups[group.id] !== false}
          onToggle={() => setOpenGroups((current) => ({ ...current, [group.id]: current[group.id] === false }))}
          rows={group.rows}
          saved={rows}
          onInclude={applyInclude}
        >
          <ErrorTable
            rows={group.rows}
            columns={columns}
            matches={matches}
            saved={rows}
            patterns={patterns}
            onCommit={commit}
            onApply={applyCategory}
            onInclude={applyInclude}
          />
        </ErrorGroupCard>
      ))}
      <CustomErrorEditor
        fields={fields}
        columns={columns}
        matches={matches}
        patterns={patterns}
        cases={custom}
        open={openGroups.custom !== false}
        onToggle={() => setOpenGroups((current) => ({ ...current, custom: current.custom === false }))}
        onChange={onChange}
      />
    </Stack>
  )
}

function ErrorColumnBar({ columns, matches, responseFields, onColumn, onMatch, onAdd, onRemove }) {
  const unused = nextErrorColumn(columns, responseFields)
  return (
    <Stack spacing={0.75} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 1 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="subtitle2">Response fields</Typography>
          <ErrorHelp />
        </Stack>
        <Button size="small" onClick={onAdd} disabled={!unused} sx={{ minWidth: 0 }}>Add field</Button>
      </Stack>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {columns.map((column, index) => (
          <Stack
            key={`${column}-${index}`}
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: 'center',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              pl: 1,
              pr: 0.25,
              py: 0.25,
              minWidth: 0,
            }}
          >
            <TextField
              select
              variant="standard"
              size="small"
              value={column}
              onChange={(event) => onColumn(index, event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': `Response field ${index + 1}` }, input: { disableUnderline: true } }}
              sx={{ minWidth: 132, '& .MuiSelect-select': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, py: 0.5 } }}
            >
              {responseFields.map((name) => (
                <MenuItem key={name} value={name} disabled={columns.includes(name) && name !== column}>{name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              variant="standard"
              size="small"
              value={errorMatchType(matches?.[column])}
              onChange={(event) => onMatch(column, event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': `${column} comparison` }, input: { disableUnderline: true } }}
              sx={{ minWidth: 92, '& .MuiSelect-select': { fontSize: 12.5, py: 0.5, color: 'text.secondary' } }}
            >
              <MenuItem value="equals">Value</MenuItem>
              <MenuItem value="expression">Expression</MenuItem>
              <MenuItem value="contains">Contains</MenuItem>
              <MenuItem value="pattern">Pattern</MenuItem>
              <MenuItem value="regex">Regex</MenuItem>
            </TextField>
            <IconButton size="small" aria-label="Remove column" onClick={() => onRemove(index)} sx={{ color: 'text.secondary' }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}

function ErrorHelp() {
  const [anchor, setAnchor] = useState(null)
  return (
    <>
      <IconButton
        size="small"
        aria-label="How error checks are compared"
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ color: 'text.secondary' }}
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ width: { xs: 320, sm: 440 }, p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>Error checks</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            Include a row to run it. The checkbox in a category header selects or clears every row in that category. Copy on a row applies that row’s expected values to the rest of the category.
          </Typography>
          <Stack spacing={1}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>Comparison</Typography>
              <Typography variant="body2" color="text.secondary">
                Value is an exact literal. Expression is an exact match after placeholders. Contains finds the text inside the response. Pattern uses a named regular expression from Setting. Regex accepts a pattern here.
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>Placeholders</Typography>
              <Typography variant="body2" color="text.secondary">
                @{'{leaf}'} is the field name, @{'{field}'} is the full path, and @{'{name}'} is a value sent on the request. Missing field: @{'{leaf}'} becomes Missing field: reference.
              </Typography>
            </Box>
            {ERROR_GROUPS.map(([id, title, detail]) => (
              <Box key={id}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{title}</Typography>
                <Typography variant="body2" color="text.secondary">{detail}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  )
}

function ErrorGroupCard({ title, open, onToggle, rows, saved, onInclude, children }) {
  const includedCount = rows.filter((row) => saved[errorCheckKey(row)]?.include !== false).length
  const anyIncluded = includedCount > 0
  const allIncluded = rows.length > 0 && includedCount === rows.length
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: 'center', px: 1, py: 0.5, cursor: 'pointer', bgcolor: 'action.hover' }}
        onClick={onToggle}
      >
        <ExpandMoreIcon sx={{ fontSize: 20, color: 'text.secondary', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {includedCount === rows.length ? rows.length : `${includedCount} of ${rows.length}`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={anyIncluded ? 'Uncheck all' : 'Check all'}>
          <FormControlLabel
            sx={{ mr: 0.25, ml: 0 }}
            onClick={(event) => event.stopPropagation()}
            control={(
              <Checkbox
                size="small"
                checked={allIncluded}
                indeterminate={anyIncluded && !allIncluded}
                disabled={rows.length === 0}
                inputProps={{ 'aria-label': anyIncluded ? 'Uncheck all' : 'Check all' }}
                onChange={() => onInclude(rows, !anyIncluded)}
              />
            )}
            label={<Typography variant="caption" color="text.secondary">All</Typography>}
          />
        </Tooltip>
      </Stack>
      <Collapse in={open} unmountOnExit={false}>
        {children}
      </Collapse>
    </Box>
  )
}

function ErrorTable({ rows, columns, matches, saved, patterns, onCommit, onApply, onInclude }) {
  return (
    <Box sx={{ overflow: 'auto' }}>
      <Table size="small" stickyHeader sx={ERROR_TABLE_SX}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 220 }}>Check</TableCell>
            <TableCell sx={{ width: 88 }}>Status</TableCell>
            {columns.map((column, index) => (
              <TableCell key={`${column}-${index}`} sx={{ minWidth: 168 }}>
                <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'text.primary', fontWeight: 500, lineHeight: 1.3 }}>
                  {column}
                </Typography>
                <Typography variant="caption" color="text.secondary">{errorMatchLabel(matches[column])}</Typography>
              </TableCell>
            ))}
            <TableCell sx={{ width: 44 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const key = errorCheckKey(row)
            const rowSaved = saved[key] || {}
            const included = rowSaved.include !== false
            const status = rowSaved.status || String(row.expect?.status || 400)
            const canApply = Boolean(rowSaved.status) || Object.keys(rowSaved.values || {}).length > 0
            return (
              <TableRow key={key} hover sx={{ opacity: included ? 1 : 0.48 }}>
                <TableCell>
                  <FormControlLabel
                    sx={{ mr: 0, ml: 0, alignItems: 'center', width: '100%', '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 } }}
                    control={(
                      <Checkbox
                        size="small"
                        checked={included}
                        inputProps={{ 'aria-label': `Include ${row.label}` }}
                        onChange={() => onInclude([row], !included)}
                      />
                    )}
                    label={<Typography variant="body2" title={row.label} sx={{ lineHeight: 1.3 }}>{row.label}</Typography>}
                  />
                </TableCell>
                <TableCell>
                  <TextField select size="small" value={status} onChange={(event) => onCommit(row, { status: event.target.value })} sx={{ width: 76 }}>
                    {errorStatusOptions(status).map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                  </TextField>
                </TableCell>
                {columns.map((column) => {
                  const values = rowSaved.values || {}
                  const match = errorMatchType(matches?.[column])
                  const fallback = match === 'equals' ? errorColumnDefault(row, column) : ''
                  const value = Object.prototype.hasOwnProperty.call(values, column) ? values[column] : fallback
                  return (
                    <TableCell key={column}>
                      <ErrorExpectedInput
                        match={match}
                        value={value}
                        patterns={patterns}
                        ariaLabel={`${row.label} ${column}`}
                        onChange={(next) => onCommit(row, { column, value: next })}
                      />
                    </TableCell>
                  )
                })}
                <TableCell>
                  <Tooltip title="Copy this row to the rest of the category">
                    <span>
                      <IconButton
                        size="small"
                        color="inherit"
                        disabled={!canApply}
                        aria-label="Use for all"
                        onClick={() => onApply(row)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </span>
                  </Tooltip>
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
  if (column === 'exceptions[].code' || column === 'exception[].code' || column === 'code') return item.code || ''
  if (column === 'exceptions[].message' || column === 'exception[].message' || column === 'message') return item.message || ''
  return ''
}

function errorMatchLabel(raw) {
  const match = errorMatchType(raw)
  if (match === 'expression') return 'Expression'
  if (match === 'contains') return 'Contains'
  if (match === 'pattern') return 'Pattern'
  if (match === 'regex') return 'Regex'
  return 'Value'
}

function insertPlaceholder(shown, token) {
  if (String(shown || '').includes(token)) return shown
  return `${shown || ''}${token}`
}

function ErrorToken({ token, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      title={`Insert ${token}`}
      sx={{
        border: 0,
        bgcolor: 'transparent',
        color: 'text.secondary',
        cursor: 'pointer',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10.5,
        lineHeight: 1.2,
        px: 0.25,
        '&:hover': { color: 'primary.main' },
      }}
    >
      {token}
    </Box>
  )
}

function ErrorExpectedInput({ match, value, patterns = {}, ariaLabel, placeholder, onChange }) {
  const names = Object.keys(patterns)
  const shown = value == null ? '' : String(value)
  const patternOptions = shown && match === 'pattern' && !names.includes(shown) ? [shown, ...names] : names
  const regexIssue = match === 'regex' && shown ? compilePattern(shown).error : ''
  if (match === 'pattern') {
    return (
      <TextField
        select
        size="small"
        fullWidth
        value={patternOptions.includes(shown) ? shown : ''}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': ariaLabel || 'Pattern', title: names.length === 0 ? 'Add named patterns in Setting.' : undefined },
          select: { renderValue: (selected) => selected || 'Pattern' },
        }}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="">Pattern</MenuItem>
        {patternOptions.map((name) => (
          <MenuItem key={name} value={name}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">{name}</Typography>
              {patterns[name] ? (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {patterns[name]}
                </Typography>
              ) : null}
            </Box>
          </MenuItem>
        ))}
      </TextField>
    )
  }
  return (
    <TextField
      size="small"
      fullWidth
      value={shown}
        placeholder={placeholder || (match === 'regex' || match === 'expression' ? 'Missing field: @{leaf}' : match === 'contains' ? '@{leaf}' : 'Expected')}
      error={Boolean(regexIssue)}
      helperText={regexIssue || undefined}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        htmlInput: { 'aria-label': ariaLabel || (match === 'regex' ? 'Regex' : match === 'expression' ? 'Expression' : 'Expected') },
        input: match === 'expression' ? {
          endAdornment: (
            <InputAdornment position="end" sx={{ gap: 0, mr: -0.5 }}>
              <ErrorToken token="@{leaf}" onClick={() => onChange(insertPlaceholder(shown, '@{leaf}'))} />
              <ErrorToken token="@{field}" onClick={() => onChange(insertPlaceholder(shown, '@{field}'))} />
            </InputAdornment>
          ),
        } : undefined,
      }}
      sx={{ minWidth: 120, '& input': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
    />
  )
}

function CustomErrorEditor({ fields, columns, matches = {}, patterns = {}, cases, open = true, onToggle, onChange }) {
  const [draft, setDraft] = useState({ name: '', status: '400', field: 'body', value: '', omit: false })
  const names = []
  for (const field of fields || []) {
    if (field?.name && !names.includes(field.name)) names.push(field.name)
  }
  if (!names.includes('body')) names.push('body')
  const updateCase = (id, patch) => onChange(cases.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const includedCount = cases.filter((item) => item.include !== false).length
  const anyIncluded = includedCount > 0
  const allIncluded = cases.length > 0 && includedCount === cases.length
  const setInclude = (ids, included) => {
    const selected = new Set(ids)
    onChange(cases.map((item) => {
      if (!selected.has(item.id)) return item
      if (included) {
        if (item.include !== false) return item
        const rest = { ...item }
        delete rest.include
        return rest
      }
      return { ...item, include: false }
    }))
  }
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
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: 'center', px: 1, py: 0.5, cursor: 'pointer', bgcolor: 'action.hover' }}
        onClick={onToggle}
      >
        <ExpandMoreIcon sx={{ fontSize: 20, color: 'text.secondary', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        <Typography variant="subtitle2">Custom</Typography>
        <Typography variant="caption" color="text.secondary">{cases.length || 'None'}</Typography>
        <Box sx={{ flex: 1 }} />
        {cases.length > 0 && (
          <Tooltip title={anyIncluded ? 'Uncheck all' : 'Check all'}>
            <FormControlLabel
              sx={{ mr: 0.25, ml: 0 }}
              onClick={(event) => event.stopPropagation()}
              control={(
                <Checkbox
                  size="small"
                  checked={allIncluded}
                  indeterminate={anyIncluded && !allIncluded}
                  inputProps={{ 'aria-label': anyIncluded ? 'Uncheck all' : 'Check all' }}
                  onChange={() => setInclude(cases.map((item) => item.id), !anyIncluded)}
                />
              )}
              label={<Typography variant="caption" color="text.secondary">All</Typography>}
            />
          </Tooltip>
        )}
      </Stack>
      <Collapse in={open} unmountOnExit={false}>
        {cases.length > 0 && (
          <Box sx={{ overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={ERROR_TABLE_SX}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 220 }}>Check</TableCell>
                  <TableCell sx={{ width: 88 }}>Status</TableCell>
                  {columns.map((column) => (
                    <TableCell key={column} sx={{ minWidth: 168 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: 'text.primary', fontWeight: 500, lineHeight: 1.3 }}>
                        {column}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{errorMatchLabel(matches[column])}</Typography>
                    </TableCell>
                  ))}
                  <TableCell sx={{ width: 44 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {cases.map((item) => (
                  <TableRow key={item.id} hover sx={{ opacity: item.include === false ? 0.48 : 1 }}>
                    <TableCell>
                      <FormControlLabel
                        sx={{ mr: 0, ml: 0, alignItems: 'flex-start', width: '100%', '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 } }}
                        control={(
                          <Checkbox
                            size="small"
                            checked={item.include !== false}
                            inputProps={{ 'aria-label': `Include ${item.name}` }}
                            onChange={() => setInclude([item.id], item.include === false)}
                          />
                        )}
                        label={(
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" noWrap title={item.name}>{item.name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>{item.omit ? `${item.field} omitted` : item.field || 'body'}</Typography>
                          </Box>
                        )}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField select size="small" value={item.status || '400'} onChange={(event) => updateCase(item.id, { status: event.target.value })} sx={{ width: 76 }}>
                        {errorStatusOptions(item.status).map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <ErrorExpectedInput
                          match={errorMatchType(matches[column])}
                          value={customExpected(item, column)}
                          patterns={patterns}
                          ariaLabel={`${item.name} ${column}`}
                          onChange={(next) => updateValue(item, column, next)}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Tooltip title="Remove">
                        <IconButton size="small" aria-label="Remove" onClick={() => onChange(cases.filter((candidate) => candidate.id !== item.id))} sx={{ color: 'text.secondary' }}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', px: 1, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <TextField size="small" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} sx={{ width: 140 }} />
          <TextField select size="small" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} sx={{ width: 88 }} slotProps={{ htmlInput: { 'aria-label': 'Status' } }}>
            {errorStatusOptions(draft.status).map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
          </TextField>
          <TextField select size="small" value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value, omit: false })} sx={{ width: 150 }} slotProps={{ htmlInput: { 'aria-label': 'Send field' } }}>
            <MenuItem value="">Any</MenuItem>
            {names.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder={draft.field === 'body' ? 'Body text' : 'Value'} value={draft.value} disabled={draft.omit && draft.field !== 'body'} onChange={(event) => setDraft({ ...draft, value: event.target.value })} sx={{ width: 140 }} />
          {draft.field !== 'body' && draft.field !== '' && (
            <FormControlLabel
              sx={{ mr: 0, ml: 0 }}
              control={<Checkbox size="small" checked={draft.omit} onChange={(event) => setDraft({ ...draft, omit: event.target.checked })} />}
              label={<Typography variant="caption">Omit</Typography>}
            />
          )}
          <Button size="small" variant="outlined" onClick={add}>Add</Button>
        </Stack>
      </Collapse>
    </Box>
  )
}

function CustomExpected({ responses, status, fields, patterns = {}, onChange }) {
  const { content, error, objectArrays } = customResponseFields(responses)
  const used = new Set(fields.map((field) => field.path))
  const next = nextCustomField(used, content, error, status)
  const write = (index, patch) => onChange(fields.map((field, fieldIndex) => {
    if (fieldIndex !== index) return field
    const nextField = { ...field, ...patch }
    if (errorMatchType(nextField.match) === 'equals') delete nextField.match
    else nextField.match = errorMatchType(nextField.match)
    if (!nextField.ordered) delete nextField.ordered
    return nextField
  }))
  const optionsFor = (current) => {
    const known = new Set([...content, ...error])
    const extra = current && !known.has(current) ? [current] : []
    return { content: [...extra.filter((name) => !error.includes(name) && !content.includes(name)), ...content], error }
  }
  return (
    <Box>
      <Typography variant="subtitle2">Expected response</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        Each row is a response field and how it is compared. Value is exact. Expression fills @{'{ }'} then matches exactly — Missing field: @{'{leaf}'} uses the omitted request field. Contains finds the text. Pattern uses a named regular expression from Setting. Regex accepts a pattern here. Several exceptions[] fields must match the same exception.
      </Typography>
      {fields.length > 0 && (
        <Box sx={{ overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 220 }}>Response field</TableCell>
                <TableCell sx={{ width: 128 }}>Compare</TableCell>
                <TableCell>Expected</TableCell>
                <TableCell sx={{ width: 44 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field, index) => {
                const options = optionsFor(field.path)
                const objectArray = objectArrays.has(field.path)
                const match = objectArray ? 'equals' : errorMatchType(field.match)
                const arrayError = objectArray ? parseObjectArray(field.equals)?.error : ''
                return (
                  <TableRow key={`${field.path}-${index}`} hover>
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
                      {objectArray ? (
                        <Typography variant="body2" color="text.secondary">Value</Typography>
                      ) : (
                        <TextField
                          select
                          size="small"
                          value={match}
                          onChange={(event) => write(index, { match: event.target.value })}
                          slotProps={{ htmlInput: { 'aria-label': `${field.path} comparison` } }}
                          sx={{ width: 118 }}
                        >
                          <MenuItem value="equals">Value</MenuItem>
                          <MenuItem value="expression">Expression</MenuItem>
                          <MenuItem value="contains">Contains</MenuItem>
                          <MenuItem value="pattern">Pattern</MenuItem>
                          <MenuItem value="regex">Regex</MenuItem>
                        </TextField>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        {objectArray ? (
                          <TextField
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            placeholder='[{"field":"quantity"}]'
                            value={field.equals || ''}
                            error={Boolean(arrayError)}
                            helperText={arrayError || undefined}
                            onChange={(event) => write(index, { equals: event.target.value })}
                            sx={{ '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
                          />
                        ) : (
                          <ErrorExpectedInput
                            match={match}
                            value={field.equals || ''}
                            patterns={patterns}
                            placeholder={match === 'equals' ? '@{name}' : undefined}
                            ariaLabel={`${field.path} expected`}
                            onChange={(equals) => write(index, { equals })}
                          />
                        )}
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
                      <Tooltip title="Remove">
                        <IconButton size="small" aria-label="Remove" onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))} sx={{ color: 'text.secondary' }}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
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

function TrialForm({ operation, fields, defaults, exclusive = [], trial, onChange }) {
  const active = trial || { request: {}, omit: [] }

  function updateRequest(name, raw, field) {
    const request = { ...active.request }
    const inherited = effectiveSample(field, operation.id, defaults)
    if (field.object) {
      if (objectChoice(raw) === objectChoice(inherited)) delete request[name]
      else request[name] = raw
    } else if (raw === '') {
      request[name] = ''
    } else if (String(coerceFieldValue(field, raw)) === String(inherited ?? '')) {
      delete request[name]
    } else {
      request[name] = coerceFieldValue(field, raw)
    }
    onChange({ request, omit: active.omit || [] })
  }

  function toggleOmit(name) {
    const omit = new Set(active.omit || [])
    if (omit.has(name)) omit.delete(name)
    else omit.add(name)
    onChange({ request: active.request || {}, omit: [...omit] })
  }

  function fillDefaults() {
    onChange({ request: {}, omit: [] })
  }

  function clearValues() {
    const request = {}
    const next = { request, omit: [] }
    for (const field of fields) {
      if (customAncestorClosed(field.name, fields, next, defaults, operation)) continue
      request[field.name] = field.object ? OBJECT_EMPTY : ''
    }
    onChange(next)
  }

  return (
    <Box sx={{ overflow: 'auto', maxHeight: 'min(440px, calc(100vh - 420px))', border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 210 }}>Field</TableCell>
            <TableCell>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Box component="span">Value</Box>
                <Tooltip title="Fill every field with its default">
                  <Button size="small" onClick={fillDefaults} sx={{ minWidth: 0, py: 0, px: 0.5 }}>
                    Defaults
                  </Button>
                </Tooltip>
                <Tooltip title="Clear all values">
                  <Button size="small" onClick={clearValues} sx={{ minWidth: 0, py: 0, px: 0.5 }}>
                    Clear
                  </Button>
                </Tooltip>
              </Stack>
            </TableCell>
            <TableCell sx={{ width: 72 }}>Omit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fields.map((field) => {
            if (customAncestorClosed(field.name, fields, active, defaults, operation)) return null
            const omitted = (active.omit || []).includes(field.name)
            const hasValue = Object.prototype.hasOwnProperty.call(active.request || {}, field.name)
            const inherited = effectiveSample(field, operation.id, defaults)
            const shown = omitted ? '' : (hasValue ? active.request[field.name] : inherited)
            const depth = field.name.split('.').length - 1
            return (
              <TableRow key={`${field.location}-${field.name}`} hover>
                <TableCell>
                  <FieldSummary field={field} depth={depth} exclusive={exclusive} />
                </TableCell>
                <TableCell sx={{ minWidth: 160 }}>
                  {field.object ? (
                    <ObjectChoice
                      value={objectChoice(shown)}
                      onChange={(mode) => updateRequest(field.name, mode === 'null' ? OBJECT_NULL : mode === 'empty' ? OBJECT_EMPTY : OBJECT_FIELDS, field)}
                    />
                  ) : (
                    <TextField
                      size="small"
                      fullWidth
                      disabled={omitted}
                      placeholder={omitted ? 'Omitted' : 'Value'}
                      value={shown == null ? '' : String(shown)}
                      onChange={(event) => updateRequest(field.name, event.target.value, field)}
                      slotProps={{ htmlInput: { 'aria-label': field.name } }}
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
              patterns={defaults.patterns || {}}
              onChange={(next) => update({ expect: { ...active.expect, fields: next } })}
            />
          </Stack>
        </Box>
      )}
    </Stack>
  )
}

const SETTING_SECTIONS = [
  { id: 'client', label: 'Client' },
  { id: 'variables', label: 'Variables' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'headers', label: 'Headers' },
  { id: 'token', label: 'Access token' },
  { id: 'pagination', label: 'Pagination' },
]

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
  onAddPattern,
  onRenamePattern,
  onWritePattern,
  onRemovePattern,
  onWriteNamed,
  onRenameNamed,
  onRemoveNamed,
  onAddNamed,
  onOauth,
  onRate,
  onExport,
  onImport,
  onImportProfiles,
  onDismissNotice,
  operations = [],
  selectedId = '',
  paging = {},
  onPaging,
}) {
  const [section, setSection] = useState('client')
  useEffect(() => {
    if (open) setSection('client')
  }, [open])
  const counts = {
    variables: Object.keys(defaults.variables || {}).length,
    patterns: Object.keys(defaults.patterns || {}).length,
    defaults: Object.keys(defaults.global || {}).length,
    headers: Object.keys(defaults.headers || {}).length,
    pagination: Object.keys(paging || {}).length,
  }
  const clientLabel = [profileName, oauth.clientId].map((item) => String(item || '').trim()).filter(Boolean).join(' · ')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      slotProps={{ paper: { sx: { height: 'min(760px, calc(100% - 48px))', display: 'flex', flexDirection: 'column' } } }}
    >
      <DialogTitle sx={{ pb: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontSize: 18, lineHeight: 1.3 }}>Setting</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{clientLabel || 'Client'}</Typography>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <List dense disablePadding sx={{ width: { xs: '100%', sm: 196 }, flexShrink: 0, borderRight: { sm: 1 }, borderBottom: { xs: 1, sm: 0 }, borderColor: 'divider', py: 1, display: { xs: 'none', sm: 'block' }, bgcolor: '#f8fafc' }}>
          {SETTING_SECTIONS.map((item) => (
            <ListItemButton
              key={item.id}
              selected={section === item.id}
              onClick={() => setSection(item.id)}
              sx={{ mx: 1, borderRadius: 1, mb: 0.25, '&.Mui-selected': { bgcolor: '#e8eef8' } }}
            >
              <ListItemText primary={item.label} slotProps={{ primary: { variant: 'body2', sx: { fontWeight: section === item.id ? 700 : 500 } } }} />
              {counts[item.id] != null && (
                <Typography variant="caption" color="text.secondary">{counts[item.id]}</Typography>
              )}
            </ListItemButton>
          ))}
        </List>
        <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', px: { xs: 2, sm: 3 }, py: 2.25 }}>
          <Stack direction="row" spacing={0.75} sx={{ mb: 2, display: { sm: 'none' }, flexWrap: 'wrap' }}>
            {SETTING_SECTIONS.map((item) => (
              <Chip
                key={item.id}
                label={counts[item.id] != null ? `${item.label} ${counts[item.id]}` : item.label}
                onClick={() => setSection(item.id)}
                variant={section === item.id ? 'filled' : 'outlined'}
                sx={section === item.id ? { bgcolor: '#e8eef8', fontWeight: 700 } : {}}
              />
            ))}
          </Stack>
          {notice && <Alert severity="info" sx={{ mb: 2 }} onClose={onDismissNotice}>{notice}</Alert>}
          {section === 'client' && (
            <SettingSection
              title="Client"
              hint="Name and request rate for this client. Switch clients from the menu in the top bar."
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 200px' }, gap: 1.5 }}>
                <TextField
                  size="small"
                  label="Client name"
                  value={profileName}
                  placeholder={oauth.clientId || 'Uses the client ID when blank'}
                  onChange={(event) => onRenameProfile(event.target.value)}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Requests / second"
                  type="number"
                  value={defaults.tps ?? '30'}
                  onChange={(event) => onRate(event.target.value)}
                  helperText="Each endpoint starts here."
                  slotProps={{ htmlInput: { min: 0.1, step: 1 } }}
                />
              </Box>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button size="small" variant="outlined" onClick={onAddProfile}>Add</Button>
                <Button size="small" variant="outlined" onClick={onDuplicateProfile}>Duplicate</Button>
                <Button size="small" variant="outlined" color="inherit" onClick={onRemoveProfile} disabled={profileCount < 2}>Remove</Button>
              </Stack>
            </SettingSection>
          )}
          {section === 'variables' && (
            <NamedMap
              title="Variables"
              typed
              hint="Write ${name} in a default or expected value. ${today+1d}, ${now-2h}, and ${uuid:12} are filled when the request is sent."
              entries={Object.entries(defaults.variables || {})}
              addLabel="Add variable"
              onAdd={onAddVariable}
              onRename={onRenameVariable}
              onValue={onWriteVariable}
              onRemove={onRemoveVariable}
            />
          )}
          {section === 'patterns' && (
            <NamedMap
              title="Patterns"
              mono
              valueLabel="Regex"
              hint="Named regular expressions for response fields that are not on the request. In the response schema, choose Pattern and pick a name, or choose Regex and type one. Use ^ and $ to match the whole value."
              entries={Object.entries(defaults.patterns || {})}
              addLabel="Add pattern"
              onAdd={onAddPattern}
              onRename={onRenamePattern}
              onValue={onWritePattern}
              onRemove={onRemovePattern}
            />
          )}
          {section === 'defaults' && (
            <NamedMap
              title="Defaults"
              typed
              hint="Used wherever that field name appears. A value saved on one endpoint replaces it."
              entries={Object.entries(defaults.global || {})}
              addLabel="Add default"
              onAdd={() => onAddNamed('global', 'field')}
              onRename={(current, next) => onRenameNamed('global', current, next)}
              onValue={(name, value) => onWriteNamed('global', name, value)}
              onRemove={(name) => onRemoveNamed('global', name)}
            />
          )}
          {section === 'headers' && (
            <NamedMap
              title="Headers"
              hint="Sent with every check. Authorization is replaced when this client requests an access token."
              entries={Object.entries(defaults.headers || {})}
              addLabel="Add header"
              onAdd={() => onAddNamed('headers', 'Authorization')}
              onRename={(current, next) => onRenameNamed('headers', current, next)}
              onValue={(name, value) => onWriteNamed('headers', name, value)}
              onRemove={(name) => onRemoveNamed('headers', name)}
            />
          )}
          {section === 'token' && (
            <SettingSection
              title="Access token"
              hint="Each request can send a bearer token from this OAuth server. Leave the token path blank to call the API without one."
            >
              <TextField
                size="small"
                label="OAuth base URL"
                value={idpBase}
                placeholder="https://idp.example"
                onChange={(event) => {
                  const next = event.target.value
                  onIdpBase(next)
                  onOauth({ audience: derivedAudience(oauth.tokenUrl, next) })
                }}
                fullWidth
                sx={{ mb: 1.5 }}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField
                  size="small"
                  label="Token path"
                  placeholder="/oauth/token"
                  value={relativeTokenPath(oauth.tokenUrl)}
                  onChange={(event) => {
                    const tokenUrl = relativeTokenPath(event.target.value)
                    onOauth({ tokenUrl, audience: derivedAudience(tokenUrl, idpBase) })
                  }}
                  fullWidth
                />
                <TextField size="small" label="Client ID" value={oauth.clientId} onChange={(event) => onOauth({ clientId: event.target.value })} fullWidth />
                <TextField
                  size="small"
                  label="Audience"
                  placeholder="OAuth base URL + token path"
                  value={oauth.audience || derivedAudience(oauth.tokenUrl, idpBase)}
                  onChange={(event) => onOauth({ audience: event.target.value })}
                  helperText="OAuth base URL + token path"
                  fullWidth
                />
                <TextField size="small" select label="Algorithm" value={oauth.algorithm} onChange={(event) => onOauth({ algorithm: event.target.value })}>
                  <MenuItem value="RS256">RS256</MenuItem>
                  <MenuItem value="ES256">ES256</MenuItem>
                  <MenuItem value="HS256">HS256</MenuItem>
                </TextField>
                <TextField size="small" label="Scope" value={oauth.scope} onChange={(event) => onOauth({ scope: event.target.value })} fullWidth />
                <TextField size="small" label="Lifetime (seconds)" value={oauth.lifetime} onChange={(event) => onOauth({ lifetime: event.target.value })} fullWidth />
              </Box>
              <TextField
                size="small"
                label={oauth.algorithm === 'HS256' ? 'Shared secret' : 'Private key (PKCS#8 PEM)'}
                value={oauth.privateKey}
                onChange={(event) => onOauth({ privateKey: event.target.value })}
                fullWidth
                multiline
                minRows={4}
                sx={{ mt: 1.5, '& textarea': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 } }}
              />
            </SettingSection>
          )}
          {section === 'pagination' && (
            <PaginationSetting
              operations={operations}
              selectedId={selectedId}
              paging={paging}
              onPaging={onPaging}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: 'divider', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <ImportButton label="Import defaults" onFile={onImport} />
          <ImportButton label="Import clients" accept=".yaml,.yml,.json,application/json,text/yaml" onFile={onImportProfiles} />
          <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={onExport}>Export</Button>
        </Stack>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}

function PaginationSetting({ operations, selectedId, paging, onPaging }) {
  const listed = Array.isArray(operations) ? operations : []
  const [operationId, setOperationId] = useState(selectedId || listed[0]?.id || '')
  useEffect(() => {
    if (selectedId) setOperationId(selectedId)
  }, [selectedId])
  const operation = listed.find((item) => item.id === operationId) || listed[0] || null
  const form = pagingForm(operation?.pagination, paging?.[operation?.id])
  function write(patch) {
    if (!operation || !onPaging) return
    onPaging(operation.id, { ...form, ...patch })
  }
  return (
    <SettingSection
      title="Pagination"
      hint="Detected names stay in use until you pick a mode for this endpoint. Cursor mode follows nextCursor until the last-page value."
    >
      {listed.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Load an OpenAPI document to configure pagination.</Typography>
      ) : (
        <Stack spacing={1.5}>
          <TextField
            select
            size="small"
            label="Operation"
            value={operation?.id || ''}
            onChange={(event) => setOperationId(event.target.value)}
            fullWidth
          >
            {listed.map((item) => (
              <MenuItem key={item.id} value={item.id}>{item.id}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Mode"
            value={form.mode}
            onChange={(event) => {
              const mode = event.target.value
              if (mode === 'detected') onPaging?.(operation.id, { mode: 'detected' })
              else write({ mode })
            }}
            fullWidth
          >
            {PAGING_MODES.map((item) => (
              <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>
            ))}
          </TextField>
          {form.mode === 'detected' && (
            <Typography variant="body2" color="text.secondary">{paginationSummary(resolvePagination(operation?.pagination, null))}</Typography>
          )}
          {form.mode !== 'none' && (
            <TextField
              size="small"
              label="Response records path"
              value={form.response.items}
              onChange={(event) => write({ response: { ...form.response, items: event.target.value } })}
              helperText="Dot path to the array of records, such as data.page.content. Leave blank to use the detected path."
              fullWidth
            />
          )}
          {form.mode === 'none' && (
            <Typography variant="body2" color="text.secondary">Each check sends one request.</Typography>
          )}
          {form.mode === 'cursor' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField size="small" label="Request page size" value={form.request.size} onChange={(event) => write({ request: { ...form.request, size: event.target.value } })} fullWidth />
              <TextField size="small" label="Request nextCursor" value={form.request.cursor} onChange={(event) => write({ request: { ...form.request, cursor: event.target.value } })} fullWidth />
              <SentinelFields
                label="First-page cursor"
                value={form.firstCursor}
                onChange={(next) => write({ firstCursor: next })}
              />
              <TextField size="small" label="Response nextCursor" value={form.response.cursor} onChange={(event) => write({ response: { ...form.response, cursor: event.target.value } })} fullWidth />
              <TextField size="small" label="Response this page size" value={form.response.pageSize} onChange={(event) => write({ response: { ...form.response, pageSize: event.target.value } })} fullWidth />
              <TextField size="small" label="Response total records" value={form.response.total} onChange={(event) => write({ response: { ...form.response, total: event.target.value } })} helperText="Leave blank when the API does not return a full count." fullWidth />
              <SentinelFields
                label="Last-page cursor"
                value={form.lastCursor}
                onChange={(next) => write({ lastCursor: next })}
              />
            </Box>
          )}
          {form.mode === 'page' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField size="small" label="Request page" value={form.request.page} onChange={(event) => write({ request: { ...form.request, page: event.target.value } })} fullWidth />
              <TextField size="small" label="Request page size" value={form.request.size} onChange={(event) => write({ request: { ...form.request, size: event.target.value } })} fullWidth />
              <TextField select size="small" label="First page index" value={String(form.pageBase ?? 0)} onChange={(event) => write({ pageBase: Number(event.target.value) })}>
                <MenuItem value="0">0</MenuItem>
                <MenuItem value="1">1</MenuItem>
              </TextField>
              <TextField size="small" label="Response page" value={form.response.page} onChange={(event) => write({ response: { ...form.response, page: event.target.value } })} fullWidth />
              <TextField size="small" label="Response page size" value={form.response.pageSize} onChange={(event) => write({ response: { ...form.response, pageSize: event.target.value } })} fullWidth />
              <TextField size="small" label="Response total records" value={form.response.total} onChange={(event) => write({ response: { ...form.response, total: event.target.value } })} fullWidth />
              <TextField size="small" label="Response total pages" value={form.response.totalPages} onChange={(event) => write({ response: { ...form.response, totalPages: event.target.value } })} fullWidth />
            </Box>
          )}
          {form.mode === 'offset' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField size="small" label="Request offset" value={form.request.offset} onChange={(event) => write({ request: { ...form.request, offset: event.target.value } })} fullWidth />
              <TextField size="small" label="Request page size" value={form.request.size} onChange={(event) => write({ request: { ...form.request, size: event.target.value } })} fullWidth />
              <TextField size="small" label="Response this page size" value={form.response.pageSize} onChange={(event) => write({ response: { ...form.response, pageSize: event.target.value } })} fullWidth />
              <TextField size="small" label="Response total records" value={form.response.total} onChange={(event) => write({ response: { ...form.response, total: event.target.value } })} helperText="Leave blank when the API does not return a full count." fullWidth />
            </Box>
          )}
          {form.mode === 'link' && (
            <TextField size="small" label="Response next link" value={form.response.nextLink} onChange={(event) => write({ response: { ...form.response, nextLink: event.target.value } })} helperText="A JSON field, or leave blank to use the Link header." fullWidth />
          )}
        </Stack>
      )}
    </SettingSection>
  )
}

function SentinelFields({ label, value, onChange }) {
  const type = value?.type || 'string'
  const showValue = type === 'string' || type === 'integer'
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: showValue ? { xs: '1fr', sm: '120px minmax(0, 1fr)' } : '1fr', gap: 1.5, gridColumn: '1 / -1' }}>
      <TextField
        select
        size="small"
        label={`${label} type`}
        value={type}
        onChange={(event) => onChange({ type: event.target.value, value: type === event.target.value ? (value?.value ?? '') : (event.target.value === 'integer' ? '0' : event.target.value === 'string' ? '0' : '') })}
      >
        {CURSOR_TYPES.map((item) => (
          <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>
        ))}
      </TextField>
      {showValue && (
        <TextField
          size="small"
          label={label}
          type={type === 'integer' ? 'number' : 'text'}
          value={value?.value ?? ''}
          onChange={(event) => onChange({ type, value: event.target.value })}
          fullWidth
        />
      )}
    </Box>
  )
}

function SettingSection({ title, hint, children }) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>{hint}</Typography>}
      {children}
    </Box>
  )
}

function NamedMap({ title, hint, entries, addLabel, onAdd, onRename, onValue, onRemove, typed = false, mono = false, valueLabel = 'Value' }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{title}</Typography>
          {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{hint}</Typography>}
        </Box>
        <Button size="small" variant="outlined" onClick={onAdd} sx={{ flexShrink: 0 }}>{addLabel}</Button>
      </Stack>
      <Box sx={{ minWidth: 0, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto' }}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1.5 }}>None yet.</Typography>
        ) : (
          <Table size="small" sx={{ width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: typed ? '34%' : '36%', bgcolor: '#f8fafc', color: 'text.secondary', fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ bgcolor: '#f8fafc', color: 'text.secondary', fontWeight: 700 }}>{valueLabel}</TableCell>
                <TableCell width={88} sx={{ bgcolor: '#f8fafc' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map(([name, value]) => (
                <VariableRow key={name} name={name} value={value} typed={typed} mono={mono} valueLabel={valueLabel} onRename={onRename} onValue={onValue} onRemove={onRemove} />
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

function VariableRow({ name, value, typed = false, mono = false, valueLabel = 'Value', onRename, onValue, onRemove }) {
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
          <TextField
            size="small"
            fullWidth
            value={String(value ?? '')}
            error={mono && value ? Boolean(compilePattern(value).error) : false}
            helperText={mono && value ? compilePattern(value).error : undefined}
            onChange={(event) => onValue(name, event.target.value)}
            slotProps={{ htmlInput: { 'aria-label': valueLabel } }}
            sx={mono ? { '& input': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } } : undefined}
          />
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

function RecordSet({ fields, columns, pagination, dataset, overrides, onDataset, onFilter }) {
  const detected = filterRules(fields, columns, {}, pagination)
  const rules = filterRules(fields, columns, overrides, pagination)
  const known = new Set(columns || [])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      const rows = await parseRecordFile(file)
      if (!rows.length) throw new Error('That file has no records.')
      onDataset({ name: file.name, rows, ordered: Boolean(dataset?.ordered) })
    } catch (failure) {
      setError(failure.message || 'Could not read that file.')
    }
  }
  return (
    <Stack spacing={0.75} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2">Expected records</Typography>
        {dataset?.rows?.length ? <Chip size="small" variant="outlined" label={dataset.rows.length} /> : null}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Upload the full set as csv, xlsx, or JSON. Each combination filters it and compares the rows from every page. Column names match the response.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="outlined" size="small" component="label" startIcon={<UploadFileIcon />}>
          Upload
          <input hidden type="file" accept=".csv,.xlsx,.json,text/csv,application/json" onChange={upload} />
        </Button>
        {dataset?.name ? <Typography variant="body2">{dataset.name}</Typography> : null}
        {dataset ? (
          <FormControlLabel
            sx={{ ml: 0 }}
            control={<Checkbox size="small" checked={Boolean(dataset.ordered)} onChange={(event) => onDataset({ ...dataset, ordered: event.target.checked })} />}
            label="Order matters"
          />
        ) : null}
        {dataset ? <Button size="small" color="inherit" onClick={() => onDataset(null)}>Remove</Button> : null}
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {rules.length > 0 && (
        <Box>
          <Button size="small" color="inherit" onClick={() => setOpen((value) => !value)} endIcon={<ExpandMoreIcon sx={{ transform: open ? 'none' : 'rotate(-90deg)' }} />}>
            Filter rules
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Request fields (left) filter the Excel using the matching Excel / response column (right). {filterSummary(rules)}
          </Typography>
          <Collapse in={open}>
            <Box sx={{ overflow: 'auto', maxHeight: 280, mt: 0.5 }}>
              <Table size="small" sx={{ width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Request field</TableCell>
                    <TableCell sx={{ width: '28%' }}>How it filters</TableCell>
                    <TableCell sx={{ width: '34%' }}>Excel / response column</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((rule) => {
                    const origin = detected.find((item) => item.field === rule.field) || rule
                    const unmapped = !rule.column.includes('.') && known.size > 0 && !known.has(rule.column)
                    return (
                      <TableRow key={rule.field}>
                        <TableCell>
                          <Typography variant="body2">{rule.field}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[rule.location || 'body', rule.or ? 'any of this group' : ''].filter(Boolean).join(' · ')}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={rule.mode}
                            onChange={(event) => onFilter(rule.field, { mode: event.target.value, column: rule.column }, origin)}
                          >
                            {filterModeChoices(origin).map((mode) => (
                              <MenuItem key={mode} value={mode}>{FILTER_MODE_LABELS[mode]}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            value={rule.column}
                            onChange={(event) => onFilter(rule.field, { mode: rule.mode, column: event.target.value }, origin)}
                            {...(unmapped ? { helperText: 'Not in the uploaded Excel or response' } : {})}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </Box>
      )}
    </Stack>
  )
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
  return (
    <Typography component="span" variant="caption" color="text.secondary" title={title} sx={{ fontWeight: 650, letterSpacing: 0.2 }}>
      excl.
    </Typography>
  )
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

function ResponsePreview({ result }) {
  const summary = responseSummary(result)
  const records = hasRecordList(result)
  const fields = !records && hasFieldMap(result)
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
      {summary ? (
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>{summary}</Typography>
      ) : result.text ? (
        <Typography variant="caption" color="text.secondary">JSON</Typography>
      ) : null}
      {records && <RecordsTableButton result={result} />}
      {fields && <ResponseFieldsButton result={result} />}
    </Stack>
  )
}

function ResultDialog({ result, onClose }) {
  const pages = resultPages(result)
  const diffs = Array.isArray(result.recordDiffs) ? result.recordDiffs : []
  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>{result.label}</Typography>
          <Typography variant="caption" color="text.secondary">
            HTTP {result.status || '—'} · {result.skipped ? 'Skip' : result.passed ? 'Pass' : 'Fail'}
          </Typography>
        </Box>
        <Button onClick={onClose}>Close</Button>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25}>
          {result.detail && (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result.detail}
            </Typography>
          )}
          {displayRequest(result.request) && (
            <PayloadBlock title="Request" text={displayRequest(result.request)} />
          )}
          {pages.length > 1 && (
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <CopyButton label="Copy all pages" text={pages.map((page) => `${page.label || 'Page'} · HTTP ${page.status}\n${displayRequest(page.request)}\n${page.text || ''}`).join('\n\n')} />
            </Stack>
          )}
          {pages.map((page, index) => (
            <Stack key={`${page.label}-${index}`} spacing={1.25}>
              {pages.length > 1 && displayRequest(page.request) && displayRequest(page.request) !== displayRequest(result.request) && (
                <PayloadBlock title={`${page.label || `Page ${index + 1}`} request`} text={displayRequest(page.request)} />
              )}
              <PayloadBlock
                title={pages.length > 1 ? `${page.label || `Page ${index + 1}`} · HTTP ${page.status}` : 'Response'}
                text={page.text || ''}
                diffs={diffs}
              />
            </Stack>
          ))}
          {result.enquiry && (
            <PayloadBlock title={`Enquiry ${result.enquiry.label} · HTTP ${result.enquiry.status}`} text={result.enquiry.text || ''} />
          )}
        </Stack>
      </DialogContent>
    </>
  )
}

function resultPages(result) {
  if (Array.isArray(result?.pages) && result.pages.length > 0) {
    return result.pages.map((page) => ({
      label: page.label,
      status: page.status,
      text: pretty(page.text || ''),
      ...(page.request ? { request: page.request } : {}),
    }))
  }
  if (result?.text) return [{ label: 'Response', status: result.status, text: pretty(result.text) }]
  return []
}

function PayloadBlock({ title, text, diffs = [] }) {
  const annotated = diffs.length > 0
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.25, py: 0.4, bgcolor: '#f8fafc' }}>
        <Typography variant="caption" sx={{ flex: 1, color: 'text.secondary', fontWeight: 700 }}>{title}</Typography>
        <CopyButton label={`Copy ${title}`} text={text} />
      </Stack>
      {annotated ? (
        <AnnotatedJson text={text} diffs={diffs} maxHeight={360} />
      ) : (
        <PayloadText text={text} open maxHeight={360} />
      )}
    </Box>
  )
}

function AnnotatedJson({ text, diffs, maxHeight = 360 }) {
  const { lines, notes } = useMemo(() => annotateJsonLines(pretty(text), diffs), [diffs, text])
  const hasNotes = notes.some(Boolean)
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: hasNotes ? 'minmax(0, 1fr) minmax(160px, 0.55fr)' : '1fr',
      maxHeight,
      overflow: 'auto',
      bgcolor: '#f8fafc',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.45,
    }}
    >
      <Box sx={{ m: 0, px: 1, py: 0.75, whiteSpace: 'pre', overflow: 'auto' }}>
        {lines.map((line, index) => (
          <Box
            key={`json-${index}`}
            sx={{
              minHeight: '1.45em',
              bgcolor: notes[index] ? '#fff1f0' : 'transparent',
              boxShadow: notes[index] ? 'inset 3px 0 0 #b42318' : 'none',
              px: 0.5,
            }}
          >
            {line || ' '}
          </Box>
        ))}
      </Box>
      {hasNotes ? (
        <Box sx={{ m: 0, px: 1, py: 0.75, borderLeft: 1, borderColor: 'divider', overflow: 'auto' }}>
          {notes.map((note, index) => (
            <Box
              key={`note-${index}`}
              sx={{
                minHeight: '1.45em',
                color: '#b42318',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                px: 0.5,
              }}
              title={note || undefined}
            >
              {note || ' '}
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

function CopyButton({ label, text }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip title={copied ? 'Copied' : label}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={async (event) => {
          event.stopPropagation()
          try {
            await navigator.clipboard.writeText(String(text || ''))
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          } catch {
            setCopied(false)
          }
        }}
        sx={{ color: copied ? 'primary.main' : 'text.secondary' }}
      >
        <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  )
}

function FixtureCalls({ calls, operations, saved, fields, disabled, onChange }) {
  const [openRole, setOpenRole] = useState('')
  const listed = Array.isArray(operations) ? operations : []
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.25 }}>Calls around this run</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
        Available on every endpoint. Pick a call when none is detected. Fields default to Auto: same name from the previous request, then response, then Setting defaults. Override with Default, Request, Response, or a Value. Values can use @{'{request.path}'} and @{'{response.path}'}.
      </Typography>
      <Stack spacing={1}>
        {calls.map((call) => {
          const checked = fixtureEnabled(saved, call.role)
          const selectedId = call.operation?.id || ''
          const fallback = call.role !== 'enquiry'
          const mapping = fields?.[call.role] || {}
          const open = openRole === call.role
          return (
            <Box key={call.role} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1, py: 0.75 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <FormControlLabel
                    sx={{ m: 0, mr: 0.5 }}
                    control={(
                      <Checkbox
                        size="small"
                        checked={checked}
                        disabled={disabled || !selectedId}
                        onChange={(event) => {
                          const enabled = event.target.checked
                          onChange({ [call.role]: enabled === fallback ? undefined : enabled })
                        }}
                      />
                    )}
                    label={(
                      <Typography variant="body2" sx={{ width: 64, fontWeight: 700 }}>
                        {call.role === 'before' ? 'Before' : call.role === 'after' ? 'After' : 'Enquiry'}
                      </Typography>
                    )}
                  />
                  <TextField
                    select
                    size="small"
                    value={selectedId}
                    disabled={disabled}
                    onChange={(event) => {
                      const next = event.target.value
                      const patch = { [`${call.role}Op`]: next || undefined }
                      if (!next) patch[call.role] = undefined
                      onChange(patch)
                    }}
                    sx={{ minWidth: 280, flex: 1 }}
                    slotProps={{ htmlInput: { 'aria-label': `${call.role} operation` } }}
                  >
                    <MenuItem value="">{call.detected ? 'Detected call' : 'Choose a call'}</MenuItem>
                    {listed.map((operation) => (
                      <MenuItem key={operation.id} value={operation.id}>
                        {operation.method} {operation.path}
                      </MenuItem>
                    ))}
                  </TextField>
                  {selectedId ? (
                    <Button
                      size="small"
                      color="inherit"
                      disabled={disabled}
                      onClick={() => setOpenRole((value) => (value === call.role ? '' : call.role))}
                      endIcon={<ExpandMoreIcon sx={{ transform: open ? 'none' : 'rotate(-90deg)' }} />}
                    >
                      Fields
                    </Button>
                  ) : null}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {call.operation
                    ? `${call.detected ? 'Detected · ' : 'Manual · '}${call.operation.summary || call.operation.id}. ${call.hint}`
                    : 'No call detected. Choose an operation to enable this step.'}
                </Typography>
                <Collapse in={open && Boolean(call.operation)}>
                  <AroundFieldMap
                    operation={call.operation}
                    mapping={mapping}
                    disabled={disabled}
                    previousHint={call.role === 'before' ? 'Before has no previous call, so Auto uses defaults.' : 'Previous is the earlier call in this run (request and response).'}
                    onChange={(next) => onChange({ [`${call.role}Fields`]: Object.keys(next).length ? next : undefined })}
                  />
                </Collapse>
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}

function AroundFieldMap({ operation, mapping, disabled, previousHint, onChange }) {
  const fields = (operation?.fields || []).filter((field) => field?.name && !field.object)
  if (fields.length === 0) {
    return <Typography variant="caption" color="text.secondary">This call has no scalar fields to map.</Typography>
  }
  function write(name, patch) {
    const current = mapping?.[name] || { source: 'auto', path: '', value: '' }
    const nextEntry = { ...current, ...patch }
    const next = { ...mapping }
    if (nextEntry.source === 'auto' && !nextEntry.path && !nextEntry.value) delete next[name]
    else next[name] = nextEntry
    onChange(next)
  }
  return (
    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{previousHint}</Typography>
      <Box sx={{ overflow: 'auto', maxHeight: 240 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Field</TableCell>
              <TableCell sx={{ width: '28%' }}>Source</TableCell>
              <TableCell>Path / value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field) => {
              const entry = mapping?.[field.name] || { source: 'auto', path: '', value: '' }
              const source = entry.source || 'auto'
              return (
                <TableRow key={field.name}>
                  <TableCell>
                    <Typography variant="body2">{field.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{field.location || 'body'}</Typography>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={source}
                      disabled={disabled}
                      onChange={(event) => write(field.name, { source: event.target.value, path: entry.path || '', value: entry.value || '' })}
                    >
                      <MenuItem value="auto">Auto</MenuItem>
                      <MenuItem value="default">Default</MenuItem>
                      <MenuItem value="request">Request</MenuItem>
                      <MenuItem value="response">Response</MenuItem>
                      <MenuItem value="value">Value</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>
                    {source === 'auto' || source === 'default' ? (
                      <Typography variant="caption" color="text.secondary">
                        {source === 'auto' ? 'Previous request → response → default' : 'Setting / sample default'}
                      </Typography>
                    ) : (
                      <TextField
                        size="small"
                        fullWidth
                        disabled={disabled}
                        value={source === 'value' ? (entry.value || '') : (entry.path || '')}
                        placeholder={source === 'value' ? '@{response.data.id}' : field.name}
                        onChange={(event) => write(field.name, source === 'value'
                          ? { source, value: event.target.value, path: entry.path || '' }
                          : { source, path: event.target.value, value: entry.value || '' })}
                        sx={{ '& input': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 } }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  )
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

function hasFieldMap(result) {
  const body = responseBody(result)
  return Boolean(body && typeof body === 'object' && !Array.isArray(body))
}

function responseBody(result) {
  if (result?.text) return parseJson(result.text)
  if (Array.isArray(result?.pages) && result.pages[0]?.text) return parseJson(result.pages[0].text)
  return null
}

let resultOpenGuard = 0

function suppressResultOpen() {
  resultOpenGuard += 1
  setTimeout(() => {
    resultOpenGuard = Math.max(0, resultOpenGuard - 1)
  }, 250)
}

function ignoreResultOpen() {
  return resultOpenGuard > 0
}

function RecordsTableButton({ result }) {
  const [open, setOpen] = useState(false)
  const close = (event) => {
    event?.stopPropagation?.()
    suppressResultOpen()
    setOpen(false)
  }
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: 11, lineHeight: 1.7, textTransform: 'none', flexShrink: 0 }}
      >
        Table
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        maxWidth="xl"
        fullWidth
        slotProps={{
          backdrop: {
            onClick: (event) => event.stopPropagation(),
            onMouseDown: (event) => event.stopPropagation(),
          },
        }}
      >
        <RecordsDialog result={result} onClose={close} />
      </Dialog>
    </>
  )
}

function RecordsDialog({ result, onClose }) {
  const records = useMemo(() => collectRecords(result) || [], [result])
  const columns = useMemo(() => recordColumns(records), [records])
  const diffs = Array.isArray(result?.recordDiffs) ? result.recordDiffs : []
  const pages = [...new Set(records.map((record) => record.page).filter(Boolean))]
  const showPage = pages.length > 1
  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>{records.length} records</Box>
        <Button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onClose(event)
          }}
        >
          Close
        </Button>
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
                    {columns.map((column) => {
                      const error = recordFieldError(diffs, record, index, column)
                      const display = cellDisplay(flat[column])
                      return (
                        <TableCell
                          key={column}
                          sx={{
                            whiteSpace: 'nowrap',
                            fontSize: 12.5,
                            p: 0,
                            bgcolor: error ? '#fff1f0' : 'inherit',
                            color: error ? '#b42318' : 'inherit',
                            boxShadow: error ? 'inset 0 -2px 0 #f3b4b0' : 'none',
                          }}
                        >
                          {error ? (
                            <Tooltip title={error} placement="top" arrow>
                              <Box sx={{ cursor: 'help', display: 'block', width: '100%', minHeight: 32, px: 2, py: 1, boxSizing: 'border-box' }}>
                                <CellValue display={display} />
                              </Box>
                            </Tooltip>
                          ) : (
                            <Box sx={{ display: 'block', width: '100%', minHeight: 32, px: 2, py: 1, boxSizing: 'border-box' }}>
                              <CellValue display={display} />
                            </Box>
                          )}
                        </TableCell>
                      )
                    })}
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

function recordFieldError(diffs, record, index, column) {
  if (!Array.isArray(diffs) || !diffs.length) return ''
  const flat = flattenRecord(record?.value)
  const hit = diffs.find((diff) => {
    if (Number.isInteger(diff.actualIndex) && diff.actualIndex === index) return true
    if (diff.matchKey && flat && Object.prototype.hasOwnProperty.call(flat, diff.matchKey)) {
      return String(flat[diff.matchKey]) === String(diff.matchValue)
        || (Number.isFinite(Number(flat[diff.matchKey])) && Number(flat[diff.matchKey]) === Number(diff.matchValue))
    }
    return false
  })
  const field = hit?.fields?.find((item) => item.path === column)
  return field?.message || ''
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
  return cellDisplay(value).text
}

function cellDisplay(value) {
  if (value === undefined) return { text: '(missing)', muted: true }
  if (value === null) return { text: 'null', muted: true }
  if (value === '') return { text: '""', muted: true }
  if (typeof value === 'object') return { text: JSON.stringify(value), muted: false }
  return { text: String(value), muted: false }
}

function CellValue({ display }) {
  return (
    <Box
      component="span"
      sx={{
        color: display.muted ? 'text.secondary' : 'inherit',
        fontStyle: display.muted ? 'italic' : 'normal',
        fontFamily: display.muted ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
      }}
    >
      {display.text}
    </Box>
  )
}

function ResponseFieldsButton({ result }) {
  const [open, setOpen] = useState(false)
  const close = (event) => {
    event?.stopPropagation?.()
    suppressResultOpen()
    setOpen(false)
  }
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: 11, lineHeight: 1.7, textTransform: 'none', flexShrink: 0 }}
      >
        Fields
      </Button>
      <Dialog
        open={open}
        onClose={close}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        maxWidth="md"
        fullWidth
        slotProps={{
          backdrop: {
            onClick: (event) => event.stopPropagation(),
            onMouseDown: (event) => event.stopPropagation(),
          },
        }}
      >
        <ResponseFieldsDialog result={result} onClose={close} />
      </Dialog>
    </>
  )
}

function ResponseFieldsDialog({ result, onClose }) {
  const rows = useMemo(() => {
    const body = responseBody(result)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return []
    const flat = flattenRecord(body)
    return Object.keys(flat).map((path) => ({ path, value: flat[path] }))
  }, [result])
  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>Response fields</Box>
        <Button
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onClose(event)
          }}
        >
          Close
        </Button>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ overflow: 'auto', maxHeight: '70vh' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '36%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>Field</TableCell>
                <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>No fields in this response.</TableCell>
                </TableRow>
              ) : rows.map((row) => {
                const display = cellDisplay(row.value)
                return (
                  <TableRow key={row.path} hover>
                    <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, verticalAlign: 'top' }}>
                      {row.path}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      <CellValue display={display} />
                    </TableCell>
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

function PayloadText({ text, open, maxHeight = 220 }) {
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
      maxHeight: open ? maxHeight : 'none',
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

function displayRequest(request) {
  if (request == null || request === '' || request === '[object Object]') return ''
  if (typeof request === 'string') return request
  return formatRequestPayload(request) || ''
}

function formatRequestPayload(request) {
  if (request == null) return ''
  if (typeof request === 'string') return request
  if (typeof request !== 'object' || Array.isArray(request)) return formatRequestBody(request)
  const parts = []
  const path = request.path && typeof request.path === 'object' ? omitEmptyMap(request.path) : null
  const query = request.query && typeof request.query === 'object' ? omitEmptyMap(request.query) : null
  if (path && Object.keys(path).length > 0) parts.push(formatRequestBody(path))
  if (query && Object.keys(query).length > 0) parts.push(formatRequestBody(query))
  const body = formatRequestBody(request.body)
  if (body) parts.push(body)
  return parts.join('\n\n')
}

function omitEmptyMap(source) {
  const next = {}
  for (const [name, value] of Object.entries(source || {})) {
    if (isOmitted(value) || value === undefined) continue
    next[name] = value
  }
  return next
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
            {paginationSummary(pagination)} The tester reads the query parameters, the JSON body, and the success response. Setting → Pagination can replace the detected names. A name it does not recognize is sent only when you fill that sample.
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
    detail: 'The request uses a page size and a cursor such as nextCursor. The first page can send 0, null, or omit the cursor. The response returns the next cursor and may return this page size. Leave total records blank when the API does not publish a full count. The run stops when the response cursor matches the last-page value, is empty, repeats, or the page is shorter than size.',
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
    const first = pagination.firstCursor && pagination.firstCursor.type !== 'omit'
      ? `, first ${pagination.request.cursor}=${pagination.firstCursor.type === 'null' ? 'null' : pagination.firstCursor.value}`
      : ''
    const last = pagination.lastCursor && pagination.lastCursor.type !== 'omit'
      ? `, last when ${pathName(pagination.response.nextCursor)} is ${pagination.lastCursor.type === 'null' ? 'null' : pagination.lastCursor.value}`
      : ''
    const total = pagination.response.total ? `, until ${pathName(pagination.response.total)} is reached` : ''
    const items = pagination.response.items ? `, records at ${pathName(pagination.response.items)}` : ''
    return `This operation is treated as cursor pagination via ${pagination.request.cursor}${size}${first}${last}${total}${items}.`
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
  const meta = [depth === 0 ? field.location : '', fieldTypeLabel(field), ...constraintLabels(field)].filter(Boolean).join(' · ')
  return (
    <Stack spacing={0.15} sx={{ pl: depth * 1.5, minWidth: 0 }}>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: field.object ? 700 : 650, lineHeight: 1.3 }}>
          {leaf}
          {field.required ? (
            <Box component="span" title="Required" sx={{ color: 'primary.main', ml: 0.35, fontWeight: 800 }}>*</Box>
          ) : null}
        </Typography>
        <ExclusiveMark name={field.name} groups={exclusive} />
      </Stack>
      {meta && (
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, display: 'block' }}>
          {meta}
        </Typography>
      )}
    </Stack>
  )
}

function DefaultValue({ field, resolved, source, hidden = false, objectComposite = false, objectMode, childFields = [], onChange, onInherit, onObject, onChild }) {
  if (hidden) return null
  if (field.object) {
    const choice = objectMode || objectChoice(resolved.sample)
    const fieldsDefault = choice === 'fields' || choice === 'composite'
    return (
      <Stack spacing={0.75}>
        <ObjectChoice
          value={choice === 'composite' ? 'fields' : choice}
          composite={objectComposite}
          optional={!field.required}
          onChange={onObject}
        />
        {fieldsDefault && childFields.length > 0 && (
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            {childFields.map((child) => {
              const leaf = child.name.split('.').pop()
              return (
                <TextField
                  key={child.name}
                  size="small"
                  placeholder={leaf}
                  value={child.sample ?? ''}
                  onChange={(event) => onChild?.(child, coerceSample(child, event.target.value))}
                  slotProps={{ htmlInput: { 'aria-label': child.name } }}
                  sx={{ width: '100%', maxWidth: 120, flex: '1 1 88px' }}
                />
              )
            })}
          </Stack>
        )}
      </Stack>
    )
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
  const { constraints = {} } = field
  const min = constraints.minimum
  const max = constraints.maximum
  if (min != null && max != null) labels.push(`${min}–${max}`)
  else if (min != null) labels.push(`≥${min}`)
  else if (max != null) labels.push(`≤${max}`)
  const minLen = constraints.minLength
  const maxLen = constraints.maxLength
  if (minLen && maxLen) labels.push(`${minLen}–${maxLen} chars`)
  else if (maxLen) labels.push(`≤${maxLen} chars`)
  else if (minLen) labels.push(`≥${minLen} chars`)
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
  if (value === OBJECT_FIELDS) return 'Fields'
  if (value === OBJECT_EMPTY) return 'Empty'
  if (value === OBJECT_COMPOSITE) return 'Composite'
  return valueText(value)
}

function compositeParentName(name, fields) {
  const parts = String(name || '').split('.')
  for (let length = 1; length < parts.length; length += 1) {
    const parent = parts.slice(0, length).join('.')
    const field = (fields || []).find((item) => item?.object && item.name === parent)
    if (field && compositeField(field, fields)) return parent
  }
  return parts.slice(0, -1).join('.')
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
  if (field.format === 'date' || field.format === 'date-time') {
    return (
      <TypedValue
        value={field.sample ?? ''}
        kinds={field.format === 'date' ? ['date'] : ['timestamp']}
        format={field.format}
        placeholder={temporalPlaceholder(field.format) || 'Default'}
        onChange={onChange}
      />
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

function CombinationEnumEditor({ field, values, disabled = false, onChange }) {
  const loop = combinationEnumValues(field)
  const saved = Array.isArray(values) ? values.map((item) => parseSavedEnum(field, item)).filter((item) => item !== undefined) : null
  const chosen = saved && saved.length > 0 ? saved : loop
  const choiceSx = (on) => ({
    height: 22,
    borderColor: on ? 'primary.main' : 'divider',
    bgcolor: on ? 'rgba(15, 39, 68, 0.06)' : 'transparent',
    color: on ? 'primary.main' : 'text.secondary',
    pointerEvents: disabled ? 'none' : 'auto',
    opacity: disabled ? 0.55 : 1,
    '& .MuiChip-label': { px: 0.75, fontSize: 12, fontWeight: on ? 650 : 500 },
  })
  const toggle = (value) => {
    if (disabled) return
    const on = chosen.some((item) => storedEnumValue(item) === storedEnumValue(value))
    const next = on ? chosen.filter((item) => storedEnumValue(item) !== storedEnumValue(value)) : [...chosen, value]
    if (next.length === 0) return
    if (next.length === loop.length && loop.every((item) => next.some((current) => storedEnumValue(current) === storedEnumValue(item)))) {
      onChange([])
      return
    }
    onChange(next.map((item) => storedEnumValue(item)))
  }
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      {loop.map((value, index) => {
        const on = chosen.some((item) => storedEnumValue(item) === storedEnumValue(value))
        return (
          <Chip
            key={`${storedEnumValue(value)}-${index}`}
            size="small"
            variant="outlined"
            label={loopLabel(value)}
            onClick={() => toggle(value)}
            sx={choiceSx(on)}
          />
        )
      })}
    </Stack>
  )
}

function parseSavedEnum(field, extra) {
  if (isOmitted(extra) || extra === '@omit') return field.required ? undefined : OMIT
  if (extra === null || extra === '@null') return extra === '@null' || extra === null ? null : undefined
  const text = String(extra ?? '').trim()
  if (!text) return undefined
  const matched = (field.members || []).find((value) => value != null && String(value) === text)
  return matched === undefined ? undefined : matched
}

function sameStoredComposition(left, right) {
  return JSON.stringify(storedComposition(left) || null) === JSON.stringify(storedComposition(right) || null)
}

function CompositionSetsEditor({ field, fields, values, onChange }) {
  const children = descendantScalars(field, fields)
  const prefix = `${field.name}.`
  const emptyDraft = () => Object.fromEntries(children.map((child) => [child.name.slice(prefix.length), '']))
  const [draft, setDraft] = useState(emptyDraft)
  const held = objectDefaultChoice(field) === 'fields' ? defaultComposition(field, fields) : null
  const compositions = (values || []).filter((item) => item && typeof item === 'object' && !Array.isArray(item) && !sameStoredComposition(item, held))
  const tokens = (values || []).filter((item) => item === '@null' || item === '@empty' || item === '@omit')
  const filled = storedComposition(draft)
  const taken = !filled || sameStoredComposition(filled, held) || compositions.some((item) => sameStoredComposition(item, filled))
  const add = () => {
    if (taken) return
    onChange([...(values || []), filled])
    setDraft(emptyDraft())
  }
  const toggle = (token) => onChange((values || []).includes(token) ? (values || []).filter((item) => item !== token) : [...(values || []), token])
  const choiceSx = (on) => ({
    height: 22,
    borderColor: on ? 'primary.main' : 'divider',
    bgcolor: on ? 'rgba(15, 39, 68, 0.06)' : 'transparent',
    color: on ? 'primary.main' : 'text.secondary',
    '& .MuiChip-label': { px: 0.75, fontSize: 12, fontWeight: on ? 650 : 500 },
  })
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {compositions.map((value, index) => (
          <Chip
            key={`${valueText(value)}-${index}`}
            size="small"
            label={loopLabel(value)}
            onDelete={() => onChange(values.filter((item) => item !== value))}
          />
        ))}
        {!field.required && (
          <>
            <Chip size="small" variant="outlined" label="Null" onClick={() => toggle('@null')} sx={choiceSx(tokens.includes('@null'))} />
            <Chip size="small" variant="outlined" label="Empty" onClick={() => toggle('@empty')} sx={choiceSx(tokens.includes('@empty'))} />
            <Chip size="small" variant="outlined" label="Omit" onClick={() => toggle('@omit')} sx={choiceSx(tokens.includes('@omit'))} />
          </>
        )}
      </Stack>
      {children.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {children.map((child) => {
            const relative = child.name.slice(prefix.length)
            return (
              <TextField
                key={child.name}
                size="small"
                placeholder={relative}
                value={draft[relative] ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, [relative]: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    add()
                  }
                }}
                slotProps={{ htmlInput: { 'aria-label': relative } }}
                sx={{ width: '100%', maxWidth: 120, flex: '1 1 88px' }}
              />
            )
          })}
          <Button size="small" variant="outlined" onClick={add} disabled={!filled || taken} sx={{ flexShrink: 0, px: 1 }}>
            Add
          </Button>
        </Stack>
      )}
    </Stack>
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
  if (field.format === 'time') return ['text']
  if (field.type === 'boolean') return ['text', 'boolean']
  if (field.type === 'integer' || field.type === 'number') return ['text', 'number']
  if (field.type === 'string' && !(field.values?.length > 0)) return ['text', 'uuid']
  return ['text']
}

function temporalPlaceholder(format) {
  if (format === 'date') return 'YYYY-MM-DD'
  if (format === 'date-time') return 'YYYY-MM-DDThh:mm:ssZ'
  if (format === 'time') return 'HH:mm:ss'
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
      <Box sx={{ display: 'grid', gridTemplateColumns: kinds.length > 1 ? 'minmax(0, 1fr) 104px' : 'minmax(0, 1fr)', columnGap: 0.75, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 0.75, minWidth: 0, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder={placeholder}
            value={text}
            error={Boolean(invalid)}
            onChange={(event) => editTemporal(kind, event.target.value, onChange, setDraft)}
            onBlur={() => setDraft(null)}
            slotProps={{ htmlInput: { 'aria-label': 'Default' } }}
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
        {kinds.length > 1 && (
          <TextField
            select
            size="small"
            fullWidth
            value={shown}
            onChange={(event) => onChange(valueForKind(event.target.value, text))}
            slotProps={{ select: { 'aria-label': 'Type' } }}
          >
            {kinds.map((item) => <MenuItem key={item} value={item}>{kindLabel(item)}</MenuItem>)}
          </TextField>
        )}
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

function combinationVaryTargets(fields, resolvedFields) {
  const names = []
  for (const field of fields) {
    if (hiddenByObject(field, resolvedFields)) continue
    if (underComposite(field.name, resolvedFields)) continue
    const resolved = resolvedFields.find((item) => item.location === field.location && item.name === field.name) || field
    if (!field.enum && !resolved.vary && (resolved.values || []).length === 0) continue
    names.push(field.name)
  }
  return names
}

function hiddenByObject(field, resolvedFields) {
  const parts = field.name.split('.')
  for (let length = 1; length < parts.length; length += 1) {
    const parent = resolvedFields.find((item) => item.object && item.name === parts.slice(0, length).join('.'))
    const mode = objectChoice(parent.sample)
    if (parent && mode !== 'fields' && mode !== 'composite') return true
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
    const mode = objectChoice(raw)
    if (mode !== 'fields' && mode !== 'composite') return true
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

function ObjectChoice({ value, onChange, composite = false, optional = true }) {
  const selected = value === 'null' || value === 'empty' || value === 'composite' ? value : 'fields'
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={selected === 'composite' && !composite ? 'fields' : selected}
      onChange={(_event, next) => {
        if (next) onChange(next)
      }}
      sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { py: 0.15, px: 0.9, textTransform: 'none', fontSize: 12, lineHeight: 1.6 } }}
    >
      <ToggleButton value="fields">Fields</ToggleButton>
      {composite && <ToggleButton value="composite">Composite</ToggleButton>}
      {optional && <ToggleButton value="null">Null</ToggleButton>}
      {optional && <ToggleButton value="empty">Empty</ToggleButton>}
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
  const pagination = resolvePagination(operation.pagination, hooks.paging)
  const followPages = sent.kind !== 'trial' && sent.expect?.outcome !== 'error' && sent.expect?.outcome !== 'custom' && pagination
  let paging = followPages ? firstPageQuery(pagination, collectPaging(sent, pagination)) : { ...sent.query }
  const firstSent = followPages ? applyPaging(sent, pagination, paging, operation.fields) : { ...sent, query: paging }
  const request = { body: sent.rawBody != null ? sent.rawBody : firstSent.body, query: { ...firstSent.query }, path: sent.path }
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
    const pageSent = followPages ? applyPaging(sent, pagination, paging, operation.fields) : { ...sent, query: paging }
    const response = await callOperation(apiBase, idpBase, operation, pageSent, url, hooks.headers, hooks.oauth)
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
      request: { body: pageSent.body, query: { ...pageSent.query }, path: { ...pageSent.path } },
      label: stepLabel(pagination, reports.length, pageIndex, paging),
      pageIndex,
      offset: pagination?.request.offset ? Number(paging[pagination.request.offset] ?? 0) : 0,
      cursor: pagination?.request.cursor ? paging[pagination.request.cursor] : undefined,
    })
    const followed = followPages && response.status >= 200 && response.status < 300
    const step = followed ? planContinuation(pagination, paging, body, reports, response.link) : null
    if (!step) {
      break
    }
    hooks.onActivity(step.label)
    paging = step.query || paging
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
      request: report.request,
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
    return { status: response.status, text: await response.text(), link: response.headers.get('link'), location: response.headers.get('location') }
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
