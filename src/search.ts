import { findBook, type CorpusId } from "./place.ts";
import { valueLabels } from "./values.ts";

/*
 * A search link, as the clients write it (their lib/searchLink.ts): the API's
 * own term parameters (`t.N.features.lexeme=…`), `scope`, `range`, `texts`,
 * `at` and a `#BOOK/ch/v` fragment for one result.
 */

interface Partner {
  editions?: string[];
  attributes: [string, string][];
}

export interface Term {
  inverted: boolean;
  attributes: [string, string][];
  aligned?: Partner;
  unaligned?: Partner;
}

/** The terms a link's query names, in order; empty when it names none. */
export function readTerms(params: URLSearchParams): Term[] {
  const byIndex = new Map<number, Term>();
  for (const [key, value] of params) {
    const m = /^t\.(\d{1,2})\.(.+)$/.exec(key);
    if (!m) continue;
    const i = Number(m[1]);
    const term = byIndex.get(i) ?? { inverted: false, attributes: [] };
    byIndex.set(i, term);
    const rest = m[2];
    if (rest === "inverted") term.inverted = value === "true";
    else if (rest.startsWith("features.")) term.attributes.push([rest.slice(9), value]);
    else {
      const side = rest.startsWith("aligned.") ? "aligned" : rest.startsWith("unaligned.") ? "unaligned" : null;
      if (!side) continue;
      const k = rest.slice(side.length + 1);
      const spec: Partner = term[side] ?? { attributes: [] };
      if (k === "edition") spec.editions = value.split(",").filter(Boolean);
      else spec.attributes.push([k, value]);
      term[side] = spec;
    }
  }
  return [...byIndex.keys()]
    .sort((a, b) => a - b)
    .map((i) => byIndex.get(i) as Term)
    .filter((t) => t.attributes.length > 0 || (t.aligned?.attributes.length ?? 0) > 0 || (t.unaligned?.attributes.length ?? 0) > 0);
}

const lemmaKeys = new Set(["lexeme", "lexeme_normalized", "lexeme_base", "consonantal_root"]);
const ROMAN = ["", " II", " III", " IV", " V", " VI"];

/** A value as the clients label it: a lemma as spelt (ענה= as "ענה II"), an enumerated value by its label. */
function valueLabel(key: string, value: string): string {
  if (lemmaKeys.has(key)) {
    const marks = /=+$/.exec(value)?.[0] ?? "";
    return marks ? value.slice(0, -marks.length) + (ROMAN[marks.length] ?? ` ${marks.length + 1}`) : value;
  }
  if (key === "person") return { "1": "1st person", "2": "2nd person", "3": "3rd person" }[value] ?? value;
  if (key === "surface" || key === "rendering") return `“${value}”`;
  const label = valueLabels[key]?.[value];
  return label ? label.toLowerCase() : value;
}

/** A word's conditions in a few words: the lemma first, then the rest ("λέγω aorist indicative"). */
const attributes = (list: [string, string][]) =>
  [...list.filter(([k]) => lemmaKeys.has(k)), ...list.filter(([k]) => !lemmaKeys.has(k))].map(([k, v]) => valueLabel(k, v)).join(" ");

/** The terms, short enough for a title: "ἀγαπάω + κόσμος", "not θεός", "שׁמע aligned to ἀκούω". */
export function describeTerms(terms: Term[]): string {
  return terms
    .map((t) => {
      let s = attributes(t.attributes);
      if (t.aligned) s += ` aligned to ${attributes(t.aligned.attributes) || "a word"}`;
      if (t.unaligned) s += ` not aligned to ${attributes(t.unaligned.attributes) || "any word"}`;
      return t.inverted ? `not ${s}` : s;
    })
    .join(" + ");
}

const corpusNames: Record<CorpusId, string> = {
  ot: "the Old Testament",
  nt: "the New Testament",
  dc: "the Apocrypha",
  af: "the Apostolic Fathers",
  philo: "Philo",
  josephus: "Josephus",
};

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Where a link searches, in words: "the New Testament", "the Old and New Testaments", "Genesis 3", "every text". */
export function rangeLabel(range: string | null): string {
  if (!range || range === "all") return "every text";
  const tokens = range.split(",").map((s) => s.trim()).filter(Boolean);
  const corpora = tokens.filter((t): t is CorpusId => t in corpusNames);
  const both = corpora.includes("ot") && corpora.includes("nt");
  const names = [
    ...(both ? ["the Old and New Testaments"] : []),
    ...corpora.filter((c) => !both || (c !== "ot" && c !== "nt")).map((c) => corpusNames[c]),
    ...tokens
      .filter((t) => !(t in corpusNames))
      .map((t) => {
        const [b, chapter] = t.split(/\s+/);
        const book = findBook(b);
        return book ? (chapter ? `${book.name} ${chapter}` : book.name) : undefined;
      })
      .filter((s): s is string => !!s),
  ];
  return names.length > 4 ? `${names.length} books and corpora` : list(names) || "every text";
}

/** What a search counts, by its scope: "verses", "clauses". */
export function unitWord(scope: string | null, n: number): string {
  const unit = { phrase: "phrase", clause: "clause", sentence: "sentence", verse: "verse", parallel: "parallel passage" }[scope ?? "clause"] ?? "clause";
  return n === 1 ? unit : unit === "phrase" ? "phrases" : unit === "parallel passage" ? "parallel passages" : `${unit}s`;
}

/** The main text of each corpus, as the clients' mainTexts: what `texts=main` searches. */
const mainTexts = ["bible.bhsa", "bible.rahlfs_lxx", "bible.sblgnt", "af.grc", "philo.grc", "josephus.grc"];

/** The API's `searchEditions` for a link's `texts`: "all", or the texts named, the main ones among them. */
export function searchEditions(texts: string | null): string {
  if (texts === "all") return "all";
  const tokens = (texts ?? "main").split(",").map((s) => s.trim()).filter(Boolean);
  const named = tokens.filter((t) => t !== "main");
  const list = tokens.includes("main") || tokens.length === 0 ? [...mainTexts, ...named] : named;
  return [...new Set(list)].slice(0, 10).join(",");
}
