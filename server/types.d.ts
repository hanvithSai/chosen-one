declare global {
  namespace Express {
    interface Request {
      /** Exact request bytes for routes that need them (webhook signature checks). */
      rawBody?: Buffer;
    }
  }
}
export {};
