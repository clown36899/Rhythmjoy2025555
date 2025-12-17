import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/components/AdminUserInfoModal.css'; // Will create this

interface AdminUserInfoModalProps {
    userId: string;
    userName: string;
    onClose: () => void;
}

interface FetchedInfo {
    name: string;
    phone: string;
    email?: string;
    gender?: string;
    birthday?: string;
    birthyear?: string;
}

export default function AdminUserInfoModal({ userId, userName, onClose }: AdminUserInfoModalProps) {
    const [password, setPassword] = useState(''); // Master Password
    const [loading, setLoading] = useState(false);
    const [userInfo, setUserInfo] = useState<FetchedInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { session } = useAuth(); // Need current admin session token

    const fetchUserInfo = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!password) return;

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/.netlify/functions/admin-get-user-info', {
                method: 'POST',
                body: JSON.stringify({
                    targetUserId: userId,
                    masterPassword: password,
                    currentAdminToken: session?.access_token
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '조회 실패');
            }

            if (data.success && data.info) {
                setUserInfo(data.info);
            } else {
                throw new Error('데이터 형식이 올바르지 않습니다.');
            }

        } catch (err: any) {
            setError(err.message);
            setUserInfo(null);
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="admin-modal-overlay">
            <div className="admin-modal">
                <div className="admin-modal-header">
                    <h3>비상 연락처 조회 보안 접속</h3>
                    <button className="close-btn" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="admin-modal-body">
                    {!userInfo ? (
                        <>
                            <div className="security-icon">
                                <i className="ri-shield-keyhole-line"></i>
                            </div>
                            <p className="security-warning">
                                이 기능은 비상 연락용으로만 사용해야 합니다.<br />
                                <b>마스터 비밀번호(2차 비밀번호)</b>를 입력하세요.
                            </p>

                            <form onSubmit={fetchUserInfo} className="password-form">
                                <input
                                    type="password"
                                    placeholder="마스터 비밀번호 입력"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                />
                                <button type="submit" disabled={!password || loading}>
                                    {loading ? '복호화 중...' : '조회하기'}
                                </button>
                            </form>
                            {error && <div className="error-msg">{error}</div>}
                        </>
                    ) : (
                        <div className="user-info-display">
                            <div className="info-row">
                                <label>이름(실명)</label>
                                <span>{userInfo.name}</span>
                            </div>
                            <div className="info-row">
                                <label>전화번호</label>
                                <span className="phone-number">{userInfo.phone}</span>
                            </div>
                            <div className="info-row">
                                <label>이메일</label>
                                <span>{userInfo.email || '-'}</span>
                            </div>
                            <div className="info-row">
                                <label>생년월일</label>
                                <span>{userInfo.birthyear || ''} {userInfo.birthday || ''}</span>
                            </div>

                            <div className="warning-box">
                                <i className="ri-alarm-warning-line"></i>
                                <span>이 창을 닫으면 정보는 즉시 소멸됩니다.</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
