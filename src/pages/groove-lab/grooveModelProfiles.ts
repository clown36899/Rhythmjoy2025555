import type { GrooveEvent, GrooveVoice } from './grooveEngine';

export interface VoiceModelProfile {
    label: string;
    implemented: string;
    omitted: string;
}

const STRING_MODEL_PROFILE: VoiceModelProfile = {
    label: '연구 기반 축약 웨이브가이드',
    implemented: '현 지연선 · 플럭 위치 · 두 편극 · 주법별 공격/감쇠',
    omitted: '악기·라이선스가 확인된 측정 몸통 IR · traveling-wave 기반 현/브리지 결합 · 실제 프렛/손가락 비선형',
};

export const MODEL_PROFILES: Partial<Record<GrooveVoice, VoiceModelProfile>> = {
    bass: {
        label: '실음 콘트라베이스 + 전기 베이스 축약',
        implemented: 'CC0 콘트라베이스 피치카토 실음 · 저음 E1–B1 워킹 · 2회 반복 타격 · 전기 베이스 현/픽업 모델',
        omitted: '연주자별 프레이징 · 전 음역·전 강도의 다중 샘플 · 전기 베이스의 실제 프렛/손가락 비선형',
    },
    guitar: STRING_MODEL_PROFILE,
    'bossa-guitar': STRING_MODEL_PROFILE,
    clav: { label: '클라비넷 웨이브가이드 축약', implemented: '현 · 플럭 위치 · 탄젠트 공격 · 매 5번째 배음 픽업 콤 · 측정 기본 앰프 셸프', omitted: '두 픽업 선택/위상 · 픽업 비선형 · 네 톤 스위치 · 얀 댐퍼 · 앤빌 비선형' },
    piano: { label: '해머·복현 합성 축약', implemented: '해머 공격 · 비정수 배음 · 음역별 1/2/3현 미세 비팅', omitted: '현 사이 브리지 결합 · 이중 감쇠 · 사운드보드 · 페달 공명' },
    boogie: { label: '해머·복현 합성 축약', implemented: '해머 공격 · 비정수 배음 · 저·중음 단현/복현', omitted: '현 사이 브리지 결합 · 이중 감쇠 · 사운드보드 · 페달 공명' },
    'blue-piano': { label: '해머·복현 합성 축약', implemented: '해머 공격 · 비정수 배음 · 복현 미세 비팅 · 인접 건반 병치', omitted: '한 음 내부 피치 벤드 · 현 사이 브리지 결합 · 사운드보드 · 페달 공명' },
    ride: { label: '심벌 다중 모드 축약', implemented: '비정수 모드 · 잡음 여기 · 타격별 감쇠', omitted: '비선형 셸 · 스틱/벨 위치 · 지지부 결합' },
    hat: { label: '심벌 다중 모드 축약', implemented: '비정수 모드 · 잡음 여기 · 타격별 감쇠', omitted: '상·하 심벌 충돌 · 페달 개방도 · 셸 비선형' },
    snare: { label: '막·스네어 축약', implemented: '다중 막 모드 · 스네어 잡음 · 고스트 강도', omitted: '막 장력 분포 · 와이어 결합 · 타격 위치' },
    kick: { label: '막 타악 축약', implemented: '저주파 피치 하강 · 비터 공격', omitted: '양면 막 결합 · 셸 공명 · 비터 재질' },
    conga: { label: '기본 한 북 툼바오 축약', implemented: 'heel · toe · 2박 slap · 4/4& open별 모드와 강세', omitted: '좌우 손 공간 차이 · 두 북 변형 · 막 비선형 · 셸/공기 결합' },
    surdo: { label: '막 타악 축약', implemented: '저주파 모드 · 강약 역할', omitted: '양면 막 · 뮤트 손 · 셸 결합' },
    pandeiro: { label: '판데이루 네 발음 축약', implemented: 'tung 저음 · tchi 징글 · pa 중앙 타격 · PA 큰 슬랩 · 연구 미세타이밍', omitted: 'ting 고음 저타 · tr 징글 롤 · 손 제스처 연속성 · 프레임 결합' },
    clave: { label: '목재 모달 축약', implemented: '비정수 목재 모드 · 짧은 감쇠', omitted: '막대 치수 · 손 공진기 · 타격 위치' },
    'blue-note': { label: '플럭 현 기타형 피치 벤드', implemented: '현 버퍼 전체의 연속 재생률 이동 · 피크 공격/감쇠', omitted: '실제 기타 픽업·앰프 · 프렛/손가락 접촉 · 보컬 포먼트 · 관악기 기류' },
};

const DEFAULT_MODEL_PROFILE: VoiceModelProfile = {
    label: '교육용 합성 가이드',
    implemented: '패턴 위치 · 강세 · 기본 발음 대비',
    omitted: '실제 악기 샘플과 연주자별 제스처',
};

const VOICE_LABELS: Record<GrooveVoice, string> = {
    ride: '라이드',
    hat: '하이햇',
    bass: '베이스',
    piano: '피아노',
    boogie: '부기 피아노',
    guitar: '기타',
    click: '클릭',
    snare: '스네어',
    kick: '킥',
    'blue-note': '기타형 벤드',
    'blue-piano': '블루 노트 피아노',
    clav: '클라비넷',
    'bossa-guitar': '보사 기타',
    surdo: '수르두',
    pandeiro: '판데이루',
    clave: '클라베',
    conga: '콩가',
};

export const getModelProfilesForEvents = (events: readonly GrooveEvent[]) => (
    Array.from(new Set(events.map((event) => event.voice))).map((voice) => ({
        voice,
        voiceLabel: VOICE_LABELS[voice],
        profile: MODEL_PROFILES[voice] ?? DEFAULT_MODEL_PROFILE,
    }))
);
