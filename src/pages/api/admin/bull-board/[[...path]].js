import { serveJobBoard } from '@/modules/job-board/server';

export const config = { api: { bodyParser: false, externalResolver: true } };

export default serveJobBoard;
