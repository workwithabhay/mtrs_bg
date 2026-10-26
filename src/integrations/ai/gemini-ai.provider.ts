import {
  type AiAssistanceProvider,
  type GenerateAssistanceInput,
  AI_ASSISTANCE_SYSTEM_INSTRUCTION,
} from './ai.interface.js';
import { ServiceUnavailableError } from '../../common/errors/app-error.js';
import { logger } from '../../common/utils/logger.js';

export class GeminiAiAssistanceProvider implements AiAssistanceProvider {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly modelName: string;

  constructor(apiKey: string, timeoutMs = 10000, modelName = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.modelName = modelName;
  }

  async generateAssistance(input: GenerateAssistanceInput): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${encodeURIComponent(
      this.apiKey,
    )}`;

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
      systemInstruction: {
        parts: [{ text: AI_ASSISTANCE_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2, // Low temperature for deterministic, factual editing
        maxOutputTokens: 1000,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Gemini AI provider returned non-200 status code');
        throw new ServiceUnavailableError(
          'AI feedback assistance is currently unavailable. Please write your review directly.',
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (
        !candidateText ||
        typeof candidateText !== 'string' ||
        candidateText.trim().length === 0
      ) {
        logger.warn('Gemini AI provider returned empty candidate text');
        throw new ServiceUnavailableError(
          'AI feedback assistance could not generate a suggestion. Please write your review directly.',
        );
      }

      return candidateText.trim();
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }

      const isTimeout =
        (err instanceof Error && err.name === 'TimeoutError') ||
        (err instanceof Error && err.name === 'AbortError');

      if (isTimeout) {
        logger.warn({ timeoutMs: this.timeoutMs }, 'Gemini AI provider request timed out');
      } else {
        logger.warn({ err: (err as Error).message }, 'Gemini AI provider request failed');
      }

      throw new ServiceUnavailableError(
        'AI feedback assistance is currently unavailable. Please write your review directly.',
      );
    }
  }
}
