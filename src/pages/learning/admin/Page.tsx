import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { PlaylistImportModal } from '../components/PlaylistImportModal';
import { fetchPlaylistVideos } from '../utils/youtube';
import { CategoryManager } from './components/CategoryManager';
import { MovePlaylistModal } from './components/MovePlaylistModal';
import './Page.css';

interface Playlist {
  id: string;
  title: string;
  thumbnail_url: string;
  video_count: number;
  is_public: boolean;
  created_at: string;
  youtube_playlist_id?: string;
  category_id?: string;
}

const LearningAdminPage = () => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [moveModal, setMoveModal] = useState<{ isOpen: boolean; playlistId: string; categoryId: string | null }>({
    isOpen: false,
    playlistId: '',
    categoryId: null
  });

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlaylists = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('learning_playlists')
        .select(`
          *,
          videos:learning_videos(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPlaylists(data.map((item: any) => ({
        ...item,
        video_count: item.videos[0]?.count || 0
      })));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleDelete = async (playlistId: string) => {
    if (!confirm('정말로 이 재생목록을 삭제하시겠습니까? \n모든 관련 비디오도 함께 삭제됩니다.')) return;

    try {
      const { error } = await supabase
        .from('learning_playlists')
        .delete()
        .eq('id', playlistId);

      if (error) throw error;
      fetchPlaylists();
    } catch (err) {
      console.error(err);
      alert('삭제 실패');
    }
  };

  const handleSync = async (playlist: Playlist) => {
    if (!playlist.youtube_playlist_id) {
      alert('유튜브 연동 정보가 없는 재생목록입니다.');
      return;
    }

    if (!confirm('유튜브에서 최신 정보를 가져와 갱신하시겠습니까? \n기존 비디오 목록은 초기화됩니다.')) return;

    try {
      setIsLoading(true);
      // 1. Fetch new videos from YouTube
      const videos = await fetchPlaylistVideos(playlist.youtube_playlist_id);

      if (videos.length === 0) {
        throw new Error('재생목록에 영상이 없습니다.');
      }

      // 2. Delete existing videos (Clean slate approach)
      const { error: deleteError } = await supabase
        .from('learning_videos')
        .delete()
        .eq('playlist_id', playlist.id);

      if (deleteError) throw deleteError;

      // 3. Insert new videos
      const videoData = videos.map((video, index) => ({
        playlist_id: playlist.id,
        youtube_video_id: video.resourceId.videoId,
        title: video.title,
        order_index: index,
        memo: video.description?.slice(0, 100),
      }));

      const { error: insertError } = await supabase
        .from('learning_videos')
        .insert(videoData);

      if (insertError) throw insertError;

      // 4. Update sync timestamp (optional, but good for UX - using updated_at)
      await supabase
        .from('learning_playlists')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', playlist.id);

      alert('동기화 완료!');
      fetchPlaylists();

    } catch (err: any) {
      console.error(err);
      alert(`동기화 실패: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncAll = async () => {
    const targets = playlists.filter(p => p.youtube_playlist_id);
    if (targets.length === 0) {
      alert('동기화할 유튜브 재생목록이 없습니다.');
      return;
    }

    if (!confirm(`총 ${targets.length}개의 재생목록을 모두 동기화하시겠습니까? \n시간이 조금 걸릴 수 있습니다.`)) return;

    try {
      setIsLoading(true);
      let successCount = 0;
      let failCount = 0;

      for (const playlist of targets) {
        try {
          // 1. Fetch new videos from YouTube
          const videos = await fetchPlaylistVideos(playlist.youtube_playlist_id!);

          if (videos.length === 0) continue;

          // 2. Delete existing videos
          const { error: deleteError } = await supabase
            .from('learning_videos')
            .delete()
            .eq('playlist_id', playlist.id);

          if (deleteError) throw deleteError;

          // 3. Insert new videos
          const videoData = videos.map((video, index) => ({
            playlist_id: playlist.id,
            youtube_video_id: video.resourceId.videoId,
            title: video.title,
            order_index: index,
            memo: video.description?.slice(0, 100),
          }));

          const { error: insertError } = await supabase
            .from('learning_videos')
            .insert(videoData);

          if (insertError) throw insertError;

          // 4. Update sync timestamp
          await supabase
            .from('learning_playlists')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', playlist.id);

          successCount++;
        } catch (err) {
          console.error(`Failed to sync playlist ${playlist.title}:`, err);
          failCount++;
        }
      }

      alert(`전체 동기화 완료! \n성공: ${successCount}건 \n실패: ${failCount}건`);
      fetchPlaylists();

    } catch (err: any) {
      console.error(err);
      alert(`전체 동기화 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">학습 갤러리 관리자</h1>
        <div className="headerButtons">
          <button
            onClick={handleSyncAll}
            className="syncAllButton"
            disabled={isLoading}
          >
            <span>🔄</span> 전체 동기화
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="importButton"
          >
            <span>📺</span> 유튜브 재생목록 가져오기
          </button>
        </div>
      </div>

      <div className="mainLayout">
        {/* Left Sidebar: Category Manager */}
        <div className="sidebar">
          <CategoryManager onCategoryChange={() => {
            // Optional: Refresh playlists if filter depends on category
            fetchPlaylists();
          }} />
        </div>

        {/* Right Content: Playlist Grid */}
        <div className="content">
          <div className="section">
            <h2 className="sectionTitle">
              📂 내 재생목록
              <span className="countBadge">
                {playlists.length}
              </span>
            </h2>

            {isLoading ? (
              <div className="loading">로딩 중...</div>
            ) : playlists.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">📭</div>
                <div className="emptyText">등록된 재생목록이 없습니다.</div>
                <div className="emptySubtext">우측 상단의 버튼을 눌러 유튜브 재생목록을 가져오세요.</div>
              </div>
            ) : (
              <div className="grid">
                {playlists.map(playlist => (
                  <div key={playlist.id} className="card">
                    <div className="thumbnailContainer">
                      {playlist.thumbnail_url ? (
                        <img src={playlist.thumbnail_url} alt={playlist.title} className="thumbnail" />
                      ) : (
                        <div className="noImage">No Image</div>
                      )}
                      <div className="videoCount">
                        {playlist.video_count} videos
                      </div>
                      {/* Debug: ID check */}
                      {playlist.youtube_playlist_id && (
                        <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: 4 }}>
                          YT Linked
                        </div>
                      )}
                    </div>
                    <div className="cardContent">
                      <h3 className="cardTitle">{playlist.title}</h3>
                      <div className="cardFooter">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`재생목록을 ${playlist.is_public ? '비공개' : '공개'}로 전환하시겠습니까?`)) return;

                            try {
                              const { error } = await supabase
                                .from('learning_playlists')
                                .update({ is_public: !playlist.is_public })
                                .eq('id', playlist.id);

                              if (error) throw error;
                              fetchPlaylists(); // refresh
                            } catch (err) {
                              console.error(err);
                              alert('상태 변경 실패');
                            }
                          }}
                          className={`statusButton ${playlist.is_public ? 'statusPublic' : 'statusPrivate'}`}
                        >
                          {playlist.is_public ? '👀 공개됨' : '🔒 비공개'}
                        </button>
                        <span className="date">
                          {new Date(playlist.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="actionButtons">
                        <button
                          className="actionButton moveButton"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMoveModal({
                              isOpen: true,
                              playlistId: playlist.id,
                              categoryId: playlist.category_id || null
                            });
                          }}
                        >
                          📂 이동
                        </button>

                        <button
                          className="actionButton syncButton"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSync(playlist);
                          }}
                          disabled={!playlist.youtube_playlist_id}
                          title={!playlist.youtube_playlist_id ? '유튜브 연동 정보 없음' : '유튜브와 동기화'}
                        >
                          🔄 동기화
                        </button>
                        <button
                          className="actionButton deleteButton"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(playlist.id);
                          }}
                        >
                          🗑 삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {
        showImportModal && (
          <PlaylistImportModal
            onClose={() => setShowImportModal(false)}
            onSuccess={fetchPlaylists}
          />
        )
      }

      {
        moveModal.isOpen && (
          <MovePlaylistModal
            playlistId={moveModal.playlistId}
            currentCategoryId={moveModal.categoryId}
            onClose={() => setMoveModal({ ...moveModal, isOpen: false })}
            onSuccess={fetchPlaylists}
          />
        )
      }
    </div >
  );
};

export default LearningAdminPage;
