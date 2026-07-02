export function formatDateDMY(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function parseNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

const blueHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
const advanceHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } };
const balanceHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4B084' } };
const onlineHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const whiteFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const darkFont = { bold: true, size: 10 };
const thinBorder = {
  top: { style: 'thin' }, left: { style: 'thin' },
  bottom: { style: 'thin' }, right: { style: 'thin' },
};

function styleCell(cell, { fill, font = darkFont }) {
  cell.font = font;
  cell.fill = fill;
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = thinBorder;
}

function setHeader(sheet, cellRef, text, fill, font = whiteFont) {
  const cell = sheet.getCell(cellRef);
  cell.value = text;
  styleCell(cell, { fill, font });
}

function writeDataRows(sheet, rows, mapRow, colCount, startRow = 3) {
  rows.forEach((r, idx) => {
    const row = sheet.getRow(startRow + idx);
    const data = mapRow(r);
    data.forEach((val, i) => {
      const cell = row.getCell(i + 1);
      cell.value = val;
      cell.border = thinBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (i === data.length - 2 && r.status === 'CLOSED') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      }
      if (i === 6 && r.advance_cash > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      }
    });
    if (idx % 2 === 1) {
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        if (!cell.fill || cell.fill.pattern !== 'solid') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
        }
      }
    }
  });
}

export function buildTurfSheet(sheet, rows) {
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;

  setHeader(sheet, 'A1', 'NAME', blueHeader);
  setHeader(sheet, 'B1', 'TRUF', blueHeader);
  setHeader(sheet, 'C1', 'MATCH DATE', blueHeader);
  setHeader(sheet, 'D1', 'TOTAL', blueHeader);
  setHeader(sheet, 'E1', 'TIME', blueHeader);
  setHeader(sheet, 'F1', 'ADVANCE PAID', advanceHeader, darkFont);
  setHeader(sheet, 'G1', '', advanceHeader, darkFont);
  setHeader(sheet, 'H1', '', advanceHeader, darkFont);
  setHeader(sheet, 'I1', 'BALANCE PAID', balanceHeader, darkFont);
  setHeader(sheet, 'J1', '', balanceHeader, darkFont);
  setHeader(sheet, 'K1', '', balanceHeader, darkFont);
  setHeader(sheet, 'L1', 'STATUS', blueHeader);
  setHeader(sheet, 'M1', 'REMARKS', blueHeader);

  setHeader(sheet, 'F2', 'GPAY', advanceHeader, darkFont);
  setHeader(sheet, 'G2', 'CASH', advanceHeader, darkFont);
  setHeader(sheet, 'H2', 'DATE', advanceHeader, darkFont);
  setHeader(sheet, 'I2', 'GPAY', balanceHeader, darkFont);
  setHeader(sheet, 'J2', 'CASH', balanceHeader, darkFont);
  setHeader(sheet, 'K2', 'DATE', balanceHeader, darkFont);

  sheet.mergeCells('A1:A2');
  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:C2');
  sheet.mergeCells('D1:D2');
  sheet.mergeCells('E1:E2');
  sheet.mergeCells('F1:H1');
  sheet.mergeCells('I1:K1');
  sheet.mergeCells('L1:L2');
  sheet.mergeCells('M1:M2');

  sheet.columns = [
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 10 },
    { width: 18 }, { width: 10 }, { width: 10 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 20 },
  ];

  writeDataRows(sheet, rows, (r) => [
    r.name, r.sport, r.is_bulk_payment ? '' : formatDateDMY(r.match_date), r.total, r.time_slot,
    r.advance_gpay || '', r.advance_cash || '', formatDateDMY(r.advance_date),
    r.balance_gpay || '', r.balance_cash || '', formatDateDMY(r.balance_date),
    r.status, r.remarks || '',
  ], 13);
}

export function buildOnlineSheet(sheet, rows) {
  buildTurfSheet(sheet, rows);
}

const periodLabel = (p) => ({
  full: 'Full Month',
  first_half: '1st Half',
  second_half: '2nd Half',
}[p] || p);

