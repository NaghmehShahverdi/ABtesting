import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import snowflake from 'snowflake-sdk'

snowflake.configure({
  additionalLogToConsole: false,
  logLevel: 'error',
})

const productUsageQueries = {
  overview: `
    WITH user_rollup AS (
      SELECT
        u.USER_ID,
        u.FIRST_LOGGED_IN_AT,
        u.LATEST_LOGGED_IN_AT,
        u.IS_MARKETING_OPTED_IN,
        COUNT(t.EVENT_ID) AS EVENTS,
        COUNT(DISTINCT t.EVENT_NAME) AS DISTINCT_EVENTS,
        MAX(IFF(
          t.EVENT_NAME = 'workspace_created'
          AND t.EVENT_TIMESTAMP BETWEEN u.FIRST_LOGGED_IN_AT AND DATEADD(day, 7, u.FIRST_LOGGED_IN_AT),
          1,
          0
        )) AS CREATED_WORKSPACE,
        MAX(IFF(
          t.EVENT_NAME = 'report_generated'
          AND t.EVENT_TIMESTAMP BETWEEN u.FIRST_LOGGED_IN_AT AND DATEADD(day, 7, u.FIRST_LOGGED_IN_AT),
          1,
          0
        )) AS GENERATED_REPORT
      FROM USERS_RAW u
      LEFT JOIN TRACKS_RAW t
        ON u.USER_ID = t.USER_ID
      GROUP BY
        u.USER_ID,
        u.FIRST_LOGGED_IN_AT,
        u.LATEST_LOGGED_IN_AT,
        u.IS_MARKETING_OPTED_IN
    )
    SELECT
      COUNT(*) AS TOTAL_USERS,
      COUNT_IF(EVENTS > 0) AS ACTIVE_USERS,
      SUM(EVENTS) AS TOTAL_EVENTS,
      ROUND(AVG(EVENTS), 2) AS AVG_EVENTS_PER_USER,
      ROUND(AVG(IFF(EVENTS > 0, EVENTS, NULL)), 2) AS AVG_EVENTS_PER_ACTIVE_USER,
      ROUND(AVG(DISTINCT_EVENTS), 2) AS AVG_DISTINCT_EVENTS,
      COUNT_IF(CREATED_WORKSPACE = 1 AND GENERATED_REPORT = 1) AS ACTIVATED_USERS,
      ROUND(COUNT_IF(CREATED_WORKSPACE = 1 AND GENERATED_REPORT = 1) / NULLIF(COUNT(*), 0), 4) AS ACTIVATION_RATE,
      COUNT_IF(IS_MARKETING_OPTED_IN = 1) AS MARKETING_OPTED_USERS,
      ROUND(COUNT_IF(IS_MARKETING_OPTED_IN = 1) / NULLIF(COUNT(*), 0), 4) AS MARKETING_OPT_IN_RATE,
      MIN(FIRST_LOGGED_IN_AT) AS FIRST_LOGIN_AT,
      MAX(LATEST_LOGGED_IN_AT) AS LATEST_LOGIN_AT
    FROM user_rollup
  `,
  topEvents: `
    SELECT
      EVENT_NAME,
      COUNT(*) AS TOTAL_EVENTS,
      COUNT(DISTINCT USER_ID) AS UNIQUE_USERS,
      MIN(EVENT_TIMESTAMP) AS FIRST_SEEN_AT,
      MAX(EVENT_TIMESTAMP) AS LAST_SEEN_AT
    FROM TRACKS_RAW
    GROUP BY EVENT_NAME
    ORDER BY TOTAL_EVENTS DESC
    LIMIT 12
  `,
  monthlyActivity: `
    SELECT
      DATE_TRUNC('month', EVENT_TIMESTAMP)::DATE AS EVENT_MONTH,
      COUNT(*) AS TOTAL_EVENTS,
      COUNT(DISTINCT USER_ID) AS ACTIVE_USERS
    FROM TRACKS_RAW
    GROUP BY EVENT_MONTH
    ORDER BY EVENT_MONTH
  `,
  activationFunnel: `
    WITH user_flags AS (
      SELECT
        u.USER_ID,
        IFF(u.FIRST_LOGGED_IN_AT IS NOT NULL, 1, 0) AS HAS_FIRST_LOGIN,
        MAX(IFF(
          t.EVENT_NAME = 'workspace_created'
          AND t.EVENT_TIMESTAMP BETWEEN u.FIRST_LOGGED_IN_AT AND DATEADD(day, 7, u.FIRST_LOGGED_IN_AT),
          1,
          0
        )) AS CREATED_WORKSPACE,
        MAX(IFF(
          t.EVENT_NAME = 'report_generated'
          AND t.EVENT_TIMESTAMP BETWEEN u.FIRST_LOGGED_IN_AT AND DATEADD(day, 7, u.FIRST_LOGGED_IN_AT),
          1,
          0
        )) AS GENERATED_REPORT
      FROM USERS_RAW u
      LEFT JOIN TRACKS_RAW t
        ON u.USER_ID = t.USER_ID
      GROUP BY u.USER_ID, u.FIRST_LOGGED_IN_AT
    )
    SELECT 1 AS STAGE_ORDER, 'Users' AS STAGE, COUNT(*) AS USERS FROM user_flags
    UNION ALL
    SELECT 2, 'First login', COUNT_IF(HAS_FIRST_LOGIN = 1) FROM user_flags
    UNION ALL
    SELECT 3, 'Workspace created', COUNT_IF(CREATED_WORKSPACE = 1) FROM user_flags
    UNION ALL
    SELECT 4, 'Report generated', COUNT_IF(GENERATED_REPORT = 1) FROM user_flags
    UNION ALL
    SELECT 5, 'Activated', COUNT_IF(CREATED_WORKSPACE = 1 AND GENERATED_REPORT = 1) FROM user_flags
    ORDER BY STAGE_ORDER
  `,
  jobSegments: `
    SELECT
      COALESCE(u.JOB_TITLE, 'Unknown') AS JOB_TITLE,
      COUNT(DISTINCT u.USER_ID) AS USERS,
      COUNT(DISTINCT t.USER_ID) AS ACTIVE_USERS,
      COUNT(t.EVENT_ID) AS TOTAL_EVENTS,
      ROUND(COUNT(t.EVENT_ID) / NULLIF(COUNT(DISTINCT u.USER_ID), 0), 2) AS EVENTS_PER_USER
    FROM USERS_RAW u
    LEFT JOIN TRACKS_RAW t
      ON u.USER_ID = t.USER_ID
    GROUP BY JOB_TITLE
    ORDER BY ACTIVE_USERS DESC, TOTAL_EVENTS DESC
    LIMIT 10
  `,
  recentEvents: `
    SELECT
      EVENT_NAME,
      USER_ID,
      EVENT_TIMESTAMP
    FROM TRACKS_RAW
    ORDER BY EVENT_TIMESTAMP DESC
    LIMIT 12
  `,
  productPurchases: `
    SELECT
      PRODUCT_NAME,
      COUNT(*) AS PURCHASES,
      COUNT(DISTINCT CUSTOMER_ID) AS CUSTOMERS
    FROM PRODUCT_PURCHASES_RAW
    GROUP BY PRODUCT_NAME
    ORDER BY PURCHASES DESC
    LIMIT 8
  `,
}

