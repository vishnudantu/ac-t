import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'

const prisma = new PrismaClient()

type Cell = string | number
type Rows = Cell[][]

export interface ManifestMatch {
  title: string
  tournament: string
  format: string
  matchDate: Date
  venue: string
  notes: string
}

export interface ManifestPool {
  sNo: number
  zone?: string
  standName: string
  gateNo: string
  typeOfStand: string
  basePrice: number
  cgst: number
  sgst: number
  ticketPrice: number
  stadiumCapacity: number
  amount: number
  acaComp: number
  forSale: number
  forSaleAmount: number
  acaBlockForSale: number
  acaSaleTotalAmount: number
  phase1ForSale: number
  phase1SaleTotalAmount: number
  phase2ForSale: number
  phase2SaleTotalAmount: number
  phase3ForSale: number
  phase3SaleTotalAmount: number
  category: string
  blockName: string
  availableQuantity: number
  totalQuantity: number
  reservedQuantity: number
  faceValue: number
  pricingCategory: string
}

export interface ManifestCategory {
  name: string
  displayName: string
  pricingTier: number
  typeOfStand: string
}

interface OTBRow {
  standName: string
  cost: number
  totalTickets: number
  left: number
}

export interface ManifestResult {
  match: ManifestMatch | null
  categories: ManifestCategory[]
  inventoryPools: ManifestPool[]
  otbData: OTBRow[]
}

function cellValue(cell: ExcelJS.Cell): Cell {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value && (typeof value.result === 'number' || typeof value.result === 'string')) return value.result
  }
  return String(value)
}

function sheetRows(sheet: ExcelJS.Worksheet): Rows {
  const rows: Rows = []
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const cells: Cell[] = []
    for (let column = 1; column <= row.cellCount; column += 1) {
      cells[column - 1] = cellValue(row.getCell(column))
    }
    rows[number - 1] = cells
  })
  return rows
}

export async function parseManifestFile(filePath: string): Promise<ManifestResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const result: ManifestResult = { match: null, categories: [], inventoryPools: [], otbData: [] }
  const manifest = workbook.getWorksheet('Sheet1')
  if (manifest) {
    const data = sheetRows(manifest)
    result.match = parseMatchTitle(String(data[0]?.[0] || ''))
    for (const row of data.slice(2)) {
      if (!row?.length || (typeof row[0] === 'string' && row[0].toLowerCase().includes('total'))) continue
      const pool = parseManifestRow(row)
      if (pool) result.inventoryPools.push(pool)
    }
  }
  const otb = workbook.getWorksheet('OTB')
  if (otb) {
    const data = sheetRows(otb)
    const stands = data[1] || []
    const costs = data[2] || []
    for (let i = 1; i < stands.length; i += 1) {
      const standName = String(stands[i] || '').trim()
      const cost = parseFloat(String(costs[i] || '0'))
      if (standName && cost > 0) result.otbData.push({ standName, cost, totalTickets: 0, left: 0 })
    }
  }
  const categories = new Map<string, ManifestCategory>()
  for (const pool of result.inventoryPools) {
    if (!categories.has(pool.category)) {
      categories.set(pool.category, {
        name: pool.category,
        displayName: pool.category,
        pricingTier: getPricingTier(pool.typeOfStand),
        typeOfStand: pool.typeOfStand,
      })
    }
  }
  result.categories = Array.from(categories.values())
  return result
}

function parseMatchTitle(title: string): ManifestMatch {
  const match = title.match(/IND Vs ([A-Z]+) (\d{4}) (\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\w+)\s+(.+?)\s*-\s*Option/i)
  if (!match) return {
    title: 'Imported Match', tournament: 'Unknown', format: 'ODI', matchDate: new Date(), venue: 'Unknown', notes: `Imported from manifest: ${title}`,
  }
  return {
    title: `India vs ${match[1]} - ODI`,
    tournament: `${match[1]} Tour of India ${match[2]}`,
    format: 'ODI',
    matchDate: parseDate(match[3]),
    venue: match[4].trim(),
    notes: `Imported from manifest: ${title}`,
  }
}

