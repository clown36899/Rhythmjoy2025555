import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    try {
        // 1. 회원 수 집계 (board_users)
        const { count: memberCount, error: memberError } = await supabaseAdmin
            .from('board_users')
            .select('*', { count: 'exact', head: true });

        if (memberError) throw memberError;

        // 2. PWA 유니크 설치 수 집계 (회원 UID 기준)
        const { data: pwaData, error: pwaError } = await supabaseAdmin
            .from('pwa_installs')
            .select('user_id')
            .not('user_id', 'is', null);

        if (pwaError) throw pwaError;
        const pwaCount = pwaData ? new Set(pwaData.map(d => d.user_id).filter(Boolean)).size : 0;

        // 3. 푸시 유니크 구독 수 집계 (회원 UID 기준)
        const { data: pushData, error: pushError } = await supabaseAdmin
            .from('user_push_subscriptions')
            .select('user_id')
            .not('user_id', 'is', null);

        if (pushError) throw pushError;
        const pushCount = pushData ? new Set(pushData.map(d => d.user_id).filter(Boolean)).size : 0;

        // 4. 이벤트 통계 집계
        const now = new Date();
        const krNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const krYear = krNow.getUTCFullYear();
        const krMonth = krNow.getUTCMonth();
        const krToday = krNow.getUTCDate();

        const startOfMonthKr = new Date(Date.UTC(krYear, krMonth, 1));
        const startIsoStr = startOfMonthKr.toISOString().split('T')[0];
        const endOfMonthKr = new Date(Date.UTC(krYear, krMonth + 1, 1));
        endOfMonthKr.setMilliseconds(-1);
        const endIsoStr = endOfMonthKr.toISOString().split('T')[0];
        const todayIsoStr = krNow.toISOString().split('T')[0];

        // 4-1. 모든 데이터 가져오기 (전역 누계 및 일평균 공용)
        const [{ data: allEvents }, { data: allSocials }] = await Promise.all([
            supabaseAdmin.from('events').select('category, start_date, date, event_dates, scope'),
            supabaseAdmin.from('social_schedules').select('date, day_of_week, created_at, scope')
        ]);

        // 4-2. 필터링 (게시판/공지 제외)
        const validEvents = (allEvents || []).filter(e => {
            if (['notice', 'notice_popup', 'board'].includes(e.category)) return false;
            return true;
        });

        const validSocials = (allSocials || []).filter(s => {
            return s.date || s.day_of_week !== null;
        });

        // [핵심 1] 전역 누계 (All-time Total)
        const eventCountTotal = validEvents.length + validSocials.length;

        // [핵심 2] 실질 일평균 (당월 활성도 지표)
        const febEvents = validEvents.filter(e => {
            const firstDate = (e.event_dates && e.event_dates.length > 0) ? e.event_dates[0] : (e.start_date || e.date);
            return firstDate && firstDate >= startIsoStr && firstDate <= endIsoStr;
        });

        const febSocials = validSocials.filter(s => {
            if (s.date) {
                return s.date >= startIsoStr && s.date <= endIsoStr;
            } else if (s.day_of_week !== null && s.created_at) {
                const createdAtKr = new Date(new Date(s.created_at).getTime() + (9 * 60 * 60 * 1000));
                return createdAtKr.getUTCFullYear() === krYear && createdAtKr.getUTCMonth() === krMonth;
            }
            return false;
        });

        // 당월 전체 데이터를 바탕으로 현재까지의 일평균(Pace) 산출 (대시보드 로직과 동기화)
        const eventDailyAvg = ((febEvents.length + febSocials.length) / Math.max(1, krToday)).toFixed(1);

        return {
            statusCode: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                memberCount: Number(memberCount || 0),
                pwaCount: Number(pwaCount || 0),
                pushCount: Number(pushCount || 0),
                eventCountTotal: Number(eventCountTotal || 0),
                eventDailyAvg: Number(eventDailyAvg || 0),
                eventBreakdown: {
                    regular: validEvents.length,
                    social: validSocials.length
                }
            })
        };

    } catch (error: any) {
        console.error('[get-site-stats] Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message || 'Internal Server Error' })
        };
    }
};
