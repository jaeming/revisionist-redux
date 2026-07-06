// src/settings/settingsTab.ts

import { App, Platform, PluginSettingTab, Setting, Notice } from 'obsidian';
import { AIProvider, CLI_PROVIDERS, SettingsService } from './settings';
import { ModelRegistry } from '../llm-adapter-kit/adapters/ModelRegistry';

export class SettingTab extends PluginSettingTab {
    private settingsService: SettingsService;
    private plugin: any;

    constructor(app: App, plugin: any, settingsService: SettingsService) {
        super(app, plugin);
        this.plugin = plugin;
        this.settingsService = settingsService;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.addProviderSelection(containerEl);
        this.addProviderSpecificSettings(containerEl);
        this.addModelSettings(containerEl);
        this.addDefaultSettings(containerEl);
    }

    private addProviderSelection(containerEl: HTMLElement): void {
        const settings = this.settingsService.getSettings();

        new Setting(containerEl)
            .setName('AI provider')
            .setDesc('CLI providers use your existing tool login (no API key, desktop only)')
            .addDropdown(dropdown => {
                Object.values(AIProvider).forEach(provider => {
                    if (CLI_PROVIDERS.includes(provider) && !Platform.isDesktop) return;
                    dropdown.addOption(provider, this.getProviderDisplayName(provider));
                });

                dropdown
                    .setValue(settings.provider)
                    .onChange(async (value) => {
                        await this.settingsService.updateSetting('provider', value as AIProvider);
                        this.plugin.updateAdapterConfig();
                        this.display();
                    });
            });
    }

    private addProviderSpecificSettings(containerEl: HTMLElement): void {
        const settings = this.settingsService.getSettings();
        const provider = settings.provider;

        switch (provider) {
            case AIProvider.ClaudeCode:
                this.addCLISettings(containerEl, 'claudeCode', 'claude',
                    'Path to the claude binary. Leave empty to search PATH and common install locations.');
                break;
            case AIProvider.CodexCLI:
                this.addCLISettings(containerEl, 'codexCli', 'codex',
                    'Path to the codex binary. Leave empty to search PATH, common locations, and the Codex app bundle.');
                break;
            case AIProvider.CustomCLI:
                this.addCustomCLISettings(containerEl);
                break;
            case AIProvider.OpenAICompatible:
                this.addOpenAICompatibleSettings(containerEl);
                break;
            default:
                this.addApiKeySettings(containerEl, provider);
        }

        new Setting(containerEl)
            .addButton(button => {
                button
                    .setButtonText('Test connection')
                    .onClick(async () => {
                        await this.handleTestConnection(button);
                    });
            });
    }

    private addCLISettings(
        containerEl: HTMLElement,
        settingsKey: 'claudeCode' | 'codexCli',
        binaryName: string,
        pathDesc: string
    ): void {
        const settings = this.settingsService.getSettings();

        new Setting(containerEl)
            .setName(`${binaryName} binary path`)
            .setDesc(pathDesc)
            .addText(text => {
                text
                    .setPlaceholder(`auto-detect ${binaryName}`)
                    .setValue(settings[settingsKey].binaryPath)
                    .onChange(async (value) => {
                        await this.settingsService.updateNestedSetting(settingsKey, 'binaryPath', value.trim());
                        this.plugin.updateAdapterConfig();
                    });
            });

        new Setting(containerEl)
            .setName('Extra arguments')
            .setDesc('Optional additional CLI flags, space-separated')
            .addText(text => {
                text
                    .setValue(settings[settingsKey].extraArgs)
                    .onChange(async (value) => {
                        await this.settingsService.updateNestedSetting(settingsKey, 'extraArgs', value);
                        this.plugin.updateAdapterConfig();
                    });
            });

        this.addTimeoutSetting(containerEl, settingsKey);
    }

