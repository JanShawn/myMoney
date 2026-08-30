const headers = [
  ['date', '日期'], ['verifiedAt', '驗算時間'], ['totalAssets', '總資產'],
  ['totalLiabilities', '總負債'], ['netWorth', '淨資產'], ['availableCash', '可動用現金'],
  ['totalStocks', '總股票'], ['stockRatio', '股票占比'], ['totalBonds', '總債券'],
  ['bondRatio', '債券占比'], ['totalCash', '總現金'], ['totalForeign', '外幣資產'], ['taiex', '加權指數'],
  ['ma240', '240MA'], ['note', '備註']
]

async function loadExcelJS() {
  const excelModule = await import('exceljs')
  return excelModule.default || excelModule
}

export async function exportSnapshotsToExcel(snapshots) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('資產快照', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = headers.map(([key, header]) => ({ key, header, width: key === 'note' ? 32 : 16 }))
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  snapshots.forEach((snapshot) => sheet.addRow({
    ...snapshot,
    availableCash: snapshot.availableCash ?? (Number(snapshot.totalCash || 0) + Number(snapshot.totalForeign || 0))
  }))
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    for (const col of [3, 4, 5, 6, 7, 9, 11]) sheet.getRow(row).getCell(col).numFmt = '#,##0.00'
    for (const col of [8, 10]) sheet.getRow(row).getCell(col).numFmt = '0.00%'
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `myMoney-snapshots-${new Date().toISOString().slice(0, 10)}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
