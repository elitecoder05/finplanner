export interface AddTransactionPayload {
  action: "add_transaction";
  type: "deposit" | "withdrawal";
  amount: number;
  category: string;
  date: string;
  notes: string;
}

export interface GetTransactionsPayload {
  action: "get_transactions";
}

export interface GetSummaryPayload {
  action: "get_summary";
  month: string;
}

export interface UnknownPayload {
  action: "unknown";
}

export type ParsedAction =
  | AddTransactionPayload
  | GetTransactionsPayload
  | GetSummaryPayload
  | UnknownPayload;

export interface ValidationError {
  field: string;
  message: string;
}

function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const cleaned = raw.toLowerCase().trim();
    // Handle "10k", "1.5k" etc
    const kMatch = cleaned.match(/^(-?\d+\.?\d*)k$/);
    if (kMatch) return parseFloat(kMatch[1]) * 1000;
    // Remove currency words/symbols and commas
    const normalized = cleaned.replace(/(inr|rs\.?)/g, "").replace(/[,$₹€£]/g, "");
    const num = parseFloat(normalized);
    if (!isNaN(num)) return num;
  }
  return NaN;
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim();

  // Already valid YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // "today", "yesterday" etc are handled by Gemini

  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}

export function validateAddTransaction(
  data: Record<string, unknown>
): { valid: true; payload: AddTransactionPayload } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const type = data.type;
  if (type !== "deposit" && type !== "withdrawal") {
    errors.push({ field: "type", message: 'Must be "deposit" or "withdrawal"' });
  }

  const amount = parseAmount(data.amount);
  if (isNaN(amount) || amount <= 0) {
    errors.push({ field: "amount", message: "Must be a positive number" });
  }

  let category = "general";
  if (typeof data.category === "string" && data.category.trim()) {
    category = data.category.trim();
  }

  let date = "";
  const normalizedDate = normalizeDate(data.date);
  if (normalizedDate) {
    date = normalizedDate;
  } else {
    // Default to today if missing
    date = new Date().toISOString().slice(0, 10);
  }

  let notes = "";
  if (typeof data.notes === "string") notes = data.notes.trim();

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    payload: {
      action: "add_transaction",
      type: type as "deposit" | "withdrawal",
      amount,
      category,
      date,
      notes,
    },
  };
}

export function validateMonth(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();

  if (lowered === "this month" || lowered === "current month") {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  if (lowered === "last month" || lowered === "previous month") {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;

  // Try parsing "May 2026", "this month" etc
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  return null;
}
