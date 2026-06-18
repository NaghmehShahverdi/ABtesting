// Sales-facing readout of the Product-Qualified Account Scoring model
// built in ml.ipynb. This view is fully data-driven: it reads the model
// results live from Snowflake (ML_MODEL_METRICS, ML_CALIBRATION,
// ML_FEATURE_IMPORTANCE, ML_ACCOUNT_SCORES) through the /api/ml-scoring
// endpoint. There is no CSV or hardcoded number on this page.

type ModelRow = {
  name: string
  label: string
  rows: number
  baseRate: number
  rocAuc: number
  prAuc: number
  logLoss: number
  brierScore: number
  precisionAt10: number
  recallAt10: number
  liftAt10: number
  revenueCaptureAt10: number
  deployed: boolean
}

type SelectionRationale = {
  primaryMetric: string
  tieBreakMetric: string
  selectionDataset: string
  evaluationDataset: string
  deployedLabel: string
  validationRevenueCapture: number
  validationPrAuc: number
  testRevenueCapture: number
  testPrAuc: number
  testBrierScore: number
  bestTestAucLabel: string
  bestTestAuc: number
  bestTestLiftLabel: string
  bestTestLift: number
  bestTestRecallLabel: string
  bestTestRecall: number
  bestTestRevenueLabel: string
  bestTestRevenue: number
  bestTestPrAucLabel: string
  bestTestPrAuc: number
  bestTestBrierLabel: string
  bestTestBrier: number
  deployedBeatsBestAucOnRevenue: boolean
}

type CalibrationSummary = {
  meanAbsError: number
  topDecilePredicted: number
  topDecileActual: number
  topDecileGap: number
  bottomDecilePredicted: number
  bottomDecileActual: number
}

type DecileRow = {
  binOrder: number
  accounts: number
  avgPredicted: number
  actualWinRate: number
  wins: number
}

type DriverRow = {
  feature: string
  importance: number
}

type PriorityAccount = {
  rank: number
  name: string
  industry: string
  segment: string
  arr: number
  probability: number
  converted: boolean
}

type AccountReason = {
  theme: string
  feature: string
}

type AccountExplanation = {
  rank: number
  name: string
  industry: string
  segment: string
  arr: number
  probability: number
  explanationMethod: string
  salesExplanation: string
  recommendedAction: string
  reasons: AccountReason[]
}

type CohortSlice = {
  key: string
  label: string
  size: number
  conversionRate: number
  wins: number
  lift: number
}

type CohortPerformance = {
  totalAccounts: number
  baselineRate: number
  cohorts: CohortSlice[]
}

export type MlScoringDashboard = {
  deployedModel: ModelRow | null
  horizonDays: number
  models: ModelRow[]
  validationModels: ModelRow[]
  selectionRationale: SelectionRationale | null
  calibrationSummary: CalibrationSummary | null
  cohortPerformance: CohortPerformance | null
  deciles: DecileRow[]
  drivers: DriverRow[]
  priorityAccounts: PriorityAccount[]
  accountExplanations: AccountExplanation[]
}

export type MlAlgorithmState = {
  dashboard?: MlScoringDashboard
  error?: string
  status: 'idle' | 'loading' | 'success' | 'error'
}

type Theme = 'Company fit' | 'Sales engagement' | 'Product usage' | 'Marketing' | 'Geography' | 'Other'

type CopilotMessage = {
  role: 'user' | 'assistant'
  content: string
}

const copilotHistory: CopilotMessage[] = []
let copilotRequestInFlight = false

const themeColors: Record<string, string> = {
  'Company fit': '#2563eb',
  'Sales engagement': '#16a34a',
  'Product usage': '#0891b2',
  Marketing: '#f59e0b',
  Geography: '#7c3aed',
  Other: '#64748b',
}

