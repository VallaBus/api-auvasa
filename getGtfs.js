const fs = require('fs');
const {
  downloadGtfsStatic,
  extractZip,
  moveFiles,
} = require('./lib/gtfs/helpers');

(async () => {
  try {
    // Create tmp dir
    if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');
    // Create gtfs-files dir
    if (!fs.existsSync('gtfs-files')) fs.mkdirSync('gtfs-files');
    // Descargar el archivo zip
    const result = await downloadGtfsStatic('tmp/gtfs.zip');
    if (!result.success) throw new Error(result.error);
    // Descomprimir el archivo zip
    await extractZip('tmp/gtfs.zip', 'tmp/gtfs');
    // Move files to gtfs-files dir
    moveFiles('tmp/gtfs', 'gtfs-files');
    // Remove tmp dir
    fs.rm('tmp', { recursive: true }, (err) => {
      if (err) throw err;
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
