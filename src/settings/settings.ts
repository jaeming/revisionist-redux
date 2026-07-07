// src/settings/settings.ts

import { ModelRegistry } from '../llm-adapter-kit/adapters/ModelRegistry';

// Define available providers
export enum AIProvider {
    ClaudeCode = 'claude-code',
    CodexCLI = 'codex-cli',
    CustomCLI = 'custom-cli',
    OpenAICompatible = 'openai-compatible',
    OpenRouter = 'openrouter',
    OpenAI = 'openai',
    Anthropic = 'anthropic',
    Google = 'google',
    Mistral = 'mistral',
    Groq = 'groq',
    Perplexity = 'perplexity',
    Requesty = 'requesty'
}

/** Providers that spawn a local process — desktop only, no API key */
export const CLI_PROVIDERS: AIProvider[] = [
    AIProvider.ClaudeCode,
    AIProvider.CodexCLI,
    AIProvider.CustomCLI
];

export interface CLIProviderSettings {
    binaryPath: string;
    extraArgs: string;
    timeoutSeconds: number;
}

/**
 * Plugin settings interface
 */
export interface PluginSettings {
    provider: AIProvider;
    apiKeys: Record<string, string>;
    /** Selected model per provider (dropdown value) */
    models: Record<string, string>;
    /** Free-text model override per provider; wins over the dropdown when set */
    customModels: Record<string, string>;
    defaultTemperature: number;
    claudeCode: CLIProviderSettings;
    codexCli: CLIProviderSettings;
    customCli: {
        commandTemplate: string;
        timeoutSeconds: number;
    };
    openaiCompatible: {
        baseUrl: string;
    };
    debugMode: boolean;
}

/**
 * Default settings for the plugin
 */
export const DEFAULT_SETTINGS: PluginSettings = {
    provider: AIProvider.ClaudeCode,
    apiKeys: {},
    models: {
        [AIProvider.ClaudeCode]: 'sonnet',
        [AIProvider.Anthropic]: 'claude-sonnet-4-5',
        [AIProvider.OpenAI]: 'gpt-4o',
        [AIProvider.OpenRouter]: 'anthropic/claude-sonnet-4.5'
    },
    customModels: {},
    defaultTemperature: 0.7,
    claudeCode: {
        binaryPath: '',
        extraArgs: '',
        timeoutSeconds: 180
    },
    codexCli: {
        binaryPath: '',
        extraArgs: '',
        timeoutSeconds: 180
    },
    customCli: {
        commandTemplate: '',
        timeoutSeconds: 180
    },
    openaiCompatible: {
        baseUrl: 'http://localhost:11434/v1'
    },
    debugMode: false
};

/**
 * Service for managing plugin settings
 */
export class SettingsService {
    private settings: PluginSettings;
    private plugin: any; // Reference to the plugin instance

    constructor(plugin: any) {
        this.plugin = plugin;
        this.settings = DEFAULT_SETTINGS;
    }

    /**
     * Load settings from Obsidian storage, merging one level deep so new
     * nested defaults survive upgrades.
     */
    async loadSettings(): Promise<void> {
        const loadedData = (await this.plugin.loadData()) || {};
        const merged: any = { ...DEFAULT_SETTINGS, ...loadedData };
        for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof PluginSettings>) {
            const defaultValue = DEFAULT_SETTINGS[key];
            if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
                merged[key] = { ...defaultValue, ...(loadedData[key] || {}) };
            }
        }
        this.settings = merged;
    }

    /**
     * Save current settings to Obsidian storage
     */
    async saveSettings(): Promise<void> {
        await this.plugin.saveData(this.settings);
    }

    /**
     * Get current settings
     */
    getSettings(): PluginSettings {
        return this.settings;
    }

    /**
     * Update specific setting value
     */
    async updateSetting<K extends keyof PluginSettings>(
        key: K,
        value: PluginSettings[K]
    ): Promise<void> {
        this.settings[key] = value;
        await this.saveSettings();
    }

    /**
     * Update nested setting value
     */
    async updateNestedSetting<K extends keyof PluginSettings, NK extends keyof PluginSettings[K]>(
        key: K,
        nestedKey: NK,
        value: PluginSettings[K][NK]
    ): Promise<void> {
        this.settings[key][nestedKey] = value;
        await this.saveSettings();
    }

    /**
     * Get API key for current provider
     */
    getApiKey(): string {
        return this.settings.apiKeys[this.settings.provider] || '';
    }

    /**
     * Set API key for specific provider
     */
    async setApiKey(provider: AIProvider, apiKey: string): Promise<void> {
        this.settings.apiKeys[provider] = apiKey;
        await this.saveSettings();
    }

    /**
     * The model to actually use for a provider: free-text override first,
     * then the dropdown selection.
     */
    getEffectiveModel(provider?: AIProvider): string {
        const p = provider || this.settings.provider;
        const override = (this.settings.customModels[p] || '').trim();
        if (override) return override;

        const stored = this.settings.models[p] || '';
        // Self-heal: a saved dropdown choice that no longer exists in the
        // registry (e.g. a retired model name) falls back to the provider's
        // first option rather than silently sending a dead model ID.
        const registryModels = ModelRegistry.getProviderModels(p);
        if (registryModels.length > 0 && !registryModels.some(m => m.apiName === stored)) {
            return registryModels[0].apiName;
        }
        return stored;
    }

    async setModel(provider: AIProvider, model: string): Promise<void> {
        this.settings.models[provider] = model;
        await this.saveSettings();
    }

    async setCustomModel(provider: AIProvider, model: string): Promise<void> {
        this.settings.customModels[provider] = model;
        await this.saveSettings();
    }

    /**
     * Get default temperature
     */
    getDefaultTemperature(): number {
        return this.settings.defaultTemperature;
    }

    /**
     * Reset settings to defaults
     */
    async resetSettings(): Promise<void> {
        this.settings = { ...DEFAULT_SETTINGS };
        await this.saveSettings();
    }

    /**
     * Check if debug mode is enabled
     */
    isDebugMode(): boolean {
        return this.settings.debugMode;
    }
}
