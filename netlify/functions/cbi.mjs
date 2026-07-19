/* ============================================================
   Global Coffee Board — Coffee Board of India daily report scraper
   (Netlify Function v2, reachable at /api/cbi)

   The Board's "Daily Coffee Market Report" is a PDF streamed by an
   ASP.NET postback (no static URL). This function:
     1. GETs Market_Info.aspx to grab the session cookie + hidden fields
     2. POSTs the "Click here to view Daily report" submit-button back
     3. Parses the returned PDF for:
          - "Raw Coffee Price (Karnataka)" farm-gate grades (₹/50kg)
          - the official ICE front-month futures (Arabica ¢/lb, Robusta $/t)

   Best-effort: government PDF layout can change, so every field is
   parsed defensively and the function fails soft (ok:false) — the site
   then falls back to its previous data. Result is cached ~3h since the
   report is daily.
   ============================================================ */
import { getDocumentProxy, extractText } from "unpdf";

export const config = { path: "/api/cbi" };

const PAGE = "https://coffeeboard.gov.in/Market_Info.aspx";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const decodeEntities = (s) =>
  (s || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function fetchReportPdf() {
  // 1) prime the session + read ASP.NET hidden fields
  const r1 = await fetch(PAGE, { headers: { "User-Agent": UA } });
  const html = await r1.text();
  const cookies = (r1.headers.getSetCookie ? r1.headers.getSetCookie() : [])
    .map((c) => c.split(";")[0]).join("; ");

  const hidden = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]*)"/) || [])[1];
    const value = (tag.match(/value="([^"]*)"/) || [])[1] || "";
    if (name) hidden[name] = decodeEntities(value);
  }
  const action = (html.match(/<form[^>]*action="([^"]*)"/i) || [])[1] || "Market_Info.aspx";

  // 2) reproduce the "view daily report" postback
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(hidden)) body.set(k, v);
  body.set("pdf_click", "Click here to view Daily report");

  const r2 = await fetch(new URL(action, PAGE), {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookies,
      "Referer": PAGE,
      "Origin": "https://coffeeboard.gov.in",
    },
    body: body.toString(),
  });
  const ct = r2.headers.get("content-type") || "";
  if (!/pdf/i.test(ct)) throw new Error("expected PDF, got " + ct);
  return Buffer.from(await r2.arrayBuffer());
}

function parseReport(text) {
  // ---- Raw Coffee Price (Karnataka) — farm-gate grades, ₹/50 kg ----
  const grades = [];
  const i = text.indexOf("Raw Coffee Price");
  if (i >= 0) {
    const seg = text.slice(i, i + 340);
    const ranges = [...seg.matchAll(/(\d{4,6})\s*-\s*(\d{4,6})/g)].map((m) => [+m[1], +m[2]]);
    const names = ["Arabica Parchment", "Arabica Cherry", "Robusta Parchment", "Robusta Cherry"];
    names.forEach((g, k) => {
      if (ranges[k]) {
        grades.push({
          grade: g,
          inr50kg: Math.round((ranges[k][0] + ranges[k][1]) / 2),
          low: ranges[k][0],
          high: ranges[k][1],
        });
      }
    });
  }

  // ---- official ICE front-month futures ----
  // Text after the "US $ /Tonne ..." header looks like:
  //   "... July - 2026 321.30 682.14 July - 2026 3867 175.40 372.39 Sept-2026 ..."
  let futures = null;
  const h = text.search(/US ?\$ ?\/ ?Tonne/i);
  if (h >= 0) {
    const seg = text.slice(h, h + 220);
    const ara = (seg.match(/([0-9]{2,3}\.[0-9]{2})/) || [])[1];    // first ¢/lb decimal (Arabica)
    const rob = (seg.match(/\b([34][0-9]{3})\b/) || [])[1];        // first $/tonne integer (Robusta)
    futures = { arabicaCentsLb: ara ? +ara : null, robustaUsdTonne: rob ? +rob : null };
  }

  const d = text.match(/Daily Coffee Market Report,\s*(\w+day,?\s*\w+\s+\d{1,2},?\s*\d{4})/);
  return { date: d ? d[1].trim() : null, grades, futures };
}

let cache = null;
let cacheAt = 0;
const TTL_MS = 3 * 60 * 60 * 1000; // report is daily; refresh a few times/day

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}

export default async () => {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return json(cache);
  try {
    const pdf = await fetchReportPdf();
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    const parsed = parseReport(text);
    if (!parsed.grades.length) throw new Error("no grade prices parsed");
    const data = { ok: true, ...parsed, updated: now };
    cache = data;
    cacheAt = now;
    return json(data);
  } catch (e) {
    // fail soft — the dashboard keeps its previous/sample data
    return json({ ok: false, error: String(e && e.message || e), grades: [], futures: null, updated: now });
  }
};
