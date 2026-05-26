import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "./env";
import type { ParsedAction } from "./validate";

const SYSTEM_PROMPT = `You are a financial assistant that converts user input into structured JSON.

Today's date is ${new Date().toISOString().slice(0, 10)}.

RULES:
- ONLY return valid JSON
- NO explanations
- NO extra text
- NO markdown code fences
- If unclear, return { "action": "unknown" }

SUPPORTED ACTIONS:
1. add_transaction
2. get_transactions
3. get_summary

SCHEMA:

For adding transaction:
{
  "action": "add_transaction",
  "type": "deposit" | "withdrawal",
  "amount": number,
  "category": string,
  "date": "YYYY-MM-DD",
  "notes": string
}

IMPORTANT FOR add_transaction:
- If user says only amount and no category (e.g. "withdrawn 1200"), set category to "general".
- Treat "deposited", "deposit", "added", "got" as type "deposit".
- Treat "withdrawn", "withdrew", "spent", "paid" as type "withdrawal".
- INR/rupees/rs are just currency words; amount should be numeric.
- If date is not given, use today's date.

For fetching all transactions:
{
  "action": "get_transactions"
}

For summary (profit/loss for a month):
{
  "action": "get_summary",
  "month": "YYYY-MM"
}

EXAMPLES:
- "spent 500 on groceries" → add_transaction, withdrawal, 500, groceries
- "got 5000 salary" → add_transaction, deposit, 5000, salary
- "i deposited 1000 into stocks" → add_transaction, deposit, 1000, stocks
- "withdrawn 1200" → add_transaction, withdrawal, 1200, general
- "deposited 4500" → add_transaction, deposit, 4500, general
- "show my transactions" → get_transactions
- "how did I do in May" → get_summary, month: "2026-05"
- "profit this month" → get_summary, month: "2026-05"`;

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function parseFallbackAmount(message: string): number | null {
  const amountMatch = message.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*\.?[0-9]*)(k)?/i);
  if (!amountMatch) return null;

  const base = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (isNaN(base)) return null;

  return amountMatch[2] ? base * 1000 : base;
}

function parseFallbackMonth(message: string): string | null {
  const lowered = message.toLowerCase();
  const explicit = lowered.match(/\b\d{4}-\d{2}\b/);
  if (explicit) return explicit[0];

  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];

  for (let index = 0; index < monthNames.length; index += 1) {
    if (lowered.includes(monthNames[index])) {
      const yearMatch = lowered.match(/\b(20\d{2})\b/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
      return `${year}-${String(index + 1).padStart(2, "0")}`;
    }
  }

  if (lowered.includes("this month") || lowered.includes("current month")) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  if (lowered.includes("last month") || lowered.includes("previous month")) {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  }

  return null;
}

function fallbackParseMessage(userMessage: string): ParsedAction {
  const normalized = userMessage.toLowerCase().trim();

  if (
    normalized.includes("show my transactions") ||
    normalized.includes("show transactions") ||
    normalized.includes("list transactions") ||
    normalized.includes("all transactions")
  ) {
    return { action: "get_transactions" };
  }

  if (
    normalized.includes("summary") ||
    normalized.includes("profit") ||
    normalized.includes("loss")
  ) {
    const month = parseFallbackMonth(normalized) || undefined;
    if (month) return { action: "get_summary", month };
  }

  const amount = parseFallbackAmount(normalized);
  if (amount === null) {
    return { action: "unknown" };
  }

  const depositWords = ["deposited", "deposit", "added", "add", "got", "received"];
  const withdrawalWords = ["withdrawn", "withdrew", "withdraw", "spent", "paid", "buy", "bought"];

  let type: "deposit" | "withdrawal" | null = null;
  if (depositWords.some((word) => normalized.includes(word))) type = "deposit";
  if (withdrawalWords.some((word) => normalized.includes(word))) type = "withdrawal";

  if (!type) {
    return { action: "unknown" };
  }

  let category = "general";
  const categoryMatch = normalized.match(/(?:into|in|on|for|towards|to)\s+([a-z][a-z\s-]*)/i);
  if (categoryMatch?.[1]) {
    category = categoryMatch[1].trim().split(/\s+/)[0];
  }

  return {
    action: "add_transaction",
    type,
    amount,
    category,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  };
}

export async function parseMessage(userMessage: string): Promise<ParsedAction> {
  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent({
      systemInstruction: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    });

    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text;

    try {
      const parsed = JSON.parse(jsonStr);
      return parsed as ParsedAction;
    } catch {
      return fallbackParseMessage(userMessage);
    }
  } catch (error) {
    console.error("Gemini parse fallback used:", error);
    return fallbackParseMessage(userMessage);
  }
}
