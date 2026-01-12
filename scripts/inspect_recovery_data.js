import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL || 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
    console.log('🕵️‍♂️ Fact-Checking Recovery Data...');

    // 1. Verify learning_categories is truly empty
    const { count, error: catError } = await supabase
        .from('learning_categories')
        .select('*', { count: 'exact', head: true });

    console.log(`\n[Fact 1] learning_categories count: ${count} (Error: ${catError?.message || 'None'})`);

    // 2. Scan history_nodes for potential folders
    // We look for nodes that are visibly acting as folders/canvases/playlists
    const { data: nodes, error: nodeError } = await supabase
        .from('history_nodes')
        .select('id, title, category, node_behavior, linked_category_id, linked_playlist_id')
        .in('category', ['folder', 'canvas', 'playlist', 'general'])
        .is('linked_category_id', null); // Only those missing links (orphans)

    if (nodeError) {
        console.error('Error fetching nodes:', nodeError);
        return;
    }

    console.log(`\n[Fact 2] Orphaned Nodes Candidates for Recovery: ${nodes.length}`);

    // Group by category to see what we are dealing with
    const distribution = {};
    nodes.forEach(n => {
        const key = `${n.category} (${n.node_behavior})`;
        distribution[key] = (distribution[key] || 0) + 1;
    });
    console.table(distribution);

    // Sample list
    if (nodes.length > 0) {
        console.log('\n[Sample Data - Top 5]');
        console.table(nodes.slice(0, 5).map(n => ({ id: n.id, title: n.title, type: n.category })));
    }
}

inspect().then(() => process.exit(0));
