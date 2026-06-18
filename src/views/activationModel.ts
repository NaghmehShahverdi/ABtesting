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
    <section class="page-header am-page-header">
      <div class="am-page-header-glow" aria-hidden="true"></div>
      <div class="am-page-header-inner">
        <p class="am-page-eyebrow">Activation model</p>
        <h1 class="am-page-title">Activation Model</h1>
        <p class="am-page-summary">
          Measure how many users complete each selected event within
          <strong class="am-page-window">${state.windowDays} days</strong>
          of first login — a window you set in the controls below.
        </p>
        <p class="am-page-summary am-page-summary-secondary">
          ${
            state.splitUsers
              ? `User splitting is <strong>enabled</strong>: accounts are assigned to <strong>${state.selectedEvents.length} groups</strong> and each event is compared across every group.`
              : `User splitting is <strong>optional</strong>. Turn it on to assign users to ${state.selectedEvents.length} experiment groups and compare completion rates side by side.`
          }
        </p>
        <div class="am-page-chips" aria-label="Current model settings">
          <span class="am-page-chip">Your window: ${state.windowDays} days</span>
          <span class="am-page-chip">${state.selectedEvents.length} events selected</span>
          <span class="am-page-chip ${state.splitUsers ? 'is-active' : ''}">
            Split users: ${state.splitUsers ? 'On' : 'Off (optional)'}
          </span>
        </div>
      </div>
    </section>

    <section class="workspace-grid">
      <form class="control-panel">
        <div class="panel-heading">
          <h2>Model inputs</h2>
          <p>Select 2 to ${maxSelectedEvents} events, set the activation window, and optionally split users into groups.</p>
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

        ${renderBarChart(summaryRows, state.splitUsers)}
        ${renderSummaryTable(summaryRows, state)}
      </section>
    </section>
  `
}

export function bindActivationControls(
  getState: () => ActivationModelState,
  onStateChange: (nextState: ActivationModelState) => void,
) {
  document.querySelector<HTMLInputElement>('#window-days')?.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement
    onStateChange({
      ...getState(),
      windowDays: Math.min(Math.max(Number(target.value) || 1, 1), 90),
    })
  })

  document.querySelectorAll<HTMLInputElement>('input[name="split-users"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      onStateChange({
        ...getState(),
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
        ...getState(),
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
    const rows: SummaryRow[] = []

    for (const eventName of selectedEvents) {
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
        const groupName = formatGroupName(groupIndex, groupCount)
        const groupUsers = eligibleUsers.filter(
          (user) => getGroupIndex(user.userId, groupCount) === groupIndex,
        )
        const completedUsers = groupUsers.filter((user) =>
          completedEventsByUser.get(user.userId)?.has(eventName),
        ).length

        rows.push({
          eventName,
          groupName,
          users: groupUsers.length,
          completedUsers,
          completionRate: groupUsers.length === 0 ? 0 : completedUsers / groupUsers.length,
        })
      }
    }

    return rows
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

function renderBarChart(summaryRows: SummaryRow[], splitUsers: boolean): string {
  const maxRate = Math.max(...summaryRows.map((row) => row.completionRate), 0.01)

  return `
    <section class="chart-card">
      <div class="panel-heading">
        <h2>Completion rate by event</h2>
        <p>${
          splitUsers
            ? 'Each selected event compared across all assigned user groups.'
            : 'Percent of users who completed each selected event.'
        }</p>
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

function getGroupIndex(userId: string, groupCount: number): number {
  const digest = md5Hex(userId)
  return Number(BigInt(`0x${digest}`) % BigInt(groupCount))
}

function formatGroupName(groupIndex: number, groupCount: number): string {
  if (groupCount === 2) {
    return groupIndex === 0 ? 'control' : 'treatment'
  }

  return `group_${groupIndex + 1}`
}

function getRowLabel(row: SummaryRow): string {
  return row.groupName ? `${row.eventName} / ${row.groupName}` : row.eventName
}

function getTopEvent(summaryRows: SummaryRow[]): SummaryRow {
  if (summaryRows.length === 0) {
    return {
      eventName: 'n/a',
      users: 0,
      completedUsers: 0,
      completionRate: 0,
    }
  }

  return [...summaryRows].sort((first, second) => second.completionRate - first.completionRate)[0]
}

