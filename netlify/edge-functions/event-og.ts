/**
 * Event OG Edge Function
 * ?event=ID 로 접근하는 봇(카카오, 페이스북 등)에게 이벤트별 OG 태그를 반환합니다.
 * 일반 사용자는 그대로 SPA로 통과됩니다.
 */

const BOT_UA =
  /facebookexternalhit|Twitterbot|kakaotalk|kakao|LinkedInBot|WhatsApp|Slack|TelegramBot|Discordbot|Googlebot|bingbot|Yandex|DuckDuckBot|Applebot|Pinterest|Snapchat/i;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('event');

  // ?event= 파라미터 없으면 SPA로 통과
  if (!eventId || !/^\d+$/.test(eventId)) {
    return context.next();
  }

  const ua = request.headers.get('user-agent') || '';

  // 일반 사용자는 SPA로 통과 (SPA가 ?event= 처리)
  if (!BOT_UA.test(ua)) {
    return context.next();
  }

  // 봇: Supabase에서 이벤트 데이터 가져오기
  const supabaseUrl = Deno.env.get('VITE_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('VITE_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return context.next();
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/events?id=eq.${eventId}&select=id,title,location,date,start_date,image_medium,image,image_thumbnail`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      }
    );

    const events = await res.json();
    const event = Array.isArray(events) ? events[0] : null;

    if (!event) {
      return context.next();
    }

    const title = escapeHtml(event.title || '댄스빌보드 이벤트');
    const description = escapeHtml(
      `📍 ${event.location || ''}  📅 ${event.date || event.start_date || ''}`
    );
    const imageUrl =
      event.image_medium ||
      event.image ||
      event.image_thumbnail ||
      'https://swingenjoy.com/kakao-share-card.png';
    const pageUrl = `https://swingenjoy.com/?event=${eventId}`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${title} - 댄스빌보드</title>
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="400">
  <meta property="og:site_name" content="댄스빌보드">
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:title" content="${title}">
  <meta property="twitter:description" content="${description}">
  <meta property="twitter:image" content="${imageUrl}">
</head>
<body>
  <p>Loading...</p>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  } catch (_e) {
    return context.next();
  }
};

export const config = { path: '/' };
