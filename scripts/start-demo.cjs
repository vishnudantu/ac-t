/* Start the verified production build using the generated local demo configuration. */
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const envFile = path.join(root, '.env.demo')
if (!fs.existsSync(envFile)) {
  console.error('Missing .env.demo. Run "node scripts/demo-db.cjs" first.')
  process.exit(1)
}

const env = { ...process.env, NODE_ENV: 'production' }
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue
  const index = line.indexOf('=')
  env[line.slice(0, index)] = line.slice(index + 1).replace(/^"|"$/g, '')
}

const child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', process.env.PORT || '3000'], {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
})
child.on('exit', (code) => process.exit(code ?? 1))
