import type { GrooveEvent, GrooveVoice } from './grooveEngine';

type NoiseColor = 'white' | 'pink';

export interface GrooveAudioRuntime {
    noiseBuffers: WeakMap<AudioContext, Map<NoiseColor, AudioBuffer>>;
    pluckBuffers: WeakMap<AudioContext, Map<string, AudioBuffer>>;
    uprightBassBuffers: WeakMap<BaseAudioContext, Map<string, AudioBuffer>>;
    uprightBassLoads: WeakMap<BaseAudioContext, Promise<boolean>>;
    sequence: number;
}

export interface GrooveMasterOutput {
    input: GainNode;
    dispose: () => void;
}

export interface KarplusStrongOptions {
    sampleRate: number;
    frequency: number;
    duration: number;
    damping: number;
    brightness: number;
    seed: number;
    pluckPosition?: number;
    pickupPosition?: number;
}

export const createGrooveAudioRuntime = (): GrooveAudioRuntime => ({
    noiseBuffers: new WeakMap(),
    pluckBuffers: new WeakMap(),
    uprightBassBuffers: new WeakMap(),
    uprightBassLoads: new WeakMap(),
    sequence: 0,
});

export const UPRIGHT_BASS_WALKING_FREQUENCIES = [41.203, 48.999, 55, 61.735] as const;

export const UPRIGHT_BASS_SAMPLE_MANIFEST = [
    { id: 'E1-rr1', file: 'E0-rr1.mp3', frequency: 41.203, roundRobin: 0 },
    { id: 'E1-rr2', file: 'E0-rr2.mp3', frequency: 41.203, roundRobin: 1 },
    { id: 'G1-rr1', file: 'G0-rr1.mp3', frequency: 48.999, roundRobin: 0 },
    { id: 'G1-rr2', file: 'G0-rr2.mp3', frequency: 48.999, roundRobin: 1 },
    { id: 'Bb1-rr1', file: 'Asharp0-rr1.mp3', frequency: 58.27, roundRobin: 0 },
    { id: 'Bb1-rr2', file: 'Asharp0-rr2.mp3', frequency: 58.27, roundRobin: 1 },
    { id: 'C2-rr1', file: 'C1-rr1.mp3', frequency: 65.406, roundRobin: 0 },
    { id: 'C2-rr2', file: 'C1-rr2.mp3', frequency: 65.406, roundRobin: 1 },
] as const;

const UPRIGHT_BASS_ASSET_PATH = 'audio/groove-lab/upright-bass';

export const getUprightBassSampleSelection = (frequency: number, variation: number) => {
    const roundRobin = Math.abs(Math.trunc(variation)) % 2;
    const candidates = UPRIGHT_BASS_SAMPLE_MANIFEST.filter((sample) => sample.roundRobin === roundRobin);
    return candidates.reduce((nearest, sample) => (
        Math.abs(Math.log2(sample.frequency / frequency)) < Math.abs(Math.log2(nearest.frequency / frequency))
            ? sample
            : nearest
    ));
};

