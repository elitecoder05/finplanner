export const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL || "",
  GOOGLE_PRIVATE_KEY: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID || "",
};

export function validateEnv(): string[] {
  const missing: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!value) missing.push(key);
  }
  return missing;
}
