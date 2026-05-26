PROJECT: AI Finance Chatbot (Next.js + Gemini + Google Sheets)

GOAL:
Build a chatbot that:
1. Accepts natural language inputs for financial transactions
2. Converts them into structured JSON using Gemini
3. Stores and retrieves data from Google Sheets
4. Provides summaries like profit/loss and monthly ledger

-------------------------------------
TECH STACK (DO NOT CHANGE)
-------------------------------------
- Frontend: Next.js (App Router)
- Backend: Next.js API routes (Node.js)
- AI Model: Google Gemini (gemini-1.5-flash or latest)
- Database: Google Sheets (via Sheets API)
- Auth: None (MVP)
- Deployment: Vercel

-------------------------------------
ENV VARIABLES (.env.local)
-------------------------------------
GEMINI_API_KEY=your_key_here
GOOGLE_CLIENT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key
GOOGLE_SHEET_ID=your_sheet_id

-------------------------------------
GOOGLE SHEETS SETUP
-------------------------------------
1. Create a Google Sheet
2. Name sheet: "Transactions"
3. Columns:
   Date | Type | Amount | Category | Notes

4. Enable Google Sheets API in Google Cloud
5. Create Service Account
6. Share sheet with service account email

-------------------------------------
CORE SYSTEM DESIGN
-------------------------------------
You MUST separate:

1. AI Layer → Converts text → JSON
2. Logic Layer → Validates JSON
3. Execution Layer → Calls Google Sheets API

Gemini NEVER touches the database directly.

-------------------------------------
GEMINI PROMPT (CRITICAL - USE EXACTLY)
-------------------------------------
SYSTEM PROMPT:

You are a financial assistant that converts user input into structured JSON.

RULES:
- ONLY return valid JSON
- NO explanations
- NO extra text
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

For fetching all:
{
  "action": "get_transactions"
}

For summary:
{
  "action": "get_summary",
  "month": "YYYY-MM"
}

-------------------------------------
BACKEND IMPLEMENTATION
-------------------------------------

STEP 1: Install dependencies
- googleapis
- axios (optional)

STEP 2: Create /api/chat route

FLOW:
1. Receive user message
2. Send to Gemini with system prompt
3. Parse JSON response
4. Validate schema
5. Switch(action):
   - add_transaction → write to sheet
   - get_transactions → read sheet
   - get_summary → read + calculate

STEP 3: Google Sheets Functions

FUNCTION: addTransaction()
- Append row to sheet

FUNCTION: getTransactions()
- Read all rows

FUNCTION: getSummary(month)
- Filter by month
- Calculate:
   total_deposit
   total_withdrawal
   profit = deposit - withdrawal

-------------------------------------
FRONTEND (NEXT.JS)
-------------------------------------

STEP 1: Create simple chat UI
- Input box
- Message list

STEP 2: On submit:
- Send POST to /api/chat
- Display response

-------------------------------------
VALIDATION LAYER (IMPORTANT)
-------------------------------------

Before writing to sheet:
- Ensure amount is number
- Ensure type is valid
- Convert "10k" → 10000
- Normalize date

Reject bad inputs.

-------------------------------------
EXAMPLE FLOW
-------------------------------------

USER:
"I added 5000 from salary"

AI OUTPUT:
{
  "action": "add_transaction",
  "type": "deposit",
  "amount": 5000,
  "category": "salary",
  "date": "2026-05-26",
  "notes": ""
}

SYSTEM:
→ Writes to Google Sheet

-------------------------------------
DEPLOYMENT
-------------------------------------

1. Push to GitHub
2. Deploy using Vercel
3. Add env variables in Vercel dashboard
4. Test live endpoint

-------------------------------------
MVP FEATURES ONLY
-------------------------------------
DO NOT ADD:
- Authentication
- Charts
- Multi-user support
- Voice input

-------------------------------------
AFTER MVP (OPTIONAL)
-------------------------------------
- Add categories dropdown
- Add edit/delete transaction
- Add charts (Recharts)
- Add auth (Clerk)

-------------------------------------
FINAL RULE
-------------------------------------
If Gemini output is not valid JSON → DO NOT EXECUTE

-------------------------------------
END