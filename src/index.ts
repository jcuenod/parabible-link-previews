import { describe, type DescribeOptions, type Preview } from "./describe.ts";

export { describe, type Preview } from "./describe.ts";

/**
 * The apps that unfurl links and the search engines, by what they say they
 * are. iMessage fetches as "facebookexternalhit … Twitterbot"; Slack as
 * "Slackbot-LinkExpanding"; Bluesky as "Cardyb".
 */
const bots =
  /bot\b|crawler|spider|facebookexternalhit|facebot|slack|twitterbot|linkedinbot|whatsapp|discord|telegram|skype|embedly|iframely|pinterest|redditbot|vkshare|mastodon|cardyb|bluesky|applebot|googlebot|google-inspectiontool|bingbot|duckduckbot|yandex|baiduspider|petalbot|snapchat|viber|line\//i;

export const isPreviewBot = (userAgent: string | null): boolean => !!userAgent && bots.test(userAgent);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The page's head with the preview's title and description in place of the fixed ones. */
export function withPreview(page: Response, preview: Preview): Response {
  const title = `${preview.title} · Parabible`;
  let described = false;
  const content = (value: string) => ({ element: (el: Element) => el.setAttribute("content", value) });
  let rewriter = new HTMLRewriter()
    .on("title", { element: (el) => void el.setInnerContent(title) })
    .on('meta[property="og:title"]', content(preview.title));
  if (preview.image) {
    rewriter = rewriter
      .on('meta[property="og:image"]', content(preview.image))
      .on('meta[property="og:image:alt"]', content(preview.description ? `${preview.title}: ${preview.description}` : preview.title));
  }
  if (preview.description) {
    rewriter = rewriter
      .on('meta[property="og:description"]', content(preview.description))
      .on('meta[name="description"]', {
        element: (el) => {
          described = true;
          el.setAttribute("content", preview.description!);
        },
      })
      // A page without a description of its own gets one.
      .on("head", {
        element: (el) =>
          el.onEndTag((end) => {
            if (!described) end.before(`<meta name="description" content="${esc(preview.description!)}" />`, { html: true });
          }),
      });
  }
  const res = rewriter.transform(page);
  const out = new Response(res.body, res);
  // Varies by who asks: a cache must not hand a reader the bots' page, or a bot the readers'.
  out.headers.append("Vary", "User-Agent");
  return out;
}

export interface LinkPreviewOptions extends DescribeOptions {}

/**
 * In front of a client's pages: a link-preview bot asking for a page gets it
 * with a title and description of its own (the passage and its words, what a
 * search found); everyone else, and anything that is not a page, gets
 * `next()` untouched. Any failure leaves the fixed tags.
 */
export async function linkPreview(request: Request, next: () => Promise<Response>, opts: LinkPreviewOptions = {}): Promise<Response> {
  if (request.method !== "GET" || !isPreviewBot(request.headers.get("User-Agent"))) return next();
  const url = new URL(request.url);
  // Files (/og-card.png, /assets/…) are not pages.
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return next();
  const [page, preview] = await Promise.all([next(), describe(url, opts).catch(() => null)]);
  if (!preview || !page.ok || !(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  return withPreview(page, preview);
}
