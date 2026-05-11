import { Link } from 'react-router-dom';
import './AdminUiSamplesPage.css';

interface SampleCard {
  title: string;
  eyebrow: string;
  description: string;
  path: string;
  tone: 'blue' | 'green' | 'amber';
  points: string[];
}

const samples: SampleCard[] = [
  {
    title: '자유게시판 개선 샘플',
    eyebrow: 'Board',
    description: '리스트, 선택 상태, 상세 화면까지 운영 게시판과 분리해서 확인합니다.',
    path: '/admin/ui/free-board-guide',
    tone: 'blue',
    points: ['데스크탑/모바일 분리 리스트', '말머리 색상 체계', '상세/댓글 표면'],
  },
  {
    title: '캘린더 개선 샘플',
    eyebrow: 'Calendar',
    description: '월간표, 오늘 일정, 지도 모드 기본 선택 상태를 한 화면에서 비교합니다.',
    path: '/admin/ui/calendar-guide',
    tone: 'amber',
    points: ['월간표 + 당일 상세', '모바일 날짜 스트립', '지도/리스트 분리'],
  },
  {
    title: 'V2 메인 광고 샘플',
    eyebrow: 'Home V2',
    description: '신규 이벤트 광고 영역과 수집 품질 지표를 운영 홈과 분리해서 검토합니다.',
    path: '/admin/ui/v2-main-ad-guide',
    tone: 'green',
    points: ['대표 광고 영역', '신규 등록 큐', '수집 품질 지표'],
  },
];

function SamplePreview({ tone }: { tone: SampleCard['tone'] }) {
  return (
    <div className={`uis-preview uis-preview--${tone}`} aria-hidden="true">
      <span />
      <strong />
      <em />
      <i />
    </div>
  );
}

export default function AdminUiSamplesPage() {
  return (
    <main className="admin-ui-samples-page">
      <section className="uis-hero">
        <div>
          <span className="uis-kicker">UI sample pages</span>
          <h1>운영 반영 전 샘플 UI</h1>
          <p>실제 사이트 화면을 바꾸지 않고, 개선안의 레이아웃과 상태만 독립 페이지에서 확인하는 공간입니다.</p>
        </div>
      </section>

      <section className="uis-grid" aria-label="sample pages">
        {samples.map((sample) => (
          <article key={sample.path} className={`uis-card uis-card--${sample.tone}`}>
            <SamplePreview tone={sample.tone} />
            <div className="uis-card-body">
              <span className="uis-card-eyebrow">{sample.eyebrow}</span>
              <h2>{sample.title}</h2>
              <p>{sample.description}</p>
              <ul>
                {sample.points.map((point) => (
                  <li key={point}>
                    <i className="ri-check-line" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <Link to={sample.path} className="uis-open-link">
              샘플 열기
              <i className="ri-arrow-right-line" />
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
