/*
 * The address of a link's card on the API: /v1/card/{spec}.png, its passage or
 * search said compactly in base64url, so the address is letters and digits
 * alone and short. WhatsApp shows no image for a long, percent-encoded one
 * (/v1/preview.png with the search's own parameters).
 *
 * The spec is `key=value` pairs joined by `&`, unescaped: a term's feature is
 * `N:name` (`0:lexeme=λόγος`), its partner's `Na:name` / `Nu:name`, and `N!`
 * inverts it; `s` scope, `r` range, `x` texts searched, `e` texts shown (a
 * Bible's without its `bible.`), `a` the result at the top, `h` the result
 * pointed at, `ref` a passage and `n` its numbering. What the server would
 * assume anyway is left out: the main texts, the reader's default columns, a
 * corpus's own numbering, the first result.
 */

/** The columns the server shows when a link names none: the reader's defaults. */
const defaultEditions = "bible.bhsa,bible.rahlfs_lxx,bible.sblgnt,bible.net";

export interface CardSpec {
  /** the link's own parameters for a search (`t.N.…`, `scope`, `range`, `texts`, `at`, `hit`) */
  search?: URLSearchParams;
  /** a passage as the API names it ("PSA 51:10"), and its numbering when not its corpus's own */
  ref?: string;
  numbering?: string;
  /** the texts the link shows */
  editions: string[];
}

function pairs(c: CardSpec): [string, string][] {
  const out: [string, string][] = [];
  if (c.search) {
    for (const [key, value] of c.search) {
      const m = /^t\.(\d{1,2})\.(.+)$/.exec(key);
      if (!m) continue;
      const [, n, rest] = m;
      if (rest === "inverted") value === "true" && out.push([`${n}!`, ""]);
      else if (rest.startsWith("features.")) out.push([`${n}:${rest.slice(9)}`, value]);
      else if (rest.startsWith("aligned.")) out.push([`${n}a:${rest.slice(8)}`, value]);
      else if (rest.startsWith("unaligned.")) out.push([`${n}u:${rest.slice(10)}`, value]);
    }
    out.push(["s", c.search.get("scope") ?? "clause"]);
    const range = c.search.get("range");
    if (range && range !== "all") out.push(["r", range]);
    const texts = c.search.get("texts");
    if (texts && texts !== "main") out.push(["x", texts]);
    const at = Number(c.search.get("at"));
    if (Number.isInteger(at) && at > 1) out.push(["a", String(at)]);
    const hit = c.search.get("hit");
    if (hit) out.push(["h", hit]);
  }
  if (c.ref) out.push(["ref", c.ref]);
  if (c.numbering) out.push(["n", c.numbering]);
  const shown = c.editions.slice(0, 10).join(",");
  if (shown && shown !== defaultEditions) out.push(["e", c.editions.slice(0, 10).map((e) => e.replace(/^bible\./, "")).join(",")]);
  return out;
}

const base64url = (text: string) => {
  let binary = "";
  for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** The card's address: `${api}/card/{spec}.png`. */
export function cardUrl(api: string, c: CardSpec): string {
  const spec = pairs(c)
    .map(([k, v]) => (v || k.endsWith("!") ? (k.endsWith("!") ? k : `${k}=${v}`) : ""))
    .filter(Boolean)
    .join("&");
  return `${api}/card/${base64url(spec)}.png`;
}
