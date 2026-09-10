import { useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSetPageAction } from '../../../contexts/PageActionContext';
import { getDanceScopeLabel } from '../../../utils/danceTaxonomy';
import { danceSceneGuides, type DanceSceneGuideContent } from '../data/danceSceneGuides';
import { getCalendarGenreSearch, type CalendarGenreScope } from '../utils/calendarGenrePage';
import CalendarDanceScopeSwitch from './CalendarDanceScopeSwitch';
import '../styles/DanceSceneGuide.css';

type Source = DanceSceneGuideContent['places'][number];

function SourceCard({ source }: { source: Source }) {
    return (
        <article className="dance-guide-card">
            <div className="dance-guide-card-meta"><span>{source.area}</span><span>{source.kind}</span></div>
            <h3>{source.name}</h3>
            <p>{source.description}</p>
            {source.note && <small>{source.note}</small>}
            <a href={source.url} target="_blank" rel="noopener noreferrer" draggable={false}
                aria-label={`${source.name} — ${source.linkLabel || '공지 채널 보기'} (새 창)`}>
                {source.linkLabel || '공지 채널 보기'}<span aria-hidden="true">↗</span>
            </a>
        </article>
    );
}

export default function DanceSceneGuide({ scope }: { scope: CalendarGenreScope }) {
    const navigate = useNavigate();
    const location = useLocation();
    // index.html uses <base href="/"> for SPA assets. Hash-only anchors would
    // otherwise leave this genre and navigate to the home page.
    const guidePageUrl = `${location.pathname}${location.search}`;
    const [area, setArea] = useState('전체');
    const content = danceSceneGuides[scope];
    const label = getDanceScopeLabel(scope);
    const areas = ['전체', ...new Set(content?.places.map(place => place.area) || [])];
    const places = content?.places.filter(place => area === '전체' || place.area === area) || [];
    useSetPageAction(null);
    useLayoutEffect(() => {
        setArea('전체');
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [scope]);

    const selectGenre = (nextScope: CalendarGenreScope) => {
        navigate({ pathname: '/calendar', search: getCalendarGenreSearch(location.search, nextScope) });
    };

    return (
        <main className="dance-scene-guide" onDragStart={event => event.preventDefault()}>
            <CalendarDanceScopeSwitch activeScope={scope} onSelect={selectGenre} />
            <div className="dance-guide-body">
                <header className="dance-guide-hero">
                    <div>
                        <span className="dance-guide-eyebrow">DANCE SCENE <span>/ {label} 가이드</span></span>
                        <h1>{content?.title || `${label} 씬을 준비하고 있어요`}</h1>
                        <p>{content?.introduction || '함께 춤출 공간과 배울 모임을 확인한 뒤 이곳에 안내하겠습니다.'}</p>
                    </div>
                    <div className="dance-guide-hero-note">
                        <i className="ri-compass-3-line" aria-hidden="true" />
                        <strong>공간과 모임을 먼저 만나보세요</strong>
                        <p>연결된 공지에서 모집과 운영 일정을 확인할 수 있어요.</p>
                        {content && <small>자료 확인 {content.reviewedAt}</small>}
                    </div>
                </header>

                {content ? <>
                    <nav className="dance-guide-sections" aria-label={`${label} 안내 목차`}>
                        {content.places.length > 0 && <a href={`${guidePageUrl}#scene-places`} draggable={false}>춤추는 공간 <span>{content.places.length}</span></a>}
                        {content.learning.length > 0 && <a href={`${guidePageUrl}#scene-learning`} draggable={false}>강습·동호회 <span>{content.learning.length}</span></a>}
                        {content.overview.length > 0 && <a href={`${guidePageUrl}#scene-overview`} draggable={false}>씬 알아보기</a>}
                        {content.discover.length > 0 && <a href={`${guidePageUrl}#scene-discover`} draggable={false}>더 둘러보기</a>}
                        {scope === 'swing' && <button type="button" onClick={() => selectGenre('swing')}>스윙 캘린더 →</button>}
                    </nav>

                    {content.places.length > 0 && <section id="scene-places" className="dance-guide-section">
                        <div className="dance-guide-section-heading">
                            <div><span className="dance-guide-kicker">SOCIAL SPACES</span><h2>오늘은 어디서 춤출까요?</h2><p>소셜 공간과 공지 채널을 모았어요.</p></div>
                            {areas.length > 2 && <div className="dance-guide-area-filter" role="group" aria-label="소셜 공간 지역">
                                {areas.map(value => <button key={value} type="button" aria-pressed={area === value}
                                    className={area === value ? 'active' : ''} onClick={() => setArea(value)}>{value}</button>)}
                            </div>}
                        </div>
                        <div className="dance-guide-card-grid">{places.map(source => <SourceCard key={source.url} source={source} />)}</div>
                    </section>}

                    {content.learning.length > 0 && <section id="scene-learning" className="dance-guide-section">
                        <div className="dance-guide-section-heading"><div><span className="dance-guide-kicker">LEARN & CONNECT</span><h2>함께 배우고, 함께 춤추고</h2><p>입문 강습부터 꾸준히 만날 동호회까지.</p></div></div>
                        <div className="dance-guide-card-grid">{content.learning.map(source => <SourceCard key={source.url} source={source} />)}</div>
                    </section>}

                    {content.overview.length > 0 && <section id="scene-overview" className="dance-guide-section dance-guide-overview">
                        <div className="dance-guide-section-heading"><div><span className="dance-guide-kicker">GET TO KNOW THE SCENE</span><h2>{label} 씬, 이렇게 연결돼요</h2><p>바, 동호회, 학원이 함께 만드는 댄스 커뮤니티.</p></div></div>
                        <div className="dance-guide-overview-grid">{content.overview.map((item, index) => <article key={item.title}>
                            <span className="dance-guide-number">0{index + 1}</span><h3>{item.title}</h3><p>{item.description}</p>
                        </article>)}</div>
                    </section>}

                    {content.discover.length > 0 && <section id="scene-discover" className="dance-guide-section">
                        <div className="dance-guide-section-heading"><div><span className="dance-guide-kicker">BEYOND YOUR NEIGHBORHOOD</span><h2>더 넓은 씬으로</h2><p>다른 지역의 모임과 페스티벌도 만나보세요.</p></div></div>
                        <div className="dance-guide-card-grid dance-guide-discover-grid">{content.discover.map(source => <SourceCard key={source.url} source={source} />)}</div>
                    </section>}
                    <footer className="dance-guide-footer"><i className="ri-information-line" aria-hidden="true" /><p>이곳은 장소와 모임의 안내입니다. 방문·신청 전에는 각 공지의 날짜와 운영 여부를 확인해 주세요.</p></footer>
                </> : <div className="dance-guide-empty">
                    <i className="ri-map-pin-line" aria-hidden="true" /><h2>확인한 정보를 차근차근 모을게요</h2>
                    <p>아직 안내할 장소와 모임이 없습니다.<br />먼저 준비된 살사 가이드나 스윙 일정을 둘러보세요.</p>
                    <div><button type="button" onClick={() => selectGenre('salsa')}>살사 가이드</button><button type="button" onClick={() => selectGenre('swing')}>스윙 캘린더</button></div>
                </div>}
            </div>
        </main>
    );
}
