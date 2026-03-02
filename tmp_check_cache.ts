
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCacheValue() {
    const { data, error } = await supabase.from('metrics_cache').select('*').eq('key', 'scene_analytics').maybeSingle()
    if (error) {
        console.error('Error:', error)
        return
    }
    if (!data) {
        console.log('No cache found for scene_analytics')
    } else {
        console.log('--- Current Cache Value ---')
        console.log('Updated At:', data.updated_at)
        console.log('Summary Daily Average:', data.value?.summary?.dailyAverage)
        const march = data.value?.monthly?.find(m => m.month === '2026-03')
        console.log('March Data (from cache):', JSON.stringify(march, null, 2))

        // Check if there are other keys or hidden data
        console.log('Cache Keys:', Object.keys(data.value))
    }
}

checkCacheValue()
