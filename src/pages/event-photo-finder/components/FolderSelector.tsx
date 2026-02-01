import React, { useRef } from 'react';
import './FolderSelector.css';

interface FolderSelectorProps {
    onFilesSelected: (files: File[]) => void;
    isProcessing: boolean;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({ onFilesSelected, isProcessing }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const fileList = Array.from(e.target.files);
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
        <div className="FolderSelector">
            <div className="fs-header">
                <h2 className="fs-title">사진 폴더 선택</h2>
                <p className="fs-desc">
                    행사 사진이 들어있는 폴더나<br />
                    파일들을 모두 선택해주세요.
                </p>
            </div>

            <div className="fs-dropzone">
                <div className="fs-folder-icon">📂</div>
                <p className="fs-limit-text">
                    최대 1000장까지 선택 가능합니다.<br />
                    (안드로이드는 개별 파일 전체 선택 필요)
                </p>

                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                    disabled={isProcessing}
                />

                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={isProcessing}
                    className="fs-select-btn"
                >
                    {isProcessing ? '처리 중...' : '사진 선택하기'}
                </button>
            </div>

            <div className="fs-info-box">
                <strong className="fs-info-title">💡 참고:</strong><br />
                선택한 사진은 서버로 전송되지 않고<br />
                회원님의 폰에서만 안전하게 분석됩니다.
            </div>
        </div>
    );
};