const mlModelMetricsColumns = `
  MODEL_NAME,
  MODEL_LABEL,
  "ROWS",
  BASE_RATE,
  ROC_AUC,
  PR_AUC,
  LOG_LOSS,
  BRIER_SCORE,
  PRECISION_AT_10PCT,
  RECALL_AT_10PCT,
  LIFT_AT_10PCT,
  REVENUE_CAPTURE_AT_10PCT,
  IS_DEPLOYED
`

const mlScoringQueries = {
  modelMetricsTest: `
    SELECT
      ${mlModelMetricsColumns}
    FROM EXPERIMENT_COPILOT.PUBLIC.ML_MODEL_METRICS
    WHERE LOWER(DATASET) = 'test'
    ORDER BY REVENUE_CAPTURE_AT_10PCT DESC, PR_AUC DESC
  `,
  modelMetricsValidation: `
    SELECT
      ${mlModelMetricsColumns}
    FROM EXPERIMENT_COPILOT.PUBLIC.ML_MODEL_METRICS
    WHERE LOWER(DATASET) = 'validation'
    ORDER BY REVENUE_CAPTURE_AT_10PCT DESC, PR_AUC DESC
  `,
  calibration: `
    SELECT
      BIN_ORDER,
      SCORE_BIN,
      ACCOUNTS,
      AVG_PREDICTED_PROBABILITY,
      ACTUAL_WIN_RATE,
      WINS
    FROM EXPERIMENT_COPILOT.PUBLIC.ML_CALIBRATION
    WHERE LOWER(DATASET) = 'test'
    ORDER BY BIN_ORDER
  `,
  featureImportance: `
    SELECT
      FEATURE,
      IMPORTANCE
    FROM EXPERIMENT_COPILOT.PUBLIC.ML_FEATURE_IMPORTANCE
    ORDER BY IMPORTANCE DESC
    LIMIT 10
  `,
  accountScores: `
    SELECT
      ACCOUNT_NAME,
      INDUSTRY,
      SEGMENT,
      ESTIMATED_ANNUAL_RECURRING_REVENUE,
      "TARGET",
      PREDICTED_WIN_PROBABILITY_90D
    FROM EXPERIMENT_COPILOT.PUBLIC.ML_ACCOUNT_SCORES
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY ACCOUNT_ID
      ORDER BY PREDICTED_WIN_PROBABILITY_90D DESC
    ) = 1
    ORDER BY PREDICTED_WIN_PROBABILITY_90D DESC
    LIMIT 10
  `,
  accountExplanations: `
    SELECT
      PRIORITY_RANK,
      ACCOUNT_NAME,
      INDUSTRY,
      SEGMENT,
      ESTIMATED_ANNUAL_RECURRING_REVENUE,
      PREDICTED_WIN_PROBABILITY_90D,
      TOP_REASON_1,
      TOP_REASON_1_THEME,
      TOP_REASON_2,
      TOP_REASON_2_THEME,
      TOP_REASON_3,
      TOP_REASON_3_THEME,
      SALES_EXPLANATION,
      RECOMMENDED_ACTION,
      EXPLANATION_METHOD
    FROM EXPERIMENT_COPILOT.PUBLIC.ML_ACCOUNT_EXPLANATIONS
    ORDER BY PRIORITY_RANK
    LIMIT 10
  `,
  cohortPerformance: `
    WITH ranked AS (
      SELECT
        "TARGET",
        ROW_NUMBER() OVER (
          ORDER BY PREDICTED_WIN_PROBABILITY_90D DESC
        ) AS priority_rank
      FROM EXPERIMENT_COPILOT.PUBLIC.ML_ACCOUNT_SCORES
    ),
    totals AS (
      SELECT
        COUNT(*) AS total_accounts,
        AVG("TARGET") AS baseline_rate,
        CEIL(COUNT(*) * 0.10) AS decile_size
      FROM ranked
    )
    SELECT
      t.total_accounts,
      t.baseline_rate,
      t.decile_size,
      SUM(IFF(r.priority_rank <= 50, r."TARGET", 0)) / 50 AS top_50_rate,
      SUM(IFF(r.priority_rank <= 50, r."TARGET", 0)) AS top_50_wins,
      SUM(IFF(r.priority_rank <= 100, r."TARGET", 0)) / 100 AS top_100_rate,
      SUM(IFF(r.priority_rank <= 100, r."TARGET", 0)) AS top_100_wins,
      SUM(IFF(r.priority_rank <= t.decile_size, r."TARGET", 0)) / NULLIF(t.decile_size, 0) AS top_decile_rate,
      SUM(IFF(r.priority_rank <= t.decile_size, r."TARGET", 0)) AS top_decile_wins
    FROM ranked r
    CROSS JOIN totals t
    GROUP BY t.total_accounts, t.baseline_rate, t.decile_size
  `,
}

