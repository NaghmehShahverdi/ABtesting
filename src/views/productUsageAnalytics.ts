// Product usage readout from Snowflake USERS_RAW / TRACKS_RAW via /api/product-usage.
// Analytics run server-side — the browser only renders JSON.

type ActivationFunnelRow = {
  stage: string
  users: number
}

type JobSegmentRow = {
  activeUsers: number
  eventsPerUser: number
  jobTitle: string
  totalEvents: number
  users: number
}

type MonthlyActivityRow = {
  activeUsers: number
  eventMonth: string
  totalEvents: number
}

type Overview = {
  activationRate: number
  activatedUsers: number
  activeUsers: number
  avgDistinctEvents: number
  avgEventsPerActiveUser: number
  avgEventsPerUser: number
  firstLoginAt: string
  latestLoginAt: string
  marketingOptedUsers: number
  marketingOptInRate: number
  totalEvents: number
  totalUsers: number
}

type ProductPurchaseRow = {
  customers: number
  productName: string
  purchases: number
}

type RecentEventRow = {
  eventName: string
  eventTimestamp: string
  userId: string
}

type TopEventRow = {
  eventName: string
  firstSeenAt: string
  lastSeenAt: string
  totalEvents: number
  uniqueUsers: number
}

export type ProductUsageDashboard = {
  activationFunnel: ActivationFunnelRow[]
  jobSegments: JobSegmentRow[]
  monthlyActivity: MonthlyActivityRow[]
  overview: Overview
  productPurchases: ProductPurchaseRow[]
  recentEvents: RecentEventRow[]
  topEvents: TopEventRow[]
}

export type ProductUsageAnalyticsState = {
  dashboard?: ProductUsageDashboard
  error?: string
  status: 'idle' | 'loading' | 'success' | 'error'
}

function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
}

export async function fetchProductUsageDashboard(): Promise<ProductUsageDashboard> {
  const response = await fetch(`${getApiBaseUrl()}/api/product-usage`, {
    headers: { Accept: 'application/json' },
  })
  const raw = await response.text()

  let payload: { error?: string; details?: string } & Partial<ProductUsageDashboard>
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error(
      'The /api/product-usage route returned HTML instead of JSON. Restart the dev server ("npm run dev") so Vite picks up vite.config.mjs.',
    )
  }

  if (!response.ok) {
    const details = typeof payload?.details === 'string' ? ` ${payload.details}` : ''
    throw new Error(`${payload?.error ?? 'Failed to load product usage analytics.'}${details}`)
  }

  return payload as ProductUsageDashboard
}

export function renderProductUsageAnalytics(state: ProductUsageAnalyticsState): string {
  return `
    <section class="page-header">
      <p class="eyebrow">Snowflake product telemetry</p>
      <h1>Product Usage Analytics</h1>
      <p class="summary">
        Usage, activation, engagement, and segment readouts from Snowflake tables
        USERS_RAW and TRACKS_RAW${state.dashboard?.productPurchases.length ? ', with product purchase signal.' : '.'}
      </p>
    </section>

    ${renderProductUsageContent(state)}
  `
}

function renderProductUsageContent(state: ProductUsageAnalyticsState): string {
  if (state.status === 'loading' || state.status === 'idle') {
    return renderStatusCard('Snowflake query', 'Loading', 'Fetching product usage analytics from Snowflake.')
  }

  if (state.status === 'error') {
    return renderStatusCard(
      'Snowflake query failed',
      'Error',
      state.error ?? 'Unable to load product usage analytics from Snowflake.',
    )
  }

  if (!state.dashboard) {
    return renderStatusCard('Snowflake query', '0', 'No product usage analytics were returned.')
  }

  const dashboard = state.dashboard

  return `
    <section class="usage-dashboard">
      <aside class="usage-sidebar" aria-label="Product usage sections">
        <span>Dashboard</span>
        <a href="#usage-overview">Overview</a>
        <a href="#usage-events">Events</a>
        <a href="#usage-activity">Activity</a>
        <a href="#usage-funnel">Activation</a>
        <a href="#usage-segments">Segments</a>
        <a href="#usage-recent">Recent</a>
      </aside>

      <div class="usage-dashboard-main">
        ${renderOverviewSection(dashboard.overview)}
        ${renderTopEventsSection(dashboard.topEvents)}
        ${renderMonthlyActivitySection(dashboard.monthlyActivity)}
        ${renderActivationFunnelSection(dashboard.activationFunnel)}
        ${renderJobSegmentsSection(dashboard.jobSegments)}
        ${renderProductPurchasesSection(dashboard.productPurchases)}
        ${renderRecentEventsSection(dashboard.recentEvents)}
      </div>
    </section>
  `
}

