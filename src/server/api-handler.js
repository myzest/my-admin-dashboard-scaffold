import { randomUUID } from 'node:crypto';
import getRawBody from 'raw-body';
import { UniqueConstraintError } from 'sequelize';
import { ZodError } from 'zod';
import { requireUser } from '../modules/auth/server.js';
import { HttpError } from './errors.js';
import { getValidationFields } from '../lib/validation.js';

async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'INVALID_CONTENT_TYPE', '请求必须使用 application/json');
  }
  let text;
  try {
    text = await getRawBody(req, { limit: '64kb', encoding: 'utf8' });
  } catch (error) {
    if (error.type === 'entity.too.large') {
      throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过大');
    }
    throw new HttpError(400, 'INVALID_BODY', '无法读取请求内容');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', '请求内容不是有效 JSON');
  }
}

function getPublicError(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof ZodError) {
    return new HttpError(
      400,
      'VALIDATION_ERROR',
      '请求参数不正确，请检查输入内容',
      getValidationFields(error),
    );
  }
  if (error instanceof UniqueConstraintError) {
    return new HttpError(409, 'DUPLICATE_RECORD', '名称已存在，请使用其他名称');
  }
  return new HttpError(500, 'INTERNAL_ERROR', '服务暂时不可用，请稍后重试');
}

export function createApiHandler(routes, { authenticated = true, role = 'admin' } = {}) {
  return async function apiHandler(req, res) {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const route = routes[req.method];
      if (!Object.hasOwn(routes, req.method) || typeof route !== 'function') {
        res.setHeader('Allow', Object.keys(routes).join(', '));
        throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持此请求方法');
      }
      const user = authenticated ? await requireUser(req, res, role) : null;
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
        ? await readBody(req)
        : undefined;
      const data = await route({ req, res, body, user });
      res.json({ status: true, data, error: {} });
    } catch (error) {
      const publicError = getPublicError(error);
      if (publicError.status >= 500) {
        // Deliberately exclude request bodies, cookies, SQL and credential-bearing error text.
        console.error(
          JSON.stringify({
            requestId,
            method: req.method,
            path: req.url?.split('?')[0],
            error: error.name,
            code: error.original?.code,
          }),
        );
      }
      res.status(publicError.status).json({
        status: false,
        data: {},
        error: {
          code: publicError.code,
          message: publicError.message,
          ...(publicError.fields && Object.keys(publicError.fields).length
            ? { fields: publicError.fields }
            : {}),
        },
      });
    }
  };
}
