export const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export const percent = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 1,
});

export const integer = new Intl.NumberFormat("de-DE");
