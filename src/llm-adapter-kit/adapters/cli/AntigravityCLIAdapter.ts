/**
 * Google Antigravity CLI adapter — runs `agy -p` as a child process.
 * Antigravity is Google's successor to Gemini CLI (which stopped serving
 * AI Pro/Ultra accounts on 2026-06-18). Rides the user's Google sign-in;
 * serves Gemini 3.x plus partner models (Claude, GPT-OSS) — no API key.
 */

import { CLIBaseAdapter, CLIAdapterConfig } from './CLIBaseAdapter';
import {
  GenerateOptions,
  StreamOptions,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  LLMProviderError
} from '../types';

// agy takes the prompt as a single argv argument (no stdin channel), so a
// pathologically large selection+document could exceed the OS arg limit.
const MAX_PROMPT_CHARS = 500000;

export class AntigravityCLIAdapter extends CLIBaseAdapter {
  readonly name = 'antigravity-cli';
  readonly baseUrl = '';
  protected readonly defaultBinaryName = 'agy';

  constructor(model?: string, cliConfig?: CLIAdapterConfig) {
    super(model || '', cliConfig);
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = (options?.model || this.currentModel || '').trim();

    // No separate system-prompt channel in print mode; fold it in.
    const fullPrompt = options?.systemPrompt
      ? `${options.systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    if (fullPrompt.length > MAX_PROMPT_CHARS) {
      throw new LLMProviderError(
        `Prompt too large for agy (${fullPrompt.length} chars). Select a smaller passage.`,
        this.name,
        'PROMPT_TOO_LARGE'
      );
    }

    const args: string[] = [];
    if (model) args.push('--model', model);
    if (this.cliConfig.extraArgs?.length) args.push(...this.cliConfig.extraArgs);
    args.push('-p', fullPrompt);

    const { stdout } = await this.runCommand(args, '');

    const text = stdout.trim();
    if (!text) {
      throw new LLMProviderError('agy produced no output', this.name, 'EMPTY_OUTPUT');
    }
    // agy reports some errors on stdout with exit 0-adjacent behavior;
    // don't paste those into the document as a "revision".
    if (/^Error:/i.test(text)) {
      throw new LLMProviderError(`agy failed: ${text.slice(0, 300)}`, this.name, 'CLI_ERROR');
    }

    return {
      text,
      model: model || 'antigravity-default',
      provider: this.name,
      finishReason: 'stop'
    };
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    const response = await this.generateUncached(prompt, options);
    options?.onToken?.(response.text);
    options?.onComplete?.(response);
    return response;
  }

  async checkAvailability(): Promise<{ ok: boolean; detail: string }> {
    const base = await super.checkAvailability();
    if (!base.ok) return base;

    // Binary present — probe sign-in state with the cheap `models` call.
    try {
      await this.runCommand(['models'], '');
      return { ok: true, detail: `${base.detail} — signed in` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/sign in/i.test(msg)) {
        return {
          ok: false,
          detail: 'agy is installed but not signed in — run `agy` in Terminal (no arguments) and sign in with Google, then retry.'
        };
      }
      return { ok: false, detail: `agy check failed: ${msg.slice(0, 300)}` };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Model IDs vary by account; the settings free-text field takes any ID
    // shown by `agy models`.
    return [{
      id: '',
      name: 'Account default',
      contextWindow: 1000000,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: false,
      pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD', lastUpdated: '2026-07-08' }
    }];
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: false,
      maxContextWindow: 1000000,
      supportedFeatures: ['subscription_auth']
    };
  }
}
