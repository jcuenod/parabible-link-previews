import { englishText, linkNumbering, placeFromPath, placeFromRef, placeLabel, type Place } from "./place.ts";
import { describeTerms, rangeLabel, readTerms, searchEditions, unitWord } from "./search.ts";
import { cardUrl } from "./card.ts";

export interface Preview {
  /** og:title: the place, or what was searched */
  title: string;
  /** og:description: the passage's words, or what the search found */
  description?: string;
  /** og:image: the API's card for this passage or search (/v1/card/{spec}.png) */
  image?: string;
}

export interface DescribeOptions {
  /** the API's base, e.g. https://api.parabible.com/v1 */
  api?: string;
  /** the fetch to call it with (tests pass their own) */
  fetch?: typeof fetch;
  /** how long to wait on the API before giving up on a preview, in milliseconds */
  timeout?: number;
}

interface Unit {
  edition: string;
  type: string;
  display_ref: string[];
  content_html?: string;
  content_json?: { txt: string; tr?: string }[];
}
interface Edition {
  slug: string;
  shortname: string;
  language: string;
  corpora?: string[];
}

const MAX = 200;

/** A passage's words as plain text, at most MAX characters, cut at a word. */
function clip(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX) return t;
  const cut = t.slice(0, MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), MAX - 30)).replace(/[\s,;:.]+$/, "")}…`;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
function plain(u: Unit): string {
  if (u.content_json) return u.content_json.map((w) => `${w.txt}${w.tr ?? ""}`).join("");
  return (u.content_html ?? "")
    // Notes and their callers are not the passage's words.
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    // A poetic line's break, or a paragraph's, is a space between its words.
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => entities[e] ?? (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : m));
}

/**
 * The preview a link should unfurl as, or null when it is not a page of its
 * own (the home page, a path the clients would not read): the static tags
 * then stand. Null too when the API cannot answer in time.
 */
export async function describe(url: URL, opts: DescribeOptions = {}): Promise<Preview | null> {
  const api = opts.api ?? "https://api.parabible.com/v1";
  const get = async <T>(path: string, params: Record<string, string>, ttl: number): Promise<T> => {
    const res = await (opts.fetch ?? fetch)(`${api}${path}?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(opts.timeout ?? 2500),
      // The API's CDN turns away clients that do not say they are a browser; a Worker's requests say nothing.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; parabible-link-previews; +https://parabible.com)" },
      // Kept at the edge: a link is unfurled by several apps, often at once.
      cf: { cacheTtl: ttl, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  };
  const params = url.searchParams;
  const place = placeFromPath(url.pathname);
  const terms = readTerms(params);
  if (!place && terms.length === 0) return null;

  let catalogue: Edition[] | undefined;
  const editions = async () => (catalogue ??= ((await get<{ editions?: Edition[] } | Edition[]>("/editions", {}, 86400)) as { editions?: Edition[] }).editions ?? []);
  const linked = (params.get("editions") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const base = params.get("base")?.trim() || undefined;

  /** A place's words in English: in the link's own English text if it shows one, else the corpus's. */
  const words = async (p: Place, numbering: string): Promise<{ text: string; edition: string } | undefined> => {
    const known = await editions();
    const english = linked.find((s) => known.some((e) => e.slug === s && e.language === "eng" && e.corpora?.includes(p.book.corpus))) ?? englishText[p.book.corpus];
    const rows = (await get<{ rows: Unit[][] }>("/text", { editions: [...new Set([english, numbering])].join(","), ref: `${p.book.abbrev} ${p.chapter}`, scheme: numbering }, 86400)).rows;
    // The rows that hold the verses named, found by the numbering they are named in.
    const n = (v: string) => parseInt(v, 10);
    const named = (row: Unit[]) =>
      !p.verse ||
      row.some((u) => {
        if (u.edition !== numbering || u.type !== "verse") return false;
        const v = n(u.display_ref[u.display_ref.length - 1] ?? "");
        return u.display_ref[u.display_ref.length - 2] === p.chapter && v >= n(p.verse!) && v <= n(p.through ?? p.verse!);
      });
    const text = rows
      .filter(named)
      .flatMap((row) => row.filter((u) => u.edition === english && u.type === "verse").map(plain))
      .join(" ");
    const name = known.find((e) => e.slug === english)?.shortname ?? english;
    return text.trim() ? { text: clip(text), edition: name } : undefined;
  };
  // A link names the numbering its place is in, or its texts' base does (an older link), or it is the corpus's own.
  const numberingOf = (p: Place) => params.get("numbering") ?? base ?? linkNumbering[p.book.corpus];

  try {
    if (terms.length > 0) {
      const what = describeTerms(terms);
      const where = rangeLabel(params.get("range"));
      const scope = params.get("scope");
      const search: Record<string, string> = Object.fromEntries([...params].filter(([k]) => k.startsWith("t.")));
      const counted = await get<{ total_results: number }>(
        "/search",
        {
          ...search,
          editions: (linked.length > 0 ? linked.slice(0, 10) : ["bible.net"]).join(","),
          scope: scope ?? "clause",
          ...(params.get("range") && params.get("range") !== "all" ? { range: params.get("range")! } : {}),
          searchEditions: searchEditions(params.get("texts")),
          pageSize: "1",
          page: "0",
        },
        3600,
      );
      const n = counted.total_results;
      // The card: the API draws it from the same search, in the texts the link shows.
      const image = cardUrl(api, { search: params, editions: linked });
      const found = `${n.toLocaleString("en-US")} ${unitWord(scope, n)} in ${where} with ${what}.`;
      // A link to one result: that result, and what it is one of.
      // (`hit`; a link's fragment never reaches a server, so an older link with one previews as the whole search.)
      const ref = (params.get("hit") ?? "").split("/").filter(Boolean).map((s) => decodeURIComponent(s));
      const marked = ref.length >= 2 ? placeFromRef(ref) : undefined;
      if (marked) {
        const w = await words(marked, base ?? linkNumbering[marked.book.corpus]).catch(() => undefined);
        return {
          title: `${placeLabel(marked)} — ${what}`,
          description: w ? `“${w.text}” (${w.edition}) One of ${found.charAt(0).toLowerCase()}${found.slice(1)}` : `One of ${found.charAt(0).toLowerCase()}${found.slice(1)}`,
          image,
        };
      }
      return { title: `${what} — search`, description: found.charAt(0).toUpperCase() + found.slice(1), image };
    }
    const p = place!;
    const numbering = numberingOf(p);
    const known = await editions();
    // A place written in another numbering than the corpus's own says so: LXX Psalm 50 is not the English Psalm 50.
    const note = numbering !== linkNumbering[p.book.corpus] ? ` (${known.find((e) => e.slug === numbering)?.shortname ?? numbering} numbering)` : "";
    const w = await words(p, numbering);
    const verses = p.verse ? `:${p.verse}${p.through ? `-${p.through}` : ""}` : "";
    const image = cardUrl(api, {
      ref: `${p.book.abbrev} ${p.chapter}${verses}`,
      numbering: numbering !== linkNumbering[p.book.corpus] ? numbering : undefined,
      editions: linked,
    });
    return { title: `${placeLabel(p)}${note}`, description: w ? `“${w.text}” (${w.edition})` : undefined, image };
  } catch {
    return null;
  }
}
