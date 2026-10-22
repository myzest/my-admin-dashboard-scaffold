import get from 'lodash/get.js';

export class ApiError extends Error {
  constructor(message, status, code, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export async function request(url, { body, headers, ...options } = {}) {
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(hasBody ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('网络连接失败，请稍后重试', 0, 'NETWORK_ERROR');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('服务响应异常，请稍后重试', response.status, 'INVALID_RESPONSE');
  }
  if (!payload || typeof payload.status !== 'boolean') {
    throw new ApiError('服务响应格式不正确', response.status, 'INVALID_RESPONSE');
  }
  if (!response.ok || payload.status !== true) {
    throw new ApiError(
      get(payload, 'error.message', '请求失败，请稍后重试'),
      response.status,
      get(payload, 'error.code', 'REQUEST_FAILED'),
      get(payload, 'error.fields'),
    );
  }
  if (!Object.hasOwn(payload, 'data')) {
    throw new ApiError('服务响应缺少数据', response.status, 'INVALID_RESPONSE');
  }
  return payload.data;
}
