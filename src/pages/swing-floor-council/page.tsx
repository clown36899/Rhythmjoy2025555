import { useEffect, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { cafe24 } from '../../lib/cafe24Client';

import './swing-floor-council.css';

const CONTENT_SETTING_KEY = 'swing_floor_council_page_content';
const CONTENT_SCHEMA_VERSION = 2;

interface VoteStep {
  value: string;
  label: string;
}

interface CouncilContent {
  contentVersion: number;
  kicker: string;
  title: string;
  lead: string;
  leadStrong: string;
  whyTitle: string;
  whyBody: string;
  voteTitle: string;
  voteSteps: VoteStep[];
  voteBody: string;
  voteDetailBody: string;
  accountingTitle: string;
  accountingBody: string;
  accountingRules: string[];
  bylawTitle: string;
  bylawBody: string;
  bylawRules: string[];
  notTitle: string;
  noTouchRules: string[];
  notNote: string;
  moneyTitle: string;
  moneyOptions: string[];
  moneyBody: string;
  spendExamplesTitle: string;
  spendTargets: string[];
  spendDecisionBody: string;
  rulesTitle: string;
  simpleRules: string[];
  startTitle: string;
  firstSteps: string[];
  joinTitle: string;
  joinBody1: string;
  joinBody2: string;
  smallPrintTitle: string;
  smallPrintBody: string;
}

type CouncilListKey =
  | 'accountingRules'
  | 'bylawRules'
  | 'noTouchRules'
  | 'moneyOptions'
  | 'spendTargets'
  | 'simpleRules'
  | 'firstSteps';

const COUNCIL_LIST_KEYS: CouncilListKey[] = [
  'accountingRules',
  'bylawRules',
  'noTouchRules',
  'moneyOptions',
  'spendTargets',
  'simpleRules',
  'firstSteps',
];

const DEFAULT_CONTENT: CouncilContent = {
  contentVersion: CONTENT_SCHEMA_VERSION,
  kicker: '발기인 모집 초안',
  title: '스윙을 오래 추려면, 같이 쓸 플로어가 필요합니다.',
  lead: '한국 스윙씬은 점점 작아지고 있습니다. 새로 들어오는 사람은 줄고, 함께 모일 수 있는 스윙바와 플로어도 늘 불안합니다.',
  leadStrong: '그래서 누군가를 대표하는 단체가 아니라, 필요한 일을 같이 정하고 같이 돕는 협의체를 만들려고 합니다.',
  whyTitle: '왜 모이나요?',
  whyBody: '혼자서는 공간을 지키기 어렵고, 한 팀만으로는 신규 유입을 만들기 어렵습니다. 하지만 여러 사람이 조금씩 모이면 대관비, 홍보비, 체험 행사, 운영 인력 지원을 시작할 수 있습니다.',
  voteTitle: '모든 결정은 투표로 정합니다',
  voteSteps: [
    { value: '100개', label: '아이디어를 받습니다' },
    { value: '30개', label: '1차 투표로 줄입니다' },
    { value: '1개', label: '2차 투표로 실행합니다' },
  ],
  voteBody: '지원 항목, 지출, 운영 방식, 투표 기간, 운영 담당자 교체까지 모두 회원 전체 투표로 정합니다. 아이디어를 받고, 1차 투표로 줄이고, 2차 투표로 실행할 일을 정합니다. 단, 아래 고정 조항은 투표로도 바꾸지 않습니다.',
  voteDetailBody: '단순 토론만으로는 모두의 의견을 모으기 어렵다는 경험에서 이 방식을 사용하려고 합니다. 2차에 걸친 투표와 투표 기간의 길이 조절로, 모두의 의견이 충분히 반영되는 흐름을 만들려고 합니다.',
  accountingTitle: '회계는 모두가 실시간으로 봅니다',
  accountingBody: '회계사가 따로 숨어서 장부를 들고 있는 방식이 아닙니다. 협의체 명의의 공용 통장을 만들고, 입금과 지출 내역을 참여자가 언제든 확인할 수 있게 공개 장부로 연결합니다. 회계 담당자는 돈을 보관하고 송금할 뿐, 안건을 만들거나 지출 목적을 결정하지 않습니다.',
  accountingRules: [
    '모든 회비와 후원금은 공용 통장 한 곳으로만 받는다.',
    '통장 거래 내역과 공개 장부는 참여자가 상시 확인할 수 있게 공개한다.',
    '개인정보와 보안상 필요한 부분만 최소한으로 가리고 날짜, 금액, 사용처, 증빙은 공개한다.',
    '회계 담당자는 계좌 관리와 송금만 맡고, 안건 입안과 지출 결정에는 관여하지 않는다.',
    '안건을 만들고 결정하는 권한은 회원 전체에게 있으며, 회계 권한과 완전히 분리한다.',
    '지출은 투표로 정한 안건 안에서만 집행한다.',
  ],
  bylawTitle: '절대 바꾸지 않는 고정 조항',
  bylawBody: '지금 단계에서는 회칙으로, 나중에 협동조합이나 법인이 되면 정관으로 고정합니다. 아래 조항은 협의체의 존재 이유이므로 개정 대상에서 제외합니다. 이 조항들을 제외한 운영 방식은 회원 투표로 바꿀 수 있습니다.',
  bylawRules: [
    '협의체는 자격증, 등급 인증, 강사 인증을 만들거나 관리하지 않는다.',
    '협의체는 대회 심사, 심사 기준, 심사위원 선정에 관여하지 않는다.',
    '협의체는 회장을 만들지 않는다. 대표 권한을 한 사람에게 모으지 않는다.',
    '회계는 공용 통장과 공개 장부로 상시 확인 가능하게 운영한다.',
    '안건 입안과 회계 보관, 회계 집행 권한은 완전히 분리한다.',
    '안건은 회원 전체가 제안하고 투표로 결정하며, 운영진은 결정된 일만 집행한다.',
    '위 고정 조항은 투표로도 바꾸지 않는다.',
  ],
  notTitle: '이 협의체가 하지 않는 일',
  noTouchRules: [
    '자격증을 만들거나 관리하지 않는다.',
    '대회 심사와 심사위원 선정에 관여하지 않는다.',
    '회장을 만들지 않는다.',
    '안건 입안과 회계 집행 권한을 섞지 않는다.',
    '강사, 바, 동호회, 지역의 위아래를 정하지 않는다.',
    '누가 정통인지 판정하지 않는다.',
  ],
  notNote: '이 원칙은 처음부터 고정합니다. 이 부분은 운영 의견이 아니라 협의체의 고정 조항이며, 투표로도 바꾸지 않습니다.',
  moneyTitle: '돈은 이렇게 모으고 씁니다',
  moneyOptions: ['월 3만 원', '월 5만 원', '월 10만 원'],
  moneyBody: '금액은 각자 가능한 만큼 선택합니다. 많이 낸 사람이 더 큰 권한을 갖지는 않습니다.',
  spendExamplesTitle: '아래는 정해진 사용처가 아니라 예시입니다',
  spendTargets: [
    '스윙바와 플로어 대관비 지원',
    '처음 오는 사람을 위한 무료 체험 행사',
    '지역 교류 소셜과 합동 파티',
    '강사, DJ, 운영자 워크숍',
    '예술인 등록, 지원사업 신청 등 행정 업무 위탁 지원',
    '홍보 콘텐츠 제작',
    '없어질 위기의 공간 긴급 지원',
  ],
  spendDecisionBody: '위 항목은 확정된 사업이 아닙니다. 스윙바와 플로어 대관비 지원, 무료 체험 행사, 행정 업무 위탁 지원 같은 다양한 아이디어를 모아 투표로 정합니다. 비용 집행일 수도 있고, 인원 지원일 수도 있습니다. 여러분의 아이디어를 모으고 투표로 결정한 뒤 집행합니다.',
  rulesTitle: '운영진은 회장이 아니라 집행팀입니다',
  simpleRules: [
    '운영진은 회원 투표로 정한 일을 처리하는 집행 담당이다.',
    '운영진은 임기를 두고, 회원 투표로 언제든 교체할 수 있다.',
    '안건을 만들고 결정하는 권한은 회원 전체에게 있다.',
    '운영진은 통과된 안건만 집행한다.',
    '투표 기간, 운영 방식, 담당자 수는 회원 투표로 바꿀 수 있다.',
    '단, 고정 조항은 변경 대상이 아니다.',
  ],
  startTitle: '처음 3개월은 이렇게 시작합니다',
  firstSteps: [
    '발기인 30명을 먼저 모은다.',
    '월 3만 원, 5만 원, 10만 원 중 자율 후원으로 시작한다.',
    '회장 없이 임기 있는 운영 담당자와 회계 담당자를 따로 뽑는다.',
    '공용 통장과 공개 장부를 먼저 만든다.',
    '첫 투표로 투표 기간, 운영 담당, 지원 우선순위를 정한다.',
    '첫 돈은 신규 유입과 플로어 유지에만 쓴다.',
  ],
  joinTitle: '발기인은 이런 사람을 찾습니다',
  joinBody1: '스윙댄스를 계속 추고 싶은 사람, 새로 오는 사람을 반기고 싶은 사람, 플로어와 공간을 같이 지키고 싶은 사람이면 됩니다.',
  joinBody2: '특정 팀을 대표하지 않아도 됩니다. 강사가 아니어도 됩니다. 오래 춘 사람이 아니어도 됩니다. “같이 해보자”는 마음이 있으면 충분합니다.',
  smallPrintTitle: '작은 확인사항',
  smallPrintBody: '지금 단계는 정식 법인 문서가 아니라 발기인 모집용 초안입니다. 사람이 모이면 회칙 또는 정관 초안을 만들고, 고정 조항을 먼저 넣은 뒤 조직 형태를 검토합니다. 고정 조항을 제외한 나머지는 회원 투표로 바꿀 수 있습니다.',
};

const LOCKED_DEFAULT_KEYS: Array<keyof CouncilContent> = [
  'voteTitle',
  'voteBody',
  'accountingTitle',
  'accountingBody',
  'accountingRules',
  'bylawTitle',
  'bylawBody',
  'bylawRules',
  'notTitle',
  'noTouchRules',
  'notNote',
  'moneyBody',
  'spendTargets',
  'rulesTitle',
  'simpleRules',
  'firstSteps',
  'smallPrintBody',
];

const listFromValue = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item || '').trim()).filter(Boolean);
  return list.length ? list : fallback;
};

