/** Structural check for an ISIN: 2 letters + 9 alphanumerics + check digit. */
export function isValidIsin(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin.trim().toUpperCase());
}

export function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase();
}
