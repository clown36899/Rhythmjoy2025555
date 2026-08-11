import { describe, expect, it } from 'vitest';
import {
    applyPickupPositionComb,
    CLAVINET_AMPLIFIER_SHELVES,
    generateKarplusStrongSamples,
    getPianoUnisonFrequencies,
    getPickupPositionDelaySamples,
    getPluckPositionDelaySamples,
    getShuffleGuitarMultiples,
    GROOVE_AUDIO_VOICES,
    PANDEIRO_ARTICULATIONS,
} from './grooveAudio';
import { buildGrooveBar, GROOVE_PRESETS } from './grooveEngine';
import {
    estimateFundamentalFrequency,
    measureSignal,
} from './grooveQuality';

describe('groove audio quality', () => {
    it('maps pluck position to the one-way fraction of the round-trip string delay', () => {
        expect(getPluckPositionDelaySamples(400, 0.25)).toBe(50);
        expect(getPluckPositionDelaySamples(400, 0.5)).toBe(100);
    });

    it('maps magnetic pickup position to a separate STK-style output comb delay', () => {
        expect(getPickupPositionDelaySamples(400, 0.25)).toBe(50);
        expect(getPickupPositionDelaySamples(400, 0.4)).toBe(80);
        const stringOnly = generateKarplusStrongSamples({
            sampleRate: 44100, frequency: 110, duration: 0.3, damping: 0.994, brightness: 0.55, seed: 31,
            pluckPosition: 0.24,
        });
        const electricPickup = generateKarplusStrongSamples({
            sampleRate: 44100, frequency: 110, duration: 0.3, damping: 0.994, brightness: 0.55, seed: 31,
            pluckPosition: 0.24, pickupPosition: 0.22,
        });

        expect(electricPickup).not.toEqual(stringOnly);
        expect(measureSignal(electricPickup).finite).toBe(true);
        expect(measureSignal(electricPickup).peak).toBeLessThanOrEqual(0.881);
    });

    it('cancels the fifth Clavinet harmonic while retaining a neighboring harmonic', () => {
        const roundTrip = 400;
        const length = 2000;
        const sinusoid = (harmonic: number) => Float32Array.from(
            { length },
            (_, index) => Math.sin((2 * Math.PI * harmonic * index) / roundTrip),
        );
        const fifth = applyPickupPositionComb(sinusoid(5), roundTrip, 0.4).slice(80);
        const fourth = applyPickupPositionComb(sinusoid(4), roundTrip, 0.4).slice(80);
        const rms = (samples: Float32Array) => Math.sqrt(
            samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
        );

        expect(rms(fifth)).toBeLessThan(0.000001);
        expect(rms(fourth)).toBeGreaterThan(0.5);
    });

    it('keeps the measured Clavinet amplifier shelves separate from unimplemented tone switches', () => {
        expect(CLAVINET_AMPLIFIER_SHELVES).toEqual({
            low: { frequency: 130, gain: -3 },
            high: { frequency: 4000, gain: 3 },
        });
    });

    it('assigns named pandeiro strokes to the four samba subdivision roles', () => {
        expect(PANDEIRO_ARTICULATIONS).toEqual(['tung', 'tchi', 'pa', 'PA']);
    });

    it('uses two-note root-fifth and root-sixth guitar shuffle voicings', () => {
        expect(getShuffleGuitarMultiples(10)).toEqual([1, 1.5]);
        expect(getShuffleGuitarMultiples(11)).toEqual([1, 5 / 3]);
    });

    it('uses one, two, and three near-unison piano strings across the register', () => {
        expect(getPianoUnisonFrequencies(98)).toEqual([98]);
        expect(getPianoUnisonFrequencies(174.61)).toHaveLength(2);
        expect(getPianoUnisonFrequencies(261.63)).toHaveLength(3);

        for (const frequency of [174.61, 261.63, 392]) {
            const unisons = getPianoUnisonFrequencies(frequency);
            expect(unisons.reduce((sum, item) => sum + item, 0) / unisons.length).toBeCloseTo(frequency, 8);
            expect(Math.max(...unisons) - Math.min(...unisons)).toBeGreaterThanOrEqual(0.1);
            expect(Math.max(...unisons) - Math.min(...unisons)).toBeLessThanOrEqual(5);
        }
    });

    it('renders deterministic, finite, normalized physical-model string signals', () => {
        const options = { sampleRate: 44100, frequency: 110, duration: 0.4, damping: 0.9985, brightness: 0.55, seed: 17 };
        const first = generateKarplusStrongSamples(options);
        const second = generateKarplusStrongSamples(options);
        const metrics = measureSignal(first);

        expect(first).toEqual(second);
        expect(metrics.finite).toBe(true);
        expect(metrics.peak).toBeLessThanOrEqual(0.881);
        expect(metrics.peak).toBeGreaterThan(0.85);
        expect(metrics.rms).toBeGreaterThan(0.01);
        expect(metrics.lateRms).toBeLessThan(metrics.earlyRms);
    });

    it('changes the excitation spectrum without changing pitch or buffer safety', () => {
        const sampleRate = 44100;
        const targetFrequency = 146.83;
        const darkSamples = generateKarplusStrongSamples({ sampleRate, frequency: targetFrequency, duration: 0.4, damping: 0.998, brightness: 0.05, seed: 23 });
        const brightSamples = generateKarplusStrongSamples({ sampleRate, frequency: targetFrequency, duration: 0.4, damping: 0.998, brightness: 0.95, seed: 23 });
        const dark = measureSignal(darkSamples);
        const bright = measureSignal(brightSamples);
        const darkPitch = estimateFundamentalFrequency(darkSamples, sampleRate, { minFrequency: 90, maxFrequency: 220 });
        const brightPitch = estimateFundamentalFrequency(brightSamples, sampleRate, { minFrequency: 90, maxFrequency: 220 });

        expect(bright.zeroCrossingRate).toBeGreaterThan(dark.zeroCrossingRate);
        expect(bright.peak).toBeLessThanOrEqual(0.881);
        expect(dark.peak).toBeLessThanOrEqual(0.881);
        expect(darkPitch).not.toBeNull();
        expect(brightPitch).not.toBeNull();
        expect(Math.abs(1200 * Math.log2((darkPitch ?? 1) / targetFrequency))).toBeLessThan(1);
        expect(Math.abs(1200 * Math.log2((brightPitch ?? 1) / targetFrequency))).toBeLessThan(1);
    });

    it('keeps pickup-filtered string fundamentals tuned across bass and guitar registers', () => {
        const sampleRate = 44100;
        for (const targetFrequency of [65.41, 82.41, 110, 146.83, 174.61]) {
            const samples = generateKarplusStrongSamples({
                sampleRate,
                frequency: targetFrequency,
                duration: 0.52,
                damping: 0.995,
                brightness: 0.55,
                seed: 37,
                pluckPosition: 0.24,
                pickupPosition: 0.22,
            });
            const estimated = estimateFundamentalFrequency(samples, sampleRate, {
                minFrequency: targetFrequency * 0.65,
                maxFrequency: targetFrequency * 1.5,
                windowSeconds: 0.32,
            });
            expect(estimated, `${targetFrequency} Hz was not detected`).not.toBeNull();
            const centsError = Math.abs(1200 * Math.log2((estimated ?? 1) / targetFrequency));
            expect(centsError, `${targetFrequency} Hz drifted by ${centsError.toFixed(2)} cents`).toBeLessThan(1);
        }
    });

    it('covers every event voice emitted by all presets', () => {
        const emitted = new Set(GROOVE_PRESETS.flatMap((preset) => (
            buildGrooveBar(preset.id, preset.recommendedFeel, 140).map((event) => event.voice)
        )));
        expect([...emitted].sort()).toEqual([...GROOVE_AUDIO_VOICES].sort());
    });

});
