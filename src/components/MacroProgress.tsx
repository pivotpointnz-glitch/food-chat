interface MacroProgressProps {
  label: string;
  current: number;
  target: number | null;
  unit: string;
  colorClass: string;
}

export function MacroProgress({ label, current, target, unit, colorClass }: MacroProgressProps) {
  const pct = target && target > 0 ? Math.min(100, (current / target) * 100) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="text-neutral-500">
          {Math.round(current)}
          {target ? ` / ${Math.round(target)}` : ""} {unit}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        {pct !== null ? (
          <div
            className={`h-full rounded-full ${colorClass} transition-all`}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-0" />
        )}
      </div>
    </div>
  );
}
