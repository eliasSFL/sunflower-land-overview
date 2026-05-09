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

// Iron and Gold are bundled locally because the in-game inventory icon is
// the locally-imported `iron_ore.png` / `gold_ore.png` — the CDN's
// `iron_rock.png` / `gold_rock.png` are the big mineable rock sprites, not
// the drop icons.
const RESOURCE_URLS: Record<string, string> = {
  Tree: `${CDN}/resources/tree.png`,
  Stone: `${CDN}/resources/stone.png`,
  Iron: "/icons/iron.png",
  Gold: "/icons/gold.png",
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

// Cooking foods produced by Fire Pit / Kitchen / Bakery / Deli /
// Smoothie Shack — bundled from sunflower-land/src/assets/food/.
const COOKING_FILES: Record<string, string> = {
  // Fire Pit
  "Mashed Potato": "mashed_potato.png",
  "Pumpkin Soup": "pumpkin_soup.png",
  "Reindeer Carrot": "reindeer_carrot.png",
  "Mushroom Soup": "mushroom_soup.png",
  "Boiled Eggs": "boiled_eggs.png",
  "Kale Stew": "kale_stew.png",
  "Bumpkin Broth": "bumpkin_broth.png",
  "Popcorn: ": "popcorn.png",
  Popcorn: "popcorn.png",
  Gumbo: "gumbo.png",
  // Kitchen
  "Roast Veggies": "roast_veggies.png",
  "Bumpkin Salad": "bumpkin_salad.png",
  "Cauliflower Burger": "cauliflower_burger.png",
  "Pancakes: ": "pancakes.png",
  Pancakes: "pancakes.png",
  "Club Sandwich": "club_sandwich.png",
  "Mushroom Jacket Potatoes": "mushroom_jacket_potato.png",
  "Sunflower Crunch": "sunflower_crunch.png",
  "Goblin's Treat": "goblins_treat.png",
  "Chowder: ": "chowder.png",
  Chowder: "chowder.png",
  "Fermented Carrots": "fermented_carrots.png",
  Sauerkraut: "sauerkraut.png",
  "Fancy Fries": "fancy_fries.png",
  "Bumpkin ganoush": "bumpkin_ganoush.png",
  "Bumpkin Ganoush": "bumpkin_ganoush.png",
  "Cabbers n Mash": "cabbers_n_mash.png",
  "Tofu Scramble": "tofu_scramble.png",
  "Fried Tofu": "fried_tofu.png",
  "Antipasto: ": "antipasto.webp",
  Antipasto: "antipasto.webp",
  "Caprese Salad": "caprese_salad.webp",
  "Spaghetti al Limone": "spaghetti_al_limone2.webp",
  Caponata: "caponata.webp",
  "Glazed Carrots": "glazed_carrots.webp",
  // Bakery
  "Apple Pie": "apple_pie.png",
  "Kale & Mushroom Pie": "mushroom_kale_pie.png",
  "Mushroom Kale Pie": "mushroom_kale_pie.png",
  "Cornbread: ": "corn_bread.png",
  Cornbread: "corn_bread.png",
  "Sunflower Cake": "cakes/sunflower_cake.png",
  "Potato Cake": "cakes/potato_cake.png",
  "Pumpkin Cake": "cakes/pumpkin_cake.png",
  "Carrot Cake": "cakes/carrot_cake.png",
  "Cabbage Cake": "cakes/cabbage_cake.png",
  "Beetroot Cake": "cakes/beetroot_cake.png",
  "Cauliflower Cake": "cakes/cauliflower_cake.png",
  "Parsnip Cake": "cakes/parsnip_cake.png",
  "Radish Cake": "cakes/radish_cake.png",
  "Wheat Cake": "cakes/wheat_cake.png",
  "Eggplant Cake": "cakes/eggplant_cake.png",
  "Honey Cake": "cakes/honey_cake.png",
  "Orange Cake": "cakes/orange_cake.png",
  "Rhubarb Tart": "rhubarb_tart.webp",
  "Lemon Cheesecake": "lemon_cheesecake.webp",
  "Pizza Margherita": "pizza_marguerita.webp",
  "Rice Bun": "rice_bun.webp",
  "Red Rice": "red_rice.webp",
  // Deli
  Cheese: "cheese.webp",
  "Blue Cheese": "blue_cheese.webp",
  "Honey Cheddar": "honey_chedder.webp",
  "Honey Treat": "honey_treat.webp",
  "Salt Lick": "salt_lick.webp",
  "Roasted Cauliflower": "roasted_cauliflower.png",
  "Radish Pie": "radish_pie.png",
  "Kale Omelette": "kale_omelette.png",
  "Bumpkin Roast": "bumpkin_roast.png",
  "Goblin Brunch": "goblin_brunch.png",
  "Fruit Salad": "fruit_salad.png",
  "Carrot Sandwich": "carrot_sandwich.png",
  "Blueberry Jam": "blueberry_jam.png",
  "Fermented Fish": "fermented_fish.png",
  "Fish Burger": "fish_burger.webp",
  "Fish Omelette": "fish_omelette.webp",
  "Fish n Chips": "fish_and_chips.webp",
  "Fish & Chips": "fish_and_chips.webp",
  "Fried Calamari": "fried_calamari.webp",
  "Sushi Roll": "sushi_roll.webp",
  "Seafood Basket": "seafood_basket.webp",
  Paella: "paella.webp",
  "Chicken Drumstick": "chicken_drumstick.png",
  "The Lot": "the_lot.webp",
  "Ocean's Olive": "oceans_olive.webp",
  // Smoothie Shack
  "Apple Juice": "apple_juice.png",
  "Orange Juice": "orange_juice.png",
  "Carrot Juice": "carrot_juice.webp",
  "Grape Juice": "grape_juice.webp",
  "Quick Juice": "quick_juice.webp",
  "Slow Juice": "slow_juice.webp",
  "Sour Shake": "sour_shake.webp",
  "Power Smoothie": "power_smoothie.png",
  "Bumpkin Detox": "bumpkin_detox.png",
  "Banana Blast": "banana_blast.png",
  "Beetroot Blaze": "beetroot_blaze.png",
  "Purple Smoothie": "purple_smoothie.png",
  "Shroom Syrup": "shroom_syrup.png",
  "Rapid Roast": "rapid_roast.png",
  "Trade Cake": "trade_cake.webp",
};

// Aging Shed recipes — fermentation, aging rack (cheese/fish), spice rack.
const AGING_FILES: Record<string, string> = {
  // Aging rack — cheese
  Cheese: "/icons/food/cheese.webp",
  "Blue Cheese": "/icons/food/blue_cheese.webp",
  "Honey Cheddar": "/icons/food/honey_chedder.webp",
  // Spice rack
  "Spice Base": "/icons/food/spice_base.webp",
  "Refined Salt": "/icons/aging/refined_salt.webp",
  "Sproutroot Surprise": "/icons/aging/sproutroot_surprise.webp",
  "Turbofruit Mix": "/icons/aging/turbofruit_mix.webp",
  "Greenhouse Goodie": "/icons/aging/greenhouse_goodie.webp",
  // Direct pickled labels (just in case the API returns them un-prefixed)
  "Pickled Pepper": "/icons/pickled/pickled_pepper.webp",
  "Pickled Radish": "/icons/pickled/pickled_radish.webp",
  "Pickled Onion": "/icons/pickled/pickled_onion.webp",
  "Pickled Cabbage": "/icons/pickled/pickled_cabbage.webp",
  "Pickled Tomato": "/icons/pickled/pickled_tomato.webp",
  "Pickled Zucchini": "/icons/pickled/pickled_zucchini.webp",
  "Pickled Broccoli": "/icons/pickled/pickled_broccoli.webp",
  // Processed fish
  "Fish Flake": "/icons/processed/fish_flake.webp",
  "Fish Stick": "/icons/processed/fish_stick.webp",
  "Fish Oil": "/icons/processed/fish_oil.webp",
  "Crab Stick": "/icons/processed/crab_stick.webp",
  "Creamy Crab Bite": "/icons/processed/creamy_crab_bite.webp",
  "Furikake Sprinkle": "/icons/processed/furikake_sprinkle.webp",
  "Surimi Rice Bowl": "/icons/processed/surimi_rice_bowl.webp",
  "Crimstone Infused Fish Oil":
    "/icons/processed/crimstone_infused_fish_oil.webp",
  "Fermented Carrots": "/icons/food/fermented_carrots.png",
  "Fermented Fish": "/icons/food/fermented_fish.png",
  Sauerkraut: "/icons/food/sauerkraut.png",
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
    case "Cooking": {
      const file = COOKING_FILES[label];
      return file ? `/icons/food/${file}` : null;
    }
    case "Aging Shed":
      // "Greenhouse Goodie: Pickled X" variants all share one umbrella icon
      // in-game — match the prefix so we don't have to enumerate every
      // pickled crop variant.
      if (label.startsWith("Greenhouse Goodie")) {
        return "/icons/aging/greenhouse_goodie.webp";
      }
      return AGING_FILES[label] ?? null;
    // Composters, Crafting, Lava Pits, Crab Traps, Bounties —
    // no icon for now.
    default:
      return null;
  }
}
