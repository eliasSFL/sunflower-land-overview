import { pixelDarkBorderStyle } from "./ui/borderStyles.ts";
import { InnerPanel } from "./ui/index.ts";

// Floating bottom strip that jumps to a section on tap. Lives on
// small viewports only — at `lg+` the layout already sits in a
// scannable multi-column grid, so the strip would just be noise.
//
// `sections` is fully declarative — each entry just needs a DOM id,
// a label and an icon URL. Categories, the Bumpkin summary, delivery
// buckets, Next up, and any future left-column panel slot in
// uniformly. The caller (App) decides ordering and visibility; if a
// panel isn't rendered, drop it from this list.

export type NavSection = {
  id: string;
  label: string;
  icon: string;
};

type Props = {
  sections: readonly NavSection[];
};

export function MobileNav({ sections }: Props) {
  if (sections.length === 0) return null;

  const handleJump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      aria-label="Section navigation"
      // Fixed to the bottom on mobile; hidden once the Farm ID sidebar
      // appears (lg+) since the grid layout is already scannable.
      className="fixed inset-x-0 bottom-0 z-20 px-1 pb-2 lg:hidden"
      // pb adds room for the iOS home indicator on devices that report
      // a safe-area inset.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <InnerPanel className="p-1!">
        <ul className="flex gap-1 overflow-x-auto">
          {sections.map((section) => (
            <li key={section.id} className="shrink-0">
              <button
                type="button"
                onClick={() => handleJump(section.id)}
                className="flex items-center gap-1 whitespace-nowrap text-xs"
                style={{
                  ...pixelDarkBorderStyle,
                  background: "#c28569",
                  padding: "2px 6px",
                }}
              >
                <img
                  src={section.icon}
                  alt=""
                  aria-hidden
                  className="h-4 w-4 shrink-0 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
                <span>{section.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </InnerPanel>
    </nav>
  );
}
