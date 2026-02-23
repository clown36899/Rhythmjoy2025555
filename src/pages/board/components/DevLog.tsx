import { useState } from 'react';
import { changelogData } from '../../../data/changelog';
import './DevLog.css';

export default function DevLog() {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // 페이지네이션 계산
    const totalPages = Math.ceil(changelogData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentVersions = changelogData.slice(startIndex, endIndex);

    return (
        <div className="dev-log-container">
            {/* 버전 카드 목록 */}
            <div className="dev-log-list">
                {currentVersions.map((version) => (
                    <div key={version.version} className="dev-log-card">
                        <div className="dev-log-card-header">
                            <span className="version-badge">v{version.version}</span>
                            <span className="version-date">{version.date}</span>
                        </div>
                        <ul className="changes-list">
                            {version.changes.map((change, idx) => (
                                <li key={idx}>{change}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
                <div className="dev-log-pagination">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="pagination-btn"
                    >
                        <i className="ri-arrow-left-s-line"></i>
                    </button>

                    <span className="pagination-info">
                        {currentPage} / {totalPages}
                    </span>

                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="pagination-btn"
                    >
                        <i className="ri-arrow-right-s-line"></i>
                    </button>
                </div>
            )}
        </div>
    );
}