export const preloadGrooveAudio = (
    context: BaseAudioContext,
    runtime: GrooveAudioRuntime,
): Promise<boolean> => {
    const cachedLoad = runtime.uprightBassLoads.get(context);
    if (cachedLoad) return cachedLoad;

    const load = Promise.allSettled(UPRIGHT_BASS_SAMPLE_MANIFEST.map(async (sample) => {
        const response = await fetch(`${import.meta.env.BASE_URL}${UPRIGHT_BASS_ASSET_PATH}/${sample.file}`);
        if (!response.ok) throw new Error(`upright bass sample ${response.status}`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        let buffers = runtime.uprightBassBuffers.get(context);
        if (!buffers) {
            buffers = new Map();
            runtime.uprightBassBuffers.set(context, buffers);
        }
        buffers.set(sample.id, decoded);
    })).then(() => runtime.uprightBassBuffers.get(context)?.size === UPRIGHT_BASS_SAMPLE_MANIFEST.length);

    runtime.uprightBassLoads.set(context, load);
    return load;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hashString = (value: string) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const mulberry32 = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

/** STK Twang convention: pluck comb delay is half the round-trip string delay times position. */
export const getPluckPositionDelaySamples = (roundTripDelaySamples: number, pluckPosition: number) => (
    Math.max(1, Math.round(Math.max(2, roundTripDelaySamples) * 0.5 * clamp(pluckPosition, 0.04, 0.5)))
);

/** STK StifKarp convention: pickup displacement is current output minus a delayed output. */
export const getPickupPositionDelaySamples = (roundTripDelaySamples: number, pickupPosition: number) => (
    Math.max(1, Math.round(Math.max(2, roundTripDelaySamples) * 0.5 * clamp(pickupPosition, 0.02, 0.5)))
);

export const applyPickupPositionComb = (
    samples: Float32Array,
    roundTripDelaySamples: number,
    pickupPosition: number,
): Float32Array => {
    const pickupDelay = getPickupPositionDelaySamples(roundTripDelaySamples, pickupPosition);
    const output = new Float32Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
        output[index] = samples[index] - (index >= pickupDelay ? samples[index - pickupDelay] : 0);
    }
    return output;
};

/**
 * Lightweight piano-unison approximation. Real low notes commonly use one string,
 * while the middle/high register uses two or three near-unison strings. The
 * frequency split stays inside the 0.1–5 Hz doublet range measured by Aramaki et al.
 * This deliberately does not claim to model bridge coupling or double decay.
 */
export const getPianoUnisonFrequencies = (frequency: number): readonly number[] => {
    const safeFrequency = clamp(frequency, 20, 5000);
    const stringCount = safeFrequency < 110 ? 1 : safeFrequency < 220 ? 2 : 3;
    if (stringCount === 1) return [safeFrequency];

    const adjacentGapHz = clamp(safeFrequency * 0.002, 0.25, 0.9);
    return stringCount === 2
        ? [safeFrequency - adjacentGapHz * 0.5, safeFrequency + adjacentGapHz * 0.5]
        : [safeFrequency - adjacentGapHz, safeFrequency, safeFrequency + adjacentGapHz];
};

/** Measured/simulated Clavinet D6 amplifier response, excluding its tone switches. */
export const CLAVINET_AMPLIFIER_SHELVES = {
    low: { frequency: 130, gain: -3 },
    high: { frequency: 4000, gain: 3 },
} as const;

export const PANDEIRO_ARTICULATIONS = ['tung', 'tchi', 'pa', 'PA'] as const;

export const getShuffleGuitarMultiples = (variant: number): readonly number[] => (
    variant === 11 ? [1, 5 / 3] : [1, 1.5]
);

export const generateKarplusStrongSamples = (options: KarplusStrongOptions): Float32Array => {
    const sampleRate = clamp(Math.round(options.sampleRate), 8000, 192000);
    const frequency = clamp(options.frequency, 30, sampleRate / 4);
    const duration = clamp(options.duration, 0.03, 4);
    const damping = clamp(options.damping, 0.9, 0.99995);
    const brightness = clamp(options.brightness, 0, 1);
    const pluckPosition = clamp(options.pluckPosition ?? 0.22, 0.04, 0.5);
    const length = Math.max(1, Math.ceil(sampleRate * duration));
    // This ring updates a slot from the current and following slots, so the
    // two-point loop filter advances phase by about half a sample (N - 0.5).
    // Add that half sample before the allpass fraction to preserve the target period.
    const targetDelay = Math.max(2, (sampleRate / frequency) + 0.5);
    let delayLength = Math.max(2, Math.floor(targetDelay));
    let fractionalDelay = targetDelay - delayLength;
    if (fractionalDelay < 0.5 && delayLength > 2) {
        delayLength -= 1;
        fractionalDelay += 1;
    }
    const fractionalCoefficient = (1 - fractionalDelay) / (1 + fractionalDelay);
    const delay = new Float32Array(delayLength);
    const output = new Float32Array(length);
    const random = mulberry32(options.seed);

    const excitation = new Float32Array(delayLength);
    let previousExcitation = 0;
    for (let index = 0; index < delayLength; index += 1) {
        const white = random() * 2 - 1;
        const softened = (white + previousExcitation) * 0.5;
        excitation[index] = (white * brightness) + (softened * (1 - brightness));
        previousExcitation = white;
    }
    const pluckDelay = getPluckPositionDelaySamples(delayLength, pluckPosition);
    for (let index = 0; index < delayLength; index += 1) {
        const reflected = excitation[(index - pluckDelay + delayLength) % delayLength];
        delay[index] = excitation[index] - reflected * 0.72;
    }

    let cursor = 0;
    let previousAllpassInput = 0;
    let previousAllpassOutput = 0;
    for (let index = 0; index < length; index += 1) {
        const current = delay[cursor];
        const next = delay[(cursor + 1) % delayLength];
        output[index] = current;
        const loopFiltered = current * 0.5 + next * 0.5;
        const fractionallyDelayed = (-fractionalCoefficient * previousAllpassOutput)
            + previousAllpassInput
            + (fractionalCoefficient * loopFiltered);
        previousAllpassInput = loopFiltered;
        previousAllpassOutput = fractionallyDelayed;
        delay[cursor] = fractionallyDelayed * damping;
        cursor = (cursor + 1) % delayLength;
    }

    let rendered = output;
    if (options.pickupPosition !== undefined) {
        rendered = applyPickupPositionComb(output, delayLength, options.pickupPosition);
    }

    let peak = 0;
    for (let index = 0; index < rendered.length; index += 1) peak = Math.max(peak, Math.abs(rendered[index]));
    const normalizer = peak > 0 ? 0.88 / peak : 1;
    for (let index = 0; index < rendered.length; index += 1) rendered[index] *= normalizer;
    return rendered;
};

const getNoiseBuffer = (context: AudioContext, runtime: GrooveAudioRuntime, color: NoiseColor) => {
    let contextBuffers = runtime.noiseBuffers.get(context);
    if (!contextBuffers) {
        contextBuffers = new Map();
        runtime.noiseBuffers.set(context, contextBuffers);
    }
    const cached = contextBuffers.get(color);
    if (cached) return cached;

    const duration = 2;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    const random = mulberry32(color === 'pink' ? 0x51a7c0de : 0x71f42d19);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let index = 0; index < channel.length; index += 1) {
        const white = random() * 2 - 1;
        if (color === 'pink') {
            b0 = 0.99765 * b0 + white * 0.099046;
            b1 = 0.963 * b1 + white * 0.2965164;
            b2 = 0.57 * b2 + white * 1.0526913;
            channel[index] = clamp((b0 + b1 + b2 + white * 0.1848) * 0.18, -1, 1);
        } else {
            channel[index] = white;
        }
    }
    contextBuffers.set(color, buffer);
    return buffer;
};

