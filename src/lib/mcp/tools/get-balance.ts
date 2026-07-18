import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

const EXCHANGE_RATE = 150;

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_balance",
  title: "Get balance",
  description: "Return the signed-in user's available balance (deposits + profits − withdrawals) in USD and KES.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const [dep, wd] = await Promise.all([
      sb.from("deposits").select("amount_usd, profit_amount, status").eq("user_id", userId),
      sb.from("withdrawals").select("amount_usd, status").eq("user_id", userId),
    ]);
    if (dep.error) return { content: [{ type: "text", text: dep.error.message }], isError: true };
    if (wd.error) return { content: [{ type: "text", text: wd.error.message }], isError: true };

    const deposited = (dep.data ?? [])
      .filter((d) => d.status === "completed")
      .reduce((s, d) => s + Number(d.amount_usd || 0) + Number(d.profit_amount || 0), 0);
    const withdrawn = (wd.data ?? [])
      .filter((w) => w.status !== "rejected")
      .reduce((s, w) => s + Number(w.amount_usd || 0), 0);
    const balanceUsd = Math.max(0, deposited - withdrawn);
    const balanceKes = Math.round(balanceUsd * EXCHANGE_RATE);

    return {
      content: [{ type: "text", text: `Available balance: $${balanceUsd.toFixed(2)} (≈ KES ${balanceKes})` }],
      structuredContent: { balance_usd: balanceUsd, balance_kes: balanceKes },
    };
  },
});
