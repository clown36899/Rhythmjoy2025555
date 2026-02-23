import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
// Using the verified Service Key
const supabaseServiceKey = '[REDACTED_SERVICE_ROLE_KEY]';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTableStructure() {
    console.log('\n=== Checking learning_videos structure ===\n');
    const { data: videoData, error: videoError } = await supabase
        .from('learning_videos')
        .select('*')
        .limit(1);

    if (videoError) {
        console.log('Video query error:', videoError.message);
    } else {
        console.log('Video columns:', videoData && videoData.length > 0 ? Object.keys(videoData[0]) : 'Table is empty');
    }

    console.log('\n=== Checking learning_playlists structure ===\n');
    const { data: playlistData, error: playlistError } = await supabase
        .from('learning_playlists')
        .select('*')
        .limit(1);

    if (playlistError) {
        console.log('Playlist query error:', playlistError.message);
    } else {
        console.log('Playlist columns:', playlistData && playlistData.length > 0 ? Object.keys(playlistData[0]) : 'Table is empty');
    }
}

checkTableStructure()
    .then(() => {
        console.log('\n✅ Structure check complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    });