const scheduleEnvelope = (
    parameter: AudioParam,
    time: number,
    gain: number,
    attack: number,
    decay: number,
) => {
    const safeGain = Math.max(0.0002, gain);
    parameter.setValueAtTime(0.0001, time);
    parameter.exponentialRampToValueAtTime(safeGain, time + Math.max(0.001, attack));
    parameter.exponentialRampToValueAtTime(0.0001, time + Math.max(attack + 0.002, decay));
};

const scheduleOscillator = (
    context: AudioContext,
    time: number,
    destination: AudioNode,
    options: {
        frequency: number;
        endFrequency?: number;
        gain: number;
        duration: number;
        type?: OscillatorType;
        attack?: number;
        detune?: number;
    },
) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = options.type ?? 'triangle';
    oscillator.frequency.setValueAtTime(options.frequency, time);
    oscillator.detune.setValueAtTime(options.detune ?? 0, time);
    if (options.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), time + options.duration);
    }
    scheduleEnvelope(envelope.gain, time, options.gain, options.attack ?? 0.003, options.duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + options.duration + 0.03);
};

const scheduleNoise = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    destination: AudioNode,
    options: {
        frequency: number;
        gain: number;
        duration: number;
        type?: BiquadFilterType;
        q?: number;
        color?: NoiseColor;
        seedKey: string;
        attack?: number;
    },
) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const buffer = getNoiseBuffer(context, runtime, options.color ?? 'white');
    const maxOffset = Math.max(0, buffer.duration - options.duration - 0.01);
    const offset = ((hashString(options.seedKey) % 10000) / 10000) * maxOffset;
    source.buffer = buffer;
    filter.type = options.type ?? 'highpass';
    filter.frequency.setValueAtTime(options.frequency, time);
    filter.Q.setValueAtTime(options.q ?? 0.8, time);
    scheduleEnvelope(envelope.gain, time, options.gain, options.attack ?? 0.001, options.duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(time, offset, options.duration + 0.005);
    source.stop(time + options.duration + 0.02);
};

const scheduleModalTone = (
    context: AudioContext,
    time: number,
    destination: AudioNode,
    fundamental: number,
    gain: number,
    duration: number,
    modes: readonly { ratio: number; level: number; decay: number }[],
) => {
    modes.forEach((mode, index) => {
        scheduleOscillator(context, time, destination, {
            frequency: fundamental * mode.ratio,
            gain: gain * mode.level,
            duration: duration * mode.decay,
            type: index === 0 ? 'sine' : 'triangle',
            attack: 0.0015,
            detune: index % 2 === 0 ? 0 : 1.8,
        });
    });
};

const getPluckBuffer = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    options: Omit<KarplusStrongOptions, 'sampleRate'> & { key: string },
) => {
    let contextBuffers = runtime.pluckBuffers.get(context);
    if (!contextBuffers) {
        contextBuffers = new Map();
        runtime.pluckBuffers.set(context, contextBuffers);
    }
    const cacheKey = `${options.key}:${Math.round(options.frequency * 100)}:${options.duration}:${options.damping}:${options.brightness}:${options.pluckPosition ?? 0.22}:${options.pickupPosition ?? 'none'}:${options.seed}`;
    const cached = contextBuffers.get(cacheKey);
    if (cached) return cached;
    const samples = generateKarplusStrongSamples({ ...options, sampleRate: context.sampleRate });
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    contextBuffers.set(cacheKey, buffer);
    return buffer;
};

