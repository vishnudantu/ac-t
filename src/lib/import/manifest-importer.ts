// ACA TicketOps - Manifest Excel Importer
// Parses the standard ACA ticketing manifest format

import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'

const prisma = new PrismaClient()

interface ManifestRow {
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
}

interface OTBRow {
  standName: string
  cost: number
  totalTickets: number
  left: number
}

export async function parseManifestFile(filePath: string) {
  const workbook = XLSX.readFile(filePath)
  const results: {
    match: any
    categories: any[]
    inventoryPools: any[]
    otbData: OTBRow[]
  } = {
    match: null,
    categories: [],
    inventoryPools: [],
    otbData: [],
  }

  // Parse Sheet1 - Main Manifest
  if (workbook.SheetNames.includes('Sheet1')) {
    const sheet = workbook.Sheets['Sheet1']
    const data: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    // Extract match info from first row
    const titleRow = String(data[0]?.[0] || '')
    const matchInfo = parseMatchTitle(titleRow)

    // Headers are in row 1 (index 1)
    const headers = data[1] as string[]

    // Data rows start from index 2
    for (let i = 2; i < data.length; i++) {
      const row = data[i] as (string | number)[]
      if (!row || row.length === 0 || (typeof row[0] === 'string' && row[0].toLowerCase().includes('total'))) {
        continue
      }

      const parsed = parseManifestRow(row, headers)
      if (parsed) {
        results.inventoryPools.push(parsed)
      }
    }

    results.match = matchInfo
  }

  // Parse OTB Sheet
  if (workbook.SheetNames.includes('OTB')) {
    const sheet = workbook.Sheets['OTB']
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    // OTB headers in row 1
    const stands = data[1] as (string | number)[]
    const costs = data[2] as (string | number)[]

    for (let i = 1; i < stands.length; i++) {
      const standName = stands[i]?.toString().trim()
      const cost = parseFloat(costs[i]?.toString() || '0')
      if (standName && cost > 0) {
        results.otbData.push({
          standName,
          cost,
          totalTickets: 0,
          left: 0,
        })
      }
    }
  }

  // Derive categories from inventory
  const categoryMap = new Map<string, any>()
  for (const pool of results.inventoryPools) {
    if (!categoryMap.has(pool.category)) {
      categoryMap.set(pool.category, {
        name: pool.category,
        displayName: pool.category,
        pricingTier: getPricingTier(pool.typeOfStand),
        typeOfStand: pool.typeOfStand,
      })
    }
  }
  results.categories = Array.from(categoryMap.values())

  return results
}

function parseMatchTitle(title: string) {
  // "Ticketing Manifest for IND Vs SL 2025 13th December ACA VDCA Stadium Visakhapatam - Option 1"
  const match = title.match(/IND Vs ([A-Z]+) (\d{4}) (\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\w+)\s+(.+?)\s*-\s*Option/i)
  if (match) {
    return {
      title: `India vs ${match[1]} - ODI`,
      tournament: `${match[1]} Tour of India ${match[2]}`,
      format: 'ODI',
      matchDate: parseDate(match[3]),
      venue: match[4].trim(),
      notes: `Imported from manifest: ${title}`,
    }
  }
  return {
    title: 'Imported Match',
    tournament: 'Unknown',
    format: 'ODI',
    matchDate: new Date(),
    venue: 'Unknown',
    notes: `Imported from manifest: ${title}`,
  }
}

function parseDate(dateStr: string): Date {
  // "13th December 2025" or "13 December 2025"
  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1')
  return new Date(cleaned)
}

function parseManifestRow(row: (string | number)[], headers: string[]): any | null {
  const sNo = parseInt(row[0]?.toString() || '0')
  if (isNaN(sNo)) return null

  const standName = row[2]?.toString().trim() || ''
  if (!standName) return null

  const zone = row[1]?.toString().trim() || undefined
  const gateNo = row[3]?.toString().trim() || ''
  const typeOfStand = row[4]?.toString().trim() || ''
  const basePrice = parseFloat(row[5]?.toString() || '0')
  const cgst = parseFloat(row[6]?.toString() || '0')
  const sgst = parseFloat(row[7]?.toString() || '0')
  const ticketPrice = parseFloat(row[8]?.toString() || '0')
  const stadiumCapacity = parseInt(row[9]?.toString() || '0')
  const amount = parseFloat(row[10]?.toString() || '0')
  const acaComp = parseInt(row[11]?.toString() || '0')
  const forSale = parseInt(row[12]?.toString() || '0')
  const forSaleAmount = parseFloat(row[13]?.toString() || '0')
  const acaBlockForSale = parseInt(row[14]?.toString() || '0')
  const acaSaleTotalAmount = parseFloat(row[15]?.toString() || '0')
  const phase1ForSale = parseInt(row[16]?.toString() || '0')
  const phase1SaleTotalAmount = parseFloat(row[17]?.toString() || '0')
  const phase2ForSale = parseInt(row[18]?.toString() || '0')
  const phase2SaleTotalAmount = parseFloat(row[19]?.toString() || '0')
  const phase3ForSale = parseInt(row[20]?.toString() || '0')
  const phase3SaleTotalAmount = parseFloat(row[21]?.toString() || '0')

  // Determine category from typeOfStand
  const category = mapStandTypeToCategory(typeOfStand)

  return {
    sNo,
    zone,
    standName,
    gateNo,
    typeOfStand,
    basePrice,
    cgst,
    sgst,
    ticketPrice,
    stadiumCapacity,
    amount,
    acaComp,
    forSale,
    forSaleAmount,
    acaBlockForSale,
    acaSaleTotalAmount,
    phase1ForSale,
    phase1SaleTotalAmount,
    phase2ForSale,
    phase2SaleTotalAmount,
    phase3ForSale,
    phase3SaleTotalAmount,
    category,
    // For inventory pool
    blockName: extractBlockName(standName),
    availableQuantity: forSale,
    totalQuantity: stadiumCapacity,
    reservedQuantity: acaComp,
    faceValue: ticketPrice,
    pricingCategory: typeOfStand,
  }
}

