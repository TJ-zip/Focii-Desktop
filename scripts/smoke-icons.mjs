#!/usr/bin/env node
/**
 * Fetches the icons and preview card from a running server and checks what
 * actually comes back.
 *
 * scripts/check-icon-routes.mjs inspects the build output, which proves files
 * were emitted. This proves they are served, and -- more importantly -- that
 * the HTML tells the browser about them.
 *
 * That last point is the whole game. A favicon appears because the document
 * carries <link rel="icon">. Nothing in this repo writes that tag; Next
 * injects it after noticing src/app/icon.svg. If that inference ever breaks,
 * every build stays green and every page quietly loses its icon. This is the
 * only check here that would catch it.
 *
 * The generated images are doing separate work: they are produced by Satori
 * at request time, so a build that compiles tells you nothing about whether
 * rendering throws. Checking for the PNG magic bytes is the difference
 * between "the module compiled" and "a PNG came back".
 *
 * Usage: BASE_URL=http://localhost:3000 node scripts/smoke-icons.mjs
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let failures = 0;

function fail(label, detail) {
  console.error(`FAIL  ${label}\n      ${detail}`);
  failures += 1;
}

function pass(label, detail) {
  console.log(`ok    ${label}${detail ? ` -- ${detail}` : ""}`);
}

async function get(path) {
  return fetch(`${BASE}${path}`, { redirect: "follow" });
}

/** Reads a meta tag's content, tolerating either attribute order. */
function metaContent(html, attr, value) {
  const pattern = new RegExp(
    `<meta[^>]*${attr}="${value}"[^>]*content="([^"]*)"|` +
      `<meta[^>]*content="([^"]*)"[^>]*${attr}="${value}"`,
  );
  const m = html.match(pattern);
  if (!m) return null;
  /* HTML-escaped ampersands are common in generated image URLs. */
  return (m[1] ?? m[2]).replace(/&amp;/g, "&");
}

/** Fetches an absolute metadata URL against BASE, so the origin never matters. */
async function getByMetaUrl(raw) {
  const u = new URL(raw, BASE);
  return get(`${u.pathname}${u.search}`);
}

async function expectPng(label, res, extra = "") {
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    fail(label, `status ${res.status}`);
    return;
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const isPng = buf.length > 8 && PNG_MAGIC.every((b, i) => buf[i] === b);
  if (!isPng) {
    fail(
      label,
      `not a PNG (content-type ${type}, ${buf.length} bytes). Satori ` +
        "probably threw while rendering.",
    );
    return;
  }
  pass(label, `PNG, ${buf.length} bytes${extra ? `, ${extra}` : ""}`);
}

/* --- the document ------------------------------------------------------- */

let html = null;
try {
  const res = await get("/");
  if (!res.ok) {
    fail("GET /", `status ${res.status}`);
  } else {
    html = await res.text();
    pass("GET /", `${html.length} bytes`);
  }
} catch (err) {
  fail("GET /", err.message);
}

if (html) {
  /* Next may emit rel="icon" and orders attributes as it likes, so match the
   * rel value rather than a whole tag. */
  if (/rel="[^"]*\bicon\b[^"]*"/.test(html)) {
    const m = html.match(/<link[^>]*rel="[^"]*\bicon\b[^"]*"[^>]*>/);
    pass("HTML references a favicon", m ? m[0].slice(0, 120) : "");
  } else {
    fail(
      "HTML references a favicon",
      'no <link rel="icon"> in the document -- Next did not pick up ' +
        "src/app/icon.svg, so no browser will show it",
    );
  }

  if (/rel="apple-touch-icon"/.test(html)) {
    pass("HTML references the touch icon");
  } else {
    fail(
      "HTML references the touch icon",
      'no <link rel="apple-touch-icon"> -- src/app/apple-icon.tsx was not ' +
        "picked up",
    );
  }
}

/* --- the favicon -------------------------------------------------------- */

try {
  const res = await get("/icon.svg");
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    fail("GET /icon.svg", `status ${res.status}`);
  } else if (!type.includes("svg")) {
    fail("GET /icon.svg", `content-type was ${type}`);
  } else {
    const body = await res.text();
    if (!body.includes("<path")) {
      fail("GET /icon.svg", "response contains no path data");
    } else {
      pass("GET /icon.svg", `${type}, ${body.length} bytes`);
    }
  }
} catch (err) {
  fail("GET /icon.svg", err.message);
}

/* --- the touch icon ----------------------------------------------------- */

try {
  await expectPng("GET /apple-icon", await get("/apple-icon"));
} catch (err) {
  fail("GET /apple-icon", err.message);
}

/* --- the link preview --------------------------------------------------- */

/* Read the URL out of the tag rather than assuming the generated path: this
 * checks the tag a scraper reads AND the image it would fetch, together. A
 * card nobody can fetch is indistinguishable from no card at all. */
if (html) {
  const ogImage = metaContent(html, "property", "og:image");
  if (!ogImage) {
    fail(
      "HTML declares og:image",
      "no og:image meta tag -- shared links will render as a bare grey box",
    );
  } else {
    pass("HTML declares og:image", ogImage.slice(0, 100));
    try {
      await expectPng("GET og:image", await getByMetaUrl(ogImage));
    } catch (err) {
      fail("GET og:image", err.message);
    }
  }

  const twImage = metaContent(html, "name", "twitter:image");
  if (!twImage) {
    fail("HTML declares twitter:image", "no twitter:image meta tag");
  } else {
    pass("HTML declares twitter:image", twImage.slice(0, 100));
    try {
      await expectPng("GET twitter:image", await getByMetaUrl(twImage));
    } catch (err) {
      fail("GET twitter:image", err.message);
    }
  }

  const card = metaContent(html, "name", "twitter:card");
  if (card === "summary_large_image") {
    pass("twitter:card is summary_large_image");
  } else {
    fail(
      "twitter:card is summary_large_image",
      `got ${card ?? "no tag"} -- the card will render small`,
    );
  }
}

/* --- the downloadable brand assets -------------------------------------- */

try {
  const res = await get("/brand/focii-icon.svg");
  if (!res.ok) {
    fail("GET /brand/focii-icon.svg", `status ${res.status}`);
  } else {
    const body = await res.text();
    if (!body.includes("<path")) {
      fail("GET /brand/focii-icon.svg", "no path data in response");
    } else {
      pass("GET /brand/focii-icon.svg", `${body.length} bytes`);
    }
  }
} catch (err) {
  fail("GET /brand/focii-icon.svg", err.message);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed against ${BASE}`);
  process.exit(1);
}

console.log(`\nall icon and preview checks passed against ${BASE}`);
