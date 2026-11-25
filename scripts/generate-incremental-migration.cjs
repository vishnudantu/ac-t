/* Generate an incremental migration against an isolated, migrated scratch DB. */
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const root = path.resolve(__dirname, '..')
const database = 'aca_migration_incremental'
const raw = execFileSync('docker', ['exec', 'aca-ticketops-db', 'sh', '-c', 'printf "%s\\n%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD"'], { encoding: 'utf8' })
const [user, ...rest] = raw.split('\n')
const password = rest.join('\n').trim()
if (!user || !password) throw new Error('Could not read local database credentials')
const url = `postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:55432/${database}?schema=public`
const prisma = path.join(root, 'node_modules', 'prisma', 'build', 'index.js')

function run(command, options = {}) {
  return execFileSync(command[0], command.slice(1), {
    cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit', ...options,
  })
}

try {
  execFileSync('docker', ['exec', 'aca-ticketops-db', 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${database}`], { stdio: 'inherit' })
  execFileSync('docker', ['exec', 'aca-ticketops-db', 'psql', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${database}`], { stdio: 'inherit' })
  const migrations = fs.readdirSync(path.join(root, 'prisma', 'migrations'), { withFileTypes: true })
  const temporary = path.join(root, 'prisma', '.migration-tmp')
  if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true })
  fs.renameSync(path.join(root, 'prisma', 'migrations'), temporary)
  fs.mkdirSync(path.join(root, 'prisma', 'migrations'))
  for (const entry of migrations) {
    if (entry.isDirectory() && entry.name.includes('_init')) {
      fs.renameSync(path.join(temporary, entry.name), path.join(root, 'prisma', 'migrations', entry.name))
    } else if (entry.isFile()) {
      fs.copyFileSync(path.join(temporary, entry.name), path.join(root, 'prisma', 'migrations', entry.name))
    }
  }
  run([process.execPath, prisma, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'])
  fs.rmSync(temporary, { recursive: true })
  run([process.execPath, prisma, 'migrate', 'dev', '--name', 'add_quota_templates', '--create-only', '--skip-seed', '--skip-generate'])
  console.log('Incremental migration created. Review the SQL before committing.')
} catch (error) {
  console.error('Incremental migration generation failed:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
} finally {
  execFileSync('docker', ['exec', 'aca-ticketops-db', 'psql', '-U', user, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${database}`], { stdio: 'inherit' })
}
