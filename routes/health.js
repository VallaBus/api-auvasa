/**
 * Endpoint de health check para monitorear el estado del sistema GTFS
 */

const express = require('express');
const { robustGtfsWrapper } = require('../lib/gtfs/robust-gtfs-wrapper');
const router = express.Router();

/**
 * @swagger
 * /health/gtfs:
 *   get:
 *     tags:
 *       - Health
 *     summary: Estado de salud del sistema GTFS Realtime
 *     description: |
 *       Proporciona información detallada sobre el estado de salud del sistema GTFS Realtime,
 *       incluyendo métricas de circuit breakers, errores recientes y tiempos de respuesta.
 *       
 *       **Estados de salud:**
 *       - `HEALTHY`: Sistema funcionando correctamente
 *       - `WARNING`: Algunos errores pero sistema funcional  
 *       - `DEGRADED`: Funcionamiento limitado
 *       - `CRITICAL`: Sistema comprometido
 *     responses:
 *       200:
 *         description: Información de estado de salud
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [HEALTHY, WARNING, DEGRADED, CRITICAL]
 *                   description: Estado general del sistema
 *                 timestamp:
 *                   type: integer
 *                   description: Timestamp de la respuesta
 *                 lastSuccessfulUpdate:
 *                   type: integer
 *                   description: Timestamp de la última actualización exitosa
 *                   nullable: true
 *                 consecutiveFailures:
 *                   type: integer
 *                   description: Número de fallos consecutivos
 *                 circuitBreakers:
 *                   type: object
 *                   description: Estado de los circuit breakers
 *                   properties:
 *                     main:
 *                       type: object
 *                       properties:
 *                         state:
 *                           type: string
 *                           enum: [CLOSED, OPEN, HALF_OPEN]
 *                         totalRequests:
 *                           type: integer
 *                         successfulRequests:
 *                           type: integer
 *                         failedRequests:
 *                           type: integer
 *                         timeouts:
 *                           type: integer
 *                         averageResponseTime:
 *                           type: number
 *                         healthStatus:
 *                           type: string
 *             examples:
 *               healthy:
 *                 summary: Sistema saludable
 *                 value:
 *                   status: "HEALTHY"
 *                   timestamp: 1693747200000
 *                   lastSuccessfulUpdate: 1693747180000
 *                   consecutiveFailures: 0
 *                   circuitBreakers:
 *                     main:
 *                       state: "CLOSED"
 *                       totalRequests: 150
 *                       successfulRequests: 148
 *                       failedRequests: 2
 *                       timeouts: 0
 *                       averageResponseTime: 1250.5
 *                       healthStatus: "HEALTHY"
 *               degraded:
 *                 summary: Sistema degradado
 *                 value:
 *                   status: "DEGRADED"
 *                   timestamp: 1693747200000
 *                   lastSuccessfulUpdate: 1693746900000
 *                   consecutiveFailures: 1
 *                   circuitBreakers:
 *                     main:
 *                       state: "OPEN"
 *                       totalRequests: 45
 *                       successfulRequests: 35
 *                       failedRequests: 10
 *                       timeouts: 3
 *                       averageResponseTime: 28500.2
 *                       healthStatus: "CRITICAL"
 */
router.get('/gtfs', (req, res) => {
  try {
    const healthStatus = robustGtfsWrapper.getHealthStatus();
    
    // Determinar código de respuesta HTTP basado en el estado
    let httpStatusCode = 200;
    if (healthStatus.status === 'CRITICAL') {
      httpStatusCode = 503; // Service Unavailable
    } else if (healthStatus.status === 'DEGRADED') {
      httpStatusCode = 503; // Service Unavailable
    } else if (healthStatus.status === 'WARNING') {
      httpStatusCode = 200; // OK pero con advertencias
    }
    
    res.status(httpStatusCode).json(healthStatus);
  } catch (error) {
    console.error('Error getting GTFS health status:', error);
    res.status(500).json({
      status: 'ERROR',
      timestamp: Date.now(),
      error: 'Unable to retrieve health status',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /health/gtfs/metrics:
 *   get:
 *     tags:
 *       - Health
 *     summary: Métricas detalladas del sistema GTFS
 *     description: |
 *       Proporciona métricas detalladas del sistema GTFS Realtime para monitoreo 
 *       y alerting automático.
 *     responses:
 *       200:
 *         description: Métricas del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uptime:
 *                   type: number
 *                   description: Porcentaje de tiempo operativo (últimas 24h)
 *                 successRate:
 *                   type: number
 *                   description: Porcentaje de operaciones exitosas
 *                 averageResponseTime:
 *                   type: number
 *                   description: Tiempo promedio de respuesta en ms
 *                 lastSuccessAgo:
 *                   type: number
 *                   description: Segundos desde la última operación exitosa
 *                 totalTimeouts:
 *                   type: integer
 *                   description: Número total de timeouts
 */
router.get('/gtfs/metrics', (req, res) => {
  try {
    const healthStats = robustGtfsWrapper.getHealthStats();
    
    // Calcular métricas adicionales
    const now = Date.now();
    const metrics = {
      timestamp: now,
      lastSuccessAgo: healthStats.lastSuccessfulUpdate 
        ? Math.floor((now - healthStats.lastSuccessfulUpdate) / 1000)
        : null,
      consecutiveFailures: healthStats.consecutiveFailures,
      circuitBreakers: {}
    };
    
    // Procesar métricas de circuit breakers
    for (const [name, stats] of Object.entries(healthStats.circuitBreakers)) {
      const successRate = stats.totalRequests > 0 
        ? (stats.successfulRequests / stats.totalRequests) * 100 
        : 0;
        
      metrics.circuitBreakers[name] = {
        ...stats,
        successRate: Math.round(successRate * 100) / 100, // 2 decimales
        lastSuccessAgo: stats.lastSuccessTime 
          ? Math.floor((now - stats.lastSuccessTime) / 1000)
          : null,
        lastFailureAgo: stats.lastFailureTime 
          ? Math.floor((now - stats.lastFailureTime) / 1000)
          : null
      };
    }
    
    res.json(metrics);
  } catch (error) {
    console.error('Error getting GTFS metrics:', error);
    res.status(500).json({
      error: 'Unable to retrieve metrics',
      message: error.message,
      timestamp: Date.now()
    });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Estado general del servicio
 *     description: Health check básico para load balancers y monitoring
 *     responses:
 *       200:
 *         description: Servicio saludable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: integer
 *                 uptime:
 *                   type: number
 *                   description: Tiempo de actividad en segundos
 *                 version:
 *                   type: string
 *       503:
 *         description: Servicio no disponible
 */
router.get('/', (req, res) => {
  const gtfsHealth = robustGtfsWrapper.getHealthStatus();
  
  // Si GTFS está crítico, considerar todo el servicio como degradado
  let overallStatus = 'OK';
  let httpStatusCode = 200;
  
  if (gtfsHealth.status === 'CRITICAL') {
    overallStatus = 'DEGRADED';
    httpStatusCode = 503;
  }
  
  res.status(httpStatusCode).json({
    status: overallStatus,
    timestamp: Date.now(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '2.0.0',
    components: {
      gtfs: {
        status: gtfsHealth.status,
        lastUpdate: gtfsHealth.lastSuccessfulUpdate
      }
    }
  });
});

module.exports = router;
