import React, { useRef } from 'react';

interface FolderSelectorProps {
    onFilesSelected: (files: File[]) => void;
    isProcessing: boolean;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({ onFilesSelected, isProcessing }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const fileList = Array.from(e.target.files);
            // Filter images only
            const images = fileList.filter(f => f.type.startsWith('image/'));

            if (images.length === 0) {
                alert('이미지 파일이 없습니다.');
                return;
            }

            if (images.length < fileList.length) {
                alert(`이미지가 아닌 파일 ${fileList.length - images.length}개는 제외되었습니다.`);
            }

            onFilesSelected(images);
        }
    };

    return (
        <div className="text-center space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold">사진 폴더 선택</h2>
                <p className="text-gray-400">
                    행사 사진이 들어있는 폴더나<br />
                    파일들을 모두 선택해주세요.
                </p>
            </div>

            <div className="p-8 border-2 border-dashed border-gray-600 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors">
                <div className="text-5xl mb-4">📂</div>
                <p className="text-sm text-gray-500 mb-6">
                    최대 1000장까지 선택 가능합니다.<br />
                    (안드로이드는 개별 파일 전체 선택 필요)
                </p>

                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isProcessing}
                />

                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={isProcessing}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isProcessing ? '처리 중...' : '사진 선택하기'}
                </button>
            </div>

            <div className="text-xs text-gray-500 bg-gray-900 p-4 rounded-lg text-left">
                <strong>💡 참고:</strong><br />
                선택한 사진은 서버로 전송되지 않고<br />
                회원님의 폰에서만 안전하게 분석됩니다.
            </div>
        </div>
    );
};
