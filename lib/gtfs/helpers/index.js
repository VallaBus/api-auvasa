const fs = require('fs');
const path = require('path');
const StreamZip = require('node-stream-zip');
const { staticUrl: gtfsStaticUrl, downloadTimeout } = require('../config');

const { environment } = require('../../utils');
const { GTFS_DIR } = environment;

const extractZip = async (archivePath, destinationPath) => {
  const destination = path.resolve(destinationPath);
  const zip = new StreamZip.async({
    file: path.resolve(archivePath),
    skipEntryNameValidation: false,
  });

  await fs.promises.mkdir(destination, { recursive: true });

  try {
    return await zip.extract(null, destination);
  } finally {
    await zip.close();
  }
};

const getCalendarDatesCoverage = (staticPath) => {
  const calendarDatesPath = path.join(staticPath, 'calendar_dates.txt');

  if (!fs.existsSync(calendarDatesPath)) {
    return {
      exists: false,
      datesCount: 0,
      minDate: null,
      maxDate: null,
    };
  }

  const uniqueDates = new Set();
  const lines = fs
    .readFileSync(calendarDatesPath, 'utf8')
    .trim()
    .split(/\r?\n/);

  lines.slice(1).forEach((line) => {
    const [, date] = line.split(',');
    if (date) uniqueDates.add(date);
  });

  const sortedDates = [...uniqueDates].sort();

  return {
    exists: true,
    datesCount: sortedDates.length,
    minDate: sortedDates[0] || null,
    maxDate: sortedDates[sortedDates.length - 1] || null,
  };
};

const assertGtfsStaticCoverage = (staticPath) => {
  const coverage = getCalendarDatesCoverage(staticPath);

  if (!coverage.exists || coverage.datesCount === 0) {
    throw new Error(
      `GTFS estático inválido: ${staticPath}/calendar_dates.txt no contiene fechas`,
    );
  }

  console.log('*** Cobertura GTFS estático AUVASA ***', coverage);
  return coverage;
};

const downloadGtfsStatic = async (targetFile) => {
  try {
    const response = await fetch(gtfsStaticUrl, {
      signal: AbortSignal.timeout(downloadTimeout || 30000),
    });

    // Verificar si la respuesta es exitosa (200-299)
    if (!response.ok) {
      throw new Error(
        `Error al descargar GTFS: ${response.status} - ${response.statusText}`,
      );
    }

    // Obtener el cuerpo de la respuesta como ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // Crear un Buffer desde el ArrayBuffer
    const buffer = Buffer.from(arrayBuffer);

    // Escribir el buffer en el archivo zip
    fs.writeFileSync(targetFile, buffer);

    return { success: true };
  } catch (err) {
    console.error('Error en downloadGtfsStatic:', err.message);
    return { success: false, error: err.message };
  }
};

const moveFiles = async (from, to) => {
  const jsonFiles = fs.readdirSync(from);
  jsonFiles.forEach((file) => {
    // Excluimos agency.txt para usar la copia local que tenemos
    // ya que tiene errores en remoto
    if (file.includes('agency.txt')) return;
    fs.renameSync(`${from}/${file}`, `${to}/${file}`);
  });
};

const copyFiles = async (from, to) => {
  const jsonFiles = fs.readdirSync(from);
  jsonFiles.forEach((file) => {
    // Excluimos agency.txt para usar la copia local que tenemos
    // ya que tiene errores en remoto
    if (file.includes('agency.txt')) return;
    fs.copyFileSync(`${from}/${file}`, `${to}/${file}`);
  });
};

const importGtfsStatics = async () => {
  try {
    const tmpPath = `${GTFS_DIR}/tmp`;
    const staticPath = `${GTFS_DIR}/static`;
    const localFilesPath = 'gtfs-files';

    // Create static files dir if it doesn't exist
    if (!fs.existsSync(staticPath)) fs.mkdirSync(staticPath);

    if (process.env.GTFS_STATIC_DISABLE_DOWNLOAD === 'true') {
      console.log(
        '*** Usando archivos GTFS estáticos locales (GTFS_STATIC_DISABLE_DOWNLOAD=true) ***',
      );
      // Copiar archivos desde gtfs-files a static
      copyFiles(localFilesPath, staticPath);
      assertGtfsStaticCoverage(staticPath);
      return;
    }

    // Create tmp dir
    if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath);

    // Descargar el archivo zip
    const result = await downloadGtfsStatic(`${tmpPath}/gtfs.zip`);
    if (!result.success) {
      console.error('No se pudo descargar el archivo GTFS:', result.error);
      assertGtfsStaticCoverage(staticPath);
    } else {
      // Continuar con el procesamiento normal
      // Descomprimir el archivo zip
      await extractZip(`${tmpPath}/gtfs.zip`, `${tmpPath}/gtfs`);
      assertGtfsStaticCoverage(`${tmpPath}/gtfs`);
      // Move txt files to gtfs-files dir
      await moveFiles(`${tmpPath}/gtfs`, staticPath);
      assertGtfsStaticCoverage(staticPath);
    }
    // Remove tmp dir
    await fs.promises.rm(tmpPath, { recursive: true, force: true });
  } catch (error) {
    console.log(error);
    throw error;
  }
};

module.exports = {
  importGtfsStatics,
  downloadGtfsStatic,
  extractZip,
  moveFiles,
  copyFiles,
};
