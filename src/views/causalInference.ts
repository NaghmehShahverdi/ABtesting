// Director-level readout of early feature adoption causal analysis from
// causal_inference.ipynb. Results are served from causal_outputs/ CSV
// artifacts through /api/causal-inference.
import '../causal-review.css'

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
  treated_accounts: number
  control_accounts: number
  treated_rate: number
  outcome_rate: number
  naive_difference: number
  ipw_ate: number
  aipw_ate: number
  aipw_standard_error: number
  aipw_ate_common_support: number
  aipw_common_support_standard_error: number
  common_support_ci_lower_95: number
  common_support_ci_upper_95: number
  common_support_rate: number
  common_support_accounts: number
  common_support_treated: number
  common_support_control: number
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
  support_accounts: number
  support_rate: number
  support_treated: number
  support_control: number
  treated_rate: number
  outcome_rate: number
  avg_cate: number
  standard_error: number
  ci_lower_95: number
  ci_upper_95: number
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

const sectionNav = [
  { href: '#ci-home', label: 'Home' },
  { href: '#ci-executive-summary', label: 'Executive Summary' },
  { href: '#ci-treatment-explorer', label: 'Treatment Explorer' },
  { href: '#ci-segment-insights', label: 'Exploratory Segments' },
  { href: '#ci-account-recommendations', label: 'Experiment Recruitment' },
  { href: '#ci-causal-validation', label: 'Causal Validation' },
]

type TreatmentContext = {
  label: (key: string) => string
  windowDays: (key: string) => number | undefined
  supportRate: (key: string) => number
  windowRangeLabel: string
}

function createTreatmentContext(dashboard: CausalInferenceDashboard): TreatmentContext {
  const summaryByTreatment = new Map(
    dashboard.treatmentSummary.map((row) => [row.treatment, row]),
  )
  const effectByTreatment = new Map(
    dashboard.causalEffects.map((row) => [row.treatment, row]),
  )
  const diagnosticByTreatment = new Map(
    dashboard.diagnostics.map((row) => [row.treatment, row]),
  )
  const windowDaysList = dashboard.treatmentSummary.map((row) => row.window_days)

  return {
    label: (key: string) => {
      const row = summaryByTreatment.get(key)
      if (!row) {
        return key.replace(/_/g, ' ')
      }

      return `${formatEventName(row.event)} (${row.window_days}d window)`
    },
    windowDays: (key: string) => summaryByTreatment.get(key)?.window_days,
    supportRate: (key: string) =>
      effectByTreatment.get(key)?.common_support_rate ??
      diagnosticByTreatment.get(key)?.common_support_rate ??
      0,
    windowRangeLabel:
      windowDaysList.length === 0
        ? '—'
        : windowDaysList.length === 1
          ? `${windowDaysList[0]} days`
          : `${Math.min(...windowDaysList)}–${Math.max(...windowDaysList)} days`,
  }
}