const stripManualNumberPrefix = (value: string) => (
  value.replace(/^\s*\d{1,2}\s*(?:[.)]|번|:|-)\s*/, '').trim()
);

const bylawListFromValue = (value: unknown) => (
  listFromValue(value, DEFAULT_CONTENT.bylawRules)
    .map(stripManualNumberPrefix)
    .filter(Boolean)
);

const voteStepsFromValue = (value: unknown) => {
  if (!Array.isArray(value)) return DEFAULT_CONTENT.voteSteps;
  const list = value
    .map((item) => ({
      value: String((item as VoteStep)?.value || '').trim(),
      label: String((item as VoteStep)?.label || '').trim(),
    }))
    .filter((item) => item.value && item.label);
  return list.length ? list : DEFAULT_CONTENT.voteSteps;
};

const mergeContent = (value: unknown): CouncilContent => {
  const source = value && typeof value === 'object' ? value as Partial<CouncilContent> : {};
  const isLegacyContent = Number(source.contentVersion || 0) < CONTENT_SCHEMA_VERSION;
  const merged: CouncilContent = {
    ...DEFAULT_CONTENT,
    ...source,
    contentVersion: CONTENT_SCHEMA_VERSION,
  };

  if (isLegacyContent) {
    LOCKED_DEFAULT_KEYS.forEach((key) => {
      (merged[key] as CouncilContent[typeof key]) = DEFAULT_CONTENT[key];
    });
  }

  return {
    ...merged,
    accountingRules: listFromValue(merged.accountingRules, DEFAULT_CONTENT.accountingRules),
    bylawRules: bylawListFromValue(merged.bylawRules),
    noTouchRules: listFromValue(merged.noTouchRules, DEFAULT_CONTENT.noTouchRules),
    moneyOptions: listFromValue(merged.moneyOptions, DEFAULT_CONTENT.moneyOptions),
    spendTargets: listFromValue(merged.spendTargets, DEFAULT_CONTENT.spendTargets),
    voteSteps: voteStepsFromValue(merged.voteSteps),
    simpleRules: listFromValue(merged.simpleRules, DEFAULT_CONTENT.simpleRules),
    firstSteps: listFromValue(merged.firstSteps, DEFAULT_CONTENT.firstSteps),
  };
};

