import assert from "node:assert/strict";
import { test } from "node:test";
import { describe } from "../src/describe.ts";
import { isPreviewBot } from "../src/index.ts";
import { cardUrl } from "../src/card.ts";

// Against the live API, as the Worker will be, with the User-Agent the Worker sends.
const preview = (link: string) => describe(new URL(link, "https://new.parabible.com"), { timeout: 15000 });

test("a verse: its place, and its words in English", async () => {
  const p = await preview("/PSA/51/10");
  assert.equal(p?.title, "Psalms 51:10");
  assert.match(p!.description!, /^“Create for me a pure heart, O God! Renew a resolute spirit within me!” \(NET\)$/);
});

test("a range and a chapter", async () => {
  assert.equal((await preview("/1SA/2/1-2"))?.title, "1 Samuel 2:1–2");
  const ch = await preview("/JHN/1");
  assert.equal(ch?.title, "John 1");
  assert.ok(ch!.description!.length <= 220);
  assert.match(ch!.description!, /^“In the beginning was the Word/);
});

test("a place in the Septuagint's numbering is named so, and read in it", async () => {
  const p = await preview("/PSA/50/12?numbering=bible.rahlfs_lxx");
  assert.equal(p?.title, "Psalms 50:12 (LXX numbering)");
  assert.match(p!.description!, /Create for me a pure heart/);
});

test("an older link numbered by its base", async () => {
  const p = await preview("/PSA/51/12?editions=bible.net,bible.bhsa&base=bible.bhsa");
  assert.match(p!.description!, /Create for me a pure heart/);
});

test("a search: what was searched, and what was found where", async () => {
  const p = await preview("/JHN/3?t.0.features.lexeme=%E1%BC%80%CE%B3%CE%B1%CF%80%CE%AC%CF%89&scope=verse&range=nt&texts=main");
  assert.equal(p?.title, "ἀγαπάω — search");
  assert.equal(p?.description, "110 verses in the New Testament with ἀγαπάω.");
});

test("a link to one result: that result, and what it is one of", async () => {
  const p = await preview("/JHN/3?editions=bible.sblgnt,bible.net&base=bible.net&t.0.features.lexeme=%E1%BC%80%CE%B3%CE%B1%CF%80%CE%AC%CF%89&scope=verse&range=nt&texts=main&at=21&hit=JHN/3/16");
  assert.equal(p?.title, "John 3:16 — ἀγαπάω");
  assert.match(p!.description!, /^“For this is the way God loved the world.*” \(NET\) One of 110 verses in the New Testament with ἀγαπάω\.$/);
});

test("the home page and paths no client reads keep the fixed tags", async () => {
  assert.equal(await preview("/"), null);
  assert.equal(await preview("/NOPE/1"), null);
});

test("link-preview bots, and readers", () => {
  for (const ua of [
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "facebookexternalhit/1.1 Facebot Twitterbot/1.0",
    "WhatsApp/2.23.20.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1; +mailto:support@bsky.app)",
  ])
    assert.ok(isPreviewBot(ua), ua);
  assert.ok(!isPreviewBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"));
  assert.ok(!isPreviewBot(null));
});

/** A card address's spec, decoded: its `key=value` pairs. */
function spec(image: string): Record<string, string> {
  const m = /^https:\/\/api\.parabible\.com\/v1\/card\/([A-Za-z0-9_-]+)\.png$/.exec(image);
  assert.ok(m, image);
  const text = Buffer.from(m[1], "base64url").toString("utf8");
  return Object.fromEntries(text.split("&").map((p) => [p.split("=")[0], p.split("=").slice(1).join("=")]));
}

test("the card is the API's, for the same passage or search, in the link's texts, at an address of letters and digits", async () => {
  const verse = (await preview("/PSA/50/12?numbering=bible.rahlfs_lxx&editions=bible.net,bible.rahlfs_lxx&base=bible.net"))!.image!;
  assert.deepEqual(spec(verse), { ref: "PSA 50:12", n: "bible.rahlfs_lxx", e: "net,rahlfs_lxx" });
  // What the server would assume anyway is left out: the corpus's own numbering, the default texts.
  assert.deepEqual(spec((await preview("/PSA/51/10"))!.image!), { ref: "PSA 51:10" });
  const link = "/JOS/8?editions=bible.bhsa,bible.rahlfs_lxx,bible.sblgnt,bible.net&base=bible.net&t.0.features.lexeme=%D7%9B%D7%97%D7%A9%D7%81&t.1.features.lexeme=%D7%A9%D6%B8%D7%82%D7%A8%D6%B8%D7%94&scope=verse&range=ot,nt&texts=main&size=20";
  const search = (await preview(link))!.image!;
  assert.deepEqual(spec(search), { "0:lexeme": "כחשׁ", "1:lexeme": "שָׂרָה", s: "verse", r: "ot,nt" });
  assert.ok(search.length < 120, `${search.length}: ${search}`);
  const one = (await preview("/JHN/3?t.0.features.lexeme=%E1%BC%80%CE%B3%CE%B1%CF%80%CE%AC%CF%89&scope=verse&range=nt&texts=main&at=21&hit=JHN/3/16"))!.image!;
  assert.deepEqual(spec(one), { "0:lexeme": "ἀγαπάω", s: "verse", r: "nt", a: "21", h: "JHN/3/16" });
});

test("a card's spec says partners, inversions and the texts searched compactly", () => {
  const search = new URLSearchParams("t.0.features.lexeme=שׁמע&t.0.aligned.edition=bible.rahlfs_lxx&t.0.aligned.lexeme=ἀκούω&t.1.inverted=true&t.1.features.lexeme=θεός&t.2.unaligned.edition=bible.bsb&scope=parallel&range=all&texts=main,dss.1qisaa");
  const url = cardUrl("https://api.parabible.com/v1", { search, editions: ["bible.bhsa", "josephus.grc"] });
  assert.deepEqual(spec(url), {
    "0:lexeme": "שׁמע",
    "0a:edition": "bible.rahlfs_lxx",
    "0a:lexeme": "ἀκούω",
    "1!": "",
    "1:lexeme": "θεός",
    "2u:edition": "bible.bsb",
    s: "parallel",
    x: "main,dss.1qisaa",
    e: "bhsa,josephus.grc",
  });
});
