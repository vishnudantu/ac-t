/* Run only in the disposable demo's private Docker network. */
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { Client } = require('pg')
const { randomBytes } = require('node:crypto')

function environment(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=')
    return [line.slice(0, separator), line.slice(separator + 1)]
  }))
}

async function main() {
  const dbPassword = randomBytes(32).toString('base64url')
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD || randomBytes(18).toString('base64url')
  const jwtSecret = randomBytes(32).toString('base64url')
  const admin = new Client({
    host: 'aca-ticketops-db', port: 5432, database: 'postgres',
    user: process.env.POSTGRES_USER || 'postgres', password: process.env.POSTGRES_PASSWORD,
  })
  await admin.connect()
  await admin.query('ALTER ROLE demo_app LOGIN PASSWORD $1', [dbPassword])
  await admin.query('GRANT ALL ON DATABASE aca_ticketops_demo TO demo_app')
  await admin.end()
  const url = `postgresql://demo_app:${dbPassword}@aca-ticketops-db:5432/aca_ticketops_demo?schema=public`
  const client = new Client({ connectionString: url })
  await client.connect()
  await client.end()
  fs.writeFileSync('/tmp/demo.env', `DATABASE_URL=${url}\nDEMO_ADMIN_PASSWORD=${adminPassword}\nJWT_SECRET=${jwtSecret}\n`, { mode: 0o600 })
  const env = { ...process.env, ...environment('/tmp/demo.env') }
  const prisma = '/app/node_modules/prisma/build/index.js'
  execFileSync(process.execPath, [prisma, 'db', 'push', '--schema', '/app/prisma/schema.prisma', '--skip-generate'], { cwd: '/app', env, stdio: 'inherit' })
  execFileSync(process.execPath, [prisma, 'generate', '--schema', '/app/prisma/schema.prisma'], { cwd: '/app', env, stdio: 'inherit' })
  execFileSync(process.execPath, ['/app/node_modules/ts-node/dist/bin.js', '--compiler-options', '{"module":"CommonJS"}', '/app/prisma/seed.ts'], { cwd: '/app', env, stdio: 'inherit' })
  fs.writeFileSync('/app/.env.demo', [
    '# Local-only generated demo configuration. Never commit this file.',
    `DATABASE_URL="${url}"`,
    `DEMO_ADMIN_PASSWORD="${adminPassword}"`,
    `JWT_SECRET="${jwtSecret}"`,
    'ALLOW_EPHEMERAL_DEV_AUTH=false',
    'ENABLE_MFA=false',
    'ENABLE_EMAIL=false',
    'ENABLE_SMS=false',
    'ENABLE_WHATSAPP=false',
    '',
  ].join('\n'), { mode: 0o600 })
  console.log('Demo database initialized and seeded. Local credentials are in git-ignored .env.demo.')
}

main().catch((error) => {
  console.error('Demo database bootstrap failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
