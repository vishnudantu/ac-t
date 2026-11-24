/* Generate the initial Prisma migration against a scratch database. */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const database = 'aca_migration_init'
const raw = execFileSync('docker', ['exec', 'aca-ticketops-db', 'sh', '-c', 'printf "%s\\n%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD"'], { encoding: 'utf8' })
const [user, ...rest] = raw.split('\n')
const password = rest.join('\n').trim()
if (!user || !password) throw new Error('Could not read local database credentials')

const url = `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:55432/${database}?schema=public`
execFileSync(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'dev', '--name', 'init', '--create-only'], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'inherit',
})
console.log('Initial migration created under prisma/migrations. Review it before deployment.')
