import { describe, expect, it } from 'vitest';
import { EVIDENCE } from './GrooveLabPage';
import { buildGrooveBar, GROOVE_PRESETS } from './grooveEngine';
import { auditEvidenceIds } from './grooveEvidence';
import { getModelProfilesForEvents } from './grooveModelProfiles';

describe('groove preset evidence coverage', () => {
    it('resolves every preset evidence id and requires a reliable direct source', () => {
        GROOVE_PRESETS.forEach((preset) => {
            const audit = auditEvidenceIds(preset.evidenceIds);
            expect(audit.missing, `${preset.id} has unknown evidence`).toEqual([]);
            expect(preset.evidenceIds.every((id) => id in EVIDENCE), `${preset.id} evidence is hidden in the UI`).toBe(true);
            expect(audit.hasReliableDirectSource, `${preset.id} relies only on secondary material`).toBe(true);
        });
    });

    it('covers rhythm timing/pattern claims, or pitch for the blue-note concept family', () => {
        GROOVE_PRESETS.forEach((preset) => {
            const { scopes } = auditEvidenceIds(preset.evidenceIds);
            const expectedScope = preset.family === 'blue-note'
                ? scopes.has('pitch')
                : scopes.has('timing') || scopes.has('pattern');
            expect(expectedScope, `${preset.id} has no direct claim scope`).toBe(true);
        });
    });

    it('shows a model scope for every distinct synthesized voice in each preset', () => {
        GROOVE_PRESETS.forEach((preset) => {
            const events = buildGrooveBar(preset.id, preset.recommendedFeel, 140);
            const voices = new Set(events.map((event) => event.voice));
            const profiles = getModelProfilesForEvents(events);
            expect(profiles.map((item) => item.voice), `${preset.id} hides a voice model`).toEqual([...voices]);
        });

        const rockProfiles = getModelProfilesForEvents(buildGrooveBar('rock-drums', 'straight', 140));
        expect(rockProfiles.map((item) => item.voice)).toEqual(['hat', 'kick', 'snare']);
    });
});
