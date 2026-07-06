/**
 * OpenAI-compatible endpoint adapter — any server that speaks the
 * /chat/completions dialect: Ollama, LM Studio, LiteLLM, vLLM, llama.cpp…
 * Uses Obsidian's requestUrl, which bypasses CORS restrictions that break
 * plain fetch against local servers.
 */

import { requestUrl } from 'obsidian';
import { BaseAdapter } from '../BaseAdapter';
import {
  GenerateOptions,
  StreamOptions,
  LLMResponse,
  ModelInfo,
  ProviderCapabilities,
  CostDetails,
  LLMProviderError
} from '../types';

export class OpenAICompatibleAdapter extends BaseAdapter {
  readonly name = 'openai-compatible';

  private endpointBaseUrl: string;

  get baseUrl(): string {
    return this.endpointBaseUrl;
  }

  constructor(model?: string, baseUrl?: string, apiKey?: string) {
    super('OPENAI_COMPATIBLE_API_KEY', model || '', baseUrl, apiKey);
    this.endpointBaseUrl = (baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
    this.initializeCache();
  }

  protected validateConfiguration(): void {
    // API key is optional for most local servers.
  }

  async isAvailable(): Promise<boolean> {
    if (!this.endpointBaseUrl) return false;
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  async generateUncached(prompt: string, options?: GenerateOptions): Promise<LLMResponse> {
    const model = (options?.model || this.currentModel || '').trim();
    if (!model) {
      throw new LLMProviderError(
        'No model configured for the OpenAI-compatible endpoint. Set one in the plugin settings.',
        this.name,
        'NOT_CONFIGURED'
      );
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const resp = await requestUrl({
      url: `${this.endpointBaseUrl}/chat/completions`,
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        stop: options?.stopSequences
      }),
      throw: false
    });

    if (resp.status >= 400) {
      throw new LLMProviderError(
        `Endpoint returned HTTP ${resp.status}: ${resp.text?.slice(0, 300)}`,
        this.name,
        resp.status === 401 ? 'AUTHENTICATION_ERROR' : 'HTTP_ERROR'
      );
    }

    const data = resp.json;
    const choice = data?.choices?.[0];
    if (!choice?.message?.content) {
      throw new LLMProviderError(
        `Endpoint returned no completion: ${JSON.stringify(data).slice(0, 300)}`,
        this.name,
        'EMPTY_OUTPUT'
      );
    }

    return {
      text: choice.message.content.trim(),
      model: data.model || model,
      provider: this.name,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0
      } : undefined,
      finishReason: choice.finish_reason === 'length' ? 'length' : 'stop'
    };
  }

  async generateStream(prompt: string, options?: StreamOptions): Promise<LLMResponse> {
    const response = await this.generateUncached(prompt, options);
    options?.onToken?.(response.text);
    options?.onComplete?.(response);
    return response;
  }

  async listModels(): Promise<ModelInfo[]> {
    const resp = await requestUrl({
      url: `${this.endpointBaseUrl}/models`,
      method: 'GET',
      headers: this.headers(),
      throw: false
    });

    if (resp.status >= 400) {
      throw new LLMProviderError(`HTTP ${resp.status} from /models`, this.name, 'HTTP_ERROR');
    }

    const models = resp.json?.data || [];
    return models.map((m: any) => ({
      id: m.id,
      name: m.id,
      contextWindow: 0,
      supportsJSON: false,
      supportsImages: false,
      supportsFunctions: false,
      supportsStreaming: true,
      pricing: { inputPerMillion: 0, outputPerMillion: 0, currency: 'USD', lastUpdated: '2026-07-06' }
    }));
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: false,
      supportsThinking: false,
      maxContextWindow: 0,
      supportedFeatures: ['custom_endpoint', 'local_models']
    };
  }

  async getModelPricing(): Promise<CostDetails | null> {
    return null;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }
}
