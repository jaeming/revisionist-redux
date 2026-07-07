/**
 * OpenAI Codex CLI adapter — runs `codex exec` as a child process.
 * Rides the user's ChatGPT plan OAuth login; no API key needed.
 * The final assistant message is captured via --output-last-message.
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

export class CodexCLIAdapter extends CLIBaseAdapter {
  readonly name = 'codex-cli';
  readonly baseUrl = '';
  protected readonly defaultBinaryName = 'codex';
  protected extraBinaryLocations = [
    '/Applications/Codex.app/Contents/Resources/codex'
  ];

  constructor(model?: string, cliConfig?: CLIAdapterConfig) {
    super(model || '', cliConfig);
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = (options?.model || this.currentModel || '').trim();

    // Codex has no separate system-prompt channel in exec mode; fold it in.
    const fullPrompt = options?.systemPrompt
      ? `${options.systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    const outFile = path.join(
      os.tmpdir(),
      `revisionist-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
    );

    const args = [
      'exec',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--output-last-message', outFile
    ];
    if (model) args.push('--model', model);
    if (this.cliConfig.extraArgs?.length) args.push(...this.cliConfig.extraArgs);
    args.push('-'); // read the prompt from stdin

    try {
      const { stdout } = await this.runCommand(args, fullPrompt);

      let text = '';
      if (fs.existsSync(outFile)) {
        text = fs.readFileSync(outFile, 'utf8').trim();
      }
      if (!text) {
        // codex exec exits 0 even when the API rejects the request —
        // surface its ERROR lines instead of pasting them as a "revision"
        const errLine = stdout.split('\n').reverse().find(l => l.trim().startsWith('ERROR'));
        if (errLine) {
          throw new LLMProviderError(
            `codex exec failed: ${errLine.trim().slice(0, 300)}`,
            this.name,
            'CLI_ERROR'
          );
        }
        // Fallback: last non-empty stdout block
        const blocks = stdout.trim().split(/\n{2,}/);
        text = (blocks[blocks.length - 1] || '').trim();
      }
      if (!text) {
        throw new LLMProviderError('codex exec produced no output', this.name, 'EMPTY_OUTPUT');
      }

      return {
        text,
        model: model || 'codex-default',
        provider: this.name,
        finishReason: 'stop'
      };
    } finally {
      try { fs.unlinkSync(outFile); } catch { /* already gone */ }
    }
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    const response = await this.generateUncached(prompt, options);
    options?.onToken?.(response.text);
    options?.onComplete?.(response);
    return response;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: '', name: 'Account default' },
      { id: 'gpt-5.5', name: 'GPT-5.5' }
    ].map(m => ({
      id: m.id,
      name: m.name,
      contextWindow: 200000,
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: false,
      pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD', lastUpdated: '2026-07-06' }
    }));
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: false,
      maxContextWindow: 200000,
      supportedFeatures: ['subscription_auth']
    };
  }
}
