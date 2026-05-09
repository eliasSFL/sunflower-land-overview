import { slugify } from "../lib/slug";

type Entry = {
  category: string;
  total: number;
  ready: number;
};

type Props = {
  entries: Entry[];
  onNavigate?: () => void;
};

/**
 * Category list used by both the desktop sticky sidebar and the mobile
 * drawer. Clicking an entry smooth-scrolls to its section. The optional
 * `onNavigate` callback lets the mobile drawer close itself after a tap.
 */
export function Sidebar({ entries, onNavigate }: Props) {
  if (entries.length === 0) return null;

  return (
    <nav aria-label="Sections" className="space-y-1">
      <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-[--color-muted]">
        Sections
      </h2>
      <ul className="space-y-0.5">
        {entries.map((entry) => {
          const id = slugify(entry.category);
          return (
            <li key={entry.category}>
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  onNavigate?.();
                }}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5"
              >
                <span className="truncate">{entry.category}</span>
                <span className="shrink-0 font-mono text-xs text-[--color-muted]">
                  {entry.ready > 0 ? (
                    <span className="text-green-700">{entry.ready}</span>
                  ) : null}
                  {entry.ready > 0 && " / "}
                  {entry.total}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
