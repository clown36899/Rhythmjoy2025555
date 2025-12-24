/**
 * Simple hash function (cyrb53) to generate a 64-bit hash from a string.
 */
const hashString = (str: string, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};

/**
 * Generates a stable browser fingerprint based on various hardware and browser attributes.
 * This aims to remain consistent even in incognito/secret mode for the same device/browser.
 */
export const getStableFingerprint = (): string => {
    const components = [
        navigator.userAgent,
        navigator.language,
        window.screen.width + 'x' + window.screen.height,
        window.screen.colorDepth,
        new Date().getTimezoneOffset(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        navigator.hardwareConcurrency || 'unknown',
        // navigator.deviceMemory || 'unknown', // Available in Chrome-based browsers
    ];

    const fingerprintSource = components.join('|');
    return hashString(fingerprintSource);
};
