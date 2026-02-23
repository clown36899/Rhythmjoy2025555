import "./SimpleHeader.css";

interface SimpleHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
}

export default function SimpleHeader({ title, rightAction }: SimpleHeaderProps) {
  return (
    <div className="sh-header-container">
      <h1 className="sh-title">{title}</h1>
      {rightAction && <div className="sh-right-action">{rightAction}</div>}
    </div>
  );
}
