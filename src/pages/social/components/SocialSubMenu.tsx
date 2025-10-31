import { Link, useLocation } from 'react-router-dom';

export default function SocialSubMenu() {
  const location = useLocation();

  const menuItems = [
    { path: '/social/clubs', label: '동호회위치' },
    { path: '/social/swing-bars', label: '스윙바' },
    { path: '/social/calendar', label: '전체소셜일정' },
  ];

  return (
    <div
      className="fixed left-0 right-0 z-10 flex justify-around border-b"
      style={{
        top: '56px',
        maxWidth: '650px',
        margin: '0 auto',
        backgroundColor: 'var(--header-bg-color)',
        borderBottomColor: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      {menuItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className="flex-1 text-center py-3 text-sm font-medium transition-colors no-select"
            style={{
              color: isActive ? '#10b981' : 'rgba(255, 255, 255, 0.7)',
              borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
