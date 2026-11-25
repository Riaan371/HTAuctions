// Supabase Edge Function: issues Agora RTC tokens for the HT Auctions live room.
// Deploy: npx supabase functions deploy agora-token --project-ref oeujibxugghjysjnqply
// Secrets (Supabase > Edge Functions > Secrets): AGORA_APP_ID, AGORA_APP_CERTIFICATE

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RtcTokenBuilder, RtcRole } from 'https://esm.sh/agora-token@2.0.4';

const APP_ID = Deno.env.get('AGORA_APP_ID') ?? '';
const APP_CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE') ?? '';

// The auctioneer always joins with this uid; viewers only ever play this uid's
// stream, so nobody else can pose as the broadcast. Viewers get a random uid
// bound into their token.
const HOST_UID = 1;
// agora-token takes seconds from now (not an absolute timestamp). The client
// renews before expiry, so this only needs to outlast a long auction day.
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function viewerUid(): number {
  const r = crypto.getRandomValues(new Uint32Array(1))[0];
  return 1000 + (r % 2_000_000_000);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!APP_ID || !APP_CERTIFICATE) throw new Error('Live video is not configured on the server yet.');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Unauthorized');

    const { channel, role } = await req.json();
    if (!channel) throw new Error('channel is required');

    const wantsHost = role === 'publisher';
    if (wantsHost) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'auctioneer' && profile?.role !== 'super_admin') {
        throw new Error('Only the auctioneer can broadcast.');
      }
    }

    const uid = wantsHost ? HOST_UID : viewerUid();
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channel,
      uid,
      wantsHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      TOKEN_TTL_SECONDS,
      TOKEN_TTL_SECONDS
    );

    return new Response(
      JSON.stringify({ token, appId: APP_ID, channel, uid }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
