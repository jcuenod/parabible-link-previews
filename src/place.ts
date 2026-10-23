import { books } from "./books.ts";

/** The corpora, by the id links and the API use. */
export type CorpusId = "ot" | "nt" | "dc" | "af" | "philo" | "josephus";

export interface Book {
  id: number;
  abbrev: string;
  sbl: string;
  name: string;
  corpus: CorpusId;
}

const corpusIds: Record<string, CorpusId> = {
  OldTestament: "ot",
  NewTestament: "nt",
  Apocrypha: "dc",
  ApostolicFathers: "af",
  Philo: "philo",
  Josephus: "josephus",
};

const all: Book[] = books.map(([id, abbrev, sbl, name, corpus]) => ({ id, abbrev, sbl, name, corpus: corpusIds[corpus] }));
const byKey = new Map<string, Book>();
for (const b of all) for (const k of [b.abbrev, b.sbl, b.name]) if (!byKey.has(k.toUpperCase())) byKey.set(k.toUpperCase(), b);

/** A book by its abbreviation, SBL abbreviation, name or number, as the clients find one. */
export function findBook(token: string): Book | undefined {
  const t = token.trim().toUpperCase();
  return /^\d+$/.test(t) ? all.find((b) => b.id === Number(t)) : byKey.get(t);
}

/**
 * The numbering a link means when it names none, by corpus: the clients'
 * linkNumbering (lib/numbering.ts). The NET's chapters and verses are the
 * BSB's.
 */
export const linkNumbering: Record<CorpusId, string> = {
  ot: "bible.bsb",
  nt: "bible.bsb",
  dc: "bible.rahlfs_lxx",
  af: "af.grc",
  philo: "philo.grc",
  josephus: "josephus.whiston",
};

/** An English text of each corpus, for a preview's words when a link shows none. */
export const englishText: Record<CorpusId, string> = {
  ot: "bible.net",
  nt: "bible.net",
  dc: "bible.brenton",
  af: "af.cafe",
  philo: "philo.yonge",
  josephus: "josephus.whiston",
};

export interface Place {
  book: Book;
  chapter: string;
  verse?: string;
  through?: string;
}

const chapterWords: Record<string, string> = { pr: "prologue", "0": "prologue", ep: "epilogue" };

/** "03" -> "3", "Pr" -> "prologue", "5.3" part by part, as the clients' normalizeChapterId; undefined for nonsense. */
function chapterId(token: string): string | undefined {
  const parts = token.trim().toLowerCase().replace(/\.$/, "").split(".");
  const out = parts.map((p) => (/^\d+$/.test(p) ? (p === "0" ? chapterWords[p] : String(Number(p))) : chapterWords[p] ?? (/^[a-z]+$/.test(p) ? p : undefined)));
  return out.every(Boolean) ? out.join(".") : undefined;
}

/** The place a path names the way the clients write one: "/GEN/1", "/PSA/51/10", "/1SA/2/1-10", "/SIR/prologue/3". */
export function placeFromPath(pathname: string): Place | undefined {
  const parts = pathname.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  if (parts.length < 2 || parts.length > 3) return undefined;
  const book = findBook(parts[0]);
  const chapter = chapterId(parts[1]);
  if (!book || !chapter) return undefined;
  if (!parts[2]) return { book, chapter };
  const [verse, through] = parts[2].split("-");
  if (!/^\d+[a-z]?$/.test(verse)) return { book, chapter };
  return through && /^\d+[a-z]?$/.test(through) && parseInt(through) > parseInt(verse) ? { book, chapter, verse, through } : { book, chapter, verse };
}

const chapterLabel = (id: string) =>
  id
    .split(".")
    .map((p) => (/^\d+$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(".");

/** "Psalms 51:10", "1 Samuel 2:1–10", "Sirach Prologue", as the clients' passageLabel. */
export function placeLabel(p: Place): string {
  const head = `${p.book.name} ${chapterLabel(p.chapter)}`;
  if (!p.verse) return head;
  return `${head}:${p.verse}${p.through ? `–${p.through}` : ""}`;
}

/** A result's reference ("#JHN/3/16", the row's display_ref) as a place. */
export function placeFromRef(ref: string[]): Place | undefined {
  const [b, chapter, verse] = ref;
  const book = b ? findBook(b) : undefined;
  const c = chapter ? chapterId(chapter) : undefined;
  if (!book || !c) return undefined;
  return verse ? { book, chapter: c, verse } : { book, chapter: c };
}
