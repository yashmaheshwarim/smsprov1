// ─── Supabase Edge Function: send-push-notification ─────────────────────────
// Trigger: Called when a new row is inserted into `public.notifications`.
// It reads the notification, looks up all device tokens for the target
// users, and sends Expo Push Notifications to each.
//
// Deploy:  supabase functions deploy send-push-notification
// Secrets: supabase secrets set EXPO_ACCESS_TOKEN=<your-expo-access-token>
//
// For testing without an Expo Access Token, remove the `headers` object
// in the fetch call — Expo's free tier allows ~30 pushes/min without a token.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationRecord {
  id: string;
  institute_id: string;
  title: string;
  message: string;
  type: string;
  target_role: 'teacher' | 'student' | 'all';
  target_batch_id: string | null;
  target_student_id: string | null;
  created_by: string;
  created_at: string;
}

interface DeviceTokenRow {
  user_id: string;
  token: string;
  platform: string;
}

serve(async (req) => {
  try {
    // ── Parse payload ──────────────────────────────────────────────────
    const payload: { type: 'INSERT'; record: NotificationRecord; schema: string; table: string } =
      await req.json();

    const { record: notif } = payload;

    if (!notif || payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ ok: false, reason: 'Not an INSERT' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Create Supabase client ─────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Fetch device tokens scoped to this institute ────────────────────
    // Only send pushes to devices whose token record includes this
    // institute_id. This prevents cross-institute notification leaks.
    let query = supabase
      .from('device_tokens')
      .select('user_id, token, platform');

    // Filter by institute so only users from the correct institute get pushes
    query = query.eq('institute_id', notif.institute_id);

    const { data: tokens, error: tokenErr } = await query
      .returns<DeviceTokenRow[]>();

    if (tokenErr) {
      console.error('Error fetching device tokens:', tokenErr);
      return new Response(JSON.stringify({ ok: false, error: tokenErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      console.log('No device tokens found for institute:', notif.institute_id);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Build Expo push messages ───────────────────────────────────────
    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default' as const,
      title: notif.title,
      body: notif.message,
      data: {
        notificationId: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        screen: 'Notifications',
      },
      // Android-specific: use the channel we created in the app
      channelId: 'apexsms-default',
      priority: 'high' as const,
    }));

    // ── Send via Expo Push API ─────────────────────────────────────────
    const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (expoAccessToken) {
      headers['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Expo Push API error:', result);
      return new Response(JSON.stringify({ ok: false, error: result }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Sent ${messages.length} push notifications`);

    return new Response(
      JSON.stringify({ ok: true, sent: messages.length, details: result }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
