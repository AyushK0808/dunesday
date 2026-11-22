import { PLATFORM_NAMES, type ShowDoc } from "@/lib/types";

export function fillLevel(left: number, total: number): "ok" | "hot" | "full" {
  if (!total) return "ok";
  if (left <= 0) return "full";
  return left / total < 0.2 ? "hot" : "ok";
}

function seatsText(s: ShowDoc): string {
  if (!s.total) return "";
  if (s.available <= 0) return "Sold out";
  return `${s.available} of ${s.total} free`;
}

export function ShowChip({ show, showDate = false }: { show: ShowDoc; showDate?: boolean }) {
  const isNew = Date.now() - new Date(show.first_seen_at).getTime() < 24 * 60 * 60 * 1000;
  const soldOut = show.total > 0 && show.available <= 0;
  const sold = show.total ? 100 - Math.round((show.available / show.total) * 100) : 0;
  const price = show.min_price ? `from ₹${Math.round(show.min_price)}` : "";
  const site = PLATFORM_NAMES[show.platform] ?? "District";
  const bms = show.platform === "bookmyshow";
  const label = [
    show.time_text,
    show.tags.join(" "),
    show.theatre_name,
    seatsText(show),
    price,
    isNew ? "added in the last 24 hours" : "",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <a className="chip" href={show.booking_url} target="_blank" rel="noreferrer" data-soldout={soldOut} aria-label={`${label}. Opens ${site}.`} title={show.audi || undefined}>
      {isNew && <span className="chip-new" aria-hidden="true" />}
      <span className="chip-time">
        {showDate ? `${show.date.slice(8)} · ` : ""}
        {show.time_text}
      </span>
      <span className="chip-tags">
        {show.tags.join(" ")}
        {bms && <abbr title="Book on BookMyShow"> · BMS</abbr>}
      </span>
      <span className="chip-meta">{soldOut ? "Sold out" : price || seatsText(show)}</span>
      <span className="fill" data-level={fillLevel(show.available, show.total)} aria-hidden="true">
        <i style={{ width: `${sold}%` }} />
      </span>
    </a>
  );
}
