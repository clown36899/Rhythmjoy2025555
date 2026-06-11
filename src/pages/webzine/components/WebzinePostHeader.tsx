import './WebzinePostHeader.css';

interface WebzinePostHeaderProps {
    title: string;
    subtitle?: string | null;
    createdAt: string;
    views: number;
    isPublished: boolean;
    className?: string;
}

const WebzinePostHeader = ({ title, subtitle, createdAt, views, isPublished, className }: WebzinePostHeaderProps) => {
    const createdDate = new Date(createdAt);
    const displayDate = Number.isNaN(createdDate.getTime())
        ? ''
        : createdDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const displayViews = Number.isFinite(Number(views)) ? Number(views).toLocaleString() : '0';

    return (
        <div className={`wzh-header${className ? ` ${className}` : ''}`}>
            <h1 className="wzh-title">{title}</h1>
            {subtitle && <p className="wzh-subtitle">{subtitle}</p>}
            <div className="wzh-meta">
                {displayDate && <time dateTime={createdAt}>{displayDate}</time>}
                {displayDate && <span className="wzh-dot">•</span>}
                <span>조회 {displayViews}회</span>
                {!isPublished && <span className="wzh-draft">임시저장</span>}
            </div>
        </div>
    );
};

export default WebzinePostHeader;
