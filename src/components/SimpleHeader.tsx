export default function SimpleHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-16 px-4 max-w-[650px] mx-auto">
      <h1 className="text-xl font-bold text-white">{title}</h1>
    </div>
  );
}
