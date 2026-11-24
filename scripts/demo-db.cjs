/* Initialize only the explicitly approved, disposable local demo database. */
const { execFileSync } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs')
const { Client } = require('pg')

const root = path.resolve(__dirname, '..')
const database = 'aca_ticketops_demo'
const host = '127.0.0.1'
const port = 55432
const password = randomBytes(32).toString('base64url')
const adminPassword = process.env.DEMO_ADMIN_PASSWORD || randomBytes(18).toString('base64url')

function containerName() {
  return execFileSync('docker', ['ps', '--filter', 'name=^/aca-ticketops-db$', '--format', '{{.Names}}'], {
    encoding: 'utf8', windowsHide: true,
  }).trim()
}

function adminConnection() {
  const raw = execFileSync('docker', [
    'exec', containerName(), 'sh', '-c',
    'printf "%s\\n%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD"',
  ], { encoding: 'utf8', windowsHide: true })
  const [user, ...rest] = raw.split('\n')
  const pass = rest.join('\n').replace(/\n$/, '')
  if (!user || !pass) throw new Error('Unable to access local demo database administrator')
  return { host, port, user, password: pass, database: 'postgres' }
}

function runPrisma(args, url) {
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), ...args], {
    cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit', windowsHide: true,
  })
}

async function main() {
  if (!containerName()) throw new Error('Start the local PostgreSQL container before initializing the demo')
  const admin = new Client(adminConnection())
  try {
    await admin.connect()
    // PostgreSQL does not allow bind parameters in ALTER ROLE; quote the generated value as a literal.
    await admin.query(`ALTER ROLE demo_app LOGIN PASSWORD '${password.replace(/'/g, "''")}'`)
    await admin.query(`GRANT ALL ON DATABASE ${database} TO demo_app`)
    const schemaAdmin = new Client({ ...adminConnection(), database })
    try {
      await schemaAdmin.connect()
      await schemaAdmin.query('GRANT USAGE, CREATE ON SCHEMA public TO demo_app')
      await schemaAdmin.query('ALTER SCHEMA public OWNER TO demo_app')
    } finally {
      await schemaAdmin.end().catch(() => undefined)
    }
  } finally {
    await admin.end().catch(() => undefined)
  }

  const url = `postgresql://demo_app:${password}@${host}:${port}/${database}?schema=public`
  const demoClient = new Client({ connectionString: url })
  try {
    await demoClient.connect()
  } finally {
    await demoClient.end().catch(() => undefined)
  }
  runPrisma(['db', 'push', '--skip-generate'], url)
  runPrisma(['generate'], url)
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'ts-node', 'dist', 'bin.js'), '--compiler-options', '{"module":"CommonJS"}', path.join(root, 'prisma', 'seed.ts')], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, DEMO_ADMIN_PASSWORD: adminPassword },
    stdio: 'inherit', windowsHide: true,
  })
  const jwtSecret = randomBytes(32).toString('base64url')
  fs.writeFileSync(path.join(root, '.env.demo'), [
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
  console.log('Demo database initialized. Local credentials are in git-ignored .env.demo.')
}

main().catch((error) => {
  console.error('Demo initialization failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
