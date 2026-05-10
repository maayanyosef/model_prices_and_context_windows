# AI Model Prices & Context Windows

[![Live site](https://img.shields.io/github/deployments/maayanyosef/model_prices_and_context_windows/github-pages?label=live%20site&logo=githubpages&logoColor=white)](https://maayanyosef.github.io/model_prices_and_context_windows/)
[![Last commit](https://img.shields.io/github/last-commit/maayanyosef/model_prices_and_context_windows?logo=github&logoColor=white)](https://github.com/maayanyosef/model_prices_and_context_windows/commits/main)
[![Models](https://img.shields.io/badge/models-2%2C707-0071e3?logo=openai&logoColor=white)](./model_prices_and_context_windows.json)
[![Synced from LiteLLM](https://img.shields.io/badge/synced%20from-BerriAI%2Flitellm-FF6F00?logo=github&logoColor=white)](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)
[![Demo: Remotion](https://img.shields.io/badge/demo-Remotion-1c2128?logo=react&logoColor=61dafb)](https://github.com/remotion-dev/remotion)
[![Stars](https://img.shields.io/github/stars/maayanyosef/model_prices_and_context_windows?style=flat&logo=github&logoColor=white)](https://github.com/maayanyosef/model_prices_and_context_windows/stargazers)

A searchable, comparable database of **2,700+ AI models** — pricing, context windows, capabilities, and modes — synced from [BerriAI/litellm](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) and paired with a static-site browser you can open in any tab.

![Demo](./demo.gif)

> **Live browser →** https://maayanyosef.github.io/model_prices_and_context_windows/
> **Data file →** [`model_prices_and_context_windows.json`](./model_prices_and_context_windows.json)
> **Demo source →** [`demo/`](./demo) (Remotion)

---

## What's inside

This repo is two things shipped together:

1. **A JSON dataset** mirroring LiteLLM's [`model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — schema-compatible, drop-in usable in any tooling that already speaks LiteLLM. Top-level object keyed by model id (e.g. `gpt-5`, `claude-opus-4-5`, `gemini-2.5-pro`).
2. **A zero-build static browser** (`index.html` + `app.js` + `styles.css`) deployed via GitHub Pages. Vanilla HTML/CSS/JS, no framework, no bundler — the page fetches the JSON next to it and renders the UI.

## Features (browser)

The live site is more than a table — it's a small, opinionated comparison tool:

- **Search & filter** — type-ahead search, filter by provider, mode, and capability chips (vision, tool calling, reasoning, prompt caching, large context, low cost).
- **Stats dashboard** — at-a-glance highlights: total models, providers, cheapest chat input, biggest context window, most-capable model.
- **Card and table views** — toggle layouts; sort by price, output cost, or context.
- **Side-by-side compare tray** — pin up to four models, open a comparison modal with per-field "best" highlights.
- **Leaderboards** — per-mode rankings (cheapest input, cheapest output, biggest context, best-value vision, reasoning, largest output).
- **Cost calculator** — plug in monthly input/output tokens and call volume, get estimated cost across the models you care about. State persists in `localStorage`.
- **Capability matrix** — provider × capability grid; click a cell to drill down.
- **Tweaks** — light/dark theme, balanced/compact/spacious density, price units per 1K or per 1M, accent color, default sort. Persisted in `localStorage`.

## Try it

**Easiest:** open [the live site](https://maayanyosef.github.io/model_prices_and_context_windows/).

**Locally:** the page uses `fetch()` on a relative path, so `file://` won't work. Serve it instead:

```bash
git clone https://github.com/maayanyosef/model_prices_and_context_windows.git
cd model_prices_and_context_windows
python3 -m http.server 8000
# open http://localhost:8000
```

## Using the data

### Python

```python
import json

with open("model_prices_and_context_windows.json") as f:
    models = json.load(f)

# Cheapest chat model with vision support
candidates = [
    (name, info) for name, info in models.items()
    if info.get("mode") == "chat"
    and info.get("supports_vision")
    and info.get("input_cost_per_token")
]
name, info = min(candidates, key=lambda kv: kv[1]["input_cost_per_token"])
print(f"{name}: ${info['input_cost_per_token'] * 1_000_000:.2f} per 1M input tokens")
```

### JavaScript / TypeScript

```ts
type ModelInfo = {
  litellm_provider?: string;
  mode?: string;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_reasoning?: boolean;
  // ...many more in sample_spec
};

const res = await fetch("./model_prices_and_context_windows.json");
const models: Record<string, ModelInfo> = await res.json();

const visionAndTools = Object.entries(models)
  .filter(([, m]) => m.supports_vision && m.supports_function_calling);
```

> `sample_spec` is a documentation entry, not a real model — exclude it (`delete models.sample_spec`) before iterating.

## Data schema (highlights)

| Field                                                                                                                                                                                                                                                 | Meaning                                                                                                                         |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| `litellm_provider`                                                                                                                                                                                                                                    | Provider key (e.g. `openai`, `anthropic`, `bedrock`, `vertex_ai`).                                                              |
| `mode`                                                                                                                                                                                                                                                | `chat`, `embedding`, `image_generation`, `audio_transcription`, `audio_speech`, `completion`, `moderation`, `rerank`, `search`. |
| `max_input_tokens` / `max_output_tokens` / `max_tokens`                                                                                                                                                                                               | Context window limits.                                                                                                          |
| `input_cost_per_token` / `output_cost_per_token`                                                                                                                                                                                                      | USD per token (very small floats; use scientific notation in PRs).                                                              |
| `cache_creation_input_token_cost` / `cache_read_input_token_cost`                                                                                                                                                                                     | Prompt caching pricing.                                                                                                         |
| `output_cost_per_reasoning_token`                                                                                                                                                                                                                     | Reasoning token surcharge.                                                                                                      |
| `input_cost_per_image` / `output_cost_per_image`                                                                                                                                                                                                      | Image-mode pricing.                                                                                                             |
| `input_cost_per_second`                                                                                                                                                                                                                               | Audio-transcription pricing.                                                                                                    |
| `supports_function_calling`, `supports_vision`, `supports_audio_input`, `supports_audio_output`, `supports_reasoning`, `supports_prompt_caching`, `supports_response_schema`, `supports_web_search`, `supports_pdf_input`, `supports_system_messages` | Capability booleans.                                                                                                            |
| `deprecation_date`                                                                                                                                                                                                                                    | `YYYY-MM-DD` when relevant.                                                                                                     |

For the full field reference open the JSON and look at the `sample_spec` entry — it documents every supported field.

## Regenerating the demo

The animated GIF above is rendered from [Remotion](https://github.com/remotion-dev/remotion) components in [`demo/`](./demo). To regenerate:

```bash
cd demo
npm install
npm run render
# writes ../demo.gif (~2 MB, 12s, 960×720)
```

`npm run studio` opens Remotion Studio for live editing at http://localhost:3000.

## Contributing

This repo mirrors LiteLLM as the source of truth. To add or correct a model, prefer opening a PR against [LiteLLM upstream](https://github.com/BerriAI/litellm); changes flow into this repo on the next sync. For repo-local changes (UI tweaks, README fixes, demo improvements), regular PRs against `main` are welcome.

When editing the JSON directly:
- Use scientific notation for tiny floats (`1e-06`, not `0.000001`).
- Match the provider's official model identifier.
- Add `deprecation_date` in `YYYY-MM-DD` for deprecated models.
- Validate with `jq empty model_prices_and_context_windows.json` before pushing.

## License

Data is provided as-is for informational use. Verify pricing and capabilities against official provider documentation before making business decisions.

---

_Synced from [BerriAI/litellm](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) · last updated May 2026._
