// Director-level readout of early feature adoption causal analysis from
// causal_inference.ipynb. Results are served from causal_outputs/ CSV
// artifacts through /api/causal-inference.

type TreatmentSummaryRow = {
  treatment: string
  event: string
  window_days: number
  accounts: number
  treated_rate: number
  outcome_rate: number
  treated_outcome_rate: number
  control_outcome_rate: number
}

type DiagnosticRow = {
  treatment: string
  accounts: number
  treated_accounts: number
  control_accounts: number
  naive_difference: number
  cross_fitted_propensity_auc: number
  common_support_rate: number
  treated_below_0_05: number
  control_below_0_05: number
}

type CausalEffectRow = {
  treatment: string
  question: string
  accounts: number
  treated_rate: number
  outcome_rate: number
  naive_difference: number
  ipw_ate: number
  aipw_ate: number
  aipw_ate_common_support: number
  common_support_rate: number
  ci_lower_95: number
  ci_upper_95: number
  recommendation: string
  product_hypothesis: string
}

type HeterogeneousEffectRow = {
  treatment: string
  segment_type: string
  segment_value: string
  accounts: number
  treated_rate: number
  outcome_rate: number
  avg_cate: number
}

type InterventionCandidateRow = {
  account_name: string
  industry: string
  segment: string
  estimated_annual_recurring_revenue: number
  treatment_name: string
  estimated_uplift: number
  probability_reliability: string
  predicted_conversion_if_treated: number
  predicted_conversion_if_control: number
}

export type CausalInferenceDashboard = {
  meta: {
    accountsStudied: number
    treatmentsTested: number
    outcomeWindowDays: number
    sourceNotebook: string
    outputDir: string
  }
  experimentBrief: Record<string, string>
  leadTreatment: CausalEffectRow | null
  treatmentSummary: TreatmentSummaryRow[]
  diagnostics: DiagnosticRow[]
  causalEffects: CausalEffectRow[]
  heterogeneousEffects: HeterogeneousEffectRow[]
  interventionCandidates: InterventionCandidateRow[]
}

export type CausalInferenceState = {
  dashboard?: CausalInferenceDashboard
  error?: string
  status: 'idle' | 'loading' | 'success' | 'error'
}

const treatmentLabels: Record<string, string> = {
  workspace_created_7d: 'Workspace created (7d)',
  report_generated_7d: 'Report generated (7d)',
  workflow_created_14d: 'Workflow created (14d)',
  api_call_made_14d: 'API call made (14d)',
}

const sectionNav = [
  { href: '#ci-home', label: 'Home' },
  { href: '#ci-executive-summary', label: 'Executive Summary' },
  { href: '#ci-treatment-explorer', label: 'Treatment Explorer' },
  { href: '#ci-segment-insights', label: 'Segment Insights' },
  { href: '#ci-account-recommendations', label: 'Account Recommendations' },
  { href: '#ci-causal-validation', label: 'Causal Validation' },
]

export async function fetchCausalInference(): Promise<CausalInferenceDashboard> {
  const response = await fetch(`${getApiBaseUrl()}/api/causal-inference`, {
    headers: { Accept: 'application/json' },
  })
  const raw = await response.text()

  let payload: { error?: string; details?: string } & Partial<CausalInferenceDashboard>
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error(
      'The /api/causal-inference route returned HTML instead of JSON. Restart the dev server so Vite picks up vite.config.mjs.',
    )
  }

  if (!response.ok) {
    const details = typeof payload?.details === 'string' ? ` ${payload.details}` : ''
    throw new Error(`${payload?.error ?? 'Failed to load causal inference results.'}${details}`)
  }

  return payload as CausalInferenceDashboard
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
}

export function renderCausalInference(state: CausalInferenceState): string {
  return `
    <section class="page-header">
      <p class="eyebrow">Causal inference</p>
      <h1>Which early product behaviors causally move conversion?</h1>
      <p class="summary">
        Unlike the Account Scoring Model, which ranks <em>who</em> is likely to convert, this analysis estimates
        <strong>whether helping similar accounts adopt a feature earlier increases 90-day Won conversion</strong>
        — using propensity adjustment, doubly robust AIPW, overlap diagnostics, and heterogeneous effects.
      </p>
    </section>

    ${renderBody(state)}
  `
}

