// Catch-all Proxy stub for transitive game deps the overview never executes
// (xstate, react-spring, react-router, headlessui, i18next, lodash, web3-
// utils, mobile-device-detect, classnames, react-hot-toast). The game source
// imports these eagerly at module top-level; if we tried to install them as
// real deps the bundle would balloon and we'd inherit their CSS, polyfills,
// and runtime side-effects.
//
// Shape: every access returns the proxy itself, every call returns the proxy
// itself, and stringification returns "". That's enough for `lodash.get`,
// `classnames(a, b)`, `useTranslation().t("key")`, etc. all to short-circuit
// without throwing. web3-utils helpers in particular need "0" semantics for
// Decimal arithmetic; we coerce those via toString.

const TRUE_BOOLEANS = new Set([
  "isDesktop",
  "isMacOs",
  "isWindows",
  "isLinux",
  "isChrome",
  "isFirefox",
  "isSafari",
]);
const FALSE_BOOLEANS = new Set([
  "isMobile",
  "isMobileOnly",
  "isTablet",
  "isAndroid",
  "isIOS",
  "isWearable",
]);

// `stub` is recursively self-returning so chained access like
// `i18n.use(x).init({...})` resolves to the Proxy at every step. We assign
// `stub` after the Proxy is constructed so the handler closure can reference
// it (otherwise traps would return the bare target function). `let` is
// required: a `const` would be uninitialised when the handler is built.
// eslint-disable-next-line prefer-const
let stub: any;
const handler: ProxyHandler<any> = {
  get: (_target, prop) => {
    if (prop === Symbol.toPrimitive) return () => "";
    if (prop === "toString") return () => "";
    if (prop === "valueOf") return () => 0;
    if (typeof prop === "string") {
      if (TRUE_BOOLEANS.has(prop)) return true;
      if (FALSE_BOOLEANS.has(prop)) return false;
    }
    return stub;
  },
  apply: () => stub,
  construct: () => stub,
};
stub = new Proxy(function () {}, handler);

export default stub;
export const useTranslation = () => ({ t: (k: string) => k, i18n: stub });
export const Trans = (props: { children?: unknown }) => props.children ?? null;
// Many destructured imports — the Proxy handles unknown names too.
export const useSelector = stub;
export const useActor = stub;
export const useMachine = stub;
export const useInterpret = stub;
export const useSpring = stub;
export const useTrail = stub;
export const animated = stub;
export const config = stub;
export const Link = stub;
export const useNavigate = stub;
export const useLocation = stub;
export const useParams = stub;
export const BrowserRouter = stub;
export const Dialog = stub;
export const Transition = stub;
// react-i18next
export const initReactI18next = stub;
export const I18nextProvider = stub;
// web3-utils — these need numeric semantics for callers that wrap them in
// Decimal(). Returning "0" lets `new Decimal(fromWei(x))` succeed.
export const fromWei = (_v?: unknown) => "0";
export const toWei = (_v?: unknown) => "0";
export const toBN = (_v?: unknown) => "0";
export const isAddress = (_v?: unknown) => false;
// lodash named imports
export const groupBy = stub;
export const merge = stub;
export const get = stub;
export const set = stub;
export const debounce = stub;
export const throttle = stub;
export const isEqual = stub;
export const cloneDeep = stub;
export const pick = stub;
export const omit = stub;
// mobile-device-detect named flags
export const isMobile = false;
export const isMobileOnly = false;
export const isTablet = false;
export const isDesktop = true;
export const isAndroid = false;
export const isIOS = false;
// react-hot-toast
export const toast = stub;
export const Toaster = stub;
