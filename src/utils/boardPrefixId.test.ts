import { describe, expect, it } from 'vitest';
import { isNoticeBoardPrefixId, parseBoardPrefixId } from './boardPrefixId';

describe('board prefix identifiers', () => {
    it('keeps legacy numeric prefix ids numeric', () => {
        expect(parseBoardPrefixId('1')).toBe(1);
        expect(parseBoardPrefixId('21')).toBe(21);
        expect(isNoticeBoardPrefixId(parseBoardPrefixId('1'))).toBe(true);
    });

    it('preserves UUID prefix ids instead of converting them to NaN', () => {
        const uuid = 'b8e2e936-f6c6-487e-8880-3fa0c1ae0d5a';

        expect(parseBoardPrefixId(uuid)).toBe(uuid);
        expect(Number.isNaN(parseBoardPrefixId(uuid))).toBe(false);
        expect(isNoticeBoardPrefixId(parseBoardPrefixId(uuid))).toBe(false);
    });

    it('maps an empty select value to no prefix', () => {
        expect(parseBoardPrefixId('')).toBeNull();
        expect(parseBoardPrefixId('   ')).toBeNull();
    });
});
