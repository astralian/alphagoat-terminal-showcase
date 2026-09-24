import { Decimal } from "decimal.js";
import { z } from "zod";
import { inputDecimalLimits, isBoundedDecimalString } from "./financial-limits.js";

export const inputDecimalStringSchema = z
  .string()
  .refine((value) => isBoundedDecimalString(value, inputDecimalLimits), {
    error: "Decimal exceeds the supported input limits",
    abort: true,
  });

export const canonicalPositivePlainDecimalSchema = inputDecimalStringSchema.refine(
  (value) => /^(?:0\.\d*[1-9]|[1-9]\d*(?:\.\d*[1-9])?)$/.test(value),
  { error: "Expected a canonical positive plain decimal", abort: true },
);

export const marketQuantityRulesSchema = z
  .object({
    stepSize: canonicalPositivePlainDecimalSchema,
    minimumQuantity: canonicalPositivePlainDecimalSchema,
    maximumQuantity: canonicalPositivePlainDecimalSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const step = new Decimal(value.stepSize);
    const minimum = new Decimal(value.minimumQuantity);
    if (!minimum.dividedBy(step).isInteger()) {
      context.addIssue({
        code: "custom",
        path: ["minimumQuantity"],
        message: "Minimum quantity must align to the quantity step",
      });
    }
    if (value.maximumQuantity !== null) {
      const maximum = new Decimal(value.maximumQuantity);
      if (maximum.lessThan(minimum)) {
        context.addIssue({
          code: "custom",
          path: ["maximumQuantity"],
          message: "Maximum quantity must not be below minimum quantity",
        });
      }
      if (!maximum.dividedBy(step).isInteger()) {
        context.addIssue({
          code: "custom",
          path: ["maximumQuantity"],
          message: "Maximum quantity must align to the quantity step",
        });
      }
    }
  });

export type MarketQuantityRules = z.infer<typeof marketQuantityRulesSchema>;
