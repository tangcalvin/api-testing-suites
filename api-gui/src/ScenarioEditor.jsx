import { useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { columnNames, iterationsFromCsv, newIteration, newScenario, newScenarioStep } from './openapi/scenarios'

export default function ScenarioEditor({
  scenarios,
  scenarioId,
  operations,
  profiles = [],
  activeProfileId = '',
  variableNames,
  running,
  activity,
  tps,
  onTps,
  onSelect,
  onChange,
  onRun,
  onStop,
}) {
  const scenario = scenarios.find((item) => item.id === scenarioId) || null
  const [paste, setPaste] = useState('')
  const [pasting, setPasting] = useState(false)
  const [columnName, setColumnName] = useState('')

  function replace(next) {
    onChange(scenarios.map((item) => (item.id === scenario.id ? { ...scenario, ...next } : item)))
  }

  function updateStep(id, patch) {
    replace({ steps: scenario.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)) })
  }

  function moveStep(index, direction) {
    const next = scenario.steps.slice()
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [step] = next.splice(index, 1)
    next.splice(target, 0, step)
    replace({ steps: next })
  }

  function addColumn() {
    const name = columnName.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || scenario.columns.includes(name)) return
    setColumnName('')
    replace({
      columns: [...scenario.columns, name],
      iterations: scenario.iterations.map((row) => ({ ...row, values: { ...row.values, [name]: row.values[name] || '' } })),
    })
  }

  function removeColumn(name) {
    replace({
      columns: scenario.columns.filter((item) => item !== name),
      iterations: scenario.iterations.map((row) => {
        const values = { ...row.values }
        delete values[name]
        return { ...row, values }
      }),
    })
  }

  const passes = Math.max(scenario?.iterations.length || 0, scenario?.steps.length ? 1 : 0)

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {scenarios.map((item) => (
          <Chip
            key={item.id}
            label={item.name || 'Scenario'}
            clickable
            onClick={() => onSelect(item.id)}
            sx={item.id === scenarioId ? { bgcolor: '#0f2744', color: '#fff' } : { bgcolor: '#f1f5f9', color: '#334155' }}
          />
        ))}
        <Button size="small" onClick={() => {
          const created = newScenario()
          onChange([...scenarios, created])
          onSelect(created.id)
        }}
        >
          Add scenario
        </Button>
      </Stack>
      {!scenario ? (
        <Typography variant="body2" color="text.secondary">
          A scenario runs several endpoints in order. Each row is one pass with its own field values.
        </Typography>
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            <TextField
              size="small"
              label="Scenario"
              value={scenario.name}
              onChange={(event) => replace({ name: event.target.value })}
              sx={{ flex: 1 }}
            />
            <Button size="small" color="inherit" onClick={() => {
              const next = scenarios.filter((item) => item.id !== scenario.id)
              onChange(next)
              onSelect(next[0]?.id || '')
            }}
            >
              Delete
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Steps run from top to bottom. A response field kept here can be used later as {'${name}'}. A failed step skips the rest of that row, and a cleanup step still runs.
          </Typography>
          <Stack spacing={1}>
            {scenario.steps.map((step, index) => (
              <StepCard
                key={step.id}
                index={index}
                step={step}
                operations={operations}
                profiles={profiles}
                activeProfileId={activeProfileId}
                onChange={(patch) => updateStep(step.id, patch)}
                onMove={(direction) => moveStep(index, direction)}
                onRemove={() => replace({ steps: scenario.steps.filter((item) => item.id !== step.id) })}
                first={index === 0}
                last={index === scenario.steps.length - 1}
              />
            ))}
            <Button
              size="small"
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => replace({ steps: [...scenario.steps, newScenarioStep(operations[0]?.id || '')] })}
              disabled={operations.length === 0}
            >
              Add step
            </Button>
          </Stack>
          <Stack spacing={0.75} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.25, py: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle2">Iterations</Typography>
              {scenario.iterations.length > 0 && <Chip size="small" variant="outlined" label={scenario.iterations.length} />}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              One row runs the whole series. A column name is used as {'${name}'} in any step.
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Column"
                value={columnName}
                onChange={(event) => setColumnName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addColumn()
                }}
                sx={{ width: 180 }}
              />
              <Button size="small" variant="outlined" onClick={addColumn}>Add column</Button>
              <Button size="small" color="inherit" onClick={() => {
                const known = new Set([...(variableNames || []), ...scenario.steps.flatMap((step) => (step.captures || []).map((item) => item.name))])
                const names = columnNames(scenario.steps, [...known])
                const columns = [...scenario.columns]
                for (const name of names) if (!columns.includes(name)) columns.push(name)
                replace({
                  columns,
                  iterations: scenario.iterations.map((row) => ({
                    ...row,
                    values: Object.fromEntries(columns.map((name) => [name, row.values[name] || ''])),
                  })),
                })
              }}
              >
                Use names from the steps
              </Button>
              <Button size="small" color="inherit" onClick={() => setPasting((current) => !current)}>Paste csv</Button>
            </Stack>
            {pasting && (
              <Stack spacing={0.75}>
                <TextField
                  size="small"
                  multiline
                  minRows={3}
                  placeholder={'orderNumber,priority\nA-1,HIGH'}
                  value={paste}
                  onChange={(event) => setPaste(event.target.value)}
                />
                <Button size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => {
                  const parsed = iterationsFromCsv(paste)
                  if (parsed.columns.length === 0) return
                  const columns = [...scenario.columns]
                  for (const name of parsed.columns) if (!columns.includes(name)) columns.push(name)
                  const iterations = parsed.iterations.map((row) => ({
                    ...row,
                    values: Object.fromEntries(columns.map((name) => [name, row.values[name] || ''])),
                  }))
                  replace({ columns, iterations: [...scenario.iterations, ...iterations] })
                  setPaste('')
                  setPasting(false)
                }}
                >
                  Add rows
                </Button>
              </Stack>
            )}
            {scenario.columns.length > 0 && (
              <Box sx={{ overflow: 'auto', maxHeight: 280 }}>
                <Table size="small" sx={{ width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell width={48}>#</TableCell>
                      {scenario.columns.map((name) => (
                        <TableCell key={name}>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                            <span>{name}</span>
                            <Button size="small" color="inherit" onClick={() => removeColumn(name)} sx={{ minWidth: 0, px: 0.5 }}>×</Button>
                          </Stack>
                        </TableCell>
                      ))}
                      <TableCell width={72} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scenario.iterations.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell>{index + 1}</TableCell>
                        {scenario.columns.map((name) => (
                          <TableCell key={name}>
                            <TextField
                              size="small"
                              fullWidth
                              value={row.values[name] || ''}
                              onChange={(event) => replace({
                                iterations: scenario.iterations.map((item) => (item.id === row.id
                                  ? { ...item, values: { ...item.values, [name]: event.target.value } }
                                  : item)),
                              })}
                            />
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button size="small" color="inherit" onClick={() => replace({ iterations: scenario.iterations.filter((item) => item.id !== row.id) })}>Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
            <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => replace({ iterations: [...scenario.iterations, newIteration(scenario.columns)] })} disabled={scenario.columns.length === 0}>
              Add row
            </Button>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            <Button variant="contained" disabled={running || scenario.steps.length === 0} onClick={onRun}>
              Run {passes} {passes === 1 ? 'pass' : 'passes'}
            </Button>
            <Button variant="outlined" color="inherit" disabled={!running} onClick={onStop}>Stop</Button>
            <TextField
              label="Requests / second"
              type="number"
              size="small"
              value={tps}
              disabled={running}
              onChange={(event) => onTps(event.target.value)}
              sx={{ width: { xs: '100%', sm: 170 } }}
              slotProps={{ htmlInput: { min: 0.1, step: 1 } }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {running && activity
                ? activity
                : scenario.steps.length === 0
                  ? 'Add the endpoints to call, in order.'
                  : 'Each pass sends the steps from top to bottom.'}
            </Typography>
          </Stack>
        </>
      )}
    </Stack>
  )
}

function StepCard({ step, index, operations, profiles, activeProfileId, onChange, onMove, onRemove, first, last }) {
  const operation = operations.find((item) => item.id === step.operationId) || null
  const fields = (operation?.fields || []).filter((field) => !field.object)
  const available = fields.filter((field) => !Object.prototype.hasOwnProperty.call(step.request || {}, field.name))
  const requestNames = Object.keys(step.request || {})
  const captures = step.captures || []
  const expectFields = step.expect?.fields || []
  const profileId = String(step.profileId || '')
  const knownProfile = !profileId || profiles.some((item) => item.id === profileId)

  function setRequest(name, value) {
    onChange({ request: { ...step.request, [name]: value } })
  }

  return (
    <Stack spacing={1.25} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1.25 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ fontWeight: 700, width: 24 }}>{index + 1}</Typography>
        <TextField
          select
          size="small"
          label="Endpoint"
          value={step.operationId}
          onChange={(event) => onChange({ operationId: event.target.value, request: {}, omit: [] })}
          sx={{ flex: 1, minWidth: 0 }}
        >
          {!operations.some((item) => item.id === step.operationId) && step.operationId && (
            <MenuItem value={step.operationId}>{step.operationId}</MenuItem>
          )}
          {operations.map((item) => (
            <MenuItem key={item.id} value={item.id}>{endpointLabel(item)}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Client"
          value={profileId}
          onChange={(event) => onChange({ profileId: event.target.value })}
          sx={{ width: { xs: '100%', sm: 220 } }}
        >
          <MenuItem value="">This client</MenuItem>
          {!knownProfile && profileId && (
            <MenuItem value={profileId}>{profileId} (missing)</MenuItem>
          )}
          {profiles.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.id === activeProfileId ? `${item.label} (current)` : item.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="HTTP status"
          placeholder="2xx"
          value={step.expect?.status || ''}
          onChange={(event) => onChange({ expect: { ...step.expect, status: event.target.value.replace(/\D/g, '').slice(0, 3) } })}
          sx={{ width: { xs: '100%', sm: 120 } }}
        />
        <Stack direction="row" spacing={0.25} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControlLabel
            sx={{ ml: 0, mr: 0.5 }}
            control={<Checkbox size="small" checked={Boolean(step.cleanup)} onChange={(event) => onChange({ cleanup: event.target.checked })} />}
            label="Cleanup"
          />
          <Button size="small" color="inherit" disabled={first} onClick={() => onMove(-1)}>Up</Button>
          <Button size="small" color="inherit" disabled={last} onClick={() => onMove(1)}>Down</Button>
          <Button size="small" color="inherit" onClick={onRemove}>Remove</Button>
        </Stack>
      </Stack>

      <StepSection
        title="Request"
        hint="Override a field for this step. Use ${name} for an iteration or kept value."
        action={available.length > 0 && (
          <TextField
            select
            size="small"
            label="Add field"
            value=""
            onChange={(event) => {
              if (!event.target.value || Object.prototype.hasOwnProperty.call(step.request, event.target.value)) return
              onChange({ request: { ...step.request, [event.target.value]: '' } })
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Add field</MenuItem>
            {available.map((field) => (
              <MenuItem key={field.name} value={field.name}>{field.name}</MenuItem>
            ))}
          </TextField>
        )}
      >
        {requestNames.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No field overrides yet.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {requestNames.map((name) => {
              const omitted = (step.omit || []).includes(name)
              return (
                <Stack key={name} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                  <Typography
                    variant="body2"
                    sx={{ width: { sm: 150 }, flexShrink: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }}
                  >
                    {name}
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    disabled={omitted}
                    placeholder={omitted ? 'Omitted' : 'Default, or ${name}'}
                    value={step.request[name] ?? ''}
                    onChange={(event) => setRequest(name, event.target.value)}
                  />
                  <FormControlLabel
                    sx={{ ml: 0, flexShrink: 0 }}
                    control={<Checkbox size="small" checked={omitted} onChange={() => {
                      const omit = new Set(step.omit || [])
                      if (omit.has(name)) omit.delete(name)
                      else omit.add(name)
                      onChange({ omit: [...omit] })
                    }}
                    />}
                    label="Omit"
                  />
                  <Button
                    size="small"
                    color="inherit"
                    sx={{ flexShrink: 0 }}
                    onClick={() => {
                      const request = { ...step.request }
                      delete request[name]
                      onChange({ request, omit: (step.omit || []).filter((item) => item !== name) })
                    }}
                  >
                    Remove
                  </Button>
                </Stack>
              )
            })}
          </Stack>
        )}
      </StepSection>

      <StepSection
        title="Keep from response"
        hint={'Save a response value as ${name} for later steps.'}
        action={(
          <Button
            size="small"
            variant="outlined"
            onClick={() => onChange({ captures: [...captures, { path: 'id', name: '' }] })}
          >
            Add
          </Button>
        )}
      >
        {captures.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Nothing kept yet.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {captures.map((entry, entryIndex) => (
              <Stack key={`capture-${entryIndex}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                <TextField
                  size="small"
                  label="Response field"
                  placeholder="id"
                  value={entry.path}
                  onChange={(event) => {
                    const next = captures.slice()
                    next[entryIndex] = { ...entry, path: event.target.value }
                    onChange({ captures: next })
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Keep as"
                  placeholder="orderId"
                  value={entry.name}
                  onChange={(event) => {
                    const next = captures.slice()
                    next[entryIndex] = { ...entry, name: event.target.value }
                    onChange({ captures: next })
                  }}
                  sx={{ flex: 1 }}
                />
                <Button
                  size="small"
                  color="inherit"
                  sx={{ flexShrink: 0 }}
                  onClick={() => onChange({ captures: captures.filter((_, item) => item !== entryIndex) })}
                >
                  Remove
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
      </StepSection>

      <StepSection
        title="Expect from response"
        hint="Check a response field after this call."
        action={(
          <Button
            size="small"
            variant="outlined"
            onClick={() => onChange({ expect: { ...step.expect, fields: [...expectFields, { path: '', equals: '' }] } })}
          >
            Add
          </Button>
        )}
      >
        {expectFields.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No field checks yet. Status above still applies.</Typography>
        ) : (
          <Stack spacing={0.75}>
            {expectFields.map((field, fieldIndex) => (
              <Stack key={`expect-${fieldIndex}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                <TextField
                  size="small"
                  label="Response field"
                  placeholder="customerName"
                  value={field.path}
                  onChange={(event) => {
                    const list = expectFields.slice()
                    list[fieldIndex] = { ...field, path: event.target.value }
                    onChange({ expect: { ...step.expect, fields: list } })
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="Equals"
                  placeholder="${customerName}"
                  value={field.equals || ''}
                  onChange={(event) => {
                    const list = expectFields.slice()
                    list[fieldIndex] = { ...field, equals: event.target.value }
                    onChange({ expect: { ...step.expect, fields: list } })
                  }}
                  sx={{ flex: 1 }}
                />
                <Button
                  size="small"
                  color="inherit"
                  sx={{ flexShrink: 0 }}
                  onClick={() => {
                    const list = expectFields.filter((_, item) => item !== fieldIndex)
                    onChange({ expect: { ...step.expect, fields: list } })
                  }}
                >
                  Remove
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
      </StepSection>
    </Stack>
  )
}

function StepSection({ title, hint, action, children }) {
  return (
    <Stack
      spacing={0.75}
      sx={{
        bgcolor: '#f8fafc',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 1.25,
        py: 1,
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2">{title}</Typography>
          <Typography variant="caption" color="text.secondary">{hint}</Typography>
        </Box>
        {action || null}
      </Stack>
      {children}
    </Stack>
  )
}

function endpointLabel(operation) {
  const route = `${operation.method} ${operation.path}`
  const name = String(operation.summary || operation.operationId || '').trim()
  if (!name || name === route) return route
  return `${name} · ${route}`
}
