import ExcelJS from 'exceljs'
import { ApiError } from '@/lib/api'

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
export const MAX_PARSED_ROWS = 1000
export const MAX_IMPORTED_ROWS = 500

export type ImportType = 'REQUESTERS' | 'INVENTORY' | 'QUOTAS' | 'REQUESTS'
export type ParsedCell = string | number | boolean | Date | null
export type ParsedRow = Record<string, string>

export const IMPORT_TYPES: readonly ImportType[] = ['REQUESTERS', 'INVENTORY', 'QUOTAS', 'REQUESTS']

const templateHeaders: Record<ImportType, string[]> = {
  REQUESTERS: ['Full Name', 'Mobile Number', 'Email', 'Designation', 'Organisation', 'Category', 'Protocol Level', 'Preferred Contact'],
  INVENTORY: ['Match Title', 'Ticket Category', 'Stand Name', 'Block Name', 'Gate Name', 'Ticket Format', 'Face Value', 'Total Quantity', 'Notes'],
  QUOTAS: ['Match Title', 'Quota Name', 'Display Name', 'Ticket Category', 'Allocated Quantity', 'Description'],
  REQUESTS: ['Requester Mobile', 'Requester Name', 'Match Title', 'Ticket Category', 'Requested Quantity', 'Source', 'Priority', 'Notes'],
}

export function requiredHeaders(type: ImportType): string[] {
  return [...templateHeaders[type]]
}

export function cellText(value: ParsedCell): string {
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function assertHeaders(headers: string[], type: ImportType): void {
  if (new Set(headers).size !== headers.length) throw new ApiError(400, 'Duplicate column headers are not supported')
  const required = templateHeaders[type]
  const missing = required.filter((header) => !headers.includes(header))
  if (missing.length) throw new ApiError(400, `Missing required headers: ${missing.join(', ')}`)
}

export function parseCsvText(text: string): ParsedCell[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: ParsedCell[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1 } else quoted = false
      } else cell += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
    } else cell += character
  }
  if (quoted) throw new ApiError(400, 'CSV contains an unterminated quoted field')
  row.push(cell)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  return rows
}

function parseCell(value: ExcelJS.CellValue): ParsedCell {
  if (typeof value === 'object' && value !== null) {
    if ('richText' in value) return value.richText.map((part) => part.text).join('')
    if ('text' in value) return value.text
    if ('result' in value) return parseCell(value.result)
    return null
  }
  return value ?? null
}

async function parseWorksheet(buffer: Buffer): Promise<ParsedCell[][]> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  } catch {
    throw new ApiError(400, 'The XLSX file could not be parsed')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new ApiError(400, 'The workbook does not contain a worksheet')
  return sheet.getSheetValues().map((row) => Array.isArray(row) ? row.map(parseCell) : [])
}

export async function parseImportFile(buffer: Buffer, extension: 'csv' | 'xlsx', type: ImportType): Promise<ParsedRow[]> {
  const matrix = extension === 'csv' ? parseCsvText(buffer.toString('utf8')) : await parseWorksheet(buffer)
  if (matrix.length < 2) throw new ApiError(400, 'The import file must contain a header row and at least one data row')
  const headers = (matrix[0] || []).map(cellText)
  assertHeaders(headers, type)
  if (matrix.length - 1 > MAX_PARSED_ROWS) throw new ApiError(400, `Imports are limited to ${MAX_PARSED_ROWS} data rows`)
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, cellText(values[index] ?? null)])))
}
