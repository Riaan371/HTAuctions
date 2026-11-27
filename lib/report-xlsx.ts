// Builds the auction report as a properly formatted Excel workbook (with the HT Auctions logo),
// ready to print on A4 landscape. Runs in the browser; the Excel library is loaded only when needed.
import { Image } from 'react-native';

export type ReportLot = { no: number; title: string; opening: number; reserve: number | null; bidCount: number; roomCount: number; top: number | null; topSource: string; topName: string; result: string; price: number | null; buyer: string; cell: string; email: string };
export type ReportBuyer = { name: string; cell: string; email: string; lots: string; count: number; total: number };
export type ReportBid = { time: string; lot: number; lotTitle: string; source: string; bidder: string; cell: string; amount: number };
export type ReportData = {
  title: string; when: string; status: string;
  stats: { lots: number; soldOnline: number; onlineTotal: number; soldRoom: number; roomTotal: number; noSale: number; notClosed: number; bidders: number; bids: number; roomBids: number };
  lots: ReportLot[]; buyers: ReportBuyer[]; bids: ReportBid[];
};

const NAVY = 'FF17293D';
const ORANGE = 'FFE8742C';
const BAND = 'FFF4F8F7';
const LINE = 'FFD3E2E0';
const GREY = 'FF456070';
const RAND = '"R" #,##0';

const thin = { style: 'thin' as const, color: { argb: LINE } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

async function loadLogo(wb: any): Promise<number | null> {
  const sources: string[] = ['/report-logo.png'];
  try {
    const src: any = Image.resolveAssetSource(require('../assets/logo.png'));
    if (src?.uri) sources.push(src.uri);
  } catch {}
  for (const uri of sources) {
    try {
      const res = await fetch(uri);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      return wb.addImage({ buffer, extension: 'png' });
    } catch {}
  }
  return null; // the report is still created, just without the logo
}

// Sheet with the logo, titles and an orange band; returns the sheet and the first usable row.
function makeSheet(wb: any, logoId: number | null, name: string, subtitle: string, widths: number[], d: ReportData) {
  const ws = wb.addWorksheet(name, {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });
  ws.columns = widths.map((w) => ({ width: w }));
  const last = widths.length;

  // Logo sits at the left; titles start in the first column to the right of it.
  let px = 0, titleCol = 1;
  for (let i = 0; i < widths.length; i++) { px += widths[i] * 7 + 5; if (px >= 110) { titleCol = i + 2; break; } }
  if (titleCol > last) titleCol = Math.min(last, 2);

  for (let r = 1; r <= 4; r++) ws.getRow(r).height = 24;
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 92, height: 92 } });

  const put = (row: number, text: string, font: any) => {
    if (titleCol < last) ws.mergeCells(row, titleCol, row, last); // a one-column range cannot be merged; the text just overflows
    const c = ws.getCell(row, titleCol);
    c.value = text; c.font = font; c.alignment = { vertical: 'middle', horizontal: 'left' };
  };
  put(1, 'HT Auctions West Coast', { name: 'Calibri', size: 20, bold: true, color: { argb: NAVY } });
  put(2, subtitle, { name: 'Calibri', size: 14, bold: true, color: { argb: ORANGE } });
  put(3, `${d.title}  ·  ${d.when}  ·  ${d.status}`, { name: 'Calibri', size: 11, color: { argb: NAVY } });
  put(4, `Generated ${new Date().toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short' })}`, { name: 'Calibri', size: 10, italic: true, color: { argb: GREY } });

  ws.getRow(5).height = 5;
  for (let c = 1; c <= last; c++) ws.getCell(5, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
  ws.getRow(6).height = 10;

  ws.headerFooter.oddFooter = '&L&"Calibri,Italic"&9HT Auctions West Coast&C&9Page &P of &N&R&9&D';
  return { ws, headerRow: 7 };
}

type Col = { header: string; fmt?: string; align?: 'left' | 'center' | 'right'; wrap?: boolean };

