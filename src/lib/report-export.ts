export interface ReportCategoryExport {
  name: string
  requested: number
  approved: number
  allocated: number
  issued: number
  available: number
}

export interface ReportExportData {
  generatedAt: string
  matchTitle: string
  summary: Record<string, string | number>
  categories: ReportCategoryExport[]
}

function csvCell(value: string | number): string {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function reportToCsv(data: ReportExportData): string {
  const rows: (string | number)[][] = [
    ['ACA TicketOps', 'Operational report'],
    ['Match', data.matchTitle],
    ['Generated', data.generatedAt],
    [],
    ['Metric', 'Value'],
    ...Object.entries(data.summary),
    [],
    ['Category', 'Requested', 'Approved', 'Allocated', 'Issued', 'Available'],
    ...data.categories.map((category) => [category.name, category.requested, category.approved, category.allocated, category.issued, category.available]),
  ]
  return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function downloadReport(data: ReportExportData, format: 'csv' | 'xlsx'): void {
  const filename = `aca-ticketops-report-${new Date().toISOString().slice(0, 10)}.${format}`
  if (format === 'csv') {
    const blob = new Blob([reportToCsv(data)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    return
  }
  void import('exceljs').then(async ({ default: ExcelJS }) => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Operations')
    sheet.columns = [
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Value', key: 'value', width: 22 },
    ]
    sheet.addRows(Object.entries(data.summary).map(([metric, value]) => ({ metric, value })))
    const categories = workbook.addWorksheet('Categories')
    categories.columns = [
      { header: 'Category', key: 'name', width: 28 },
      { header: 'Requested', key: 'requested', width: 14 },
      { header: 'Approved', key: 'approved', width: 14 },
      { header: 'Allocated', key: 'allocated', width: 14 },
      { header: 'Issued', key: 'issued', width: 14 },
      { header: 'Available', key: 'available', width: 14 },
    ]
    categories.addRows(data.categories)
    for (const current of [sheet, categories]) {
      current.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      current.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }
    }
    const buffer = await workbook.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  })
}