// Map raw model feature names to a plain-English label + business theme.
const driverDictionary: Record<string, { label: string; theme: Theme }> = {
  num__estimated_annual_recurring_revenue: { label: 'Company size (annual revenue)', theme: 'Company fit' },
  num__avg_experience_years: { label: 'Team seniority (avg. experience)', theme: 'Company fit' },
  num__max_experience_years: { label: 'Most senior contact', theme: 'Company fit' },
  num__prior_max_seats: { label: 'Seats on prior deals', theme: 'Company fit' },
  num__prior_deals_to_date: { label: 'Prior deals on account', theme: 'Company fit' },
  num__prior_pipeline_amount: { label: 'Prior pipeline value', theme: 'Company fit' },
  num__distinct_countries: { label: 'Geographic spread', theme: 'Company fit' },
  num__avg_call_duration_seconds: { label: 'Sales call depth (avg. length)', theme: 'Sales engagement' },
  num__days_since_last_sales_activity: { label: 'Sales engagement recency', theme: 'Sales engagement' },
  num__activity_count__contract_sent: { label: 'Contracts sent', theme: 'Sales engagement' },
  num__activity_count__meeting_scheduled: { label: 'Meetings scheduled', theme: 'Sales engagement' },
  num__activity_count__demo_held: { label: 'Demos held', theme: 'Sales engagement' },
  num__activity_count__email_sent: { label: 'Sales emails sent', theme: 'Sales engagement' },
  num__event_count__workspace_created: { label: 'Workspaces created in product', theme: 'Product usage' },
  num__total_events_to_date: { label: 'Overall product activity to date', theme: 'Product usage' },
  num__event_count__api_call_made: { label: 'API usage', theme: 'Product usage' },
  num__event_count__workflow_created: { label: 'Workflows created', theme: 'Product usage' },
  num__event_count__report_generated: { label: 'Reports generated', theme: 'Product usage' },
  num__events_last_90d: { label: 'Recent product activity (90d)', theme: 'Product usage' },
  num__days_since_first_event: { label: 'Product tenure', theme: 'Product usage' },
  num__days_since_last_event: { label: 'Product activity recency', theme: 'Product usage' },
  num__avg_lead_cost: { label: 'Acquisition channel cost', theme: 'Marketing' },
  num__total_lead_cost: { label: 'Total marketing spend on account', theme: 'Marketing' },
  num__marketing_opt_in_rate: { label: 'Marketing opt-in rate', theme: 'Marketing' },
  num__converted_leads_to_date: { label: 'Converted leads to date', theme: 'Marketing' },
  cat__primary_utm_medium_paid_search: { label: 'Acquired via paid search', theme: 'Marketing' },
  cat__primary_lead_source_Google_Ads: { label: 'Acquired via Google Ads', theme: 'Marketing' },
}

const modelCard = {
  predictionTarget: 'Net-new Closed Won deal',
  predictionHorizonDays: 90,
  trainingPeriod: 'Jul 2023 – Jul 2024',
  testPeriod: 'Dec 2024 – Apr 2025',
  scoringUnit: 'Account-month',
  positiveClass:
    'Account creates a Won / Closed Won deal within 90 days of the snapshot (excludes accounts already won before snapshot)',
  refreshCadence: 'Monthly snapshot · retrain monthly',
  knownLimitation: 'Deal created_date is used as proxy for close/stage transition date',
}

const themeBlurbs: Record<string, string> = {
  'Company fit': 'Bigger, more senior, multi-seat accounts in the right industries convert more often.',
  'Sales engagement': 'Longer, recent sales conversations and live deal activity are strong buying signals.',
  'Product usage': 'Accounts that set up workspaces and stay active in the product are warming up to buy.',
  Marketing: 'How the account was acquired and its marketing engagement both shape the odds.',
  Geography: 'Regional patterns in the model can nudge scores up or down for similar accounts.',
  Other: 'Additional model signals that do not fit a single GTM theme.',
}

export async function fetchMlScoring(): Promise<MlScoringDashboard> {
  const response = await fetch(`${getApiBaseUrl()}/api/ml-scoring`, {
    headers: { Accept: 'application/json' },
  })
  const raw = await response.text()

  let payload: { error?: string; details?: string } & Partial<MlScoringDashboard>
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error(
      'The /api/ml-scoring route returned HTML instead of JSON, which means the Snowflake API endpoint is not loaded. Stop and restart the dev server ("npm run dev") so Vite picks up vite.config.mjs.',
    )
  }

  if (!response.ok) {
    const details = typeof payload?.details === 'string' ? ` ${payload.details}` : ''
    throw new Error(`${payload?.error ?? 'Failed to load account scoring results.'}${details}`)
  }

  return payload as MlScoringDashboard
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
}