export default defineConfig({
  base: '/ABtesting/',
  server: {
    host: '127.0.0.1',
  },
  plugins: [
    {
      name: 'snowflake-api',
      configureServer(server) {
        server.middlewares.use('/api/product-usage', async (_request, response) => {
          try {
            const dashboard = await getProductUsageDashboard()

            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(dashboard))
          } catch (error) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                error: 'Unable to load product usage analytics from Snowflake.',
                details: getErrorMessage(error),
              }),
            )
          }
        })

        server.middlewares.use('/api/ml-scoring', async (_request, response) => {
          try {
            const dashboard = await getMlScoringDashboard()

            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(dashboard))
          } catch (error) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                error: 'Unable to load account scoring results from Snowflake.',
                details: getErrorMessage(error),
              }),
            )
          }
        })

        server.middlewares.use('/api/causal-inference', async (_request, response) => {
          try {
            const dashboard = getCausalInferenceDashboard()

            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(dashboard))
          } catch (error) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                error: 'Unable to load causal inference results.',
                details: getErrorMessage(error),
              }),
            )
          }
        })
      },
    },
  ],
})

export async function getProductUsageDashboard() {
  const [
    overviewRows,
    topEventsRows,
    monthlyActivityRows,
    activationFunnelRows,
    jobSegmentsRows,
    recentEventsRows,
    productPurchasesRows,
  ] = await Promise.all([
    querySnowflake(productUsageQueries.overview),
    querySnowflake(productUsageQueries.topEvents),
    querySnowflake(productUsageQueries.monthlyActivity),
    querySnowflake(productUsageQueries.activationFunnel),
    querySnowflake(productUsageQueries.jobSegments),
    querySnowflake(productUsageQueries.recentEvents),
    queryOptionalSnowflake(productUsageQueries.productPurchases),
  ])

  return {
    activationFunnel: activationFunnelRows.map((row) => ({
      stage: getString(row, 'STAGE'),
      users: getNumber(row, 'USERS'),
    })),
    jobSegments: jobSegmentsRows.map((row) => ({
      activeUsers: getNumber(row, 'ACTIVE_USERS'),
      eventsPerUser: getNumber(row, 'EVENTS_PER_USER'),
      jobTitle: getString(row, 'JOB_TITLE'),
      totalEvents: getNumber(row, 'TOTAL_EVENTS'),
      users: getNumber(row, 'USERS'),
    })),
    monthlyActivity: monthlyActivityRows.map((row) => ({
      activeUsers: getNumber(row, 'ACTIVE_USERS'),
      eventMonth: getDateString(row, 'EVENT_MONTH'),
      totalEvents: getNumber(row, 'TOTAL_EVENTS'),
    })),
    overview: mapOverview(overviewRows[0] ?? {}),
    productPurchases: productPurchasesRows.map((row) => ({
      customers: getNumber(row, 'CUSTOMERS'),
      productName: getString(row, 'PRODUCT_NAME'),
      purchases: getNumber(row, 'PURCHASES'),
    })),
    recentEvents: recentEventsRows.map((row) => ({
      eventName: getString(row, 'EVENT_NAME'),
      eventTimestamp: getDateString(row, 'EVENT_TIMESTAMP'),
      userId: getString(row, 'USER_ID'),
    })),
    topEvents: topEventsRows.map((row) => ({
      eventName: getString(row, 'EVENT_NAME'),
      firstSeenAt: getDateString(row, 'FIRST_SEEN_AT'),
      lastSeenAt: getDateString(row, 'LAST_SEEN_AT'),
      totalEvents: getNumber(row, 'TOTAL_EVENTS'),
      uniqueUsers: getNumber(row, 'UNIQUE_USERS'),
    })),
  }
}

