import net from 'node:net'
import tls from 'node:tls'

interface MailInput {
  to: string
  subject: string
  text: string
}

/**
 * Minimal SMTP client using Node's net/tls only — no external dependency.
 * Supports STARTTLS and AUTH LOGIN. Configured entirely from environment:
 * SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM.
 */
export async function sendSmtpMail(input: MailInput): Promise<void> {
  const host = process.env.SMTP_HOST
  if (!host) throw new Error('SMTP_HOST is not configured')
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = process.env.SMTP_SECURE === 'true'
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  if (!from) throw new Error('SMTP_FROM is not configured')

  await new Promise<void>((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port })
    let buffer = ''
    let step = 0
    const user = process.env.SMTP_USER || ''
    const pass = process.env.SMTP_PASSWORD || ''
    const to = input.to

    function send(command: string): void {
      socket.write(`${command}\r\n`)
    }

    function onData(chunk: Buffer): void {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/).filter(Boolean)
      if (lines.length === 0) return
      const last = lines[lines.length - 1]
      const code = Number(last.slice(0, 3))
      buffer = ''

      if (code >= 400) {
        cleanup()
        reject(new Error(`SMTP error: ${last.slice(0, 200)}`))
        return
      }
      if (/^\d{3}-/.test(last)) return

      switch (step) {
        case 0:
          send(`EHLO ${host}`)
          step += 1
          break
        case 1:
          if (!secure && /250[- ]STARTTLS/i.test(lines.join(' '))) {
            send('STARTTLS')
            step = 10
            break
          }
          proceedAuth()
          break
        case 10:
          socket = tls.connect({ socket, servername: host }, () => {
            send(`EHLO ${host}`)
            step = 11
          })
          break
        case 11:
          proceedAuth()
          break
        case 2:
          send(Buffer.from(user).toString('base64'))
          step = 3
          break
        case 3:
          send(Buffer.from(pass).toString('base64'))
          step = 4
          break
        case 4:
        case 5:
          send(`MAIL FROM:<${from}>`)
          step += 1
          break
        case 6:
          send(`RCPT TO:<${to}>`)
          step += 1
          break
        case 7:
          send('DATA')
          step += 1
          break
        case 8: {
          const headers = [
            `From: ${from}`, `To: ${to}`, `Subject: ${input.subject}`,
            'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit', `Date: ${new Date().toUTCString()}`,
          ].join('\r\n')
          const body = input.text.replace(/\r?\n/g, '\r\n').replace(/\r\n\./g, '\r\n..')
          socket.write(`${headers}\r\n\r\n${body}\r\n.\r\n`)
          step += 1
          break
        }
        case 9:
          send('QUIT')
          cleanup()
          resolve()
          break
      }
    }

    function proceedAuth(): void {
      if (user && pass) {
        send('AUTH LOGIN')
        step = 2
      } else {
        send(`MAIL FROM:<${from}>`)
        step = 6
      }
    }

    function onError(error: Error): void {
      cleanup()
      reject(error)
    }

    function cleanup(): void {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.end()
    }

    socket.on('data', onData)
    socket.on('error', onError)
    socket.setTimeout(15000, () => { onError(new Error('SMTP connection timed out')) })
  })
}
