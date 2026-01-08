require('dotenv').config();

const fs = require('fs');

const containerSchemaPath = '/app/prisma/schema.prisma';
const containerMigrationsPath = '/app/prisma/migrations';

const schemaPath = fs.existsSync(containerSchemaPath)
  ? containerSchemaPath
  : 'prisma/schema.prisma';

const migrationsPath = fs.existsSync(containerMigrationsPath)
  ? containerMigrationsPath
  : 'prisma/migrations';

module.exports = {
  schema: schemaPath,
  migrations: { path: migrationsPath },
  datasource: { url: process.env.DATABASE_URL },
};
