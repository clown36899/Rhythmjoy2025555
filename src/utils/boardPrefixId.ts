export type BoardPrefixId = number | string;

export function parseBoardPrefixId(value: string): BoardPrefixId | null {
    const normalized = value.trim();
    if (!normalized) return null;

    if (/^\d+$/.test(normalized)) {
        const numeric = Number(normalized);
        if (Number.isSafeInteger(numeric)) return numeric;
    }

    return normalized;
}

export function isNoticeBoardPrefixId(value: BoardPrefixId | null | undefined) {
    return String(value ?? '') === '1';
}
