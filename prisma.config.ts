import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import fs from 'fs';

const containerSchemaPath = '/app/prisma/schema.prisma';
const containerMigrationsPath = '/app/prisma/migrations';

export default defineConfig({
  schema: fs.existsSync(containerSchemaPath)
    ? containerSchemaPath
    : 'prisma/schema.prisma',
  migrations: {
    path: fs.existsSync(containerMigrationsPath)
      ? containerMigrationsPath
      : 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
