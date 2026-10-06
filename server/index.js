import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { pool } from './db/client.js'
import { gamesRouter } from './routes/games.js'
import { profileRouter } from './routes/profile.js'

const app = express()

app.use(cors({ origin: config.clientOrigin }))
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.use('/api/games', gamesRouter)
app.use('/api/profile', profileRouter)

app.use((error, _request, response, _next) => {
  const statusCode = error.status ?? 500

  response.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : error.message,
  })
})

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`)
})

async function shutDown() {
  server.close()
  await pool.end()
}

process.on('SIGINT', shutDown)
process.on('SIGTERM', shutDown)