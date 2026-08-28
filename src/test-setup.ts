import 'reflect-metadata';

process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-key-for-ci';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Global test setup
beforeAll(() => {
  // Set up any global test configuration
});

afterAll(() => {
  // Clean up any global test resources
}); 