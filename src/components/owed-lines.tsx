import type { Line } from "@/lib/friends";
import { formatMoney } from "@/lib/money";

// "owes you $30.00" / "you owe €12.00" per currency, or "settled up" (Friends tab and friend page).
export function OwedLines({ lines }: { lines: Line[] }) {
  if (lines.length === 0) return <span className="text-gray-400">settled up</span>;
  return (
    <>
      {lines.map((l) => (
        <span key={l.currency} className={`block ${l.cents > 0 ? "text-brand-600" : "text-owe"}`}>
          {l.cents > 0 ? "owes you " : "you owe "}
          <b>{formatMoney(Math.abs(l.cents), l.currency)}</b>
        </span>
      ))}
    </>
  );
}