function formatCoachingMonth(yyyyMm) {
  if (!yyyyMm) return '';
  const [y, m] = yyyyMm.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1] || m} ${y}`;
}

export function buildFootballCoachingSheet(sheet, rows) {
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;

  setHeader(sheet, 'A1', 'CHILD', blueHeader);
  setHeader(sheet, 'B1', 'PARENT', blueHeader);
  setHeader(sheet, 'C1', 'PHONE', blueHeader);
  setHeader(sheet, 'D1', 'MONTH', blueHeader);
  setHeader(sheet, 'E1', 'PERIOD', blueHeader);
  setHeader(sheet, 'F1', 'TOTAL', blueHeader);
  setHeader(sheet, 'G1', 'ADVANCE PAID', advanceHeader, darkFont);
  setHeader(sheet, 'H1', '', advanceHeader, darkFont);
  setHeader(sheet, 'I1', '', advanceHeader, darkFont);
  setHeader(sheet, 'J1', 'BALANCE PAID', balanceHeader, darkFont);
  setHeader(sheet, 'K1', '', balanceHeader, darkFont);
  setHeader(sheet, 'L1', '', balanceHeader, darkFont);
  setHeader(sheet, 'M1', 'STATUS', blueHeader);
  setHeader(sheet, 'N1', 'REMARKS', blueHeader);

  setHeader(sheet, 'G2', 'GPAY', advanceHeader, darkFont);
  setHeader(sheet, 'H2', 'CASH', advanceHeader, darkFont);
  setHeader(sheet, 'I2', 'DATE', advanceHeader, darkFont);
  setHeader(sheet, 'J2', 'GPAY', balanceHeader, darkFont);
  setHeader(sheet, 'K2', 'CASH', balanceHeader, darkFont);
  setHeader(sheet, 'L2', 'DATE', balanceHeader, darkFont);

  sheet.mergeCells('A1:A2');
  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:C2');
  sheet.mergeCells('D1:D2');
  sheet.mergeCells('E1:E2');
  sheet.mergeCells('F1:F2');
  sheet.mergeCells('G1:I1');
  sheet.mergeCells('J1:L1');
  sheet.mergeCells('M1:M2');
  sheet.mergeCells('N1:N2');

  sheet.columns = [
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 20 },
  ];

  writeDataRows(sheet, rows, (r) => [
    r.name, r.parent_name || '', r.phone || '', formatCoachingMonth(r.coaching_month), periodLabel(r.period), r.total,
    r.advance_gpay || '', r.advance_cash || '', formatDateDMY(r.advance_date),
    r.balance_gpay || '', r.balance_cash || '', formatDateDMY(r.balance_date),
    r.status, r.remarks || '',
  ], 14);
}

export function buildGymSheet(sheet, rows) {
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 22;

  setHeader(sheet, 'A1', 'NAME', blueHeader);
  setHeader(sheet, 'B1', 'PLAN', blueHeader);
  setHeader(sheet, 'C1', 'START DATE', blueHeader);
  setHeader(sheet, 'D1', 'END DATE', blueHeader);
  setHeader(sheet, 'E1', 'TOTAL', blueHeader);
  setHeader(sheet, 'F1', 'PT AMOUNT', blueHeader);
  setHeader(sheet, 'G1', 'ADVANCE PAID', advanceHeader, darkFont);
  setHeader(sheet, 'H1', '', advanceHeader, darkFont);
  setHeader(sheet, 'I1', '', advanceHeader, darkFont);
  setHeader(sheet, 'J1', 'BALANCE PAID', balanceHeader, darkFont);
  setHeader(sheet, 'K1', '', balanceHeader, darkFont);
  setHeader(sheet, 'L1', '', balanceHeader, darkFont);
  setHeader(sheet, 'M1', 'STATUS', blueHeader);
  setHeader(sheet, 'N1', 'REMARKS', blueHeader);

  setHeader(sheet, 'G2', 'GPAY', advanceHeader, darkFont);
  setHeader(sheet, 'H2', 'CASH', advanceHeader, darkFont);
  setHeader(sheet, 'I2', 'DATE', advanceHeader, darkFont);
  setHeader(sheet, 'J2', 'GPAY', balanceHeader, darkFont);
  setHeader(sheet, 'K2', 'CASH', balanceHeader, darkFont);
  setHeader(sheet, 'L2', 'DATE', balanceHeader, darkFont);

  sheet.mergeCells('A1:A2');
  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:C2');
  sheet.mergeCells('D1:D2');
  sheet.mergeCells('E1:E2');
  sheet.mergeCells('F1:F2');
  sheet.mergeCells('G1:I1');
  sheet.mergeCells('J1:L1');
  sheet.mergeCells('M1:M2');
  sheet.mergeCells('N1:N2');

  sheet.columns = [
    { width: 14 }, { width: 10 }, { width: 14 }, { width: 14 },
    { width: 10 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 20 },
  ];

  const planLabel = (m) => ({ 1: '1 Month', 3: '3 Months', 6: '6 Months' }[m] || `${m} Month`);

  writeDataRows(sheet, rows, (r) => [
    r.name, planLabel(r.plan_months), formatDateDMY(r.start_date), formatDateDMY(r.end_date),
    r.total, r.personal_training_amount || '',
    r.advance_gpay || '', r.advance_cash || '', formatDateDMY(r.advance_date),
    r.balance_gpay || '', r.balance_cash || '', formatDateDMY(r.balance_date),
    r.status, r.remarks || '',
  ], 14);
}
