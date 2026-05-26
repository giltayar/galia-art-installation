import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({ logger: false })

fastify.register(fastifyStatic, {
  root: join(__dirname, 'public'),
  prefix: '/public/',
})

// --- Global playback state ---
const state = {
  mode: 'STOPPED', // 'RUNNING' | 'STOPPED'
  startedAtEpochMs: 0,
  lengthMs: 0,
}

// --- Routes ---

// Main video page
fastify.get('/', async (request, reply) => {
  const html = await readFile(join(__dirname, 'index.html'), 'utf-8')
  reply.type('text/html').send(html)
})

// Control page
fastify.get('/control', async (request, reply) => {
  const lengthParam = request.query.length
  if (lengthParam) {
    state.lengthMs = Number(lengthParam) * 1000 // Convert seconds to ms
  }
  const html = await readFile(join(__dirname, 'control.html'), 'utf-8')
  reply.type('text/html').send(html)
})

// Poll endpoint - returns plain text command
fastify.get('/poll', async (request, reply) => {
  console.log('***** state', state)
  let command = 'NOP'

  if (state.mode === 'STOPPED') {
    command = 'STOP'
  } else if (state.mode === 'RUNNING' && state.lengthMs > 0) {
    const elapsed = Date.now() - state.startedAtEpochMs
    const position = elapsed % state.lengthMs
    command = `SEEK:${Math.floor(position)}`
  }

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
  reply.send({ ok: true })
})

fastify.post('/control/stop', async (request, reply) => {
  state.mode = 'STOPPED'
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
