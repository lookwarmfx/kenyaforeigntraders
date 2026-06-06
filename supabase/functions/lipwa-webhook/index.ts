import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppDepositNotification(
  phone: string,
  apikey: string,
  amountUsd: number,
  amountKes: number,
  mpesaPhone: string | null,
  userEmail: string | null,
) {
  const text =
    `💰 New Deposit Received\n` +
    `User: ${userEmail ?? "unknown"}\n` +
    `Amount: $${Number(amountUsd).toFixed(2)} (KES ${Number(amountKes).toFixed(0)})\n` +
    `M-Pesa: ${mpesaPhone ?? "N/A"}\n` +
    `Time: ${new Date().toISOString()}`;

  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const res = await fetch(url);
    const body = await res.text();
    console.log("CallMeBot deposit notify:", res.status, body);
  } catch (e) {
    console.error("CallMeBot deposit notify failed:", e);
  }
}

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
      (data?.mpesa_code as string) ??
      (data?.mpesa_receipt as string) ??
      (data?.mpesa_reference as string) ??
      (data?.receipt as string) ??
      (event?.mpesa_code as string) ??
      (event?.mpesa_receipt as string) ??
      null;

    if (!reference) throw new Error("Missing api_ref/reference in payload");

    const isSuccess = rawStatus.includes("success") || rawStatus === "completed" || rawStatus === "successful" || rawStatus === "paid" || rawStatus === "payment.success";
    const isFailed = rawStatus.includes("fail") || rawStatus.includes("cancel") || rawStatus.includes("error");
    const status = isSuccess ? "completed" : isFailed ? "failed" : "pending";

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

    // Notify admin via WhatsApp when a deposit completes
    if (status === "completed") {
      const callmePhone = Deno.env.get("CALLMEBOT_PHONE");
      const callmeKey = Deno.env.get("CALLMEBOT_APIKEY");
      if (callmePhone && callmeKey) {
        const { data: deposit } = await admin
          .from("deposits")
          .select("amount_usd, amount_kes, mpesa_phone, user_id")
          .eq("onasis_reference", reference)
          .single();

        if (deposit) {
          const { data: profile } = await admin
            .from("profiles")
            .select("email")
            .eq("user_id", deposit.user_id)
            .single();

          await sendWhatsAppDepositNotification(
            callmePhone,
            callmeKey,
            Number(deposit.amount_usd),
            Number(deposit.amount_kes),
            deposit.mpesa_phone,
            profile?.email ?? null,
          );
        }
      }
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
