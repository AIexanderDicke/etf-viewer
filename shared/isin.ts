/** Structural check for an ISIN: 2 letters + 9 alphanumerics + check digit. */
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * Converts a string to a digit string per the ISIN specification: letters
 * become their two-digit alphabet position (A = 10, …, Z = 35), digits stay put.
 */
function toDigits(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
}

/** Luhn (modulus 10) check over a plain digit string. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Validates the ISIN structure *and* its check digit. A structurally valid
 * identifier with a wrong check digit (e.g. a typo) is rejected.
 */
export function isValidIsin(isin: string): boolean {
  const value = isin.trim().toUpperCase();
  if (!ISIN_PATTERN.test(value)) return false;
  return passesLuhn(toDigits(value));
}

export function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase();
}
