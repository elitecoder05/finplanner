import { NextResponse } from "next/server";
import { parseMessage } from "@/lib/gemini";
import { validateAddTransaction, validateMonth } from "@/lib/validate";
import { addTransaction, getTransactions, getSummary } from "@/lib/sheets";
import { validateEnv } from "@/lib/env";
import type { ParsedAction } from "@/lib/validate";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

export async function POST(request: Request) {
  try {
    const missing = validateEnv();
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing env vars: ${missing.join(", ")}` },
        { status: 500 }
      );
    }

    const { message } = (await request.json()) as { message?: string };
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ reply: "Please send a message." });
    }

    // Step 1: AI Layer — convert text to structured JSON
    const parsed: ParsedAction = await parseMessage(message.trim());

    // Step 2: Validate & Execute
    switch (parsed.action) {
      case "add_transaction": {
        const validation = validateAddTransaction(parsed as unknown as Record<string, unknown>);
        if (!validation.valid) {
          return NextResponse.json({
            reply: `Couldn't add transaction: ${validation.errors
              .map((e) => e.message)
              .join(", ")}`,
          });
        }

        await addTransaction(validation.payload);
        const month = validation.payload.date.slice(0, 7);
        const monthSummary = await getSummary(month);

        const signedAmount =
          validation.payload.type === "deposit"
            ? `+${formatINR(validation.payload.amount)}`
            : `-${formatINR(validation.payload.amount)}`;

        return NextResponse.json({
          reply: `✅ Added: ${signedAmount} — ${validation.payload.category} on ${validation.payload.date}\n\n📅 ${month} Net Profit/Loss: ${formatINR(monthSummary.profit)}`,
        });
      }

      case "get_transactions": {
        const transactions = await getTransactions();
        if (transactions.length === 0) {
          return NextResponse.json({ reply: "No transactions found yet." });
        }

        const formatted = transactions
          .map(
            (tx) =>
              `• ${tx.date} | ${tx.type === "deposit" ? "+" : "-"}${formatINR(tx.amount)} | ${tx.category}${tx.notes ? ` — ${tx.notes}` : ""}`
          )
          .join("\n");

        const totalDeposit = transactions
          .filter((t) => t.type === "deposit")
          .reduce((s, t) => s + t.amount, 0);
        const totalWithdrawal = transactions
          .filter((t) => t.type === "withdrawal")
          .reduce((s, t) => s + t.amount, 0);

        return NextResponse.json({
          reply: `**All Transactions:**\n${formatted}\n\n**Totals:** +${formatINR(totalDeposit)} | -${formatINR(totalWithdrawal)} | Net: ${formatINR(totalDeposit - totalWithdrawal)}`,
        });
      }

      case "get_summary": {
        const month = validateMonth(parsed.month);
        if (!month) {
          return NextResponse.json({
            reply: "Please specify a valid month (e.g., 'May 2026' or '2026-05').",
          });
        }

        const summary = await getSummary(month);
        if (summary.transactions === 0) {
          return NextResponse.json({
            reply: `No transactions found for ${month}.`,
          });
        }

        const emoji = summary.profit >= 0 ? "📈" : "📉";
        return NextResponse.json({
          reply: `${emoji} **${month} Summary**\n• Deposits: +${formatINR(summary.total_deposit)}\n• Withdrawals: -${formatINR(summary.total_withdrawal)}\n• Net Profit/Loss: ${formatINR(summary.profit)}\n• Transactions: ${summary.transactions}`,
        });
      }

      default:
        return NextResponse.json({
          reply: "I didn't understand that. Try these commands:\n• 'i deposited 1000 into stocks'\n• 'withdrawn 1200'\n• 'deposited 4500'\n• 'summary for this month'",
        });
    }
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { reply: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
