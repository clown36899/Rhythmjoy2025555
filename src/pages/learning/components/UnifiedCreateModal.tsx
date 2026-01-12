import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
    onClose: () => void;
    onCreateFolder: () => void;
    onCreateCanvas: () => void;
    onCreatePerson: () => void;
    onCreatePlaylist: () => void;
    onCreateDocument: () => void;
    onCreateGeneral?: () => void;
    context: 'drawer' | 'canvas';
}

export const UnifiedCreateModal = ({
    onClose,
    onCreateFolder,
    onCreateCanvas,
    onCreatePerson,
    onCreatePlaylist,
    onCreateDocument,
    onCreateGeneral,
    context
}: Props) => {
    const modalContent = (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 10001,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)'
        }} onClick={onClose}>
            <div style={{
                background: '#1f2937', padding: '24px', borderRadius: '12px',
                width: '90%', maxWidth: '450px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid #374151'
            }} onClick={e => e.stopPropagation()}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#f3f4f6' }}>새로 만들기</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '20px' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    {context === 'canvas' && (
                        <button
                            onClick={() => { console.log('➕ [UnifiedAdd] General Item clicked'); onClose(); setTimeout(() => onCreateGeneral?.(), 0); }}
                            style={cardStyle}
                        >
                            <span style={iconStyle}>✨</span>
                            <div style={{ textAlign: 'left' }}>
                                <div style={titleStyle}>일반 항목</div>
                                <div style={descStyle}>이미지나 텍스트가 포함된 기본 노드를 생성합니다.</div>
                            </div>
                        </button>
                    )}

                    <button
                        onClick={() => { console.log('➕ [UnifiedAdd] Folder clicked'); onClose(); setTimeout(onCreateFolder, 0); }}
                        style={cardStyle}
                    >
                        <span style={iconStyle}>📂</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={titleStyle}>폴더</div>
                            <div style={descStyle}>새 카테고리를 생성하여 정리합니다.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            if (context === 'drawer') return;
                            console.log('➕ [UnifiedAdd] Canvas clicked');
                            onClose();
                            setTimeout(onCreateCanvas, 0);
                        }}
                        style={{
                            ...cardStyle,
                            opacity: context === 'drawer' ? 0.5 : 1,
                            cursor: context === 'drawer' ? 'not-allowed' : 'pointer',
                            pointerEvents: context === 'drawer' ? 'none' : 'auto'
                        }}
                        title={context === 'drawer' ? '서랍에서는 캔버스를 추가할 수 없습니다.' : ''}
                    >
                        <span style={iconStyle}>🚪</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={titleStyle}>캔버스</div>
                            <div style={descStyle}>무한 확장 및 탐색 가능한 공간을 생성합니다.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => { console.log('➕ [UnifiedAdd] Person clicked'); onClose(); setTimeout(onCreatePerson, 0); }}
                        style={cardStyle}
                    >
                        <span style={iconStyle}>👤</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={titleStyle}>인물</div>
                            <div style={descStyle}>이미지와 약력을 포함한 인물 카드를 생성합니다.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => { console.log('➕ [UnifiedAdd] Playlist clicked'); onClose(); setTimeout(onCreatePlaylist, 0); }}
                        style={cardStyle}
                    >
                        <span style={iconStyle}>📺</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={titleStyle}>재생목록 / 영상</div>
                            <div style={descStyle}>YouTube 재생목록이나 영상을 가져옵니다.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => { console.log('➕ [UnifiedAdd] Document clicked'); onClose(); setTimeout(onCreateDocument, 0); }}
                        style={cardStyle}
                    >
                        <span style={iconStyle}>📄</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={titleStyle}>문서</div>
                            <div style={descStyle}>새로운 학습 문서를 작성합니다.</div>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    background: '#374151',
    border: '1px solid #4b5563',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#f3f4f6',
    transition: 'all 0.2s',
    outline: 'none'
};

const iconStyle: React.CSSProperties = {
    fontSize: '24px'
};

const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: '500',
    marginBottom: '4px'
};

const descStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#d1d5db'
};
