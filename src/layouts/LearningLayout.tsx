import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';

const LearningLayout = () => {
    useEffect(() => {
        // 루프 레이아웃 활성화
        document.documentElement.classList.add('learning-layout-active');
        document.body.setAttribute('data-learning-route', 'true');

        return () => {
            // 언마운트 시에만 제거 (페이지 이동 시 유지됨)
            document.documentElement.classList.remove('learning-layout-active');
            document.body.removeAttribute('data-learning-route');
        };
    }, []);

    return <Outlet />;
};

export default LearningLayout;
