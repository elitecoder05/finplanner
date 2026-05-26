import { google } from "googleapis";
import { env } from "./env";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function auth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_CLIENT_EMAIL,
      private_key: env.GOOGLE_PRIVATE_KEY,
    },
    scopes: SCOPES,
  });
}

export interface Transaction {
  date: string;
  type: "deposit" | "withdrawal";
  amount: number;
  category: string;
  notes: string;
}

export interface Summary {
  month: string;
  total_deposit: number;
  total_withdrawal: number;
  profit: number;
  transactions: number;
}

const TRANSACTIONS_SHEET_NAME = "Transactions";
const MONTHLY_SUMMARY_SHEET_NAME = "Monthly Summary";

function parseSheetAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const normalized = raw
    .toString()
    .toLowerCase()
    .replace(/(inr|rs\.?)/g, "")
    .replace(/[₹,$]/g, "")
    .replace(/\s+/g, "")
    .trim();
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function computeMonthSummary(transactions: Transaction[], month: string): Summary {
  const filtered = transactions.filter((tx) => tx.date.startsWith(month));

  let total_deposit = 0;
  let total_withdrawal = 0;

  for (const tx of filtered) {
    if (tx.type === "deposit") total_deposit += tx.amount;
    else total_withdrawal += tx.amount;
  }

  return {
    month,
    total_deposit,
    total_withdrawal,
    profit: total_deposit - total_withdrawal,
    transactions: filtered.length,
  };
}

async function ensureRequiredSheetsAndHeaders(
  sheets: ReturnType<typeof google.sheets>
): Promise<void> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
  });

  const existingTitles = new Set(
    (metadata.data.sheets || [])
      .map((s) => s.properties?.title)
      .filter((title): title is string => Boolean(title))
  );

  const addRequests: NonNullable<
    google.sheets_v4.Schema$BatchUpdateSpreadsheetRequest["requests"]
  > = [];

  if (!existingTitles.has(TRANSACTIONS_SHEET_NAME)) {
    addRequests.push({ addSheet: { properties: { title: TRANSACTIONS_SHEET_NAME } } });
  }

  if (!existingTitles.has(MONTHLY_SUMMARY_SHEET_NAME)) {
    addRequests.push({ addSheet: { properties: { title: MONTHLY_SUMMARY_SHEET_NAME } } });
  }

  if (addRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      requestBody: { requests: addRequests },
    });
  }

  const headerRanges = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    ranges: [
      `${TRANSACTIONS_SHEET_NAME}!A1:E1`,
      `${MONTHLY_SUMMARY_SHEET_NAME}!A1:F1`,
    ],
  });

  const transactionHeader = headerRanges.data.valueRanges?.[0]?.values?.[0] || [];
  if (transactionHeader.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${TRANSACTIONS_SHEET_NAME}!A1:E1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Date", "Type", "Amount", "Category", "Notes"]],
      },
    });
  }

  const summaryHeader = headerRanges.data.valueRanges?.[1]?.values?.[0] || [];
  if (summaryHeader.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${MONTHLY_SUMMARY_SHEET_NAME}!A1:F1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Month", "Total Deposit", "Total Withdrawal", "Net Profit/Loss", "Transactions", "Last Updated"]],
      },
    });
  }
}

async function upsertMonthlySummaryRow(
  sheets: ReturnType<typeof google.sheets>,
  month: string,
  summary: Summary
): Promise<void> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${MONTHLY_SUMMARY_SHEET_NAME}!A2:F`,
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex((row) => row[0] === month);
  const rowValues = [
    month,
    summary.total_deposit,
    summary.total_withdrawal,
    summary.profit,
    summary.transactions,
    new Date().toISOString(),
  ];

  if (rowIndex >= 0) {
    const targetRowNumber = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `${MONTHLY_SUMMARY_SHEET_NAME}!A${targetRowNumber}:F${targetRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowValues] },
    });
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${MONTHLY_SUMMARY_SHEET_NAME}!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [rowValues] },
  });
}

export async function addTransaction(tx: Transaction): Promise<void> {
  const authClient = await auth().getClient();
  const sheets = google.sheets({ version: "v4", auth: authClient as never });

  await ensureRequiredSheetsAndHeaders(sheets);

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${TRANSACTIONS_SHEET_NAME}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[tx.date, tx.type, tx.amount, tx.category, tx.notes]],
    },
  });

  const month = tx.date.slice(0, 7);
  const allTransactions = await getTransactions();
  const monthlySummary = computeMonthSummary(allTransactions, month);
  await upsertMonthlySummaryRow(sheets, month, monthlySummary);
}

export async function getTransactions(): Promise<Transaction[]> {
  const authClient = await auth().getClient();
  const sheets = google.sheets({ version: "v4", auth: authClient as never });

  await ensureRequiredSheetsAndHeaders(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${TRANSACTIONS_SHEET_NAME}!A2:E`,
  });

  const rows = res.data.values || [];
  return rows
    .filter((row) => row.length >= 3)
    .map((row) => ({
      date: row[0] || "",
      type: (row[1] || "deposit") as "deposit" | "withdrawal",
      amount: parseSheetAmount(row[2]),
      category: row[3] || "",
      notes: row[4] || "",
    }));
}

export async function getSummary(month: string): Promise<Summary> {
  const all = await getTransactions();
  return computeMonthSummary(all, month);
}
