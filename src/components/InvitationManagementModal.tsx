import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './InvitationManagementModal.css';

interface Invitation {
  id: string;
  email: string;
  invited_by: string;
  token: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

interface InvitationManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InvitationManagementModal({ isOpen, onClose }: InvitationManagementModalProps) {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const apiEndpoint = import.meta.env.DEV ? '/api/invitations' : '/.netlify/functions/invitations';

  useEffect(() => {
    if (isOpen) {
      loadInvitations();
    }
  }, [isOpen]);

  const loadInvitations = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiEndpoint, {
        headers: {
          'X-Admin-Email': user?.email || ''
        }
      });

      if (response.ok) {
        const data = await response.json();
        setInvitations(data.invitations || []);
      }
    } catch (error) {
      console.error('Failed to load invitations:', error);
      alert('초대 목록을 불러오는데 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const createInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      alert('이메일을 입력하세요');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          adminEmail: user?.email
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`초대 링크가 생성되었습니다!\n\n${data.inviteUrl}`);
        setEmail('');
        loadInvitations();
      } else {
        const error = await response.json();
        alert(error.error || '초대 생성에 실패했습니다');
      }
    } catch (error) {
      console.error('Failed to create invitation:', error);
      alert('초대 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteUrl = (token: string) => {
    const url = `https://swingenjoy.com/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const deleteInvitation = async (id: string, email: string, used: boolean) => {
    const confirmMessage = used
      ? `'${email}' 사용자의 초대를 삭제하시겠습니까?\n\n⚠️ 이 사용자의 빌보드 계정과 설정도 모두 삭제됩니다.`
      : `'${email}'에게 보낸 초대를 취소하시겠습니까?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      const deleteEndpoint = import.meta.env.DEV
        ? `/api/invitations/${id}`
        : `/.netlify/functions/invitations-delete`;

      const response = await fetch(deleteEndpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationId: id,
          adminEmail: user?.email
        })
      });

      if (response.ok) {
        alert(used ? '초대 및 사용자 계정이 삭제되었습니다' : '초대가 취소되었습니다');
        loadInvitations();
      } else {
        const error = await response.json();
        alert(error.error || '삭제에 실패했습니다');
      }
    } catch (error) {
      console.error('Failed to delete invitation:', error);
      alert('삭제에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="im-modal-overlay">
      <div className="im-modal-container" translate="no">
        {/* Header */}
        <div className="im-header">
          <h3 className="im-header-title">
            <i className="ri-mail-send-line"></i>
            초대 관리
          </h3>
          <button
            onClick={onClose}
            className="im-close-btn"
          >
            <i className="ri-close-line im-close-icon"></i>
          </button>
        </div>

        <div className="im-body">
          {/* Create Invitation Form */}
          <div className="im-form-section">
            <h4 className="im-form-title">새 초대 생성</h4>
            <form onSubmit={createInvitation} className="im-form">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="초대할 이메일 주소"
                className="im-email-input"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="im-submit-btn"
              >
                {loading ? '생성 중...' : '초대 생성'}
              </button>
            </form>
          </div>

          {/* Invitations List */}
          <div>
            <h4 className="im-list-title">초대 목록</h4>
            {loading && invitations.length === 0 ? (
              <p className="im-loading-text">불러오는 중...</p>
            ) : invitations.length === 0 ? (
              <p className="im-empty-text">아직 초대가 없습니다</p>
            ) : (
              <div className="im-list-container">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="im-invite-card"
                  >
                    <div className="im-card-main">
                      <div className="im-card-email-row">
                        <div className="im-email-area">
                          <span className="im-email-text">{inv.email}</span>
                          {inv.used ? (
                            <span className="im-badge im-badge-accepted">
                              초대 수락
                            </span>
                          ) : new Date(inv.expires_at) < new Date() ? (
                            <span className="im-badge im-badge-expired">
                              만료됨
                            </span>
                          ) : (
                            <span className="im-badge im-badge-active">
                              활성
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="im-action-area">
                        {!inv.used && new Date(inv.expires_at) >= new Date() && (
                          <button
                            onClick={() => copyInviteUrl(inv.token)}
                            className="im-copy-btn"
                          >
                            <i className={copiedToken === inv.token ? "ri-check-line" : "ri-file-copy-line"}></i>
                            {copiedToken === inv.token ? '복사됨!' : '링크 복사'}
                          </button>
                        )}
                        <button
                          onClick={() => deleteInvitation(inv.id, inv.email, inv.used)}
                          className="im-delete-btn"
                        >
                          <i className="ri-delete-bin-line"></i>
                          삭제
                        </button>
                      </div>
                    </div>
                    <div className="im-card-info">
                      <p>생성일: {new Date(inv.created_at).toLocaleString('ko-KR')}</p>
                      <p>만료일: {new Date(inv.expires_at).toLocaleString('ko-KR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
