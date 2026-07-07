/**
 * Claude Code CLI adapter — runs `claude -p` as a child process.
 * Uses the machine's existing Claude Code login (subscription billing),
 * so no API key is needed. Reports real cost from the CLI's JSON output.
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

export class ClaudeCodeAdapter extends CLIBaseAdapter {
  readonly name = 'claude-code';
  readonly baseUrl = '';
  protected readonly defaultBinaryName = 'claude';

  constructor(model?: string, cliConfig?: CLIAdapterConfig) {
    super(model || 'sonnet', cliConfig);
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = (options?.model || this.currentModel || '').trim();

    const args = ['-p', '--output-format', 'json'];
    // Neutralize any user-configured output style (insight blocks,
    // conversational framing) — revisions must be paste-ready text only
    args.push('--settings', '{"outputStyle":"default"}');
    if (model) args.push('--model', model);
    if (options?.systemPrompt) args.push('--system-prompt', options.systemPrompt);
    if (this.cliConfig.extraArgs?.length) args.push(...this.cliConfig.extraArgs);

    const { stdout } = await this.runCommand(args, prompt);

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new LLMProviderError(
        `Unexpected non-JSON output from claude: ${stdout.slice(0, 300)}`,
        this.name,
        'PARSE_ERROR'
      );
    }

    if (parsed.is_error || parsed.subtype !== 'success') {
      throw new LLMProviderError(
        `claude -p returned an error: ${parsed.result || parsed.subtype || 'unknown'}`,
        this.name,
        'CLI_ERROR'
      );
    }

    const usage = parsed.usage ? {
      promptTokens: parsed.usage.input_tokens || 0,
      completionTokens: parsed.usage.output_tokens || 0,
      totalTokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0)
    } : undefined;

    const response: LLMResponse = {
      text: (parsed.result || '').trim(),
      model: model || 'claude-code-default',
      provider: this.name,
      usage,
      finishReason: 'stop',
      metadata: {
        sessionId: parsed.session_id,
        durationMs: parsed.duration_ms
      }
    };

    if (typeof parsed.total_cost_usd === 'number') {
      response.cost = {
        inputCost: 0,
        outputCost: 0,
        totalCost: parsed.total_cost_usd,
        currency: 'USD',
        rateInputPerMillion: 0,
        rateOutputPerMillion: 0
      };
    }

    return response;
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    // The plugin's revision flow is request/response; emulate streaming.
    const response = await this.generateUncached(prompt, options);
    options?.onToken?.(response.text);
    options?.onComplete?.(response);
    return response;
  }

  async listModels(): Promise<ModelInfo[]> {
    // Aliases resolve to the account's current models; free-text overrides work too.
    return ['sonnet', 'opus', 'haiku'].map(alias => ({
      id: alias,
      name: `Claude (${alias})`,
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
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: true,
      maxContextWindow: 200000,
      supportedFeatures: ['subscription_auth', 'system_prompt', 'cost_reporting']
    };
  }
}
