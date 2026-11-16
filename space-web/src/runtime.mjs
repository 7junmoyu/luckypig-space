export function runtimeInfo() {
  return { node: process.version, executable: process.execPath, arch: process.arch,
    webCrypto: typeof globalThis.crypto?.randomUUID === 'function' && Boolean(globalThis.crypto?.subtle),
    fetch: typeof globalThis.fetch === 'function' };
}

export function assertRuntime(info = runtimeInfo()) {
  const major = Number(/^v?(\d+)\./.exec(info.node || '')?.[1]);
  if (!Number.isInteger(major) || major < 22) throw new Error(`当前 Node.js ${info.node} 不满足项目要求 >=22（.nvmrc 推荐 24）。请切换 Node 后重跑；运行文件：${info.executable || '未知'}。`);
  if (!info.webCrypto || !info.fetch) throw new Error(`当前 Node.js ${info.node} 缺少 Web Crypto 或 fetch；请使用完整的 Node.js 22+ 运行环境并检查启动参数。`);
  return info;
}
