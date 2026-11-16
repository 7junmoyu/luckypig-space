// Shared by the browser and the server: UTF-8 and SSE frames can cross chunks.
export async function* readSse(body) {
  if (!body) throw new Error('响应没有数据流');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data = [];
  let frameSize = 0;
  const line = (value) => {
    if (value === '') {
      const frame = data.length ? { event, data: data.join('\n') } : null;
      event = 'message'; data = []; frameSize = 0;
      return frame;
    }
    frameSize += value.length;
    if (frameSize > 65536) throw new Error('数据流片段过长');
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    if (value.startsWith('event:')) event = value.slice(6).trim();
    return null;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const frame = line(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
        if (frame) yield frame;
      }
      if (buffer.length > 65536) throw new Error('数据流片段过长');
      if (done) break;
    }
    // An unterminated event is deliberately discarded. Callers require done.
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
