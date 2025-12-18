import React, { useState } from 'react';
import { localDB } from '../utils/localDB';

interface MatchedPhoto {
    id: string; // DB key
    filename: string;
    blob: Blob;
    faceVector: number[];
    similarity?: number;
}

interface ResultGalleryProps {
    photos: MatchedPhoto[];
    onRestart: () => void;
}

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

        // Sequential download
        for (const photo of targets) {
            const url = URL.createObjectURL(photo.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = photo.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Small delay to prevent browser throttling
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
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-xl font-bold">찾은 사진 ({photos.length})</h2>
                    <p className="text-xs text-gray-400">선택된 사진: {selectedIds.size}장</p>
                </div>
                <button
                    onClick={handleCleanup}
                    className="text-xs text-red-400 hover:text-red-300 underline"
                >
                    초기화
                </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 bg-gray-900/50 rounded-xl p-2">
                {photos.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-500">
                        매칭된 사진이 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {photos.map((photo) => {
                            const url = URL.createObjectURL(photo.blob); // Ideally should memoize or revoke
                            const isSelected = selectedIds.has(photo.id);

                            return (
                                <div
                                    key={photo.id}
                                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 ${isSelected ? 'border-blue-500' : 'border-transparent'}`}
                                    onClick={() => toggleSelection(photo.id)}
                                >
                                    <img
                                        src={url}
                                        alt={photo.filename}
                                        className="w-full h-full object-cover"
                                        onLoad={() => URL.revokeObjectURL(url)} // Revoke on load to save memory? Use caution with re-renders. Actually better inside useEffect. 
                                    // Better approach for React: create object URL once in parent or component
                                    />
                                    {isSelected && (
                                        <div className="absolute top-1 right-1 bg-blue-500 rounded-full p-0.5">
                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="shrink-0 space-y-2 pt-2">
                <button
                    onClick={handleDownload}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white transition-colors"
                    disabled={selectedIds.size === 0}
                >
                    선택한 {selectedIds.size}장 다운로드
                </button>
            </div>
        </div>
    );
};
