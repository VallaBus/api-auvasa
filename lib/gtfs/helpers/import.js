const gtfsConfig = require('../config');
const { importGtfsStatics } = require('.');

async function importGtfs() {
  let gtfs;
  await import('gtfs').then((module) => {
    gtfs = module;
  });

  try {
    await importGtfsStatics();
    await gtfs.importGtfs(gtfsConfig);
  } catch (err) {
    console.error(err);
    // El proceso principal debe seguir vivo para poder reintentar la
    // actualización estática en el siguiente ciclo.
    throw err;
  }
}

// Ejecutar importGtfs() si lo llamamos directamente
if (require.main === module) {
  importGtfs();
}

module.exports = { importGtfs };
