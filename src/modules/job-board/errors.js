import { HttpError } from '../../server/errors.js';
import { logJobError } from '../../server/job-queue.js';

export function getJobBoardError(error, requestId) {
  if (error instanceof HttpError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error.code === 'EBADCSRFTOKEN') {
    return { status: 403, code: 'INVALID_CSRF_TOKEN', message: '页面凭证已失效，请刷新后重试' };
  }
  if (error.type === 'entity.parse.failed') {
    return { status: 400, code: 'INVALID_JSON', message: '请求内容不是有效 JSON' };
  }
  if (error.type === 'entity.too.large') {
    return { status: 413, code: 'BODY_TOO_LARGE', message: '请求内容过大' };
  }
  logJobError('job-board-error', error, { requestId });
  return {
    status: 503,
    code: 'JOB_BOARD_UNAVAILABLE',
    message: '后台任务服务暂时不可用，请稍后重试',
  };
}

export function sendJobBoardError(req, res, error, requestId) {
  const failure = getJobBoardError(error, requestId);
  const isStatus = req.url?.split('?')[0] === '/api/admin/bull-board/_status';
  const body = isStatus
    ? { status: false, data: {}, error: { code: failure.code, message: failure.message } }
    : {
        error: failure.status === 403 ? 'ERRORS.FORBIDDEN' : 'ERRORS.INTERNAL_SERVER_ERROR',
        message: failure.message,
      };
  // Next's json/send helpers can turn authentication failures into conditional 304 responses.
  res.statusCode = failure.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
