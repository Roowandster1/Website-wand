/**
 * A plain horizontal bar chart.
 *
 * Bars rather than a chart library: the whole thing is a label, a div whose
 * width is a percentage, and a number. Shipping a charting bundle to render
 * seven rectangles would be the wrong trade, and this stays readable when the
 * numbers are printed or read out.
 */
export default function Bars({
  items,
  emptyText = "Nothing to show yet.",
  formatValue = (n: number) => String(n),
}: {
  items: Array<{ label: string; value: number }>;
  emptyText?: string;
  formatValue?: (n: number) => string;
}) {
  const withValues = items.filter((i) => i.value > 0);
  if (withValues.length === 0) {
    return (
      <p style={{ color: "var(--ink-soft)", margin: "0.5rem 0 0" }}>{emptyText}</p>
    );
  }

  const peak = Math.max(...withValues.map((i) => i.value));

  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.label}>
          <span className="bars-label">{item.label}</span>
          <span className="bars-track" aria-hidden="true">
            <span
              className="bars-fill"
              style={{ width: `${Math.max((item.value / peak) * 100, item.value > 0 ? 3 : 0)}%` }}
            />
          </span>
          <span className="bars-value">{formatValue(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
