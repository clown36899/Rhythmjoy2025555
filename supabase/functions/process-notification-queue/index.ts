import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type QueueItem = {
    id: number;
    event_id?: number | string | null;
    title?: string | null;
    body?: string | null;
    category?: string | null;
    payload?: Record<string, any> | null;
    scheduled_at?: string | null;
    created_at?: string | null;
};

type EventRow = {
    id: number | string;
    title?: string | null;
    date?: string | null;
    start_date?: string | null;
    location?: string | null;
    category?: string | null;
    genre?: string | null;
    dance_tags?: string[] | null;
    image?: string | null;
    image_micro?: string | null;
    image_thumbnail?: string | null;
    image_medium?: string | null;
    image_full?: string | null;
    description?: string | null;
};

const MANUAL_BATCH_WINDOW_MS = 10 * 60 * 1000;

function getSiteUrl() {
    return (Deno.env.get('SITE_URL') || 'https://swingenjoy.com').replace(/\/$/, '');
}

function getPushCategory(category?: string | null) {
    if (category === 'club') return 'club';
    if (category === 'class' || category === 'regular') return 'class';
    return 'event';
}

function getWeekday(date?: string | null) {
    if (!date) return '';
    const day = new Date(date).getDay();
    return ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][day] || '';
}

function getBestImage(event?: EventRow | null, payload?: Record<string, any> | null) {
    return (
        event?.image_thumbnail ||
        event?.image_medium ||
        event?.image ||
        event?.image_full ||
        event?.image_micro ||
        payload?.image ||
        null
    );
}

function getQueueGroupKey(item: QueueItem) {
    const payload = item.payload || {};
    if (payload.queueSource === 'manual_event_registration' && payload.batchKey) {
        return `manual:${payload.batchKey}`;
    }
    return `single:${item.id}`;
}

function compareQueueItems(a: QueueItem, b: QueueItem) {
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return Number(a.id) - Number(b.id);
}

function getManualBatchFingerprint(item: QueueItem) {
    const payload = item.payload || {};
    if (payload.queueSource !== 'manual_event_registration') return null;

    const actorUserId = payload.actorUserId || null;
    if (!actorUserId) return null;

    return {
        actorUserId,
        category: getPushCategory(item.category || payload.category),
    };
}

async function expandManualBatch(
    supabaseClient: any,
    groupItems: QueueItem[],
) {
    const sorted = [...groupItems].sort(compareQueueItems);
    const anchorItem = sorted[0];
    const fingerprint = getManualBatchFingerprint(anchorItem);
    const anchorCreatedAt = anchorItem.created_at ? new Date(anchorItem.created_at).getTime() : NaN;

    if (!fingerprint || !Number.isFinite(anchorCreatedAt)) {
        return groupItems;
    }

    const windowStart = new Date(anchorCreatedAt).toISOString();
    const windowEnd = new Date(anchorCreatedAt + MANUAL_BATCH_WINDOW_MS).toISOString();

    const { data, error } = await supabaseClient
        .from('notification_queue')
        .select('*')
        .eq('status', 'pending')
        .gte('created_at', windowStart)
        .lte('created_at', windowEnd)
        .limit(300);

    if (error) throw error;

    const expanded = new Map<number, QueueItem>();
    for (const item of [...groupItems, ...((data || []) as QueueItem[])]) {
        const itemFingerprint = getManualBatchFingerprint(item);
        if (
            itemFingerprint?.actorUserId === fingerprint.actorUserId &&
            itemFingerprint?.category === fingerprint.category
        ) {
            expanded.set(item.id, item);
        }
    }

    return Array.from(expanded.values()).sort(compareQueueItems);
}