const schedulePluck = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    destination: AudioNode,
    options: {
        key: string;
        frequency: number;
        gain: number;
        duration: number;
        damping: number;
        brightness: number;
        seed: number;
        lowpass: number;
        attack?: number;
        pluckPosition?: number;
        pickupPosition?: number;
    },
) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = getPluckBuffer(context, runtime, options);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.lowpass, time);
    filter.Q.setValueAtTime(0.65, time);
    scheduleEnvelope(envelope.gain, time, options.gain, options.attack ?? 0.002, options.duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(time);
    source.stop(time + options.duration + 0.03);
};

const scheduleDualPluck = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    destination: AudioNode,
    options: Parameters<typeof schedulePluck>[4] & { polarization?: number },
) => {
    schedulePluck(context, runtime, time, destination, options);
    const polarization = clamp(options.polarization ?? 0.18, 0, 0.4);
    if (polarization <= 0) return;
    schedulePluck(context, runtime, time + 0.0012, destination, {
        ...options,
        key: `${options.key}-polarized`,
        frequency: options.frequency * 1.0012,
        gain: options.gain * polarization,
        duration: options.duration * 0.86,
        damping: Math.max(0.9, options.damping - 0.0007),
        brightness: clamp(options.brightness * 0.82, 0, 1),
        seed: options.seed ^ 0x5f3759df,
    });
};

const scheduleSampledUprightBass = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    destination: AudioNode,
    frequency: number,
    variation: number,
    durationSeconds?: number,
) => {
    const sample = getUprightBassSampleSelection(frequency, variation);
    const buffer = runtime.uprightBassBuffers.get(context)?.get(sample.id);
    if (!buffer) return false;

    const source = context.createBufferSource();
    const dcBlock = context.createBiquadFilter();
    const body = context.createBiquadFilter();
    const fingerNoiseLimit = context.createBiquadFilter();
    const envelope = context.createGain();
    const hold = clamp(durationSeconds ?? 0.42, 0.32, 0.82);
    const release = 0.18;
    const stopTime = time + hold + release + 0.03;

    source.buffer = buffer;
    source.playbackRate.setValueAtTime(frequency / sample.frequency, time);
    dcBlock.type = 'highpass';
    dcBlock.frequency.setValueAtTime(28, time);
    dcBlock.Q.setValueAtTime(0.7, time);
    body.type = 'peaking';
    body.frequency.setValueAtTime(118, time);
    body.Q.setValueAtTime(0.72, time);
    body.gain.setValueAtTime(1.6, time);
    fingerNoiseLimit.type = 'lowpass';
    fingerNoiseLimit.frequency.setValueAtTime(4200, time);
    fingerNoiseLimit.Q.setValueAtTime(0.55, time);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(0.58, time + 0.004);
    envelope.gain.setValueAtTime(0.58, time + hold);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + hold + release);

    source.connect(dcBlock);
    dcBlock.connect(body);
    body.connect(fingerNoiseLimit);
    fingerNoiseLimit.connect(envelope);
    envelope.connect(destination);
    source.start(time);
    source.stop(Math.min(stopTime, time + (buffer.duration / source.playbackRate.value)));
    return true;
};

const scheduleBendingPluck = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    destination: AudioNode,
    options: Parameters<typeof schedulePluck>[4] & { endFrequency: number; bendDuration?: number },
) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = getPluckBuffer(context, runtime, options);
    const playbackRatio = clamp(options.endFrequency / options.frequency, 0.5, 2);
    source.playbackRate.setValueAtTime(1, time);
    source.playbackRate.exponentialRampToValueAtTime(playbackRatio, time + (options.bendDuration ?? options.duration * 0.55));
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.lowpass, time);
    filter.Q.setValueAtTime(0.65, time);
    scheduleEnvelope(envelope.gain, time, options.gain, options.attack ?? 0.003, options.duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(time);
    source.stop(time + options.duration + 0.04);
};

const scheduleHammeredString = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    destination: AudioNode,
    frequency: number,
    gain: number,
    duration: number,
    seedKey: string,
) => {
    const inharmonicity = frequency < 180 ? 0.0018 : 0.0032;
    const unisonFrequencies = getPianoUnisonFrequencies(frequency);
    const unisonLevels = unisonFrequencies.length === 1
        ? [1]
        : unisonFrequencies.length === 2 ? [0.54, 0.46] : [0.4, 0.34, 0.26];
    [1, 2, 3, 4, 5].forEach((partial, index) => {
        const stretchedRatio = partial * Math.sqrt(1 + inharmonicity * partial * partial);
        unisonFrequencies.forEach((unisonFrequency, stringIndex) => {
            scheduleOscillator(context, time, destination, {
                frequency: unisonFrequency * stretchedRatio,
                gain: gain * [1, 0.34, 0.17, 0.09, 0.045][index] * unisonLevels[stringIndex],
                duration: duration * [1, 0.58, 0.36, 0.22, 0.14][index],
                type: index < 2 ? 'triangle' : 'sine',
                attack: 0.0018,
            });
        });
    });
    scheduleNoise(context, runtime, time, destination, {
        frequency: 2700,
        gain: gain * 0.12,
        duration: 0.018,
        type: 'bandpass',
        q: 0.85,
        seedKey,
    });
};

