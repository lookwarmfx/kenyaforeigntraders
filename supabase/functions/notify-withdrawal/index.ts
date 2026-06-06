import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { amount_usd, amount_kes, mpesa_phone, user_email } = await req.json();

    const phone = Deno.env.get('CALLMEBOT_PHONE');
    const apikey = Deno.env.get('CALLMEBOT_APIKEY');
    if (!phone || !apikey) {
      return new Response(JSON.stringify({ error: 'CallMeBot not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const text =
      `🔔 New Withdrawal Request\n` +
      `User: ${user_email ?? 'unknown'}\n` +
      `Amount: $${Number(amount_usd).toFixed(2)} (KES ${Number(amount_kes).toFixed(0)})\n` +
      `M-Pesa: ${mpesa_phone}\n` +
      `Time: ${new Date().toISOString()}`;

    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    const res = await fetch(url);
    const body = await res.text();

    return new Response(JSON.stringify({ ok: res.ok, status: res.status, body }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