function mapModelMetricsRow(row) {
  return {
    name: getString(row, 'MODEL_NAME'),
    label: getString(row, 'MODEL_LABEL'),
    rows: getNumber(row, 'ROWS'),
    baseRate: getNumber(row, 'BASE_RATE'),
    rocAuc: getNumber(row, 'ROC_AUC'),
    prAuc: getNumber(row, 'PR_AUC'),
    logLoss: getNumber(row, 'LOG_LOSS'),
    brierScore: getNumber(row, 'BRIER_SCORE'),
    precisionAt10: getNumber(row, 'PRECISION_AT_10PCT'),
    recallAt10: getNumber(row, 'RECALL_AT_10PCT'),
    liftAt10: getNumber(row, 'LIFT_AT_10PCT'),
    revenueCaptureAt10: getNumber(row, 'REVENUE_CAPTURE_AT_10PCT'),
    deployed: getBoolean(row, 'IS_DEPLOYED'),
  }
}

function buildCalibrationSummary(deciles) {
  if (deciles.length === 0) {
    return null
  }

  const sorted = [...deciles].sort((first, second) => first.binOrder - second.binOrder)
  const absErrors = sorted.map((row) => Math.abs(row.avgPredicted - row.actualWinRate))
  const meanAbsError = absErrors.reduce((sum, value) => sum + value, 0) / absErrors.length
  const top = sorted[sorted.length - 1]
  const bottom = sorted[0]

  return {
    meanAbsError,
    topDecilePredicted: top.avgPredicted,
    topDecileActual: top.actualWinRate,
    topDecileGap: Math.abs(top.avgPredicted - top.actualWinRate),
    bottomDecilePredicted: bottom.avgPredicted,
    bottomDecileActual: bottom.actualWinRate,
  }
}

