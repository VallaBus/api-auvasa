# Nuevas Rutas de Líneas - Documentación de Cambios

## Resumen
Se han agregado dos nuevas rutas GET a la API para obtener información detallada de las líneas de transporte:

1. **GET /api/v2/lineas** - Obtiene una lista de todas las líneas disponibles
2. **GET /api/v2/lineas/:routeShortName** - Obtiene información detallada de una línea específica

## Cambios Realizados

### 1. Backend Functions (`lib/gtfs/index.js`)

Se agregaron dos nuevas funciones:

#### `gtfsGetLineas()`
- Obtiene información de todas las líneas GTFS disponibles
- Retorna: array de objetos con propiedades:
  - `id`: Identificador único de GTFS
  - `numero`: Código/número de línea (ej: "1", "2", "C1")
  - `nombre`: Nombre largo de la línea
  - `descripcion`: Descripción adicional
  - `tipo`: Tipo de transporte (3 = autobús)
  - `url`: URL de la línea en AUVASA
  - `color`: Color hexadecimal de la línea (ej: "#36AD30")
  - `colorTexto`: Color hexadecimal del texto
  - `agencia`: ID de la agencia operadora
  - `totalParadas`: Número de paradas
  - `totalViajes`: Número de viajes programados

#### `gtfsGetLinea(routeShortName)`
- Obtiene información detallada de una línea específica
- Parámetro: `routeShortName` (ej: "1", "2", "C1")
- Retorna: objeto con toda la información anterior + array de paradas
- Cada parada incluye:
  - `id`, `codigo`, `nombre`, `latitud`, `longitud`, `url`
  - `secuencias`: Array de números de secuencia en la línea

### 2. API Layer (`lib/v2/index.js`)

Se agregaron dos nuevas funciones wrapper:
- `getLineas()` - Wrapper de `gtfsGetLineas()`
- `getLinea(routeShortName)` - Wrapper de `gtfsGetLinea()`

Y se exportaron para que estén disponibles en las rutas.

### 3. Express Routes (`routes/v2/index.js`)

Se agregaron dos nuevas rutas:

```javascript
// GET /lineas - Obtiene todas las líneas
routes.get('/lineas', async (req, res) => {
  const lineas = await getLineas();
  return res.json(lineas);
});

// GET /lineas/:routeShortName - Obtiene una línea específica
routes.get('/lineas/:routeShortName', async (req, res) => {
  const { routeShortName } = req.params;
  const linea = await getLinea(routeShortName);
  
  if (linea.error) {
    return res.status(404).json(linea);
  }
  
  return res.json(linea);
});
```

### 4. Documentación API (`routes/v2/schemas.js`)

Se agregaron dos nuevos esquemas OpenAPI/Swagger:

#### `Linea`
Esquema para la respuesta de GET /lineas con las propiedades básicas de cada línea.

#### `LineaDetallada`
Esquema para la respuesta de GET /lineas/:routeShortName con las propiedades completas incluyendo todas las paradas.

### 5. README.md

Se agregó documentación con ejemplos de uso:
- Ejemplos de curl para ambas rutas
- Respuestas JSON de ejemplo
- Explicación de los parámetros

## Ejemplos de Uso

### Obtener todas las líneas

```bash
curl -X GET http://localhost:3000/api/v2/lineas
```

**Respuesta:**
```json
[
  {
    "id": "1",
    "numero": "1",
    "nombre": "Barrio España - Covaresa",
    "color": "#36AD30",
    "colorTexto": "#FFFFFF",
    "totalParadas": 42,
    "totalViajes": 156
  },
  ...
]
```

### Obtener una línea específica

```bash
curl -X GET http://localhost:3000/api/v2/lineas/1
```

**Respuesta:**
```json
{
  "id": "1",
  "numero": "1",
  "nombre": "Barrio España - Covaresa",
  "color": "#36AD30",
  "colorTexto": "#FFFFFF",
  "totalParadas": 42,
  "totalViajes": 156,
  "paradas": [
    {
      "id": "1",
      "codigo": "634",
      "nombre": "Calle Cigüeña 21",
      "latitud": 41.6455079438975,
      "longitud": -4.71118544705553,
      "secuencias": [1, 2, 3]
    },
    ...
  ]
}
```

## Documentación API Swagger

Ambas rutas están documentadas con OpenAPI 3.0 (Swagger) y son accesibles en:

```
http://localhost:3000/api-docs
```

Las rutas aparecen bajo la categoría "Líneas" con:
- Descripción completa
- Parámetros
- Esquemas de respuesta
- Ejemplos

## Tests

Todos los tests existentes continúan pasando:

```bash
npm test
# ✓ 7 passed
```

## Archivos Modificados

1. `/lib/gtfs/index.js` - Nuevas funciones `gtfsGetLineas()` y `gtfsGetLinea()`
2. `/lib/v2/index.js` - Nuevas funciones wrapper y exportaciones
3. `/routes/v2/index.js` - Nuevas rutas GET /lineas y GET /lineas/:routeShortName
4. `/routes/v2/schemas.js` - Nuevos esquemas OpenAPI
5. `/README.md` - Documentación de uso

## Notas

- Las rutas funcionan con datos GTFS de AUVASA principalmente
- El parámetro `routeShortName` acepta códigos como "1", "2", "C1", "C2", etc.
- Las paradas están ordenadas por su número de secuencia en la línea
- El color se retorna en formato hexadecimal con "#" incluido
- La API es RESTful y sigue los mismos patrones que las rutas existentes
