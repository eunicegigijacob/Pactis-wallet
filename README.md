# Wallet System API

A comprehensive wallet system API built with NestJS, featuring transaction management, concurrency handling, caching, and message queues.

## Features

### Core Features
- ✅ **Wallet Creation** - Create wallets with unique IDs and initial balances
- ✅ **Deposit Funds** - Safe concurrent deposits with database locking
- ✅ **Withdraw Funds** - Prevent overdraws with balance validation
- ✅ **Transfer Funds** - Atomic transfers between wallets with idempotency
- ✅ **Transaction History** - Paginated transaction history with filtering

### Advanced Features
- ✅ **Concurrency & Deadlock Prevention** - Pessimistic locking for safe concurrent operations
- ✅ **Message Queues** - Bull queue integration for async transaction processing
- ✅ **Caching with Redis** - Cache wallet balances and transaction data
- ✅ **Latency Optimization** - Optimized queries and caching strategies

## Tech Stack

- **Backend Framework**: NestJS (Node.js + TypeScript)
- **Database**: MySQL with TypeORM
- **Caching**: Redis with cache-manager
- **Message Queue**: Bull (Redis-based)
- **Validation**: class-validator
- **Documentation**: Swagger/OpenAPI

## Prerequisites

- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- Redis (v6.0 or higher)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wallet-system-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your database and Redis credentials:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_USERNAME=root
   DB_PASSWORD=your_password
   DB_DATABASE=wallet_system

   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_DB=0

   # Application Configuration
   PORT=3000
   NODE_ENV=development
   ```

4. **Database Setup**
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE wallet_system;"
   
   # Run migrations
   mysql -u root -p wallet_system < src/database/migrations/001-create-wallets-table.sql
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run start:dev
   
   # Production mode
   npm run build
   npm run start:prod
   ```

## API Documentation

Once the application is running, visit:
- **API Documentation**: http://localhost:3000/api/v1
- **Health Check**: http://localhost:3000/api/v1/health

## API Endpoints

### Wallets

#### Create Wallet
```http
POST /api/v1/wallets
Content-Type: application/json

{
  "userId": "user123",
  "initialBalance": 100.00,
  "currency": "USD"
}
```

#### Get Wallet
```http
GET /api/v1/wallets/{walletId}
```

#### Get Wallet by User ID
```http
GET /api/v1/wallets/user/{userId}
```

#### Get Wallet Balance
```http
GET /api/v1/wallets/{walletId}/balance
```

#### Deposit Funds
```http
POST /api/v1/wallets/deposit
Content-Type: application/json

{
  "walletId": "wallet-uuid",
  "amount": 50.00,
  "description": "Salary deposit"
}
```

#### Withdraw Funds
```http
POST /api/v1/wallets/withdraw
Content-Type: application/json

{
  "walletId": "wallet-uuid",
  "amount": 25.00,
  "description": "ATM withdrawal"
}
```

#### Update Wallet Status
```http
PUT /api/v1/wallets/{walletId}/status
Content-Type: application/json

{
  "status": "suspended"
}
```

### Transactions

#### Transfer Funds
```http
POST /api/v1/transactions/transfer
Content-Type: application/json

{
  "fromWalletId": "wallet-uuid-1",
  "toWalletId": "wallet-uuid-2",
  "amount": 100.00,
  "description": "Payment for services",
  "transactionId": "optional-idempotency-key"
}
```

#### Async Transfer
```http
POST /api/v1/transactions/transfer/async
Content-Type: application/json

{
  "fromWalletId": "wallet-uuid-1",
  "toWalletId": "wallet-uuid-2",
  "amount": 100.00
}
```

#### Get Transaction History
```http
GET /api/v1/transactions/history?walletId={walletId}&page=1&limit=20&type=transfer
```

#### Get Transaction
```http
GET /api/v1/transactions/{transactionId}
```

#### Get Transaction Statistics
```http
GET /api/v1/transactions/wallet/{walletId}/stats
```

## Concurrency Handling

The system implements several mechanisms to handle concurrent operations safely:

### Database-Level Locking
- **Pessimistic Locking**: Uses `SELECT ... FOR UPDATE` to lock rows during transactions
- **Version Control**: Optimistic locking with version columns to detect conflicts

### Application-Level Protection
- **Transaction Isolation**: All balance updates happen within database transactions
- **Idempotency**: Transfer operations support idempotency keys to prevent duplicate processing

## Caching Strategy

### Redis Caching
- **Wallet Data**: Cached for 5 minutes with automatic invalidation on updates
- **Balance Queries**: Fast balance lookups with cache-aside pattern
- **Transaction History**: Cached paginated results for frequently accessed data

### Cache Invalidation
- Automatic cache invalidation when wallet data is updated
- TTL-based expiration for data freshness

## Message Queue Integration

### Bull Queue Features
- **Async Processing**: Non-blocking transaction processing
- **Retry Logic**: Exponential backoff for failed jobs
- **Job Monitoring**: Queue statistics and job status tracking
- **Dead Letter Queue**: Failed jobs are moved to DLQ for manual review

## Performance Optimizations

### Database Optimizations
- **Indexed Queries**: Optimized indexes for common query patterns
- **Connection Pooling**: Efficient database connection management
- **Query Optimization**: Optimized SQL queries with proper joins

### Caching Optimizations
- **Cache-Aside Pattern**: Read-through caching for frequently accessed data
- **Write-Through**: Immediate cache updates on data changes
- **TTL Management**: Appropriate cache expiration times

## Error Handling

The API implements comprehensive error handling:

- **Validation Errors**: Input validation with detailed error messages
- **Business Logic Errors**: Proper error codes for insufficient funds, invalid states
- **System Errors**: Graceful handling of database and external service failures
- **Idempotency Errors**: Clear error messages for duplicate transaction attempts

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Monitoring

### Health Checks
- Database connectivity
- Redis connectivity
- Queue health status

### Metrics
- Transaction processing times
- Cache hit rates
- Queue job statistics

## Deployment

### Docker (Recommended)
```bash
# Build image
docker build -t wallet-system-api .

# Run container
docker run -p 3000:3000 wallet-system-api
```

### Manual Deployment
```bash
# Build application
npm run build

# Start production server
npm run start:prod
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License. 