function buildSelectionRationale(validationModels, testModels) {
  const deployed =
    validationModels.find((model) => model.deployed) ??
    testModels.find((model) => model.deployed) ??
    validationModels[0] ??
    null

  if (!deployed) {
    return null
  }

  const deployedTest = testModels.find((model) => model.name === deployed.name) ?? deployed
  const bestTestAuc = [...testModels].sort((first, second) => second.rocAuc - first.rocAuc)[0] ?? null
  const bestTestLift = [...testModels].sort((first, second) => second.liftAt10 - first.liftAt10)[0] ?? null
  const bestTestRecall = [...testModels].sort((first, second) => second.recallAt10 - first.recallAt10)[0] ?? null
  const bestTestRevenue =
    [...testModels].sort((first, second) => second.revenueCaptureAt10 - first.revenueCaptureAt10)[0] ?? null
  const bestTestPrAuc = [...testModels].sort((first, second) => second.prAuc - first.prAuc)[0] ?? null
  const bestTestBrier = [...testModels].sort((first, second) => first.brierScore - second.brierScore)[0] ?? null

  return {
    primaryMetric: 'Revenue capture @ top 10%',
    tieBreakMetric: 'PR-AUC on validation',
    selectionDataset: 'validation',
    evaluationDataset: 'test (held-out)',
    deployedLabel: deployed.label,
    validationRevenueCapture: deployed.revenueCaptureAt10,
    validationPrAuc: deployed.prAuc,
    testRevenueCapture: deployedTest.revenueCaptureAt10,
    testPrAuc: deployedTest.prAuc,
    testBrierScore: deployedTest.brierScore,
    bestTestAucLabel: bestTestAuc?.label ?? '',
    bestTestAuc: bestTestAuc?.rocAuc ?? 0,
    bestTestLiftLabel: bestTestLift?.label ?? '',
    bestTestLift: bestTestLift?.liftAt10 ?? 0,
    bestTestRecallLabel: bestTestRecall?.label ?? '',
    bestTestRecall: bestTestRecall?.recallAt10 ?? 0,
    bestTestRevenueLabel: bestTestRevenue?.label ?? '',
    bestTestRevenue: bestTestRevenue?.revenueCaptureAt10 ?? 0,
    bestTestPrAucLabel: bestTestPrAuc?.label ?? '',
    bestTestPrAuc: bestTestPrAuc?.prAuc ?? 0,
    bestTestBrierLabel: bestTestBrier?.label ?? '',
    bestTestBrier: bestTestBrier?.brierScore ?? 0,
    deployedBeatsBestAucOnRevenue:
      bestTestRevenue?.name === deployedTest.name ||
      deployedTest.revenueCaptureAt10 >= (bestTestAuc?.revenueCaptureAt10 ?? 0),
  }
}

