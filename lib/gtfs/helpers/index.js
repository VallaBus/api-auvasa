const fs = require('fs');
const { staticUrl: gtfsStaticUrl } = require('../config');
const decompress = require('decompress');

const { environment } = require('../../utils');
const { GTFS_DIR } = environment;

const downloadGtfsStatic = async (targetFile) => {
  try {
    const response = await fetch(gtfsStaticUrl);

    // Verificar si la respuesta es exitosa (200-299)
    if (!response.ok) {
      throw new Error(`Error al descargar GTFS: ${response.status} - ${response.statusText}`);
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
      console.log('*** Usando archivos GTFS estáticos locales (GTFS_STATIC_DISABLE_DOWNLOAD=true) ***');
      // Copiar archivos desde gtfs-files a static
      copyFiles(localFilesPath, staticPath);
      return;
    }

    // Create tmp dir
    if (!fs.existsSync(tmpPath)) fs.mkdirSync(tmpPath);
    
    // Descargar el archivo zip
    const result = await downloadGtfsStatic(`${tmpPath}/gtfs.zip`);
    if (!result.success) {
      console.error('No se pudo descargar el archivo GTFS:', result.error);
    } else {
      // Continuar con el procesamiento normal
      // Descomprimir el archivo zip
      await decompress(`${tmpPath}/gtfs.zip`, `${tmpPath}/gtfs`);
      // Move txt files to gtfs-files dir
      moveFiles(`${tmpPath}/gtfs`, staticPath);
    }
    // Remove tmp dir
    fs.rm(tmpPath, { recursive: true }, (err) => {
      if (err) throw err;
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports = {
  importGtfsStatics,
  downloadGtfsStatic,
  moveFiles,
  copyFiles,
};
