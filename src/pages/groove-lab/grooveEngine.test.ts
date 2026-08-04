import { describe, expect, it } from 'vitest';
import {
    buildGrooveBar,
    getAdaptiveSwingRatio,
    getOffbeatPosition,
    getSwingRatio,
    GROOVE_FAMILIES,
    GROOVE_PRESETS,
} from './grooveEngine';

describe('grooveEngine', () => {
    it('uses a tempo-dependent ride ratio with the reported 2:1 landmark near 200 BPM', () => {
        expect(getAdaptiveSwingRatio(80)).toBeGreaterThan(getAdaptiveSwingRatio(160));
        expect(getAdaptiveSwingRatio(160)).toBeGreaterThan(getAdaptiveSwingRatio(240));
        expect(getAdaptiveSwingRatio(200)).toBe(2);
    });

    it('places strict triplet offbeats at two thirds of a beat', () => {
        expect(getSwingRatio('triplet', 120)).toBe(2);
        expect(getOffbeatPosition(2)).toBeCloseTo(2 / 3, 8);
    });

    it('builds the standard ride pattern with skip notes after beats 2 and 4 and hats on 2 and 4', () => {
        const events = buildGrooveBar('ride', 'triplet', 120);
        const ridePositions = events.filter((item) => item.voice === 'ride').map((item) => item.position);
        const hatPositions = events.filter((item) => item.voice === 'hat').map((item) => item.position);

        expect(ridePositions).toEqual([0, 1, 1 + (2 / 3), 2, 3, 3 + (2 / 3)]);
        expect(hatPositions).toEqual([1, 3]);
    });

    it('keeps walking bass and rhythm guitar on four quarter-note pulses', () => {
        for (const presetId of ['bass', 'guitar'] as const) {
            expect(buildGrooveBar(presetId, 'adaptive', 92).map((item) => item.position)).toEqual([0, 1, 2, 3]);
        }
    });

    it('distinguishes all-three triplet practice from middle-rest shuffle', () => {
        const triplet = buildGrooveBar('triplet', 'straight', 120);
        const shuffleHat = buildGrooveBar('shuffle', 'straight', 120).filter((item) => item.voice === 'hat');

        expect(triplet).toHaveLength(12);
        expect(shuffleHat).toHaveLength(8);
        expect(shuffleHat.slice(0, 2).map((item) => item.position)).toEqual([0, 2 / 3]);
    });

    it('places the Charleston response on the swung upbeat after beat 2', () => {
        const events = buildGrooveBar('piano', 'triplet', 120);
        expect(events.map((item) => item.position)).toEqual([0, 1 + (2 / 3)]);
    });

    it('builds first-and-third-partial shuffle ostinatos for bass, piano, and guitar', () => {
        for (const presetId of ['shuffle-bass', 'boogie-piano', 'blues-guitar'] as const) {
            const positions = buildGrooveBar(presetId, 'straight', 120).map((item) => item.position);
            expect(positions).toEqual([
                0, 2 / 3,
                1, 1 + (2 / 3),
                2, 2 + (2 / 3),
                3, 3 + (2 / 3),
            ]);
        }
    });

    it('distinguishes 12/8 all-three-partial hats from shuffle hats', () => {
        const slowBluesHats = buildGrooveBar('slow-blues', 'straight', 120)
            .filter((item) => item.voice === 'hat');
        const shuffleHats = buildGrooveBar('shuffle', 'straight', 120)
            .filter((item) => item.voice === 'hat');

        expect(slowBluesHats).toHaveLength(12);
        expect(shuffleHats).toHaveLength(8);
        expect(slowBluesHats.slice(0, 3).map((item) => item.position)).toEqual([0, 1 / 3, 2 / 3]);
    });

    it('separates bend-capable blue-note voices from fixed-key piano approximations', () => {
        const bendEvents = buildGrooveBar('blue-note-bend', 'triplet', 120);
        const pianoEvents = buildGrooveBar('blue-note-piano', 'triplet', 120);

        expect(bendEvents.every((item) => item.voice === 'blue-note')).toBe(true);
        expect(pianoEvents.every((item) => item.voice === 'blue-piano')).toBe(true);
        expect(bendEvents.map((item) => item.position)).toEqual(pianoEvents.map((item) => item.position));
    });

    it('keeps every documented preset assigned to a family and buildable', () => {
        const familyIds = new Set(GROOVE_FAMILIES.map((family) => family.id));

        GROOVE_PRESETS.forEach((preset) => {
            expect(familyIds.has(preset.family)).toBe(true);
            expect(buildGrooveBar(preset.id, preset.recommendedFeel, 140).length).toBeGreaterThan(0);
        });
    });
});