function buildCohortPerformance(row, baselineRateFallback) {
  if (!row) {
    return null
  }

  const baselineFromRow = getNumber(row, 'BASELINE_RATE')
  const baselineRate = baselineFromRow > 0 ? baselineFromRow : baselineRateFallback
  const decileSize = getNumber(row, 'DECILE_SIZE')

  const cohorts = [
    {
      key: 'top_50',
      label: 'Top 50 ranked',
      size: 50,
      conversionRate: getNumber(row, 'TOP_50_RATE'),
      wins: getNumber(row, 'TOP_50_WINS'),
    },
    {
      key: 'top_100',
      label: 'Top 100 ranked',
      size: 100,
      conversionRate: getNumber(row, 'TOP_100_RATE'),
      wins: getNumber(row, 'TOP_100_WINS'),
    },
    {
      key: 'top_decile',
      label: `Top 10% (${decileSize.toLocaleString('en-US')} ranked)`,
      size: decileSize,
      conversionRate: getNumber(row, 'TOP_DECILE_RATE'),
      wins: getNumber(row, 'TOP_DECILE_WINS'),
    },
  ].map((cohort) => ({
    ...cohort,
    lift: baselineRate > 0 ? cohort.conversionRate / baselineRate : 0,
  }))

  return {
    totalAccounts: getNumber(row, 'TOTAL_ACCOUNTS'),
    baselineRate,
    cohorts,
  }
}

export async function getMlScoringDashboard() {
  const [
    testMetricsRows,
    validationMetricsRows,
    calibrationRows,
    featureImportanceRows,
    accountScoresRows,
    accountExplanationRows,
    cohortPerformanceRows,
  ] = await Promise.all([
    querySnowflake(mlScoringQueries.modelMetricsTest),
    querySnowflake(mlScoringQueries.modelMetricsValidation),
    querySnowflake(mlScoringQueries.calibration),
    querySnowflake(mlScoringQueries.featureImportance),
    querySnowflake(mlScoringQueries.accountScores),
    queryOptionalSnowflake(mlScoringQueries.accountExplanations),
    queryOptionalSnowflake(mlScoringQueries.cohortPerformance),
  ])

  const models = testMetricsRows.map(mapModelMetricsRow)
  const validationModels = validationMetricsRows.map(mapModelMetricsRow)
  const deciles = calibrationRows.map((row) => ({
    binOrder: getNumber(row, 'BIN_ORDER'),
    accounts: getNumber(row, 'ACCOUNTS'),
    avgPredicted: getNumber(row, 'AVG_PREDICTED_PROBABILITY'),
    actualWinRate: getNumber(row, 'ACTUAL_WIN_RATE'),
    wins: getNumber(row, 'WINS'),
  }))
  const deployedModel = models.find((model) => model.deployed) ?? models[0] ?? null

  return {
    deployedModel,
    horizonDays: 90,
    models,
    validationModels,
    selectionRationale: buildSelectionRationale(validationModels, models),
    calibrationSummary: buildCalibrationSummary(deciles),
    cohortPerformance: buildCohortPerformance(
      cohortPerformanceRows[0],
      deployedModel?.baseRate ?? 0,
    ),
    deciles,
    drivers: featureImportanceRows.map((row) => ({
      feature: getString(row, 'FEATURE'),
      importance: getNumber(row, 'IMPORTANCE'),
    })),
    priorityAccounts: accountScoresRows.map((row, index) => ({
      rank: index + 1,
      name: getString(row, 'ACCOUNT_NAME'),
      industry: getString(row, 'INDUSTRY'),
      segment: getString(row, 'SEGMENT'),
      arr: getNumber(row, 'ESTIMATED_ANNUAL_RECURRING_REVENUE'),
      probability: getNumber(row, 'PREDICTED_WIN_PROBABILITY_90D'),
      converted: getNumber(row, 'TARGET') > 0,
    })),
    accountExplanations: accountExplanationRows.map((row) => ({
      rank: getNumber(row, 'PRIORITY_RANK'),
      name: getString(row, 'ACCOUNT_NAME'),
      industry: getString(row, 'INDUSTRY'),
      segment: getString(row, 'SEGMENT'),
      arr: getNumber(row, 'ESTIMATED_ANNUAL_RECURRING_REVENUE'),
      probability: getNumber(row, 'PREDICTED_WIN_PROBABILITY_90D'),
      explanationMethod: getString(row, 'EXPLANATION_METHOD'),
      salesExplanation: getString(row, 'SALES_EXPLANATION'),
      recommendedAction: getString(row, 'RECOMMENDED_ACTION'),
      reasons: [
        {
          theme: getString(row, 'TOP_REASON_1_THEME'),
          feature: getString(row, 'TOP_REASON_1'),
        },
        {
          theme: getString(row, 'TOP_REASON_2_THEME'),
          feature: getString(row, 'TOP_REASON_2'),
        },
        {
          theme: getString(row, 'TOP_REASON_3_THEME'),
          feature: getString(row, 'TOP_REASON_3'),
        },
      ].filter((reason) => reason.feature),
    })),
  }
}

