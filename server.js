import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const fastify = Fastify({ logger: false })

fastify.register(fastifyStatic, {
  root: fileURLToPath(new URL('./public', import.meta.url)),
  prefix: '/public/',
})

// --- State persistence ---
const dataDir = new URL('./data/', import.meta.url)
const stateFile = new URL('./data/state.json', import.meta.url)

async function loadState() {
  try {
    const raw = await readFile(stateFile, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return { mode: 'STOPPED', startedAtEpochMs: 0, lengthMs: 4 * 60 * 1000 }
  }
}

async function saveState() {
  await mkdir(dataDir, { recursive: true })
  await writeFile(stateFile, JSON.stringify(state, null, 2))
}

// --- Global playback state ---
const state = await loadState()

// --- Routes ---

// Main video page
fastify.get('/', async (request, reply) => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf-8')
  reply.type('text/html').send(html)
})

// Control page
fastify.get('/control', async (request, reply) => {
  const html = await readFile(new URL('./control.html', import.meta.url), 'utf-8')
  reply.type('text/html').send(html)
})

// Poll endpoint - returns plain text command
fastify.get('/poll', async (request, reply) => {
  if (state.pendingCommand) {
    const command = state.pendingCommand
    state.pendingCommand = null
    await saveState()
    console.log(command)
    reply.type('text/plain').send(command)
    return
  }

  let command = 'NOP'

  if (state.mode === 'STOPPED') {
    command = 'STOP'
  } else if (state.mode === 'RUNNING' && state.lengthMs > 0) {
    const elapsed = Date.now() - state.startedAtEpochMs
    const position = elapsed % state.lengthMs
    command = `SEEK:${Math.floor(position)}`
  }

  console.log(command)
  reply.type('text/plain').send(command)
})

// Status endpoint for control page timer
fastify.get('/status', async (request, reply) => {
  let elapsedMs = 0
  if (state.mode === 'RUNNING' && state.lengthMs > 0) {
    elapsedMs = (Date.now() - state.startedAtEpochMs) % state.lengthMs
  }
  reply.send({
    mode: state.mode,
    elapsedMs: Math.floor(elapsedMs),
    lengthMs: state.lengthMs,
  })
})

// Control actions
fastify.post('/control/restart', async (request, reply) => {
  state.mode = 'RUNNING'
  state.startedAtEpochMs = Date.now()
  await saveState()
  reply.send({ ok: true })
})

fastify.post('/control/stop', async (request, reply) => {
  state.mode = 'STOPPED'
  await saveState()
  reply.send({ ok: true })
})

fastify.post('/control/length', async (request, reply) => {
  const { lengthMs } = request.body
  if (typeof lengthMs === 'number' && lengthMs > 0) {
    state.lengthMs = lengthMs
    await saveState()
  }
  reply.send({ ok: true })
})

fastify.post('/control/reload-player', async (request, reply) => {
  state.pendingCommand = 'RELOAD'
  await saveState()
  reply.send({ ok: true })
})

fastify.post('/control/debug-start', async (request, reply) => {
  state.pendingCommand = 'DEBUG_START'
  await saveState()
  reply.send({ ok: true })
})

// --- Start server ---
fastify.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  fastify.log.info(`Server listening on ${address}`)
})
