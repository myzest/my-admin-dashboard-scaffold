import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { openApiDocument } from '../src/modules/openapi/server.js';

test('the generated OpenAPI artifact stays in sync with the public health contract', async () => {
  const generated = JSON.parse(await readFile(new URL('../docs/openapi.json', import.meta.url)));
  assert.deepEqual(generated, openApiDocument, '请运行 npm run openapi:generate 更新契约文件');
  assert.deepEqual(Object.keys(generated.paths), ['/health']);
  assert.deepEqual(generated.paths['/health'].get.security, []);
});
