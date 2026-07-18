import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "request_withdrawal",
  title: "Request withdrawal",
  description: "Submit a withdrawal request for the signed-in user to be paid out via M-Pesa.",
  inputSchema: {
    amount_usd: z.number().positive().describe("Amount to withdraw in USD."),
    mpesa_phone: z.string().min(9).describe("M-Pesa phone number to receive the payout."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ amount_usd, mpesa_phone }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("withdrawals")
      .insert({
        user_id: ctx.getUserId(),
        amount_usd,
        mpesa_phone: mpesa_phone.trim(),
        status: "pending",
      })
      .select("id, amount_usd, mpesa_phone, status, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Withdrawal requested: $${amount_usd} to ${mpesa_phone} (status: ${data.status})` }],
      structuredContent: { withdrawal: data },
    };
  },
});
