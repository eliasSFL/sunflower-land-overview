// Re-exports of pixel-art chrome components from the sunflower-land
// submodule. These are the props-only components that don't depend on the
// game's xstate machine. Imports are explicit so an upstream rename fails
// here, not at every callsite.

export {
  Panel,
  OuterPanel,
  InnerPanel,
  ButtonPanel,
} from "components/ui/Panel";
export { Button } from "components/ui/Button";
export { Label, LABEL_STYLES } from "components/ui/Label";
