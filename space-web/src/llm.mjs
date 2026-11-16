import { ContentError } from './content.mjs';
import { readSse } from '../public/chat-stream.js';

export async function complete(llm, messages, { signal, emit, fetchImpl = fetch, maxTokens = 1600 }) {
  if (!llm.apiKey) throw new ContentError(503, '模型尚未配置，请站主配置 API Key');
  const provider = llm.provider || (new URL(llm.baseUrl).hostname === 'api.deepseek.com' ? 'deepseek' : 'openai-compatible');
  let upstream;
  try {
    upstream = await fetchImpl(`${llm.baseUrl}/chat/completions`, {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({ model: llm.model, messages, stream: true, max_tokens: maxTokens,
        ...(provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}) }),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ContentError(502, '暂时无法连接模型服务，请检查 API 地址或网络');
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    const code = upstream.status;
    throw new ContentError(code === 429 ? 429 : 502,
      code === 401 || code === 403 ? '模型服务认证失败，请检查 API Key' : code === 429 ? '模型服务繁忙或达到限额，请稍后重试' : code === 400 || code === 404 ? '模型或接口参数不受支持，请检查模型名称和 API 地址' : '模型服务暂时不可用，请稍后重试');
  }
  if (!upstream.headers.get('content-type')?.includes('text/event-stream')) {
    await upstream.body?.cancel();
    throw new ContentError(502, '模型服务未返回预期的数据流');
  }
  let size = 0, finished = '', done = false;
  try {
    for await (const frame of readSse(upstream.body)) {
      signal.throwIfAborted();
      if (frame.data === '[DONE]') { done = true; break; }
      let chunk;
      try { chunk = JSON.parse(frame.data); } catch { throw new ContentError(502, '模型数据流格式异常，回答已中断'); }
      if (chunk.error) throw new ContentError(502, '模型生成中断，请稍后重试');
      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finished = choice.finish_reason;
      const delta = choice?.delta?.content;
      if (typeof delta === 'string' && delta) {
        size += delta.length;
        if (size > 8000) throw new ContentError(502, '回答达到长度上限，已停止生成');
        await emit('delta', { text: delta });
      }
    }
    if (!done || !['stop', 'length'].includes(finished) || !size) throw new ContentError(502, '模型回答未完整结束，请重试');
    await emit('done', { finishReason: finished });
  } catch (error) {
    if (signal.aborted || error instanceof ContentError) throw error;
    throw new ContentError(502, '连接中断，已保留收到的回答');
  }
}
