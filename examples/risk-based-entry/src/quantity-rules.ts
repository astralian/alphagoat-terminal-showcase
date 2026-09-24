/** The product validates this shape at its transport boundary before sizing. */
export type MarketQuantityRules = {
  stepSize: string;
  minimumQuantity: string;
  maximumQuantity: string | null;
};
