import type { Context } from "@netlify/edge-functions";

export default async (request: Request, context: Context) => {
    const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";

    // Block aggressive or unwanted bots/crawlers
    const blockedBots = [
        "ahrefsbot",
        "mj12bot",
        "semrushbot",
        "rogerbot",
        "dotbot",
        "petalbot",
        "aspiegelbot",
        "blexbot",
        "seekportbot",
        "megaindex.ru",
        "zoominfobot",
        "mail.ru_bot",
        "yandexbot",
        "baiduspider",
        "sogou",
        "exabot",
        "facebot",
        "ia_archiver"
    ];

    if (blockedBots.some(bot => userAgent.includes(bot))) {
        console.log(`[Edge Function] Blocked bot: ${userAgent}`);
        return new Response("Access Denied: Your bot/crawler is not allowed on this site.", {
            status: 403,
            headers: { "Content-Type": "text/plain" },
        });
    }

    // Allow regular traffic to proceed
    return;
};

export const config = {
    path: "/*",
    excludedPath: ["/assets/*", "/_netlify/*", "/favicon.ico"]
};
