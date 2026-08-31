import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './groove-lab.css';
import {
    buildGrooveBar,
    getFeelLabel,
    getGrooveBeatsPerBar,
    getGrooveLoopBeats,
    getGrooveLoopBars,
    getGroovePreset,
    getSwingRatio,
    GROOVE_FAMILIES,
    GROOVE_PRESETS,
    type GrooveEvent,
    type GrooveFamilyId,
    type GrooveFeel,
    type GroovePresetId,
    type GrooveVoice,
} from './grooveEngine';
import {
    createGrooveAudioRuntime,
    createGrooveMasterOutput,
    scheduleGrooveVoice as scheduleHighQualityGrooveVoice,
} from './grooveAudio';
import { getModelProfilesForEvents } from './grooveModelProfiles';

const MIN_BPM = 50;
const MAX_BPM = 260;
const LOOK_AHEAD_SECONDS = 0.14;
const SCHEDULER_INTERVAL_MS = 25;

const clampBpm = (value: number) => Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, value)));

type QueuedVisualEvent = { id: string; time: number };
type PracticeMode = 'continuous' | 'listen-mute' | 'tempo-ladder';

const PRACTICE_MODES: readonly { id: PracticeMode; label: string; description: string }[] = [
    { id: 'continuous', label: '계속 듣기', description: '선택한 1~2마디 패턴을 끊김 없이 반복합니다.' },
    { id: 'listen-mute', label: '2+2 콜백', description: '2마디를 듣고 2마디는 소리를 비워 직접 연주하거나 클랩합니다.' },
    { id: 'tempo-ladder', label: '+2 사다리', description: '4마디마다 2 BPM씩 올리고 +10 BPM에서 시작 템포로 돌아옵니다.' },
] as const;