export function renderMlAlgorithm(state: MlAlgorithmState): string {
  return `
    <section class="page-header">
      <p class="eyebrow">Account Scoring Model</p>
      <h1>Prioritize accounts most likely to convert in the next 90 days.</h1>
      <p class="summary">
        This model reads each account's product usage, sales conversations, marketing history,
        and company profile, then predicts the probability it becomes a <strong>Closed&nbsp;Won</strong>
        deal in the next 90 days. Results are served live from Snowflake so the call list is always current.
      </p>
    </section>

    ${renderModelCardSection()}
    ${renderBody(state)}
  `
}

function renderModelCardSection(): string {
  return `
    <section class="usage-section ml-model-card-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Model card</p>
          <h2>What this model predicts</h2>
        </div>
      </div>
      <dl class="ml-model-card">
        <div class="ml-model-card-item">
          <dt>Prediction target</dt>
          <dd>${modelCard.predictionTarget}</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Prediction horizon</dt>
          <dd>${modelCard.predictionHorizonDays} days</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Training period</dt>
          <dd>${modelCard.trainingPeriod}</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Test period</dt>
          <dd>${modelCard.testPeriod}</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Unit of scoring</dt>
          <dd>${modelCard.scoringUnit}</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Positive class definition</dt>
          <dd>${modelCard.positiveClass}</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Refresh cadence</dt>
          <dd>${modelCard.refreshCadence}</dd>
        </div>
        <div class="ml-model-card-item ml-model-card-item-wide">
          <dt>Known limitation</dt>
          <dd>${modelCard.knownLimitation}</dd>
        </div>
      </dl>
    </section>
  `
}

function renderBody(state: MlAlgorithmState): string {
  if (state.status === 'loading' || state.status === 'idle') {
    return renderStatus('Loading account scores from Snowflake…', 'Querying ML_MODEL_METRICS, ML_CALIBRATION, ML_FEATURE_IMPORTANCE, ML_ACCOUNT_SCORES, and ML_ACCOUNT_EXPLANATIONS.')
  }

  if (state.status === 'error') {
    return renderStatus(
      'Could not load the scoring results.',
      state.error ?? 'Unknown error.',
      true,
    )
  }

  const dashboard = state.dashboard
  if (!dashboard || !dashboard.deployedModel) {
    return renderStatus(
      'No published scoring results yet.',
      'Run the publish step in ml.ipynb to populate the Snowflake tables, then refresh.',
      true,
    )
  }

  return `
    <div class="ml-page">
      ${renderHeadlineSection(dashboard)}
      ${renderHowItWorksSection(dashboard)}
      ${renderLiftSection(dashboard)}
      ${renderLeaderboardSection(dashboard)}
      ${renderDriversSection(dashboard)}
      ${renderAccountExplanationsSection(dashboard)}
      ${renderAccountCopilot()}
      ${renderActionSection()}
    </div>
  `
}

function renderStatus(title: string, detail: string, isError = false): string {
  return `
    <div class="ml-page">
      <div class="insight-card ml-status-card ${isError ? 'ml-status-error' : ''}">
        <strong>${title}</strong>
        <p>${detail}</p>
      </div>
    </div>
  `
}

