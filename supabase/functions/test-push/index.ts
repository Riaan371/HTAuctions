import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_APP_ID = 'REPLACE_WITH_HTA_ONESIGNAL_APP_ID';
const ONESIGNAL_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Identify exactly which logged-in user is calling, so we target THEM specifically
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Not logged in' }), { status: 401, headers: CORS });
    }
    const userId = userData.user.id;

    const response = await fetch('https://api.onesignal.com/notifications?c=push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        included_segments: ['Total Subscriptions'],
        headings: { en: '�x Test Notification' },
        contents: { en: 'Push notifications are working on HT Auctions West Coast!' },
        url: 'https://htauctions.pages.dev',
        chrome_web_icon: 'https://htauctions.pages.dev/icon-192-v5.png',
      }),
    });

    const result = await response.json();
    return new Response(JSON.stringify({ ...result, sent_by_user_id: userId }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
