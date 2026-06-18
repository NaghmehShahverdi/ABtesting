import 'dotenv/config'
import snowflake from 'snowflake-sdk'

snowflake.configure({
  additionalLogToConsole: false,
  logLevel: 'error',
})

const requiredEnvVars = [
  'SNOWFLAKE_ACCOUNT',
  'SNOWFLAKE_USERNAME',
  'SNOWFLAKE_PASSWORD',
  'SNOWFLAKE_WAREHOUSE',
  'SNOWFLAKE_DATABASE',
  'SNOWFLAKE_SCHEMA',
]

const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name])

if (missingEnvVars.length > 0) {
  console.error(`Missing Snowflake environment variables: ${missingEnvVars.join(', ')}`)
  console.error('Add them to ABtesting/.env, then run npm run snowflake:test again.')
  process.exit(1)
}

const connectionTimeoutMs = 20_000
const queryTimeoutSec = 30

function logSnowflakeError(error) {
  const responseBody =
    typeof error.response?.body === 'string'
      ? error.response.body
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240)
      : undefined

  const details = {
    code: error.code,
    errno: error.errno,
    hostname: error.hostname,
    message: error.message,
    name: error.name,
    sqlState: error.sqlState,
    syscall: error.syscall,
  }

  if (error.cause) {
    details.cause = {
      code: error.cause.code,
      message: error.cause.message,
      name: error.cause.name,
      status: error.cause.status,
    }
  }

  if (error.response) {
    details.response = {
      body: responseBody,
      statusCode: error.response.statusCode,
      statusMessage: error.response.statusMessage,
    }
  }

  console.error(JSON.stringify(details, null, 2))

  if (error.response?.statusCode === 404) {
    console.error(
      'Snowflake returned 404 for the account host. Update SNOWFLAKE_ACCOUNT in ABtesting/.env to the full account identifier from Snowflake account details.',
    )
    console.error('Examples: xy12345.us-east-1, xy12345.us-east-1.aws, or your-org-your-account')
  }
}

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  authenticator: process.env.SNOWFLAKE_AUTHENTICATOR,
  role: process.env.SNOWFLAKE_ROLE,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
})

const timeout = setTimeout(() => {
  console.error(`Snowflake connection timed out after ${connectionTimeoutMs / 1000} seconds.`)
  console.error('Check your network/VPN/firewall and confirm the account identifier in ABtesting/.env.')
  connection.destroy()
  process.exit(1)
}, connectionTimeoutMs)

connection.connect((connectError) => {
  clearTimeout(timeout)

  if (connectError) {
    console.error('Snowflake connection failed:', connectError.message)
    console.error('Check your account, username, password, role, warehouse, database, and schema.')
    logSnowflakeError(connectError)
    process.exit(1)
  }

  connection.execute({
    sqlText: 'SELECT COUNT(*) AS USERS FROM USERS_RAW',
    timeout: queryTimeoutSec,
    complete: (queryError, _statement, rows) => {
      if (queryError) {
        console.error('Snowflake query failed:', queryError.message)
        console.error(
          `Expected table: ${process.env.SNOWFLAKE_DATABASE}.${process.env.SNOWFLAKE_SCHEMA}.USERS_RAW`,
        )
        logSnowflakeError(queryError)
        connection.destroy()
        process.exit(1)
      }

      console.log('Snowflake connected successfully.')
      console.table(rows)
      connection.destroy()
    },
  })
})
