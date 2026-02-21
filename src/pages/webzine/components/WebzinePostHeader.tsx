import './WebzinePostHeader.css';

interface WebzinePostHeaderProps {
    title: string;
    subtitle?: string | null;
    createdAt: string;
    views: number;
    isPublished: boolean;
    className?: string;
}

const WebzinePostHeader = ({ title, subtitle, createdAt, views, isPublished, className }: WebzinePostHeaderProps) => (
    <div className={`wzh-header${className ? ` ${className}` : ''}`}>
        <h1 className="wzh-title">{title}</h1>
        {subtitle && <p className="wzh-subtitle">{subtitle}</p>}
        <div className="wzh-meta">
            <time dateTime={createdAt}>
                {new Date(createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
            <span className="wzh-dot">•</span>
            <span>조회 {views.toLocaleString()}회</span>
            {!isPublished && <span className="wzh-draft">임시저장</span>}
        </div>
    </div>
);

export default WebzinePostHeader;