export const createGrooveMasterOutput = (context: AudioContext, destination: AudioNode): GrooveMasterOutput => {
    const input = context.createGain();
    const dcBlock = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const output = context.createGain();

    dcBlock.type = 'highpass';
    dcBlock.frequency.setValueAtTime(24, context.currentTime);
    dcBlock.Q.setValueAtTime(0.7, context.currentTime);
    compressor.threshold.setValueAtTime(-14, context.currentTime);
    compressor.knee.setValueAtTime(10, context.currentTime);
    compressor.ratio.setValueAtTime(4, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.16, context.currentTime);
    output.gain.setValueAtTime(0.88, context.currentTime);

    input.connect(dcBlock);
    dcBlock.connect(compressor);
    compressor.connect(output);
    output.connect(destination);

    return {
        input,
        dispose: () => {
            const now = context.currentTime;
            input.gain.cancelScheduledValues(now);
            input.gain.setValueAtTime(input.gain.value, now);
            input.gain.linearRampToValueAtTime(0, now + 0.025);
            window.setTimeout(() => {
                [input, dcBlock, compressor, output].forEach((node) => node.disconnect());
            }, 220);
        },
    };
};

const BASS_FREQUENCIES = [65.41, 73.42, 82.41, 98, 110, 123.47];

export const resolveBassFrequency = (variant: number) => {
    if (variant >= 50) return [82.41, 82.41][variant % 2];
    if (variant >= 40) return [65.41, 82.41, 98][variant % 3];
    if (variant >= 30) return [82.41, 123.47][variant % 2];
    if (variant >= 20) return BASS_FREQUENCIES[variant % BASS_FREQUENCIES.length];
    if (variant >= 10) return [65.41, 98, 110][variant - 10] ?? 65.41;
    return UPRIGHT_BASS_WALKING_FREQUENCIES[variant % UPRIGHT_BASS_WALKING_FREQUENCIES.length]
        ?? UPRIGHT_BASS_WALKING_FREQUENCIES[0];
};

