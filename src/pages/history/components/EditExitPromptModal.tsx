import React from 'react';

interface EditExitPromptModalProps {
    isOpen: boolean;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
}

export const EditExitPromptModal: React.FC<EditExitPromptModalProps> = ({
    isOpen,
    onSave,
    onDiscard,
    onCancel,
}) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 3000,
        }}>
            <div style={{
                backgroundColor: '#1f2937',
                padding: '24px',
                borderRadius: '12px',
                width: '90%',
                maxWidth: '400px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                textAlign: 'center'
            }}>
                <div style={{ marginBottom: '16px' }}>
                    <div style={{
                        fontSize: '3rem',
                        marginBottom: '10px'
                    }}>⚠️</div>
                    <h3 style={{
                        margin: '0 0 8px 0',
                        color: '#f9fafb',
                        fontSize: '1.25rem'
                    }}>저장되지 않은 변경 사항</h3>
                    <p style={{
                        margin: 0,
                        color: '#9ca3af',
                        fontSize: '0.95rem',
                        lineHeight: '1.5'
                    }}>
                        편집 모드를 종료하면 작업 내용이 사라질 수 있습니다.<br />
                        어떻게 하시겠습니까?
                    </p>
                </div>

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <button
                        onClick={onSave}
                        style={{
                            padding: '12px',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                    >
                        💾 저장하고 종료
                    </button>

                    <button
                        onClick={onDiscard}
                        style={{
                            padding: '12px',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            fontSize: '0.95rem',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'background 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                    >
                        ↩️ 저장 안 함 (변경 취소)
                    </button>

                    <button
                        onClick={onCancel}
                        style={{
                            padding: '12px',
                            backgroundColor: 'transparent',
                            color: '#9ca3af',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            marginTop: '4px'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.color = '#fff';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = '#9ca3af';
                        }}
                    >
                        ✖️ 닫기 (계속 편집)
                    </button>
                </div>
            </div>
        </div>
    );
};
