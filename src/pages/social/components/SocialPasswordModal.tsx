import { useState } from 'react';
import './SocialPlaceDetailModal.css';

interface SocialPasswordModalProps {
    onSubmit: (password: string) => Promise<boolean>;
    onClose: () => void;
}

export default function SocialPasswordModal({ onSubmit, onClose }: SocialPasswordModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) {
            setError('비밀번호를 입력해주세요.');
            return;
        }

        setLoading(true);
        setError('');

        const isValid = await onSubmit(password);

        if (!isValid) {
            setError('비밀번호가 일치하지 않습니다.');
            setLoading(false);
            setPassword('');
        }
        // If valid, parent will close modal
    };

    return (
        <div className="spdm-overlay" onClick={onClose}>
            <div
                className="spdm-container"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '360px' }}
            >
                <button onClick={onClose} className="spdm-close-fab" title="닫기">
                    <i className="ri-close-line"></i>
                </button>

                <div className="spdm-content">
                    <div className="spdm-header">
                        <h2 className="spdm-title" style={{ fontSize: '1.5rem' }}>비밀번호 확인</h2>
                        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                            수정/삭제를 위해 비밀번호를 입력해주세요.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="비밀번호"
                                autoFocus
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '0.875rem',
                                    borderRadius: '8px',
                                    border: error ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    color: '#ffffff',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.2s'
                                }}
                            />
                            {error && (
                                <p style={{
                                    color: '#ef4444',
                                    fontSize: '0.85rem',
                                    marginTop: '0.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                }}>
                                    <i className="ri-error-warning-line"></i>
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className="spdm-actions">
                            <button
                                type="button"
                                onClick={onClose}
                                className="spdm-btn spdm-btn-secondary"
                                disabled={loading}
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                className="spdm-btn spdm-btn-primary"
                                disabled={loading}
                            >
                                {loading ? '확인 중...' : '확인'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
