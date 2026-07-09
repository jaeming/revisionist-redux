/**
 * Google Gemini CLI adapter — runs `gemini -o json` as a child process.
 * Rides the user's Google account OAuth login (free tier, or higher limits
 * with a Google AI Pro/Ultra subscription); no API key needed.
 * Piped stdin triggers one-shot mode; -o json gives a parseable envelope.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CLIBaseAdapter, CLIAdapterConfig } from './CLIBaseAdapter';
import {
  GenerateOptions,
  StreamOptions,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  LLMProviderError
} from '../types';

export class GeminiCLIAdapter extends CLIBaseAdapter {
  readonly name = 'gemini-cli';
  readonly baseUrl = '';
  protected readonly defaultBinaryName = 'gemini';

  constructor(model?: string, cliConfig?: CLIAdapterConfig) {
    super(model || '', cliConfig);
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = (options?.model || this.currentModel || '').trim();

    // No separate system-prompt channel in one-shot mode; fold it in.
    const fullPrompt = options?.systemPrompt
      ? `${options.systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    const args = ['-o', 'json'];
    if (model) args.push('-m', model);
    if (this.cliConfig.extraArgs?.length) args.push(...this.cliConfig.extraArgs);

    let stdout: string;
    try {
      ({ stdout } = await this.runCommand(args, fullPrompt));
    } catch (err) {
      // On failure gemini prints a JSON error envelope to stderr, buried in
      // Node deprecation noise — pull out the human-readable message.
      const raw = err instanceof Error ? err.message : String(err);
      const match = raw.match(/"message":\s*"([^"]+)"/);
      if (match) {
        throw new LLMProviderError(`gemini failed: ${match[1]}`, this.name, 'CLI_ERROR');
      }
      throw err;
    }

    // stdout may carry stray log lines before the JSON envelope.
    const jsonStart = stdout.indexOf('{');
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout);
    } catch {
      throw new LLMProviderError(
        `Unexpected non-JSON output from gemini: ${stdout.slice(0, 300)}`,
        this.name,
        'PARSE_ERROR'
      );
    }

    if (parsed.error) {
      throw new LLMProviderError(
        `gemini returned an error: ${parsed.error.message || JSON.stringify(parsed.error).slice(0, 300)}`,
        this.name,
        'CLI_ERROR'
      );
    }

    const text = (parsed.response || '').trim();
    if (!text) {
      throw new LLMProviderError('gemini produced no output', this.name, 'EMPTY_OUTPUT');
    }

    // stats.models is keyed by resolved model name; take the first entry.
    const modelStats: any = parsed.stats?.models
      ? Object.values(parsed.stats.models)[0]
      : undefined;
    const usage = modelStats?.tokens ? {
      promptTokens: modelStats.tokens.prompt || 0,
      completionTokens: modelStats.tokens.candidates || 0,
      totalTokens: modelStats.tokens.total || 0
    } : undefined;

    return {
      text,
      model: model || 'gemini-default',
      provider: this.name,
      usage,
      finishReason: 'stop',
      metadata: { sessionId: parsed.session_id }
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

    // Binary present — but gemini also needs a login (or API key) to run.
    const geminiDir = path.join(os.homedir(), '.gemini');
    const hasOAuth = fs.existsSync(path.join(geminiDir, 'oauth_creds.json'));
    const hasSettings = fs.existsSync(path.join(geminiDir, 'settings.json'));
    if (!hasOAuth && !hasSettings && !process.env.GEMINI_API_KEY) {
      return {
        ok: false,
        detail: `gemini is installed but not logged in — run \`gemini\` once in Terminal, choose "Login with Google", then retry.`
      };
    }
    return base;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: '', name: 'Account default' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
    ].map(m => ({
      id: m.id,
      name: m.name,
      contextWindow: 1000000,
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: false,
      pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD', lastUpdated: '2026-07-08' }
    }));
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
