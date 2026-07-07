/**
 * Model specs for CLI-backed providers. These are convenience entries for
 * dropdowns — both CLIs also accept any model string via the custom-model
 * field, and cost is $0 here because billing rides the user's subscription.
 */

import { ModelSpec } from '../modelTypes';

const cliCaps = {
  supportsJSON: false,
  supportsImages: false,
  supportsFunctions: false,
  supportsStreaming: false,
  supportsThinking: false
};

export const CLAUDE_CODE_MODELS: ModelSpec[] = [
  {
    provider: 'claude-code',
    name: 'Sonnet (current)',
    apiName: 'sonnet',
    contextWindow: 200000,
    maxTokens: 64000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: cliCaps
  },
  {
    provider: 'claude-code',
    name: 'Opus (current)',
    apiName: 'opus',
    contextWindow: 200000,
    maxTokens: 32000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: cliCaps
  },
  {
    provider: 'claude-code',
    name: 'Haiku (current)',
    apiName: 'haiku',
    contextWindow: 200000,
    maxTokens: 64000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: cliCaps
  }
];

export const CLAUDE_CODE_DEFAULT_MODEL = 'sonnet';

export const CODEX_CLI_MODELS: ModelSpec[] = [
  {
    provider: 'codex-cli',
    name: 'Account default',
    apiName: '',
    contextWindow: 200000,
    maxTokens: 32000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: cliCaps
  },
  {
    provider: 'codex-cli',
    name: 'GPT-5.5',
    apiName: 'gpt-5.5',
    contextWindow: 200000,
    maxTokens: 32000,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    capabilities: cliCaps
  }
];

export const CODEX_CLI_DEFAULT_MODEL = '';
