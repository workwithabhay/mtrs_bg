import {
  type AiAssistanceProvider,
  type GenerateAssistanceInput,
  AI_ASSISTANCE_SYSTEM_INSTRUCTION,
} from './ai.interface.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';
import { logger } from '../../common/utils/logger.js';

export class OpenAiAssistanceProvider implements AiAssistanceProvider {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly modelName: string;

  constructor(apiKey: string, timeoutMs = 10000, modelName = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.modelName = modelName;
  }

  async generateAssistance(input: GenerateAssistanceInput): Promise<string> {
    const url = 'https://api.openai.com/v1/chat/completions';

    let userPrompt = `<customer_draft>\n${input.draftText.trim()}\n</customer_draft>`;

    if (input.mode) {
      const modeDescriptions: Record<string, string> = {
        fix_grammar: 'Focus on fixing spelling, punctuation, and grammatical mistakes.',
        improve_clarity: 'Focus on making the sentences clearer and easier to understand without adding information.',
        make_concise: 'Focus on removing redundant wording and expressing key points concisely.',
        professional_tone: 'Focus on polishing the tone to sound professional and articulate while preserving the original sentiment and meaning.',
      };
      const goal = modeDescriptions[input.mode] || modeDescriptions.improve_clarity;
      userPrompt += `\n\n<editing_goal>\n${goal}\n</editing_goal>`;
    }

    if (input.answers && input.answers.length > 0) {
      const answersContext = input.answers
        .map((a) => `- ${a.questionLabel}: ${a.answer.trim()}`)
        .join('\n');
      userPrompt += `\n\n<question_context>\n${answersContext}\n</question_context>`;
    }

    const payload = {
      model: this.modelName,
      temperature: 0.2,
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: AI_ASSISTANCE_SYSTEM_INSTRUCTION,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'OpenAI provider returned non-200 status code');
        throw new ServiceUnavailableError(
          'AI feedback assistance is currently unavailable. Please write your review directly.',
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const messageContent = data.choices?.[0]?.message?.content;
      if (
        !messageContent ||
        typeof messageContent !== 'string' ||
        messageContent.trim().length === 0
      ) {
        logger.warn('OpenAI provider returned empty message content');
        throw new ServiceUnavailableError(
          'AI feedback assistance could not generate a suggestion. Please write your review directly.',
        );
      }

      return messageContent.trim();
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }

      const isTimeout =
        (err instanceof Error && err.name === 'TimeoutError') ||
        (err instanceof Error && err.name === 'AbortError');

      if (isTimeout) {
        logger.warn({ timeoutMs: this.timeoutMs }, 'OpenAI provider request timed out');
      } else {
        logger.warn({ err: (err as Error).message }, 'OpenAI provider request failed');
      }

      throw new ServiceUnavailableError(
        'AI feedback assistance is currently unavailable. Please write your review directly.',
      );
    }
  }
}
