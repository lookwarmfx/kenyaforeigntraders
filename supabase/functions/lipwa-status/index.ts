import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Client-side polling: reads the deposit row updated by the lipwa webhook.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Unauthorized");

    const body = await req.json().catch(() => ({}));
    const reference = String(body?.reference ?? "");
    if (!reference) throw new Error("reference required");

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: deposit, error } = await admin
      .from("deposits")
      .select("id, status, mpesa_receipt")
      .eq("onasis_reference", reference)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!deposit) throw new Error("Deposit not found");

    return new Response(
      JSON.stringify({
        status: deposit.status,
        deposit_id: deposit.id,
        mpesa_receipt: deposit.mpesa_receipt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("lipwa-status error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
