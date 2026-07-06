/**
 * Generic CLI adapter — runs a user-defined command template, so any
 * local tool (ollama run, llm, gemini, aichat…) works without a code change.
 *
 * Template placeholders:
 *   {model}  — replaced with the selected model name
 *   {prompt} — replaced with the full prompt as one argument;
 *              if absent, the prompt is written to stdin instead.
 * The command's trimmed stdout is the revision.
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

export class CustomCLIAdapter extends CLIBaseAdapter {
  readonly name = 'custom-cli';
  readonly baseUrl = '';
  protected readonly defaultBinaryName = '';

  constructor(model?: string, cliConfig?: CLIAdapterConfig) {
    super(model || '', cliConfig);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.cliConfig.commandTemplate?.trim();
  }

  protected resolveBinary(): string | null {
    const tokens = this.parseTemplate();
    if (!tokens.length) return null;
    // Reuse the base search by treating the first token as the binary
    this.cliConfig = { ...this.cliConfig, binaryPath: tokens[0] };
    return super.resolveBinary();
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const template = this.cliConfig.commandTemplate?.trim();
    if (!template) {
      throw new LLMProviderError(
        'No command template configured. Set one in the plugin settings, e.g. "ollama run {model}".',
        this.name,
        'NOT_CONFIGURED'
      );
    }

    const model = (options?.model || this.currentModel || '').trim();
    const fullPrompt = options?.systemPrompt
      ? `${options.systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    const tokens = this.parseTemplate();
    const promptInArgs = tokens.some(t => t.includes('{prompt}'));
    const args = tokens.slice(1).map(t =>
      t.replace(/\{model\}/g, model).replace(/\{prompt\}/g, fullPrompt)
    );

    const { stdout } = await this.runCommand(args, promptInArgs ? '' : fullPrompt);
    const text = stdout.trim();
    if (!text) {
      throw new LLMProviderError('Command produced no output', this.name, 'EMPTY_OUTPUT');
    }

    return {
      text,
      model: model || 'custom',
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

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: false,
      maxContextWindow: 0,
      supportedFeatures: ['custom_command']
    };
  }

  /** Split the template into tokens, honoring single/double quotes */
  private parseTemplate(): string[] {
    const template = this.cliConfig.commandTemplate?.trim() || '';
    const tokens: string[] = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(template)) !== null) {
      tokens.push(m[1] ?? m[2] ?? m[3]);
    }
    return tokens;
  }
}
