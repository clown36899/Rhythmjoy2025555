
/**
 * 텍스트 내의 URL을 감지하여 클릭 가능한 링크(<a> 태그)로 변환합니다.
 */

export const renderTextWithLinks = (text: string) => {
    if (!text) return text;

    // URL 정규식: http/https와 www로 시작하는 URL 모두 감지
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

    const parts = text.split(urlRegex);

    return parts.map((part, index) => {
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
        return part;
    });
};
