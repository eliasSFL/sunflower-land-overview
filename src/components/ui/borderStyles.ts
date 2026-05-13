import type { CSSProperties } from "react";

// Pixel-art panel chrome from the SFL CDN. The submodule's `SUNNYSIDE.ui.*`
// resolves to these same URLs at runtime; we hardcode here so the
// border-image set we ship stays decoupled from upstream renames.
const CDN = import.meta.env.VITE_PRIVATE_IMAGE_URL;

const pixelizedBorderStyle: CSSProperties = {
  borderStyle: "solid",
  borderWidth: "5.25px",
  imageRendering: "pixelated",
  borderImageRepeat: "stretch",
  borderRadius: "13.125px",
};

export const pixelLightBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/light_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const pixelDarkBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/dark_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const pixelGrayBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/gray_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const pixelOrangeBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/orange_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const pixelRedBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/danger_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const pixelBlueBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/blue_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const pixelGreenBorderStyle: CSSProperties = {
  borderImage: `url(${CDN}/ui/panel/green_border.png) 20%`,
  ...pixelizedBorderStyle,
};

export const PRIMARY_BUTTON_URL = `${CDN}/ui/light_button.png`;
export const PRIMARY_BUTTON_PRESSED_URL = `${CDN}/ui/light_button_pressed.png`;
