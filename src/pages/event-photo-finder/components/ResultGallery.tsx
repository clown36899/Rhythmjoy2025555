import React, { useState } from 'react';
import { localDB } from '../utils/localDB';
import './ResultGallery.css';

interface MatchedPhoto {
    id: string;
    filename: string;
    blob: Blob;
    faceVector: number[];
    similarity?: number;
}

interface ResultGalleryProps {
    photos: MatchedPhoto[];
    onRestart: () => void;
}

const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(blob);
    });
}

const PhotoItem = ({ photo, isSelected, onToggle }: { photo: MatchedPhoto, isSelected: boolean, onToggle: () => void }) => {
    const [src, setSrc] = React.useState<string>("");

    React.useEffect(() => {
        let cancelled = false;
        blobToDataURL(photo.blob).then(url => {
            if (!cancelled) setSrc(url);
        });
        return () => { cancelled = true; };
    }, [photo.id]);

    if (!src) return <div className="rg-placeholder" />;

    return (
        <div
            className={`rg-item ${isSelected ? 'is-selected' : ''}`}
            onClick={onToggle}
        >
            <img
                src={src}
                alt={photo.filename}
                className="rg-img"
            />
            {isSelected && (
                <div className="rg-item-select-badge">
                    <svg className="rg-item-select-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            )}
        </div>
    );
};

export const ResultGallery: React.FC<ResultGalleryProps> = ({ photos, onRestart }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(photos.map(p => p.id)));

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleDownload = async () => {
        const targets = photos.filter(p => selectedIds.has(p.id));
        if (targets.length === 0) return;

        for (const photo of targets) {
            const url = await blobToDataURL(photo.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = photo.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        alert(`${targets.length}장의 사진을 다운로드했습니다.`);
    };

    const handleCleanup = async () => {
        if (confirm('모든 사진 데이터를 삭제하고 초기화하시겠습니까?')) {
            await localDB.clear();
            onRestart();
        }
    };

    return (
        <div className="ResultGallery">
            <div className="rg-header">
                <div>
                    <h2 className="rg-title">찾은 사진 ({photos.length})</h2>
                    <p className="rg-subtitle">선택된 사진: {selectedIds.size}장</p>
                </div>
                <button
                    onClick={handleCleanup}
                    className="rg-reset-btn"
                >
                    초기화
                </button>
            </div>

            <div className="rg-list-wrapper">
                {photos.length === 0 ? (
                    <div className="rg-empty">
                        매칭된 사진이 없습니다.
                    </div>
                ) : (
                    <div className="rg-grid">
                        {photos.map((photo) => (
                            <PhotoItem
                                key={photo.id}
                                photo={photo}
                                isSelected={selectedIds.has(photo.id)}
                                onToggle={() => toggleSelection(photo.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="rg-footer">
                <button
                    onClick={handleDownload}
                    className="rg-download-btn"
                    disabled={selectedIds.size === 0}
                >
                    선택한 {selectedIds.size}장 다운로드
                </button>
            </div>
        </div>
    );
};
