import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Lipwa posts to our callback_url when a payment resolves.
// Payload shape is provider-driven; we accept the common fields defensively.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rawBody = await req.text();
    let event: Record<string, unknown> = {};
    try { event = JSON.parse(rawBody); } catch { /* ignore */ }
    console.log("lipwa-webhook payload:", rawBody);

    const data = (event?.data as Record<string, unknown>) ?? event;
    const reference =
      (data?.api_ref as string) ??
      (event?.api_ref as string) ??
      (data?.reference as string) ??
      (event?.reference as string);

    const rawStatus = String(
      (data?.status as string) ?? (event?.status as string) ?? "",
    ).toLowerCase();

    const mpesaReceipt =
      (data?.mpesa_receipt as string) ??
      (data?.mpesa_reference as string) ??
      (data?.receipt as string) ??
      (event?.mpesa_receipt as string) ??
      null;

    if (!reference) throw new Error("Missing api_ref/reference in payload");

    const status =
      rawStatus === "success" || rawStatus === "completed" || rawStatus === "successful" || rawStatus === "paid"
        ? "completed"
        : rawStatus === "failed" || rawStatus === "cancelled" || rawStatus === "canceled" || rawStatus === "error"
          ? "failed"
          : "pending";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    if (status !== "pending") {
      const { error } = await admin
        .from("deposits")
        .update({ status, mpesa_receipt: mpesaReceipt })
        .eq("onasis_reference", reference);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ ok: true, status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lipwa-webhook error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
