// ============================================================================
// BeeClaw Server — Middleware: 请求日志增强
// 记录请求方法、路径、状态码、耗时
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * 注册请求日志中间件
 *
 * 在每个请求完成后记录：
 * - HTTP 方法
 * - 请求路径
 * - 响应状态码
 * - 请求耗时 (ms)
 */
export function registerRequestLogger(app: FastifyInstance): void {
  // 用 onRequest hook 记录请求开始时间
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { _startTime: bigint })._startTime = process.hrtime.bigint();
  });

  // 用 onResponse hook 记录日志
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as FastifyRequest & { _startTime?: bigint })._startTime;
    const durationMs = startTime
      ? Number(process.hrtime.bigint() - startTime) / 1_000_000
      : 0;

    const statusCode = reply.statusCode;
    const method = request.method;
    const url = request.url;

    // 按状态码分级别输出
    if (statusCode >= 500) {
      console.error(`[HTTP] ${method} ${url} ${statusCode} ${durationMs.toFixed(1)}ms`);
    } else if (statusCode >= 400) {
      console.warn(`[HTTP] ${method} ${url} ${statusCode} ${durationMs.toFixed(1)}ms`);
    } else {
      console.log(`[HTTP] ${method} ${url} ${statusCode} ${durationMs.toFixed(1)}ms`);
    }
  });
}