function renderBody(state: CausalInferenceState): string {
  if (state.status === 'loading' || state.status === 'idle') {
    return renderDashboardShell(renderStatus('Loading causal inference results…', 'Reading causal_outputs/ from causal_inference.ipynb.'))
  }

  if (state.status === 'error') {
    return renderDashboardShell(renderStatus('Could not load causal results.', state.error ?? 'Unknown error.', true))
  }

  const dashboard = state.dashboard
  if (!dashboard || dashboard.causalEffects.length === 0) {
    return renderDashboardShell(
      renderStatus(
        'No causal outputs yet.',
        'Run causal_inference.ipynb through the export cell to populate causal_outputs/, then refresh.',
        true,
      ),
    )
  }

  return renderDashboardShell(`
    ${renderHomeSection(dashboard)}
    ${renderExecutiveSummarySection(dashboard)}
    ${renderTreatmentExplorerSection(dashboard)}
    ${renderSegmentInsightsSection(dashboard)}
    ${renderAccountRecommendationsSection(dashboard)}
    ${renderCausalValidationSection(dashboard)}
  `)
}

function renderDashboardShell(content: string): string {
  return `
    <section class="usage-dashboard ci-dashboard">
      <aside class="usage-sidebar ci-sidebar" aria-label="Causal inference sections">
        <span>Causal inference</span>
        ${sectionNav.map((item) => `<a href="${item.href}">${item.label}</a>`).join('')}
      </aside>
      <div class="usage-dashboard-main ci-dashboard-main">
        ${content}
      </div>
    </section>
  `
}

function renderStatus(title: string, detail: string, isError = false): string {
  return `
    <section class="usage-section">
      <div class="insight-card ml-status-card ${isError ? 'ml-status-error' : ''}">
        <strong>${title}</strong>
        <p>${detail}</p>
      </div>
    </section>
  `
}

