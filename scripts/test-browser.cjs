const { randomUUID } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pg18 = 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
const psql = process.env.ACA_E2E_PSQL || (existsSync(pg18) ? pg18 : 'psql')
const database = 'aca_e2e_' + randomUUID().replaceAll('-', '')
const databaseUrl = 'postgresql://aca_local@127.0.0.1:55479/' + database
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  ACA_E2E_DATABASE: database,
  ACA_E2E_PASSWORD: randomUUID(),
  JWT_SECRET: randomUUID() + randomUUID(),
  NEXT_DIST_DIR: '.next/browser-e2e',
  ENABLE_EMAIL: 'false',
  ENABLE_SMS: 'false',
  ENABLE_WHATSAPP: 'false',
}
delete env.NODE_ENV
delete env.PGPASSWORD
delete env.PGSERVICE

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(command + ' failed with ' + (result.signal || result.status))
}

function databaseCommand(sql) {
  run(psql, ['-X', '-h', '127.0.0.1', '-p', '55479', '-U', 'aca_local', '-d', 'postgres', '-w', '-v', 'ON_ERROR_STOP=1', '-c', sql])
}

let created = false
try {
  databaseCommand('CREATE DATABASE ' + database)
  created = true
  run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'])
  run(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (created) {
    try {
      databaseCommand('DROP DATABASE ' + database)
    } catch (error) {
      console.error('Could not remove temporary database ' + database + ': ' + error.message)
      process.exitCode = 1
    }
  }
}