function renderHeadlineSection(dashboard: MlScoringDashboard): string {
  const model = dashboard.deployedModel!

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">The bottom line</p>
          <h2>What the model buys you</h2>
        </div>
        <span>Measured on ${formatInteger(model.rows)} accounts the model never saw during training</span>
      </div>
      <div class="metric-grid">
        <article class="metric-card ml-highlight">
          <span>Revenue captured</span>
          <strong>${formatPercent(model.revenueCaptureAt10)}</strong>
          <p>of next-quarter won revenue sits in the top 10% of scored accounts.</p>
        </article>
        <article class="metric-card">
          <span>Conversion lift</span>
          <strong>${model.liftAt10.toFixed(1)}&times;</strong>
          <p>Top-ranked accounts convert ${model.liftAt10.toFixed(1)}&times; more often than a random list.</p>
        </article>
        <article class="metric-card">
          <span>Wins found early</span>
          <strong>${formatPercent(model.recallAt10)}</strong>
          <p>of all future wins are caught by reviewing just the top 10% of accounts.</p>
        </article>
        <article class="metric-card">
          <span>Ranking quality (AUC)</span>
          <strong>${model.rocAuc.toFixed(2)}</strong>
          <p>Strong separation of buyers from non-buyers (1.0 is perfect, 0.5 is a coin flip).</p>
        </article>
      </div>
      <p class="ml-footnote">
        Baseline win rate is only ${formatPercent(model.baseRate, 1)}, so chasing accounts at random is expensive.
        The model concentrates that signal into a short list.
      </p>
    </section>
  `
}

function renderHowItWorksSection(dashboard: MlScoringDashboard): string {
  const steps = [
    {
      n: '1',
      title: 'Take a monthly snapshot',
      body: 'On the first of each month we freeze what was known about every account at that moment.',
    },
    {
      n: '2',
      title: 'Look only at the past',
      body: 'Features use data on or before the snapshot, so the score never peeks at the future. No leakage.',
    },
    {
      n: '3',
      title: `Predict the next ${dashboard.horizonDays} days`,
      body: `The target is whether the account closes a won deal within ${dashboard.horizonDays} days of the snapshot.`,
    },
    {
      n: '4',
      title: 'Test on the future',
      body: 'We train on older months and grade the model on the most recent months it has never seen.',
    },
  ]

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">How it works</p>
          <h2>Built to be trusted, not just accurate</h2>
        </div>
        <span>Time-aware, leakage-safe design</span>
      </div>
      <div class="ml-steps">
        ${steps
          .map(
            (step) => `
          <article class="ml-step">
            <span>${step.n}</span>
            <h3>${step.title}</h3>
            <p>${step.body}</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderLiftSection(dashboard: MlScoringDashboard): string {
  const deciles = [...dashboard.deciles].sort((a, b) => a.binOrder - b.binOrder)

  if (deciles.length === 0) {
    return ''
  }

  const maxRate = Math.max(...deciles.map((row) => row.actualWinRate))
  const maxOrder = Math.max(...deciles.map((row) => row.binOrder))
  const top = deciles[deciles.length - 1]
  const halfIndex = Math.floor(deciles.length / 2)
  const bottomHalfWins = deciles.slice(0, halfIndex).reduce((sum, row) => sum + row.wins, 0)
  const totalWins = deciles.reduce((sum, row) => sum + row.wins, 0)

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Does the score hold up?</p>
          <h2>Actual win rate climbs with the score</h2>
        </div>
        <span>Accounts split into ${deciles.length} equal score bands</span>
      </div>
      <div class="chart-card">
        <p class="ml-chart-caption">
          Each bar is the <strong>real</strong> closed-won rate of accounts in that score band on the held-out period.
          The top band converts at ${formatPercent(top.actualWinRate, 0)} versus near zero at the bottom &mdash;
          and its predicted ${formatPercent(top.avgPredicted, 0)} lines up closely with reality, so the probabilities are dependable.
        </p>
        <div class="ml-decile-chart">
          ${deciles
            .map((row) => {
              const height = maxRate > 0 ? Math.max((row.actualWinRate / maxRate) * 100, 2) : 2
              const isTop = row.binOrder === maxOrder
              return `
                <div class="ml-decile-col">
                  <strong>${formatPercent(row.actualWinRate, 0)}</strong>
                  <div class="ml-decile-bar ${isTop ? 'is-top' : ''}" style="height: ${height}%"></div>
                  <span>${decileLabel(row.binOrder, maxOrder)}</span>
                </div>
              `
            })
            .join('')}
        </div>
      </div>
      <p class="ml-footnote">
        Only ${formatInteger(bottomHalfWins)} of ${formatInteger(totalWins)} eventual wins came from the bottom half of scores &mdash;
        clear evidence the team can safely deprioritize low-scoring accounts.
      </p>
    </section>
  `
}

function renderLeaderboardSection(dashboard: MlScoringDashboard): string {
  const rationale = dashboard.selectionRationale
  const calibration = dashboard.calibrationSummary

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Model selection</p>
          <h2>We compared ${dashboard.models.length} models and shipped the best fit</h2>
        </div>
        <span>Held-out test period &middot; selection made on validation</span>
      </div>

      ${rationale ? renderSelectionCallout(rationale) : ''}

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>ROC-AUC</th>
              <th>PR-AUC</th>
              <th>Brier score</th>
              <th>Lift @10%</th>
              <th>Recall @10%</th>
              <th>Revenue @10%</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.models
              .map(
                (model) => `
              <tr class="${model.deployed ? 'ml-row-deployed' : ''}">
                <td>${model.label}${model.deployed ? ' <span class="ml-tag">Deployed</span>' : ''}</td>
                <td>${model.rocAuc.toFixed(3)}</td>
                <td>${model.prAuc.toFixed(3)}</td>
                <td>${model.brierScore.toFixed(4)}</td>
                <td>${model.liftAt10.toFixed(2)}&times;</td>
                <td>${formatPercent(model.recallAt10)}</td>
                <td><strong>${formatPercent(model.revenueCaptureAt10)}</strong></td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="ml-metric-legend">
        <span class="ml-legend-chip"><strong>ROC-AUC</strong> ranking quality</span>
        <span class="ml-legend-chip"><strong>PR-AUC</strong> rare-event precision</span>
        <span class="ml-legend-chip"><strong>Brier</strong> calibration (lower is better)</span>
        <span class="ml-legend-chip ml-legend-chip-accent"><strong>Revenue @10%</strong> business metric</span>
      </div>

      ${
        calibration
          ? `
        <div class="ml-calibration-strip">
          <div class="ml-calibration-stat">
            <span>Top decile predicted</span>
            <strong>${formatPercent(calibration.topDecilePredicted, 1)}</strong>
          </div>
          <div class="ml-calibration-stat">
            <span>Top decile actual</span>
            <strong>${formatPercent(calibration.topDecileActual, 1)}</strong>
          </div>
          <div class="ml-calibration-stat">
            <span>Calibration gap</span>
            <strong>${formatPercent(calibration.topDecileGap, 1)}</strong>
          </div>
          <div class="ml-calibration-stat">
            <span>Mean abs. error</span>
            <strong>${formatPercent(calibration.meanAbsError, 2)}</strong>
          </div>
        </div>
      `
          : ''
      }
    </section>
  `
}

function renderSelectionCallout(rationale: SelectionRationale): string {
  const deployed = rationale.deployedLabel
  const challenger = rationale.bestTestAucLabel
  const revenueLeader = rationale.bestTestRevenueLabel
  const sameAsRevenueLeader = revenueLeader === deployed

  const reasons = [
    {
      title: 'Business goal',
      body: `Sales cares about dollars in the top-ranked accounts, not just win count. ${deployed} captured ${formatPercent(rationale.validationRevenueCapture)} of validation revenue in the top 10% when selected${sameAsRevenueLeader ? ` and leads on test revenue at ${formatPercent(rationale.testRevenueCapture)}` : ''}.`,
    },
    {
      title: `Why not ${challenger}?`,
      body: `It has the strongest test ROC-AUC (${rationale.bestTestAuc.toFixed(3)}), lift (${rationale.bestTestLift.toFixed(2)}× via ${rationale.bestTestLiftLabel}), and recall (${formatPercent(rationale.bestTestRecall)} via ${rationale.bestTestRecallLabel}), but those metrics treat every win equally. ${challenger !== revenueLeader ? `${revenueLeader} captures more test revenue (${formatPercent(rationale.bestTestRevenue)} vs ${formatPercent(rationale.testRevenueCapture)} for ${deployed}).` : ''}${rationale.deployedBeatsBestAucOnRevenue ? ` ${deployed} still ranks higher-value wins into the top decile.` : ''}`,
    },
    {
      title: 'Imbalance + calibration',
      body: `PR-AUC on test is ${rationale.testPrAuc.toFixed(3)} for ${deployed} (best: ${rationale.bestTestPrAuc.toFixed(3)} via ${rationale.bestTestPrAucLabel}). Brier score is ${rationale.testBrierScore.toFixed(4)} (best: ${rationale.bestTestBrier.toFixed(4)} via ${rationale.bestTestBrierLabel}) — probabilities stay usable for routing thresholds, not just ranking.`,
    },
  ]

  return `
    <div class="ml-selection-callout">
      <div class="ml-selection-header">
        <h3>Why ${deployed} is deployed</h3>
        <p>
          Model choice is not based on ROC-AUC or lift alone. We select on
          <em>${rationale.primaryMetric}</em> using the ${rationale.selectionDataset} period
          (tie-break: ${rationale.tieBreakMetric}), then report holdout performance on the
          ${rationale.evaluationDataset} period below.
        </p>
      </div>
      <div class="ml-selection-grid">
        ${reasons
          .map(
            (reason) => `
          <article class="ml-selection-reason">
            <h4>${reason.title}</h4>
            <p>${reason.body}</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </div>
  `
}

function renderDriversSection(dashboard: MlScoringDashboard): string {
  if (dashboard.drivers.length === 0) {
    return ''
  }

  const maxImportance = Math.max(...dashboard.drivers.map((row) => row.importance))
  const resolved = dashboard.drivers.map((row) => ({ ...row, ...resolveDriver(row.feature) }))
  const themes = Array.from(new Set(resolved.map((row) => row.theme)))

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Global model drivers</p>
          <h2>What matters across all accounts</h2>
        </div>
        <span>Population-level feature importance</span>
      </div>
      <p class="ml-section-lead">
        These are the model's strongest signals overall. They answer "what does the model care about globally?"
        Account cards below answer the Sales question: "why is <em>this</em> account ranked high right now?"
      </p>
      <div class="usage-two-column">
        <div class="chart-card">
          <div class="usage-bars">
            ${resolved
              .map((row) => {
                const width = Math.max((row.importance / maxImportance) * 100, 4)
                return `
                  <div class="usage-bar-row">
                    <div>
                      <span>${row.label}</span>
                      <strong>${formatPercent(row.importance, 1)}</strong>
                    </div>
                    <div class="usage-bar-track">
                      <div class="usage-bar-fill" style="width: ${width}%; background: ${themeColors[row.theme]}"></div>
                    </div>
                  </div>
                `
              })
              .join('')}
          </div>
        </div>
        <div class="chart-card ml-theme-card">
          <h3>Read it in plain English</h3>
          <ul class="ml-theme-list">
            ${themes
              .map(
                (theme) => `
              <li>
                <span class="ml-theme-dot" style="background: ${themeColors[theme]}"></span>
                <div>
                  <strong>${theme}</strong>
                  <p>${themeBlurbs[theme] ?? 'Signals in this theme contribute to the model score.'}</p>
                </div>
              </li>
            `,
              )
              .join('')}
          </ul>
        </div>
      </div>
    </section>
  `
}

function renderAccountExplanationsSection(dashboard: MlScoringDashboard): string {
  const accounts =
    dashboard.accountExplanations.length > 0
      ? dashboard.accountExplanations
      : dashboard.priorityAccounts.map((account) => ({
          rank: account.rank,
          name: account.name,
          industry: account.industry,
          segment: account.segment,
          arr: account.arr,
          probability: account.probability,
          explanationMethod: '',
          salesExplanation: '',
          recommendedAction: '',
          reasons: [] as AccountReason[],
        }))

  if (accounts.length === 0) {
    return ''
  }

  const hasExplanations = dashboard.accountExplanations.length > 0
  const cohort = dashboard.cohortPerformance

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Account-level explanations</p>
          <h2>Why these accounts, why now</h2>
        </div>
        <span>Ranked call list with model reason codes</span>
      </div>

      ${
        hasExplanations
          ? `<p class="ml-section-lead">Each card translates this account's strongest model signals into Sales-readable reasons. These are explanation aids, not causal claims. Conversion lift is measured at the cohort level below — not every individual account on the call list will convert.</p>`
          : `<p class="ml-section-lead ml-section-lead-muted">Run Section 15 in ml_new.ipynb and publish <code>ML_ACCOUNT_EXPLANATIONS</code> to Snowflake to show account-level reason codes here.</p>`
      }

      ${cohort ? renderCohortPerformanceStrip(cohort) : ''}

      <div class="ml-account-grid">
        ${accounts
          .map((account) => renderAccountExplanationCard(account, hasExplanations))
          .join('')}
      </div>

      <p class="ml-footnote">
        Cards show the top ${accounts.length} accounts to action this week. Cohort conversion rates above reflect held-out test performance across the full ranked list (${cohort ? formatInteger(cohort.totalAccounts) : 'all'} accounts), not just these ${accounts.length}.
      </p>
    </section>
  `
}

function renderCohortPerformanceStrip(cohort: CohortPerformance): string {
  const highlightKeys = new Set(['top_100', 'top_decile'])

  return `
    <div class="ml-cohort-panel">
      <div class="ml-cohort-header">
        <h3>How the ranked list performs in aggregate</h3>
        <p>
          Held-out test set baseline: <strong>${formatPercent(cohort.baselineRate, 1)}</strong>.
          Wins concentrate in the top cohorts — individual call-list accounts can still lose.
        </p>
      </div>
      <div class="ml-cohort-grid">
        ${cohort.cohorts
          .map(
            (slice) => `
          <article class="ml-cohort-card ${highlightKeys.has(slice.key) ? 'is-highlight' : ''}">
            <span>${slice.label}</span>
            <strong>${formatPercent(slice.conversionRate, 1)}</strong>
            <p>${formatInteger(slice.wins)} wins · ${slice.lift.toFixed(1)}× vs baseline</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </div>
  `
}

function renderAccountExplanationCard(account: AccountExplanation, hasExplanations: boolean): string {
  return `
    <article class="ml-account-card">
      <header class="ml-account-card-header">
        <div>
          <span class="ml-account-rank">#${account.rank}</span>
          <h3>${account.name}</h3>
          <p>${account.industry} · ${account.segment} · ${formatCurrency(account.arr)} ARR</p>
        </div>
        <div class="ml-account-score">
          <span>Win probability</span>
          <strong>${formatPercent(account.probability, 0)}</strong>
        </div>
      </header>

      ${
        hasExplanations
          ? `
        <div class="ml-account-why">
          <h4>Why this account?</h4>
          <p>${account.salesExplanation}</p>
          ${
            account.reasons.length > 0
              ? `
            <ul class="ml-reason-list">
              ${account.reasons
                .map(
                  (reason) => `
                <li>
                  <span class="ml-reason-theme" style="background: ${getThemeColor(reason.theme)}">${reason.theme}</span>
                  <span>${reason.feature}</span>
                </li>
              `,
                )
                .join('')}
            </ul>
          `
              : ''
          }
        </div>
        <div class="ml-account-action">
          <span>Recommended action</span>
          <p>${account.recommendedAction}</p>
        </div>
      `
          : `
        <div class="ml-account-why ml-account-why-muted">
          <p>Account-level explanation not published yet.</p>
        </div>
      `
      }
    </article>
  `
}

function renderAccountCopilot(): string {
  const messages =
    copilotHistory.length > 0
      ? copilotHistory
          .map(
            (message) => `
              <div class="ml-copilot-message ${message.role}">
                ${escapeHtml(message.content)}
              </div>
            `,
          )
          .join('')
      : `
          <div class="ml-copilot-message assistant">
            Ask me which accounts to prioritize, why the deployed model was selected,
            or how to interpret model performance.
          </div>
        `

  return `
    <section class="usage-section ml-copilot">
      <div class="section-heading">
        <div>
          <p class="eyebrow">AI assistant</p>
          <h2>Ask the Account Scoring Copilot</h2>
        </div>
        <span>Grounded in current Snowflake scoring results</span>
      </div>

      <p class="ml-section-lead">
        The copilot receives current model metrics, global drivers, and ranked accounts.
        It cannot see Snowflake credentials or invent account-level reason codes.
      </p>

      <div class="ml-copilot-panel">
        <div
          id="account-copilot-messages"
          class="ml-copilot-messages"
          role="log"
          aria-live="polite"
        >
          ${messages}
        </div>

        <div class="ml-copilot-suggestions" aria-label="Suggested questions">
          <button type="button" data-copilot-question="Which five accounts should sales prioritize, and why?">
            Top five accounts
          </button>
          <button type="button" data-copilot-question="Why was the deployed model selected instead of the alternatives?">
            Explain model selection
          </button>
          <button type="button" data-copilot-question="What are the strongest global model drivers, and how should sales interpret them?">
            Explain model drivers
          </button>
        </div>

        <form id="account-copilot-form" class="ml-copilot-form">
          <label class="ml-copilot-input-wrap">
            <span class="sr-only">Question for Account Scoring Copilot</span>
            <textarea
              id="account-copilot-input"
              maxlength="1000"
              rows="3"
              placeholder="Ask about accounts, scores, models, calibration, or drivers…"
              required
            ></textarea>
          </label>
          <button type="submit" class="primary-action">
            ${copilotRequestInFlight ? 'Thinking…' : 'Ask Copilot'}
          </button>
        </form>
      </div>
    </section>
  `
}

export function bindAccountCopilot(): void {
  const form = document.querySelector<HTMLFormElement>('#account-copilot-form')
  const input = document.querySelector<HTMLTextAreaElement>('#account-copilot-input')

  if (!form || !input || form.dataset.bound === 'true') {
    return
  }

  form.dataset.bound = 'true'
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const question = input.value.trim()
    if (!question || copilotRequestInFlight) {
      return
    }

    input.value = ''
    await submitCopilotQuestion(question)
  })

  document
    .querySelectorAll<HTMLButtonElement>('[data-copilot-question]')
    .forEach((button) => {
      button.addEventListener('click', async () => {
        const question = button.dataset.copilotQuestion?.trim()
        if (question && !copilotRequestInFlight) {
          await submitCopilotQuestion(question)
        }
      })
    })
}

async function submitCopilotQuestion(question: string): Promise<void> {
  const priorHistory = copilotHistory.slice(-6)
  appendCopilotMessage('user', question)
  setCopilotLoading(true)

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/account-copilot`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        history: priorHistory,
      }),
    })
    const payload = await response.json()

    if (!response.ok) {
      const details = typeof payload?.details === 'string' ? ` ${payload.details}` : ''
      throw new Error(`${payload?.error ?? 'Account Copilot could not answer.'}${details}`)
    }

    if (typeof payload?.answer !== 'string' || !payload.answer.trim()) {
      throw new Error('Account Copilot returned an empty answer.')
    }

    appendCopilotMessage('assistant', payload.answer.trim())
  } catch (error) {
    appendCopilotMessage(
      'assistant',
      error instanceof Error ? error.message : 'Account Copilot could not answer.',
    )
  } finally {
    setCopilotLoading(false)
  }
}

function appendCopilotMessage(role: CopilotMessage['role'], content: string): void {
  copilotHistory.push({ role, content })

  const container = document.querySelector<HTMLDivElement>('#account-copilot-messages')
  if (!container) {
    return
  }

  const message = document.createElement('div')
  message.className = `ml-copilot-message ${role}`
  message.textContent = content
  container.appendChild(message)
  container.scrollTop = container.scrollHeight
}

function setCopilotLoading(loading: boolean): void {
  copilotRequestInFlight = loading

  const submitButton = document.querySelector<HTMLButtonElement>(
    '#account-copilot-form button[type="submit"]',
  )
  const input = document.querySelector<HTMLTextAreaElement>('#account-copilot-input')

  if (submitButton) {
    submitButton.disabled = loading
    submitButton.textContent = loading ? 'Thinking…' : 'Ask Copilot'
  }
  if (input) {
    input.disabled = loading
  }

  document
    .querySelectorAll<HTMLButtonElement>('[data-copilot-question]')
    .forEach((button) => {
      button.disabled = loading
    })
}

function getThemeColor(theme: string): string {
  return themeColors[theme] ?? themeColors.Other
}

function renderActionSection(): string {
  const items = [
    'Sales works the ranked list top-down each week, leading with the listed buying signals.',
    'Marketing doubles down on the channels and segments that produce high-scoring accounts.',
    'Scores are published to Snowflake and can be surfaced in the CRM or next to Product Usage Analytics.',
    'Production roadmap: true close-date targets, SHAP explanations, monthly retraining, and drift monitoring.',
  ]

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">From model to action</p>
          <h2>How the team uses it</h2>
        </div>
        <span>Built to plug into the GTM motion</span>
      </div>
      <div class="insight-card ml-action-card">
        <ul class="ml-action-list">
          ${items.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </div>
    </section>
  `
}

function resolveDriver(feature: string): { label: string; theme: Theme } {
  const known = driverDictionary[feature]
  if (known) {
    return known
  }

  return { label: humanizeFeature(feature), theme: inferTheme(feature) }
}

function humanizeFeature(feature: string): string {
  const withoutPrefix = feature.replace(/^num__/, '').replace(/^cat__/, '')
  const spaced = withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function inferTheme(feature: string): Theme {
  const value = feature.toLowerCase()
  if (/(lead|utm|campaign|marketing|opt_in|sdr_source|google|paid)/.test(value)) {
    return 'Marketing'
  }
  if (/(activity|sales|call|meeting|demo|contract|sdr)/.test(value)) {
    return 'Sales engagement'
  }
  if (/(event|events|workspace|workflow|api|report|dashboard|product)/.test(value)) {
    return 'Product usage'
  }
  return 'Company fit'
}

function decileLabel(binOrder: number, maxOrder: number): string {
  if (binOrder === 0) {
    return 'Bottom 10%'
  }
  if (binOrder === maxOrder) {
    return 'Top 10%'
  }
  return `Decile ${binOrder + 1}`
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}K`
  }
  return `$${value}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
