# Restaurant Management Backend 🍕

NestJS backend for a multi-tenant restaurant management system with menu management, orders, payments (MercadoPago), and table management.

## 🚀 Features

- **Authentication**: JWT-based authentication with role-based access control
- **Multi-tenant**: Support for multiple restaurants in a single instance
- **Menu Management**: Categories and dishes with soft delete, ordering, and availability
- **Orders System**: Complete order management with status tracking and history
- **Table Management**: Manage restaurant tables with status (available, occupied, reserved, cleaning)
- **Payments**: MercadoPago integration with webhook support
- **Public API**: Public endpoints for customer-facing menu and order creation
- **Admin API**: Protected endpoints for restaurant management

## 📋 Tech Stack

- **NestJS 11** - Progressive Node.js framework
- **Prisma 7** - Next-generation ORM with PostgreSQL adapter
- **PostgreSQL** - Primary database
- **JWT** - Authentication
- **MercadoPago SDK** - Payment processing
- **TypeScript** - Type safety
- **class-validator** - DTO validation

## 📦 Installation

1. Clone the repository

```bash
git clone <repository-url>
cd resto-management-backend
```

2. Install dependencies

```bash
npm install
```

3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/resto_db?schema=public"
JWT_SECRET="your-secret-key"
MERCADOPAGO_ACCESS_TOKEN="your-mp-token"
FRONTEND_URL="http://localhost:5173"
BACKEND_URL="http://localhost:3000"
```

4. Setup database

```bash
npx prisma migrate deploy
npx prisma generate
```

5. (Optional) Seed database

```bash
npx ts-node prisma/seed.ts
```

## 🔧 Running the Application

```bash
# Development mode with hot-reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete endpoint documentation.

### Quick Reference

#### Public Endpoints

- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/restaurants/slug/:slug` - Get restaurant by slug
- `GET /api/menu/:restaurantId/categories` - Get public menu
- `POST /api/orders/:restaurantId` - Create order

#### Protected Endpoints (require JWT)

- `GET /api/auth/me` - Get current user
- `POST /api/restaurants` - Create restaurant
- `POST /api/categories/restaurant/:restaurantId` - Create category
- `POST /api/dishes/restaurant/:restaurantId` - Create dish
- `GET /api/orders/restaurant/:restaurantId` - List orders
- `PATCH /api/orders/:id/restaurant/:restaurantId/status` - Update order status
- `POST /api/tables/restaurant/:restaurantId` - Create table
- `POST /api/payments/create-preference/:orderId` - Create payment

## 🗄️ Database Schema

Main models:

- **User**: System users (admins, staff)
- **Restaurant**: Restaurant configuration
- **Category**: Menu categories
- **Dish**: Menu items
- **Order**: Customer orders with items
- **OrderStatusHistory**: Order status tracking
- **Table**: Restaurant tables
- **BusinessHour**: Operating hours

## 🔐 Authentication

All protected endpoints require a Bearer token:

```bash
Authorization: Bearer <your-jwt-token>
```

Get token by logging in:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

## 💳 MercadoPago Integration

1. Get your access token from [MercadoPago Developers](https://www.mercadopago.com.ar/developers)
2. Add to `.env`: `MERCADOPAGO_ACCESS_TOKEN=your-token`
3. Configure webhook in MP dashboard: `https://yourdomain.com/api/payments/webhook`
4. Create preference after order: `POST /api/payments/create-preference/:orderId`
5. Redirect customer to `initPoint` URL from response
6. Webhook will update order status automatically

## 🧪 Development

```bash
# Run tests
npm run test

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Lint code
npm run lint

# Format code
npm run format
```

## 📝 Database Migrations

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (⚠️ destructive)
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate

# Open Prisma Studio (DB GUI)
npx prisma studio
```

## 🏗️ Project Structure

```
src/
├── auth/           # Authentication module (JWT, guards, strategies)
├── menu/           # Menu module (categories, dishes)
├── orders/         # Orders management
├── payments/       # MercadoPago integration
├── prisma/         # Prisma service
├── restaurants/    # Restaurant CRUD
├── tables/         # Table management
└── app.module.ts   # Main application module

prisma/
├── schema.prisma   # Database schema
├── migrations/     # Migration history
└── seed.ts         # Database seeding
```

## 🌐 CORS Configuration

CORS is enabled for all origins in development. For production, configure in `main.ts`:

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
```

## 📊 Order Status Flow

```
PENDING → CONFIRMED → PREPARING → READY → DELIVERED
   ↓          ↓           ↓         ↓
CANCELLED  CANCELLED  CANCELLED  CANCELLED
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - The framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [MercadoPago](https://www.mercadopago.com.ar/) - Payment processing

$ npm run test

# e2e tests

$ npm run test:e2e

# test coverage

$ npm run test:cov

````

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
````

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
