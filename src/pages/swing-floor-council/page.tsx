import { useEffect, useState } from 'react';

import './swing-floor-council.css';

const firstSteps = [
  '발기인 30명을 먼저 모은다.',
  '월 3만 원, 5만 원, 10만 원 중 자율 후원으로 시작한다.',
  '첫 돈은 신규 유입과 플로어 유지에만 쓴다.',
  '모든 지출은 공개 장부에 남긴다.',
];

const noTouchRules = [
  '자격증을 만들거나 관리하지 않는다.',
  '대회 심사와 심사위원 선정에 관여하지 않는다.',
  '강사, 바, 동호회, 지역의 위아래를 정하지 않는다.',
  '누가 정통인지 판정하지 않는다.',
];

const spendTargets = [
  '스윙바와 플로어 대관비 지원',
  '처음 오는 사람을 위한 무료 체험 행사',
  '지역 교류 소셜과 합동 파티',
  '강사, DJ, 운영자 워크숍',
  '홍보 콘텐츠 제작',
  '없어질 위기의 공간 긴급 지원',
];

const simpleRules = [
  '회장은 두지 않는다.',
  '운영팀은 권력자가 아니라 실무자다.',
  '돈을 관리하는 사람과 돈을 쓰자고 제안하는 사람을 나눈다.',
  '큰 지출은 혼자 결정하지 못하게 한다.',
  '후원금을 더 많이 내도 표는 1표다.',
];

export default function SwingFloorCouncilPage() {
  const [copyLabel, setCopyLabel] = useState('링크 복사');

  useEffect(() => {
    document.title = '스윙 플로어 협의체 발기인 모집 | 댄스빌보드';
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

  return (
    <main className="sfc-page">
      <section className="sfc-hero" aria-labelledby="sfc-title">
        <p className="sfc-kicker">발기인 모집 초안</p>
        <h1 id="sfc-title">스윙을 오래 추려면, 같이 쓸 플로어가 필요합니다.</h1>
        <p className="sfc-lead">
          한국 스윙씬은 점점 작아지고 있습니다. 새로 들어오는 사람은 줄고,
          함께 모일 수 있는 스윙바와 플로어도 늘 불안합니다.
        </p>
        <p className="sfc-lead sfc-lead-strong">
          그래서 누군가를 대표하는 단체가 아니라, 필요한 일을 같이 정하고 같이 돕는 협의체를 만들려고 합니다.
        </p>

        <div className="sfc-actions" aria-label="공유">
          <button type="button" className="sfc-primary-button" onClick={handleCopyLink}>
            <i className="ri-link" aria-hidden="true" />
            {copyLabel}
          </button>
          <a className="sfc-secondary-button" href="#join" draggable={false}>
            <i className="ri-arrow-down-line" aria-hidden="true" />
            발기인 조건 보기
          </a>
        </div>
      </section>

      <section className="sfc-section sfc-plain" aria-labelledby="sfc-why">
        <span className="sfc-section-number">01</span>
        <h2 id="sfc-why">왜 모이나요?</h2>
        <p>
          혼자서는 공간을 지키기 어렵고, 한 팀만으로는 신규 유입을 만들기 어렵습니다.
          하지만 여러 사람이 조금씩 모으면 대관비, 홍보비, 체험 행사, 운영 인력 지원을 시작할 수 있습니다.
        </p>
      </section>

      <section className="sfc-section sfc-emphasis" aria-labelledby="sfc-not">
        <span className="sfc-section-number">02</span>
        <h2 id="sfc-not">이 협의체가 하지 않는 일</h2>
        <ul className="sfc-check-list">
          {noTouchRules.map((item) => (
            <li key={item}>
              <i className="ri-close-circle-line" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="sfc-note">
          이 원칙은 처음부터 고정합니다. 협의체가 권위기관처럼 보이면 오래 갈 수 없습니다.
        </p>
      </section>

      <section className="sfc-section" aria-labelledby="sfc-money">
        <span className="sfc-section-number">03</span>
        <h2 id="sfc-money">돈은 이렇게 모으고 씁니다</h2>
        <div className="sfc-money-row" aria-label="월 후원금">
          <strong>월 3만 원</strong>
          <strong>월 5만 원</strong>
          <strong>월 10만 원</strong>
        </div>
        <p>
          금액은 각자 가능한 만큼 선택합니다. 많이 낸 사람이 더 큰 권한을 갖지는 않습니다.
          모든 회원은 똑같이 1표입니다.
        </p>
        <ul className="sfc-dot-list">
          {spendTargets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="sfc-section sfc-vote" aria-labelledby="sfc-vote">
        <span className="sfc-section-number">04</span>
        <h2 id="sfc-vote">무엇을 할지는 투표로 정합니다</h2>
        <div className="sfc-steps" aria-label="투표 순서">
          <div>
            <b>100개</b>
            <span>아이디어를 받습니다</span>
          </div>
          <i className="ri-arrow-right-line" aria-hidden="true" />
          <div>
            <b>30개</b>
            <span>1차 투표로 줄입니다</span>
          </div>
          <i className="ri-arrow-right-line" aria-hidden="true" />
          <div>
            <b>1개</b>
            <span>2차 투표로 실행합니다</span>
          </div>
        </div>
        <p>
          선정된 일은 예산, 담당자, 기간을 공개하고 진행합니다. 말로만 끝나는 회의가 아니라
          실제 플로어와 신규 유입에 도움이 되는 일부터 합니다.
        </p>
      </section>

      <section className="sfc-section" aria-labelledby="sfc-rules">
        <span className="sfc-section-number">05</span>
        <h2 id="sfc-rules">운영은 단순하게 합니다</h2>
        <ul className="sfc-check-list sfc-check-list-positive">
          {simpleRules.map((item) => (
            <li key={item}>
              <i className="ri-checkbox-circle-line" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sfc-section sfc-roadmap" aria-labelledby="sfc-start">
        <span className="sfc-section-number">06</span>
        <h2 id="sfc-start">처음 3개월은 이렇게 시작합니다</h2>
        <ol className="sfc-number-list">
          {firstSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section id="join" className="sfc-section sfc-join" aria-labelledby="sfc-join">
        <span className="sfc-section-number">07</span>
        <h2 id="sfc-join">발기인은 이런 사람을 찾습니다</h2>
        <p>
          스윙댄스를 계속 추고 싶은 사람, 새로 오는 사람을 반기고 싶은 사람,
          플로어와 공간을 같이 지키고 싶은 사람이면 됩니다.
        </p>
        <p>
          특정 팀을 대표하지 않아도 됩니다. 강사가 아니어도 됩니다. 오래 춘 사람이 아니어도 됩니다.
          “같이 해보자”는 마음이 있으면 충분합니다.
        </p>
        <button type="button" className="sfc-primary-button sfc-bottom-button" onClick={handleCopyLink}>
          <i className="ri-share-line" aria-hidden="true" />
          주변에 공유하기
        </button>
      </section>

      <section className="sfc-small-print" aria-label="확인사항">
        <h2>작은 확인사항</h2>
        <p>
          지금 단계는 정식 법인 문서가 아니라 발기인 모집용 초안입니다.
          사람이 모이고 실제 운영이 시작되면, 협동조합이나 비영리단체 전환은 따로 검토합니다.
        </p>
      </section>
    </main>
  );
}
