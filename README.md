# parabible-link-previews

Per-link titles and descriptions for Parabible's link previews. A link to a
passage unfurls as "Psalms 51:10" with the verse's words; a search as
"ἀγαπάω — search" with what it found ("110 verses in the New Testament with
ἀγαπάω."). Its image is the API's card for the same passage or search
(`/v1/preview.png` on api.parabible.com, drawn by the server from its own
data), so the server must have that endpoint before the clients deploy this.

Both clients depend on it and put it in front of their pages:

- **parabible.com** (legacy-client, Cloudflare Pages): `functions/_middleware.ts`
- **m.parabible.com** (new-mobile-client, a Worker with static assets): `worker/index.ts`

```ts
import { linkPreview } from "parabible-link-previews";
linkPreview(request, () => next());
```

Only link-preview bots and search engines get rewritten pages (`isPreviewBot`);
everyone else, and anything that is not a page, gets `next()` untouched. The
API is asked for the passage's words or the search's count (cached at the
edge); if it cannot answer in 2.5 s, the page keeps its fixed tags.

Links are read as the clients write them: `/BOOK/ch/v`, `numbering=`,
`editions=`/`base=`, and a search's `t.N.…` terms with `scope`, `range`,
`texts` and `hit` (one result). Book names and feature labels are generated from the clients'
`src/data/books.json` and `src/data/features.json`.

```sh
npm test    # against the live API
```
