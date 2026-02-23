import type { Context } from "@netlify/edge-functions";

export default async (request: Request, context: Context) => {
    const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";

    // Block aggressive or unwanted bots/crawlers
    const blockedBots = [
        "ahrefsbot", "mj12bot", "semrushbot", "rogerbot", "dotbot", "petalbot",
        "aspiegelbot", "blexbot", "seekportbot", "megaindex.ru", "zoominfobot",
        "mail.ru_bot", "yandexbot", "baiduspider", "sogou", "exabot", "facebot",
        "ia_archiver", "headlesschrome", "puppeteer", "phantomjs", "python",
        "requests", "node-fetch", "axios", "go-http-client", "curl", "wget"
    ];

    // Detect suspicious patterns (Note: Billboard players may use Linux X11 Chrome)
    // To avoid false positives, we focus only on identifiable bot names or headless drivers.
    if (blockedBots.some(bot => userAgent.includes(bot))) {
        console.log(`[Edge Function] Blocked known bot: ${userAgent}`);
        return new Response("Access Denied: Your client is identified as a known bot or crawler.", {
            status: 403,
            headers: { "Content-Type": "text/plain" },
        });
    }

    // Allow regular traffic to proceed
    return;
};

// export const config = {
//     path: "/*",
//     excludedPath: ["/assets/*", "/_netlify/*", "/favicon.ico"]
// };
