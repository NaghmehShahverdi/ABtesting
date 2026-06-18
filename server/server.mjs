import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import { readFileSync } from 'node:fs'
import {
  getCausalInferenceDashboard,
  getMlScoringDashboard,
} from '../vite.config.mjs'

const app = express()
const port = Number(process.env.PORT || 3000)
const mlCacheRefreshMs = Number(process.env.ML_CACHE_REFRESH_MS || 86_400_000)
const bundledMlSnapshot = JSON.parse(
  readFileSync(new URL('./ml-scoring.snapshot.json', import.meta.url), 'utf8'),
)
let mlScoringCache = bundledMlSnapshot
let mlCacheSource = 'bundled-snapshot'
let mlCacheLastAttemptAt = 0
let mlCacheRefreshPromise = null
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'https://naghmehshahverdi.github.io,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

app.disable('x-powered-by')
app.use(express.json({ limit: '20kb' }))

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`))
    },
  }),
)

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/ml-scoring', (_request, response) => {
  response.set({
    'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
    'X-Data-Source': mlCacheSource,
  })
  response.json(mlScoringCache)
  setTimeout(() => void refreshMlScoringCache(), 1_000).unref()
})

app.get('/api/causal-inference', async (_request, response) => {
  await sendDashboard(response, getCausalInferenceDashboard, 'causal inference results')
})

app.use((error, _request, response, _next) => {
  response.status(403).json({
    error: 'Request blocked.',
    details: error instanceof Error ? error.message : 'Unknown request error',
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Experiment Copilot API listening on port ${port}`)
})

async function sendDashboard(response, loader, label) {
  try {
    response.json(await loader())
  } catch (error) {
    console.error(`Unable to load ${label}:`, error)
    response.status(500).json({
      error: `Unable to load ${label}.`,
      details: error instanceof Error ? error.message : 'Unknown server error',
    })
  }
}

function refreshMlScoringCache() {
  const cacheIsFresh = Date.now() - mlCacheLastAttemptAt < mlCacheRefreshMs
  if (cacheIsFresh || mlCacheRefreshPromise) {
    return mlCacheRefreshPromise
  }

  mlCacheLastAttemptAt = Date.now()
  mlCacheRefreshPromise = getMlScoringDashboard()
    .then((dashboard) => {
      mlScoringCache = dashboard
      mlCacheSource = 'snowflake-memory-cache'
      console.log('Account scoring cache refreshed from Snowflake.')
    })
    .catch((error) => {
      console.error('Unable to refresh account scoring cache; serving bundled snapshot:', error)
    })
    .finally(() => {
      mlCacheRefreshPromise = null
    })

  return mlCacheRefreshPromise
}
