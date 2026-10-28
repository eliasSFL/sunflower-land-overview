// English-only replacement for the submodule's `lib/i18n/translate`.
//
// Upstream's helper calls `i18n.t(key, options)`, but i18next is aliased to
// the Proxy stub in this build (see external-stub.ts), so every translated
// string — buff labels in particular (COLLECTIBLE_BUFF_LABELS,
// BUMPKIN_ITEM_BUFF_LABELS) — came back as the Proxy and rendered blank.
// The overview is English-only, so we skip i18next entirely and read the
// same English dictionary upstream feeds i18next as its `en` resource.
//
// Interpolation: the dictionary only uses plain `{{name}}` placeholders (no
// format suffixes, plurals or `$t()` nesting), which is all this handles. A
// missing key falls back to the key itself, matching i18next.
//
// Synchronous on purpose: BUMPKIN_ITEM_BUFF_LABELS calls `translate` at
// module load, so a lazily-loaded dictionary would freeze those labels empty.
// The Worker build aliases all of `lib/i18n` to the Proxy stub instead
// (vite.worker.config.ts) — it never renders text.

import ENGLISH_TERMS from "lib/i18n/dictionaries/dictionary.json";

const TERMS: Record<string, string> = ENGLISH_TERMS;

export const translate = (
  key: string,
  options: Record<string, unknown> = {},
): string => {
  const template = TERMS[key] ?? key;
  return template.replace(/{{\s*(\w+)\s*}}/g, (match, name: string) =>
    name in options ? String(options[name]) : match,
  );
};
