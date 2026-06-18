import { eventOptions, users, tracks } from '../data/telemetry'

export type ActivationModelState = {
  selectedEvents: string[]
  windowDays: number
  splitUsers: boolean
}

type SummaryRow = {
  eventName: string
  groupName?: string
  users: number
  completedUsers: number
  completionRate: number
}

export const defaultEvents = ['workspace_created', 'report_generated']
export const defaultWindowDays = 7

const maxSelectedEvents = 4

export function renderActivationModel(state: ActivationModelState): string {
  const summaryRows = calculateActivationSummary(
    state.selectedEvents,
    state.windowDays,
    state.splitUsers,
    state.selectedEvents.length,
  )
  const topEvent = getTopEvent(summaryRows)

  return `
    <section class="page-header">
      <p class="eyebrow">Data.ipynb model</p>
      <h1>Activation Model</h1>
      <p class="summary">
        Compare how many users complete each selected event within ${state.windowDays} days
        of first login. If splitting is enabled, users are split into ${state.selectedEvents.length} groups,
        matching the number of selected events.
      </p>
    </section>

    <section class="workspace-grid">
      <form class="control-panel">
        <div class="panel-heading">
          <h2>Model inputs</h2>
          <p>Select 2 to ${maxSelectedEvents} actions and choose the activation window. When split is true, the number of selected events becomes the number of user groups.</p>
        </div>

        <label class="field">
          <span>Activation window in days</span>
          <input id="window-days" type="number" min="1" max="90" value="${state.windowDays}" />
        </label>

        <fieldset class="split-control">
          <legend>Split users into groups?</legend>
          <label>
            <input type="radio" name="split-users" value="false" ${state.splitUsers ? '' : 'checked'} />
            False
          </label>
          <label>
            <input type="radio" name="split-users" value="true" ${state.splitUsers ? 'checked' : ''} />
            True
          </label>
        </fieldset>

        <div class="event-picker">
          <span class="field-label">Required events</span>
          ${eventOptions.map((eventName) => renderEventOption(eventName, state.selectedEvents)).join('')}
        </div>
      </form>

      <section class="results-panel">
        <div class="insight-card">
          <span>Highest completion event</span>
          <strong>${formatPercent(topEvent.completionRate)}</strong>
          <p>${getRowLabel(topEvent)} has the highest completion rate in the selected ${state.windowDays}-day window.</p>
        </div>

        ${renderBarChart(summaryRows)}
        ${renderSummaryTable(summaryRows, state)}
      </section>
    </section>
  `
}

export function bindActivationControls(
  state: ActivationModelState,
  onStateChange: (nextState: ActivationModelState) => void,
) {
  document.querySelector<HTMLInputElement>('#window-days')?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement
    onStateChange({
      ...state,
      windowDays: Math.min(Math.max(Number(target.value) || 1, 1), 90),
    })
  })

  document.querySelectorAll<HTMLInputElement>('input[name="split-users"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      onStateChange({
        ...state,
        splitUsers: radio.value === 'true',
      })
    })
  })

  document.querySelectorAll<HTMLInputElement>('.event-option input').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const selectedEvents = Array.from(
        document.querySelectorAll<HTMLInputElement>('.event-option input:checked'),
      )
        .map((input) => input.value)
        .slice(0, maxSelectedEvents)

      if (selectedEvents.length < 2) {
        checkbox.checked = true
        return
      }

      onStateChange({
        ...state,
        selectedEvents,
      })
    })
  })
}

function renderEventOption(eventName: string, selectedEvents: string[]): string {
  const checked = selectedEvents.includes(eventName) ? 'checked' : ''
  const disabled = !checked && selectedEvents.length >= maxSelectedEvents ? 'disabled' : ''

  return `
    <label class="event-option">
      <input type="checkbox" value="${eventName}" ${checked} ${disabled} />
      <span>${eventName}</span>
    </label>
  `
}

