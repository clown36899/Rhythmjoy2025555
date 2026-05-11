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

        const duration = Number.isFinite(Number(body.duration_seconds)) ? Math.max(0, Math.floor(Number(body.duration_seconds))) : null;
        const totalClicks = Number.isFinite(Number(body.total_clicks)) ? Math.max(0, Math.floor(Number(body.total_clicks))) : 0;
        const exitPage = typeof body.exit_page === 'string' ? body.exit_page.slice(0, 500) : null;

        const { error } = await supabaseAdmin
            .from('session_logs')
            .update({
                session_end: new Date().toISOString(),
                exit_page: exitPage,
                duration_seconds: duration,
                total_clicks: totalClicks,
            })
            .eq('session_id', sessionId);

        if (error) throw error;

        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    } catch (error: any) {
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error?.message || 'Internal Server Error' }),
        };
    }
};
