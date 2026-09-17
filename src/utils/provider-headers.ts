/** OpenRouter's optional application attribution, only for its own origin. */
export function providerHeaders(baseUrl: string): Record<string, string> {
  try {
    if (new URL(baseUrl).hostname === 'openrouter.ai') {
      return {
        'HTTP-Referer': 'https://github.com/akku1139/easywebui',
        'X-Title': 'easywebui',
      };
    }
  } catch { /* URL validation is performed by the caller. */ }
  return {};
}
