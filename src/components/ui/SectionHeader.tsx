// Pixel-art section divider: an uppercase tracked-out label on the
// left, a thin horizontal rule filling the rest of the row. Used in
// SettingsModal to separate FARM / NOTIFICATIONS / WHEN OPENED.
type Props = {
  children: React.ReactNode;
};

export function SectionHeader({ children }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider">{children}</span>
      <div className="h-px flex-1 bg-[#3e2731]/40" />
    </div>
  );
}
