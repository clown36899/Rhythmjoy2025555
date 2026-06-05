import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SESSION_DURATION_CAP_SECONDS = 30 * 60;

const toSafeString = (value: unknown, maxLength: number) => (
    typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null
);

const toSafeInteger = (value: unknown, fallback: number | null = null) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
};

const getErrorMessage = (error: unknown) => (
    error instanceof Error ? error.message : 'Internal Server Error'
);

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const sessionId = String(body.session_id || '').trim();
        if (!sessionId) {
            return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'session_id required' }) };
        }

        const action = body.action === 'start' ? 'start' : 'end';

        if (action === 'start') {
            const pageViews = toSafeInteger(body.page_views, 1) || 1;
            const incomingUserId = toSafeString(body.user_id, 80);
            const fingerprint = toSafeString(body.fingerprint, 120);
            const userAgent = toSafeString(body.user_agent, 1000) || toSafeString(event.headers['user-agent'], 1000);

            const { data: existing, error: existingError } = await supabaseAdmin
                .from('session_logs')
                .select('session_id,user_id,page_views,entry_page,session_start')
                .eq('session_id', sessionId)
                .maybeSingle();

            if (existingError) throw existingError;

            if (existing) {
                const { error } = await supabaseAdmin
                    .from('session_logs')
                    .update({
                        user_id: incomingUserId || existing.user_id || null,
                        fingerprint,
                        is_admin: Boolean(body.is_admin),
                        is_pwa: Boolean(body.is_pwa),
                        pwa_display_mode: toSafeString(body.pwa_display_mode, 80),
                        user_agent: userAgent,
                        platform: toSafeString(body.platform, 200),
                        utm_source: toSafeString(body.utm_source, 200),
                        utm_medium: toSafeString(body.utm_medium, 200),
                        utm_campaign: toSafeString(body.utm_campaign, 200),
                        page_views: Math.max(Number(existing.page_views || 0), pageViews),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('session_id', sessionId);

                if (error) throw error;
            } else {
                const { error } = await supabaseAdmin
                    .from('session_logs')
                    .insert({
                        session_id: sessionId,
                        user_id: incomingUserId,
                        fingerprint,
                        is_admin: Boolean(body.is_admin),
                        entry_page: toSafeString(body.entry_page, 500),
                        referrer: toSafeString(body.referrer, 1000),
                        utm_source: toSafeString(body.utm_source, 200),
                        utm_medium: toSafeString(body.utm_medium, 200),
                        utm_campaign: toSafeString(body.utm_campaign, 200),
                        session_start: toSafeString(body.session_start, 80) || new Date().toISOString(),
                        is_pwa: Boolean(body.is_pwa),
                        pwa_display_mode: toSafeString(body.pwa_display_mode, 80),
                        user_agent: userAgent,
                        platform: toSafeString(body.platform, 200),
                        page_views: pageViews,
                    });

                if (error) throw error;
            }

            return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, action: 'start' }) };
        }

        const rawDuration = toSafeInteger(body.duration_seconds, null);
        const duration = rawDuration === null ? null : Math.min(rawDuration, SESSION_DURATION_CAP_SECONDS);
        const totalClicks = toSafeInteger(body.total_clicks, 0) || 0;
        const pageViews = toSafeInteger(body.page_views, null);
        const exitPage = toSafeString(body.exit_page, 500);

        const { error } = await supabaseAdmin
            .from('session_logs')
            .update({
                session_end: new Date().toISOString(),
                exit_page: exitPage,
                duration_seconds: duration,
                total_clicks: totalClicks,
                ...(pageViews !== null ? { page_views: pageViews } : {}),
                updated_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId);

        if (error) throw error;

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, action: 'end' }) };
    } catch (error: unknown) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: getErrorMessage(error) }),
        };
    }
};
