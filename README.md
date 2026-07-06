# Revisionist Redux

AI-powered text revision for Obsidian, with providers that actually flex.

A fork of [obsidian-revisionist](https://github.com/ProfSynapse/obsidian-revisionist) by Synaptic Labs (MIT), rebuilt around one idea: **you should be able to revise text with whatever AI you already have** — a Claude subscription, a ChatGPT plan, a local model, or an API key.

## Providers

**Subscription CLIs (no API key, desktop only)**
- **Claude Code** — spawns `claude -p` using your existing Claude Code login. Reports real cost per revision.
- **OpenAI Codex CLI** — spawns `codex exec` using your ChatGPT plan OAuth.
- **Custom CLI** — any command template, e.g. `ollama run {model}`. Prompt is piped to stdin; stdout is the revision.

**Local / self-hosted**
- **OpenAI-compatible endpoint** — Ollama, LM Studio, LiteLLM, vLLM, llama.cpp, or any server speaking `/chat/completions`. Uses Obsidian's CORS-free request layer, so local servers work without extra flags.

**API providers** (from the original, with key handling fixed)
- Anthropic, OpenAI, Google Gemini, Mistral, Groq, Perplexity, OpenRouter, Requesty

Every provider supports a **free-text model override**, so new model releases never require a plugin update.

## Usage

Select text → right-click → **Revise with AI** (or the command palette / ribbon wand). Give instructions or use a quick preset (Clarify, Trim, Expand, Fix), review the result side-by-side, apply or retry.

## Install

Not in the community plugin directory. Install manually:

1. Build: `npm install && npm run build`
2. Copy `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/revisionist-redux/`
3. Enable it in **Settings → Community plugins**

Or point [BRAT](https://github.com/TfTHacker/obsidian42-brat) at this repo.

## Fixes over the original

- API keys are wired into adapters correctly (the original read them from environment variables that don't exist inside Obsidian, so several providers could never authenticate).
- "Retry" actually regenerates instead of returning the cached identical response.
- The revision system prompt is actually sent to the model.
- Anthropic model list updated to real, current model IDs; SDK updated for in-app use.

## License

MIT, same as the original. Original plugin © Synaptic Labs.
