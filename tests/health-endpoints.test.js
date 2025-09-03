/**
 * Tests de integración para endpoints de health check
 * Verifica respuestas de /health, /health/gtfs y /health/gtfs/metrics
 * según diferentes estados del sistema GTFS
 */

const request = require('supertest');
const express = require('express');
const healthRouter = require('../routes/health');
const { robustGtfsWrapper } = require('../lib/gtfs/robust-gtfs-wrapper');
const {
  GtfsScenarios,
  EnvironmentUtils,
  ConsoleUtils
} = require('./mocks/gtfs-mocks');

describe('Health Check Endpoints', () => {
  let app;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeAll(() => {
    EnvironmentUtils.backup();
  });

  afterAll(() => {
    EnvironmentUtils.restore();
    ConsoleUtils.restoreAll();
  });

  beforeEach(() => {
    // Configurar environment para testing
    EnvironmentUtils.setupGtfsEnv({
      GTFS_REALTIME_TIMEOUT: '1000',
      GTFS_CB_FAILURE_THRESHOLD: '2',
      GTFS_CB_RESET_TIMEOUT: '5000'
    });

    // Crear app Express con el router de health
    app = express();
    app.use('/health', healthRouter);

    // Resetear estado del wrapper
    robustGtfsWrapper.lastSuccessfulUpdate = null;
    robustGtfsWrapper.consecutiveFailures = 0;
    robustGtfsWrapper.circuitBreakers.main.failureCount = 0;
    robustGtfsWrapper.circuitBreakers.main.state = 'CLOSED';
    robustGtfsWrapper.circuitBreakers.network.failureCount = 0;
    robustGtfsWrapper.circuitBreakers.network.state = 'CLOSED';

    // Spies para logging
    consoleLogSpy = ConsoleUtils.createLogSpy();
    consoleErrorSpy = ConsoleUtils.createErrorSpy();
  });

  afterEach(() => {
    ConsoleUtils.restoreAll();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('GET /health - Health check general', () => {
    it('should return OK status when system is healthy', async () => {
      // Simular sistema saludable
      robustGtfsWrapper.lastSuccessfulUpdate = Date.now() - 60000; // 1 minuto atrás
      robustGtfsWrapper.consecutiveFailures = 0;

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'OK',
        timestamp: expect.any(Number),
        uptime: expect.any(Number),
        version: expect.any(String),
        components: {
          gtfs: {
            status: 'HEALTHY',
            lastUpdate: expect.any(Number)
          }
        }
      });
    });

    it('should return degraded status when GTFS is critical', async () => {
      // Simular estado crítico del GTFS
      robustGtfsWrapper.consecutiveFailures = 5;
      robustGtfsWrapper.circuitBreakers.main.state = 'OPEN';

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('DEGRADED');
      expect(response.body.components.gtfs.status).toBe('CRITICAL');
    });

    it('should include proper uptime and version information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.version).toBeDefined();
      expect(response.body.timestamp).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('GET /health/gtfs - Health check específico de GTFS', () => {
    it('should return healthy status with detailed metrics', async () => {
      // Simular sistema saludable
      robustGtfsWrapper.lastSuccessfulUpdate = Date.now() - 30000; // 30 segundos atrás
      robustGtfsWrapper.consecutiveFailures = 0;

      const response = await request(app)
        .get('/health/gtfs')
        .expect(200);

      expect(response.body).toEqual({
        status: 'HEALTHY',
        timestamp: expect.any(Number),
        lastSuccessfulUpdate: expect.any(Number),
        consecutiveFailures: 0,
        circuitBreakers: {
          main: expect.objectContaining({
            totalRequests: expect.any(Number),
            successfulRequests: expect.any(Number),
            failedRequests: expect.any(Number),
            timeouts: expect.any(Number),
            state: 'CLOSED',
            healthStatus: expect.any(String)
          }),
          network: expect.objectContaining({
            totalRequests: expect.any(Number),
            successfulRequests: expect.any(Number),
            failedRequests: expect.any(Number),
            timeouts: expect.any(Number),
            state: 'CLOSED',
            healthStatus: expect.any(String)
          })
        }
      });
    });


    it('should return degraded status when last success is too old', async () => {
      // Simular última actualización exitosa hace más de 5 minutos
      robustGtfsWrapper.lastSuccessfulUpdate = Date.now() - (6 * 60 * 1000);
      robustGtfsWrapper.consecutiveFailures = 0;

      const response = await request(app)
        .get('/health/gtfs')
        .expect(503);

      expect(response.body.status).toBe('DEGRADED');
    });

    it('should return critical status with 503 after multiple failures', async () => {
      robustGtfsWrapper.consecutiveFailures = 5;
      robustGtfsWrapper.circuitBreakers.main.state = 'OPEN';
      robustGtfsWrapper.circuitBreakers.main.stats.failedRequests = 10;

      const response = await request(app)
        .get('/health/gtfs')
        .expect(503);

      expect(response.body.status).toBe('CRITICAL');
      expect(response.body.consecutiveFailures).toBe(5);
      expect(response.body.circuitBreakers.main.state).toBe('OPEN');
    });

    it('should include circuit breaker state information', async () => {
      // Configurar estado específico del circuit breaker
      robustGtfsWrapper.circuitBreakers.main.stats.totalRequests = 100;
      robustGtfsWrapper.circuitBreakers.main.stats.successfulRequests = 85;
      robustGtfsWrapper.circuitBreakers.main.stats.failedRequests = 15;
      robustGtfsWrapper.circuitBreakers.main.stats.timeouts = 3;

      const response = await request(app)
        .get('/health/gtfs')
        .expect(200);

      const mainCircuitBreaker = response.body.circuitBreakers.main;
      expect(mainCircuitBreaker.totalRequests).toBe(100);
      expect(mainCircuitBreaker.successfulRequests).toBe(85);
      expect(mainCircuitBreaker.failedRequests).toBe(15);
      expect(mainCircuitBreaker.timeouts).toBe(3);
    });
  });

  describe('GET /health/gtfs/metrics - Métricas detalladas', () => {
    it('should return processed metrics with calculated fields', async () => {
      const now = Date.now();
      robustGtfsWrapper.lastSuccessfulUpdate = now - 120000; // 2 minutos atrás
      robustGtfsWrapper.consecutiveFailures = 2;

      // Configurar métricas del circuit breaker principal
      robustGtfsWrapper.circuitBreakers.main.stats.totalRequests = 50;
      robustGtfsWrapper.circuitBreakers.main.stats.successfulRequests = 45;
      robustGtfsWrapper.circuitBreakers.main.stats.failedRequests = 5;
      robustGtfsWrapper.circuitBreakers.main.stats.lastSuccessTime = now - 180000; // 3 minutos atrás
      robustGtfsWrapper.circuitBreakers.main.stats.lastFailureTime = now - 60000; // 1 minuto atrás

      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(200);

      expect(response.body).toEqual({
        timestamp: expect.any(Number),
        lastSuccessAgo: expect.any(Number), // Segundos desde la última actualización exitosa
        consecutiveFailures: 2,
        circuitBreakers: {
          main: expect.objectContaining({
            totalRequests: 50,
            successfulRequests: 45,
            failedRequests: 5,
            successRate: 90, // (45/50) * 100
            lastSuccessAgo: expect.any(Number), // Segundos desde el último éxito
            lastFailureAgo: expect.any(Number), // Segundos desde el último fallo
            state: 'CLOSED',
            healthStatus: expect.any(String)
          }),
          network: expect.objectContaining({
            successRate: expect.any(Number),
            lastSuccessAgo: null, // Null si nunca tuvo éxito
            lastFailureAgo: null, // Null si nunca tuvo fallo
            state: 'CLOSED'
          })
        }
      });

      // Verificar cálculos específicos
      expect(response.body.lastSuccessAgo).toBeGreaterThan(110);
      expect(response.body.lastSuccessAgo).toBeLessThan(130);
      expect(response.body.circuitBreakers.main.successRate).toBe(90);
    });

    it('should handle null timestamps correctly', async () => {
      // No configurar timestamps para probar manejo de null
      robustGtfsWrapper.lastSuccessfulUpdate = null;
      robustGtfsWrapper.circuitBreakers.main.stats.lastSuccessTime = null;
      robustGtfsWrapper.circuitBreakers.main.stats.lastFailureTime = null;

      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(200);

      expect(response.body.lastSuccessAgo).toBeNull();
      expect(response.body.circuitBreakers.main.lastSuccessAgo).toBeNull();
      expect(response.body.circuitBreakers.main.lastFailureAgo).toBeNull();
    });

    it('should calculate success rates correctly', async () => {
      // Configurar diferentes ratios de éxito
      robustGtfsWrapper.circuitBreakers.main.stats.totalRequests = 200;
      robustGtfsWrapper.circuitBreakers.main.stats.successfulRequests = 170;

      robustGtfsWrapper.circuitBreakers.network.stats.totalRequests = 75;
      robustGtfsWrapper.circuitBreakers.network.stats.successfulRequests = 60;

      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(200);

      expect(response.body.circuitBreakers.main.successRate).toBe(85); // (170/200)*100
      expect(response.body.circuitBreakers.network.successRate).toBe(80); // (60/75)*100
    });

    it('should handle zero total requests', async () => {
      // Circuit breakers sin actividad
      robustGtfsWrapper.circuitBreakers.main.stats.totalRequests = 0;
      robustGtfsWrapper.circuitBreakers.network.stats.totalRequests = 0;

      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(200);

      expect(response.body.circuitBreakers.main.successRate).toBe(0);
      expect(response.body.circuitBreakers.network.successRate).toBe(0);
    });
  });

  describe('Manejo de errores', () => {
    it('should handle errors in health status gracefully', async () => {
      // Simular error en getHealthStatus
      const originalGetHealthStatus = robustGtfsWrapper.getHealthStatus;
      robustGtfsWrapper.getHealthStatus = jest.fn(() => {
        throw new Error('Health status error');
      });

      const response = await request(app)
        .get('/health/gtfs')
        .expect(500);

      expect(response.body).toEqual({
        status: 'ERROR',
        timestamp: expect.any(Number),
        error: 'Unable to retrieve health status',
        message: 'Health status error'
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error getting GTFS health status:',
        expect.any(Error)
      );

      // Restaurar método original
      robustGtfsWrapper.getHealthStatus = originalGetHealthStatus;
    });

    it('should handle errors in metrics gracefully', async () => {
      // Simular error en getHealthStats
      const originalGetHealthStats = robustGtfsWrapper.getHealthStats;
      robustGtfsWrapper.getHealthStats = jest.fn(() => {
        throw new Error('Health stats error');
      });

      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Unable to retrieve metrics',
        message: 'Health stats error',
        timestamp: expect.any(Number)
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error getting GTFS metrics:',
        expect.any(Error)
      );

      // Restaurar método original
      robustGtfsWrapper.getHealthStats = originalGetHealthStats;
    });
  });

  describe('Códigos de respuesta HTTP correctos', () => {
    it('should return 200 for healthy states', async () => {
      robustGtfsWrapper.consecutiveFailures = 0;
      await request(app).get('/health').expect(200);
      await request(app).get('/health/gtfs').expect(200);
      await request(app).get('/health/gtfs/metrics').expect(200);
    });

    it('should return 200 for warning state', async () => {
      robustGtfsWrapper.consecutiveFailures = 1;
      await request(app).get('/health/gtfs').expect(200);
    });

    it('should return 503 for degraded and critical states', async () => {
      // Estado degradado (última actualización muy antigua)
      robustGtfsWrapper.lastSuccessfulUpdate = Date.now() - (10 * 60 * 1000);
      robustGtfsWrapper.consecutiveFailures = 0; // Sin fallos consecutivos, pero degradado por tiempo
      await request(app).get('/health/gtfs').expect(503);
      
      // Para /health el estado degradado debería resultar en DEGRADED solo si GTFS es crítico
      // pero para last success antiguo, GTFS será DEGRADED, no CRITICAL
      await request(app).get('/health').expect(200); // GTFS degradado no hace el servicio crítico

      // Reset estado para test independiente
      robustGtfsWrapper.lastSuccessfulUpdate = Date.now() - 60000; // Recent success
      
      // Estado crítico (muchos fallos)
      robustGtfsWrapper.consecutiveFailures = 5;
      await request(app).get('/health').expect(503);
      await request(app).get('/health/gtfs').expect(503);
    });
  });

  describe('Estructura de respuesta JSON', () => {
    it('should always include required timestamp field', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health/gtfs'),
        request(app).get('/health/gtfs/metrics')
      ]);

      responses.forEach(response => {
        expect(response.body.timestamp).toBeGreaterThan(Date.now() - 1000);
        expect(response.body.timestamp).toBeLessThanOrEqual(Date.now());
      });
    });

    it('should include proper Content-Type header', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health/gtfs'),
        request(app).get('/health/gtfs/metrics')
      ]);

      responses.forEach(response => {
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });
    });
  });

});