function mapStandTypeToCategory(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('premium hospitality') || t.includes('vip') || t.includes('lounge') || t.includes('suite') || t.includes('box')) {
    return 'VIP'
  }
  if (t.includes('hospitality') || t.includes('meal box') || t.includes('snacks box')) {
    return 'PREMIUM'
  }
  if (t.includes('general')) {
    // Further categorize by stand name
    return 'GENERAL'
  }
  return 'GENERAL'
}

function getPricingTier(type: string): number {
  const t = type.toLowerCase()
  if (t.includes('premium hospitality') || t.includes('vip') || t.includes('lounge') || t.includes('suite') || t.includes('box')) {
    return 1
  }
  if (t.includes('hospitality') || t.includes('meal box') || t.includes('snacks box')) {
    return 2
  }
  return 3
}

function extractBlockName(standName: string): string {
  // Extract block identifier from stand name
  const match = standName.match(/([A-Z]-?stand|[A-Z]\d?-?stand|Suite \d+-\d+|Corp Box \d+-\d+|ACA Lounge|BCCI Lounge|North Lounge|West Lounge \d|VDCA Box)/i)
  return match ? match[1] : standName
}

export async function importManifestToDatabase(filePath: string, userId: string) {
  const parsed = await parseManifestFile(filePath)

  // Create or find match
  let match = await prisma.match.findFirst({
    where: {
      title: parsed.match.title,
      matchDate: parsed.match.matchDate,
    }
  })

  if (!match) {
    match = await prisma.match.create({
      data: {
        title: parsed.match.title,
        tournament: parsed.match.tournament,
        format: parsed.match.format,
        matchDate: parsed.match.matchDate,
        startTime: '13:30',
        venueId: await getOrCreateVenue(parsed.match.venue),
        status: 'UPCOMING',
        matchAdminId: userId,
        totalInventory: parsed.inventoryPools.reduce((sum, p) => sum + p.stadiumCapacity, 0),
        notes: parsed.match.notes,
      }
    })
  }

  // Create ticket categories
  const categoryMap = new Map<string, string>()
  for (const cat of parsed.categories) {
    const existing = await prisma.ticketCategory.findUnique({
      where: { matchId_name: { matchId: match.id, name: cat.name } }
    })
    if (existing) {
      categoryMap.set(cat.name, existing.id)
    } else {
      const created = await prisma.ticketCategory.create({
        data: {
          matchId: match.id,
          name: cat.name,
          displayName: cat.displayName,
          pricingTier: cat.pricingTier,
          sortOrder: cat.pricingTier,
        }
      })
      categoryMap.set(cat.name, created.id)
    }
  }

  // Create inventory pools
  for (const pool of parsed.inventoryPools) {
    const categoryId = categoryMap.get(pool.category)
    if (!categoryId) continue

    await prisma.inventoryPool.upsert({
      where: {
        id: `inv-${match.id}-${categoryId}-${pool.standName}-${pool.blockName}`.replace(/[^a-zA-Z0-9-]/g, '-')
      },
      update: {},
      create: {
        id: `inv-${match.id}-${categoryId}-${pool.standName}-${pool.blockName}`.replace(/[^a-zA-Z0-9-]/g, '-'),
        matchId: match.id,
        ticketCategoryId: categoryId,
        standName: pool.zone || pool.standName,
        blockName: pool.blockName,
        gateName: pool.gateNo,
        ticketFormat: 'PHYSICAL',
        faceValue: pool.faceValue,
        pricingCategory: pool.pricingCategory,
        totalQuantity: pool.totalQuantity,
        reservedQuantity: pool.reservedQuantity,
        availableQuantity: pool.availableQuantity,
        notes: `Zone: ${pool.zone || 'N/A'}, Type: ${pool.typeOfStand}, Phased sales: P1=${pool.phase1ForSale}, P2=${pool.phase2ForSale}, P3=${pool.phase3ForSale}`,
      }
    })
  }

  return { matchId: match.id, inventoryCount: parsed.inventoryPools.length }
}

async function getOrCreateVenue(venueName: string): Promise<string> {
  let venue = await prisma.venue.findFirst({
    where: { name: { contains: venueName.split(' ')[0] } }
  })
  if (!venue) {
    venue = await prisma.venue.create({
      data: {
        name: venueName,
        shortName: venueName.split(' ').slice(0, 2).join(' '),
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        country: 'India',
      }
    })
  }
  return venue.id
}