function queryOptionalSnowflake(sqlText) {
  return querySnowflake(sqlText).catch(() => [])
}

function buildConnectionOptions() {
  const options = {
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
  }

  if (process.env.SNOWFLAKE_PRIVATE_KEY_BASE64) {
    options.authenticator = 'SNOWFLAKE_JWT'
    options.privateKey = Buffer.from(
      process.env.SNOWFLAKE_PRIVATE_KEY_BASE64,
      'base64',
    ).toString('utf8')
    if (process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE) {
      options.privateKeyPass = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE
    }
    return options
  }

  // Prefer key-pair (JWT) auth for this server endpoint. A server cannot use
  // interactive `externalbrowser` auth, so we use the RSA key when present.
  const privateKeyPath =
    process.env.SNOWFLAKE_PRIVATE_KEY_PATH || resolve(process.cwd(), 'rsa_key.p8')

  if (existsSync(privateKeyPath)) {
    options.authenticator = 'SNOWFLAKE_JWT'
    options.privateKeyPath = privateKeyPath
    if (process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE) {
      options.privateKeyPass = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE
    }
    return options
  }

  // Fallback for local development without a key pair configured.
  options.password = process.env.SNOWFLAKE_PASSWORD
  options.authenticator = process.env.SNOWFLAKE_AUTHENTICATOR
  return options
}

function querySnowflake(sqlText) {
  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection(buildConnectionOptions())

    connection.connect((connectError) => {
      if (connectError) {
        reject(connectError)
        return
      }

      connection.execute({
        sqlText,
        timeout: 30,
        complete: (queryError, _statement, rows = []) => {
          connection.destroy()

          if (queryError) {
            reject(queryError)
            return
          }

          resolve(rows)
        },
      })
    })
  })
}

function mapOverview(row) {
  return {
    activationRate: getNumber(row, 'ACTIVATION_RATE'),
    activatedUsers: getNumber(row, 'ACTIVATED_USERS'),
    activeUsers: getNumber(row, 'ACTIVE_USERS'),
    avgDistinctEvents: getNumber(row, 'AVG_DISTINCT_EVENTS'),
    avgEventsPerActiveUser: getNumber(row, 'AVG_EVENTS_PER_ACTIVE_USER'),
    avgEventsPerUser: getNumber(row, 'AVG_EVENTS_PER_USER'),
    firstLoginAt: getDateString(row, 'FIRST_LOGIN_AT'),
    latestLoginAt: getDateString(row, 'LATEST_LOGIN_AT'),
    marketingOptedUsers: getNumber(row, 'MARKETING_OPTED_USERS'),
    marketingOptInRate: getNumber(row, 'MARKETING_OPT_IN_RATE'),
    totalEvents: getNumber(row, 'TOTAL_EVENTS'),
    totalUsers: getNumber(row, 'TOTAL_USERS'),
  }
}

