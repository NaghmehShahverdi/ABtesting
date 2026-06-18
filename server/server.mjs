import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import {
  getCausalInferenceDashboard,
  getMlScoringDashboard,
  getProductUsageDashboard,
} from '../vite.config.mjs'

const app = express()
const port = Number(process.env.PORT || 3000)
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'https://naghmehshahverdi.github.io,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

app.disable('x-powered-by')
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

app.get('/api/product-usage', async (_request, response) => {
  await sendDashboard(response, getProductUsageDashboard, 'product usage analytics')
})

app.get('/api/ml-scoring', async (_request, response) => {
  await sendDashboard(response, getMlScoringDashboard, 'account scoring results')
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
