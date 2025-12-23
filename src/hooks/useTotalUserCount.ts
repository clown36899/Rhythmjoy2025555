import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useTotalUserCount() {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        const fetchCount = async () => {
            const { count, error } = await supabase
                .from('board_users') // [수정] users -> board_users (실제 유저 테이블)
                .select('*', { count: 'exact', head: true });

            if (!error && count !== null) {
                setCount(count);
            }
        };

        fetchCount();
    }, []);

    return count;
}
