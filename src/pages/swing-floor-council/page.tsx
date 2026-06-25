import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { cafe24 } from '../../lib/cafe24Client';

import './swing-floor-council.css';

const CONTENT_SETTING_KEY = 'swing_floor_council_page_content';

interface VoteStep {
  value: string;
  label: string;
}

interface CouncilContent {
  kicker: string;
  title: string;
  lead: string;
  leadStrong: string;
  whyTitle: string;
  whyBody: string;
  notTitle: string;
  noTouchRules: string[];
  notNote: string;
  moneyTitle: string;
  moneyOptions: string[];
  moneyBody: string;
  spendTargets: string[];
  voteTitle: string;
  voteSteps: VoteStep[];
  voteBody: string;
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

const DEFAULT_CONTENT: CouncilContent = {
  kicker: '발기인 모집 초안',
  title: '스윙을 오래 추려면, 같이 쓸 플로어가 필요합니다.',
  lead: '한국 스윙씬은 점점 작아지고 있습니다. 새로 들어오는 사람은 줄고, 함께 모일 수 있는 스윙바와 플로어도 늘 불안합니다.',
  leadStrong: '그래서 누군가를 대표하는 단체가 아니라, 필요한 일을 같이 정하고 같이 돕는 협의체를 만들려고 합니다.',
  whyTitle: '왜 모이나요?',
  whyBody: '혼자서는 공간을 지키기 어렵고, 한 팀만으로는 신규 유입을 만들기 어렵습니다. 하지만 여러 사람이 조금씩 모으면 대관비, 홍보비, 체험 행사, 운영 인력 지원을 시작할 수 있습니다.',
  notTitle: '이 협의체가 하지 않는 일',
  noTouchRules: [
    '자격증을 만들거나 관리하지 않는다.',
    '대회 심사와 심사위원 선정에 관여하지 않는다.',
    '강사, 바, 동호회, 지역의 위아래를 정하지 않는다.',
    '누가 정통인지 판정하지 않는다.',
  ],
  notNote: '이 원칙은 처음부터 고정합니다. 협의체가 권위기관처럼 보이면 오래 갈 수 없습니다.',
  moneyTitle: '돈은 이렇게 모으고 씁니다',
  moneyOptions: ['월 3만 원', '월 5만 원', '월 10만 원'],
  moneyBody: '금액은 각자 가능한 만큼 선택합니다. 많이 낸 사람이 더 큰 권한을 갖지는 않습니다. 모든 회원은 똑같이 1표입니다.',
  spendTargets: [
    '스윙바와 플로어 대관비 지원',
    '처음 오는 사람을 위한 무료 체험 행사',
    '지역 교류 소셜과 합동 파티',
    '강사, DJ, 운영자 워크숍',
    '홍보 콘텐츠 제작',
    '없어질 위기의 공간 긴급 지원',
  ],
  voteTitle: '무엇을 할지는 투표로 정합니다',
  voteSteps: [
    { value: '100개', label: '아이디어를 받습니다' },
    { value: '30개', label: '1차 투표로 줄입니다' },
    { value: '1개', label: '2차 투표로 실행합니다' },
  ],
  voteBody: '선정된 일은 예산, 담당자, 기간을 공개하고 진행합니다. 말로만 끝나는 회의가 아니라 실제 플로어와 신규 유입에 도움이 되는 일부터 합니다.',
  rulesTitle: '운영은 단순하게 합니다',
  simpleRules: [
    '회장은 두지 않는다.',
    '운영팀은 권력자가 아니라 실무자다.',
    '돈을 관리하는 사람과 돈을 쓰자고 제안하는 사람을 나눈다.',
    '큰 지출은 혼자 결정하지 못하게 한다.',
    '후원금을 더 많이 내도 표는 1표다.',
  ],
  startTitle: '처음 3개월은 이렇게 시작합니다',
  firstSteps: [
    '발기인 30명을 먼저 모은다.',
    '월 3만 원, 5만 원, 10만 원 중 자율 후원으로 시작한다.',
    '첫 돈은 신규 유입과 플로어 유지에만 쓴다.',
    '모든 지출은 공개 장부에 남긴다.',
  ],
  joinTitle: '발기인은 이런 사람을 찾습니다',
  joinBody1: '스윙댄스를 계속 추고 싶은 사람, 새로 오는 사람을 반기고 싶은 사람, 플로어와 공간을 같이 지키고 싶은 사람이면 됩니다.',
  joinBody2: '특정 팀을 대표하지 않아도 됩니다. 강사가 아니어도 됩니다. 오래 춘 사람이 아니어도 됩니다. “같이 해보자”는 마음이 있으면 충분합니다.',
  smallPrintTitle: '작은 확인사항',
  smallPrintBody: '지금 단계는 정식 법인 문서가 아니라 발기인 모집용 초안입니다. 사람이 모이고 실제 운영이 시작되면, 협동조합이나 비영리단체 전환은 따로 검토합니다.',
};

const listFromValue = (value: unknown, fallback: string[]) => {
  if (!Array.isArray(value)) return fallback;
  const list = value.map((item) => String(item || '').trim()).filter(Boolean);
  return list.length ? list : fallback;
};

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