export const EVIDENCE = {
    friberg: {
        title: 'Friberg & Sundström (2002)',
        summary: '라이드의 스윙 비율은 템포에 따라 대략 선형으로 감소하며, 느린 템포에서는 3–3.5:1, 약 200 BPM에서 2:1, 매우 빠른 템포에서는 1:1에 접근했습니다.',
        href: 'https://doi.org/10.1525/mp.2002.19.3.333',
    },
    butterfield: {
        title: 'Butterfield (2010), Music Theory Online',
        summary: '표준 라이드 패턴은 네 박의 라이드, 2·4박 하이햇, 그리고 2·4박 뒤의 짧은 라이드 탭으로 분석됩니다.',
        href: 'https://mtosmt.org/issues/mto.10.16.4/mto.10.16.4.butterfield.pdf',
    },
    columbia: {
        title: 'Columbia Center for Jazz Studies',
        summary: '워킹은 특히 베이스가 화음을 따라 한 마디에 강한 네 박을 만드는 연주 방식으로 정의됩니다.',
        href: 'https://ccnmtl.columbia.edu/projects/jazzglossary/w/walk_or_walking.html',
    },
    comping: {
        title: 'An Approach to Comping: The Essentials',
        summary: 'Charleston 리듬은 다운비트와 업비트를 번갈아 놓는 재즈 컴핑의 기본 어휘로 제시됩니다.',
        href: 'https://www.jazzbooks.com/mm5/samples/D-AATC.pdf',
    },
    freddie: {
        title: 'William Paterson University 석사논문 — Freddie Green 분석',
        summary: '전 경력의 연주 전사를 분석한 연구는 네 박의 흔들리지 않는 펄스와 함께, 한 음 중심의 보이스 리딩 및 뮤트된 현이 만드는 타악적 질감을 핵심으로 봅니다. 앱은 큰 3음 코드를 반복하지 않고 이 축약 방향을 사용합니다.',
        href: 'https://www.freddiegreen.org/technique/butterman_thesis.pdf',
    },
    musicxml: {
        title: 'W3C MusicXML 4.0 swing 표준',
        summary: '스윙 재생은 두 연속 음의 first:second 비율로 표현하며, 2:1은 4분음표–8분음표 셋잇단음 재생을 뜻합니다.',
        href: 'https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/swing/',
    },
    'triplet-definition': {
        title: '셋잇단음·셔플 구분',
        summary: '셋잇단음은 한 박을 같은 세 값으로 나눕니다. 이 실험실의 셔플은 그 격자의 첫째·셋째만 내고 가운데는 쉼으로 처리합니다.',
        href: 'https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/swing/',
    },
    'shuffle-definition': {
        title: 'Alfred Music, Shuffle Rhythm',
        summary: '셔플은 8분음표 셋잇단음의 첫 음과 마지막 음을 사용하는 패턴으로 설명됩니다. 가운데 칸은 쉬는 것이 핵심입니다.',
        href: 'https://content.alfred.com/catpages/00-UBSBK103R.pdf',
    },
    'boogie-study': {
        title: 'University of Évora 박사논문 — The Twentieth Century Jazz Piano Trio',
        summary: '부기우기는 왼손 오스티나토가 4/4 한 마디의 여덟 하위 박을 지속하는 eight-to-the-bar 어법으로 기술됩니다.',
        href: 'https://dspace.uevora.pt/rdpc/handle/10174/18583',
    },
    'boogie-riff': {
        title: 'Boogie Shuffle 5도–6도 패턴',
        summary: '대표적인 기타 부기 셔플은 근음을 유지한 두 음 보이싱에서 5도와 6도를 교대합니다. 앱도 매 타격을 큰 3음 코드가 아닌 root–5th와 root–6th dyad로 냅니다.',
        href: 'https://www.guitarworld.com/lessons/artist-lessons/jim-oblon-inverted-boogie-riffing',
    },
    'berklee-groove-guitar': {
        title: 'Berklee — Rhythm and Groove Guitar',
        summary: '리듬 기타의 기본 도구로 Root 5·Root 6, 뮤트, 반복, 오른손 주법과 더블스톱을 분리해 가르칩니다. 앱의 셔플 기타는 Root 5/6 두 음형만 사용합니다.',
        href: 'https://online.berklee.edu/courses/rhythm-and-groove-guitar',
    },
    'slow-blues': {
        title: 'Slow Blues 12/8 연주 분석',
        summary: '12/8 슬로 블루스는 네 개의 큰 박 각각에 세 하위 박이 있으며, 드럼 하이햇이 그 세 칸을 모두 드러낼 수 있습니다.',
        href: 'https://www.guitarworld.com/lessons/techniques/if-you-learn-one-thing-from-buddy-guy-it-should-be-this',
    },
    'funk-microtiming': {
        title: 'Microtiming in Early Funk (peer-reviewed)',
        summary: '초기 펑크 분석은 16분음표 밀도, 싱코페이션, 대체 펄스와 곡별 미세타이밍을 핵심 특징으로 확인합니다.',
        href: 'https://www.gmth.de/zeitschrift/artikel/1224.aspx',
    },
    'funk-one': {
        title: 'Université de Montréal 박사논문 — Who Got Da Funk?',
        summary: 'James Brown식 펑크에서는 매 마디 첫 다운비트인 “the one”을 베이스와 리듬 섹션이 강하게 공유하는 원리가 강조됩니다.',
        href: 'https://tagg.org/bookxtrax/DavisFunkPhDv1.pdf',
    },
    'funk-syncopation': {
        title: 'Music Perception — Syncopation and Groove',
        summary: '16분음표 층의 싱코페이션과 악기 사이 교차 리듬은 펑크·R&B·살사 등 높은 그루브 유발 음악에서 반복적으로 나타납니다.',
        href: 'https://online.ucpress.edu/mp/article/39/5/503/182325/Syncopation-and-Groove-in-Polyphonic-MusicPatterns',
    },
    'berklee-rock-funk': {
        title: 'Berklee — Funk and Rock Drum Rhythms',
        summary: '같은 백비트에서도 드라이빙 8분 베이스는 록, 가볍고 싱코페이트된 16분 층은 펑크 성격을 만든다고 구분합니다.',
        href: 'https://online.berklee.edu/takenote/basic-funk-for-drums/',
    },
    'bossa-pattern-study': {
        title: 'ISMIR — Bossa Nova guitar pattern extraction',
        summary: 'MIDI 기타 실연에서 보사노바 반주 패턴을 추출해 연주자별 반복 어휘와 변형을 분석한 연구입니다.',
        href: 'https://ismir2008.ismir.net/papers/ISMIR2008_238.pdf',
    },
    'bossa-accompaniment': {
        title: 'SBCM — Generating Bossa Nova guitar accompaniment',
        summary: 'João Gilberto 계열 반주를 엄지 베이스와 손가락 코드 블록의 두 사건으로 구분하고, 2마디 패턴과 선행 싱코페이션을 핵심으로 설명합니다.',
        href: 'https://compmus.ime.usp.br/sbcm/2003/researchpapers/sbcm-researchpaper-2003-9.pdf',
    },
    'samba-microtiming': {
        title: 'Rhythmical structures in samba performance',
        summary: '한 실연 분석에서 네 16분음표 길이는 23.0%·23.6%·22.8%·30.7%로 측정됐고, 셋째와 넷째 onset이 균등 격자보다 앞섰습니다. 앱은 이를 정규화한 연구 예시를 사용합니다.',
        href: 'https://www.researchgate.net/publication/268219833_Rhythmical_structures_in_music_and_body_movement_in_samba_performance',
    },
    'samba-tempo-study': {
        title: 'Journal of New Music Research — Samba tempo study',
        summary: '판데이루 실연 분석은 템포에 따라 16분 하위 음가의 상대 길이가 달라짐을 조사해 고정 격자만으로 실연을 단정할 수 없음을 보여줍니다.',
        href: 'https://www.tandfonline.com/doi/abs/10.1080/09298215.2020.1767655',
    },
    'clave-analysis': {
        title: 'ISMIR — Rotation-aware Afro-Cuban clave analysis',
        summary: '아프로쿠반 리듬의 핵심 타임라인을 son clave와 rumba clave로 구분하고 회전·방향성을 분석합니다.',
        href: 'https://web.uvic.ca/~aschloss/publications/ISMIR08_Analyzing%20Afro-Cuban%20Rhythm.pdf',
    },
    'clave-grammar': {
        title: 'Current Musicology — Afro-Latin temporal grammar',
        summary: '클라베는 단독 타악 패턴을 넘어 베이스·콩가·기타 등 다른 악기의 프레이즈를 조직하는 시간적 기준으로 설명됩니다.',
        href: 'https://journals.library.columbia.edu/index.php/currentmusicology/article/view/5234',
    },
    'conga-tumbao-study': {
        title: 'AAWM — 쿠바 베이스·콩가 타이밍 실연 연구',
        summary: '기본 한 북 콩가 툼바오는 연속 8분 `heel–toe–slap–toe–heel–toe–open–open`이며, 2박 슬랩과 4박·4& 오픈톤이 자연 강세를 만듭니다. 앱은 이 손 발음 순서와 강세를 그대로 반복합니다.',
        href: 'https://journal.iftawm.org/wp-content/uploads/2023/01/Poole_AAWM_Vol_10_2.pdf',
    },
    'pop-syncopation-study': {
        title: 'Open Music Theory — Pop/Rock Syncopation',
        summary: '팝·록에서는 연속된 음을 약한 8분·16분 위치로 앞당기는 anticipation이 대표적인 싱코페이션 어휘로 제시됩니다.',
        href: 'https://openmusictheory.github.io/syncopation.html',
    },
    'blue-note-grove': {
        title: 'Empirical Musicology Review — 블루 노트 미분음 실측',
        summary: '초기 블루스 15곡의 1,101개 음을 측정한 연구는 319.1·582.8·1037.9센트 부근의 세 주요 군집과 연주자별 차이를 확인했습니다. 앱의 벤드는 이 넓은 현상을 한 가지 기타형 예시로만 들려줍니다.',
        href: 'https://doi.org/10.18061/emr.v13i1-2.6316',
    },
    'blue-note-research': {
        title: 'Eastman School of Music, Blue-note research',
        summary: '실제 보컬 분석에서는 장3도와 단3도 사이 같은 연속적인 피치 영역이 관찰됩니다. 따라서 단순한 고정 ♭3 하나와 같지 않습니다.',
        href: 'https://www.esm.rochester.edu/news/2017/04/unlocking-the-secrets-of-blue-notes/',
    },
    'blue-note-piano': {
        title: 'Jazz: The Basics — 악기별 한계',
        summary: '블루 노트는 흔히 움직이는 음높이라 고정 건반의 피아노가 그대로 낼 수 없습니다. 피아노 프리셋은 인접 건반 병치라는 근사임을 명시합니다.',
        href: 'https://api.pageplace.de/preview/DT0400.9781135887131_A24421853/preview-9781135887131_A24421853.pdf',
    },
    'karplus-strong': {
        title: 'Karplus & Strong (1983) — 현·드럼 디지털 합성',
        summary: '짧은 잡음 여기와 감쇠하는 지연선을 사용하면 고차 배음이 더 빨리 사라지는 발현·기타형 음색을 적은 연산으로 만들 수 있음을 제시한 원 논문입니다.',
        href: 'https://www.moforte.com/wp-content/uploads/2020/05/Karplus-Strong-CMJ-1983.pdf',
    },
    'drum-modal-synthesis': {
        title: 'Nagata & Saito (2025) — 드럼 모달 합성',
        summary: '실제 드럼의 타격 응답은 단일 오실레이터보다 여러 진동 모드와 방사 특성의 결합으로 모델링해야 함을 보여줍니다. 앱은 모바일 실시간성에 맞춰 축약된 다중 모드를 사용합니다.',
        href: 'https://doi.org/10.1177/10775463241272937',
    },
    'webaudio-dynamics': {
        title: 'W3C Web Audio 1.1 — 출력 다이내믹 처리',
        summary: '여러 소리가 동시에 겹칠 때 클리핑을 줄이기 위한 공식 DynamicsCompressorNode 규격을 따라 출력단에 DC 차단과 압축을 둡니다. 출처 없는 공통 톤 EQ는 악기별 스펙트럼을 오염시켜 제거했습니다.',
        href: 'https://webaudio.github.io/web-audio-api/#DynamicsCompressorNode',
    },
    'auditory-motor-learning': {
        title: 'Scientific Reports (2022) — 음악 연습의 청각 피드백',
        summary: '기타·피아노 학습자 115명을 비교한 연구에서 소리를 들으며 연주하는 조건과 무음 운동 연습이 서로 다른 학습 이점을 보였습니다. 2+2 콜백은 두 피드백 조건을 번갈아 경험하도록 단순화한 연습 모드입니다.',
        href: 'https://doi.org/10.1038/s41598-022-24262-x',
    },
    'practice-variability': {
        title: 'PLOS ONE (2018) — 템포 변동과 운동·타이밍 학습',
        summary: '초보 피아노 학습 실험에서 템포 변화의 폭과 순서가 타이밍 및 운동 기술의 전이에 서로 다르게 작용했습니다. 앱은 무작위 점프가 아니라 작은 폭의 비무작위 +2 BPM 사다리를 제공합니다.',
        href: 'https://doi.org/10.1371/journal.pone.0193580',
    },
    'stk-source': {
        title: 'Stanford CCRMA STK — 공개 합성 구현',
        summary: 'STK의 Twang 모델은 지연선·루프 필터·플럭 위치 콤 필터를 분리하고, 몸통 임펄스 응답을 입력으로 넣는 commuted synthesis 경로를 명시합니다. 앱의 현 모델 구조를 검토하는 공개 구현 기준으로 사용합니다.',
        href: 'https://github.com/thestk/stk/blob/master/src/Twang.cpp',
    },
    'stk-guitar-body-source': {
        title: 'Stanford CCRMA STK Guitar — 몸통 파일·결합 한계',
        summary: '공식 Guitar 모델은 외부 몸통 응답 파일을 받을 뿐 기타 IR을 기본 제공하지 않고, 파일이 없으면 임의 200샘플 노이즈를 사용합니다. 1% 브리지 피드백도 traveling-wave 성분에 접근하지 못하는 근사라고 소스가 명시하므로 앱은 측정 몸통·정밀 현 결합으로 확대하지 않습니다.',
        href: 'https://github.com/thestk/stk/blob/master/src/Guitar.cpp',
    },
    'stk-pickup-source': {
        title: 'Stanford CCRMA STK — 자기 픽업 위치 구현',
        summary: 'STK의 StifKarp는 현 출력에서 픽업 위치만큼 지연된 출력을 빼 별도의 스펙트럼 영점을 만듭니다. 앱은 이 공개 구현을 전기 베이스에만 적용하며, 특정 실물 베이스의 치수를 복제한다고 주장하지 않습니다.',
        href: 'https://github.com/thestk/stk/blob/master/include/StifKarp.h',
    },
    'faust-physical-models': {
        title: 'Stanford CCRMA·GRAME — Faust Physical Modeling Library',
        summary: '논문과 연결된 공식 라이브러리는 강철·나일론 현, 플럭 위치, 브리지, 모달 타악기를 모듈로 분리합니다. 동시에 현재 기타 몸통 모델이 완전하지 않다는 한계도 코드에 명시하므로 앱도 완전 재현이라고 주장하지 않습니다.',
        href: 'https://faustlibraries.grame.fr/libs/physmodels/',
    },
    'guitar-model': {
        title: 'DAFx — Full-scale acoustic guitar model',
        summary: '고급 기타 모델은 플럭 위치 필터, 주파수별 감쇠, 두 진동 편극, 몸통 전달함수와 공명, 현 사이 결합을 구분합니다. 앱은 모바일 실시간성을 위해 이 중 플럭 위치와 두 편극만 축약 구현합니다.',
        href: 'https://www.dafx.de/paper-archive/1999/karjalainen2.pdf',
    },
    'guitar-pluck': {
        title: 'DAFx — 기타 플럭 위치 추정 연구',
        summary: '브리지 근처 플럭은 고주파 성분이 강해지고, 플럭 위치에 따른 배음 영점이 생깁니다. 앱의 기타·베이스 발음별 플럭 위치 필터에 이 방향성을 사용합니다.',
        href: 'https://www.dafx.de/paper-archive/2000/pdf/Caroline_Traube.pdf',
    },
    'bass-synthesis': {
        title: 'Fraunhofer IDMT — Electric bass synthesis',
        summary: '핑거·피크·뮤트·슬랩 엄지·슬랩 팝과 데드 노트·벤드·슬라이드 등 연주법을 물리 영향과 청취 평가로 구분한 연구입니다. 앱은 현재 핑거·피크·뮤트·슬랩·팝·데드의 공격과 감쇠만 축약합니다.',
        href: 'https://www.idmt.fraunhofer.de/en/publications/datasets/bass_synthesis.html',
    },
    'bass-contact': {
        title: 'Applied Acoustics — 베이스 현·프렛 충돌 모델',
        summary: '슬랩과 팝의 타격성은 현과 프렛·넥 사이의 비선형 접촉에서 생깁니다. 앱은 짧은 대역 잡음으로 그 공격음을 근사하며 실제 충돌 해석은 아직 포함하지 않습니다.',
        href: 'https://doi.org/10.1016/j.apacoust.2017.07.021',
    },
    'piano-hammer': {
        title: 'DAFx — 비선형 피아노 해머·현 모델',
        summary: '피아노 발음은 해머–현의 비선형 힘, 뻣뻣한 현의 비정수 배음, 사운드보드 전달을 포함합니다. 앱은 해머 트랜지언트와 비정수 배음만 축약 구현합니다.',
        href: 'https://dafx.de/papers/DAFX02_Bank_Sujbert_piano_synthesis.pdf',
    },
    'piano-unison': {
        title: 'DAFx — 레이저 측정 기반 결합 피아노 현',
        summary: '실제 피아노의 중·고음은 매우 가깝게 조율된 2–3개 현이 같은 음을 내며 비팅을 만듭니다. 측정 연구의 이중 공진 간격은 0.1–5 Hz였습니다. 앱은 이 범위 안의 독립 복현만 축약하고 브리지 결합·이중 감쇠는 구현하지 않습니다.',
        href: 'https://www.dafx.de/paper-archive/1999/aramaki.pdf',
    },
    'cymbal-model': {
        title: 'Acoustical Science and Technology — 심벌 물리모델',
        summary: '심벌은 비선형 셸 진동과 지지·와셔·스틱 조건에 따라 음색이 달라집니다. 앱의 라이드·하이햇은 다중 비정수 모드와 잡음 여기만 사용하며 실제 셸 해석은 포함하지 않습니다.',
        href: 'https://doi.org/10.1250/ast.42.314',
    },
    'pandeiro-sounds': {
        title: 'ISMIR — 2,448개 판데이루 타격음 분석',
        summary: '전문 연주자가 녹음한 여섯 발음 중 앱은 반복 연습에 필요한 tung 저음, tchi 징글, pa 중앙 타격, PA 큰 슬랩을 네 하위박 역할로 사용합니다. 단순 강약 차이가 아니라 막 저음·징글·두 슬랩의 공격과 잔향을 구분합니다.',
        href: 'https://ismir2007.ismir.net/proceedings/ISMIR2007_p229_roy.pdf',
    },
    'clavinet-model': {
        title: 'EURASIP — Clavinet D6 디지털 웨이브가이드',
        summary: '실제 Clavinet D6 녹음과 오픈소스 Pure Data 모델을 함께 검증한 연구입니다. 매 5번째 배음의 픽업 콤 노치와 톤 스위치를 뺀 앰프의 −3 dB@130 Hz·+3 dB@4 kHz 응답을 축약합니다. 두 픽업 선택·비선형·톤 스위치는 포함하지 않습니다.',
        href: 'https://doi.org/10.1186/1687-6180-2013-103',
    },
} as const;