    private addCustomCLISettings(containerEl: HTMLElement): void {
        const settings = this.settingsService.getSettings();

        new Setting(containerEl)
            .setName('Command template')
            .setDesc('Command to run. {model} is replaced with the model name; the prompt is piped to stdin unless {prompt} appears. Example: ollama run {model}')
            .addText(text => {
                text
                    .setPlaceholder('ollama run {model}')
                    .setValue(settings.customCli.commandTemplate)
                    .onChange(async (value) => {
                        await this.settingsService.updateNestedSetting('customCli', 'commandTemplate', value);
                        this.plugin.updateAdapterConfig();
                    });
                text.inputEl.style.width = '100%';
            });

        this.addTimeoutSetting(containerEl, 'customCli');
    }

    private addOpenAICompatibleSettings(containerEl: HTMLElement): void {
        const settings = this.settingsService.getSettings();

        new Setting(containerEl)
            .setName('Base URL')
            .setDesc('OpenAI-compatible endpoint, e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio)')
            .addText(text => {
                text
                    .setPlaceholder('http://localhost:11434/v1')
                    .setValue(settings.openaiCompatible.baseUrl)
                    .onChange(async (value) => {
                        await this.settingsService.updateNestedSetting('openaiCompatible', 'baseUrl', value.trim());
                        this.plugin.updateAdapterConfig();
                    });
            });

        new Setting(containerEl)
            .setName('API key (optional)')
            .setDesc('Most local servers need none; hosted gateways may require one')
            .addText(text => {
                text
                    .setValue(settings.apiKeys[AIProvider.OpenAICompatible] || '')
                    .onChange(async (value) => {
                        await this.settingsService.setApiKey(AIProvider.OpenAICompatible, value);
                        this.plugin.updateAdapterConfig();
                    });
                text.inputEl.type = 'password';
            });
    }

    private addTimeoutSetting(
        containerEl: HTMLElement,
        settingsKey: 'claudeCode' | 'codexCli' | 'customCli'
    ): void {
        const settings = this.settingsService.getSettings();

        new Setting(containerEl)
            .setName('Timeout (seconds)')
            .setDesc('How long to wait for the CLI before giving up')
            .addText(text => {
                text
                    .setValue(String(settings[settingsKey].timeoutSeconds))
                    .onChange(async (value) => {
                        const parsed = parseInt(value, 10);
                        if (!isNaN(parsed) && parsed > 0) {
                            await this.settingsService.updateNestedSetting(settingsKey, 'timeoutSeconds', parsed);
                            this.plugin.updateAdapterConfig();
                        }
                    });
            });
    }

    private async handleTestConnection(button: any) {
        button.setButtonText('Testing...');
        button.setDisabled(true);

        try {
            const success = await this.plugin.testConnection();
            if (success) {
                new Notice('Connection test successful!');
            } else {
                new Notice('Connection test failed. Please check your settings.');
            }
        } catch (error) {
            new Notice(`Connection test error: ${error.message}`);
        } finally {
            button.setButtonText('Test connection');
            button.setDisabled(false);
        }
    }

    private addApiKeySettings(containerEl: HTMLElement, provider: AIProvider): void {
        const settings = this.settingsService.getSettings();
        const providerInfo = this.getProviderInfo(provider);

        new Setting(containerEl)
            .setName(`${providerInfo.name} API key`)
            .setDesc(`Enter your ${providerInfo.name} API key`)
            .addText(text => {
                text
                    .setPlaceholder('Enter API key')
                    .setValue(settings.apiKeys[provider] || '')
                    .onChange(async (value) => {
                        await this.settingsService.setApiKey(provider, value);
                        this.plugin.updateAdapterConfig();
                    });
                text.inputEl.type = 'password';
            })
            .addExtraButton(button => {
                button
                    .setIcon('external-link')
                    .setTooltip('Get API key')
                    .onClick(() => {
                        window.open(providerInfo.keyUrl);
                    });
            });
    }

