
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import "./BoardUserManagementModal.css"; // Reuse BOUM styles for table layout
import "../pages/admin/secure-members/page.css"; // Reuse secure styles

interface AdminFavoritesModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'events' | 'practice' | 'shops';

interface FavoriteItem {
    item_id: number;
    item_name: string;
    count: number;
    users: {
        nickname: string;
        created_at: string;
    }[];
    last_added_at: string;
}

export default function AdminFavoritesModal({ isOpen, onClose }: AdminFavoritesModalProps) {
    const { isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('events');
    const [data, setData] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && isAdmin) {
            fetchData();
        }
    }, [isOpen, activeTab, isAdmin]);

    const fetchData = async () => {
        setLoading(true);
        try {

            let tableName = '';
            let itemIdField = '';
            let itemTable = '';
            let itemNameField = '';

            if (activeTab === 'events') {
                tableName = 'event_favorites';
                itemIdField = 'event_id';
                itemTable = 'events';
                itemNameField = 'title';
            } else if (activeTab === 'practice') {
                tableName = 'practice_room_favorites';
                itemIdField = 'practice_room_id';
                itemTable = 'venues';
                itemNameField = 'name';
            } else if (activeTab === 'shops') {
                tableName = 'shop_favorites';
                itemIdField = 'shop_id';
                itemTable = 'shops';
                itemNameField = 'name';
            }

            // A. Fetch Favorites
            const { data: favorites, error: favError } = await supabase
                .from(tableName)
                .select('*')
                .order('created_at', { ascending: false });

            if (favError) throw favError;
            if (!favorites || favorites.length === 0) {
                setData([]);
                return;
            }

            // B. Fetch User Details
            const userIds = [...new Set(favorites.map(f => f.user_id))];
            const { data: usersData } = await supabase
                .from('board_users')
                .select('user_id, nickname')
                .in('user_id', userIds);

            const userMap: Record<string, string> = {};
            usersData?.forEach(u => userMap[u.user_id] = u.nickname);

            // C. Fetch Item Details
            const itemIds = [...new Set(favorites.map(f => f[itemIdField]))];
            const { data: itemsData } = await supabase
                .from(itemTable)
                .select(`id, ${itemNameField}`)
                .in('id', itemIds);

            const itemMap: Record<string, string> = {};
            itemsData?.forEach((i: any) => itemMap[String(i.id)] = i[itemNameField]);

            // D. Grouping & Combine
            const groupedMap = new Map<string, FavoriteItem>();

            favorites.forEach(f => {
                const itemId = String(f[itemIdField]);
                const nickname = userMap[f.user_id] || '알 수 없음';

                if (!groupedMap.has(itemId)) {
                    groupedMap.set(itemId, {
                        item_id: Number(itemId),
                        item_name: itemMap[itemId] || `ID: ${itemId} (삭제됨)`,
                        count: 0,
                        users: [],
                        last_added_at: f.created_at
                    });
                }

                const group = groupedMap.get(itemId)!;
                group.count += 1;
                group.users.push({
                    nickname,
                    created_at: f.created_at
                });

                // 최신 날짜 유지
                if (new Date(f.created_at) > new Date(group.last_added_at)) {
                    group.last_added_at = f.created_at;
                }
            });

            setData(Array.from(groupedMap.values()).sort((a, b) => b.count - a.count));

        } catch (error) {
            console.error('Error fetching favorites stats:', error);
            alert('데이터 조회를 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="admin-modal-overlay">
            <div className="boum-container secure-container-override" translate="no" style={{
                maxWidth: '900px',
                width: '95%',
                height: '80vh',
                maxHeight: '800px',
                backgroundColor: 'var(--bg-color)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div className="boum-header">
                    <div className="boum-header-top">
                        <h2 className="boum-title">❤️ 즐겨찾기 현황</h2>
                        <button onClick={onClose} className="boum-close-btn" title="닫기">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                        <button
                            className={`boum-action-btn ${activeTab === 'events' ? 'boum-btn-yellow' : ''}`}
                            onClick={() => setActiveTab('events')}
                        >
                            행사 ({activeTab === 'events' ? data.length : ''})
                        </button>
                        <button
                            className={`boum-action-btn ${activeTab === 'practice' ? 'boum-btn-yellow' : ''}`}
                            onClick={() => setActiveTab('practice')}
                        >
                            연습실 ({activeTab === 'practice' ? data.length : ''})
                        </button>
                        <button
                            className={`boum-action-btn ${activeTab === 'shops' ? 'boum-btn-yellow' : ''}`}
                            onClick={() => setActiveTab('shops')}
                        >
                            쇼핑몰 ({activeTab === 'shops' ? data.length : ''})
                        </button>
                    </div>
                </div>

                <div className="boum-content" style={{ flex: 1, overflow: 'auto' }}>
                    {loading ? (
                        <div className="boum-loading"><div className="prl-spinner"></div></div>
                    ) : (
                        <div className="boum-table-wrapper">
                            <table className="boum-table">
                                <thead>
                                    <tr className="boum-table-head">
                                        <th className="boum-table-header" style={{ width: '40%' }}>관심 항목</th>
                                        <th className="boum-table-header" style={{ textAlign: 'center' }}>횟수</th>
                                        <th className="boum-table-header">즐겨찾기한 사용자 (최신순)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((item) => (
                                        <tr key={item.item_id} className="boum-table-row">
                                            <td className="boum-table-cell">
                                                <span style={{ fontWeight: 600 }}>{item.item_name}</span>
                                            </td>
                                            <td className="boum-table-cell" style={{ textAlign: 'center' }}>
                                                <span className="boum-status-badge" style={{
                                                    backgroundColor: 'rgba(248, 113, 113, 0.1)',
                                                    color: '#f87171',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 'bold'
                                                }}>
                                                    ❤️ {item.count}
                                                </span>
                                            </td>
                                            <td className="boum-table-cell">
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {item.users.map((u, idx) => (
                                                        <span key={idx} style={{
                                                            fontSize: '0.75rem',
                                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px'
                                                        }}>
                                                            {u.nickname}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="boum-date-text" style={{ marginTop: '4px', fontSize: '0.7rem', opacity: 0.6 }}>
                                                    최근: {new Date(item.last_added_at).toLocaleString('ko-KR')}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {data.length === 0 && (
                                        <tr>
                                            <td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                                데이터가 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
