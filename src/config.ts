// config.ts

/**
 * Shared configuration values for the plugin
 */
export const CONFIG = {
    REFERRER: 'https://www.synapticlabs.ai',
    APP_NAME: 'Revisionist',
    
    PROMPTS: {
        /**
         * System prompt for AI models
         */
        SYSTEM: '# MISSION\nAct as a professional ghostwriter and editing assistant, who specializes in text revision and improvement while mimicking the style of the original author.\n\n# RESPONSIBILITY\nYou will be provided with some instructions and a selection of text. You will transform this text with the author instructions maintaining the tone, intent, and style as best you can while incorporating the edits.\n\n# OUTPUT CONTRACT (STRICT)\nYour entire reply will be pasted directly over the selected text by a machine. Therefore:\n- Reply with ONLY the revised text. No preamble, no explanation, no commentary, no insight blocks, no markdown fences around it.\n- Provide exactly ONE revision. Never offer alternates, options, or variations.\n- Do not address the author or ask questions.\n- Do not include the surrounding document context in your reply — only the replacement for the selected text.\n\n# GUIDELINES\n- Maintain the length of the given text, unless asked to make it shorter or longer by the author.\n- Maintain the style and tone of the provided text in your revision unless otherwise stated by the author',

        /**
         * Format for user prompts
         * @param instructions - User's specific revision instructions
         * @param selectedText - The text selected by the user for revision
         * @param fullNote - The full content of the note
         * @returns Formatted user prompt
         */
        formatUserPrompt: (instructions: string, selectedText: string, fullNote: string) =>
            `
Revise the following text based on the following

## Full Document (context only — do NOT include this in your reply)
${fullNote}

## Text to revise
${selectedText}

## Instructions
${instructions}

## Reminder
Reply with ONLY the single revised version of the "Text to revise" section — one option, no commentary, no alternates, nothing before or after it. Your reply replaces the selected text verbatim.
`
    },

    SUGGESTION_PROMPTS: [
        {
            type: 'clarify',
            prompt: 'Improve the clarity of the text while maintaining its original meaning.',
            icon: '💡',
            color: '#4caf50' // green
        },
        {
            type: 'trim',
            prompt: 'Make the text more concise without losing key information.',
            icon: '✂️',
            color: '#2196f3' // blue
        },
        {
            type: 'expand',
            prompt: 'Expand the text to provide more detailed information.',
            icon: '🔍',
            color: '#ff9800' // orange
        },
        {
            type: 'fix',
            prompt: 'Fix any grammatical errors and improve the overall writing quality.',
            icon: '📖',
            color: '#9c27b0' // purple
        }
    ]
};

export interface SuggestionPrompt {
    type: 'clarify' | 'trim' | 'expand' | 'fix';
    prompt: string;
    icon: string;
    color: string;
}