function calculateActivationSummary(
  selectedEvents: string[],
  windowDays: number,
  splitUsers: boolean,
  groupCount: number,
): SummaryRow[] {
  const selectedEventSet = new Set(selectedEvents)
  const usersById = new Map(users.map((user) => [user.userId, user]))
  const completedEventsByUser = new Map<string, Set<string>>()

  for (const event of tracks) {
    if (!selectedEventSet.has(event.eventName)) {
      continue
    }

    const user = usersById.get(event.userId)
    const eventTime = event.eventTimestamp

    if (!user?.firstLoggedInAt || !eventTime) {
      continue
    }

    const activationWindowEnd = new Date(user.firstLoggedInAt)
    activationWindowEnd.setDate(activationWindowEnd.getDate() + windowDays)

    if (eventTime < user.firstLoggedInAt || eventTime > activationWindowEnd) {
      continue
    }

    const completedEvents = completedEventsByUser.get(event.userId) ?? new Set<string>()
    completedEvents.add(event.eventName)
    completedEventsByUser.set(event.userId, completedEvents)
  }

  const eligibleUsers = users.filter((user) => user.firstLoggedInAt)

  if (splitUsers) {
    return selectedEvents.map((eventName, index) => {
      const groupName = `group_${index + 1}`
      const groupUsers = eligibleUsers.filter(
        (user) => getGroupName(user.userId, groupCount) === groupName,
      )
      const completedUsers = groupUsers.filter((user) =>
        completedEventsByUser.get(user.userId)?.has(eventName),
      ).length

      return {
        eventName,
        groupName,
        users: groupUsers.length,
        completedUsers,
        completionRate: groupUsers.length === 0 ? 0 : completedUsers / groupUsers.length,
      }
    })
  }

  return selectedEvents.map((eventName) => ({
    eventName,
    users: eligibleUsers.length,
    completedUsers: eligibleUsers.filter((user) =>
      completedEventsByUser.get(user.userId)?.has(eventName),
    ).length,
    completionRate:
      eligibleUsers.length === 0
        ? 0
        : eligibleUsers.filter((user) => completedEventsByUser.get(user.userId)?.has(eventName))
            .length / eligibleUsers.length,
  }))
}

function renderBarChart(summaryRows: SummaryRow[]): string {
  const maxRate = Math.max(...summaryRows.map((row) => row.completionRate), 0.01)

  return `
    <section class="chart-card">
      <div class="panel-heading">
        <h2>Completion rate by event</h2>
        <p>Percent of users who completed each selected event.</p>
      </div>
      <div class="bar-chart">
        ${summaryRows
          .map((row, index) => {
            const width = Math.max((row.completionRate / maxRate) * 100, 2)
            return `
              <div class="bar-row">
                <span>${getRowLabel(row)}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width: ${width}%; background: ${getChartColor(index)}"></div>
                </div>
                <strong>${formatPercent(row.completionRate)}</strong>
              </div>
            `
          })
          .join('')}
      </div>
    </section>
  `
}

function renderSummaryTable(summaryRows: SummaryRow[], state: ActivationModelState): string {
  return `
    <section class="table-card">
      <div class="panel-heading">
        <h2>Summary table</h2>
        <p>Based on ${state.selectedEvents.length} required events within ${state.windowDays} days.</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Event name</th>
            ${state.splitUsers ? '<th>Group</th>' : ''}
            <th>Users</th>
            <th>Completed users</th>
            <th>Completion rate</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows
            .map(
              (row) => `
                <tr>
                  <td>${row.eventName}</td>
                  ${state.splitUsers ? `<td>${row.groupName}</td>` : ''}
                  <td>${row.users.toLocaleString()}</td>
                  <td>${row.completedUsers.toLocaleString()}</td>
                  <td>${formatPercent(row.completionRate)}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    style: 'percent',
  }).format(value)
}

function getChartColor(index: number): string {
  const colors = ['#2563eb', '#16a34a', '#f59e0b', '#9333ea']
  return colors[index % colors.length]
}

function getGroupName(userId: string, groupCount: number): string {
  return `group_${(hashUserId(userId) % groupCount) + 1}`
}

function getRowLabel(row: SummaryRow): string {
  return row.groupName ? `${row.eventName} / ${row.groupName}` : row.eventName
}

function getTopEvent(summaryRows: SummaryRow[]): SummaryRow {
  return [...summaryRows].sort((first, second) => second.completionRate - first.completionRate)[0]
}

function hashUserId(userId: string): number {
  let hash = 0

  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return hash
}
