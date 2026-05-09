// Permissive Proxy stub for external packages the game pulls in transitively
// (web3-utils, classnames, @xstate/react, @react-spring/web, @headlessui/react,
// react-router, mobile-device-detect, react-i18next, etc.) — none of which
// the yield calculation paths actually execute at runtime, but their files
// load top-level imports.
//
// The Proxy answers any property read with a callable no-op proxy that
// returns "" or another proxy on call/access. This covers default imports,
// named imports, function calls, and chained property access.

const handler: ProxyHandler<(...args: unknown[]) => unknown> = {
  get: (_t, prop) => {
    if (prop === "__esModule") return true;
    if (prop === Symbol.toPrimitive) return () => "";
    if (prop === "then") return undefined; // not a thenable
    return makeProxy();
  },
  // Returning another proxy keeps fluent chains alive — `i18n.use(...).init(...)`
  // and similar builder-style calls in the game's bootstrap files would
  // otherwise blow up trying to call `.init()` on the empty string.
  apply: () => makeProxy(),
};

function makeProxy(): (...args: unknown[]) => unknown {
  // The base is a callable so `import x from "y"; x(...)` works even when
  // the consumer uses the default as a function.
  return new Proxy(function noop() {}, handler);
}

const stub = makeProxy();

export default stub;

// Common named exports that some game files destructure at parse time. They
// all point at the same proxy, which behaves like both a value and a function.
//
// Exception: web3-utils helpers must return string-coercible values because
// the game wraps them in `new Decimal(fromWei("0"))` and Decimal validates
// its input. A bare proxy fails that validation.
export const fromWei: (...args: unknown[]) => string = () => "0";
export const toWei: (...args: unknown[]) => string = () => "0";
export const BN: (...args: unknown[]) => string = () => "0";
export const isAddress = stub;
export const useSelector = stub;
export const useActor = stub;
export const useInterpret = stub;
export const useMachine = stub;
export const Dialog = stub;
export const Transition = stub;
export const animated = stub;
export const useSpring = stub;
export const useTransition = stub;
export const useTrail = stub;
export const useChain = stub;
export const config = stub;
export const Link = stub;
export const useNavigate = stub;
export const useLocation = stub;
export const useParams = stub;
export const Outlet = stub;
export const Routes = stub;
export const Route = stub;
export const BrowserRouter = stub;
export const useTranslation = stub;
export const Trans = stub;
export const I18nextProvider = stub;
export const isMobile = false;
export const isTablet = false;
export const isDesktop = true;
export const isIOS = false;
export const isAndroid = false;
export const browserName = "";
export const osName = "";
export const initReactI18next = stub;
export const Toaster = stub;
export const toast = stub;
export const Decimal = stub;
export const cloneDeep = stub;
export const isEqual = stub;
export const debounce = stub;
export const throttle = stub;
export const groupBy = stub;
export const merge = stub;
export const get = stub;
export const set = stub;
