// Vite resolves raw image/audio file imports inside the merged sunflower-
// land tree to this module — TS files under assets/ (like sunnyside.ts)
// pass through to the real submodule via the bare-`assets/*` alias.
//
// Real Vite image imports return a URL string. We mirror that with an
// empty string, which template-literally interpolates to `url() 20%`
// (broken URL, no crash). Components that depend on a real image (e.g.
// halloween borders, button textures) will silently render without art —
// the chrome that uses CDN URLs via `SUNNYSIDE.ui.*` still renders fine.

export default "";
