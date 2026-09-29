import {
    createGrooveAudioRuntime,
    createGrooveMasterOutput,
    preloadGrooveAudio,
    scheduleGrooveVoice,
} from '../groove-lab/grooveAudio';
import {
    STEM_DEFINITIONS,
    STEM_DEMO_BPM,
    STEM_DEMO_SECONDS,
    type StemId,
} from './stemDemo';

const RENDER_SAMPLE_RATE = 44_100;

export interface RenderedStemDemo {
    buffers: Record<StemId, AudioBuffer>;
    waveforms: Record<StemId, number[]>;
}

const buildWaveform = (buffer: AudioBuffer, bins = 52): number[] => {
    const samples = buffer.getChannelData(0);
    const binSize = Math.max(1, Math.floor(samples.length / bins));
    const peaks: number[] = [];
    for (let bin = 0; bin < bins; bin += 1) {
        const start = bin * binSize;
        const end = Math.min(samples.length, start + binSize);
        let peak = 0;
        for (let index = start; index < end; index += 1) {
            peak = Math.max(peak, Math.abs(samples[index]));
        }
        peaks.push(peak);
    }
    const maximum = Math.max(...peaks, 0.0001);
    return peaks.map((peak) => Math.max(0.08, peak / maximum));
};

export const renderStemDemo = async (): Promise<RenderedStemDemo> => {
    const entries = await Promise.all(STEM_DEFINITIONS.map(async (stem) => {
        const frameCount = Math.ceil(RENDER_SAMPLE_RATE * STEM_DEMO_SECONDS);
        const offline = new OfflineAudioContext(1, frameCount, RENDER_SAMPLE_RATE);
        const context = offline as unknown as AudioContext;
        const runtime = createGrooveAudioRuntime();
        if (stem.id === 'bass') await preloadGrooveAudio(offline, runtime);
        const output = createGrooveMasterOutput(context, offline.destination);
        const secondsPerBeat = 60 / STEM_DEMO_BPM;
        stem.events.forEach((event) => {
            scheduleGrooveVoice(
                context,
                runtime,
                event.position * secondsPerBeat,
                event,
                82,
                output.input,
            );
        });
        const buffer = await offline.startRendering();
        return [stem.id, { buffer, waveform: buildWaveform(buffer) }] as const;
    }));

    const buffers = {} as Record<StemId, AudioBuffer>;
    const waveforms = {} as Record<StemId, number[]>;
    entries.forEach(([stemId, rendered]) => {
        buffers[stemId] = rendered.buffer;
        waveforms[stemId] = rendered.waveform;
    });
    return { buffers, waveforms };
};
