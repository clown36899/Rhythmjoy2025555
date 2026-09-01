import { describe, expect, it } from 'vitest';
import {
    buildGrooveBar,
    getAdaptiveSwingRatio,
    getGrooveBeatsPerBar,
    getGrooveLoopBeats,
    getGrooveLoopBars,
    getOffbeatPosition,
    getSambaSubdivisionOffsets,
    getSwingRatio,
    GROOVE_FAMILIES,
    GROOVE_PRESETS,
} from './grooveEngine';

describe('grooveEngine', () => {
    it('builds the selectable jazz section from canonical ride, guide, bass, piano, and guitar layers', () => {
        const events = buildGrooveBar('swing-ensemble', 'adaptive', 140);
        const voices = new Set(events.map((item) => item.voice));

        expect(voices).toEqual(new Set(['click', 'ride', 'hat', 'bass', 'piano', 'guitar']));
        expect(events.filter((item) => item.voice === 'bass').map((item) => item.position)).toEqual([0, 1, 2, 3]);
        expect(events.filter((item) => item.voice === 'guitar').map((item) => item.position)).toEqual([0, 1, 2, 3]);
        const offbeat = getOffbeatPosition(getAdaptiveSwingRatio(140));
        const guideEvents = events.filter((item) => item.id.startsWith('swing-guide-'));
        expect(guideEvents.map((item) => item.position)).toEqual([
            0, offbeat,
            1, 1 + offbeat,
            2, 2 + offbeat,
            3, 3 + offbeat,
        ]);
        expect(guideEvents.find((item) => item.id === 'swing-guide-off-1')?.gain)
            .toBeGreaterThan(guideEvents.find((item) => item.id === 'swing-guide-on-1')?.gain ?? 0);
        expect(guideEvents.filter((item) => item.id.startsWith('swing-guide-backbeat-')).map((item) => item.position)).toEqual([1, 3]);
        expect(events.filter((item) => item.voice === 'ride').map((item) => item.position)).toEqual([
            0,
            1,
            1 + offbeat,
            2,
            3,
            3 + offbeat,
        ]);
        expect(events.filter((item) => item.voice === 'hat').map((item) => item.position)).toEqual([1, 3]);
        expect(events.filter((item) => item.voice === 'piano').map((item) => item.position)).toEqual([0, 1 + (2 / 3)]);
    });

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
            expect(GROOVE_PRESETS.find((preset) => preset.id === presetId)?.feelOptions).toBeUndefined();
        }
    });

    it('does not expose the drummer ride curve as a universal instrument swing control', () => {
        expect(GROOVE_PRESETS.find((preset) => preset.id === 'ride')?.feelOptions).toEqual(['adaptive', 'triplet', 'straight']);
        expect(GROOVE_PRESETS.find((preset) => preset.id === 'piano')?.feelOptions).toEqual(['triplet', 'straight']);
        expect(GROOVE_PRESETS.find((preset) => preset.id === 'piano')?.feelOptions).not.toContain('adaptive');
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

        expect(GROOVE_FAMILIES).toHaveLength(8);
        expect(GROOVE_PRESETS).toHaveLength(29);

        GROOVE_PRESETS.forEach((preset) => {
            expect(familyIds.has(preset.family)).toBe(true);
            expect(buildGrooveBar(preset.id, preset.recommendedFeel, 140).length).toBeGreaterThan(0);
        });
    });

    it('does not label one synthesized voice as multiple reproduced instruments', () => {
        GROOVE_PRESETS.forEach((preset) => {
            expect(preset.instrument, `${preset.id} conflates multiple instrument models`).not.toContain('·');
        });
    });

    it('preserves opposite 3-2 and 2-3 son-clave directions', () => {
        expect(getGrooveLoopBeats('son-clave-32')).toBe(8);
        expect(getGrooveLoopBeats('son-clave-23')).toBe(8);
        expect(buildGrooveBar('son-clave-32', 'straight', 120).map((item) => item.position))
            .toEqual([0, 1.5, 3, 5, 6]);
        expect(buildGrooveBar('son-clave-23', 'straight', 120).map((item) => item.position))
            .toEqual([1, 2, 4, 5.5, 7]);
    });

    it('represents the bossa guitar fragment as two 2/4 measures without stretching its four beats', () => {
        expect(getGrooveLoopBeats('bossa-guitar')).toBe(4);
        expect(getGrooveBeatsPerBar('bossa-guitar')).toBe(2);
        expect(getGrooveLoopBars('bossa-guitar')).toBe(2);
        expect(buildGrooveBar('bossa-guitar', 'straight', 120).every((item) => item.position < 4)).toBe(true);
    });

    it('keeps every event inside its preset-specific loop length', () => {
        GROOVE_PRESETS.forEach((preset) => {
            const loopBeats = getGrooveLoopBeats(preset.id);
            expect(buildGrooveBar(preset.id, preset.recommendedFeel, 140).every((item) => (
                item.position >= 0 && item.position < loopBeats
            )), `${preset.id} emits outside ${loopBeats} beats`).toBe(true);
        });
    });

    it('gives funk and samba their full sixteenth-note reference layers', () => {
        expect(buildGrooveBar('funk-drums', 'straight', 96).filter((item) => item.voice === 'hat')).toHaveLength(16);
        expect(buildGrooveBar('samba-pandeiro', 'straight', 96)).toHaveLength(16);
    });

    it('separates funk ghost strokes and conga heel, toe, slap, and open articulations', () => {
        const funkGhosts = buildGrooveBar('funk-drums', 'straight', 96).filter((item) => item.id.startsWith('funk-ghost'));
        const conga = buildGrooveBar('conga-tumbao', 'straight', 96);

        expect(funkGhosts.every((item) => item.variant === 1 && item.gain <= 0.25)).toBe(true);
        expect(conga.map((item) => item.variant)).toEqual([0, 1, 2, 1, 0, 1, 3, 3]);
        expect(new Set(conga.map((item) => item.variant))).toEqual(new Set([0, 1, 2, 3]));
    });

    it('uses the archetypal 2-and / beat-4 anticipated Cuban bass pattern', () => {
        const tumbaoBass = buildGrooveBar('tumbao-bass', 'straight', 100);
        expect(tumbaoBass.map((item) => item.position)).toEqual([1.5, 3]);
        expect(tumbaoBass.map((item) => item.variant)).toEqual([40, 41]);
        expect(tumbaoBass[1].gain).toBeGreaterThan(tumbaoBass[0].gain);
        expect(tumbaoBass[1].durationSeconds).toBeCloseTo(0.6, 8);
        expect(buildGrooveBar('tumbao-bass', 'straight', 200)[1].durationSeconds).toBeCloseTo(0.3, 8);
    });

    it('renders the measured samba reference as an uneven grid with the third and fourth onsets anticipated', () => {
        const offsets = getSambaSubdivisionOffsets();
        const sambaPositions = buildGrooveBar('samba-pandeiro', 'straight', 96)
            .slice(0, 4)
            .map((item) => item.position);

        expect(offsets).toHaveLength(4);
        expect(offsets[1]).toBeCloseTo(0.23, 2);
        expect(offsets[2]).toBeLessThan(0.5);
        expect(offsets[3]).toBeLessThan(0.75);
        expect(sambaPositions).toEqual(offsets);
    });
});