  return {
    ...DEFAULT_CONTENT,
    ...source,
    noTouchRules: listFromValue(source.noTouchRules, DEFAULT_CONTENT.noTouchRules),
    moneyOptions: listFromValue(source.moneyOptions, DEFAULT_CONTENT.moneyOptions),
    spendTargets: listFromValue(source.spendTargets, DEFAULT_CONTENT.spendTargets),
    voteSteps: voteStepsFromValue(source.voteSteps),
    simpleRules: listFromValue(source.simpleRules, DEFAULT_CONTENT.simpleRules),
    firstSteps: listFromValue(source.firstSteps, DEFAULT_CONTENT.firstSteps),
  };
};

const listToText = (items: string[]) => items.join('\n');

const textToList = (value: string) => (
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
);

export default function SwingFloorCouncilPage() {
  const { isAdmin, isAuthCheckComplete } = useAuth();
  const [copyLabel, setCopyLabel] = useState('링크 복사');
  const [content, setContent] = useState<CouncilContent>(DEFAULT_CONTENT);
  const [draft, setDraft] = useState<CouncilContent>(DEFAULT_CONTENT);
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

  const updateDraftList = (key: keyof Pick<CouncilContent, 'noTouchRules' | 'moneyOptions' | 'spendTargets' | 'simpleRules' | 'firstSteps'>, value: string) => {
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
    setStatusMessage('');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(content);
    setIsEditing(false);
    setStatusMessage('');
  };

  const handleResetDraft = () => {
    if (!window.confirm('현재 편집 중인 내용을 기본 초안으로 되돌릴까요? 저장 전까지 공개 페이지에는 반영되지 않습니다.')) return;
    setDraft(DEFAULT_CONTENT);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      setStatusMessage('관리자만 저장할 수 있습니다.');
      return;
    }

    setIsSaving(true);
    setStatusMessage('');
    try {
      const normalized = mergeContent(draft);
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
        <section className="sfc-editor" aria-label="문안 편집">
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
            첫 제목
            <textarea rows={2} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
          </label>
          <label>
            첫 설명
            <textarea rows={3} value={draft.lead} onChange={(event) => updateDraft('lead', event.target.value)} />
          </label>
          <label>
            강조 문장
            <textarea rows={3} value={draft.leadStrong} onChange={(event) => updateDraft('leadStrong', event.target.value)} />
          </label>

          <div className="sfc-editor-grid">
            <label>
              01 제목
              <input value={draft.whyTitle} onChange={(event) => updateDraft('whyTitle', event.target.value)} />
            </label>
            <label>
              01 내용
              <textarea rows={4} value={draft.whyBody} onChange={(event) => updateDraft('whyBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <label>
              02 제목
              <input value={draft.notTitle} onChange={(event) => updateDraft('notTitle', event.target.value)} />
            </label>
            <label>
              02 목록
              <textarea rows={5} value={listToText(draft.noTouchRules)} onChange={(event) => updateDraftList('noTouchRules', event.target.value)} />
            </label>
            <label>
              02 아래 문장
              <textarea rows={3} value={draft.notNote} onChange={(event) => updateDraft('notNote', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <label>
              03 제목
              <input value={draft.moneyTitle} onChange={(event) => updateDraft('moneyTitle', event.target.value)} />
            </label>
            <label>
              03 금액 선택지
              <textarea rows={3} value={listToText(draft.moneyOptions)} onChange={(event) => updateDraftList('moneyOptions', event.target.value)} />
            </label>
            <label>
              03 설명
              <textarea rows={3} value={draft.moneyBody} onChange={(event) => updateDraft('moneyBody', event.target.value)} />
            </label>
            <label>
              03 사용처 목록
              <textarea rows={6} value={listToText(draft.spendTargets)} onChange={(event) => updateDraftList('spendTargets', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <label>
              04 제목
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
              04 설명
              <textarea rows={3} value={draft.voteBody} onChange={(event) => updateDraft('voteBody', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <label>
              05 제목
              <input value={draft.rulesTitle} onChange={(event) => updateDraft('rulesTitle', event.target.value)} />
            </label>
            <label>
              05 목록
              <textarea rows={5} value={listToText(draft.simpleRules)} onChange={(event) => updateDraftList('simpleRules', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <label>
              06 제목
              <input value={draft.startTitle} onChange={(event) => updateDraft('startTitle', event.target.value)} />
            </label>
            <label>
              06 목록
              <textarea rows={4} value={listToText(draft.firstSteps)} onChange={(event) => updateDraftList('firstSteps', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
            <label>
              07 제목
              <input value={draft.joinTitle} onChange={(event) => updateDraft('joinTitle', event.target.value)} />
            </label>
            <label>
              07 내용 1
              <textarea rows={3} value={draft.joinBody1} onChange={(event) => updateDraft('joinBody1', event.target.value)} />
            </label>
            <label>
              07 내용 2
              <textarea rows={3} value={draft.joinBody2} onChange={(event) => updateDraft('joinBody2', event.target.value)} />
            </label>
          </div>

          <div className="sfc-editor-grid">
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

      <section className="sfc-section sfc-emphasis" aria-labelledby="sfc-not">
        <span className="sfc-section-number">02</span>
        <h2 id="sfc-not">{content.notTitle}</h2>
        <ul className="sfc-check-list">
          {content.noTouchRules.map((item) => (
            <li key={item}>
              <i className="ri-close-circle-line" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="sfc-note">{content.notNote}</p>
      </section>

      <section className="sfc-section" aria-labelledby="sfc-money">
        <span className="sfc-section-number">03</span>
        <h2 id="sfc-money">{content.moneyTitle}</h2>
        <div className="sfc-money-row" aria-label="월 후원금">
          {content.moneyOptions.map((item) => (
            <strong key={item}>{item}</strong>
          ))}
        </div>
        <p>{content.moneyBody}</p>
        <ul className="sfc-dot-list">
          {content.spendTargets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="sfc-section sfc-vote" aria-labelledby="sfc-vote">
        <span className="sfc-section-number">04</span>
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
      </section>

      <section className="sfc-section" aria-labelledby="sfc-rules">
        <span className="sfc-section-number">05</span>
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
        <span className="sfc-section-number">06</span>
        <h2 id="sfc-start">{content.startTitle}</h2>
        <ol className="sfc-number-list">
          {content.firstSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section id="join" className="sfc-section sfc-join" aria-labelledby="sfc-join">
        <span className="sfc-section-number">07</span>
        <h2 id="sfc-join">{content.joinTitle}</h2>
        <p>{content.joinBody1}</p>
        <p>{content.joinBody2}</p>
        <button type="button" className="sfc-primary-button sfc-bottom-button" onClick={handleCopyLink}>
          <i className="ri-share-line" aria-hidden="true" />
          주변에 공유하기
        </button>
      </section>

      <section className="sfc-small-print" aria-label="확인사항">
        <h2>{content.smallPrintTitle}</h2>
        <p>{content.smallPrintBody}</p>
      </section>
    </main>
  );
}
