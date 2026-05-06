import { onCall } from "firebase-functions/v2/https";

// FASE 5A-3B: TypeScript skeleton only; legacy CJS functions remain in ../index.js.
export const healthCheck = onCall(
  { region: "southamerica-east1" },
  () => ({ ok: true }),
);
