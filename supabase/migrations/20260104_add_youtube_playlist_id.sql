-- Add youtube_playlist_id to learning_playlists
ALTER TABLE learning_playlists ADD COLUMN IF NOT EXISTS youtube_playlist_id TEXT;
CREATE INDEX IF NOT EXISTS idx_learning_playlists_yt_id ON learning_playlists(youtube_playlist_id);
