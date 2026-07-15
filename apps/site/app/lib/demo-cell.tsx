type DemoCellProps = {
  label: string;
  note?: React.ReactNode;
  children: React.ReactNode;
};

export function DemoCell({ label, note, children }: DemoCellProps) {
  return (
    <div className="demo-cell">
      <span className="demo-cell-label">{label}</span>
      <div className="demo-cell-stage">{children}</div>
      {note && <span className="demo-cell-note">{note}</span>}
    </div>
  );
}

type DemoGridProps = {
  children: React.ReactNode;
};

export function DemoGrid({ children }: DemoGridProps) {
  return <div className="demo-grid">{children}</div>;
}