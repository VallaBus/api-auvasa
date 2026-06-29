/**
 * Endpoint de health check para monitorear el estado del sistema GTFS
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// Simple health tracking without robust wrapper
let lastGtfsUpdate = null;
let lastGtfsError = null;
let gtfsUpdateCount = 0;

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
};

const getStaticGtfsHealth = () => {
  const gtfsDir = process.env.GTFS_DIR || 'lib/gtfs';
  const calendarDatesPath = path.join(process.cwd(), gtfsDir, 'static', 'calendar_dates.txt');
  const now = new Date();
  const today = formatDate(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  if (!fs.existsSync(calendarDatesPath)) {
    return {
      status: 'CRITICAL',
      calendarDatesPath,
      error: 'calendar_dates.txt not found',
      today,
      tomorrow,
    };
  }

  const stats = fs.statSync(calendarDatesPath);
  const uniqueDates = new Set();
  const lines = fs.readFileSync(calendarDatesPath, 'utf8').trim().split(/\r?\n/);

  lines.slice(1).forEach((line) => {
    const [, date] = line.split(',');
    if (date) uniqueDates.add(date);
  });

  const dates = [...uniqueDates].sort();
  const hasToday = uniqueDates.has(today);
  const hasTomorrow = uniqueDates.has(tomorrow);
  const maxDate = dates[dates.length - 1] || null;
  const status = hasToday && hasTomorrow ? 'HEALTHY' : 'CRITICAL';

  return {
    status,
    calendarDatesPath,
    lastModified: stats.mtime.toISOString(),
    datesCount: dates.length,
    minDate: dates[0] || null,
    maxDate,
    today,
    tomorrow,
    hasToday,
    hasTomorrow,
  };
};

// Function to update GTFS health status (to be called from GTFS module)
function updateGtfsHealth(success, error = null) {
  if (success) {
    lastGtfsUpdate = Date.now();
    lastGtfsError = null;
  } else {
    lastGtfsError = { timestamp: Date.now(), error: error?.message || 'Unknown error' };
  }
  gtfsUpdateCount++;
}

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
    const now = Date.now();
    const timeSinceLastUpdate = lastGtfsUpdate ? now - lastGtfsUpdate : null;
    const timeSinceLastError = lastGtfsError ? now - lastGtfsError.timestamp : null;
    const staticGtfs = getStaticGtfsHealth();
    
    // Determine health status
    let status = 'HEALTHY';
    let httpStatusCode = 200;
    
    if (staticGtfs.status === 'CRITICAL') {
      status = 'CRITICAL';
      httpStatusCode = 503;
    } else if (lastGtfsError && timeSinceLastError < 300000) { // Error in last 5 minutes
      status = 'CRITICAL';
      httpStatusCode = 503;
    } else if (timeSinceLastUpdate && timeSinceLastUpdate > 300000) { // No update in 5 minutes
      status = 'DEGRADED';
      httpStatusCode = 503;
    } else if (timeSinceLastUpdate && timeSinceLastUpdate > 120000) { // No update in 2 minutes
      status = 'WARNING';
    }
    
    const healthStatus = {
      status,
      timestamp: now,
      lastSuccessfulUpdate: lastGtfsUpdate,
      lastError: lastGtfsError,
      static: staticGtfs,
      totalUpdates: gtfsUpdateCount,
      timeSinceLastUpdate: timeSinceLastUpdate ? Math.floor(timeSinceLastUpdate / 1000) : null
    };
    
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
    const now = Date.now();
    const staticGtfs = getStaticGtfsHealth();
    const metrics = {
      timestamp: now,
      lastSuccessAgo: lastGtfsUpdate 
        ? Math.floor((now - lastGtfsUpdate) / 1000)
        : null,
      lastErrorAgo: lastGtfsError 
        ? Math.floor((now - lastGtfsError.timestamp) / 1000)
        : null,
      totalUpdates: gtfsUpdateCount,
      static: staticGtfs,
      hasRecentError: lastGtfsError && (now - lastGtfsError.timestamp) < 300000,
      nativeTimeout: true, // Indicates we're using native GTFS timeout
      gtfsVersion: '4.18.0' // Current version with native timeout support
    };
    
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
  const now = Date.now();
  const timeSinceLastUpdate = lastGtfsUpdate ? now - lastGtfsUpdate : null;
  const staticGtfs = getStaticGtfsHealth();
  
  // Si GTFS está crítico, considerar todo el servicio como degradado
  let overallStatus = 'OK';
  let httpStatusCode = 200;
  let gtfsStatus = 'HEALTHY';
  
  if (staticGtfs.status === 'CRITICAL') {
    overallStatus = 'DEGRADED';
    httpStatusCode = 503;
    gtfsStatus = 'CRITICAL';
  } else if (lastGtfsError && (now - lastGtfsError.timestamp) < 300000) {
    overallStatus = 'DEGRADED';
    httpStatusCode = 503;
    gtfsStatus = 'CRITICAL';
  } else if (timeSinceLastUpdate && timeSinceLastUpdate > 300000) {
    overallStatus = 'DEGRADED';
    httpStatusCode = 503;
    gtfsStatus = 'DEGRADED';
  }
  
  res.status(httpStatusCode).json({
    status: overallStatus,
    timestamp: now,
    uptime: process.uptime(),
    version: process.env.npm_package_version || '2.0.0',
    components: {
      gtfs: {
        status: gtfsStatus,
        lastUpdate: lastGtfsUpdate,
        static: staticGtfs,
        nativeTimeout: true
      }
    }
  });
});

module.exports = { router, updateGtfsHealth, getStaticGtfsHealth };
