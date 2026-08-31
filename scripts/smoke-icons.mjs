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
 * injects it after noticing src/app/icon.svg and src/app/icon1.tsx. If that
 * inference ever breaks, every build stays green and every page quietly
 * loses its icon.
 *
 * The generated images are doing separate work: they are produced by Satori
 * at request time, so a build that compiles tells you nothing about whether
 * rendering throws. Checking for the PNG magic bytes is the difference
 * between "the module compiled" and "a PNG came back".
 *
 * What this CANNOT tell you: whether the images look right. A card with
 * mangled text renders as a perfectly valid PNG and passes every assertion
 * here. Composition needs eyes.
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

/* --- tiny tag helpers ----------------------------------------------------
 *
 * These parse rather than pattern-match, because the obvious regex for a
 * favicon link is subtly wrong: rel="[^"]*\bicon\b[^"]*" also matches
 * rel="apple-touch-icon", since - is a non-word character and so \b sits
 * between "touch-" and "icon". That made the favicon assertion satisfiable
 * by the touch icon alone.
 *
 * Splitting rel into tokens removes the ambiguity: "apple-touch-icon" is one
 * token and is not "icon". rel="shortcut icon" is two tokens, one of which
 * is "icon", and still matches -- which is correct.
 */

function linkTags(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
}

function relTokens(tag) {
  const m = tag.match(/\brel="([^"]*)"/i);
  return m ? m[1].trim().toLowerCase().split(/\s+/) : [];
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

function findByRel(tags, token) {
  return tags.find((t) => relTokens(t).includes(token)) ?? null;
}

/** Reads a meta tag's content, tolerating either attribute order. */
function metaContent(html, attrName, value) {
  const pattern = new RegExp(
    `<meta[^>]*${attrName}="${value}"[^>]*content="([^"]*)"|` +
      `<meta[^>]*content="([^"]*)"[^>]*${attrName}="${value}"`,
  );
  const m = html.match(pattern);
  if (!m) return null;
  return (m[1] ?? m[2]).replace(/&amp;/g, "&");
}

/** Fetches an absolute or relative URL against BASE, so origin never matters. */
async function getByUrl(raw) {
  const u = new URL(raw, BASE);
  return get(`${u.pathname}${u.search}`);
}

function isPng(buf) {
  return buf.length > 8 && PNG_MAGIC.every((b, i) => buf[i] === b);
}

async function expectPng(label, res) {
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    fail(label, `status ${res.status}`);
    return;
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!isPng(buf)) {
    fail(
      label,
      `not a PNG (content-type ${type}, ${buf.length} bytes). Satori ` +
        "probably threw while rendering.",
    );
    return;
  }
  pass(label, `PNG, ${buf.length} bytes`);
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

/* --- the favicons, tags and targets --------------------------------------
 *
 * Plural deliberately. Asserting that SOME icon exists is what let a
 * Safari-invisible page ship: one SVG link satisfied the check while no
 * browser without SVG favicon support had anything to render.
 */

if (html) {
  const tags = linkTags(html);
  const iconTags = tags.filter((t) => relTokens(t).includes("icon"));

  if (iconTags.length === 0) {
    const rels = tags.map((t) => relTokens(t).join(" ")).filter(Boolean);
    fail(
      'HTML carries <link rel="icon">',
      'no link tag whose rel contains the token "icon" -- Next did not ' +
        "pick up the icon files, so no browser will show a favicon. " +
        `rel values present: ${rels.length ? rels.join(", ") : "none"}`,
    );
  } else {
    pass(`HTML carries ${iconTags.length} favicon link(s)`);

    const types = iconTags.map((t) => (attr(t, "type") ?? "").toLowerCase());

    if (types.some((t) => t.includes("svg"))) {
      pass("a favicon is offered as SVG");
    } else {
      fail(
        "a favicon is offered as SVG",
        `no icon link with an SVG type. types: ${types.join(", ") || "none"}`,
      );
    }

    /* The fallback. Without it, Safari shows no tab icon at all. */
    if (types.some((t) => t.includes("png"))) {
      pass("a favicon is offered as PNG");
    } else {
      fail(
        "a favicon is offered as PNG",
        "no raster icon link -- browsers that cannot read SVG favicons, " +
          `Safari among them, will show none. types: ${types.join(", ") || "none"}`,
      );
    }

    /* Every advertised icon must actually be fetchable, and must match the
     * content type its own tag claims. */
    for (const tag of iconTags) {
      const href = attr(tag, "href");
      const declared = (attr(tag, "type") ?? "").toLowerCase();
      const label = `GET favicon ${declared || "(untyped)"} ${href ?? ""}`;

      if (!href) {
        fail("favicon link has an href", tag.slice(0, 140));
        continue;
      }

      try {
        const res = await getByUrl(href);
        if (!res.ok) {
          fail(label, `status ${res.status}`);
          continue;
        }
        const buf = new Uint8Array(await res.arrayBuffer());

        if (declared.includes("png")) {
          if (!isPng(buf)) {
            fail(label, `declared PNG but bytes are not a PNG (${buf.length} B)`);
          } else {
            pass(label, `PNG, ${buf.length} bytes`);
          }
        } else {
          const body = new TextDecoder().decode(buf);
          if (!body.includes("<path")) {
            fail(label, "no path data in response");
          } else {
            pass(label, `${buf.length} bytes`);
          }
        }
      } catch (err) {
        fail(label, err.message);
      }
    }
  }

  const touchTag = findByRel(tags, "apple-touch-icon");
  if (!touchTag) {
    fail(
      'HTML carries <link rel="apple-touch-icon">',
      "src/app/apple-icon.tsx was not picked up",
    );
  } else {
    pass('HTML carries <link rel="apple-touch-icon">');
    const href = attr(touchTag, "href");
    if (!href) {
      fail("touch icon link has an href", touchTag.slice(0, 140));
    } else {
      try {
        await expectPng(`GET touch icon href (${href})`, await getByUrl(href));
      } catch (err) {
        fail(`GET touch icon href (${href})`, err.message);
      }
    }
  }
}

/* --- the static routes, independent of any tag -------------------------- */

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

try {
  await expectPng("GET /apple-icon", await get("/apple-icon"));
} catch (err) {
  fail("GET /apple-icon", err.message);
}

/* --- the link preview --------------------------------------------------- */

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
      await expectPng("GET og:image", await getByUrl(ogImage));
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
      await expectPng("GET twitter:image", await getByUrl(twImage));
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
