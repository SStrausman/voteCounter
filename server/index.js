import cors from 'cors'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { pool } from './db/client.js'
import { gamesRouter } from './routes/games.js'
import { profileRouter } from './routes/profile.js'
import { rolesRouter } from './routes/roles.js'

const app = express()

app.use(cors({ origin: config.clientOrigin }))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.use('/api/games', gamesRouter)
app.use('/api/profile', profileRouter)
app.use('/api/roles', rolesRouter)

if (process.env.NODE_ENV === 'production') {
  const clientDirectory = fileURLToPath(new URL('../dist', import.meta.url))

  app.use(express.static(clientDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      next()
      return
    }

    response.sendFile('index.html', { root: clientDirectory })
  })
}

app.use((error, _request, response, _next) => {
  const statusCode = error.status ?? 500

  if (statusCode === 500) {
    console.error(error)
  }

  response.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : error.message,
  })
})

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`)
})

let isShuttingDown = false

async function shutDown() {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  server.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutDown)
process.on('SIGTERM', shutDown)