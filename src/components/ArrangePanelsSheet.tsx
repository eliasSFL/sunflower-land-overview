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
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useMemo } from "react";

import type { PanelSheet } from "../hooks/usePanelArrangement.ts";
import { Button, ButtonPanel, Modal } from "./ui/index.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  sheet: PanelSheet;
};

// Module-level so dnd-kit's sensor/modifier inputs keep a stable identity
// across renders. Inline option objects would be rebuilt each render, which
// makes `useSensors` return a fresh array and re-seeds the DndContext.
const POINTER_OPTS = { activationConstraint: { distance: 5 } };
const TOUCH_OPTS = { activationConstraint: { delay: 120, tolerance: 6 } };
const KEYBOARD_OPTS = { coordinateGetter: sortableKeyboardCoordinates };
const DND_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];

// "Arrange panels" dialog for the current page. A drag-to-reorder list of
// the visible panels (dnd-kit vertical sortable — pointer, touch and
// keyboard) sits above a tray of hidden panels you can restore. Reordering
// here rewrites the persisted source order; the board re-flows its masonry
// columns from it. Hidden panels stop rendering, which also removes their
// mobile jump-nav chip for free (NavMenu filters by DOM existence).
//
// Wrapped in React.memo: it's fed the stable `sheet` bundle (not the whole
// arrangement), so the app's 1 Hz `now` tick — which drives live countdown
// numbers — never re-renders this dialog. Without that, even scrolling the
// list would hitch once a second.
export const ArrangePanelsSheet = memo(function ArrangePanelsSheet({
  open,
  onClose,
  title,
  sheet,
}: Props) {
  const { items, reorderVisible, toggleHidden, reset } = sheet;

  // `items` is already stable across ticks (the hook keys it on content),
  // so a plain useMemo on its identity is enough to keep the split lists
  // and SortableContext's `items` prop from churning.
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
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-xs opacity-70">
        Drag to reorder. Hidden panels stay off your board until you restore
        them.
      </p>

      {visible.length === 0 ? (
        <p className="py-2 text-sm opacity-70">All panels are hidden.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={DND_MODIFIERS}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleIds}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto scrollable pr-1">
              {visible.map((item) => (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  onToggle={toggleHidden}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {hidden.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold opacity-70">Hidden</span>
          <ul className="flex max-h-[25vh] flex-col gap-1 overflow-y-auto pr-1">
            {hidden.map((item) => (
              <HiddenRow
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                onToggle={toggleHidden}
              />
            ))}
          </ul>
        </div>
      )}

      <Button onClick={reset}>Reset to default</Button>
    </Modal>
  );
});

const SortableRow = memo(function SortableRow({
  id,
  label,
  icon,
  onToggle,
}: {
  id: string;
  label: string;
  icon: string;
  onToggle: (id: string) => void;
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
    // The <li> carries the sortable ref + drag transform (ButtonPanel
    // doesn't forward refs); the ButtonPanel inside provides the pixel
    // button chrome so each row reads as a draggable card.
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <ButtonPanel className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${label} to reorder`}
          className="cursor-grab touch-none p-1 opacity-60 hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <img
          src={icon}
          alt=""
          aria-hidden
          className="h-5 w-5 shrink-0 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="flex-1 truncate text-sm">{label}</span>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-label={`Hide ${label}`}
          title="Hide"
          className="cursor-pointer p-1 opacity-60 hover:opacity-100"
        >
          <EyeIcon hidden={false} />
        </button>
      </ButtonPanel>
    </li>
  );
});

const HiddenRow = memo(function HiddenRow({
  id,
  label,
  icon,
  onToggle,
}: {
  id: string;
  label: string;
  icon: string;
  onToggle: (id: string) => void;
}) {
  return (
    // Same ButtonPanel chrome as the active rows; dimmed + grayscale icon
    // signals "hidden" without a drag handle (hidden rows aren't sortable).
    <li>
      <ButtonPanel className="flex items-center gap-2 opacity-70">
        <span className="w-7" />
        <img
          src={icon}
          alt=""
          aria-hidden
          className="h-5 w-5 shrink-0 object-contain grayscale"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="flex-1 truncate text-sm">{label}</span>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-label={`Show ${label}`}
          title="Show"
          className="cursor-pointer p-1 opacity-80 hover:opacity-100"
        >
          <EyeIcon hidden />
        </button>
      </ButtonPanel>
    </li>
  );
});

// Self-contained glyphs so the sheet adds no new sprite assets. Sized to
// match the 20px panel/nav icons around them.
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

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}
