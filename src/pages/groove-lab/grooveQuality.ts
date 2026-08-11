export interface SignalMetrics {
    peak: number;
    rms: number;
    earlyRms: number;
    lateRms: number;
    lateEnergyRatio: number;
    zeroCrossingRate: number;
    finite: boolean;
}

export const measureSignal = (samples: Float32Array): SignalMetrics => {
    if (samples.length === 0) {
        return { peak: 0, rms: 0, earlyRms: 0, lateRms: 0, lateEnergyRatio: 0, zeroCrossingRate: 0, finite: true };
    }
    let peak = 0;
    let energy = 0;
    let crossings = 0;
    let finite = true;
    const windowLength = Math.max(1, Math.floor(samples.length * 0.2));
    let earlyEnergy = 0;
    let lateEnergy = 0;
    for (let index = 0; index < samples.length; index += 1) {
        const value = samples[index];
        finite = finite && Number.isFinite(value);
        peak = Math.max(peak, Math.abs(value));
        energy += value * value;
        if (index < windowLength) earlyEnergy += value * value;
        if (index >= samples.length - windowLength) lateEnergy += value * value;
        if (index > 0 && ((samples[index - 1] < 0 && value >= 0) || (samples[index - 1] >= 0 && value < 0))) crossings += 1;
    }
    const rms = Math.sqrt(energy / samples.length);
    const earlyRms = Math.sqrt(earlyEnergy / windowLength);
    const lateRms = Math.sqrt(lateEnergy / windowLength);
    return {
        peak,
        rms,
        earlyRms,
        lateRms,
        lateEnergyRatio: earlyRms > 0 ? lateRms / earlyRms : 0,
        zeroCrossingRate: crossings / Math.max(1, samples.length - 1),
        finite,
    };
};

/**
 * Fundamental estimate using the cumulative-mean normalized difference stage
 * of YIN (de Cheveigne & Kawahara, JASA 2002). This is a regression metric,
 * not a replacement for an instrument tuner or listening evaluation.
 */
export const estimateFundamentalFrequency = (
    samples: Float32Array,
    sampleRate: number,
    options: {
        minFrequency?: number;
        maxFrequency?: number;
        startSeconds?: number;
        windowSeconds?: number;
        threshold?: number;
    } = {},
): number | null => {
    const minFrequency = Math.max(20, options.minFrequency ?? 40);
    const maxFrequency = Math.max(minFrequency, options.maxFrequency ?? 400);
    const start = Math.max(0, Math.floor((options.startSeconds ?? 0.02) * sampleRate));
    const requestedWindow = Math.max(32, Math.floor((options.windowSeconds ?? 0.28) * sampleRate));
    const maxLag = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(requestedWindow / 2));
    const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
    const availableWindow = Math.min(requestedWindow, samples.length - start - maxLag);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || availableWindow < maxLag || maxLag <= minLag) return null;

    const difference = new Float64Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag += 1) {
        let sum = 0;
        for (let index = 0; index < availableWindow; index += 1) {
            const delta = samples[start + index] - samples[start + index + lag];
            sum += delta * delta;
        }
        difference[lag] = sum;
    }

    const normalized = new Float64Array(maxLag + 1);
    normalized[0] = 1;
    let runningSum = 0;
    for (let lag = 1; lag <= maxLag; lag += 1) {
        runningSum += difference[lag];
        normalized[lag] = runningSum > 0 ? (difference[lag] * lag) / runningSum : 1;
    }

    const threshold = options.threshold ?? 0.15;
    let selectedLag = -1;
    for (let lag = minLag; lag < maxLag; lag += 1) {
        if (normalized[lag] < threshold && normalized[lag] <= normalized[lag + 1]) {
            selectedLag = lag;
            break;
        }
    }
    if (selectedLag < 0) {
        selectedLag = minLag;
        for (let lag = minLag + 1; lag <= maxLag; lag += 1) {
            if (normalized[lag] < normalized[selectedLag]) selectedLag = lag;
        }
    }

    const before = normalized[Math.max(minLag, selectedLag - 1)];
    const center = normalized[selectedLag];
    const after = normalized[Math.min(maxLag, selectedLag + 1)];
    const denominator = before - (2 * center) + after;
    const interpolatedLag = Math.abs(denominator) > 1e-12
        ? selectedLag + (0.5 * (before - after)) / denominator
        : selectedLag;
    return sampleRate / interpolatedLag;
};
