/**
 * Sanitizes an address string for map search queries (especially Google Maps).
 * Removes detail information like floor, basement, room number which often confuse the geocoder.
 * 
 * @param address Full address string
 * @returns Sanitized address string
 */
export function sanitizeAddressForMap(address: string): string {
    if (!address) return '';

    let sanitized = address;

    // 0. Smart Truncation for Road Addresses (도로명 주소)
    // Pattern: '...로' or '...길' followed by a number (and optional dash number)
    // Matches: "서강로11길 18" -> Keeps up to "18", discards "지하 1층"
    const roadAddrMatch = sanitized.match(/^(.*?[가-힣]+(?:로|길)\s*\d+(?:-\d+)?)(?=\s|$)/);

    if (roadAddrMatch) {
        return roadAddrMatch[1].trim();
    }

    // Fallback sanitization for Jibun addresses or others
    sanitized = sanitized.replace(/\s*지하\s*\d*.*$/, '');
    sanitized = sanitized.replace(/\s*지층.*$/, '');
    sanitized = sanitized.replace(/\s*B\d+.*$/, '');
    sanitized = sanitized.replace(/\s*\d+층.*$/, '');
    sanitized = sanitized.replace(/\s*\d+F.*$/i, '');
    sanitized = sanitized.replace(/\s*\d+호.*$/, '');

    // Remove building dong suffixes like "가동", "A동", "101동" at the end
    // Be careful not to match "서교동" (neighborhood) which is usually early in string. 
    // This regex targets 'dong' at the end of string or before other removed parts.
    sanitized = sanitized.replace(/\s+[가-힣A-Z0-9]+동\s*$/, '');

    return sanitized.trim();
}