function formatEventName(event: string): string {
  return event
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function windowTuningNote(windowDays: number, supportRate: number): string {
  if (windowDays === 14 && supportRate >= 0.9) {
    return 'Kept at 14 days — overlap was already strong.'
  }

  if (windowDays === 30) {
    return 'Extended to 30 days (from 7) to improve treated/control overlap.'
  }

  if (windowDays === 90) {
    return supportRate >= 0.7
      ? 'Extended to 90 days (from 14) to improve overlap.'
      : 'Extended to 90 days (from 14); overlap remains moderate — interpret cautiously.'
  }

  return `${windowDays}-day adoption window after first login.`
}

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
    <section class="page-header ci-page-header">
      <div class="ci-page-header-glow" aria-hidden="true"></div>
      <div class="ci-page-header-inner">
        <p class="ci-page-eyebrow">Causal inference</p>
        <h1 class="ci-page-title">Which early product behaviors may influence conversion?</h1>
        <p class="ci-page-summary">
          Unlike the Account Scoring Model, which ranks <em>who</em> is likely to convert, this analysis estimates
          <strong>whether comparable accounts that adopt a feature earlier have different 90-day Won outcomes</strong>.
          The results prioritize experiments; they do not establish rollout-ready causal effects.
        </p>
      </div>
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

  const ctx = createTreatmentContext(dashboard)

  return renderDashboardShell(`
    ${renderHomeSection(dashboard, ctx)}
    ${renderExecutiveSummarySection(dashboard, ctx)}
    ${renderTreatmentExplorerSection(dashboard, ctx)}
    ${renderSegmentInsightsSection(dashboard, ctx)}
    ${renderAccountRecommendationsSection(dashboard, ctx)}
    ${renderCausalValidationSection(dashboard, ctx)}
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

function renderHomeSection(dashboard: CausalInferenceDashboard, ctx: TreatmentContext): string {
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
        account targeting → validation checks. Adoption windows were tuned per treatment when shorter windows showed poor overlap.
      </p>

      <div class="metric-grid">
        <article class="metric-card">
          <span>Accounts studied</span>
          <strong>${formatInteger(dashboard.meta.accountsStudied)}</strong>
          <p>Unit of analysis: account at first login.</p>
        </article>
        <article class="metric-card">
          <span>Adoption windows</span>
          <strong>${ctx.windowRangeLabel}</strong>
          <p>Per-treatment windows (${dashboard.treatmentSummary.map((row) => `${formatEventName(row.event).split(' ')[0]} ${row.window_days}d`).join(' · ')}).</p>
        </article>
        <article class="metric-card">
          <span>Outcome horizon</span>
          <strong>${dashboard.meta.outcomeWindowDays} days</strong>
          <p>Won / Closed Won after each treatment window closes.</p>
        </article>
        <article class="metric-card ml-highlight">
          <span>Experiment hypothesis</span>
          <strong>${lead ? formatPp(lead.aipw_ate_common_support) : '—'}</strong>
          <p>${lead ? `${ctx.label(lead.treatment)} among comparable accounts` : 'Run notebook export'}</p>
        </article>
      </div>

      <div class="ci-window-panel">
        <div class="ci-window-panel-copy">
          <span>Window tuning</span>
          <h3>Why adoption windows differ by treatment</h3>
          <p>
            The first notebook pass used 7–14 day windows. Overlap was weak for most behaviors, so windows were extended
            treatment-by-treatment until common support improved. API usage kept a <strong>14-day</strong> window;
            workspace and report were widened to <strong>30 days</strong>; workflow was widened to <strong>90 days</strong>.
          </p>
        </div>
        <div class="table-card ml-table-scroll">
          <table class="ml-metrics-table ci-window-table">
            <thead>
              <tr>
                <th>Treatment</th>
                <th>Adoption window</th>
                <th>Common support</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${dashboard.treatmentSummary
                .map((row) => {
                  const supportRate = ctx.supportRate(row.treatment)
                  return `
                <tr>
                  <td><strong>${ctx.label(row.treatment)}</strong></td>
                  <td>${row.window_days} days</td>
                  <td>${overlapBadge(supportRate)}</td>
                  <td>${windowTuningNote(row.window_days, supportRate)}</td>
                </tr>
              `
                })
                .join('')}
            </tbody>
          </table>
        </div>
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
          <dd>Repeated cross-fitting · IPW · Doubly robust AIPW · influence-function 95% CI</dd>
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
            <span>${ctx.label(row.treatment)}</span>
            <strong>${formatPercent(row.treated_rate, 1)}</strong>
            <p>${overlapBadge(ctx.supportRate(row.treatment))} · ${formatInteger(Math.round(row.accounts * row.treated_rate))} treated</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderExecutiveSummarySection(dashboard: CausalInferenceDashboard, ctx: TreatmentContext): string {
  const lead = dashboard.leadTreatment
  const brief = dashboard.experimentBrief
  const intervalCrossesZero = lead
    ? lead.common_support_ci_lower_95 <= 0 && lead.common_support_ci_upper_95 >= 0
    : true

  return `
    <section class="usage-section" id="ci-executive-summary">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Executive Summary</p>
          <h2>What leadership should take away</h2>
        </div>
        <span>Decision status: hypothesis generation, not rollout evidence</span>
      </div>

      <div class="ci-decision-banner ${intervalCrossesZero ? 'is-inconclusive' : 'is-promising'}">
        <div>
          <span>Director readout</span>
          <strong>${intervalCrossesZero ? 'No treatment has conclusive positive causal evidence yet.' : 'Promising observational evidence; randomized confirmation is still required.'}</strong>
        </div>
        <p>
          Workspace creation is the leading experiment hypothesis because its direction is positive among comparable accounts.
          The interval still includes zero, so this supports an A/B test—not a broad product rollout or sales claim.
        </p>
      </div>

      <div class="metric-grid">
        <article class="metric-card ml-highlight">
          <span>Primary estimate</span>
          <strong>${lead ? formatSignedPp(lead.aipw_ate_common_support) : '—'}</strong>
          <p>${lead ? `${ctx.label(lead.treatment)} within common support.` : 'No lead treatment identified'}</p>
        </article>
        <article class="metric-card">
          <span>Primary 95% CI</span>
          <strong>${lead ? `${formatSignedPp(lead.common_support_ci_lower_95)} to ${formatSignedPp(lead.common_support_ci_upper_95)}` : '—'}</strong>
          <p>${intervalCrossesZero ? 'Includes zero: direction and magnitude remain uncertain.' : 'Excludes zero, pending experimental confirmation.'}</p>
        </article>
        <article class="metric-card">
          <span>Comparable sample</span>
          <strong>${lead ? formatInteger(lead.common_support_accounts) : '—'}</strong>
          <p>${lead ? `${formatInteger(lead.common_support_treated)} treated · ${formatInteger(lead.common_support_control)} controls · ${formatPercent(lead.common_support_rate, 1)} of study` : '—'}</p>
        </article>
        <article class="metric-card">
          <span>Observed outcomes</span>
          <strong>${lead ? `${formatInteger(lead.treated_accounts)} / ${formatInteger(lead.accounts)}` : '—'}</strong>
          <p>${lead ? `${formatPercent(lead.treated_rate, 1)} adopted early; baseline conversion was ${formatPercent(lead.outcome_rate, 1)}.` : '—'}</p>
        </article>
      </div>

      ${
        lead
          ? `<div class="ci-callout">
              <h3>Recommended decision</h3>
              <p><strong>Run a controlled workspace-onboarding experiment.</strong> ${lead.product_hypothesis}</p>
              <p class="ci-callout-note"><strong>Why this is not a rollout recommendation:</strong> the raw gap is ${formatSignedPp(lead.naive_difference)}, the full-population sensitivity estimate is ${formatSignedPp(lead.aipw_ate)} (${formatSignedPp(lead.ci_lower_95)} to ${formatSignedPp(lead.ci_upper_95)}), and only ${formatPercent(lead.common_support_rate, 1)} of accounts have adequate treated/control comparability.</p>
            </div>`
          : ''
      }

      <div class="ci-experiment-grid">
        ${[
          { label: 'Treatment to test', value: brief['Treatment to test'] ? ctx.label(String(brief['Treatment to test'])) : '—' },
          { label: 'Why this treatment', value: brief['Why this treatment'] ?? '—' },
          { label: 'Common-support effect', value: brief['Estimated AIPW effect'] ? formatSignedPp(Number(brief['Estimated AIPW effect'])) : '—' },
          { label: 'Common-support 95% CI', value: brief['95% CI in common support'] ? formatStoredInterval(brief['95% CI in common support']) : '—' },
          { label: 'Comparable population', value: brief['Common support'] ?? '—' },
          { label: 'Recommended next step', value: brief['Recommended next step'] ?? 'Run targeted experiment' },
          { label: 'Primary proximal outcome', value: brief['Primary proximal outcome'] ?? 'Feature adoption within treatment window' },
          { label: 'Primary business outcome', value: brief['Primary business outcome'] ?? '90-day Won / Closed Won conversion' },
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

function renderTreatmentExplorerSection(dashboard: CausalInferenceDashboard, ctx: TreatmentContext): string {
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
        The common-support AIPW estimate is the primary decision number because it focuses on accounts with credible
        treated and control analogues. The full-population estimate is retained as a sensitivity analysis.
      </p>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table ci-effects-table">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Window</th>
              <th>Treated n</th>
              <th>Naive Δ</th>
              <th>Support AIPW</th>
              <th>Support 95% CI</th>
              <th>Full AIPW sensitivity</th>
              <th>Overlap</th>
              <th>Evidence status</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.causalEffects
              .map(
                (row) => `
              <tr class="${dashboard.leadTreatment?.treatment === row.treatment ? 'ml-row-deployed' : ''}">
                <td>
                  <strong>${ctx.label(row.treatment)}</strong>
                  <span class="ml-priority-meta">${row.question}</span>
                </td>
                <td>${ctx.windowDays(row.treatment) ?? '—'}d</td>
                <td>${formatInteger(row.treated_accounts)}</td>
                <td>${formatSignedPp(row.naive_difference)}</td>
                <td><strong>${formatSignedPp(row.aipw_ate_common_support)}</strong></td>
                <td>${formatSignedPp(row.common_support_ci_lower_95)} to ${formatSignedPp(row.common_support_ci_upper_95)}</td>
                <td>${formatSignedPp(row.aipw_ate)}</td>
                <td>${overlapBadge(row.common_support_rate)}</td>
                <td>${evidenceBadge(row)}</td>
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
            <h3>${ctx.label(row.treatment)}</h3>
            <p>${row.product_hypothesis}</p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `
}

function renderSegmentInsightsSection(dashboard: CausalInferenceDashboard, ctx: TreatmentContext): string {
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
          <p class="eyebrow">Exploratory Segments</p>
          <h2>Signals to stratify in the experiment</h2>
        </div>
        <span>Common-support subgroup AIPW estimates</span>
      </div>

      <p class="ml-section-lead">
        Each estimate now includes a 95% confidence interval and uses only comparable treated/control accounts.
        These are still exploratory: many segments were examined and no multiple-comparison correction has been applied.
        Use stable business segments to pre-specify experiment strata—not to launch segmented rollouts.
      </p>

      <div class="ci-segment-warning">
        <strong>How to read this table</strong>
        <p>
          An interval crossing zero means the data do not establish whether the segment effect is positive or negative.
          An interval excluding zero is a hypothesis worth retesting, not confirmation, because repeated segment searches
          increase the chance of false discoveries.
        </p>
      </div>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table ci-hte-table">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Segment type</th>
              <th>Segment</th>
              <th>Comparable n</th>
              <th>Treated / control</th>
              <th>Subgroup AIPW</th>
              <th>95% CI</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.heterogeneousEffects
              .map(
                (row) => `
              <tr>
                <td>${ctx.label(row.treatment)}</td>
                <td>${formatSegmentType(row.segment_type)}</td>
                <td><strong>${row.segment_value}</strong></td>
                <td>
                  ${formatInteger(row.support_accounts)}
                  <span class="ml-priority-meta">${formatPercent(row.support_rate, 0)} of ${formatInteger(row.accounts)}</span>
                </td>
                <td>${formatInteger(row.support_treated)} / ${formatInteger(row.support_control)}</td>
                <td><strong>${formatSignedPp(row.avg_cate)}</strong></td>
                <td>${formatSignedPp(row.ci_lower_95)} to ${formatSignedPp(row.ci_upper_95)}</td>
                <td>${segmentEvidenceBadge(row)}</td>
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

function renderAccountRecommendationsSection(dashboard: CausalInferenceDashboard, ctx: TreatmentContext): string {
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
          <p class="eyebrow">Experiment Recruitment</p>
          <h2>Exploratory candidates for a controlled test</h2>
        </div>
        <span>Do not operationalize as a sales call list</span>
      </div>

      <p class="ml-section-lead">
        These rankings are useful for recruiting a diverse experimental cohort inside common support.
        They should not be interpreted as expected conversion gains or used as a Sales call list.
      </p>

      <div class="ci-ranking-explainer">
        <div>
          <span>What the ranking means</span>
          <strong>Relative experiment-recruitment priority</strong>
          <p>
            Accounts are ordered by the difference between two cross-fitted model scenario scores:
            encouraged to adopt versus not encouraged.
          </p>
        </div>
        <div>
          <span>What it does not mean</span>
          <strong>Not a calibrated individual treatment effect</strong>
          <p>
            A high rank does not mean the intervention will create the displayed probability difference.
            There is no account-level confidence interval or independent holdout validation.
          </p>
        </div>
        <div>
          <span>Where to find causal estimates</span>
          <strong>Use subgroup AIPW + 95% CI</strong>
          <p>
            Treatment-effect magnitudes belong in the Treatment Explorer and Exploratory Segments sections,
            where estimates include common-support restrictions and uncertainty intervals.
          </p>
        </div>
      </div>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table ci-intervention-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Account</th>
              <th>Treatment</th>
              <th>Encouraged model score</th>
              <th>Not-encouraged model score</th>
              <th>Model stability flag</th>
            </tr>
          </thead>
          <tbody>
            ${dashboard.interventionCandidates
              .slice(0, 20)
              .map(
                (row, index) => `
              <tr>
                <td><strong>#${index + 1}</strong></td>
                <td>
                  <strong>${row.account_name}</strong>
                  <span class="ml-priority-meta">${row.industry} · ${row.segment} · ${formatCurrency(row.estimated_annual_recurring_revenue)} ARR</span>
                </td>
                <td>${ctx.label(row.treatment_name)}</td>
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

function renderCausalValidationSection(dashboard: CausalInferenceDashboard, ctx: TreatmentContext): string {
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
        Shorter windows had poor overlap for most treatments, so adoption windows were extended per behavior (30d, 90d)
        while API usage kept a 14-day window. Estimates below use the tuned window for each treatment.
      </p>

      <div class="ci-propensity-explainer">
        <div class="ci-propensity-copy">
          <span>Diagnostic guide</span>
          <h3>What does Propensity AUC mean?</h3>
          <p>
            It measures how well <strong>pre-treatment account characteristics</strong> distinguish accounts
            that adopted the feature early from those that did not. It is a treatment-selection diagnostic,
            not a measure of treatment effectiveness or causal-model accuracy.
          </p>
        </div>
        <div class="ci-propensity-scale" aria-label="Propensity AUC interpretation">
          <div class="ci-propensity-scale-bar">
            <span class="is-low"></span>
            <span class="is-mid"></span>
            <span class="is-high"></span>
          </div>
          <div class="ci-propensity-scale-labels">
            <div>
              <strong>≈ 0.50</strong>
              <span>Little observed selection signal</span>
            </div>
            <div>
              <strong>0.60–0.70</strong>
              <span>Moderate selection differences</span>
            </div>
            <div>
              <strong>≥ 0.80</strong>
              <span>Strong separation and confounding risk</span>
            </div>
          </div>
        </div>
        <p class="ci-propensity-note">
          <strong>Important:</strong> lower is not automatically better. An AUC near 0.5 can also reflect a weak
          or unstable propensity model. Always interpret it with common support, treated/control sample sizes,
          extreme propensities, and post-adjustment covariate balance.
        </p>
      </div>

      <div class="table-card ml-table-scroll">
        <table class="ml-metrics-table">
          <thead>
            <tr>
              <th>Treatment</th>
              <th>Window</th>
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
              .map((row) => {
                const effect = dashboard.causalEffects.find((item) => item.treatment === row.treatment)
                return `
              <tr>
                <td><strong>${ctx.label(row.treatment)}</strong></td>
                <td>${ctx.windowDays(row.treatment) ?? '—'} days</td>
                <td>${formatInteger(row.treated_accounts)}</td>
                <td>${formatInteger(row.control_accounts)}</td>
                <td>${formatSignedPp(row.naive_difference)}</td>
                <td>
                  <strong>${row.cross_fitted_propensity_auc.toFixed(2)}</strong>
                  <span class="ml-priority-meta">${propensityAucLabel(row.cross_fitted_propensity_auc)}</span>
                </td>
                <td>${overlapBadge(effect?.common_support_rate ?? row.common_support_rate)}</td>
                <td>${formatPercent(row.treated_below_0_05, 0)} treated &lt;0.05 · ${formatPercent(row.control_below_0_05, 0)} control &lt;0.05</td>
              </tr>
            `
              })
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="insight-card ml-action-card">
        <ul class="ml-action-list">
          <li>Causal estimates suggest <em>where to experiment</em>; only randomized tests confirm incremental impact.</li>
          <li>Randomize eligible accounts to guided workspace onboarding versus the existing experience.</li>
          <li>Track workspace adoption as the proximal outcome and 90-day Won conversion as the business outcome.</li>
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

function propensityAucLabel(value: number): string {
  if (value >= 0.8) {
    return 'strong separation'
  }
  if (value >= 0.6) {
    return 'moderate selection'
  }
  if (value >= 0.5) {
    return 'weak selection signal'
  }
  return 'weak / unstable model'
}

function evidenceBadge(row: CausalEffectRow): string {
  if (row.common_support_rate < 0.25 || row.common_support_treated < 20) {
    return '<span class="ci-evidence ci-evidence-poor">Insufficient data</span>'
  }
  if (row.common_support_ci_lower_95 > 0) {
    return '<span class="ci-evidence ci-evidence-good">Promising</span>'
  }
  if (row.common_support_ci_upper_95 < 0) {
    return '<span class="ci-evidence ci-evidence-negative">Negative signal</span>'
  }
  return '<span class="ci-evidence ci-evidence-mixed">Inconclusive</span>'
}

function segmentEvidenceBadge(row: HeterogeneousEffectRow): string {
  if (row.ci_lower_95 <= 0 && row.ci_upper_95 >= 0) {
    return '<span class="ci-evidence ci-evidence-mixed">Inconclusive</span>'
  }
  if (row.ci_lower_95 > 0) {
    return '<span class="ci-evidence ci-evidence-exploratory">Retest positive signal</span>'
  }
  return '<span class="ci-evidence ci-evidence-negative">Retest negative signal</span>'
}

function formatStoredInterval(value: string): string {
  const [lower, upper] = value.split(' to ').map(Number)
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return value
  }
  return `${formatSignedPp(lower)} to ${formatSignedPp(upper)}`
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
