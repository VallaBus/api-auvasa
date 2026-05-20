const {
  gtfsGetStop,
  gtfsGetStops,
  gtfsGetAlerts,
  gtfsGetBusPosition,
  fetchShapesForTrip,
  fetchStopsForTrip,
  suspendedStops,
  gtfsGetTripSequence,
  gtfsGetLineas,
  gtfsGetLinea,
} = require('../gtfs');

const {
  gbfsGetStops
} = require('../gbfs');

const getParada = async (stopCode, routeShortName = null, date = null) => {
  const result = await gtfsGetStop(stopCode, routeShortName, date);
  return result;
};

const getParadas = async () => {
  const result = await gtfsGetStops();
  return result;
};

const getAlerts = async () => {
  const result = await gtfsGetAlerts();
  return result;
};

const getBusPosition = async (tripId) => {
  const result = await gtfsGetBusPosition(tripId);
  return result;
};

const getShapesForTrip = async (tripId) => {
  const result = await fetchShapesForTrip(tripId);
  return result;
};

const getStopsElementsForTrip = async (tripId) => {
  const result = await fetchStopsForTrip(tripId);
  return result;
};

const getSuspendedStops = async () => {
  const result = await suspendedStops();
  return result;
};

const getTripSequence = async (tripId) => {
  const result = await gtfsGetTripSequence(tripId);
  return result;
};

const getGbfsParadas = async () => {
  const result = await gbfsGetStops();
  return result;
};

const getLineas = async () => {
  const result = await gtfsGetLineas();
  return result;
};

const getLinea = async (routeShortName) => {
  const result = await gtfsGetLinea(routeShortName);
  return result;
};

const config = require('../gtfs/config');
const gbfsConfig = require('../gbfs/config');

const checkServicesStatus = async () => {
  const status = {
    gtfs: {
      static: false,
      realtime: {}
    },
    gbfs: false
  };

  const checkUrl = async (url, timeout = 5000, maxRetries = 2) => {
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'api-auvasa-status-check/2.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          // Éxito - si no es el primer intento, log la recuperación
          if (attempt > 0) {
            console.log(`✅ URL ${url} recovered on attempt ${attempt + 1}`);
          }
          return true;
        } else {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;
        
        // Si no es el último intento, esperar antes de reintentar
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500; // Exponential backoff: 500ms, 1s
          console.warn(`⚠️ URL ${url} failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Todos los intentos fallaron
    console.error(`❌ URL ${url} failed after ${maxRetries + 1} attempts:`, lastError?.message || 'Unknown error');
    return false;
  };

  // Realizar todas las verificaciones en paralelo
  const checks = [
    checkUrl(config.staticUrl).then(result => status.gtfs.static = result),
    checkUrl(gbfsConfig.gbfsUrl).then(result => status.gbfs = result),
    ...config.agencies.flatMap(agency => [
      agency.realtimeAlerts && checkUrl(agency.realtimeAlerts.url).then(result => {
        status.gtfs.realtime[agency.agency_key] = status.gtfs.realtime[agency.agency_key] || {};
        status.gtfs.realtime[agency.agency_key].alerts = result;
      }),
      agency.realtimeTripUpdates && checkUrl(agency.realtimeTripUpdates.url).then(result => {
        status.gtfs.realtime[agency.agency_key] = status.gtfs.realtime[agency.agency_key] || {};
        status.gtfs.realtime[agency.agency_key].tripUpdates = result;
      }),
      agency.realtimeVehiclePositions && checkUrl(agency.realtimeVehiclePositions.url).then(result => {
        status.gtfs.realtime[agency.agency_key] = status.gtfs.realtime[agency.agency_key] || {};
        status.gtfs.realtime[agency.agency_key].vehiclePositions = result;
      })
    ]).filter(Boolean)
  ];

  await Promise.all(checks);

  return status;
};

module.exports = {
  getLineas,
  getLinea,
  getParada,
  getParadas,
  getAlerts,
  getBusPosition,
  getShapesForTrip,
  getStopsElementsForTrip,
  getTripSequence,
  getSuspendedStops,
  getGbfsParadas,
  checkServicesStatus,
};
