import usersCsv from '../../lightdash-demo-saas/seeds/users_raw.csv?raw'
import tracksCsv from '../../lightdash-demo-saas/seeds/tracks_raw.csv?raw'
import productPurchasesCsv from '../../lightdash-demo-saas/seeds/product_purchases_raw.csv?raw'

type CsvRow = Record<string, string>

export type User = {
  isMarketingOptedIn: boolean
  jobTitle: string
  latestLoggedInAt: Date | null
  userId: string
  firstLoggedInAt: Date | null
}

export type TrackEvent = {
  userId: string
  eventName: string
  eventTimestamp: Date | null
}

export type ProductPurchase = {
  customerId: string
  productName: string
}

export const users = parseCsv(usersCsv).map<User>((row) => ({
  isMarketingOptedIn: row.is_marketing_opted_in === '1',
  jobTitle: row.job_title || 'Unknown',
  latestLoggedInAt: parseDate(row.latest_logged_in_at),
  userId: row.user_id,
  firstLoggedInAt: parseDate(row.first_logged_in_at),
}))

export const tracks = parseCsv(tracksCsv).map<TrackEvent>((row) => ({
  userId: row.user_id,
  eventName: row.event_name,
  eventTimestamp: parseDate(row.event_timestamp),
}))

export const productPurchases = parseCsv(productPurchasesCsv).map<ProductPurchase>((row) => ({
  customerId: row.customer_id,
  productName: row.product_name,
}))

export const eventOptions = getEventOptions(tracks)

function parseCsv(csv: string): CsvRow[] {
  const [headerLine = '', ...lines] = csv.trim().split(/\r?\n/)
  const headers = splitCsvLine(headerLine)

  return lines.map((line) => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function splitCsvLine(line: string): string[] {
  const values: string[] = []
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

function parseDate(value: string): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function getEventOptions(events: TrackEvent[]): string[] {
  const eventCounts = new Map<string, number>()

  for (const event of events) {
    eventCounts.set(event.eventName, (eventCounts.get(event.eventName) ?? 0) + 1)
  }

  return [...eventCounts.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([eventName]) => eventName)
}
