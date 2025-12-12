import { Link, useLocation } from 'react-router-dom';
import './submenu.css';

export default function SocialSubMenu() {
  const location = useLocation();

  const menuItems = [
    { path: '/social/calendar', label: '전체소셜일정' },
  ];

  return (
    <div
      className="submenu-container"
      style={{
        backgroundColor: 'var(--header-bg-color)',
      }}
    >
      {menuItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`submenu-item ${isActive ? 'submenu-item-active' : 'submenu-item-inactive'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
