import { toCsv, formatCampusDateTime } from "@/lib/utils/format";
import { verificationMethodLabel } from "@/lib/registration/format";

export type EntryExitCsvRow = {
  timestamp: string;
  roll_number: string | null;
  name: string;
  role: string;
  batch: string | null;
  section: string | null;
  action: string;
  gate: string;
  recorded_by: string | null;
  verification_method: string;
};

const COLUMNS = [
  "Timestamp",
  "Roll Number",
  "Name",
  "Role",
  "Batch",
  "Section",
  "Action",
  "Gate",
  "Recorded By",
  "Verification Method",
] as const;

export function generateEntryExitCSV(rows: EntryExitCsvRow[]) {
  const lines: Array<Array<string | number | boolean | null | undefined>> = [
    [...COLUMNS],
    ...rows.map((row) => [
      formatCampusDateTime(row.timestamp),
      row.roll_number,
      row.name,
      row.role,
      row.batch,
      row.section,
      row.action,
      row.gate,
      row.recorded_by,
      verificationMethodLabel(row.verification_method),
    ]),
  ];

  return toCsv(lines);
}