function writeTable(ws: any, headerRow: number, cols: Col[], rows: any[][], widths: number[], colorize?: (row: any[], colIdx: number) => { fill?: string; font?: string } | null) {
  const hr = ws.getRow(headerRow);
  hr.height = 32;
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left', wrapText: true };
    cell.border = border;
  });

  rows.forEach((vals, ri) => {
    const row = ws.getRow(headerRow + 1 + ri);
    let lines = 1;
    vals.forEach((v, ci) => {
      const col = cols[ci];
      const cell = row.getCell(ci + 1);
      cell.value = v === '' || v === undefined ? null : v;
      if (col.fmt && typeof v === 'number') cell.numFmt = col.fmt;
      cell.font = { name: 'Calibri', size: 11, color: { argb: NAVY } };
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? 'left', wrapText: col.wrap ?? false };
      cell.border = border;
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      const tint = colorize?.(vals, ci);
      if (tint?.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint.fill } };
      if (tint?.font) cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: tint.font } };
      if (col.wrap && typeof v === 'string') lines = Math.max(lines, Math.ceil(v.length / Math.max(widths[ci] - 1, 4)));
    });
    row.height = Math.max(22, lines * 15 + 6);
  });

  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols.length } };
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  return headerRow + rows.length; // last data row
}

function totalRow(ws: any, rowNo: number, labelCol: number, label: string, sumCol: number, firstRow: number, lastRow: number, fmt: string, colCount: number) {
  const row = ws.getRow(rowNo);
  row.height = 26;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF0E6' } };
    cell.border = { top: { style: 'medium', color: { argb: ORANGE } }, bottom: thin, left: thin, right: thin };
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } };
    cell.alignment = { vertical: 'middle' };
  }
  row.getCell(labelCol).value = label;
  const letter = String.fromCharCode(64 + sumCol);
  const sumCell = row.getCell(sumCol);
  sumCell.value = { formula: `SUM(${letter}${firstRow}:${letter}${lastRow})` };
  sumCell.numFmt = fmt;
  sumCell.alignment = { vertical: 'middle', horizontal: 'right' };
}

