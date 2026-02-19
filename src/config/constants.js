export const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;
export const HASURA_ANON_ROLE = process.env.HASURA_ANON_ROLE;
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 60_000);
export const PAGE_SIZE = Number(process.env.PAGE_SIZE || 5);
export const SCORE_THRESHOLD = Number(process.env.SCORE_THRESHOLD || 8);
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // required for notifications
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // required for interaction
export const TELEGRAM_POLLING = /^(true|1|yes)$/i.test(process.env.TELEGRAM_POLLING);
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/afriwork';
export const DB_NAME = process.env.DB_NAME || 'afri_jobs';
export const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Afriwork API apply
export const AFRIWORK_BEARER_TOKEN = process.env.AFRIWORK_BEARER_TOKEN || '';
export const AFRIWORK_ORIGIN_PLATFORM_ID = process.env.AFRIWORK_ORIGIN_PLATFORM_ID || '';
export const AFRIWORK_LOGIN_EMAIL = process.env.AFRIWORK_LOGIN_EMAIL || '';
export const AFRIWORK_LOGIN_PASSWORD = process.env.AFRIWORK_LOGIN_PASSWORD || '';
export const AFRIWORK_PROFILE_ID = process.env.AFRIWORK_PROFILE_ID || '';
