// The only origins this extension talks to. Committed, not injected at build
// time: a build that depends on environment variables cannot be reproduced.
// Change with `node scripts/set-origin.mjs <https origin>`.
export const BACKEND_ORIGIN = 'https://safefill-spike.vercel.app';
export const APP_ORIGINS = Object.freeze(['https://safefill-spike.vercel.app']);
export const TICKET_TTL_MS = 120000;
export const FILL_VALUES_PATH = '/api/fill-values';