function renderStatusCard(label: string, value: string, detail: string): string {
  return `
    <section class="usage-grid">
      <article class="insight-card">
        <span>${label}</span>
        <strong>${value}</strong>
        <p>${detail}</p>
      </article>
    </section>
  `
}

function renderOverviewSection(overview: Overview): string {
  const activeShare = overview.totalUsers === 0 ? 0 : overview.activeUsers / overview.totalUsers

  return `
    <section class="usage-section" id="usage-overview">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Overview</p>
          <h2>Product health</h2>
        </div>
        <span>${formatDate(overview.firstLoginAt)} - ${formatDate(overview.latestLoginAt)}</span>
      </div>

      <div class="metric-grid">
        ${renderMetricCard('Total users', formatInteger(overview.totalUsers), 'Users in USERS_RAW')}
        ${renderMetricCard('Active users', formatInteger(overview.activeUsers), `${formatPercent(activeShare)} of users have events`)}
        ${renderMetricCard('Total events', formatInteger(overview.totalEvents), 'Events in TRACKS_RAW')}
        ${renderMetricCard('Activation rate', formatPercent(overview.activationRate), `${formatInteger(overview.activatedUsers)} activated users`)}
        ${renderMetricCard('Events / active user', formatDecimal(overview.avgEventsPerActiveUser), 'Depth of engagement')}
        ${renderMetricCard('Distinct events / user', formatDecimal(overview.avgDistinctEvents), 'Breadth of feature usage')}
        ${renderMetricCard('Marketing opt-in', formatPercent(overview.marketingOptInRate), `${formatInteger(overview.marketingOptedUsers)} opted-in users`)}
        ${renderMetricCard('Events / user', formatDecimal(overview.avgEventsPerUser), 'Average across all users')}
      </div>
    </section>
  `
}

function renderTopEventsSection(rows: TopEventRow[]): string {
  const maxEvents = Math.max(...rows.map((row) => row.totalEvents), 1)

  return `
    <section class="usage-section" id="usage-events">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Feature usage</p>
          <h2>Top tracked events</h2>
        </div>
        <span>${formatInteger(rows.length)} event types</span>
      </div>

      <div class="usage-two-column">
        <section class="chart-card">
          <div class="panel-heading">
            <h2>Events by volume</h2>
            <p>Ranked by total tracked actions.</p>
          </div>
          <div class="usage-bars">
            ${rows
              .map((row, index) =>
                renderUsageBar(
                  row.eventName,
                  formatInteger(row.totalEvents),
                  row.totalEvents / maxEvents,
                  paletteColor(index),
                ),
              )
              .join('')}
          </div>
        </section>

        <section class="table-card">
          <div class="panel-heading">
            <h2>Event detail</h2>
            <p>Unique users and observed event window.</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Total</th>
                <th>Users</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                    <tr>
                      <td>${row.eventName}</td>
                      <td>${formatInteger(row.totalEvents)}</td>
                      <td>${formatInteger(row.uniqueUsers)}</td>
                      <td>${formatDate(row.lastSeenAt)}</td>
                    </tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  `
}

