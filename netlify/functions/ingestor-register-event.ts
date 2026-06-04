import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;
const eventImageBucket = 'images';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function getIngestorOwnerUserId() {
  const { data, error } = await supabaseAdmin
    .from('board_admins')
    .select('user_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`관리자 작성자 계정 조회 실패: ${error.message}`);
  if (!data?.user_id) throw new Error('관리자 작성자 계정을 찾을 수 없습니다.');
  return data.user_id;
}

function getEventDate(eventData: any) {
  return String(eventData?.start_date || eventData?.date || '').slice(0, 10);
}

async function markScrapedCollected(scrapedEventId: string, structuredData: Record<string, unknown> = {}) {
  const { data: current } = await supabaseAdmin
    .from('scraped_events')
    .select('structured_data')
    .eq('id', scrapedEventId)
    .maybeSingle();

  const mergedStructuredData = {
    ...((current as any)?.structured_data || {}),
    ...(structuredData || {}),
  };

  const { error } = await supabaseAdmin
    .from('scraped_events')
    .update({
      is_collected: true,
      status: 'collected',
      structured_data: mergedStructuredData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', scrapedEventId);

  if (error) throw new Error(`수집 후보 완료 처리 실패: ${error.message}`);
}

async function findExistingBySourceAndDate(sourceUrl: string, date: string) {
  if (!sourceUrl || !date) return null;

  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id,title,link1,date,start_date,end_date,image,image_micro,image_thumbnail,image_medium,image_full,storage_path')
    .eq('link1', sourceUrl)
    .or(`date.eq.${date},start_date.eq.${date},and(start_date.lte.${date},end_date.gte.${date})`)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`운영 DB 중복 확인 실패: ${error.message}`);
  return data;
}

async function findExistingById(existingEventId: string | number | null | undefined) {
  if (!existingEventId) return null;
  const { data, error } = await supabaseAdmin
    .from('events')
    .select('id,title,link1,date,start_date,end_date,image,image_micro,image_thumbnail,image_medium,image_full,storage_path')
    .eq('id', existingEventId)
    .maybeSingle();

  if (error) throw new Error(`기존 이벤트 조회 실패: ${error.message}`);
  return data;
}

function getPublicImageUrl(path: string) {
  return supabaseAdmin.storage.from(eventImageBucket).getPublicUrl(path).data.publicUrl;
}

function normalizeImageFields(eventData: any, fallbackImageUrl: string | null) {
  const primary = eventData.image_full || eventData.image_medium || eventData.image_thumbnail || eventData.image || fallbackImageUrl || null;
  return {
    image: eventData.image || primary,
    image_micro: eventData.image_micro || eventData.image_thumbnail || primary,
    image_thumbnail: eventData.image_thumbnail || eventData.image_medium || primary,
    image_medium: eventData.image_medium || eventData.image_full || primary,
    image_full: eventData.image_full || eventData.image || primary,
    storage_path: eventData.storage_path || null,
  };
}

async function fetchImageBuffer(imageUrl: string | null) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:image')) {
    const base64 = imageUrl.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64, 'base64');
  }
  if (!/^https?:\/\//i.test(imageUrl)) return null;

  const res = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'SwingEnjoyIngestor/1.0',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function createStoredEventImages(scrapedEventId: string, sourceImageUrl: string | null) {
  const sourceBuffer = await fetchImageBuffer(sourceImageUrl);
  if (!sourceBuffer) return null;

  const safeId = scrapedEventId.replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || 'candidate';
  const storagePath = `social-events/${Date.now()}_${safeId}`;
  const variants = [
    { key: 'image_micro', name: 'micro', width: 96, quality: 60 },
    { key: 'image_thumbnail', name: 'thumbnail', width: 360, quality: 72 },
    { key: 'image_medium', name: 'medium', width: 720, quality: 78 },
    { key: 'image_full', name: 'full', width: 1440, quality: 84 },
  ] as const;

  const uploaded: Record<string, string> = {};
  await Promise.all(variants.map(async (variant) => {
    const buffer = await sharp(sourceBuffer)
      .rotate()
      .resize({ width: variant.width, withoutEnlargement: true })
      .webp({ quality: variant.quality })
      .toBuffer();
    const path = `${storagePath}/${variant.name}.webp`;
    const { error } = await supabaseAdmin.storage
      .from(eventImageBucket)
      .upload(path, buffer, { contentType: 'image/webp', upsert: true });
    if (error) throw new Error(`이미지 업로드 실패(${variant.name}): ${error.message}`);
    uploaded[variant.key] = getPublicImageUrl(path);
  }));

  return {
    image: uploaded.image_full,
    image_micro: uploaded.image_micro,
    image_thumbnail: uploaded.image_thumbnail,
    image_medium: uploaded.image_medium,
    image_full: uploaded.image_full,
    storage_path: storagePath,
  };
}

function getMissingImageUpdates(existing: any, nextImages: Record<string, string | null>) {
  const updates: Record<string, string> = {};
  (['image', 'image_micro', 'image_thumbnail', 'image_medium', 'image_full', 'storage_path'] as const).forEach((key) => {
    const nextValue = nextImages[key];
    if (!existing?.[key] && nextValue) updates[key] = nextValue;
  });
  return updates;
}

async function repairExistingEventImages(existing: any, nextImages: Record<string, string | null>) {
  const updates = getMissingImageUpdates(existing, nextImages);
  if (!Object.keys(updates).length) return existing;

  const { data, error } = await supabaseAdmin
    .from('events')
    .update(updates)
    .eq('id', existing.id)
    .select('id,title,link1,date,start_date,end_date,image,image_micro,image_thumbnail,image_medium,image_full,storage_path')
    .maybeSingle();

  if (error) throw new Error(`기존 이벤트 이미지 보정 실패: ${error.message}`);
  return data || { ...existing, ...updates };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const scrapedEventId = String(body.scrapedEventId || '').trim();
    const eventData = body.eventData || {};
    const scrapedStructuredData = body.scrapedStructuredData || {};
    const existingEventId = body.existingEventId || null;
    const dryRun = body.dryRun === true;

    if (!scrapedEventId) return json(400, { error: 'scrapedEventId가 필요합니다.' });
    if (!eventData?.title || !getEventDate(eventData)) {
      return json(400, { error: '이벤트 제목과 날짜가 필요합니다.' });
    }

    const { data: scrapedEvent, error: scrapedError } = await supabaseAdmin
      .from('scraped_events')
      .select('id,source_url,poster_url,status,is_collected,structured_data')
      .eq('id', scrapedEventId)
      .maybeSingle();

    if (scrapedError) throw new Error(`수집 후보 조회 실패: ${scrapedError.message}`);
    if (!scrapedEvent) return json(404, { error: '수집 후보를 찾을 수 없습니다.' });
    if ((scrapedEvent as any).status === 'excluded') {
      return json(400, { error: '제외 처리된 후보는 등록할 수 없습니다.' });
    }

    const ownerUserId = await getIngestorOwnerUserId();
    const sourceUrl = String((scrapedEvent as any).source_url || eventData.link1 || '');
    const date = getEventDate(eventData);
    const fallbackImageUrl = String((scrapedEvent as any).poster_url || eventData.image || eventData.image_full || '') || null;
    let imageFields = normalizeImageFields(eventData, fallbackImageUrl);
    const hasCompleteStoredImages = Boolean(
      imageFields.image_micro &&
      imageFields.image_thumbnail &&
      imageFields.image_medium &&
      imageFields.image_full &&
      imageFields.storage_path
    );

    if (!dryRun && fallbackImageUrl && !hasCompleteStoredImages) {
      try {
        const storedImages = await createStoredEventImages(scrapedEventId, fallbackImageUrl);
        if (storedImages) imageFields = storedImages;
      } catch (imageError: any) {
        console.error('[ingestor-register-event] image store failed, falling back to source URL:', imageError?.message || imageError);
      }
    }

    const explicitExisting = await findExistingById(existingEventId);
    const existing = explicitExisting || await findExistingBySourceAndDate(sourceUrl, date);

    if (dryRun) {
      return json(200, {
        dryRun: true,
        wouldInsert: !existing,
        owner_user_id: ownerUserId,
        existing: existing || null,
      });
    }

    if (existing) {
      const repaired = await repairExistingEventImages(existing, imageFields);
      await markScrapedCollected(scrapedEventId, scrapedStructuredData);
      return json(200, {
        skipped: true,
        repaired: Boolean(repaired?.image || repaired?.image_thumbnail || repaired?.image_full),
        reason: explicitExisting
          ? '기존 이벤트를 재등록 대상으로 보고 이미지/완료 상태를 보정했습니다.'
          : '이미 같은 원본 URL과 날짜로 등록된 이벤트가 있어 이미지/완료 상태만 보정했습니다.',
        event: repaired,
      });
    }

    const finalPayload = {
      ...eventData,
      ...imageFields,
      date,
      start_date: String(eventData.start_date || date).slice(0, 10),
      link1: sourceUrl,
      organizer: eventData.organizer || '익명',
      organizer_name: eventData.organizer_name || '관리자',
      user_id: ownerUserId,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('events')
      .insert([finalPayload])
      .select()
      .maybeSingle();

    if (insertError) throw new Error(insertError.message);

    await markScrapedCollected(scrapedEventId, scrapedStructuredData);

    return json(201, {
      event: inserted,
      owner_user_id: ownerUserId,
    });
  } catch (error: any) {
    console.error('[ingestor-register-event] error:', error);
    return json(500, { error: error?.message || '등록 중 오류가 발생했습니다.' });
  }
};
