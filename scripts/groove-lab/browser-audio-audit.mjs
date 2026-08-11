import { chromium } from 'playwright';

const baseUrl = process.env.GROOVE_AUDIT_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });

try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

    const report = await page.evaluate(async () => {
        const audio = await import('/src/pages/groove-lab/grooveAudio.ts');
        const engine = await import('/src/pages/groove-lab/grooveEngine.ts');
        const cases = [
            ['ride', 0], ['ride', 4], ['hat', 0], ['hat', 3], ['snare', 0], ['snare', 1], ['kick', 0],
            ['bass', 0], ['bass', 10], ['bass', 20], ['bass', 30], ['bass', 40], ['bass', 50],
            ['piano', 0], ['piano', 1], ['blue-piano', 0], ['blue-piano', 6],
            ['guitar', 0], ['guitar', 10], ['guitar', 11], ['guitar', 20], ['guitar', 30],
            ['bossa-guitar', 0], ['bossa-guitar', 1], ['bossa-guitar', 10], ['bossa-guitar', 11],
            ['boogie', 0], ['boogie', 3], ['blue-note', 1], ['blue-note', 3], ['clav', 0], ['clav', 2],
            ['surdo', 0], ['surdo', 1], ['pandeiro', 0], ['pandeiro', 1], ['pandeiro', 2], ['pandeiro', 3], ['clave', 0],
            ['conga', 0], ['conga', 1], ['conga', 2], ['conga', 3], ['click', 0], ['click', 2],
        ];
        const sampleRate = 44100;
        const voiceCases = [];

        const describeSignal = (samples, startSeconds = 0.05) => {
            const start = Math.floor(startSeconds * sampleRate);
            const attackEnd = Math.min(samples.length, start + Math.floor(0.06 * sampleRate));
            const bodyEnd = Math.min(samples.length, start + Math.floor(0.28 * sampleRate));
            let attackEnergy = 0;
            let bodyEnergy = 0;
            let signalEnergy = 0;
            let differenceEnergy = 0;
            let crossings = 0;
            let peak = 0;
            let lastActive = start;

            for (let index = start; index < bodyEnd; index += 1) {
                const sample = samples[index];
                const previous = index > start ? samples[index - 1] : sample;
                const squared = sample * sample;
                if (index < attackEnd) attackEnergy += squared;
                else bodyEnergy += squared;
                signalEnergy += squared;
                differenceEnergy += (sample - previous) ** 2;
                crossings += index > start && ((sample >= 0) !== (previous >= 0)) ? 1 : 0;
                peak = Math.max(peak, Math.abs(sample));
            }
            const activeThreshold = peak * 0.025;
            for (let index = start; index < samples.length; index += 1) {
                if (Math.abs(samples[index]) >= activeThreshold) lastActive = index;
            }

            const attackRms = Math.sqrt(attackEnergy / Math.max(1, attackEnd - start));
            const bodyRms = Math.sqrt(bodyEnergy / Math.max(1, bodyEnd - attackEnd));
            return {
                brightness: Math.sqrt(differenceEnergy / Math.max(signalEnergy, 1e-12)),
                zeroCrossingRate: crossings / Math.max(1, bodyEnd - start - 1),
                bodyToAttack: bodyRms / Math.max(attackRms, 1e-9),
                activeDuration: (lastActive - start) / sampleRate,
            };
        };

        for (const [voice, variant] of cases) {
            const context = new OfflineAudioContext(1, sampleRate, sampleRate);
            const runtime = audio.createGrooveAudioRuntime();
            const master = audio.createGrooveMasterOutput(context, context.destination);
            audio.scheduleGrooveVoice(
                context,
                runtime,
                0.05,
                { id: `audit-${voice}-${variant}`, position: 0, voice, gain: 0.82, variant },
                72,
                master.input,
            );
            const rendered = await context.startRendering();
            const samples = rendered.getChannelData(0);
            let peak = 0;
            let energy = 0;
            let finite = true;
            for (const sample of samples) {
                peak = Math.max(peak, Math.abs(sample));
                energy += sample * sample;
                finite = finite && Number.isFinite(sample);
            }
            voiceCases.push({
                voice,
                variant,
                peak,
                rms: Math.sqrt(energy / samples.length),
                finite,
                descriptor: describeSignal(samples),
            });
        }

        const presetBars = [];
        const bpm = 140;
        const beatSeconds = 60 / bpm;
        for (const preset of engine.GROOVE_PRESETS) {
            const events = engine.buildGrooveBar(preset.id, preset.recommendedFeel, bpm);
            const loopBeats = engine.getGrooveLoopBeats(preset.id);
            const durationSeconds = (loopBeats * beatSeconds) + 2.2;
            const context = new OfflineAudioContext(1, Math.ceil(sampleRate * durationSeconds), sampleRate);
            const runtime = audio.createGrooveAudioRuntime();
            const master = audio.createGrooveMasterOutput(context, context.destination);

            for (const event of events) {
                audio.scheduleGrooveVoice(
                    context,
                    runtime,
                    0.05 + (event.position * beatSeconds),
                    event,
                    bpm,
                    master.input,
                );
            }

            const rendered = await context.startRendering();
            const samples = rendered.getChannelData(0);
            let peak = 0;
            let energy = 0;
            let finite = true;
            for (const sample of samples) {
                peak = Math.max(peak, Math.abs(sample));
                energy += sample * sample;
                finite = finite && Number.isFinite(sample);
            }
            presetBars.push({
                preset: preset.id,
                loopBeats,
                loopBars: engine.getGrooveLoopBars(preset.id),
                eventCount: events.length,
                peak,
                rms: Math.sqrt(energy / samples.length),
                finite,
            });
        }

        return { voiceCases, presetBars };
    });

    const voiceFailures = report.voiceCases.filter((item) => (
        !item.finite || item.peak <= 0.0005 || item.peak > 1 || item.rms <= 0.00001
    ));
    const presetFailures = report.presetBars.filter((item) => (
        !item.finite || item.eventCount <= 0 || item.peak <= 0.0005 || item.peak > 1 || item.rms <= 0.00001
    ));
    const articulationGroups = {
        pandeiro: [0, 1, 2, 3],
        conga: [0, 1, 2, 3],
        bass: [0, 20, 30, 40, 50],
    };
    const descriptorDistance = (left, right) => {
        const keys = ['brightness', 'zeroCrossingRate', 'bodyToAttack', 'activeDuration'];
        return keys.reduce((total, key) => (
            total + Math.abs(left[key] - right[key]) / Math.max(Math.abs(left[key]), Math.abs(right[key]), 1e-9)
        ), 0) / keys.length;
    };
    const articulationComparisons = [];
    Object.entries(articulationGroups).forEach(([voice, variants]) => {
        variants.forEach((leftVariant, leftIndex) => {
            variants.slice(leftIndex + 1).forEach((rightVariant) => {
                const left = report.voiceCases.find((item) => item.voice === voice && item.variant === leftVariant);
                const right = report.voiceCases.find((item) => item.voice === voice && item.variant === rightVariant);
                articulationComparisons.push({
                    voice,
                    variants: [leftVariant, rightVariant],
                    distance: left && right ? descriptorDistance(left.descriptor, right.descriptor) : 0,
                });
            });
        });
    });
    // Regression gate only: it detects collapsed/near-identical render descriptors,
    // not a psychoacoustic just-noticeable-difference or a listening-test result.
    const articulationFailures = articulationComparisons.filter((item) => item.distance < 0.05);
    if (pageErrors.length || voiceFailures.length || presetFailures.length || articulationFailures.length) {
        console.error(JSON.stringify({ pageErrors, voiceFailures, presetFailures, articulationFailures }, null, 2));
        process.exitCode = 1;
    } else {
        const voicePeaks = report.voiceCases.map((item) => item.peak);
        const presetPeaks = report.presetBars.map((item) => item.peak);
        console.log(JSON.stringify({
            renderedCases: report.voiceCases.length,
            voices: [...new Set(report.voiceCases.map((item) => item.voice))].length,
            presetBars: report.presetBars.length,
            minimumVoicePeak: Math.min(...voicePeaks),
            maximumVoicePeak: Math.max(...voicePeaks),
            minimumPresetPeak: Math.min(...presetPeaks),
            maximumPresetPeak: Math.max(...presetPeaks),
            articulationComparisons: articulationComparisons.length,
            minimumArticulationDistance: Math.min(...articulationComparisons.map((item) => item.distance)),
            finite: true,
            clipping: false,
        }, null, 2));
    }
} finally {
    await browser.close();
}
