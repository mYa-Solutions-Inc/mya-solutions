/**
 * FILE / ROOT: services/jean-site/src/providers/anthropic.js
 * DESCRIPTION: Anthropic Messages API provider. Sends the static system prompt as a text
 *   block marked cache_control: ephemeral (prompt caching), temperature 0.2, with a
 *   timeout. Returns the concatenated text blocks and normalised token usage.
 */

import { ProviderError, fetchWithTimeout, errorFromResponse } from './index.js';

export const ANTHROPIC_VERSION = '2023-06-01';

export function createProvider(config) {
  const url = `${config.anthropicBaseUrl}/v1/messages`;

  return {
    name: 'anthropic',
    model: config.model,

    async complete({ system, messages, maxTokens = config.maxTokens, signal }) {
      const body = {
        model: config.model,
        max_tokens: maxTokens,
        temperature: config.temperature,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      };

      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.anthropicApiKey,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
        },
        { timeoutMs: config.timeoutMs, signal },
      );
      if (!res.ok) throw await errorFromResponse(res, 'anthropic');

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new ProviderError('anthropic returned a non-JSON body', { code: 'bad_body', cause: err });
      }
      if (!data || !Array.isArray(data.content)) {
        throw new ProviderError('anthropic response has no content array', { code: 'bad_body' });
      }
      const text = data.content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      const u = data.usage || {};
      return {
        text,
        stopReason: data.stop_reason || null,
        usage: {
          inputTokens: u.input_tokens ?? null,
          outputTokens: u.output_tokens ?? null,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}
