import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "get_gold_price",
  title: "Get gold price",
  description: "Fetch the current live spot price of gold (XAU/USD) per troy ounce.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async () => {
    try {
      const res = await fetch("https://api.gold-api.com/price/XAU");
      if (!res.ok) throw new Error(`gold-api returned ${res.status}`);
      const data = await res.json();
      const price = Number(data?.price);
      const pricePerGram = price / 31.1035;
      return {
        content: [
          {
            type: "text",
            text: `Gold (XAU/USD): $${price.toFixed(2)}/oz (≈ $${pricePerGram.toFixed(2)}/g)`,
          },
        ],
        structuredContent: { price_per_ounce_usd: price, price_per_gram_usd: pricePerGram },
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to fetch gold price: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
});
