import type { TimerCategory } from "./timers";

// Sunflower Land's public asset CDN. The same host the game uses for its
// "PROTECTED_IMAGE_URL". <img> requests aren't subject to CORS, so we can
// hotlink directly from the browser without a proxy.
const CDN = "https://sunflower-land.com/testnet-assets";

// Crops are served from the CDN under /crops/{slug}/crop.png. The slug is the
// lowercase name with one historical typo we have to honour ("Broccoli" →
// "brocolli") because that's the path that exists on the CDN.
const CROP_SLUGS: Record<string, string> = {
  Sunflower: "sunflower",
  Potato: "potato",
  Pumpkin: "pumpkin",
  Carrot: "carrot",
  Cabbage: "cabbage",
  Beetroot: "beetroot",
  Cauliflower: "cauliflower",
  Parsnip: "parsnip",
  Eggplant: "eggplant",
  Corn: "corn",
  Radish: "radish",
  Wheat: "wheat",
  Kale: "kale",
  Soybean: "soybean",
  Barley: "barley",
  Rhubarb: "rhubarb",
  Zucchini: "zucchini",
  Yam: "yam",
  Broccoli: "brocolli",
  Pepper: "pepper",
  Onion: "onion",
  Turnip: "turnip",
  Artichoke: "artichoke",
};

// Fruits are bundled locally because the CDN doesn't serve a single-icon
// path for them — only the in-game seed/tree art.
const FRUIT_FILES: Record<string, string> = {
  Tomato: "tomato.webp",
  Lemon: "lemon.webp",
  Blueberry: "blueberry.png",
  Orange: "orange.png",
  Apple: "apple.png",
  Banana: "banana.png",
};

const GREENHOUSE_FILES: Record<string, string> = {
  Rice: "rice.webp",
  Olive: "olive.webp",
  Grape: "grape.webp",
};

const RESOURCE_URLS: Record<string, string> = {
  Tree: `${CDN}/resources/tree.png`,
  Stone: `${CDN}/resources/stone.png`,
  Iron: `${CDN}/resources/iron_rock.png`,
  Gold: `${CDN}/resources/gold_rock.png`,
  Crimstone: "/icons/crimstone.png",
  Sunstone: "/icons/sunstone.png",
  "Oil Reserve": "/icons/oil.webp",
};

const ANIMAL_URLS: Record<string, string> = {
  Chicken: `${CDN}/animals/chickens/ready.webp`,
  Cow: `${CDN}/animals/cows/ready.webp`,
  Sheep: `${CDN}/animals/sheep/ready.webp`,
};

const MUSHROOM_URLS: Record<string, string> = {
  "Wild Mushroom": `${CDN}/resources/wild_mushroom.png`,
  "Magic Mushroom": `${CDN}/resources/magic_mushroom.png`,
};

/** Resolve an icon URL for a timer's (category, label). null = no icon. */
export function getIconUrl(
  category: TimerCategory,
  label: string,
): string | null {
  switch (category) {
    case "Crops": {
      const slug = CROP_SLUGS[label];
      return slug ? `${CDN}/crops/${slug}/crop.png` : null;
    }
    case "Fruit Patches": {
      const file = FRUIT_FILES[label];
      return file ? `/icons/fruit/${file}` : null;
    }
    case "Greenhouse": {
      const file = GREENHOUSE_FILES[label];
      return file ? `/icons/greenhouse/${file}` : null;
    }
    case "Resources":
      return RESOURCE_URLS[label] ?? null;
    case "Animals":
      return ANIMAL_URLS[label] ?? null;
    case "Mushrooms":
      return MUSHROOM_URLS[label] ?? null;
    case "Beehives":
      return "/icons/honey.png";
    case "Daily Rewards":
      return "/icons/chest.png";
    // Cooking, Composters, Aging Shed, Crafting, Lava Pits, Crab Traps,
    // Bounties — too many possible labels to map cleanly. No icon for now.
    default:
      return null;
  }
}