function md5Hex(input: string): string {
  const data = new TextEncoder().encode(input)
  const words = bytesToWords(data)
  const bitLength = data.length * 8

  words[bitLength >> 5] |= 0x80 << bitLength % 32
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  for (let index = 0; index < words.length; index += 16) {
    const originalA = a
    const originalB = b
    const originalC = c
    const originalD = d

    a = ff(a, b, c, d, words[index + 0], 7, 0xd76aa478)
    d = ff(d, a, b, c, words[index + 1], 12, 0xe8c7b756)
    c = ff(c, d, a, b, words[index + 2], 17, 0x242070db)
    b = ff(b, c, d, a, words[index + 3], 22, 0xc1bdceee)
    a = ff(a, b, c, d, words[index + 4], 7, 0xf57c0faf)
    d = ff(d, a, b, c, words[index + 5], 12, 0x4787c62a)
    c = ff(c, d, a, b, words[index + 6], 17, 0xa8304613)
    b = ff(b, c, d, a, words[index + 7], 22, 0xfd469501)
    a = ff(a, b, c, d, words[index + 8], 7, 0x698098d8)
    d = ff(d, a, b, c, words[index + 9], 12, 0x8b44f7af)
    c = ff(c, d, a, b, words[index + 10], 17, 0xffff5bb1)
    b = ff(b, c, d, a, words[index + 11], 22, 0x895cd7be)
    a = ff(a, b, c, d, words[index + 12], 7, 0x6b901122)
    d = ff(d, a, b, c, words[index + 13], 12, 0xfd987193)
    c = ff(c, d, a, b, words[index + 14], 17, 0xa679438e)
    b = ff(b, c, d, a, words[index + 15], 22, 0x49b40821)

    a = gg(a, b, c, d, words[index + 1], 5, 0xf61e2562)
    d = gg(d, a, b, c, words[index + 6], 9, 0xc040b340)
    c = gg(c, d, a, b, words[index + 11], 14, 0x265e5a51)
    b = gg(b, c, d, a, words[index + 0], 20, 0xe9b6c7aa)
    a = gg(a, b, c, d, words[index + 5], 5, 0xd62f105d)
    d = gg(d, a, b, c, words[index + 10], 9, 0x02441453)
    c = gg(c, d, a, b, words[index + 15], 14, 0xd8a1e681)
    b = gg(b, c, d, a, words[index + 4], 20, 0xe7d3fbc8)
    a = gg(a, b, c, d, words[index + 9], 5, 0x21e1cde6)
    d = gg(d, a, b, c, words[index + 14], 9, 0xc33707d6)
    c = gg(c, d, a, b, words[index + 3], 14, 0xf4d50d87)
    b = gg(b, c, d, a, words[index + 8], 20, 0x455a14ed)
    a = gg(a, b, c, d, words[index + 13], 5, 0xa9e3e905)
    d = gg(d, a, b, c, words[index + 2], 9, 0xfcefa3f8)
    c = gg(c, d, a, b, words[index + 7], 14, 0x676f02d9)
    b = gg(b, c, d, a, words[index + 12], 20, 0x8d2a4c8a)

    a = hh(a, b, c, d, words[index + 5], 4, 0xfffa3942)
    d = hh(d, a, b, c, words[index + 8], 11, 0x8771f681)
    c = hh(c, d, a, b, words[index + 11], 16, 0x6d9d6122)
    b = hh(b, c, d, a, words[index + 14], 23, 0xfde5380c)
    a = hh(a, b, c, d, words[index + 1], 4, 0xa4beea44)
    d = hh(d, a, b, c, words[index + 4], 11, 0x4bdecfa9)
    c = hh(c, d, a, b, words[index + 7], 16, 0xf6bb4b60)
    b = hh(b, c, d, a, words[index + 10], 23, 0xbebfbc70)
    a = hh(a, b, c, d, words[index + 13], 4, 0x289b7ec6)
    d = hh(d, a, b, c, words[index + 0], 11, 0xeaa127fa)
    c = hh(c, d, a, b, words[index + 3], 16, 0xd4ef3085)
    b = hh(b, c, d, a, words[index + 6], 23, 0x04881d05)
    a = hh(a, b, c, d, words[index + 9], 4, 0xd9d4d039)
    d = hh(d, a, b, c, words[index + 12], 11, 0xe6db99e5)
    c = hh(c, d, a, b, words[index + 15], 16, 0x1fa27cf8)
    b = hh(b, c, d, a, words[index + 2], 23, 0xc4ac5665)

    a = ii(a, b, c, d, words[index + 0], 6, 0xf4292244)
    d = ii(d, a, b, c, words[index + 7], 10, 0x432aff97)
    c = ii(c, d, a, b, words[index + 14], 15, 0xab9423a7)
    b = ii(b, c, d, a, words[index + 5], 21, 0xfc93a039)
    a = ii(a, b, c, d, words[index + 12], 6, 0x655b59c3)
    d = ii(d, a, b, c, words[index + 3], 10, 0x8f0ccc92)
    c = ii(c, d, a, b, words[index + 10], 15, 0xffeff47d)
    b = ii(b, c, d, a, words[index + 1], 21, 0x85845dd1)
    a = ii(a, b, c, d, words[index + 8], 6, 0x6fa87e4f)
    d = ii(d, a, b, c, words[index + 15], 10, 0xfe2ce6e0)
    c = ii(c, d, a, b, words[index + 6], 15, 0xa3014314)
    b = ii(b, c, d, a, words[index + 13], 21, 0x4e0811a1)
    a = ii(a, b, c, d, words[index + 4], 6, 0xf7537e82)
    d = ii(d, a, b, c, words[index + 11], 10, 0xbd3af235)
    c = ii(c, d, a, b, words[index + 2], 15, 0x2ad7d2bb)
    b = ii(b, c, d, a, words[index + 9], 21, 0xeb86d391)

    a = addUnsigned(a, originalA)
    b = addUnsigned(b, originalB)
    c = addUnsigned(c, originalC)
    d = addUnsigned(d, originalD)
  }

  return [a, b, c, d].map((value) => value.toString(16).padStart(8, '0')).join('')
}

function bytesToWords(bytes: Uint8Array): number[] {
  const words: number[] = []
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8)
  }
  return words
}

function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & c) | (~b & d), a, b, x, s, t)
}

function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn((b & d) | (c & ~d), a, b, x, s, t)
}

function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(b ^ c ^ d, a, b, x, s, t)
}

function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return cmn(c ^ (b | ~d), a, b, x, s, t)
}

function cmn(
  func: number,
  a: number,
  b: number,
  x: number,
  s: number,
  t: number,
): number {
  return addUnsigned(rotateLeft(addUnsigned(addUnsigned(addUnsigned(a, func), x), t), s), b)
}

function addUnsigned(a: number, b: number): number {
  return (a + b) >>> 0
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}
