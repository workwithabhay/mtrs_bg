import type { AiAssistanceProvider, GenerateAssistanceInput } from './ai.interface.js';

export class MockAiAssistanceProvider implements AiAssistanceProvider {
  /**
   * Deterministic mock implementation for testing and development.
   * Cleans grammar and improves readability without altering facts or sentiment.
   */
  async generateAssistance(input: GenerateAssistanceInput): Promise<string> {
    const rawText = input.draftText.trim();

    // Deterministic simulation hooks for automated resilience testing
    if (rawText.includes('TRIGGER_TIMEOUT')) {
      const timeoutErr = new Error('The AI assistance request timed out.');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }

    if (rawText.includes('TRIGGER_FAILURE')) {
      throw new Error('Simulated upstream AI service outage (500 Internal Error).');
    }

    if (rawText.includes('TRIGGER_EMPTY')) {
      return '';
    }

    if (rawText.includes('TRIGGER_MALFORMED')) {
      // Returns excessively large output to trigger server-side output validation
      return 'Repeated output '.repeat(300);
    }

    // Prompt injection defense: neutralize common injection directives
    let cleanText = rawText
      .replace(/ignore\s+(all\s+)?(previous\s+)?(instructions|rules|prompts)[^.]*([.!?]|$)/gi, '')
      .replace(/system\s*:[^.]*([.!?]|$)/gi, '')
      .replace(/forget\s+(all\s+)?(rules|instructions)[^.]*([.!?]|$)/gi, '')
      .replace(/write\s+a\s+\d-star\s+(glowing\s+)?review[^.]*([.!?]|$)/gi, '')
      .trim();

    // If the text became empty after stripping injection payloads, fall back to safe message
    if (!cleanText) {
      cleanText = 'The service experience was as described.';
    }

    // Simple deterministic grammar polish:
    // 1. Capitalize first letter of sentences
    // 2. Ensure trailing punctuation
    // 3. Fix common typos
    let polished = cleanText
      .replace(/\bi\b/g, 'I')
      .replace(/\bteh\b/gi, 'the')
      .replace(/\brecieved\b/gi, 'received')
      .replace(/\s+/g, ' ')
      .trim();

    if (input.mode === 'make_concise') {
      polished = polished
        .replace(/\bin my personal opinion,?\s*/gi, '')
        .replace(/\bat the end of the day,?\s*/gi, '')
        .trim();
    } else if (input.mode === 'professional_tone') {
      polished = polished
        .replace(/\bgonna\b/gi, 'going to')
        .replace(/\bwanna\b/gi, 'want to')
        .replace(/\bkinda\b/gi, 'somewhat')
        .trim();
    }

    if (polished.length > 0) {
      polished = polished.charAt(0).toUpperCase() + polished.slice(1);
      if (!/[.!?]$/.test(polished)) {
        polished += '.';
      }
    }

    // If customer answers were provided, incorporate relevant context concisely
    if (input.answers && input.answers.length > 0) {
      const answerSummaries = input.answers
        .filter((a) => a.answer && a.answer.trim().length > 0)
        .map((a) => `${a.questionLabel}: ${a.answer.trim()}`)
        .join('; ');

      if (answerSummaries.length > 0) {
        polished = `${polished} (${answerSummaries})`;
      }
    }

    return polished;
  }
}

export const mockAiProvider = new MockAiAssistanceProvider();
