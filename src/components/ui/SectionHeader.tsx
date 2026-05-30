import type { ReactNode } from "react";

// Pixel-art section divider: an uppercase tracked-out label on the
// left, a thin horizontal rule filling the rest of the row, and an
// optional trailing node (e.g. a live count) after the rule. Used in
// SettingsModal to separate WHEN OPENED, and the Layout screen's
// "On your board" / "Hidden" sections (with their counts on the right).
type Props = {
  children: ReactNode;
  right?: ReactNode;
};

export function SectionHeader({ children, right }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider">{children}</span>
      <div className="h-px flex-1 bg-[#3e2731]/40" />
      {right}
    </div>
  );
}
