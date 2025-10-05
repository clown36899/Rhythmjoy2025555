// 이벤트별 고유 색상을 생성하는 유틸리티

const colorPalette = [
  { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
  { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' },
  { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500' },
  { bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' },
  { bg: 'bg-lime-500', text: 'text-lime-500', border: 'border-lime-500' },
  { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' },
  { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500' },
  { bg: 'bg-teal-500', text: 'text-teal-500', border: 'border-teal-500' },
  { bg: 'bg-cyan-500', text: 'text-cyan-500', border: 'border-cyan-500' },
  { bg: 'bg-sky-500', text: 'text-sky-500', border: 'border-sky-500' },
  { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500' },
  { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-500' },
  { bg: 'bg-violet-500', text: 'text-violet-500', border: 'border-violet-500' },
  { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
  { bg: 'bg-fuchsia-500', text: 'text-fuchsia-500', border: 'border-fuchsia-500' },
  { bg: 'bg-pink-500', text: 'text-pink-500', border: 'border-pink-500' },
  { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500' },
];

// 문자열을 해시값으로 변환하는 함수
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// 이벤트 ID를 기반으로 일관성 있는 색상을 반환
export function getEventColor(eventId: number) {
  const hash = hashString(eventId.toString());
  const index = hash % colorPalette.length;
  return colorPalette[index];
}

// 인덱스를 기반으로 색상을 반환 (달력에서 중복 방지용)
export function getColorByIndex(index: number) {
  return colorPalette[index % colorPalette.length];
}