const PRACTICE_EVIDENCE = ['auditory-motor-learning', 'practice-variability'] as const;
const VOICE_MODEL_EVIDENCE: Partial<Record<GrooveVoice, readonly (keyof typeof EVIDENCE)[]>> = {
    ride: ['cymbal-model', 'drum-modal-synthesis', 'faust-physical-models'],
    hat: ['cymbal-model', 'drum-modal-synthesis', 'faust-physical-models'],
    snare: ['drum-modal-synthesis', 'faust-physical-models'],
    kick: ['drum-modal-synthesis', 'faust-physical-models'],
    surdo: ['drum-modal-synthesis', 'faust-physical-models'],
    pandeiro: ['pandeiro-sounds', 'drum-modal-synthesis', 'faust-physical-models'],
    clave: ['drum-modal-synthesis', 'faust-physical-models'],
    conga: ['conga-tumbao-study', 'drum-modal-synthesis', 'faust-physical-models'],
    bass: ['karplus-strong', 'stk-source', 'stk-pickup-source', 'faust-physical-models', 'guitar-pluck', 'bass-synthesis', 'bass-contact'],
    guitar: ['karplus-strong', 'stk-source', 'stk-guitar-body-source', 'faust-physical-models', 'guitar-model', 'guitar-pluck', 'berklee-groove-guitar'],
    'bossa-guitar': ['karplus-strong', 'stk-source', 'stk-guitar-body-source', 'faust-physical-models', 'guitar-model', 'guitar-pluck'],
    clav: ['karplus-strong', 'stk-source', 'clavinet-model'],
    piano: ['piano-hammer', 'piano-unison'],
    boogie: ['piano-hammer', 'piano-unison'],
    'blue-piano': ['piano-hammer', 'piano-unison'],
    'blue-note': ['guitar-model', 'guitar-pluck'],
};

