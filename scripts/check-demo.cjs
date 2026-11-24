const fs = require('node:fs')
const { chromium } = require('@playwright/test')

const config = Object.fromEntries(fs.readFileSync('.env.demo', 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')]
}))

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  console.log('Login heading:', await page.locator('body').innerText())
  await page.getByLabel('Email').fill('office@andhracricket.com')
  await page.getByLabel('Password').fill(config.DEMO_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.waitForLoadState('networkidle')
  console.log('Dashboard URL:', page.url())
  console.log('Dashboard:', (await page.locator('main').innerText()).slice(0, 1500))
  await page.screenshot({ path: 'demo-dashboard.png', fullPage: true })
  for (const route of ['requests', 'matches', 'inventory', 'quotas', 'approvals', 'distribution']) {
    await page.goto(`http://localhost:3000/${route}`, { waitUntil: 'networkidle' })
    console.log(route, 'HTTP', (await page.request.get(`http://localhost:3000/${route}`)).status(), (await page.locator('main').innerText()).slice(0, 140).replace(/\n/g, ' | '))
  }
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await page.waitForURL('**/login', { timeout: 10000 })
  console.log('Logout URL:', page.url())
  console.log('Browser errors:', errors)
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