export const scheduleGrooveVoice = (
    context: AudioContext,
    runtime: GrooveAudioRuntime,
    time: number,
    event: GrooveEvent,
    masterVolume: number,
    destination: AudioNode,
) => {
    const voiceOutput = context.createGain();
    const level = clamp(masterVolume / 100, 0, 1);
    voiceOutput.gain.setValueAtTime(level * event.gain, time);
    voiceOutput.connect(destination);
    const variant = event.variant ?? 0;
    const variation = runtime.sequence++ % 4;
    const noiseKey = `${event.id}:${variation}`;

    switch (event.voice) {
        case 'ride':
            scheduleNoise(context, runtime, time, voiceOutput, { frequency: 4400, gain: 0.12, duration: variant === 4 ? 0.17 : 0.38, type: 'highpass', seedKey: noiseKey });
            scheduleModalTone(context, time, voiceOutput, variant === 4 ? 720 : 510, 0.03, 0.31, [
                { ratio: 1, level: 1, decay: 0.58 }, { ratio: 1.41, level: 0.7, decay: 0.74 },
                { ratio: 1.93, level: 0.51, decay: 0.82 }, { ratio: 2.67, level: 0.38, decay: 0.9 },
                { ratio: 3.76, level: 0.27, decay: 1 }, { ratio: 5.21, level: 0.16, decay: 0.86 },
            ]);
            break;
        case 'hat':
            scheduleNoise(context, runtime, time, voiceOutput, { frequency: 7200, gain: 0.18, duration: variant >= 2 ? 0.075 : 0.045, type: 'highpass', q: 0.55, seedKey: noiseKey });
            scheduleModalTone(context, time, voiceOutput, 3600, 0.014, 0.065, [
                { ratio: 1, level: 1, decay: 1 }, { ratio: 1.34, level: 0.72, decay: 0.82 },
                { ratio: 1.79, level: 0.52, decay: 0.66 }, { ratio: 2.43, level: 0.34, decay: 0.54 },
                { ratio: 3.18, level: 0.2, decay: 0.46 },
            ]);
            break;
        case 'snare':
            scheduleNoise(context, runtime, time, voiceOutput, { frequency: 1850, gain: variant ? 0.18 : 0.26, duration: variant ? 0.065 : 0.13, type: 'bandpass', q: 0.6, color: 'pink', seedKey: noiseKey });
            scheduleModalTone(context, time, voiceOutput, 172, variant ? 0.055 : 0.09, 0.13, [
                { ratio: 1, level: 1, decay: 1 }, { ratio: 1.59, level: 0.62, decay: 0.7 }, { ratio: 2.14, level: 0.35, decay: 0.48 },
            ]);
            break;
        case 'kick':
            scheduleOscillator(context, time, voiceOutput, { frequency: 132, endFrequency: 47, gain: 0.42, duration: 0.15, type: 'sine', attack: 0.001 });
            scheduleNoise(context, runtime, time, voiceOutput, { frequency: 2600, gain: 0.035, duration: 0.018, type: 'bandpass', q: 0.9, seedKey: noiseKey });
            break;
        case 'bass': {
            const frequency = resolveBassFrequency(variant);
            const isSlapFamily = variant >= 20 && variant < 30;
            const isMuted = (variant >= 30 && variant < 40) || variant === 51;
            const isPicked = variant >= 50;
            const isUpright = variant < 10;
            const isTumbao = variant >= 40 && variant < 50;
            const isPop = isSlapFamily && variant % 2 === 1;
            const isDead = isSlapFamily && variant % 4 === 2;
            const modeledDuration = isDead ? 0.075 : isMuted ? 0.14 : isSlapFamily ? 0.2 : isPicked ? 0.24 : isTumbao && variant === 41 ? 0.52 : 0.38;
            const duration = event.durationSeconds ?? modeledDuration;
            if (isUpright) {
                const sampled = scheduleSampledUprightBass(
                    context,
                    runtime,
                    time,
                    voiceOutput,
                    frequency,
                    variation,
                    event.durationSeconds,
                );
                if (!sampled) {
                    schedulePluck(context, runtime, time, voiceOutput, {
                        key: 'upright-bass-fallback',
                        frequency,
                        gain: 0.24,
                        duration: Math.max(duration, 0.5),
                        damping: 0.9962,
                        brightness: 0.34,
                        seed: hashString(`bass:${variant}:${variation}`),
                        lowpass: 1800,
                        attack: 0.004,
                        pluckPosition: 0.34,
                    });
                }
                break;
            }
            scheduleDualPluck(context, runtime, time, voiceOutput, {
                key: isSlapFamily ? 'slap-bass' : isPicked ? 'pick-bass' : 'finger-bass',
                frequency, gain: isDead ? 0.13 : isPop ? 0.24 : 0.27, duration,
                damping: isDead ? 0.968 : isMuted ? 0.982 : 0.9945,
                brightness: isDead ? 0.2 : isPop ? 0.86 : isPicked ? 0.72 : 0.56,
                seed: hashString(`bass:${variant}:${variation}`),
                lowpass: isPop ? 4200 : isPicked ? 2600 : 1900,
                attack: isSlapFamily ? 0.0015 : isPicked ? 0.0025 : 0.006,
                pluckPosition: isPop ? 0.1 : isPicked ? 0.12 : 0.24,
                pickupPosition: isPop ? 0.13 : isPicked ? 0.17 : 0.22,
                polarization: 0.1,
            });
            if (isSlapFamily) {
                scheduleNoise(context, runtime, time, voiceOutput, { frequency: isPop ? 3600 : 2300, gain: isDead ? 0.09 : 0.075, duration: isDead ? 0.035 : 0.024, type: 'bandpass', q: 0.75, seedKey: noiseKey });
            } else {
                scheduleOscillator(context, time, voiceOutput, { frequency, endFrequency: frequency * 0.995, gain: 0.045, duration: duration * 0.72, type: 'sine', attack: 0.008 });
            }
            break;
        }
        case 'piano':
        case 'blue-piano': {
            const pianoNotes = event.voice === 'blue-piano'
                ? [[261.63], [311.13], [329.63], [349.23], [369.99], [392], [466.16]][variant] ?? [261.63]
                : variant === 1 ? [196, 246.94, 293.66] : [174.61, 220, 261.63];
            pianoNotes.forEach((frequency, index) => scheduleHammeredString(
                context, runtime, time + index * 0.004, voiceOutput, frequency,
                0.072 - index * 0.006, event.voice === 'blue-piano' ? 0.28 : 0.36,
                `${noiseKey}:piano:${index}`,
            ));
            break;
        }
        case 'guitar':
        case 'bossa-guitar': {
            const isBossa = event.voice === 'bossa-guitar';
            const isBassNote = isBossa && variant < 10;
            const isFunk = !isBossa && variant >= 20 && variant < 30;
            const isRock = !isBossa && variant >= 30;
            const isShuffle = !isBossa && variant >= 10 && variant < 20;
            const isSwingFour = !isBossa && !isFunk && !isRock && !isShuffle;
            const roots = isBassNote ? [82.41, 123.47] : isShuffle ? [110] : isRock ? [98] : [146.83, 155.56, 164.81, 146.83];
            const root = roots[variant % roots.length] ?? roots[0];
            const multiples = isBassNote ? [1] : isShuffle ? getShuffleGuitarMultiples(variant) : isRock ? [1, 1.5, 2] : isSwingFour ? [1, 1.5] : [1, 1.25, 1.5];
            multiples.forEach((multiple, index) => scheduleDualPluck(context, runtime, time + index * (isBossa ? 0.006 : 0.004), voiceOutput, {
                key: isBossa ? 'nylon' : isRock ? 'steel-rock' : 'steel', frequency: root * multiple,
                gain: isBassNote ? 0.2 : isFunk ? 0.065 : isSwingFour ? (index === 0 ? 0.13 : 0.025) : 0.095,
                duration: isBassNote ? 0.34 : isFunk ? 0.08 : isRock ? 0.2 : isSwingFour ? (index === 0 ? 0.11 : 0.045) : 0.16,
                damping: isBossa ? 0.986 : isSwingFour ? 0.975 : 0.99058, brightness: isBossa ? 0.366 : isSwingFour ? 0.22 : 0.314,
                seed: hashString(`${event.voice}:${variant}:${index}:${variation}`), lowpass: isBossa ? 3600 : isFunk ? 4200 : 5200,
                pluckPosition: isBossa ? 0.28 : isFunk ? 0.11 : isRock ? 0.14 : isSwingFour ? 0.32 : 0.24,
                polarization: isFunk ? 0.06 : isBossa ? 0.22 : isSwingFour ? 0.1 : 0.16,
            }));
            if (!isBassNote) scheduleNoise(context, runtime, time, voiceOutput, {
                frequency: isFunk ? 2800 : isSwingFour ? 1550 : 2100,
                gain: isFunk ? 0.035 : isSwingFour ? 0.032 : 0.022,
                duration: isSwingFour ? 0.038 : 0.025,
                type: 'bandpass', q: isSwingFour ? 0.75 : 1.1, seedKey: noiseKey,
            });
            break;
        }
        case 'boogie': {
            const frequency = [65.41, 98, 110, 116.54][variant] ?? 65.41;
            scheduleHammeredString(context, runtime, time, voiceOutput, frequency, 0.2, 0.28, `${noiseKey}:boogie`);
            break;
        }
        case 'blue-note': {
            const bends = [[261.63, 261.63], [311.13, 320], [349.23, 349.23], [369.99, 349.23], [392, 392]];
            const [frequency, endFrequency] = bends[variant] ?? bends[0];
            scheduleBendingPluck(context, runtime, time, voiceOutput, {
                key: 'blue-note-steel', frequency, endFrequency, gain: 0.18, duration: 0.34,
                damping: 0.9912, brightness: 0.44, seed: hashString(`blue-note:${variant}:${variation}`),
                lowpass: 4100, attack: 0.004, pluckPosition: 0.18, bendDuration: 0.18,
            });
            scheduleNoise(context, runtime, time, voiceOutput, {
                frequency: 2350, gain: 0.018, duration: 0.02, type: 'bandpass', q: 1.1, seedKey: `${noiseKey}:pick`,
            });
            break;
        }
        case 'clav': {
            const root = [146.83, 174.61, 196][variant] ?? 146.83;
            const amplifierInput = context.createBiquadFilter();
            const amplifierHighShelf = context.createBiquadFilter();
            amplifierInput.type = 'lowshelf';
            amplifierInput.frequency.setValueAtTime(CLAVINET_AMPLIFIER_SHELVES.low.frequency, time);
            amplifierInput.gain.setValueAtTime(CLAVINET_AMPLIFIER_SHELVES.low.gain, time);
            amplifierHighShelf.type = 'highshelf';
            amplifierHighShelf.frequency.setValueAtTime(CLAVINET_AMPLIFIER_SHELVES.high.frequency, time);
            amplifierHighShelf.gain.setValueAtTime(CLAVINET_AMPLIFIER_SHELVES.high.gain, time);
            amplifierInput.connect(amplifierHighShelf);
            amplifierHighShelf.connect(voiceOutput);

            [1, 1.25, 1.5].forEach((multiple, index) => scheduleDualPluck(context, runtime, time + index * 0.002, amplifierInput, {
                key: 'clav', frequency: root * multiple, gain: 0.085, duration: 0.11, damping: 0.959, brightness: 0.491,
                seed: hashString(`clav:${variant}:${index}:${variation}`), lowpass: 5200, pluckPosition: 0.09,
                pickupPosition: 0.4, polarization: 0.08,
            }));
            scheduleNoise(context, runtime, time, amplifierInput, { frequency: 3100, gain: 0.026, duration: 0.016, type: 'bandpass', q: 1.4, seedKey: `${noiseKey}:tangent` });
            break;
        }
        case 'surdo':
            scheduleModalTone(context, time, voiceOutput, variant === 1 ? 82 : 68, variant === 1 ? 0.44 : 0.3, 0.26, [
                { ratio: 1, level: 1, decay: 1 }, { ratio: 1.52, level: 0.28, decay: 0.66 }, { ratio: 2.08, level: 0.13, decay: 0.45 },
            ]);
            scheduleNoise(context, runtime, time, voiceOutput, { frequency: 720, gain: 0.035, duration: 0.025, type: 'bandpass', seedKey: noiseKey });
            break;
        case 'pandeiro':
            if (variant === 0) {
                scheduleModalTone(context, time, voiceOutput, 132, 0.12, 0.12, [
                    { ratio: 1, level: 1, decay: 1 }, { ratio: 1.58, level: 0.3, decay: 0.68 },
                ]);
                scheduleNoise(context, runtime, time, voiceOutput, { frequency: 1450, gain: 0.035, duration: 0.022, type: 'bandpass', q: 0.9, seedKey: noiseKey });
            } else if (variant === 1) {
                scheduleNoise(context, runtime, time, voiceOutput, { frequency: 11200, gain: 0.12, duration: 0.055, type: 'bandpass', q: 0.58, seedKey: noiseKey });
            } else if (variant === 2) {
                scheduleModalTone(context, time, voiceOutput, 218, 0.045, 0.055, [
                    { ratio: 1, level: 1, decay: 1 }, { ratio: 1.67, level: 0.34, decay: 0.52 },
                ]);
                scheduleNoise(context, runtime, time, voiceOutput, { frequency: 3200, gain: 0.09, duration: 0.026, type: 'bandpass', q: 0.82, seedKey: noiseKey });
            } else {
                scheduleModalTone(context, time, voiceOutput, 276, 0.055, 0.065, [
                    { ratio: 1, level: 1, decay: 1 }, { ratio: 1.72, level: 0.28, decay: 0.48 },
                ]);
                scheduleNoise(context, runtime, time, voiceOutput, { frequency: 4700, gain: 0.17, duration: 0.042, type: 'bandpass', q: 0.72, seedKey: noiseKey });
            }
            break;
        case 'clave':
            scheduleModalTone(context, time, voiceOutput, 1850, 0.13, 0.06, [
                { ratio: 1, level: 1, decay: 1 }, { ratio: 1.31, level: 0.55, decay: 0.7 }, { ratio: 1.77, level: 0.26, decay: 0.48 },
            ]);
            break;
        case 'conga': {
            const heel = variant === 0;
            const toe = variant === 1;
            const slap = variant === 2;
            const open = variant === 3;
            scheduleModalTone(context, time, voiceOutput, open ? 226 : slap ? 292 : toe ? 205 : 164, open ? 0.25 : slap ? 0.1 : 0.075, open ? 0.19 : slap ? 0.052 : 0.06, [
                { ratio: 1, level: 1, decay: 1 }, { ratio: 1.43, level: heel ? 0.3 : 0.46, decay: 0.72 }, { ratio: 1.91, level: 0.24, decay: 0.5 },
            ]);
            scheduleNoise(context, runtime, time, voiceOutput, { frequency: open ? 1450 : slap ? 3400 : toe ? 1250 : 760, gain: slap ? 0.14 : heel ? 0.025 : 0.045, duration: slap ? 0.02 : 0.026, type: 'bandpass', q: slap ? 0.72 : 1.1, seedKey: noiseKey });
            break;
        }
        case 'click':
            if (variant === 12) {
                scheduleNoise(context, runtime, time, voiceOutput, {
                    frequency: 3100,
                    gain: 0.14,
                    duration: 0.028,
                    type: 'bandpass',
                    q: 0.72,
                    seedKey: `${noiseKey}:guide-snap`,
                });
                scheduleOscillator(context, time, voiceOutput, {
                    frequency: 1680,
                    endFrequency: 980,
                    gain: 0.07,
                    duration: 0.024,
                    type: 'triangle',
                    attack: 0.001,
                });
            } else {
                const frequency = variant === 10 ? 760 : variant === 11 ? 1180 : variant === 0 ? 1120 : 780;
                scheduleOscillator(context, time, voiceOutput, { frequency, endFrequency: 610, gain: 0.16, duration: 0.035, type: 'square', attack: 0.001 });
            }
            break;
    }

    window.setTimeout(() => voiceOutput.disconnect(), Math.max(500, (time - context.currentTime + 1.2) * 1000));
};

export const GROOVE_AUDIO_VOICES: readonly GrooveVoice[] = [
    'ride', 'hat', 'bass', 'piano', 'boogie', 'guitar', 'click', 'snare', 'kick', 'blue-note',
    'blue-piano', 'clav', 'bossa-guitar', 'surdo', 'pandeiro', 'clave', 'conga',
] as const;
