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

    // Detect suspicious Linux crawlers (e.g., Linux + X11 + Chrome without desktop characteristics)
    const isSuspiciousLinux = userAgent.includes("linux x86_64") &&
        userAgent.includes("x11") &&
        userAgent.includes("chrome") &&
        !userAgent.includes("android");

    if (blockedBots.some(bot => userAgent.includes(bot)) || isSuspiciousLinux) {
        console.log(`[Edge Function] Blocked suspicious traffic: ${userAgent}`);
        return new Response("Access Denied: Your client is identified as a potential bot or crawler.", {
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
