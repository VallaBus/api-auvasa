/**
 * @swagger
 * components:
 *   schemas:
 *     Alerta:
 *       type: object
 *       properties:
 *         causa:
 *           type: string
 *           description: La causa de la alerta.
 *         gtfsRouteId:
 *           type: string
 *           description: El identificador único de la ruta afectada por la alerta.
 *         linea:
 *           type: string
 *           description: El nombre corto de la línea de transporte afectada.
 *         parada:
 *           type: string
 *           description: El código de la parada afectada por la alerta.
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: El momento en que comenzó la alerta.
 *         end_time:
 *           type: string
 *           format: date-time
 *           description: El momento previsto de finalización de la alerta.
 *         is_update:
 *           type: boolean
 *           description: Indica si la alerta ha sido actualizada recientemente.
 *         resumen:
 *           type: string
 *           description: Un resumen breve de la alerta.
 *         descripcion:
 *           type: string
 *           description: Una descripción detallada de la alerta.
 *     Parada:
 *       type: object
 *       properties:
 *         parada:
 *           type: object
 *           properties:
 *             nombre:
 *               type: string
 *             numero:
 *               type: string
 *         lineas:
 *           type: array
 *           items:
 *             type: string
 *         ubicacion:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *               format: float
 *             y:
 *               type: number
 *               format: float
 *     StopCode:
 *       type: string
 *       example: 634
 *     ParadaDetails:
 *       type: object
 *       properties:
 *         parada:
 *           type: object
 *           properties:
 *             nombre:
 *               type: string
 *             numero:
 *               type: string
 *         lineas:
 *           type: array
 *           items:
 *             type: string
 *         ubicacion:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *               format: float
 *             y:
 *               type: number
 *               format: float
 *     LineaDetailsByDate:
 *       type: object
 *       properties:
 *         parada:
 *           type: object
 *           properties:
 *             nombre:
 *               type: string
 *             numero:
 *               type: string
 *         lineas:
 *           type: array
 *           items:
 *             type: string
 *         ubicacion:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *               format: float
 *             y:
 *               type: number
 *               format: float
 *         fechaHoraLlegada:
 *           type: string
 *           format: datetime
 *     RouteShortName:
 *       type: string
 *       example: 3
 *     ParadaDetailsByLine:
 *       type: object
 *       properties:
 *         parada:
 *           type: object
 *           properties:
 *             nombre:
 *               type: string
 *             numero:
 *               type: string
 *         lineas:
 *           type: array
 *           items:
 *             type: string
 *         ubicacion:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *               format: float
 *             y:
 *               type: number
 *               format: float
 *     BusPosition:
 *       type: object
 *       properties:
 *         updateId:
 *           type: integer
 *         latitud:
 *           type: number
 *           format: float
 *         longitud:
 *           type: number
 *           format: float
 *         velocidad:
 *           type: number
 *           format: float
 *         tripId:
 *           type: string
 *         vehicleId:
 *           type: string
 *         matricula:
 *           type: string
 *         ocupacion:
 *           type: string
 *         timestamp:
 *           type: string
 *           format: date-time
 *         isUpdated:
 *           type: boolean
 *     ParadaDetailsByDate:
 *       type: object
 *       properties:
 *         parada:
 *           type: object
 *           properties:
 *             nombre:
 *               type: string
 *               description: El nombre de la parada.
 *             numero:
 *               type: string
 *             lineas:
 *               type: array
 *               items:
 *                 type: string
 *                 description: La línea de la parada.
 *             ubicacion:
 *               type: object
 *               properties:
 *                 x:
 *                   type: number
 *                   format: float
 *                 y:
 *                   type: number
 *                   description: La longitud de la parada.
 *                 fechaHoraLlegada:
 *                   type: string
 *                   format: date-time
 *                   description: La fecha y hora de llegada de la parada.
 *                 parada:
 *                   type: string
 *                   format: date-time
 *                   description: La fecha de la parada.
 *     Date:
 *       type: string
 *       format: date
 *       description: Represents a date in ISO 8601 format (YYYYMMDD).
 *       example: 20240629
 *     SuspendedStop:
 *       type: object
 *       properties:
 *         stop_id:
 *           type: string
 *           description: The ID of the suspended stop.
 *         stop_name:
 *           type: string
 *           description: The name of the suspended stop.
 *         lineas:
 *               type: array
 *               items:
 *                 type: string
 *                 description: The lines of the suspended stop.
 *         ubicacion:
 *               type: object
 *               properties:
 *                 x:
 *                   type: number
 *                   format: float
 *                 y:
 *                   type: number
 *                   description: The longitude of the suspended stop.
 *                 fechaHoraLlegada:
 *                   type: string
 *                   format: date-time
 *                   description: The date and time of the suspended stop.
 *         parada:
 *                   type: string
 *                   format: date-time
 *                   description: The date of the suspended stop.
 *     TripId:
 *       type: string
 *       description: trip_id
 *       example: L4A2_L4A1_13
 *     ShapesGeoJson:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           format: geojson
 *     StopsGeoJson:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           format: geojson
 *     Linea:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Identificador único de la línea en GTFS
 *         numero:
 *           type: string
 *           description: Número o código corto de la línea
 *         nombre:
 *           type: string
 *           description: Nombre largo de la línea
 *         descripcion:
 *           type: string
 *           description: Descripción adicional de la línea
 *         tipo:
 *           type: integer
 *           description: Tipo de transporte (3 = autobús)
 *         url:
 *           type: string
 *           description: URL de la línea en el sitio web del operador
 *         color:
 *           type: string
 *           description: Color hexadecimal de la línea
 *         colorTexto:
 *           type: string
 *           description: Color hexadecimal del texto de la línea
 *         agencia:
 *           type: string
 *           description: Identificador de la agencia operadora
 *         totalParadas:
 *           type: integer
 *           description: Número total de paradas en esta línea
 *         totalViajes:
 *           type: integer
 *           description: Número total de viajes programados para esta línea
 *     LineaDetallada:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Identificador único de la línea en GTFS
 *         numero:
 *           type: string
 *           description: Número o código corto de la línea
 *         nombre:
 *           type: string
 *           description: Nombre largo de la línea
 *         descripcion:
 *           type: string
 *           description: Descripción adicional de la línea
 *         tipo:
 *           type: integer
 *           description: Tipo de transporte (3 = autobús)
 *         url:
 *           type: string
 *           description: URL de la línea en el sitio web del operador
 *         color:
 *           type: string
 *           description: Color hexadecimal de la línea
 *         colorTexto:
 *           type: string
 *           description: Color hexadecimal del texto de la línea
 *         agencia:
 *           type: string
 *           description: Identificador de la agencia operadora
 *         totalParadas:
 *           type: integer
 *           description: Número total de paradas en esta línea
 *         totalViajes:
 *           type: integer
 *           description: Número total de viajes programados para esta línea
 *         paradas:
 *           type: array
 *           description: Lista detallada de todas las paradas de la línea, ordenadas por orden de trayecto
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Identificador único de la parada
 *               codigo:
 *                 type: string
 *                 description: Código de la parada
 *               nombre:
 *                 type: string
 *                 description: Nombre de la parada
 *               latitud:
 *                 type: number
 *                 format: float
 *                 description: Latitud de la parada
 *               longitud:
 *                 type: number
 *                 format: float
 *                 description: Longitud de la parada
 *               url:
 *                 type: string
 *                 description: URL de la parada
 *               secuencias:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Número de secuencia(s) de la parada en la línea
 */