const GrooveLabPage: React.FC = () => {
    const [presetId, setPresetId] = useState<GroovePresetId>('swing-ensemble');
    const [feel, setFeel] = useState<GrooveFeel>('adaptive');
    const [bpm, setBpm] = useState(140);
    const [volume, setVolume] = useState(72);
    const [isPlaying, setIsPlaying] = useState(false);
    const [practiceMode, setPracticeMode] = useState<PracticeMode>('continuous');
    const [practiceBar, setPracticeBar] = useState(0);
    const [practicePhase, setPracticePhase] = useState<'sound' | 'mute'>('sound');
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [tapTimes, setTapTimes] = useState<number[]>([]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioRuntimeRef = useRef(createGrooveAudioRuntime());
    const nextBarTimeRef = useRef(0);
    const queuedEventsRef = useRef<QueuedVisualEvent[]>([]);
    const volumeRef = useRef(volume);
    const bpmRef = useRef(bpm);
    const practiceBarRef = useRef(0);
    const ladderBaseBpmRef = useRef(bpm);
    const tapResetTimerRef = useRef<number | null>(null);

    const preset = getGroovePreset(presetId);
    const loopBeats = getGrooveLoopBeats(presetId);
    const beatsPerBar = getGrooveBeatsPerBar(presetId);
    const loopBars = getGrooveLoopBars(presetId);
    const effectiveFeel = preset.fixedTripletGrid ? 'triplet' : preset.timingLocked ? preset.recommendedFeel : feel;
    const feelOptions = preset.feelOptions ?? [];
    const hasRatioControl = feelOptions.length > 1;
    const swingRatio = getSwingRatio(effectiveFeel, bpm);
    const barEvents = useMemo(() => buildGrooveBar(presetId, feel, bpm), [bpm, feel, presetId]);
    const timelinePoints = useMemo(() => {
        const groups = new Map<string, GrooveEvent[]>();
        barEvents.forEach((item) => {
            const key = item.position.toFixed(4);
            groups.set(key, [...(groups.get(key) ?? []), item]);
        });
        return Array.from(groups.values());
    }, [barEvents]);
    const selectedEvidence = useMemo(() => (
        Array.from(new Set([
            ...preset.evidenceIds,
            ...barEvents.flatMap((item) => VOICE_MODEL_EVIDENCE[item.voice] ?? []),
            'webaudio-dynamics',
            ...PRACTICE_EVIDENCE,
        ]))
            .map((id) => EVIDENCE[id as keyof typeof EVIDENCE])
            .filter(Boolean)
    ), [barEvents, preset.evidenceIds]);
    const modelProfiles = useMemo(() => getModelProfilesForEvents(barEvents), [barEvents]);
    const familyPresets = useMemo(() => (
        GROOVE_PRESETS.filter((item) => item.family === preset.family)
    ), [preset.family]);

    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    useEffect(() => {
        bpmRef.current = bpm;
    }, [bpm]);

    const ensureAudioContext = useCallback(async () => {
        if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return null;
            audioContextRef.current = new AudioContextClass();
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    const handlePlay = useCallback(async () => {
        if (isPlaying) {
            setIsPlaying(false);
            return;
        }
        const context = await ensureAudioContext();
        if (!context) return;
        nextBarTimeRef.current = context.currentTime + 0.07;
        queuedEventsRef.current = [];
        practiceBarRef.current = 0;
        ladderBaseBpmRef.current = bpmRef.current;
        setPracticeBar(0);
        setPracticePhase('sound');
        setIsPlaying(true);
    }, [ensureAudioContext, isPlaying]);

    useEffect(() => {
        if (!isPlaying) {
            queuedEventsRef.current = [];
            setActiveEventId(null);
            return undefined;
        }

        const context = audioContextRef.current;
        if (!context) return undefined;
        nextBarTimeRef.current = Math.max(context.currentTime + 0.07, nextBarTimeRef.current);
        let animationFrame = 0;
        const phaseTimers: number[] = [];
        const runOutput = createGrooveMasterOutput(context, context.destination);

        const schedule = () => {
            while (nextBarTimeRef.current < context.currentTime + LOOK_AHEAD_SECONDS) {
                const scheduledBpm = bpmRef.current;
                const secondsPerBeat = 60 / scheduledBpm;
                const barNumber = practiceBarRef.current;
                const isMuteBar = practiceMode === 'listen-mute' && barNumber % 4 >= 2;
                const scheduledEvents = buildGrooveBar(presetId, feel, scheduledBpm);
                if (!isMuteBar) {
                    scheduledEvents.forEach((item) => {
                        const eventTime = nextBarTimeRef.current + item.position * secondsPerBeat;
                        scheduleHighQualityGrooveVoice(
                            context,
                            audioRuntimeRef.current,
                            eventTime,
                            item,
                            volumeRef.current,
                            runOutput.input,
                        );
                        queuedEventsRef.current.push({ id: item.id, time: eventTime });
                    });
                }

                const phaseDelay = Math.max(0, (nextBarTimeRef.current - context.currentTime) * 1000);
                const nextBarNumber = barNumber + loopBars;
                phaseTimers.push(window.setTimeout(() => {
                    setPracticeBar(nextBarNumber);
                    setPracticePhase(isMuteBar ? 'mute' : 'sound');
                    if (practiceMode === 'tempo-ladder' && nextBarNumber % 4 === 0) {
                        const ceiling = ladderBaseBpmRef.current + 10;
                        const nextBpm = bpmRef.current >= ceiling ? ladderBaseBpmRef.current : bpmRef.current + 2;
                        bpmRef.current = clampBpm(nextBpm);
                        setBpm(bpmRef.current);
                    }
                }, phaseDelay));
                practiceBarRef.current = nextBarNumber;
                nextBarTimeRef.current += secondsPerBeat * loopBeats;
            }
        };

        const animate = () => {
            const now = context.currentTime;
            queuedEventsRef.current = queuedEventsRef.current.filter((item) => item.time > now - 0.08);
            const current = queuedEventsRef.current.find((item) => Math.abs(item.time - now) < 0.055);
            setActiveEventId(current?.id ?? null);
            animationFrame = window.requestAnimationFrame(animate);
        };

        schedule();
        const scheduler = window.setInterval(schedule, SCHEDULER_INTERVAL_MS);
        animationFrame = window.requestAnimationFrame(animate);

        return () => {
            window.clearInterval(scheduler);
            window.cancelAnimationFrame(animationFrame);
            phaseTimers.forEach((timer) => window.clearTimeout(timer));
            queuedEventsRef.current = [];
            nextBarTimeRef.current = context.currentTime + 0.07;
            runOutput.dispose();
        };
    }, [feel, isPlaying, loopBars, loopBeats, practiceMode, presetId]);

    useEffect(() => () => {
        if (tapResetTimerRef.current !== null) window.clearTimeout(tapResetTimerRef.current);
        void audioContextRef.current?.close();
    }, []);

    const updateBpm = (next: number) => {
        const clamped = clampBpm(next);
        bpmRef.current = clamped;
        setBpm(clamped);
        if (!isPlaying || practiceMode !== 'tempo-ladder') ladderBaseBpmRef.current = clamped;
    };

    const selectPreset = (nextPresetId: GroovePresetId) => {
        const nextPreset = getGroovePreset(nextPresetId);
        setPresetId(nextPresetId);
        setFeel(nextPreset.recommendedFeel);
    };

    const selectFamily = (familyId: GrooveFamilyId) => {
        const firstPreset = GROOVE_PRESETS.find((item) => item.family === familyId);
        if (firstPreset) selectPreset(firstPreset.id);
    };

    const handleTap = () => {
        const now = performance.now();
        const recent = tapTimes.filter((time) => now - time < 2400);
        const next = [...recent, now].slice(-6);
        setTapTimes(next);
        if (next.length >= 2) {
            const intervals = next.slice(1).map((time, index) => time - next[index]);
            const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
            updateBpm(60000 / average);
        }
        if (tapResetTimerRef.current !== null) window.clearTimeout(tapResetTimerRef.current);
        tapResetTimerRef.current = window.setTimeout(() => setTapTimes([]), 2500);
    };

    return (
        <main className="groove-lab-page" onDragStart={(event) => event.preventDefault()}>
            <div className="groove-lab-content">
                <section className="groove-lab-intro" aria-labelledby="groove-lab-title">
                    <div>
                        <span className="groove-lab-beta">MEASURED SYNTH · 17 VOICES · {GROOVE_PRESETS.length} PRESETS</span>
                        <h1 id="groove-lab-title">악기별 리듬 그루브 랩</h1>
                        <p>박자만 세지 않고, 리듬 계열마다 악기가 맡는 위치·강세·음높이 표현을 반복합니다.</p>
                    </div>
                    <div className="groove-lab-ratio" aria-label={hasRatioControl ? `현재 타이밍 비율 ${swingRatio} 대 1` : '이 프리셋은 라이드 스윙 비율을 사용하지 않음'}>
                        <span>TIME FEEL · {loopBars} BAR LOOP</span>
                        <strong>{preset.fixedTripletGrid ? '2:1' : preset.timingLocked ? 'LOCK' : hasRatioControl ? `${swingRatio.toFixed(2)}:1` : 'PULSE'}</strong>
                        <small>{preset.fixedTripletGrid ? '고정 셋잇단 격자' : preset.timingLocked ? '프리셋 고정 타이밍' : hasRatioControl ? getFeelLabel(feel) : '라이드 비율 비적용'}</small>
                    </div>
                </section>

                <section className="groove-lab-transport" aria-label="재생 및 템포">
                    <button className="groove-lab-tap" type="button" onClick={handleTap} aria-label="탭으로 BPM 측정">
                        <span>TAP</span>
                        <strong>{bpm}</strong>
                        <small>BPM</small>
                    </button>
                    <div className="groove-lab-play-column">
                        <button
                            type="button"
                            className={`groove-lab-play ${isPlaying ? 'is-playing' : ''}`}
                            onClick={() => void handlePlay()}
                            aria-label={isPlaying ? '그루브 정지' : '그루브 재생'}
                        >
                            <i className={isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} aria-hidden="true" />
                            <span>{isPlaying ? '정지' : '듣기'}</span>
                        </button>
                        <div className="groove-lab-steps" aria-label="BPM 미세 조정">
                            {[-5, -1, 1, 5].map((step) => (
                                <button key={step} type="button" onClick={() => updateBpm(bpm + step)}>
                                    {step > 0 ? `+${step}` : step}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="groove-lab-control-card" aria-label="스윙 표현 설정">
                    <div className="groove-lab-control-head">
                        <div>
                            <span>표현 방식</span>
                            <strong>{preset.fixedTripletGrid || preset.timingLocked ? '프리셋 고정' : preset.id === 'swing-ensemble' ? '앙상블의 라이드 분할만 비교합니다' : hasRatioControl ? '이 악기의 분할만 비교합니다' : '박·강세·발음으로 표현합니다'}</strong>
                        </div>
                        <label>
                            음량 {volume}%
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={(event) => setVolume(Number(event.target.value))}
                                aria-label="음량"
                            />
                        </label>
                    </div>
                    <div className="groove-lab-feels" role="group" aria-label="스윙 표현">
                        {(hasRatioControl ? feelOptions : [effectiveFeel]).map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={effectiveFeel === option ? 'active' : ''}
                                onClick={() => setFeel(option)}
                                disabled={!hasRatioControl || preset.fixedTripletGrid || preset.timingLocked}
                            >
                                {getFeelLabel(option)}
                            </button>
                        ))}
                    </div>
                    <p className="groove-lab-feel-note">
                        {preset.fixedTripletGrid
                            ? '이 프리셋은 세 칸이 같은 정확한 셋잇단음 격자를 사용합니다.'
                            : preset.timingLocked
                                ? '연구된 대표 패턴의 기준 격자를 고정해 악기 사이의 맞물림을 비교합니다.'
                            : !hasRatioControl
                                ? '이 악기는 라이드의 롱–숏 비율을 적용하지 않습니다. 박의 위치, 강세와 발음 길이로 역할을 표현합니다.'
                            : feel === 'adaptive'
                                ? `드러머 라이드 측정 경향을 교육용으로 보간해 ${bpm} BPM에서 ${swingRatio.toFixed(2)}:1로 재생합니다. 베이스와 기타의 네 박은 균등하게 유지하며, 솔리스트의 비율과 같다는 뜻은 아닙니다.`
                                : feel === 'triplet'
                                    ? '첫 음 2칸 + 둘째 음 1칸의 정확한 2:1 해석입니다.'
                                    : '두 8분음표를 같은 길이로 재생합니다.'}
                    </p>
                </section>

                <section className="groove-lab-practice" aria-labelledby="groove-practice-title">
                    <div className="groove-lab-control-head">
                        <div>
                            <span>PRACTICE LOOP</span>
                            <strong id="groove-practice-title">반복 연습 방식</strong>
                        </div>
                        <span className={`groove-lab-phase ${practicePhase === 'mute' ? 'is-mute' : ''}`}>
                            {isPlaying ? `${practiceBar}마디 · ${practicePhase === 'mute' ? '내 차례' : '듣기'}` : '대기'}
                        </span>
                    </div>
                    <div className="groove-lab-practice-modes" role="group" aria-label="반복 연습 방식">
                        {PRACTICE_MODES.map((mode) => (
                            <button
                                key={mode.id}
                                type="button"
                                className={practiceMode === mode.id ? 'active' : ''}
                                onClick={() => setPracticeMode(mode.id)}
                                aria-pressed={practiceMode === mode.id}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                    <p>{PRACTICE_MODES.find((mode) => mode.id === practiceMode)?.description}</p>
                </section>

                <section className="groove-lab-timeline" aria-label={`${preset.name} ${loopBars}마디 패턴`}>
                    <div className="groove-lab-section-heading">
                        <div>
                            <span>{preset.instrument}</span>
                            <h2>{preset.name}</h2>
                        </div>
                        <code>{preset.pattern}</code>
                    </div>
                    <div
                        className="groove-lab-track"
                        aria-hidden="true"
                        style={{ '--beat-grid': `${100 / loopBeats}%` } as React.CSSProperties}
                    >
                        {Array.from({ length: loopBeats }, (_, beat) => beat).map((beat) => (
                            <span
                                key={beat}
                                className={`groove-lab-beat-line ${beat > 0 && beat % beatsPerBar === 0 ? 'is-bar-start' : ''}`}
                                style={{ left: `${(beat / loopBeats) * 100}%` }}
                            >
                                <b>{(beat % beatsPerBar) + 1}</b>
                            </span>
                        ))}
                        {timelinePoints.map((group) => {
                            const first = group[0];
                            const isActive = group.some((item) => item.id === activeEventId);
                            return (
                                <span
                                    key={first.position}
                                    className={`groove-lab-hit groove-lab-hit--${first.voice} ${isActive ? 'active' : ''}`}
                                    style={{ left: `${(first.position / loopBeats) * 100}%`, '--hit-color': preset.color } as React.CSSProperties}
                                >
                                    {group.length > 1 && <small>{group.length}</small>}
                                </span>
                            );
                        })}
                    </div>
                    <p>{preset.explanation}</p>
                </section>

                <section className="groove-lab-presets" aria-labelledby="groove-preset-title">
                    <div className="groove-lab-section-heading">
                        <div>
                            <span>INSTRUMENT ROLE</span>
                            <h2 id="groove-preset-title">악기 프리셋</h2>
                        </div>
                        <small>총 {GROOVE_PRESETS.length}개 · 리듬 × 악기</small>
                    </div>
                    <div className="groove-lab-family-tabs" role="tablist" aria-label="리듬 계열">
                        {GROOVE_FAMILIES.map((family) => (
                            <button
                                key={family.id}
                                type="button"
                                role="tab"
                                aria-selected={family.id === preset.family}
                                className={family.id === preset.family ? 'active' : ''}
                                onClick={() => selectFamily(family.id)}
                            >
                                {family.label}
                            </button>
                        ))}
                    </div>
                    <p className="groove-lab-family-description">
                        {GROOVE_FAMILIES.find((family) => family.id === preset.family)?.description}
                    </p>
                    {preset.family === 'blue-note' && (
                        <p className="groove-lab-concept-note">
                            <i className="ri-information-line" aria-hidden="true" />
                            <span><strong>블루 노트는 리듬 이름이 아닙니다.</strong> 선택한 타이밍 위에 악기별 음높이 표현을 얹어 비교합니다.</span>
                        </p>
                    )}
                    <div className="groove-lab-preset-grid">
                        {familyPresets.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={item.id === presetId ? 'active' : ''}
                                onClick={() => selectPreset(item.id)}
                                aria-pressed={item.id === presetId}
                                style={{ '--preset-color': item.color } as React.CSSProperties}
                            >
                                <i className={item.icon} aria-hidden="true" />
                                <span>
                                    <small>{item.instrument}</small>
                                    <strong>{item.shortName}</strong>
                                </span>
                                {item.id === presetId && <i className="ri-check-line groove-lab-check" aria-hidden="true" />}
                            </button>
                        ))}
                    </div>
                </section>

                <details className="groove-lab-evidence">
                    <summary>
                        <span><i className="ri-book-open-line" aria-hidden="true" /> 현재 프리셋의 조사 근거</span>
                        <i className="ri-arrow-down-s-line" aria-hidden="true" />
                    </summary>
                    <div>
                        <div className="groove-lab-model-scope-list" aria-label="현재 소리 모델 범위">
                            {modelProfiles.map(({ voice, voiceLabel, profile }) => (
                                <section className="groove-lab-model-scope" key={voice}>
                                    <span>MODEL SCOPE · {voiceLabel}</span>
                                    <strong>{profile.label}</strong>
                                    <p><b>현재 포함</b>{profile.implemented}</p>
                                    <p><b>아직 제외</b>{profile.omitted}</p>
                                </section>
                            ))}
                        </div>
                        {selectedEvidence.map((source) => (
                            <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
                                <strong>{source.title}</strong>
                                <p>{source.summary}</p>
                                <span>원문 보기 <i className="ri-external-link-line" aria-hidden="true" /></span>
                            </a>
                        ))}
                        <p className="groove-lab-caveat">
                            프리셋은 연구된 공통 골격을 연습용 1~2마디로 단순화한 합성 모델입니다. 실제 악기 녹음이나 모든 연주자의 대표값이 아니며 곡·앙상블·개인 스타일에 따라 달라집니다.
                        </p>
                    </div>
                </details>
            </div>
        </main>
    );
};

export default GrooveLabPage;
