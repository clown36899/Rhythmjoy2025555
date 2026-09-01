export type EvidenceAuthority =
    | 'peer-reviewed'
    | 'standard'
    | 'academic-conference'
    | 'university-research'
    | 'graduate-thesis'
    | 'higher-education'
    | 'professional-education'
    | 'specialist-secondary';

export type EvidenceScope = 'timing' | 'pattern' | 'instrument-technique' | 'pitch' | 'limitation';

export interface EvidenceQuality {
    authority: EvidenceAuthority;
    scopes: readonly EvidenceScope[];
    direct: boolean;
}

export const RELIABLE_AUTHORITIES: ReadonlySet<EvidenceAuthority> = new Set([
    'peer-reviewed',
    'standard',
    'academic-conference',
    'university-research',
    'graduate-thesis',
    'higher-education',
]);

/**
 * Claim-level registry for the sources attached directly to rhythm presets.
 * `direct` means the source studies or defines the exact family/technique,
 * rather than merely describing a neighboring style.
 */
export const GROOVE_EVIDENCE_QUALITY: Readonly<Record<string, EvidenceQuality>> = {
    friberg: { authority: 'peer-reviewed', scopes: ['timing'], direct: true },
    butterfield: { authority: 'peer-reviewed', scopes: ['pattern', 'instrument-technique'], direct: true },
    'carnegie-swing': { authority: 'professional-education', scopes: ['timing', 'pattern'], direct: true },
    columbia: { authority: 'university-research', scopes: ['pattern', 'instrument-technique'], direct: true },
    comping: { authority: 'professional-education', scopes: ['pattern'], direct: true },
    freddie: { authority: 'graduate-thesis', scopes: ['pattern', 'instrument-technique'], direct: true },
    musicxml: { authority: 'standard', scopes: ['timing', 'limitation'], direct: true },
    'triplet-definition': { authority: 'standard', scopes: ['timing', 'pattern'], direct: true },
    'shuffle-definition': { authority: 'professional-education', scopes: ['timing', 'pattern'], direct: true },
    'boogie-study': { authority: 'graduate-thesis', scopes: ['pattern'], direct: true },
    'boogie-riff': { authority: 'specialist-secondary', scopes: ['pattern', 'instrument-technique'], direct: true },
    'slow-blues': { authority: 'specialist-secondary', scopes: ['timing', 'pattern'], direct: true },
    'funk-microtiming': { authority: 'peer-reviewed', scopes: ['timing', 'pattern'], direct: true },
    'funk-one': { authority: 'graduate-thesis', scopes: ['pattern'], direct: true },
    'funk-syncopation': { authority: 'peer-reviewed', scopes: ['pattern'], direct: true },
    'berklee-rock-funk': { authority: 'higher-education', scopes: ['pattern', 'instrument-technique'], direct: true },
    'bossa-pattern-study': { authority: 'academic-conference', scopes: ['pattern', 'instrument-technique'], direct: true },
    'bossa-accompaniment': { authority: 'academic-conference', scopes: ['pattern', 'instrument-technique'], direct: true },
    'samba-microtiming': { authority: 'academic-conference', scopes: ['timing'], direct: true },
    'samba-tempo-study': { authority: 'peer-reviewed', scopes: ['timing', 'instrument-technique'], direct: true },
    'clave-analysis': { authority: 'academic-conference', scopes: ['pattern'], direct: true },
    'clave-grammar': { authority: 'peer-reviewed', scopes: ['pattern', 'instrument-technique'], direct: true },
    'conga-tumbao-study': { authority: 'peer-reviewed', scopes: ['timing', 'pattern', 'instrument-technique'], direct: true },
    'pop-syncopation-study': { authority: 'higher-education', scopes: ['pattern'], direct: true },
    'blue-note-grove': { authority: 'peer-reviewed', scopes: ['pitch'], direct: true },
    'blue-note-research': { authority: 'university-research', scopes: ['pitch', 'limitation'], direct: true },
    'blue-note-piano': { authority: 'higher-education', scopes: ['pitch', 'limitation'], direct: true },
};

export const auditEvidenceIds = (ids: readonly string[]) => {
    const entries = ids.map((id) => GROOVE_EVIDENCE_QUALITY[id]).filter(Boolean);
    return {
        missing: ids.filter((id) => !GROOVE_EVIDENCE_QUALITY[id]),
        hasReliableDirectSource: entries.some((entry) => entry.direct && RELIABLE_AUTHORITIES.has(entry.authority)),
        scopes: new Set(entries.flatMap((entry) => entry.scopes)),
    };
};
