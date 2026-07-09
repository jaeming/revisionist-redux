// main.ts
import { 
    Plugin, 
    Editor,
    Menu,
    Notice,
    MarkdownView
} from 'obsidian';

import { SettingsService, AIProvider, PluginSettings } from './settings/settings';
import { SettingTab } from './settings/settingsTab';
import { RevisionModal } from './ui/revisionModal';
import { ResultModal } from './ui/resultModal';
import { createAdapter } from './llm-adapter-kit/adapters';
import { SupportedProvider, LLMResponse, GenerateOptions, AdapterFactoryConfig } from './llm-adapter-kit/adapters/types';
import { ModelRegistry } from './llm-adapter-kit/adapters/ModelRegistry';
import { BaseAdapter } from './llm-adapter-kit/adapters/BaseAdapter';
import { CONFIG } from './config';

export default class AIRevisionPlugin extends Plugin {
    private settingsService: SettingsService;
    private aiAdapter: BaseAdapter;

    async onload() {
        // Initialize services
        this.settingsService = new SettingsService(this);
        await this.settingsService.loadSettings();
        
        // Initialize AI adapter based on settings
        this.initializeAIAdapter();

        // Add settings tab
        this.addSettingTab(new SettingTab(
            this.app,
            this,
            this.settingsService
        ));

        // Add ribbon icon for mobile-friendly access
        this.addRibbonIcon('wand-2', 'Revise selected text', () => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView?.editor) {
                const selectedText = activeView.editor.getSelection();
                if (selectedText) {
                    this.handleRevisionRequest(activeView.editor);
                } else {
                    new Notice('Please select text to revise');
                }
            }
        });

        // Add command to command palette
        this.addCommand({
            id: 'revise-text',
            name: 'Revise selected text',
            editorCallback: (editor: Editor) => {
                this.handleRevisionRequest(editor);
            }
        });

        // Register context menu event
        this.registerEvent(
            this.app.workspace.on(
                "editor-menu",
                (menu: Menu, editor: Editor) => {
                    // Only add menu item if text is selected
                    if (editor.getSelection()) {
                        menu.addItem((item) => {
                            item
                                .setTitle("Revise with AI")
                                .setIcon("wand-2")
                                .onClick(() => {
                                    this.handleRevisionRequest(editor);
                                });
                        });
                    }
                }
            )
        );
    }

    /**
     * Initialize or reinitialize the AI adapter based on current settings
     */
    private initializeAIAdapter() {
        const settings = this.settingsService.getSettings();

        try {
            const providerName = settings.provider.toLowerCase() as SupportedProvider;
            this.aiAdapter = createAdapter(
                providerName,
                this.settingsService.getEffectiveModel(),
                this.buildAdapterConfig(settings)
            );
        } catch (error) {
            console.error('Failed to initialize AI provider:', error);
            new Notice('Failed to initialize AI provider. Check console for details.');
        }
    }

    /**
     * Assemble the provider-specific configuration for the adapter factory
     */
    private buildAdapterConfig(settings: PluginSettings): AdapterFactoryConfig {
        const splitArgs = (raw: string): string[] =>
            raw.trim() ? raw.trim().split(/\s+/) : [];

        switch (settings.provider) {
            case AIProvider.ClaudeCode:
                return {
                    cli: {
                        binaryPath: settings.claudeCode.binaryPath,
                        extraArgs: splitArgs(settings.claudeCode.extraArgs),
                        timeoutMs: settings.claudeCode.timeoutSeconds * 1000
                    }
                };
            case AIProvider.CodexCLI:
                return {
                    cli: {
                        binaryPath: settings.codexCli.binaryPath,
                        extraArgs: splitArgs(settings.codexCli.extraArgs),
                        timeoutMs: settings.codexCli.timeoutSeconds * 1000
                    }
                };
            case AIProvider.GeminiCLI:
                return {
                    cli: {
                        binaryPath: settings.geminiCli.binaryPath,
                        extraArgs: splitArgs(settings.geminiCli.extraArgs),
                        timeoutMs: settings.geminiCli.timeoutSeconds * 1000
                    }
                };
            case AIProvider.AntigravityCLI:
                return {
                    cli: {
                        binaryPath: settings.antigravityCli.binaryPath,
                        extraArgs: splitArgs(settings.antigravityCli.extraArgs),
                        timeoutMs: settings.antigravityCli.timeoutSeconds * 1000
                    }
                };
            case AIProvider.CustomCLI:
                return {
                    cli: {
                        commandTemplate: settings.customCli.commandTemplate,
                        timeoutMs: settings.customCli.timeoutSeconds * 1000
                    }
                };
            case AIProvider.OpenAICompatible:
                return {
                    baseUrl: settings.openaiCompatible.baseUrl,
                    apiKey: settings.apiKeys[AIProvider.OpenAICompatible]
                };
            default:
                return { apiKey: settings.apiKeys[settings.provider] };
        }
    }

    /**
     * Settings changed: rebuild the adapter so every option takes effect
     */
    updateAdapterConfig() {
        this.initializeAIAdapter();
    }

    /**
     * Check if adapter is available
     */
    private async isAdapterReady(): Promise<boolean> {
        if (!this.aiAdapter) return false;
        try {
            return await this.aiAdapter.isAvailable();
        } catch (error) {
            return false;
        }
    }

    /**
     * Calculate approximate cost based on token usage and model rates
     */
    private calculateApproximateCost(tokens: { input: number; output: number }, modelName: string): { input: number; output: number; total: number } | undefined {
        try {
            // Use ModelRegistry to get model info
            const models = ModelRegistry.getLatestModels();
            const model = models.find(m => m.apiName === modelName || m.name === modelName);
            
            if (!model) {
                return undefined;
            }

            const inputCost = (tokens.input / 1_000_000) * model.inputCostPerMillion;
            const outputCost = (tokens.output / 1_000_000) * model.outputCostPerMillion;
            
            return {
                input: inputCost,
                output: outputCost,
                total: inputCost + outputCost
            };
        } catch (error) {
            console.warn('Failed to calculate cost:', error);
            return undefined;
        }
    }

    /**
     * Helper function to count words in text
     */
    private countWords(text: string): number {
        return text.trim().split(/\s+/).length;
    }

    /**
     * Handle the text revision request from either command palette or context menu
     */
    private async handleRevisionRequest(editor: Editor) {
        const selectedText = editor.getSelection();
        const fullNoteContent = editor.getValue();  // Get full note content
        
        if (!selectedText) {
            new Notice('Please select text to revise');
            return;
        }

        const wordCount = this.countWords(selectedText);
        const WORD_LIMIT = 800;

        if (wordCount > WORD_LIMIT) {
            new Notice(`Warning: Selected text is ${wordCount} words. The AI may struggle with more than ${WORD_LIMIT} words at once. Consider selecting a smaller portion.`, 10000);
        }

        // Check if adapter is ready
        if (!(await this.isAdapterReady())) {
            new Notice('AI provider is not properly configured. Please check settings.');
            return;
        }

        // Show revision modal
        const revisionModal = new RevisionModal(
            this.app,
            this.settingsService,
            selectedText,
            fullNoteContent,  // Pass full note content
            async (result) => {
                try {
                    new Notice('Generating revision...');

                    const contextualPrompt = CONFIG.PROMPTS.formatUserPrompt(
                        result.instructions,
                        selectedText,
                        fullNoteContent
                    );

                    const generateOptions: GenerateOptions = {
                        model: result.model,
                        temperature: result.temperature,
                        maxTokens: 4096,
                        systemPrompt: CONFIG.PROMPTS.SYSTEM,
                        // Never serve a cached revision — "Retry" must regenerate
                        disableCache: true
                    };

                    const response: LLMResponse = await this.aiAdapter.generate(contextualPrompt, generateOptions);

                    // Prefer real cost reported by the provider (e.g. claude -p),
                    // fall back to registry-rate estimation
                    const cost = response.cost
                        ? {
                            input: response.cost.inputCost,
                            output: response.cost.outputCost,
                            total: response.cost.totalCost
                        }
                        : response.usage
                            ? this.calculateApproximateCost({
                                input: response.usage.promptTokens,
                                output: response.usage.completionTokens
                            }, result.model)
                            : undefined;

                    // Show result modal with cost
                    new ResultModal(
                        this.app,
                        {
                            originalText: selectedText,
                            revisedText: response.text,
                            editor: editor,
                            onRetry: () => {
                                this.handleRevisionRequest(editor);
                            },
                            cost: cost
                        }
                    ).open();

                } catch (error) {
                    new Notice(`Error: ${error.message}`);
                }
            }
        );

        revisionModal.open();
    }

    /**
     * Test the connection to the current AI provider
     */
    async testConnection(): Promise<boolean> {
        return await this.isAdapterReady();
    }

    /**
     * Test the connection and explain the result
     */
    async testConnectionDetailed(): Promise<{ ok: boolean; detail: string }> {
        if (!this.aiAdapter) {
            return { ok: false, detail: 'No AI provider initialized. Check the plugin settings.' };
        }
        return await this.aiAdapter.checkAvailability();
    }

    async onunload() {
        // Cleanup
    }
}