function buildDisplayItem(item: QueueItem, event?: EventRow | null) {
    const payload = item.payload || {};
    const date = event?.start_date || event?.date || payload.date || null;
    const location = event?.location || payload.location || null;
    const title = event?.title || payload.title || item.title || '새 이벤트';
    const body = item.body || `${date || ''} ${getWeekday(date)} | ${location || '장소 미정'}`.trim();
    const siteUrl = getSiteUrl();
    const eventId = event?.id || item.event_id || payload.eventId || payload.event_id || null;

    return {
        eventId,
        title,
        body,
        url: eventId ? `${siteUrl}/calendar?id=${eventId}` : (payload.url || `${siteUrl}/v2`),
        image: getBestImage(event, payload),
        date,
        location,
        category: getPushCategory(event?.category || item.category || payload.category),
        genre: event?.genre || payload.genre || null,
        danceTags: event?.dance_tags || null,
    };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

        const now = new Date().toISOString();
        const { data: pendingItems, error: fetchError } = await supabaseClient
            .from('notification_queue')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .order('scheduled_at', { ascending: true })
            .order('created_at', { ascending: true })
            .limit(100);

        if (fetchError) throw fetchError;

        if (!pendingItems || pendingItems.length === 0) {
            return new Response(JSON.stringify({ message: 'No pending items' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const groups = new Map<string, QueueItem[]>();
        for (const item of pendingItems as QueueItem[]) {
            const key = getQueueGroupKey(item);
            groups.set(key, [...(groups.get(key) || []), item]);
        }

        console.log(`[Queue] Processing ${pendingItems.length} pending items as ${groups.size} push groups...`);

        const results = [];

        for (const [groupKey, groupItems] of groups.entries()) {
            const expandedGroupItems = await expandManualBatch(supabaseClient, groupItems);
            const groupIds = expandedGroupItems.map(item => item.id);
            let claimedIds: number[] = [];
            let claimedForFailure: QueueItem[] = [];
            try {
                const { data: claimedItems, error: claimError } = await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'processing', updated_at: new Date().toISOString() })
                    .in('id', groupIds)
                    .eq('status', 'pending')
                    .select('*');

                if (claimError) throw claimError;
                if (!claimedItems || claimedItems.length === 0) {
                    console.log(`[Queue] Group ${groupKey} already processed or claimed elsewhere.`);
                    continue;
                }

                const claimed = (claimedItems as QueueItem[]).sort(compareQueueItems);
                claimedForFailure = claimed;
                claimedIds = claimed.map(item => item.id);
                const forcedError = claimed.find(item => item.payload?.error_test === true);
                if (forcedError) {
                    console.error(`[Queue-Test] Forcing error for group ${groupKey}`);
                    throw new Error("REPRODUCED_QUEUE_ERROR: Intentional test failure");
                }

                const eventIds = Array.from(new Set(claimed.map(item => item.event_id).filter(Boolean).map(String)));
                const eventMap = new Map<string, EventRow>();

                if (eventIds.length > 0) {
                    const { data: events, error: eventError } = await supabaseClient
                        .from('events')
                        .select('id,title,date,start_date,location,category,genre,dance_tags,image,image_micro,image_thumbnail,image_medium,image_full,description')
                        .in('id', eventIds);

                    if (eventError) throw eventError;
                    (events || []).forEach((event: EventRow) => {
                        eventMap.set(String(event.id), event);
                    });
                }

                const items = claimed.map(item => buildDisplayItem(
                    item,
                    item.event_id ? eventMap.get(String(item.event_id)) : null
                ));

                const firstQueueItem = claimed[0];
                const firstPayload = firstQueueItem.payload || {};
                const firstItem = items[0];
                const category = firstItem.category || getPushCategory(firstQueueItem.category || firstPayload.category);
                const genres = Array.from(new Set(items.map(item => item.genre).filter(Boolean))).join(',');
                const batchKey = firstPayload.batchKey || groupKey;
                const tag = firstPayload.batchKey ? `manual-event-batch-${firstPayload.batchKey}` : `event-${firstItem.eventId || firstQueueItem.id}`;

                console.log(`[Queue] Invoking push for group ${groupKey}: ${claimed.length} item(s), title="${firstItem.title}"`);

                const { data, error: invokeError } = await supabaseClient.functions.invoke('send-push-notification', {
                    body: {
                        title: firstItem.title,
                        body: firstItem.body,
                        url: `${getSiteUrl()}/v2`,
                        userId: firstPayload.userId || 'ALL',
                        category,
                        genre: genres,
                        image: firstItem.image,
                        content: null,
                        items,
                        batchKey,
                        tag,
                        renotify: false,
                        adminOnly: firstPayload.adminOnly === true,
                    }
                });

                if (invokeError) throw invokeError;

                await supabaseClient
                    .from('notification_queue')
                    .update({ status: 'sent', updated_at: new Date().toISOString() })
                    .in('id', claimedIds);

                results.push({
                    key: groupKey,
                    ids: claimedIds,
                    status: 'sent',
                    result: data,
                });
            } catch (err: any) {
                console.error(`[Queue Error] Group ${groupKey}:`, err.message);

                const failedItems = claimedForFailure.length ? claimedForFailure : groupItems;
                await Promise.all(failedItems.map(item =>
                    supabaseClient
                        .from('notification_queue')
                        .update({
                            status: 'failed',
                            payload: {
                                ...(item.payload || {}),
                                failed_group_ids: claimedIds.length ? claimedIds : groupIds,
                                last_error: err.message,
                            },
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', item.id)
                ));

                results.push({ key: groupKey, ids: claimedIds.length ? claimedIds : groupIds, status: 'failed', error: err.message });
            }
        }

        return new Response(JSON.stringify({ custom_results: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err: any) {
        console.error('[Fatal Queue Error]', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});
