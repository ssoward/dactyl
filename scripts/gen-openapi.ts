import 'dotenv/config';
import { writeFileSync } from 'fs';
import { buildApp } from '../src/app.js';

async function main(): Promise<void> {
  const app = await buildApp({ logger: false });
  await app.ready();
  const spec = app.swagger();
  writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
  console.log('openapi.json written');
  await app.close();
}

main().catch(console.error);