function renderMonthlyActivitySection(rows: MonthlyActivityRow[]): string {
  const maxEvents = Math.max(...rows.map((row) => row.totalEvents), 1)
  const recentMonths = rows.slice(-12)

  return `
    <section class="usage-section" id="usage-activity">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Activity</p>
          <h2>Monthly usage trend</h2>
        </div>
        <span>Last ${formatInteger(recentMonths.length)} months</span>
      </div>

      <section class="chart-card">
        <div class="monthly-chart" aria-label="Monthly usage trend">
          ${recentMonths
            .map(
              (row) => `
                <div class="month-column">
                  <div class="month-bar" style="height: ${Math.max((row.totalEvents / maxEvents) * 100, 4)}%"></div>
                  <strong>${formatCompact(row.totalEvents)}</strong>
                  <span>${formatMonth(row.eventMonth)}</span>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    </section>
  `
}

function renderActivationFunnelSection(rows: ActivationFunnelRow[]): string {
  const totalUsers = rows[0]?.users ?? 1

  return `
    <section class="usage-section" id="usage-funnel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Activation</p>
          <h2>Seven-day activation funnel</h2>
        </div>
        <span>Workspace + report path</span>
      </div>

      <section class="chart-card">
        <div class="funnel-list">
          ${rows
            .map((row) =>
              renderUsageBar(
                row.stage,
                `${formatInteger(row.users)} (${formatPercent(row.users / totalUsers)})`,
                row.users / totalUsers,
                '#16a34a',
              ),
            )
            .join('')}
        </div>
      </section>
    </section>
  `
}

function renderJobSegmentsSection(rows: JobSegmentRow[]): string {
  const maxActiveUsers = Math.max(...rows.map((row) => row.activeUsers), 1)

  return `
    <section class="usage-section" id="usage-segments">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Segments</p>
          <h2>Usage by job title</h2>
        </div>
        <span>Top ${formatInteger(rows.length)} roles</span>
      </div>

      <section class="chart-card">
        <div class="usage-bars">
          ${rows
            .map((row, index) =>
              renderUsageBar(
                row.jobTitle,
                `${formatInteger(row.activeUsers)} active, ${formatDecimal(row.eventsPerUser)} events/user`,
                row.activeUsers / maxActiveUsers,
                paletteColor(index + 2),
              ),
            )
            .join('')}
        </div>
      </section>
    </section>
  `
}

function renderProductPurchasesSection(rows: ProductPurchaseRow[]): string {
  if (rows.length === 0) {
    return ''
  }

  const maxPurchases = Math.max(...rows.map((row) => row.purchases), 1)

  return `
    <section class="usage-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Products</p>
          <h2>Purchase signal</h2>
        </div>
        <span>Optional PRODUCT_PURCHASES_RAW table</span>
      </div>

      <section class="chart-card">
        <div class="usage-bars">
          ${rows
            .map((row, index) =>
              renderUsageBar(
                row.productName,
                `${formatInteger(row.purchases)} purchases, ${formatInteger(row.customers)} customers`,
                row.purchases / maxPurchases,
                paletteColor(index + 4),
              ),
            )
            .join('')}
        </div>
      </section>
    </section>
  `
}

function renderRecentEventsSection(rows: RecentEventRow[]): string {
  return `
    <section class="usage-section" id="usage-recent">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Recent telemetry</p>
          <h2>Latest events</h2>
        </div>
        <span>Most recent ${formatInteger(rows.length)}</span>
      </div>

      <section class="table-card">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>User</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td>${row.eventName}</td>
                    <td>${shortUserId(row.userId)}</td>
                    <td>${formatDateTime(row.eventTimestamp)}</td>
                  </tr>
                `,
              )
              .join('')}
          </tbody>
        </table>
      </section>
    </section>
  `
}

function renderMetricCard(label: string, value: string, detail: string): string {
  return `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <p>${detail}</p>
    </article>
  `
}

function renderUsageBar(label: string, value: string, share: number, color: string): string {
  return `
    <div class="usage-bar-row">
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
      <div class="usage-bar-track">
        <div class="usage-bar-fill" style="width: ${Math.max(Math.min(share, 1) * 100, 2)}%; background: ${color}"></div>
      </div>
    </div>
  `
}

function paletteColor(index: number): string {
  const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#0891b2', '#7c3aed']
  return colors[index % colors.length]
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value)
}

function formatDate(value: string): string {
  if (!value) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value: string): string {
  if (!value) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value)
}

function formatMonth(value: string): string {
  if (!value) {
    return 'n/a'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(new Date(value))
}

function shortUserId(value: string): string {
  if (value.length <= 12) {
    return value
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`
}