function renderHomeSection(dashboard: CausalInferenceDashboard): string {
  const lead = dashboard.leadTreatment

  return `
    <section class="usage-section" id="ci-home">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Home</p>
          <h2>Study overview</h2>
        </div>
        <span>${formatInteger(dashboard.meta.accountsStudied)} accounts · ${dashboard.meta.treatmentsTested} treatments</span>
      </div>

      <p class="ml-section-lead">
        Use the layers in the left nav to move from executive readout → treatment comparison → segment heterogeneity →
        account targeting → validation checks. All estimates come from <code>causal_inference.ipynb</code>.
      </p>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Accounts studied</span>
          <strong>${formatInteger(dashboard.meta.accountsStudied)}</strong>
          <p>Unit of analysis: account at first login.</p>
        </article>
        <article class="metric-card">
          <span>Treatments tested</span>
          <strong>${dashboard.meta.treatmentsTested}</strong>
          <p>Early feature adoption windows (7–14 days).</p>
        </article>
        <article class="metric-card">
          <span>Outcome horizon</span>
          <strong>${dashboard.meta.outcomeWindowDays} days</strong>
          <p>Won / Closed Won after treatment window closes.</p>
        </article>
        <article class="metric-card ml-highlight">
          <span>Lead AIPW effect</span>
          <strong>${lead ? formatPp(lead.aipw_ate) : '—'}</strong>
          <p>${lead ? treatmentLabel(lead.treatment) : 'Run notebook export'}</p>
        </article>
      </div>

      <dl class="ml-model-card ci-method-card">
        <div class="ml-model-card-item">
          <dt>Causal question</dt>
          <dd>If we help similar accounts adopt a feature earlier, do they convert more often?</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Unit of analysis</dt>
          <dd>Account (time zero = first account login)</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Estimators</dt>
          <dd>Naive difference · IPW ATE · Doubly robust AIPW · Bootstrap 95% CI</dd>
        </div>
        <div class="ml-model-card-item">
          <dt>Confounding control</dt>
          <dd>Pre-treatment firmographics, marketing source, sales activity, geography</dd>
        </div>
        <div class="ml-model-card-item ml-model-card-item-wide">
          <dt>Key assumption</dt>
          <dd>No unobserved confounding after adjustment — validate with randomized experiments in Causal Validation.</dd>
        </div>
      </dl>

      <div class="ci-treatment-preview">
        ${dashboard.treatmentSummary
          .map(
            (row) => `
          <article class="ci-treatment-preview-card">
            <span>${treatmentLabel(row.treatment)}</span>
            <strong>${formatPercent(row.treated_rate, 1)}</strong>
            <p>${formatInteger(Math.round(row.accounts * row.treated_rate))} treated · ${formatPercent(row.treated_outcome_rate, 1)} treated conversion</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderExecutiveSummarySection(dashboard: CausalInferenceDashboard): string {
  const lead = dashboard.leadTreatment
  const brief = dashboard.experimentBrief

  return `
    <section class="usage-section" id="ci-executive-summary">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Executive Summary</p>
          <h2>What leadership should take away</h2>
        </div>
        <span>Observational causal estimate — confirm with experiment</span>
      </div>

      <div class="metric-grid">
        <article class="metric-card ml-highlight">
          <span>Strongest AIPW effect</span>
          <strong>${lead ? formatPp(lead.aipw_ate) : '—'}</strong>
          <p>${lead ? treatmentLabel(lead.treatment) : 'No lead treatment identified'} (doubly robust).</p>
        </article>
        <article class="metric-card">
          <span>95% CI</span>
          <strong>${lead ? `${formatPp(lead.ci_lower_95)} to ${formatPp(lead.ci_upper_95)}` : '—'}</strong>
          <p>Bootstrap interval for the lead treatment AIPW ATE.</p>
        </article>
        <article class="metric-card">
          <span>Priority experiment</span>
          <strong>${brief['Treatment to test'] ? treatmentLabel(String(brief['Treatment to test'])) : '—'}</strong>
          <p>${brief['Recommended next step'] ?? 'Validate with a targeted experiment.'}</p>
        </article>
        <article class="metric-card">
          <span>Baseline conversion</span>
          <strong>${lead ? formatPercent(lead.outcome_rate, 1) : '—'}</strong>
          <p>Overall 90-day Won rate in the study population.</p>
        </article>
      </div>

      ${
        lead
          ? `<div class="ci-callout">
              <h3>Product hypothesis</h3>
              <p>${lead.product_hypothesis}</p>
              <p class="ci-callout-note"><strong>Naive vs adjusted:</strong> raw treated-control gap was ${formatSignedPp(lead.naive_difference)}; after confounding adjustment AIPW ATE is ${formatSignedPp(lead.aipw_ate)}. ${Math.sign(lead.naive_difference) !== Math.sign(lead.aipw_ate) ? 'Direction changed after adjustment — naive comparisons are misleading here.' : ''}</p>
            </div>`
          : ''
      }

      <div class="ci-experiment-grid">
        ${[
          { label: 'Treatment to test', value: brief['Treatment to test'] ? treatmentLabel(String(brief['Treatment to test'])) : '—' },
          { label: 'Why this treatment', value: brief['Why this treatment'] ?? '—' },
          { label: 'Estimated AIPW effect', value: brief['Estimated AIPW effect'] ? formatPp(Number(brief['Estimated AIPW effect'])) : '—' },
          { label: 'Business outcome', value: brief['Business outcome'] ?? '90-day Won / Closed Won conversion' },
          { label: 'Recommended next step', value: brief['Recommended next step'] ?? 'Run targeted experiment' },
          { label: 'Primary experimental outcome', value: brief['Primary experimental outcome'] ?? 'Feature adoption within treatment window' },
        ]
          .map(
            (item) => `
          <article class="ci-experiment-card">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderTreatmentExplorerSection(dashboard: CausalInferenceDashboard): string {
  return `
    <section class="usage-section" id="ci-treatment-explorer">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Treatment Explorer</p>
          <h2>Compare early adoption behaviors</h2>
        </div>
        <span>Naive · IPW · Doubly robust AIPW</span>
      </div>

      <p class="ml-section-lead">
        Each row is one product adoption treatment. AIPW is the primary estimate; cross-check overlap in Causal Validation before acting.
      </p>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table ci-effects-table">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Treated rate</th>
              <th>Naive Δ</th>
              <th>IPW ATE</th>
              <th>AIPW ATE</th>
              <th>95% CI</th>
              <th>Overlap</th>
              <th>Recommendation</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.causalEffects
              .map(
                (row) => `
              <tr class="${dashboard.leadTreatment?.treatment === row.treatment ? 'ml-row-deployed' : ''}">
                <td>
                  <strong>${treatmentLabel(row.treatment)}</strong>
                  <span class="ml-priority-meta">${row.question}</span>
                </td>
                <td>${formatPercent(row.treated_rate, 1)}</td>
                <td>${formatSignedPp(row.naive_difference)}</td>
                <td>${formatSignedPp(row.ipw_ate)}</td>
                <td><strong>${formatSignedPp(row.aipw_ate)}</strong></td>
                <td>${formatSignedPp(row.ci_lower_95)} to ${formatSignedPp(row.ci_upper_95)}</td>
                <td>${overlapBadge(row.common_support_rate)}</td>
                <td>${row.recommendation}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="ci-treatment-hypotheses">
        ${dashboard.causalEffects
          .map(
            (row) => `
          <article class="ci-hypothesis-card">
            <h3>${treatmentLabel(row.treatment)}</h3>
            <p>${row.product_hypothesis}</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderSegmentInsightsSection(dashboard: CausalInferenceDashboard): string {
  if (dashboard.heterogeneousEffects.length === 0) {
    return `
      <section class="usage-section" id="ci-segment-insights">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Segment Insights</p>
            <h2>Where the effect is strongest</h2>
          </div>
        </div>
        <p class="ml-footnote">No heterogeneous effect segments published yet.</p>
      </section>
    `
  }

  return `
    <section class="usage-section" id="ci-segment-insights">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Segment Insights</p>
          <h2>Where the effect is strongest</h2>
        </div>
        <span>Conditional average treatment effects (CATE)</span>
      </div>

      <p class="ml-section-lead">
        Segments with higher average CATE are better candidates for targeted product interventions —
        not just accounts with high propensity to adopt.
      </p>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table ci-hte-table">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Segment type</th>
              <th>Segment</th>
              <th>Accounts</th>
              <th>Avg CATE</th>
              <th>Treated rate</th>
              <th>Outcome rate</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.heterogeneousEffects
              .map(
                (row) => `
              <tr>
                <td>${treatmentLabel(row.treatment)}</td>
                <td>${formatSegmentType(row.segment_type)}</td>
                <td><strong>${row.segment_value}</strong></td>
                <td>${formatInteger(row.accounts)}</td>
                <td><strong>${formatSignedPp(row.avg_cate)}</strong></td>
                <td>${formatPercent(row.treated_rate, 1)}</td>
                <td>${formatPercent(row.outcome_rate, 1)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `
}

function renderAccountRecommendationsSection(dashboard: CausalInferenceDashboard): string {
  if (dashboard.interventionCandidates.length === 0) {
    return `
      <section class="usage-section" id="ci-account-recommendations">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Account Recommendations</p>
            <h2>High-uplift intervention candidates</h2>
          </div>
        </div>
        <p class="ml-footnote">No intervention candidates published yet.</p>
      </section>
    `
  }

  return `
    <section class="usage-section" id="ci-account-recommendations">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Account Recommendations</p>
          <h2>Who to target for each treatment</h2>
        </div>
        <span>Top accounts by estimated CATE</span>
      </div>

      <p class="ml-section-lead">
        These accounts have the highest predicted uplift if encouraged to adopt the treatment early.
        Pair with Account Scoring Model rankings for a full GTM workflow.
      </p>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table ci-intervention-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Treatment</th>
              <th>Est. uplift</th>
              <th>P(treat)</th>
              <th>P(control)</th>
              <th>Reliability</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.interventionCandidates
              .slice(0, 20)
              .map(
                (row) => `
              <tr>
                <td>
                  <strong>${row.account_name}</strong>
                  <span class="ml-priority-meta">${row.industry} · ${row.segment} · ${formatCurrency(row.estimated_annual_recurring_revenue)} ARR</span>
                </td>
                <td>${treatmentLabel(row.treatment_name)}</td>
                <td><strong>${formatPp(row.estimated_uplift)}</strong></td>
                <td>${formatPercent(row.predicted_conversion_if_treated, 0)}</td>
                <td>${formatPercent(row.predicted_conversion_if_control, 0)}</td>
                <td><span class="ml-action-tag">${row.probability_reliability}</span></td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  `
}

function renderCausalValidationSection(dashboard: CausalInferenceDashboard): string {
  return `
    <section class="usage-section" id="ci-causal-validation">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Causal Validation</p>
          <h2>Can we trust these estimates?</h2>
        </div>
        <span>Overlap · assumptions · next experiment</span>
      </div>

      <p class="ml-section-lead">
        Causal estimates are only credible when treated and control accounts have comparable propensity scores.
        Low common support means the estimate may not generalize to the full population.
      </p>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Treated n</th>
              <th>Control n</th>
              <th>Naive Δ</th>
              <th>Propensity AUC</th>
              <th>Common support</th>
              <th>Extreme propensities</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.diagnostics
              .map(
                (row) => `
              <tr>
                <td><strong>${treatmentLabel(row.treatment)}</strong></td>
                <td>${formatInteger(row.treated_accounts)}</td>
                <td>${formatInteger(row.control_accounts)}</td>
                <td>${formatSignedPp(row.naive_difference)}</td>
                <td>${row.cross_fitted_propensity_auc.toFixed(2)}</td>
                <td>${overlapBadge(row.common_support_rate)}</td>
                <td>${formatPercent(row.treated_below_0_05, 0)} treated &lt;0.05 · ${formatPercent(row.control_below_0_05, 0)} control &lt;0.05</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="insight-card ml-action-card">
        <ul class="ml-action-list">
          <li>Causal estimates suggest <em>where to experiment</em>; only randomized tests confirm incremental impact.</li>
          <li>Design holdouts or geo splits for the recommended treatment before rolling out globally.</li>
          <li>Estimates assume no unobserved confounding after pre-treatment adjustment and sufficient overlap.</li>
          <li>Deal <code>created_date</code> is used as proxy for close timing — replace with true stage transitions in production.</li>
        </ul>
      </div>

      <p class="ml-footnote">
        Wide confidence intervals and low common support weaken inference. Account-level scoring explanations are associative;
        this layer is the causal complement that validates whether product changes are worth testing.
      </p>
    </section>
  `
}

function treatmentLabel(key: string): string {
  return treatmentLabels[key] ?? key.replace(/_/g, ' ')
}

function formatSegmentType(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function overlapBadge(rate: number): string {
  if (rate >= 0.5) {
    return `<span class="ci-overlap ci-overlap-good">${formatPercent(rate, 0)} support</span>`
  }
  if (rate >= 0.25) {
    return `<span class="ci-overlap ci-overlap-moderate">${formatPercent(rate, 0)} support</span>`
  }
  return `<span class="ci-overlap ci-overlap-poor">${formatPercent(rate, 0)} support</span>`
}

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}

function formatPp(value: number): string {
  return `${(value * 100).toFixed(1)} pp`
}

function formatSignedPp(value: number): string {
  const formatted = (value * 100).toFixed(1)
  return value > 0 ? `+${formatted} pp` : `${formatted} pp`
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
