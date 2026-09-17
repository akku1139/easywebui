import type { ToolCall } from '../types';
import { EXECUTE_TOOL } from './tool-catalog';

/** Display metadata only; this does not authorize or route a call. */
export function toolLabel(call: ToolCall): string {
  if (call.name === EXECUTE_TOOL && typeof call.arguments?.tool_id === 'string') {
    try {
      const id: unknown = JSON.parse(call.arguments.tool_id);
      if (Array.isArray(id) && id.length === 2 && id.every(part => typeof part === 'string')) {
        return `${id[1]} (${id[0]})`;
      }
    } catch { /* Older/malformed calls still have their gateway name. */ }
  }
  return call.name;
}
