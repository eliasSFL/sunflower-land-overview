import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useMemo, type CSSProperties } from "react";

import type { PanelSheet } from "../hooks/usePanelArrangement.ts";
import { Button, ButtonPanel, SectionHeader } from "./ui/index.ts";

type Props = {
  sheet: PanelSheet;
};

// Module-level so dnd-kit's sensor/modifier inputs keep a stable identity
// across renders; inline option objects would make `useSensors` return a
// fresh array and re-seed the DndContext on every render.
const POINTER_OPTS = { activationConstraint: { distance: 5 } };
const TOUCH_OPTS = { activationConstraint: { delay: 120, tolerance: 6 } };
const KEYBOARD_OPTS = { coordinateGetter: sortableKeyboardCoordinates };
// Grid reorder moves cards in 2D, so (unlike the old vertical list) we
// don't restrict to the vertical axis — just keep the drag inside the grid.
const DND_MODIFIERS = [restrictToParentElement];

// Card sizing layered on top of the ButtonPanel chrome — a 2-up grid of
// these raised pixel tiles reads denser than the old full-width rows. The
// corner toggle mirrors the prototype's `.lay-card-toggle` square.
const CARD_STYLE: CSSProperties = {
  minHeight: 64,
  padding: "10px 6px 7px",
};
const TOGGLE_STYLE: CSSProperties = {
  width: 20,
  height: 20,
  background: "#f7e4c2",
  border: "2.1px solid #3e2731",
  borderRadius: 5,
  color: "#3e2731",
};

// The Layout sub-screen's panel arranger: a grid + Shown/Hidden split.
// Two labeled sections — "On your board" and "Hidden" — each a dense 2-up
// card grid, so ordering and visibility never share a gesture. Drag cards
// to reorder within the board (dnd-kit pointer/touch/keyboard); a card's
// corner arrow sends it to Hidden (down) or restores it (up). Reordering
// rewrites the persisted source order; the board re-flows its masonry
// columns from it, and a hidden panel drops its mobile jump-nav chip for
// free (NavMenu filters by DOM existence).
//
// Wrapped in React.memo and fed the stable `sheet` bundle, so a parent
// re-render can't churn the drag interactions. The clock is also frozen
// while Settings is open (see App), so the 1 Hz tick can't jank a drag.
export const LayoutPanelGrid = memo(function LayoutPanelGrid({ sheet }: Props) {
  const { items, reorderVisible, toggleHidden, reset } = sheet;

  // `items` is already stable across ticks (the hook keys it on content),
  // so a plain useMemo on its identity keeps the split lists and the
  // SortableContext `items` prop from churning.
  const { visible, hidden, visibleIds } = useMemo(() => {
    const visible = items.filter((i) => !i.hidden);
    const hidden = items.filter((i) => i.hidden);
    return { visible, hidden, visibleIds: visible.map((i) => i.id) };
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_OPTS),
    useSensor(TouchSensor, TOUCH_OPTS),
    useSensor(KeyboardSensor, KEYBOARD_OPTS),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = visibleIds.indexOf(String(active.id));
    const to = visibleIds.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    reorderVisible(arrayMove(visibleIds, from, to));
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs opacity-70">
        Drag to reorder. Hidden panels stay off your board until you restore
        them.
      </p>

      <SectionHeader
        right={<span className="text-xxs opacity-70">{visible.length}</span>}
      >
        On your board
      </SectionHeader>
      {visible.length === 0 ? (
        <p className="px-1 text-sm opacity-60">All panels are hidden.</p>
      ) : (
        <div className="scrollable max-h-[232px] overflow-y-auto pr-0.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={DND_MODIFIERS}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-1.5">
                {visible.map((item) => (
                  <SortableCard
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    onHide={toggleHidden}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <SectionHeader
        right={<span className="text-xxs opacity-70">{hidden.length}</span>}
      >
        Hidden
      </SectionHeader>
      {hidden.length === 0 ? (
        <span className="px-1 text-xs opacity-60">Nothing hidden.</span>
      ) : (
        <div className="scrollable max-h-[232px] overflow-y-auto pr-0.5">
          <div className="grid grid-cols-2 gap-1.5">
            {hidden.map((item) => (
              <HiddenCard
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                onShow={toggleHidden}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-0.5 flex items-center gap-2">
        <span className="flex-1 text-xs opacity-75">
          Drag cards to set the order
        </span>
        <Button className="w-auto px-4" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
});

const SortableCard = memo(function SortableCard({
  id,
  label,
  icon,
  onHide,
}: {
  id: string;
  label: string;
  icon: string;
  onHide: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    // Outer wrapper carries the sortable ref + drag transform; the inner
    // ButtonPanel provides the raised pixel-button chrome.
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <ButtonPanel
        className="flex flex-col items-center justify-center gap-1"
        style={CARD_STYLE}
      >
        <button
          type="button"
          aria-label={`Drag ${label} to reorder`}
          className="absolute left-1 top-[3px] flex cursor-grab touch-none opacity-60 hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <button
          type="button"
          onClick={() => onHide(id)}
          aria-label={`Hide ${label}`}
          title="Hide"
          className="absolute right-[3px] top-[2px] flex cursor-pointer items-center justify-center hover:brightness-95"
          style={TOGGLE_STYLE}
        >
          <ArrowIcon direction="down" />
        </button>
        <img
          src={icon}
          alt=""
          aria-hidden
          className="h-8 w-8 object-contain"
          style={{ imageRendering: "pixelated" }}
          draggable={false}
        />
        <span className="w-full truncate text-center text-xxs">{label}</span>
      </ButtonPanel>
    </div>
  );
});

const HiddenCard = memo(function HiddenCard({
  id,
  label,
  icon,
  onShow,
}: {
  id: string;
  label: string;
  icon: string;
  onShow: (id: string) => void;
}) {
  return (
    // Same card chrome, dimmed + grayscale to read as "off the board"; the
    // up-arrow corner button restores it. Hidden cards aren't sortable.
    <ButtonPanel
      className="flex flex-col items-center justify-center gap-1"
      style={{ ...CARD_STYLE, opacity: 0.62 }}
    >
      <button
        type="button"
        onClick={() => onShow(id)}
        aria-label={`Show ${label} on board`}
        title="Show on board"
        className="absolute right-[3px] top-[2px] flex cursor-pointer items-center justify-center hover:brightness-95"
        style={TOGGLE_STYLE}
      >
        <ArrowIcon direction="up" />
      </button>
      <img
        src={icon}
        alt=""
        aria-hidden
        className="h-8 w-8 object-contain grayscale"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
      <span className="w-full truncate text-center text-xxs">{label}</span>
    </ButtonPanel>
  );
});

// Self-contained glyphs so the grid adds no new sprite assets.
function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden
      fill="currentColor"
    >
      <circle cx="4" cy="3" r="1.4" />
      <circle cx="10" cy="3" r="1.4" />
      <circle cx="4" cy="7" r="1.4" />
      <circle cx="10" cy="7" r="1.4" />
      <circle cx="4" cy="11" r="1.4" />
      <circle cx="10" cy="11" r="1.4" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "down" ? (
        <path d="M12 5v14M19 12l-7 7-7-7" />
      ) : (
        <path d="M12 19V5M5 12l7-7 7 7" />
      )}
    </svg>
  );
}
