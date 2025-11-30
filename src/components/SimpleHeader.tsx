import "./SimpleHeader.css";

export default function SimpleHeader({ title }: { title: string }) {
  return (
    <div className="sh-header-container">
      <h1 className="sh-title">{title}</h1>
    </div>
  );
}
