import { config as loadEnv } from 'dotenv';
import { validateConfig } from './config-validator';
import * as fs from 'fs';
import * as path from 'path';

// We check if we are in a CI environment (GitHub Actions sets CI=true)
const isCI = process.env.CI === 'true';

if (isCI) {
  // Enterprise approach: In CI, we shouldn't skip validation.
  // Instead, we validate the `.env.example` file!
  // This guarantees that developers don't forget to update the example file
  // when they add new required variables to the schema.
  const examplePath = path.resolve(process.cwd(), '.env.example');
  if (fs.existsSync(examplePath)) {
    console.log('🔄 Running in CI: Validating schema against .env.example...');
    loadEnv({ path: examplePath });
  } else {
    console.warn('⚠️ Running in CI, but .env.example not found. Falling back to process.env.');
  }
} else {
  // Local development: load standard .env
  try {
    loadEnv();
  } catch {
    // Ignore
  }
}

const result = validateConfig();

if (!result.valid) {
  console.error('❌ Configuration validation failed:');
  result.errors.forEach((err) => console.error(`  - ${err.path}: ${err.message}`));

  if (isCI) {
    console.error('\n💡 Hint: You added a new required environment variable to the schema,');
    console.error('but forgot to add a dummy value for it in .env.example!');
  }

  process.exit(1);
}

console.log('✅ Configuration is valid');
process.exit(0);
