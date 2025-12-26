// Simple config for Prisma runtime without depending on the `prisma` package
module.exports = {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use process.env to avoid requiring the `prisma` package inside production images
    url: process.env.DATABASE_URL,
  },
};