const listToText = (items: string[]) => items.join('\n');

const contentToListTextDraft = (value: CouncilContent): Record<CouncilListKey, string> => ({
  accountingRules: listToText(value.accountingRules),
  bylawRules: listToText(value.bylawRules),
  noTouchRules: listToText(value.noTouchRules),
  moneyOptions: listToText(value.moneyOptions),
  spendTargets: listToText(value.spendTargets),
  simpleRules: listToText(value.simpleRules),
  firstSteps: listToText(value.firstSteps),
});

const textToList = (value: string) => (
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
);

const contentWithListTextDraft = (
  value: CouncilContent,
  listTextDraft: Record<CouncilListKey, string>,
): CouncilContent => {
  const nextContent = { ...value };

  COUNCIL_LIST_KEYS.forEach((key) => {
    nextContent[key] = textToList(listTextDraft[key]) as CouncilContent[typeof key];
  });

  return nextContent;
};

const stopEditorKeyboardPropagation = (event: KeyboardEvent) => {
  event.stopPropagation();
};

export default function SwingFloorCouncilPage() {
  const { isAdmin, isAuthCheckComplete } = useAuth();
  const [copyLabel, setCopyLabel] = useState('링크 복사');
  const [content, setContent] = useState<CouncilContent>(DEFAULT_CONTENT);
  const [draft, setDraft] = useState<CouncilContent>(DEFAULT_CONTENT);
  const [draftListText, setDraftListText] = useState<Record<CouncilListKey, string>>(() => (
    contentToListTextDraft(DEFAULT_CONTENT)
  ));
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    document.title = '스윙 플로어 협의체 발기인 모집 | 댄스빌보드';
  }, []);

  useEffect(() => {
    let active = true;

    const loadContent = async () => {
      setIsLoadingContent(true);
      try {
        const { data, error } = await cafe24
          .from('app_settings')
          .select('value')
          .eq('key', CONTENT_SETTING_KEY)
          .maybeSingle();

        if (!active) return;
        if (error) throw error;

        const nextContent = mergeContent(data?.value);
        setContent(nextContent);
        setDraft(nextContent);
        setDraftListText(contentToListTextDraft(nextContent));
      } catch (error) {
        console.error('[SwingFloorCouncilPage] content load failed:', error);
        if (active) setStatusMessage('저장된 문안을 불러오지 못해 기본 문안을 표시 중입니다.');
      } finally {
        if (active) setIsLoadingContent(false);
      }
    };

    loadContent();
    return () => {
      active = false;
    };
  }, []);

  const handleCopyLink = async () => {
    const url = window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      setCopyLabel('복사됨');
    } catch {
      window.prompt('이 링크를 복사해주세요.', url);
      setCopyLabel('복사 안내');
    }

    window.setTimeout(() => setCopyLabel('링크 복사'), 1800);
  };

  const updateDraft = <K extends keyof CouncilContent>(key: K, value: CouncilContent[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateDraftList = (key: CouncilListKey, value: string) => {
    setDraftListText((prev) => ({ ...prev, [key]: value }));
    updateDraft(key, textToList(value));
  };

  const updateVoteStep = (index: number, field: keyof VoteStep, value: string) => {
    setDraft((prev) => ({
      ...prev,
      voteSteps: prev.voteSteps.map((step, stepIndex) => (
        stepIndex === index ? { ...step, [field]: value } : step
      )),
    }));
  };

  const handleStartEdit = () => {
    setDraft(content);
    setDraftListText(contentToListTextDraft(content));
    setStatusMessage('');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(content);
    setDraftListText(contentToListTextDraft(content));
    setIsEditing(false);
    setStatusMessage('');
  };

  const handleResetDraft = () => {
    if (!window.confirm('현재 편집 중인 내용을 기본 초안으로 되돌릴까요? 저장 전까지 공개 페이지에는 반영되지 않습니다.')) return;
    setDraft(DEFAULT_CONTENT);
    setDraftListText(contentToListTextDraft(DEFAULT_CONTENT));
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setStatusMessage('관리자만 저장할 수 있습니다.');
      return;
    }

    setIsSaving(true);
    setStatusMessage('');
    try {
      const normalized = mergeContent(contentWithListTextDraft(draft, draftListText));
      const { error } = await cafe24
        .from('app_settings')
        .upsert({
          key: CONTENT_SETTING_KEY,
          value: normalized,
          description: 'Swing floor council founder page content',
        }, { onConflict: 'key' });

      if (error) throw error;
      setContent(normalized);
      setDraft(normalized);
      setDraftListText(contentToListTextDraft(normalized));
      setIsEditing(false);
      setStatusMessage('저장되었습니다. 공개 페이지에 바로 반영됐습니다.');
    } catch (error) {
      console.error('[SwingFloorCouncilPage] content save failed:', error);
      setStatusMessage('저장에 실패했습니다. 관리자 로그인 상태를 확인해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="sfc-page">
      {isAuthCheckComplete && isAdmin && (
        <div className="sfc-admin-bar" aria-label="관리자 편집">
          <span>{isLoadingContent ? '문안 확인 중' : '관리자 편집'}</span>
          {isEditing ? (
            <>
              <button type="button" onClick={handleSave} disabled={isSaving}>
                {isSaving ? '저장 중' : '저장'}
              </button>
              <button type="button" onClick={handleCancelEdit} disabled={isSaving}>
                취소
              </button>
            </>
          ) : (
            <button type="button" onClick={handleStartEdit}>
              내용 편집
            </button>
          )}
        </div>
      )}

      <section className="sfc-hero" aria-labelledby="sfc-title">
        <p className="sfc-kicker">{content.kicker}</p>
        <h1 id="sfc-title">{content.title}</h1>
        <p className="sfc-lead">{content.lead}</p>
        <p className="sfc-lead sfc-lead-strong">{content.leadStrong}</p>

        <div className="sfc-actions" aria-label="공유">
          <button type="button" className="sfc-primary-button" onClick={handleCopyLink}>
            <i className="ri-link" aria-hidden="true" />
            {copyLabel}
          </button>
        </div>
      </section>

      {statusMessage && (isAdmin || isEditing) && (
        <p className="sfc-status" role="status">
          {statusMessage}
        </p>
      )}

      {isEditing && (
        <section
          className="sfc-editor"
          aria-label="문안 편집"
          onKeyDown={stopEditorKeyboardPropagation}
          onKeyUp={stopEditorKeyboardPropagation}
        >
          <div className="sfc-editor-head">
            <h2>문안 편집</h2>
            <button type="button" onClick={handleResetDraft} disabled={isSaving}>
              기본 초안으로
            </button>
          </div>

          <label>
            작은 라벨
            <input value={draft.kicker} onChange={(event) => updateDraft('kicker', event.target.value)} />
          </label>
          <label>
            맨 위 큰 제목
            <textarea rows={2} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
          </label>
          <label>
            맨 위 설명
            <textarea rows={3} value={draft.lead} onChange={(event) => updateDraft('lead', event.target.value)} />
          </label>
          <label>
            강조 문장
            <textarea rows={3} value={draft.leadStrong} onChange={(event) => updateDraft('leadStrong', event.target.value)} />
          </label>

          <div className="sfc-editor-grid">
            <h3>01 섹션</h3>
            <label>
              01 섹션 제목
              <input value={draft.whyTitle} onChange={(event) => updateDraft('whyTitle', event.target.value)} />
            </label>
            <label>
              01 내용
              <textarea rows={4} value={draft.whyBody} onChange={(event) => updateDraft('whyBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>02 섹션</h3>
            <label>
              02 섹션 제목
              <input value={draft.bylawTitle} onChange={(event) => updateDraft('bylawTitle', event.target.value)} />
            </label>
            <label>
              02 고정 조항 목록
              <textarea rows={8} value={draftListText.bylawRules} onChange={(event) => updateDraftList('bylawRules', event.target.value)} />
            </label>
            <label>
              02 고정 조항 설명
              <textarea rows={4} value={draft.bylawBody} onChange={(event) => updateDraft('bylawBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>03 섹션</h3>
            <label>
              03 섹션 제목
              <input value={draft.voteTitle} onChange={(event) => updateDraft('voteTitle', event.target.value)} />
            </label>
            <div className="sfc-editor-vote">
              {draft.voteSteps.map((step, index) => (
                <div key={`vote-step-${index}`}>
                  <label>
                    투표 숫자 {index + 1}
                    <input value={step.value} onChange={(event) => updateVoteStep(index, 'value', event.target.value)} />
                  </label>
                  <label>
                    투표 설명 {index + 1}
                    <input value={step.label} onChange={(event) => updateVoteStep(index, 'label', event.target.value)} />
                  </label>
                </div>
              ))}
            </div>
            <label>
              03 설명
              <textarea rows={3} value={draft.voteBody} onChange={(event) => updateDraft('voteBody', event.target.value)} />
            </label>
            <label>
              03 투표 방식 보충 설명
              <textarea rows={4} value={draft.voteDetailBody} onChange={(event) => updateDraft('voteDetailBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>04 섹션</h3>
            <label>
              04 섹션 제목
              <input value={draft.accountingTitle} onChange={(event) => updateDraft('accountingTitle', event.target.value)} />
            </label>
            <label>
              04 내용
              <textarea rows={4} value={draft.accountingBody} onChange={(event) => updateDraft('accountingBody', event.target.value)} />
            </label>
            <label>
              04 목록
              <textarea rows={6} value={draftListText.accountingRules} onChange={(event) => updateDraftList('accountingRules', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>05 섹션</h3>
            <label>
              05 섹션 제목
              <input value={draft.moneyTitle} onChange={(event) => updateDraft('moneyTitle', event.target.value)} />
            </label>
            <label>
              05 금액 선택지
              <textarea rows={3} value={draftListText.moneyOptions} onChange={(event) => updateDraftList('moneyOptions', event.target.value)} />
            </label>
            <label>
              05 설명
              <textarea rows={3} value={draft.moneyBody} onChange={(event) => updateDraft('moneyBody', event.target.value)} />
            </label>
            <label>
              05 예시 목록 제목
              <input value={draft.spendExamplesTitle} onChange={(event) => updateDraft('spendExamplesTitle', event.target.value)} />
            </label>
            <label>
              05 사용처 예시 목록
              <textarea rows={6} value={draftListText.spendTargets} onChange={(event) => updateDraftList('spendTargets', event.target.value)} />
            </label>
            <label>
              05 사용처 결정 방식 설명
              <textarea rows={5} value={draft.spendDecisionBody} onChange={(event) => updateDraft('spendDecisionBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>06 섹션</h3>
            <label>
              06 섹션 제목
              <input value={draft.rulesTitle} onChange={(event) => updateDraft('rulesTitle', event.target.value)} />
            </label>
            <label>
              06 목록
              <textarea rows={5} value={draftListText.simpleRules} onChange={(event) => updateDraftList('simpleRules', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>07 섹션</h3>
            <label>
              07 섹션 제목
              <input value={draft.startTitle} onChange={(event) => updateDraft('startTitle', event.target.value)} />
            </label>
            <label>
              07 목록
              <textarea rows={4} value={draftListText.firstSteps} onChange={(event) => updateDraftList('firstSteps', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>08 섹션</h3>
            <label>
              08 섹션 제목
              <input value={draft.joinTitle} onChange={(event) => updateDraft('joinTitle', event.target.value)} />
            </label>
            <label>
              08 내용 1
              <textarea rows={3} value={draft.joinBody1} onChange={(event) => updateDraft('joinBody1', event.target.value)} />
            </label>
            <label>
              08 내용 2
              <textarea rows={3} value={draft.joinBody2} onChange={(event) => updateDraft('joinBody2', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <h3>하단 확인사항</h3>
            <label>
              하단 제목
              <input value={draft.smallPrintTitle} onChange={(event) => updateDraft('smallPrintTitle', event.target.value)} />
            </label>
            <label>
              하단 내용
              <textarea rows={3} value={draft.smallPrintBody} onChange={(event) => updateDraft('smallPrintBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-actions">
            <button type="button" onClick={handleCancelEdit} disabled={isSaving}>
              취소
            </button>
            <button type="button" className="sfc-primary-button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </section>
      )}

      <section className="sfc-section sfc-plain" aria-labelledby="sfc-why">
        <span className="sfc-section-number">01</span>
        <h2 id="sfc-why">{content.whyTitle}</h2>
        <p>{content.whyBody}</p>
      </section>

      <section className="sfc-section sfc-emphasis" aria-labelledby="sfc-bylaw">
        <span className="sfc-section-number">02</span>
        <h2 id="sfc-bylaw">{content.bylawTitle}</h2>
        <ol className="sfc-bylaw-list">
          {content.bylawRules.map((item, index) => (
            <li key={`${index}-${item}`}>
              <b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>
              <span>{item}</span>
            </li>
          ))}
        </ol>
        <p className="sfc-bylaw-explain">{content.bylawBody}</p>
      </section>

      <section className="sfc-section sfc-vote" aria-labelledby="sfc-vote">
        <span className="sfc-section-number">03</span>
        <h2 id="sfc-vote">{content.voteTitle}</h2>
        <div className="sfc-steps" aria-label="투표 순서">
          {content.voteSteps.map((step, index) => (
            <div className="sfc-step-wrap" key={`${step.value}-${step.label}`}>
              <div>
                <b>{step.value}</b>
                <span>{step.label}</span>
              </div>
              {index < content.voteSteps.length - 1 && (
                <i className="ri-arrow-right-line" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
        <p>{content.voteBody}</p>
        {content.voteDetailBody && (
          <p className="sfc-sub-copy">{content.voteDetailBody}</p>
        )}
      </section>

      <section className="sfc-section" aria-labelledby="sfc-accounting">
        <span className="sfc-section-number">04</span>
        <h2 id="sfc-accounting">{content.accountingTitle}</h2>
        <p>{content.accountingBody}</p>
        <ul className="sfc-check-list sfc-check-list-positive">
          {content.accountingRules.map((item) => (
            <li key={item}>
              <i className="ri-checkbox-circle-line" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sfc-section" aria-labelledby="sfc-money">
        <span className="sfc-section-number">05</span>
        <h2 id="sfc-money">{content.moneyTitle}</h2>
        <div className="sfc-money-row" aria-label="월 후원금">
          {content.moneyOptions.map((item) => (
            <strong key={item}>{item}</strong>
          ))}
        </div>
        <p>{content.moneyBody}</p>
        {content.spendExamplesTitle && (
          <h3 className="sfc-inline-title">{content.spendExamplesTitle}</h3>
        )}
        <ul className="sfc-dot-list">
          {content.spendTargets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {content.spendDecisionBody && (
          <p className="sfc-sub-copy">{content.spendDecisionBody}</p>
        )}
      </section>

      <section className="sfc-section" aria-labelledby="sfc-rules">
        <span className="sfc-section-number">06</span>
        <h2 id="sfc-rules">{content.rulesTitle}</h2>
        <ul className="sfc-check-list sfc-check-list-positive">
          {content.simpleRules.map((item) => (
            <li key={item}>
              <i className="ri-checkbox-circle-line" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sfc-section sfc-roadmap" aria-labelledby="sfc-start">
        <span className="sfc-section-number">07</span>
        <h2 id="sfc-start">{content.startTitle}</h2>
        <ol className="sfc-number-list">
          {content.firstSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section id="join" className="sfc-section sfc-join" aria-labelledby="sfc-join">
        <span className="sfc-section-number">08</span>
        <h2 id="sfc-join">{content.joinTitle}</h2>
        <p>{content.joinBody1}</p>
        <p>{content.joinBody2}</p>
      </section>

      <section className="sfc-small-print" aria-label="확인사항">
        <h2>{content.smallPrintTitle}</h2>
        <p>{content.smallPrintBody}</p>
      </section>
    </main>
  );
}
