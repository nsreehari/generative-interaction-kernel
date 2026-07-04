// Pure SSE framing for GUP messages. No sockets here, so this is unit-testable on its
// own: encode a message to an `data: ...\n\n` frame, and parse a byte stream (which may
// split frames across chunks) back into messages.

import type { GupMessage } from "../../../kernel/src/index";

/** Encode one GUP message as a single SSE `data:` frame. */
export function encodeSseFrame(message: GupMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}

/**
 * Incremental SSE frame parser. Feed it decoded chunks (which may contain partial or
 * multiple frames); it returns the GUP messages completed by each chunk. Non-`data:`
 * lines (comments/heartbeats like `:keep-alive`, `id:`, `event:`) are ignored per the
 * SSE spec.
 */
export class SseFrameParser {
  private buffer = "";

  push(chunk: string): GupMessage[] {
    this.buffer += chunk;
    const messages: GupMessage[] = [];
    let sep: number;
    while ((sep = this.buffer.indexOf("\n\n")) !== -1) {
      const frame = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) messages.push(JSON.parse(data) as GupMessage);
    }
    return messages;
  }
}
