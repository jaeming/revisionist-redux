/**
 * Anthropic Model Specifications
 * Updated July 2026. The dropdown is a convenience — any model ID also
 * works via the custom-model field, so new releases don't require a
 * plugin update.
 */

import { ModelSpec } from '../modelTypes';

const claudeCaps = {
  supportsJSON: true,
  supportsImages: true,
  supportsFunctions: true,
  supportsStreaming: true,
  supportsThinking: true
};

export const ANTHROPIC_MODELS: ModelSpec[] = [
  {
    provider: 'anthropic',
    name: 'Claude Sonnet 4.5',
    apiName: 'claude-sonnet-4-5',
    contextWindow: 200000,
    maxTokens: 64000,
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
    capabilities: claudeCaps
  },
  {
    provider: 'anthropic',
    name: 'Claude Haiku 4.5',
    apiName: 'claude-haiku-4-5',
    contextWindow: 200000,
    maxTokens: 64000,
    inputCostPerMillion: 1.00,
    outputCostPerMillion: 5.00,
    capabilities: claudeCaps
  },
  {
    provider: 'anthropic',
    name: 'Claude Opus 4.5',
    apiName: 'claude-opus-4-5',
    contextWindow: 200000,
    maxTokens: 64000,
    inputCostPerMillion: 5.00,
    outputCostPerMillion: 25.00,
    capabilities: claudeCaps
  },
  {
    provider: 'anthropic',
    name: 'Claude Opus 4.1',
    apiName: 'claude-opus-4-1',
    contextWindow: 200000,
    maxTokens: 32000,
    inputCostPerMillion: 15.00,
    outputCostPerMillion: 75.00,
    capabilities: claudeCaps
  },
  {
    provider: 'anthropic',
    name: 'Claude 3.5 Haiku',
    apiName: 'claude-3-5-haiku-latest',
    contextWindow: 200000,
    maxTokens: 8192,
    inputCostPerMillion: 0.80,
    outputCostPerMillion: 4.00,
    capabilities: { ...claudeCaps, supportsImages: false, supportsThinking: false }
  }
];

export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-5';
