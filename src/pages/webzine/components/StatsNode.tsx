import React from 'react';

// This is a placeholder for the StatsNode component.
// In the future, this will render actual charts using Recharts or similar.
// For now, it accepts configuration props and displays them.

interface StatsNodeProps {
    type: string;
    config?: any;
}

const StatsNode: React.FC<StatsNodeProps> = ({ type, config }) => {
    return (
        <div className="my-8 p-6 bg-gray-800 rounded-xl border border-gray-700">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📊</span>
                <h3 className="text-lg font-bold text-gray-200">통계 모듈: {type}</h3>
            </div>

            <div className="bg-gray-900 p-4 rounded-lg font-mono text-sm text-gray-400 overflow-x-auto">
                <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Configuration</p>
                <pre>{JSON.stringify(config, null, 2)}</pre>
            </div>

            <div className="mt-4 text-center text-gray-500 text-sm">
                * 실제 차트가 이곳에 렌더링됩니다.
            </div>
        </div>
    );
};

export default StatsNode;
