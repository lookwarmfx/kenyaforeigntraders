import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LIPWA_ENDPOINT = "https://pay.lipwa.app/api/payments";
const USD_TO_KES = 150;

function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (/^254[71]\d{8}$/.test(digits)) return "+" + digits;
  if (/^0[71]\d{8}$/.test(digits)) return "+254" + digits.slice(1);
  if (/^[71]\d{8}$/.test(digits)) return "+254" + digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lipwaKey = Deno.env.get("LIPWA_API_KEY");
    const channelId = Deno.env.get("LIPWA_CHANNEL_ID");
    if (!lipwaKey) throw new Error("LIPWA_API_KEY is not configured");
    if (!channelId) throw new Error("LIPWA_CHANNEL_ID is not configured");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Unauthorized");

    const body = await req.json().catch(() => ({}));
    const amountUsd = Number(body?.amount_usd);
    const phone = normalizePhone(String(body?.phone ?? ""));

    if (!Number.isFinite(amountUsd) || amountUsd < 0.1 || amountUsd > 200) {
      throw new Error("amount_usd must be between 0.1 and 200");
    }
    if (!phone) throw new Error("Invalid phone — use Safaricom format (07xx, 01xx, or 2547xx)");

    const amountKes = Math.max(1, Math.round(amountUsd * USD_TO_KES));
    const reference = crypto.randomUUID();

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: deposit, error: insErr } = await admin
      .from("deposits")
      .insert({
        user_id: user.id,
        amount_usd: amountUsd,
        amount_kes: amountKes,
        status: "pending",
        payment_method: "lipwa_mpesa",
        mpesa_phone: phone,
        onasis_reference: reference, // reuse column for lipwa api_ref
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    const callbackUrl = `${supabaseUrl}/functions/v1/lipwa-webhook`;

    const stkRes = await fetch(LIPWA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lipwaKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountKes,
        callback_url: callbackUrl,
        channel_id: channelId,
        phone_number: phone,
        api_ref: reference,
      }),
    });
    const stk = await stkRes.json().catch(() => ({}));
    if (!stkRes.ok) {
      await admin.from("deposits").update({ status: "failed" }).eq("id", deposit.id);
      throw new Error(`Lipwa STK failed [${stkRes.status}]: ${stk?.message || stk?.error || JSON.stringify(stk)}`);
    }

    const txId = stk?.data?.id ?? stk?.id ?? stk?.transaction_id ?? null;
    if (txId) {
      await admin.from("deposits").update({ onasis_transaction_id: String(txId) }).eq("id", deposit.id);
    }

    return new Response(
      JSON.stringify({
        deposit_id: deposit.id,
        reference,
        transaction_id: txId,
        status: "pending",
        message: stk?.message ?? "STK push sent — check your phone",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("lipwa-stk-push error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
