import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { openApiDocument } from '../src/modules/openapi/server.js';

const target = new URL('../docs/openapi.json', import.meta.url);
await writeFile(
  target,
  await format(JSON.stringify(openApiDocument), {
    ...(await resolveConfig(fileURLToPath(target))),
    parser: 'json',
  }),
);
console.log('已生成 docs/openapi.json');
