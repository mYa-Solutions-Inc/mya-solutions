/**
 * FILE / ROOT: services/jean-site/src/providers/openai-compatible.js
 * DESCRIPTION: OpenAI-compatible /chat/completions provider. Works with Ollama
 *   (http://localhost:11434/v1), llama.cpp server, LM Studio, vLLM and MLX servers.
 *   Optional bearer key (JEAN_OPENAI_API_KEY); JSON mode only when JEAN_OPENAI_JSON_MODE=1.
 */

import { ProviderError, fetchWithTimeout, errorFromResponse } from './index.js';

export function createProvider(config) {
  const url = `${config.openaiBaseUrl}/chat/completions`;

  return {
    name: 'openai-compatible',
    model: config.model,

    async complete({ system, messages, maxTokens = config.maxTokens, signal }) {
      const body = {
        model: config.model,
        messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
        max_tokens: maxTokens,
        temperature: config.temperature,
        stream: false,
      };
      if (config.openaiJsonMode) body.response_format = { type: 'json_object' };

      const headers = { 'content-type': 'application/json' };
      if (config.openaiApiKey) headers.authorization = `Bearer ${config.openaiApiKey}`;

      const res = await fetchWithTimeout(
        url,
        { method: 'POST', headers, body: JSON.stringify(body) },
        { timeoutMs: config.timeoutMs, signal },
      );
      if (!res.ok) throw await errorFromResponse(res, 'openai-compatible');

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new ProviderError('openai-compatible server returned a non-JSON body', { code: 'bad_body', cause: err });
      }
      const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
      const content = choice && choice.message ? choice.message.content : null;
      if (typeof content !== 'string') {
        throw new ProviderError('openai-compatible response has no choices[0].message.content', { code: 'bad_body' });
      }
      const u = data.usage || {};
      return {
        text: content,
        stopReason: choice.finish_reason || null,
        usage: {
          inputTokens: u.prompt_tokens ?? null,
          outputTokens: u.completion_tokens ?? null,
        },
      };
    },
  };
}
