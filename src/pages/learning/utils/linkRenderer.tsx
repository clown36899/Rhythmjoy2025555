import React from 'react';

interface ResourceLinkProps {
    keyword: string;
    onClick: () => void;
}

/**
 * #키워드 형식의 자료 링크를 렌더링하는 컴포넌트
 */
export const ResourceLink: React.FC<ResourceLinkProps> = ({ keyword, onClick }) => {
    return (
        <span
            className="resource-link"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            style={{
                color: '#3b82f6',
                cursor: 'pointer',
                fontWeight: 500,
                textDecoration: 'none',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            }}
        >
            #{keyword}
        </span>
    );
};

/**
 * 위키백과 URL 생성 유틸리티
 */
const getWikipediaUrl = (keyword: string) => {
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(keyword)}`;
};

interface WikipediaLinkProps {
    keyword: string;
}

/**
 * [[키워드]] 형식의 위키백과 링크를 렌더링하는 컴포넌트
 */
export const WikipediaLink: React.FC<WikipediaLinkProps> = ({ keyword }) => {
    const url = getWikipediaUrl(keyword);
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="wiki-link"
            onClick={(e) => e.stopPropagation()}
            style={{
                color: '#8b5cf6', // Violet color for Wikipedia
                fontWeight: 600,
                textDecoration: 'none',
                padding: '2px 4px',
                borderRadius: '4px',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                transition: 'all 0.2s',
                borderBottom: '1px dashed rgba(139, 92, 246, 0.4)'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.2)';
                e.currentTarget.style.borderBottom = '1px solid rgba(139, 92, 246, 0.8)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
                e.currentTarget.style.borderBottom = '1px dashed rgba(139, 92, 246, 0.4)';
            }}
            title={`${keyword} - 위키백과에서 보기`}
        >
            {keyword}
        </a>
    );
};

/**
 * 텍스트 내의 URL, #키워드, [[위키키워드]]를 감지하여 클릭 가능한 링크로 변환합니다.
 */
export const renderTextWithLinksAndResources = (
    text: string,
    onResourceClick: (keyword: string) => void
) => {
    if (!text) return text;

    // URL 정규식: http/https와 www로 시작하는 URL 감지
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    // #키워드 정규식: #으로 시작하고 공백이 아닌 문자가 1개 이상
    const resourceRegex = /#([^\s#]+)/g;

    // 전체 패턴을 하나의 정규식으로 결합 (순서 중요! 위키가 먼저 매칭되도록 할 수도 있지만, 구조가 달라서 괜찮음)
    const combinedRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|\[\[[^\]]+\]\]|#[^\s#]+)/g;

    const parts = text.split(combinedRegex);

    return parts.map((part, index) => {
        // 1. URL 링크 처리
        if (part.match(urlRegex) && !part.startsWith('[[')) {
            let href = part;
            if (part.startsWith('www.')) {
                href = `https://${part}`;
            }
            return (
                <a
                    key={index}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ld-text-link"
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }

        // 2. 위키 링크 처리 ([[키워드]])
        const wikiMatch = part.match(/^\[\[(.*)\]\]$/);
        if (wikiMatch) {
            const keyword = wikiMatch[1];
            return <WikipediaLink key={index} keyword={keyword} />;
        }

        // 3. #키워드 링크 처리
        if (part.match(resourceRegex)) {
            const keyword = part.substring(1); // # 제거
            return (
                <ResourceLink
                    key={index}
                    keyword={keyword}
                    onClick={() => {
                        console.log('🔗 [ResourceLink] Clicked:', keyword);
                        onResourceClick(keyword);
                    }}
                />
            );
        }

        // 4. 일반 텍스트는 줄바꿈(\n)을 포함하여 렌더링
        // 확실한 줄바꿈을 위해 \n, \r\n, \r을 모두 <br/>로 변환
        return (
            <span key={index} style={{ whiteSpace: 'pre-wrap' }}>
                {part.split(/(\r\n|\n|\r)/g).map((line, i) => (
                    <React.Fragment key={i}>
                        {line.match(/(\r\n|\n|\r)/) ? <br /> : line}
                    </React.Fragment>
                ))}
            </span>
        );
    });
};
