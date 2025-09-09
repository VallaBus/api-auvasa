/**
 * Tests de integración para endpoints de health check
 * Versión simplificada sin wrapper robusto
 */

const request = require('supertest');
const express = require('express');
const { router: healthRouter, updateGtfsHealth } = require('../routes/health');

describe('Health Check Endpoints (Simplified)', () => {
  let app;

  beforeEach(() => {
    // Crear app Express con el router de health
    app = express();
    app.use('/health', healthRouter);
    
    // Reset health status by simulating a successful update
    updateGtfsHealth(true);
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
