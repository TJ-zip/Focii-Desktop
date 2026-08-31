/**
 * The Twitter/X card image.
 *
 * Next will fall back to the Open Graph image when this file is absent, but
 * that is an inference about someone else's scraper. Re-exporting the same
 * renderer costs nothing and makes twitter:image an explicit tag in the
 * document, which the smoke test can then assert on directly.
 *
 * Same renderer, same size, no second copy of the layout.
 */
export { default, size, contentType, alt } from "./opengraph-image";
