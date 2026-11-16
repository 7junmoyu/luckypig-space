// Run through ego-browser nodejs, in the existing local integration TaskSpace.
// This tests client streaming with an explicitly simulated browser response.
// Server transport and error handling are covered separately by chat.test.mjs.
const task = await taskSpace('luckypig-halo-live');
const page = task.page('p2');
await page.goto('http://127.0.0.1:4173/');
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await page.evaluate(() => {
  const nativeFetch = window.fetch;
  const fixture = window.__chatFixture = { requests: [], aborts: 0, retries: 0 };
  window.fetch = async (url, options = {}) => {
    if (url !== '/api/chat') return nativeFetch(url, options);
    const body = JSON.parse(options.body);
    fixture.requests.push(body);
    const slow = body.question.includes('[慢速]');
    const broken = body.question.includes('[断流]') && fixture.retries++ === 0;
    const followup = body.question.includes('追问测试');
    const text = followup ? '（模拟流）已携带上一轮问题。' : '（模拟流）这是用于测试的回答，未调用 DeepSeek。';
    const frames = [
      ['meta', { mode: 'browser-fixture', links: [{ id: '01a1aae5-487b-709e-8d7d-760365d6ca9f', title: '多媒体发布链路测试（示例）' }] }],
      ...[...text].map((character) => ['delta', { text: character }]),
      ['done', { finishReason: 'stop' }],
    ];
    let index = 0, timer, stopped = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const abort = () => {
          if (stopped) return;
          stopped = true; fixture.aborts++; clearTimeout(timer);
          controller.error(new DOMException('Aborted', 'AbortError'));
        };
        options.signal.addEventListener('abort', abort, { once: true });
        const next = () => {
          if (stopped) return;
          if (index >= frames.length || broken && index >= 5) {
            stopped = true; options.signal.removeEventListener('abort', abort); controller.close(); return;
          }
          const [event, data] = frames[index++];
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          timer = setTimeout(next, slow ? 100 : 8);
        };
        next();
      },
      cancel() { stopped = true; clearTimeout(timer); },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  };
});
await page.click('header [data-open-chat]', { label: 'open streaming chat test' });
async function send(question) {
  await page.fill('#chat-input', question);
  await page.press('#chat-input', 'Enter');
}
const idle = () => page.waitForFunction(() => document.querySelector('#chat-form').getAttribute('aria-busy') === 'false');
await send('流式测试');
await page.waitForFunction(() => document.querySelector('#chat-form').getAttribute('aria-busy') === 'true' && document.querySelector('.message.assistant:last-child p').textContent.startsWith('（'));
await idle();
await send('追问测试');
await idle();
const followup = await page.evaluate(() => window.__chatFixture.requests[1].history);
if (followup.length !== 2 || followup[0].content !== '流式测试') throw new Error('Conversation history missing');
await send('[断流]');
await idle();
await page.waitForSelector('.message-retry');
const before = await page.evaluate(() => document.querySelectorAll('.message.user').length);
await page.click('.message-retry', { label: 'retry interrupted answer' });
await idle();
if (await page.evaluate(() => document.querySelectorAll('.message.user').length) !== before) throw new Error('Retry duplicated user message');
await send('[慢速] 停止测试');
await page.waitForFunction(() => document.querySelector('.message.assistant:last-child p').textContent.startsWith('（'));
await page.click('#chat-stop', { label: 'stop active text stream' });
await idle();
if (!await page.evaluate(() => document.querySelector('.message.assistant:last-child').textContent.includes('已停止生成'))) throw new Error('Stop state missing');
await send('[慢速] 重置测试');
await page.waitForFunction(() => document.querySelector('#chat-form').getAttribute('aria-busy') === 'true');
await page.click('#chat-new', { label: 'reset while stream active' });
await idle();
const reset = await page.evaluate(() => ({ count: document.querySelectorAll('.message').length, aborts: window.__chatFixture.aborts }));
if (reset.count !== 1 || reset.aborts < 2) throw new Error('New conversation did not cancel old request');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const mobile = await page.evaluate(() => {
  const dialog = document.querySelector('#chat-dialog');
  const stop = document.querySelector('#chat-new').getBoundingClientRect();
  return { viewport: innerWidth, width: dialog.getBoundingClientRect().width, content: dialog.scrollWidth, resetControl: stop.left >= 0 && stop.right <= innerWidth };
});
if (mobile.viewport !== 390 || mobile.content > mobile.width + 1 || !mobile.resetControl) throw new Error('Mobile conversation overflow');
console.log({ simulatedBrowserStreaming: 'passed', multiTurn: 'passed', retryWithoutDuplicate: 'passed', stop: 'passed', resetAbortsOldRequest: 'passed', mobile });
// Reload destroys the browser-only fixture and restores real HTTP requests.
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.cdp('Emulation.setEmulatedMedia', { features: [] });
await page.reload();
await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
if (await page.evaluate(() => Boolean(window.__chatFixture))) throw new Error('Browser fixture was not cleared');
console.log({ restoredRealWebsite: true });
