// Conversion factors to millilitres for common volume units.
// We then treat 1ml ≈ 1g as a standard kitchen approximation — exact for
// water-based liquids, close enough for most solids/powders/pastes. This is
// the same approximation most consumer nutrition apps use; it won't be
// perfectly precise for very dense or very light ingredients (e.g. oil,
// honey), but is far better than treating "2 tsp" as "2g".
export const VOLUME_UNITS_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.93,
  tbsp: 14.79,
  cup: 236.59,
  fl_oz: 29.57,
};

// Weight units, converted to grams.
export const WEIGHT_UNITS_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.35,
  lb: 453.59,
};

export const ALL_UNITS = [
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "tsp", label: "tsp" },
  { value: "tbsp", label: "tbsp" },
  { value: "cup", label: "cup" },
  { value: "fl_oz", label: "fl oz" },
  { value: "each", label: "each (specify grams below)" },
];

/**
 * Converts a quantity in a given unit to its gram/ml equivalent.
 * For "each" (whole items like "1 egg"), gramsPerEach must be supplied
 * since there's no universal conversion — it varies per food.
 */
export function toGramsEquivalent(
  quantity: number,
  unit: string,
  gramsPerEach?: number | null
): number {
  if (unit === "each") {
    return quantity * (gramsPerEach ?? 0);
  }
  if (unit in WEIGHT_UNITS_TO_G) {
    return quantity * WEIGHT_UNITS_TO_G[unit];
  }
  if (unit in VOLUME_UNITS_TO_ML) {
    return quantity * VOLUME_UNITS_TO_ML[unit];
  }
  // Unknown unit — fall back to treating it as grams rather than crashing.
  return quantity;
}
