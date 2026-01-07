import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
// Using the verified Service Key
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

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
