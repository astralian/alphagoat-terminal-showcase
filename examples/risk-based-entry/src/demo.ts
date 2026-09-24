import { calculateEntrySizing, type EntrySizingInput } from "./entry-sizing.js";

// Synthetic values; no API, account credentials, or exchange connection.
const input: EntrySizingInput = {
  side: "LONG",
  walletBalance: "1000",
  effectiveEntryPrice: "100",
  stopPrice: "90",
  riskPercent: "2",
  entryAllocationPercent: "50",
  dcaLevels: [{ price: "95", allocationPercent: "50" }],
  contractSize: "1",
  quantityRules: {
    stepSize: "0.001",
    minimumQuantity: "0.001",
    maximumQuantity: null,
  },
};

console.log("A 20 USDT risk budget split across two entries:");
console.log(JSON.stringify(calculateEntrySizing(input), null, 2));

console.log("\nA stop above the LONG entry is rejected:");
console.log(JSON.stringify(calculateEntrySizing({ ...input, stopPrice: "105" }), null, 2));

console.log("\nA minimum order notional of 101 rejects the 100 USDT entry:");
console.log(JSON.stringify(calculateEntrySizing({ ...input, minimumNotional: "101" }), null, 2));
