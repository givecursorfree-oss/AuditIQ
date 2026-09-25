import ExcelJS from 'exceljs';

/** Seven client blocks, matching the firm Time Sheet workbook (one row per person per day). */
export const TIMESHEET_CLIENT_SLOTS = 7;

export const TIMESHEET_EXCEL_HEADERS = [
  'Timestamp',
  'Email',
  'Name',
  'Designation',
  'Client Name',
  'Activity Classification',
  'Manager/Partner',
  'Client Name (2)',
  'Activity Classification (2)',
  'Manager/Partner (2)',
  'Client Name (3)',
  'Activity Classification (3)',
  'Manager/Partner (3)',
  'Client Name (4)',
  'Activity Classification (4)',
  'Manager/Partner (4)',
  'Client Name (5)',
  'Activity Classification (5)',
  'Manager/Partner (5)',
  'Client Name (6)',
  'Activity Classification (6)',
  'Manager/Partner (6)',
  'Client Name (7)',
  'Activity Classification (7)',
  'Manager/Partner (7)',
  'Time Spent',
  'Details of Work Performed',
  'Comp off',
] as const;

export type TimesheetLine = {
  clientName: string;
  activity: string;
  manager: string;
};

export type TimesheetDayRow = {
  timestamp: string;
  email: string;
  name: string;
  designation: string;
  lines: TimesheetLine[];
  hours: number;
  details: string;
  compOff: boolean;
};

export type TimesheetSourceEntry = {
  userId: string;
  dateKey: string;
  email: string;
  staffName: string;
  designation: string;
  clientName: string;
  activity: string;
  manager: string;
  hours: number;
  details: string;
  compOff: boolean;
};

export function groupTimesheetDays(entries: TimesheetSourceEntry[]): TimesheetDayRow[] {
  const byKey = new Map<string, TimesheetDayRow>();
  for (const entry of entries) {
    const key = `${entry.userId}|${entry.dateKey}`;
    let day = byKey.get(key);
    if (!day) {
      day = {
        timestamp: entry.dateKey,
        email: entry.email,
        name: entry.staffName,
        designation: entry.designation,
        lines: [],
        hours: 0,
        details: '',
        compOff: false,
      };
      byKey.set(key, day);
    }
    day.hours += entry.hours;
    day.compOff = day.compOff || entry.compOff;
    const detail = entry.details.trim();
    if (detail) day.details = day.details ? `${day.details}; ${detail}` : detail;
    if (entry.clientName || entry.activity || entry.manager) {
      day.lines.push({
        clientName: entry.clientName,
        activity: entry.activity,
        manager: entry.manager,
      });
    }
  }
  return Array.from(byKey.values())
    .map((day) => ({ ...day, hours: Math.round(day.hours * 100) / 100 }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.name.localeCompare(b.name));
}

function dayCells(day: TimesheetDayRow, lineOffset: number): (string | number)[] {
  const slice = day.lines.slice(lineOffset, lineOffset + TIMESHEET_CLIENT_SLOTS);
  const cells: (string | number)[] = [day.timestamp, day.email, day.name, day.designation];
  for (let i = 0; i < TIMESHEET_CLIENT_SLOTS; i++) {
    const line = slice[i];
    cells.push(line?.clientName ?? '', line?.activity ?? '', line?.manager ?? '');
  }
  if (lineOffset === 0) {
    cells.push(day.hours, day.details, day.compOff ? 'Yes' : 'No');
  } else {
    cells.push('', '', '');
  }
  return cells;
}

/** Wide rows. More than 7 clients on a day continue on the next row. */
export function expandTimesheetDays(days: TimesheetDayRow[]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const day of days) {
    const chunks = Math.max(1, Math.ceil(day.lines.length / TIMESHEET_CLIENT_SLOTS));
    for (let chunk = 0; chunk < chunks; chunk++) {
      rows.push(dayCells(day, chunk * TIMESHEET_CLIENT_SLOTS));
    }
  }
  return rows;
}

export async function timesheetWorkbookBuffer(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Timesheet');
  const header = ws.addRow([...TIMESHEET_EXCEL_HEADERS]);
  header.font = { bold: true };
  for (const row of rows) ws.addRow(row);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns.forEach((col) => {
    col.width = 22;
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
