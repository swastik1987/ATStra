export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 font-heading font-bold text-[32px] leading-tight">{title}</h1>
      <p className="m-0 text-muted">{note}</p>
    </div>
  );
}
