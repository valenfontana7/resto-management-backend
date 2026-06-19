/**
 * Valida CUIT/CUIL argentino (11 dígitos + dígito verificador módulo 11).
 */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const body = digits.slice(0, 10).split('').map(Number);
  const checkDigit = Number(digits[10]);

  const sum = body.reduce(
    (acc, digit, index) => acc + digit * multipliers[index],
    0,
  );
  const remainder = sum % 11;
  const expected = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;

  return checkDigit === expected;
}

export function normalizeCuit(value: string): string {
  return value.replace(/\D/g, '');
}
