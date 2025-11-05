import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
    const url = `${window.location.origin}/invite/${token}`;
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
      <div className="bg-gradient-to-br from-purple-900/95 to-blue-900/95 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90svh] overflow-hidden border border-purple-500/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 flex items-center justify-between">
          <h3 className="text-2xl font-bold text-white flex items-center gap-2">
            <i className="ri-mail-send-line"></i>
            초대 관리
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Create Invitation Form */}
          <div className="bg-white/10 rounded-lg p-6 mb-6">
            <h4 className="text-lg font-semibold text-white mb-4">새 초대 생성</h4>
            <form onSubmit={createInvitation} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="초대할 이메일 주소"
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '생성 중...' : '초대 생성'}
              </button>
            </form>
          </div>

          {/* Invitations List */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">초대 목록</h4>
            {loading && invitations.length === 0 ? (
              <p className="text-white/60 text-center py-8">불러오는 중...</p>
            ) : invitations.length === 0 ? (
              <p className="text-white/60 text-center py-8">아직 초대가 없습니다</p>
            ) : (
              <div className="space-y-3">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="bg-white/10 rounded-lg p-4 border border-white/20"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm break-all">{inv.email}</span>
                        {inv.used ? (
                          <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-500/30 whitespace-nowrap">
                            초대 수락
                          </span>
                        ) : new Date(inv.expires_at) < new Date() ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full border border-red-500/30 whitespace-nowrap">
                            만료됨
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full border border-blue-500/30 whitespace-nowrap">
                            활성
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {!inv.used && new Date(inv.expires_at) >= new Date() && (
                          <button
                            onClick={() => copyInviteUrl(inv.token)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <i className={copiedToken === inv.token ? "ri-check-line" : "ri-file-copy-line"}></i>
                            {copiedToken === inv.token ? '복사됨!' : '링크 복사'}
                          </button>
                        )}
                        <button
                          onClick={() => deleteInvitation(inv.id, inv.email, inv.used)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <i className="ri-delete-bin-line"></i>
                          삭제
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-white/60 space-y-1">
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
