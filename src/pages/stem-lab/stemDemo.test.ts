import { describe, expect, it } from 'vitest';
import {
    createInitialStemMix,
    formatStemTime,
    getLoopPositionSeconds,
    getStemGain,
    STEM_DEFINITIONS,
    STEM_DEMO_BEATS,
    STEM_DEMO_SECONDS,
} from './stemDemo';

describe('stem player demo model', () => {
    it('keeps all four stems inside one shared loop boundary', () => {
        expect(STEM_DEFINITIONS.map((stem) => stem.id)).toEqual(['drums', 'bass', 'piano', 'guitar']);
        STEM_DEFINITIONS.forEach((stem) => {
            expect(stem.events.length).toBeGreaterThan(0);
            stem.events.forEach((event) => {
                expect(event.position).toBeGreaterThanOrEqual(0);
                expect(event.position).toBeLessThan(STEM_DEMO_BEATS);
            });
        });
    });

    it('applies mute and solo without changing the transport', () => {
        const mix = createInitialStemMix();
        expect(getStemGain('drums', mix, null)).toBeCloseTo(0.78);
        expect(getStemGain('drums', mix, 'bass')).toBe(0);
        expect(getStemGain('bass', mix, 'bass')).toBeCloseTo(0.84);

        mix.bass.enabled = false;
        expect(getStemGain('bass', mix, 'bass')).toBe(0);
    });

    it('wraps the visible playhead at the exact loop duration', () => {
        const anchor = 12;
        expect(getLoopPositionSeconds(anchor - 1, anchor)).toBe(0);
        expect(getLoopPositionSeconds(anchor + 1.25, anchor)).toBeCloseTo(1.25);
        expect(getLoopPositionSeconds(anchor + STEM_DEMO_SECONDS + 0.5, anchor)).toBeCloseTo(0.5);
        expect(formatStemTime(STEM_DEMO_SECONDS)).toBe('0:07');
    });
});
