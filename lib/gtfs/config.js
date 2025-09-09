const { environment } = require('../utils');

const { GTFS_DIR } = environment;

const config = {
  sqlitePath: `${GTFS_DIR}/database.sqlite`,
  downloadTimeout: 30000, // Default 30 second timeout for realtime feeds (native support in v4.18.0)
  agencies: [
    {
      agency_key: 'AUVASA',
      path: `${GTFS_DIR}/static`,
      "realtimeAlerts": {
        "url": "http://212.170.201.204:50080/GTFSRTapi/api/alert",
        "timeout": 10000 // Shorter timeout for alerts (10s) as they're more prone to hanging
      },
      "realtimeTripUpdates": {
        "url": "http://212.170.201.204:50080/GTFSRTapi/api/tripupdate",
        "timeout": 15000 // 15s timeout for trip updates
      },
      "realtimeVehiclePositions": {
        "url": "http://212.170.201.204:50080/GTFSRTapi/api/vehicleposition",
        "timeout": 15000 // 15s timeout for vehicle positions
      }
    },
    {
      agency_key: 'ECSA',
      path: `${GTFS_DIR}/static/ecsa`,
    },
    {
      agency_key: 'LaRegional',
      path: `${GTFS_DIR}/static/laregional`,
    },
    {
      agency_key: 'LINECAR',
      path: `${GTFS_DIR}/static/linecar`,
    },
  ],
  staticUrl: 'http://212.170.201.204:50080/GTFSRTapi/api/GTFSFile',
  ignoreDuplicates: true,
  ignoreErrors: true,
  gtfsRealtimeExpirationSeconds: 40,
};

module.exports = config;