export async function downloadAuctionXlsx(d: ReportData) {
  // @ts-ignore: browser build of the Excel library (loaded only when the button is pressed)
  const mod: any = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HT Auctions West Coast';
  wb.created = new Date();
  const logoId = await loadLogo(wb);

  // ---------- Summary ----------
  {
    const widths = [8, 40, 28];
    const { ws, headerRow } = makeSheet(wb, logoId, 'Summary', 'Auction report', widths, d);
    const rows: any[][] = [
      ['', 'Lots in the auction', d.stats.lots],
      ['', 'Sold online', d.stats.soldOnline],
      ['', 'Online sales total (hammer price)', d.stats.onlineTotal],
      ['', 'Sold in the room', d.stats.soldRoom],
      ['', 'Room sales total (hammer price)', d.stats.roomTotal],
      ['', 'TOTAL SALES (online + room)', d.stats.onlineTotal + d.stats.roomTotal],
      ['', 'No sale', d.stats.noSale],
      ['', 'Not yet closed', d.stats.notClosed],
      ['', 'Online bidders', d.stats.bidders],
      ['', 'Online bids placed', d.stats.bids],
      ['', 'Room bids recorded', d.stats.roomBids],
    ];
    const moneyRows = new Set([3, 5, 6]); // 1-based position of the rand rows above
    const cols: Col[] = [{ header: '' }, { header: 'Key figure' }, { header: 'Value', align: 'right', fmt: RAND }];
    const lastRow = writeTable(ws, headerRow, cols, rows, widths);
    // only the money row uses the rand format
    for (let r = headerRow + 1; r <= lastRow; r++) {
      const c = ws.getCell(r, 3);
      c.numFmt = moneyRows.has(r - headerRow) ? RAND : '0';
      c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } };
      ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      ws.getCell(r, 1).border = {};
    }
    ws.getCell(headerRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    ws.getCell(headerRow, 1).border = {};
    ws.autoFilter = undefined;
    ws.mergeCells(lastRow + 2, 2, lastRow + 2, 3);
    const note = ws.getCell(lastRow + 2, 2);
    note.value = 'Room sales use the highest room bid entered by the auctioneer. Buyers in the room have no account, so no name is shown.';
    note.font = { name: 'Calibri', size: 10, italic: true, color: { argb: GREY } };
    note.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(lastRow + 2).height = 30;
  }

  // ---------- Lots ----------
  {
    const widths = [7, 36, 15, 15, 9, 9, 17, 13, 18, 15, 24, 16, 30];
    const { ws, headerRow } = makeSheet(wb, logoId, 'Lots', 'Result of every lot', widths, d);
    const cols: Col[] = [
      { header: 'Lot', align: 'center' }, { header: 'Description', wrap: true },
      { header: 'Opening bid', fmt: RAND, align: 'right' }, { header: 'Reserve', fmt: RAND, align: 'right' },
      { header: 'Online bids', align: 'center' }, { header: 'Room bids', align: 'center' },
      { header: 'Highest bid', fmt: RAND, align: 'right' }, { header: 'Highest was', align: 'center' },
      { header: 'Result', align: 'center' }, { header: 'Sold price', fmt: RAND, align: 'right' },
      { header: 'Buyer', wrap: true }, { header: 'Cell', wrap: true }, { header: 'Email', wrap: true },
    ];
    const rows = d.lots.map((l) => [l.no, l.title, l.opening, l.reserve ?? '', l.bidCount, l.roomCount, l.top ?? '', l.topSource, l.result, l.price ?? '', l.buyer, l.cell, l.email]);
    const lastRow = writeTable(ws, headerRow, cols, rows, widths, (row, ci) => {
      if (ci === 7) {
        if (row[7] === 'Room') return { fill: 'FF17293D', font: 'FFFFFFFF' };
        if (row[7] === 'Online') return { fill: 'FFFFD9BC', font: NAVY };
        return null;
      }
      if (ci !== 8) return null;
      switch (row[8]) {
        case 'Sold online': return { fill: 'FFE2F4EA', font: 'FF146C43' };
        case 'Sold in the room': return { fill: 'FFE2F4EA', font: 'FF146C43' };
        case 'No sale': return { fill: 'FFEEF3F2', font: GREY };
        default: return { fill: 'FFFDF0E6', font: 'FFB8500F' };
      }
    });
    if (rows.length) totalRow(ws, lastRow + 1, 2, 'Total sales (online + room)', 10, headerRow + 1, lastRow, RAND, cols.length);
  }

  // ---------- Online buyers ----------
  {
    const widths = [30, 16, 32, 52, 10, 18];
    const { ws, headerRow } = makeSheet(wb, logoId, 'Online buyers', 'Who bought what online', widths, d);
    const cols: Col[] = [
      { header: 'Buyer', wrap: true }, { header: 'Cell', wrap: true }, { header: 'Email', wrap: true },
      { header: 'Lots won', wrap: true }, { header: 'Lots', align: 'center' }, { header: 'Amount owed (hammer price)', fmt: RAND, align: 'right' },
    ];
    const rows = d.buyers.map((b) => [b.name, b.cell, b.email, b.lots, b.count, b.total]);
    if (rows.length === 0) rows.push(['No lots were sold to online bidders.', '', '', '', '', '']);
    const lastRow = writeTable(ws, headerRow, cols, rows, widths);
    if (d.buyers.length) totalRow(ws, lastRow + 1, 1, 'Total', 6, headerRow + 1, lastRow, RAND, cols.length);
  }

  // ---------- Bid log ----------
  {
    const widths = [22, 7, 34, 11, 28, 16, 16];
    const { ws, headerRow } = makeSheet(wb, logoId, 'Bid log', 'Every bid, online and in the room', widths, d);
    const cols: Col[] = [
      { header: 'Time' }, { header: 'Lot', align: 'center' }, { header: 'Description', wrap: true }, { header: 'Source', align: 'center' },
      { header: 'Bidder', wrap: true }, { header: 'Cell', wrap: true }, { header: 'Amount', fmt: RAND, align: 'right' },
    ];
    const rows = d.bids.map((b) => [b.time, b.lot, b.lotTitle, b.source, b.bidder, b.cell, b.amount]);
    if (rows.length === 0) rows.push(['No bids.', '', '', '', '', '', '']);
    writeTable(ws, headerRow, cols, rows, widths, (row, ci) => {
      if (ci !== 3) return null;
      if (row[3] === 'Room') return { fill: 'FF17293D', font: 'FFFFFFFF' };
      if (row[3] === 'Online') return { fill: 'FFFFD9BC', font: NAVY };
      return null;
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HT-Auctions-report-${d.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'auction'}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