function getDateString(row, key) {
  const value = row[key]

  if (!value) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return String(value)
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown Snowflake error'
}

const causalOutputFiles = {
  treatmentSummary: 'treatment_summary.csv',
  diagnostics: 'propensity_overlap_diagnostics.csv',
  causalEffects: 'causal_effect_estimates.csv',
  heterogeneousEffects: 'heterogeneous_treatment_effects.csv',
  interventionCandidates: 'intervention_candidates.csv',
  experimentBrief: 'experiment_brief.csv',
}

function getCausalOutputDir() {
  return resolve(process.cwd(), 'causal_outputs')
}

function readCausalCsv(filename) {
  const filePath = resolve(getCausalOutputDir(), filename)

  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${filename}. Run causal_inference.ipynb through the export cell to populate causal_outputs/.`,
    )
  }

  return parseCsv(readFileSync(filePath, 'utf8'))
}

function parseCsv(raw) {
  const lines = raw.trim().split(/\r?\n/)
  if (lines.length === 0) {
    return []
  }

  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function splitCsvLine(line) {
  const values = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(value)
      value = ''
    } else {
      value += char
    }
  }

  values.push(value)
  return values
}

function mapCausalRow(row) {
  const mapped = {}
  for (const [key, rawValue] of Object.entries(row)) {
    const numeric = Number(rawValue)
    mapped[key] = rawValue !== '' && Number.isFinite(numeric) ? numeric : rawValue
  }
  return mapped
}

export function getCausalInferenceDashboard() {
  const treatmentSummary = readCausalCsv(causalOutputFiles.treatmentSummary).map(mapCausalRow)
  const diagnostics = readCausalCsv(causalOutputFiles.diagnostics).map(mapCausalRow)
  const causalEffects = readCausalCsv(causalOutputFiles.causalEffects).map(mapCausalRow)
  const heterogeneousEffects = readCausalCsv(causalOutputFiles.heterogeneousEffects).map(mapCausalRow)
  const interventionCandidates = readCausalCsv(causalOutputFiles.interventionCandidates)
    .map(mapCausalRow)
    .sort((a, b) => b.estimated_uplift - a.estimated_uplift)
    .slice(0, 50)
  const experimentBriefRows = readCausalCsv(causalOutputFiles.experimentBrief)

  const experimentBrief = Object.fromEntries(
    experimentBriefRows.map((row) => [row.field, row.recommendation]),
  )

  const sortedEffects = [...causalEffects].sort(
    (a, b) => b.aipw_ate_common_support - a.aipw_ate_common_support,
  )
  const recommendedTreatment = experimentBrief['Treatment to test']
  const leadTreatment =
    causalEffects.find((row) => row.treatment === recommendedTreatment) ??
    sortedEffects[0] ??
    null

  return {
    meta: {
      accountsStudied: treatmentSummary[0]?.accounts ?? 0,
      treatmentsTested: causalEffects.length,
      outcomeWindowDays: 90,
      sourceNotebook: 'causal_inference.ipynb',
      outputDir: 'causal_outputs/',
    },
    experimentBrief,
    leadTreatment,
    treatmentSummary,
    diagnostics,
    causalEffects: sortedEffects,
    heterogeneousEffects: heterogeneousEffects.slice(0, 30),
    interventionCandidates,
  }
}

function getBoolean(row, key) {
  const value = row[key]

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value === 1
  }

  return String(value ?? '').trim().toLowerCase() === 'true'
}

function getNumber(row, key) {
  return Number(row[key] ?? 0)
}

function getString(row, key) {
  return String(row[key] ?? '')
}
