import { useEffect, useState } from "react";

// Pings /api/admin/me to learn whether the current device holds a valid
// Cloudflare Access session for the configured ADMIN_EMAIL. Used by the
// main dashboard to decide whether to render the admin-launcher button —
// the button stays hidden until the user has logged in via Access on this
// browser at least once (which sets the CF_Authorization cookie).
export type AdminState =
  | { status: "loading" }
  | { status: "admin"; email: string }
  | { status: "anonymous" };

export function useIsAdmin(): AdminState {
  // `vite dev` runs the SPA without the Worker, so /api/admin/me would
  // 404. Short-circuit to "admin" in DEV so the dashboard is reachable
  // for UI iteration. `wrangler dev` (which builds the SPA with
  // import.meta.env.DEV=false) goes through the real fetch and hits the
  // localhost bypass in worker/admin.ts.
  const [state, setState] = useState<AdminState>(
    import.meta.env.DEV
      ? { status: "admin", email: "dev@localhost" }
      : { status: "loading" },
  );

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    fetch("/api/admin/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: { admin: boolean; email?: string }) => {
        if (cancelled) return;
        if (body.admin && body.email) {
          setState({ status: "admin", email: body.email });
        } else {
          setState({ status: "anonymous" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
