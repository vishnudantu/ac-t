/* SSH helper for the ACA server. Commands are passed via argv; output goes to stdout. */
const { Client } = require('ssh2')
const fs = require('node:fs')

const host = process.env.ACA_SSH_HOST
const user = process.env.ACA_SSH_USER || 'root'
const password = process.env.ACA_SSH_PASSWORD || (() => {
  // Stored outside the repo so the password never enters source control.
  const file = process.env.ACA_SSH_PASSWORD_FILE || 'C:\\Users\\vishn\\.aca-server-credentials'
  try { return fs.readFileSync(file, 'utf8').trim() } catch { return '' }
})()

function run(command, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let output = ''
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      conn.end()
      error ? reject(error) : resolve(result)
    }
    const timer = setTimeout(() => finish(new Error('SSH command timed out')), timeoutMs)
    conn.on('ready', () => {
      conn.exec(command, (error, stream) => {
        if (error) { clearTimeout(timer); return finish(error) }
        stream.on('data', (data) => { output += data.toString() })
        stream.stderr.on('data', (data) => { output += data.toString() })
        stream.on('close', (code) => {
          clearTimeout(timer)
          finish(null, { code, output })
        })
      })
    }).on('error', (error) => { clearTimeout(timer); finish(error) })
      .connect({ host, port: 22, username: user, password, readyTimeout: 30000 })
  })
}

async function main() {
  const command = process.argv.slice(2).join(' ')
  if (!command) { console.error('Usage: node scripts/server-run.cjs "<command>"'); process.exit(2) }
  if (!host) { console.error('Set ACA_SSH_HOST to the target server IP or hostname'); process.exit(2) }
  if (!password) { console.error('No server password. Set ACA_SSH_PASSWORD or create C:\\Users\\vishn\\.aca-server-credentials'); process.exit(2) }
  const { code, output } = await run(command)
  process.stdout.write(output)
  process.exit(code ?? 0)
}

main().catch((error) => { console.error('SSH ERROR:', error.message); process.exit(1) })
