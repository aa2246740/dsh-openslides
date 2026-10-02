# Google free APIs we can actually use

Checked against Gemini Developer API pricing / model cards (2026-08). This is not a vendor endorsement — ports stay pluggable. Chat URL ≠ image generate. Chat URL ≠ image search.

## Multimodal (see a page)

Free-tier **Flash / Flash-Lite** chat models accept image input. There is no separate “vision API.”

| Model | Free-tier chat | Sees `image_url` | Writes photos into `media/` |
|-------|----------------|------------------|-----------------------------|
| `gemini-3.5-flash` | Yes (eligible Flash) | Yes | No |
| `gemini-3.5-flash-lite` | Yes | Yes | No |
| `gemini-3.1-flash-lite` | Yes | Yes | No |
| `gemini-*-flash-image` / Imagen / Nano Banana | Free tier **not available** | n/a | Paid image generate |

**Host default:** `SLIDESTUDIO_LLM_MODEL=gemini-3.5-flash` (stronger free multimodal). Lite also sees images; use it only if Flash is rate-limited.

`SLIDESTUDIO_LLM_IMAGE=0` turns vision off. If the model cannot read the PNG, the agent must admit it did not see the slide.

## Image search (download a photo)

**Not available on this key today.**

| Google surface | What it actually returns | Wired to `search_image`? |
|----------------|--------------------------|--------------------------|
| Gemini `google_search` grounding | Web text snippets + citations | No. Does not write `media/` bytes. Production law: no public-web default. |
| Grounding with Google Image Search | Preview on **Gemini 3.1 Flash Image** (paid image-gen). Feeds retrieved images into image generation, not PPTD `media/`. | No |
| Custom Search JSON API `searchType=image` | Image result URLs. 100 queries/day for **existing** customers. **Not available to new customers.** Sunset **2027-01-01**. Needs a Programmable Search Engine `cx`. | No. We have no `SLIDESTUDIO_IMAGE_SEARCH_URL` / `cx`. |

Do not scrape Google Images. `search_image` stays a configured POST `{ query }` → `{ images: [{ url \| b64_json }] }`. Empty env = no-image mode (text / shape / table / chart).

## Image generate

Gemini chat completions are not Imagen. Setting only `SLIDESTUDIO_LLM_BASE_URL` must not advertise 生图. Require `SLIDESTUDIO_IMAGE_BASE_URL` or `SLIDESTUDIO_IMAGE=1`.

## Pi (legacy — freeze fixture only)

> The production kernel is now DSH (ADR-0009); provider auth enters through DSH
> Provider Connections and `dsh-llm-pi-ai`, not a Pi runtime. The paragraphs below
> describe the archived `agent-harness` Pi path — keep them as reference only.

Pi's own login, in order: Hub **登录** or TUI `/login` writes `~/.pi/agent/auth.json` (API key or OAuth) → provider env vars only if `SLIDESTUDIO_PI_ALLOW_ENV=1`. The host LLM key (`SLIDESTUDIO_LLM_API_KEY`) is not Pi.

Google Gemini in Pi is **API key only**. There is no Gemini web OAuth. Vertex can use `gcloud auth application-default login`. Claude / Codex / Copilot / OpenRouter / xAI use `/login` OAuth.

Free-tier limits are provider-controlled. A silent empty assistant can be a swallowed 429, not “Skills did not run.” The host surfaces that error and may try a compatible sibling model on the same provider. `npm run pi:verify` verifies the pinned freeze-fixture binary without writing user auth or installing at runtime.
