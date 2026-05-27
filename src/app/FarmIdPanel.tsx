import { FarmIdForm } from "../components/FarmIdForm.tsx";
import { InnerPanel } from "../components/ui/index.ts";

// The pre-data state shown when the player hasn't entered a Farm ID
// yet — or when the access cohort gate rejected the last attempt.
// Rendered by App.tsx in place of the route tree until a farm loads,
// since the two-tab structure (/timers and /info) has nothing to
// show without farm data.
export function FarmIdPanel({
  farmId,
  accessDenied,
  error,
  loading,
  onSubmit,
}: {
  farmId: string;
  accessDenied: boolean;
  error: string | undefined;
  loading: boolean;
  onSubmit: (id: string) => Promise<void>;
}) {
  return (
    <InnerPanel className="flex flex-col gap-3">
      {accessDenied ? (
        <p className="text-sm">
          Your farm isn't on the access list yet. We're rolling this out to a
          small group of players first — please check back later.
        </p>
      ) : (
        <p className="text-sm">
          Enter your Farm ID to see live timers. Your ID is the number next to
          your name in the main game.
        </p>
      )}
      <FarmIdForm
        initialFarmId={farmId}
        onSubmit={onSubmit}
        loading={loading}
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </InnerPanel>
  );
}