function parseDate(dateString: string): Date {
  const cleaned = dateString.replace(/(\d+)(st|nd|rd|th)/, '$1')
  const date = new Date(cleaned)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid manifest match date: ${dateString}`)
  return date
}

function numeric(row: Rows[number], index: number): number {
  const value = Number(row[index] || 0)
  return Number.isFinite(value) ? value : 0
}

function parseManifestRow(row: Cell[]): ManifestPool | null {
  const sNo = numeric(row, 0)
  const standName = String(row[2] || '').trim()
  if (!Number.isInteger(sNo) || sNo <= 0 || !standName) return null
  const typeOfStand = String(row[4] || '').trim()
  return {
    sNo,
    zone: String(row[1] || '').trim() || undefined,
    standName,
    gateNo: String(row[3] || '').trim(),
    typeOfStand,
    basePrice: numeric(row, 5), cgst: numeric(row, 6), sgst: numeric(row, 7),
    ticketPrice: numeric(row, 8), stadiumCapacity: numeric(row, 9), amount: numeric(row, 10),
    acaComp: numeric(row, 11), forSale: numeric(row, 12), forSaleAmount: numeric(row, 13),
    acaBlockForSale: numeric(row, 14), acaSaleTotalAmount: numeric(row, 15),
    phase1ForSale: numeric(row, 16), phase1SaleTotalAmount: numeric(row, 17),
    phase2ForSale: numeric(row, 18), phase2SaleTotalAmount: numeric(row, 19),
    phase3ForSale: numeric(row, 20), phase3SaleTotalAmount: numeric(row, 21),
    category: mapStandTypeToCategory(typeOfStand),
    blockName: extractBlockName(standName),
    availableQuantity: numeric(row, 12),
    totalQuantity: numeric(row, 9),
    reservedQuantity: numeric(row, 11),
    faceValue: numeric(row, 8),
    pricingCategory: typeOfStand,
  }
}

function mapStandTypeToCategory(type: string): string {
  const normalized = type.toLowerCase()
  if (['premium hospitality', 'vip', 'lounge', 'suite', 'box'].some((word) => normalized.includes(word))) return 'VIP'
  if (['hospitality', 'meal box', 'snacks box'].some((word) => normalized.includes(word))) return 'PREMIUM'
  return 'GENERAL'
}

function getPricingTier(type: string): number {
  const normalized = type.toLowerCase()
  if (['premium hospitality', 'vip', 'lounge', 'suite', 'box'].some((word) => normalized.includes(word))) return 1
  if (['hospitality', 'meal box', 'snacks box'].some((word) => normalized.includes(word))) return 2
  return 3
}

function extractBlockName(standName: string): string {
  const match = standName.match(/([A-Z]-?stand|[A-Z]\d?-?stand|Suite \d+-\d+|Corp Box \d+-\d+|ACA Lounge|BCCI Lounge|North Lounge|West Lounge \d|VDCA Box)/i)
  return match ? match[1] : standName
}

export async function importManifestToDatabase(filePath: string, userId: string): Promise<{ matchId: string; inventoryCount: number }> {
  const parsed = await parseManifestFile(filePath)
  if (!parsed.match) throw new Error('The workbook does not contain a Sheet1 manifest')
  let match = await prisma.match.findFirst({ where: { title: parsed.match.title, matchDate: parsed.match.matchDate } })
  if (!match) {
    match = await prisma.match.create({ data: {
      title: parsed.match.title,
      tournament: parsed.match.tournament,
      format: parsed.match.format,
      matchDate: parsed.match.matchDate,
      startTime: '13:30',
      venueId: await getOrCreateVenue(parsed.match.venue),
      status: 'UPCOMING',
      matchAdminId: userId,
      totalInventory: parsed.inventoryPools.reduce((sum, pool) => sum + pool.stadiumCapacity, 0),
      notes: parsed.match.notes,
    } })
  }
  const categoryMap = new Map<string, string>()
  for (const category of parsed.categories) {
    const existing = await prisma.ticketCategory.findUnique({ where: { matchId_name: { matchId: match.id, name: category.name } } })
    if (existing) {
      categoryMap.set(category.name, existing.id)
    } else {
      const created = await prisma.ticketCategory.create({ data: {
        matchId: match.id, name: category.name, displayName: category.displayName,
        pricingTier: category.pricingTier, sortOrder: category.pricingTier,
      } })
      categoryMap.set(category.name, created.id)
    }
  }
  for (const pool of parsed.inventoryPools) {
    const categoryId = categoryMap.get(pool.category)
    if (!categoryId) continue
    const id = `inv-${match.id}-${categoryId}-${pool.standName}-${pool.blockName}`.replace(/[^a-zA-Z0-9-]/g, '-')
    await prisma.inventoryPool.upsert({
      where: { id },
      update: {},
      create: {
        id, matchId: match.id, ticketCategoryId: categoryId,
        standName: pool.zone || pool.standName, blockName: pool.blockName, gateName: pool.gateNo,
        ticketFormat: 'PHYSICAL', faceValue: pool.faceValue, pricingCategory: pool.pricingCategory,
        totalQuantity: pool.totalQuantity, reservedQuantity: pool.reservedQuantity, availableQuantity: pool.availableQuantity,
        notes: `Zone: ${pool.zone || 'N/A'}, Type: ${pool.typeOfStand}, Phased sales: P1=${pool.phase1ForSale}, P2=${pool.phase2ForSale}, P3=${pool.phase3ForSale}`,
      },
    })
  }
  return { matchId: match.id, inventoryCount: parsed.inventoryPools.length }
}

async function getOrCreateVenue(venueName: string): Promise<string> {
  let venue = await prisma.venue.findFirst({ where: { name: { contains: venueName.split(' ')[0] } } })
  if (!venue) {
    venue = await prisma.venue.create({ data: {
      name: venueName,
      shortName: venueName.split(' ').slice(0, 2).join(' '),
      city: 'Visakhapatnam', state: 'Andhra Pradesh', country: 'India',
    } })
  }
  return venue.id
}
