import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import "../../../components/BoardUserManagementModal.css"; // Reuse styles
import "../secure-members/page.css"; // Reuse secure page styles for consistency

type Tab = 'events' | 'practice' | 'shops';

interface FavoriteItem {
    id: number;
    user_id: string;
    item_name: string;
    user_nickname: string;
    created_at: string;
}

export default function AdminFavoritesPage() {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('events');
    const [data, setData] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!loading && !isAdmin) {
            navigate('/');
        }
    }, [isAdmin, loading, navigate]);

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let resultData: FavoriteItem[] = [];

            // 1. Fetch Favorites Data based on Tab
            // Note: We perform client-side join for reliability if Supabase foreign keys vary
            let query;
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
                itemTable = 'venues'; // Practice rooms use 'venues' table
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

            // B. Fetch User Details (Nicknames)
            const userIds = [...new Set(favorites.map(f => f.user_id))];
            const { data: usersData } = await supabase
                .from('board_users')
                .select('user_id, nickname')
                .in('user_id', userIds);

            const userMap: Record<string, string> = {};
            usersData?.forEach(u => userMap[u.user_id] = u.nickname);

            // C. Fetch Item Details (Names)
            const itemIds = [...new Set(favorites.map(f => f[itemIdField]))];
            const { data: itemsData } = await supabase
                .from(itemTable)
                .select(`id, ${itemNameField}`)
                .in('id', itemIds);

            const itemMap: Record<string, string> = {};
            itemsData?.forEach((i: any) => itemMap[String(i.id)] = i[itemNameField]);

            // D. Combine
            resultData = favorites.map(f => ({
                id: f.id,
                user_id: f.user_id,
                item_name: itemMap[String(f[itemIdField])] || `ID: ${f[itemIdField]} (삭제됨)`,
                user_nickname: userMap[f.user_id] || '알 수 없음',
                created_at: f.created_at
            }));

            setData(resultData);

        } catch (error) {
            console.error('Error fetching favorites stats:', error);
            alert('데이터 조회를 실패했습니다. 관리자 권한을 확인해주세요.');
        } finally {
            setLoading(false);
        }
    };

    if (!isAdmin) return null;

    return (
        <div className="secure-page-wrapper">
            <div className="boum-container secure-container-override" style={{ maxWidth: '1000px' }}>
                <div className="boum-header">
                    <div className="boum-header-top">
                        <h2 className="boum-title">❤️ 즐겨찾기 현황 (전체 조회)</h2>
                        <button onClick={() => navigate(-1)} className="boum-close-btn" title="돌아가기">
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

                <div className="boum-content">
                    {loading ? (
                        <div className="boum-loading"><div className="prl-spinner"></div></div>
                    ) : (
                        <div className="boum-table-wrapper">
                            <table className="boum-table">
                                <thead>
                                    <tr className="boum-table-head">
                                        <th className="boum-table-header">사용자</th>
                                        <th className="boum-table-header">관심 항목</th>
                                        <th className="boum-table-header">일시</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((item) => (
                                        <tr key={item.id} className="boum-table-row">
                                            <td className="boum-table-cell">
                                                <span style={{ fontWeight: 600 }}>{item.user_nickname}</span>
                                            </td>
                                            <td className="boum-table-cell">
                                                {item.item_name}
                                            </td>
                                            <td className="boum-table-cell boum-date-text">
                                                {new Date(item.created_at).toLocaleString('ko-KR')}
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
        </div>
    );
}
