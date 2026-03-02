import { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
    const { httpMethod, queryStringParameters } = event;

    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const targetUrl = queryStringParameters?.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }

    try {
        // Basic validation
        new URL(targetUrl);

        // Fetch the target page html
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.google.com/'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} `);
        }

        const html = await response.text();

        // Extract Title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i) ||
            html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
        let title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : '';
        title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

        // Extract Description
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        let description = descMatch && descMatch[1] ? descMatch[1].trim() : '';
        description = description.replace(/&amp;/g, '&').replace(/&quot;/g, '"');

        // Extract Logo / OG Image (Fallback)
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        const twitterImageMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
        const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ||
            html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);

        let image_url = null;
        if (ogImageMatch && ogImageMatch[1]) {
            image_url = ogImageMatch[1];
        } else if (twitterImageMatch && twitterImageMatch[1]) {
            image_url = twitterImageMatch[1];
        } else if (iconMatch && iconMatch[1]) {
            image_url = iconMatch[1];
        }

        if (image_url && !image_url.startsWith('http')) {
            const baseUrl = new URL(targetUrl);
            image_url = new URL(image_url, baseUrl.origin).toString();
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                url: targetUrl,
                title,
                description,
                image_url,
                success: true
            })
        };

    } catch (error) {
        console.error(`[fetch-og-image] Error fetching ${targetUrl}:`, error);

        // Return 200 even on error to allow frontend to handle it gracefully
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                url: targetUrl,
                success: false,
                error: 'Failed to extract info from URL',
                details: error instanceof Error ? error.message : String(error)
            })
        };
    }
};
