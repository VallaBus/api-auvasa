module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lib/**/*.js',
    'routes/**/*.js',
    '!lib/**/*.test.js',
    '!node_modules/**'
  ],
  testMatch: [
    '**/tests/circuit-breaker.test.js',
    '**/tests/robust-gtfs-wrapper.test.js',
    '**/tests/health-endpoints.test.js'
  ],
  setupFilesAfterEnv: [],
  testTimeout: 30000,
  verbose: true,
  // Excluir tests que requieren Docker/testcontainers por ahora
  testPathIgnorePatterns: [
    '/node_modules/',
    'tests/endpoints.test.js'
  ]
};
