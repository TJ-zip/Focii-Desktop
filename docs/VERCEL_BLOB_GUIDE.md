# Vercel Blob — where it lives and how we'll use it

Vercel Blob is Vercel's object storage (files: audio, images, video) served over a global CDN. It is the planned home for the big soundscape files (12-min / 75-min / 90-min) that are too large for GitHub.

## Mental model

```
GitHub repo          →  code only (app, generator scripts, docs)
Vercel project       →  builds & serves the app (from the GitHub repo)
Vercel Blob store    →  the audio files, addressed by public CDN URLs
```

The app never bundles audio. It just plays URLs like:
`https://<store-id>.public.blob.vercel-storage.com/focus/deep_75min.flac`

## Step-by-step setup (dashboard, no code)

1. **Create the Vercel project first** — vercel.com → Add New → Project → import the GitHub repo.
2. **Create the Blob store** — Vercel Dashboard → **Storage** tab (top nav) → **Create Database/Store** → choose **Blob** → name it (e.g. `soundscape-audio`) → create.
3. **Connect the store to the project** — in the store's page → **Connect Project** → pick the soundscape project + environments (Production/Preview/Development). This auto-injects the env var **`BLOB_READ_WRITE_TOKEN`** into the project. You never copy the secret by hand and it never goes in the repo.
4. **Upload files** — three ways:
   - **Dashboard upload**: Storage → your store → Upload. Simplest for our pre-rendered files. Drag in the FLAC/WAV, get the public URL. Done.
   - **CLI from your machine**: `vercel blob put ./deep_75min.flac` (after `vercel link`).
   - **Programmatic** (`@vercel/blob` npm package, `put()` from a server route) — only needed if the app itself generates/uploads audio later.
5. **Use the URL** — every uploaded blob with `access: 'public'` gets a stable CDN URL; paste/store those URLs in the app's mode config.

## Where things go in the codebase

- `BLOB_READ_WRITE_TOKEN` → **only in Vercel project env vars** (auto-added by Connect). Never in the repo. `.env.example` lists the name only.
- Public blob URLs → fine to commit (they are public anyway), e.g. in `src/data/audio-manifest.json`.
- Client playback needs **no token** — public blobs are plain HTTPS URLs, streamable with normal `<audio>`/fetch range requests.

## Why Blob and not alternatives

| Option | Verdict |
|---|---|
| GitHub repo | ❌ 100 MB hard/50 MB warn per file; repos bloat |
| GitHub Releases | ✅ works (2 GB/file) but URLs are clunky, no CDN edge caching guarantees |
| Dropbox public links | ⚠️ works but links throttle/expire, no range-request guarantees |
| **Vercel Blob** | ✅ same platform as the app, CDN-served, range requests (seek/stream) supported, free Hobby quota (~1 GB storage) is enough for several 90-min FLACs at ~40-60 MB each... **note: a 90-min FLAC is ~300-500 MB**, so Hobby quota fits ~2; may need WAV→FLAC at 22-32 kHz or paid tier for the full library |

## Free-tier budget check (Hobby)

- Storage: ~1 GB. A 75-min stereo 44.1 kHz FLAC ≈ 250-400 MB → tight. Options: 32 kHz masters (ambient content loses nothing audible below ~14 kHz), or upgrade, or keep only the active mode's files in the store.
- Bandwidth: personal single-user use is negligible.

## Our plan

1. Build app repo → deploy to Vercel.
2. Create `soundscape-audio` Blob store, connect project.
3. Generate final audio locally/CI → upload via dashboard or CLI.
4. Commit `audio-manifest.json` with the blob URLs; player streams them with dual-element crossfade.
