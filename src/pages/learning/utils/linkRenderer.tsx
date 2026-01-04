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
 * 텍스트 내의 URL과 #키워드를 감지하여 클릭 가능한 링크로 변환합니다.
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

    // 전체 패턴을 하나의 정규식으로 결합
    const combinedRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|#[^\s#]+)/g;

    const parts = text.split(combinedRegex);

    return parts.map((part, index) => {
        // URL 링크 처리
        if (part.match(urlRegex)) {
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

        // #키워드 링크 처리
        if (part.match(resourceRegex)) {
            const keyword = part.substring(1); // # 제거
            return (
                <ResourceLink
                    key={index}
                    keyword={keyword}
                    onClick={() => onResourceClick(keyword)}
                />
            );
        }

        return part;
    });
};
