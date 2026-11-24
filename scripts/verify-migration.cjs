/* Verify the initial migration applies cleanly to a fresh scratch database. */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const database = 'aca_migration_verify'
const raw = execFileSync('docker', ['exec', 'aca-ticketops-db', 'sh', '-c', 'printf "%s\\n%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD"'], { encoding: 'utf8' })
const [user, ...rest] = raw.split('\n')
const password = rest.join('\n').trim()
const url = `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:55432/${database}?schema=public`

try {
  execFileSync('docker', ['exec', 'aca-ticketops-db', 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${database}`], { stdio: 'inherit' })
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
    cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit',
  })
  console.log('Initial migration applied cleanly to a fresh database.')
} finally {
  execFileSync('docker', ['exec', 'aca-ticketops-db', 'psql', '-U', user, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${database}`], { stdio: 'inherit' })
}