    private getProviderInfo(provider: AIProvider): { name: string; keyUrl: string } {
        const providerMap: Partial<Record<AIProvider, { name: string; keyUrl: string }>> = {
            [AIProvider.OpenRouter]: { name: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys' },
            [AIProvider.OpenAI]: { name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys' },
            [AIProvider.Anthropic]: { name: 'Anthropic', keyUrl: 'https://console.anthropic.com/settings/keys' },
            [AIProvider.Google]: { name: 'Google Gemini', keyUrl: 'https://aistudio.google.com/app/apikey' },
            [AIProvider.Mistral]: { name: 'Mistral', keyUrl: 'https://console.mistral.ai/api-keys/' },
            [AIProvider.Groq]: { name: 'Groq', keyUrl: 'https://console.groq.com/keys' },
            [AIProvider.Perplexity]: { name: 'Perplexity', keyUrl: 'https://www.perplexity.ai/settings/api' },
            [AIProvider.Requesty]: { name: 'Requesty', keyUrl: 'https://requesty.ai/dashboard' }
        };
        return providerMap[provider] || { name: provider, keyUrl: '#' };
    }

    private addModelSettings(containerEl: HTMLElement): void {
        const settings = this.settingsService.getSettings();
        const provider = settings.provider;
        const models = ModelRegistry.getProviderModels(provider);

        if (models.length > 0) {
            new Setting(containerEl)
                .setName('Model')
                .setDesc('Select the model to use')
                .addDropdown(dropdown => {
                    models.forEach(model => {
                        dropdown.addOption(model.apiName, model.name);
                    });

                    const current = settings.models[provider] || models[0].apiName;
                    dropdown
                        .setValue(current)
                        .onChange(async (value) => {
                            await this.settingsService.setModel(provider, value);
                            this.plugin.updateAdapterConfig();
                        });
                });
        }

        new Setting(containerEl)
            .setName(models.length > 0 ? 'Custom model (optional)' : 'Model')
            .setDesc(models.length > 0
                ? 'Overrides the dropdown when set — use any model ID the provider accepts'
                : 'Model name to use, e.g. llama3.3 or mistral-nemo')
            .addText(text => {
                text
                    .setPlaceholder(models.length > 0 ? 'leave empty to use dropdown' : 'model name')
                    .setValue(settings.customModels[provider] || '')
                    .onChange(async (value) => {
                        await this.settingsService.setCustomModel(provider, value);
                        this.plugin.updateAdapterConfig();
                    });
            });
    }

    private addDefaultSettings(containerEl: HTMLElement): void {
        const settings = this.settingsService.getSettings();

        new Setting(containerEl)
            .setName('Default temperature')
            .setDesc('Set the default temperature for the AI model (0.0 - 1.0). CLI providers ignore this.')
            .addSlider(slider => {
                slider
                    .setLimits(0, 1, 0.05)
                    .setValue(settings.defaultTemperature)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        await this.settingsService.updateSetting('defaultTemperature', value);
                    });
            });
    }

    private getProviderDisplayName(provider: AIProvider): string {
        const displayNames: Record<AIProvider, string> = {
            [AIProvider.ClaudeCode]: 'Claude Code (subscription, no API key)',
            [AIProvider.CodexCLI]: 'OpenAI Codex CLI (subscription, no API key)',
            [AIProvider.CustomCLI]: 'Custom CLI command',
            [AIProvider.OpenAICompatible]: 'OpenAI-compatible endpoint (Ollama, LM Studio…)',
            [AIProvider.OpenRouter]: 'OpenRouter',
            [AIProvider.OpenAI]: 'OpenAI',
            [AIProvider.Anthropic]: 'Anthropic (Claude)',
            [AIProvider.Google]: 'Google (Gemini)',
            [AIProvider.Mistral]: 'Mistral',
            [AIProvider.Groq]: 'Groq',
            [AIProvider.Perplexity]: 'Perplexity',
            [AIProvider.Requesty]: 'Requesty'
        };
        return displayNames[provider] || provider;
    }
}
