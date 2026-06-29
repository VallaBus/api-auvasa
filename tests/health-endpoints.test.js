/**
 * Tests de integración para endpoints de health check
 * Versión simplificada sin wrapper robusto
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { router: healthRouter, updateGtfsHealth } = require('../routes/health');

describe('Health Check Endpoints (Simplified)', () => {
  let app;
  let originalGtfsDir;
  let tmpGtfsDir;

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}${month}${day}`;
  };

  beforeEach(() => {
    originalGtfsDir = process.env.GTFS_DIR;
    tmpGtfsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-auvasa-gtfs-'));
    const staticDir = path.join(tmpGtfsDir, 'static');
    fs.mkdirSync(staticDir, { recursive: true });

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    fs.writeFileSync(
      path.join(staticDir, 'calendar_dates.txt'),
      [
        'service_id,date,exception_type',
        `TEST_SERVICE,${formatDate(today)},1`,
        `TEST_SERVICE,${formatDate(tomorrow)},1`,
      ].join('\n'),
    );

    process.env.GTFS_DIR = path.relative(process.cwd(), tmpGtfsDir);

    // Crear app Express con el router de health
    app = express();
    app.use('/health', healthRouter);
    
    // Reset health status by simulating a successful update
    updateGtfsHealth(true);
  });

  afterEach(() => {
    if (originalGtfsDir === undefined) {
      delete process.env.GTFS_DIR;
    } else {
      process.env.GTFS_DIR = originalGtfsDir;
    }

    fs.rmSync(tmpGtfsDir, { recursive: true, force: true });
  });

  describe('GET /health - Health check general', () => {
    it('should return OK status when system is healthy', async () => {
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
            lastUpdate: expect.any(Number),
            static: expect.objectContaining({
              status: 'HEALTHY',
              hasToday: true,
              hasTomorrow: true,
            }),
            nativeTimeout: true
          }
        }
      });
    });

    it('should return degraded status when GTFS has recent error', async () => {
      // Simular error reciente
      updateGtfsHealth(false, new Error('Test error'));

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.status).toBe('DEGRADED');
      expect(response.body.components.gtfs.status).toBe('CRITICAL');
    });
  });

  describe('GET /health/gtfs - Health check específico de GTFS', () => {
    it('should return healthy status with basic metrics', async () => {
      const response = await request(app)
        .get('/health/gtfs')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'HEALTHY',
        timestamp: expect.any(Number),
        lastSuccessfulUpdate: expect.any(Number),
        lastError: null,
        static: expect.objectContaining({
          status: 'HEALTHY',
          hasToday: true,
          hasTomorrow: true,
        }),
        totalUpdates: expect.any(Number)
      });
      
      // timeSinceLastUpdate should be a number >= 0 or null (very recent update)
      expect(response.body.timeSinceLastUpdate).toBeDefined();
      if (response.body.timeSinceLastUpdate !== null) {
        expect(response.body.timeSinceLastUpdate).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return critical status when there is a recent error', async () => {
      updateGtfsHealth(false, new Error('Recent error'));

      const response = await request(app)
        .get('/health/gtfs')
        .expect(503);

      expect(response.body.status).toBe('CRITICAL');
      expect(response.body.lastError).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          error: 'Recent error'
        })
      );
    });
  });

  describe('GET /health/gtfs/metrics - Métricas detalladas', () => {
    it('should return basic metrics with native timeout flag', async () => {
      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          timestamp: expect.any(Number),
          lastSuccessAgo: expect.any(Number),
          totalUpdates: expect.any(Number),
          static: expect.objectContaining({
            status: 'HEALTHY',
          }),
          nativeTimeout: true,
          gtfsVersion: expect.any(String)
        })
      );
    });

    it('should show error information when available', async () => {
      updateGtfsHealth(false, new Error('Metrics test error'));

      const response = await request(app)
        .get('/health/gtfs/metrics')
        .expect(200);

      expect(response.body.hasRecentError).toBe(true);
      expect(response.body.lastErrorAgo).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Content-Type headers', () => {
    it('should return proper JSON content type', async () => {
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
