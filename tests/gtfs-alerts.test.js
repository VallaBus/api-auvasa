const express = require('express');
const request = require('supertest');

const fixture = require('./fixtures/gtfs-alerts');
const { gtfsGetAlerts } = require('../lib/gtfs');

jest.mock('../lib/v2', () => {
  return {
    getParada: jest.fn(),
    getParadas: jest.fn(),
    getAlerts: jest.fn(),
    getBusPosition: jest.fn(),
    getShapesForTrip: jest.fn(),
    getStopsElementsForTrip: jest.fn(),
    getSuspendedStops: jest.fn(),
    getTripSequence: jest.fn(),
    getGbfsParadas: jest.fn(),
    checkServicesStatus: jest.fn(),
  };
});

const { getAlerts } = require('../lib/v2');
const v2Routes = require('../routes/v2');

const fixtureGtfs = {
  getServiceAlerts: () => fixture.serviceAlerts,
  getRoutes: () => fixture.routes,
  getStops: () => fixture.stops,
};

describe('GTFS-RT alerts', () => {
  let formattedAlerts;

  beforeAll(async () => {
    formattedAlerts = await gtfsGetAlerts(fixtureGtfs);
  });

  test('resolves every informed entity and maps route 21 to C1', () => {
    const c1Alerts = formattedAlerts.filter((alert) => alert.id === 'alert-c1');

    expect(c1Alerts).toHaveLength(2);
    expect(c1Alerts.every((alert) => alert.ruta.gtfsRouteId === '21')).toBe(
      true,
    );
    expect(c1Alerts.every((alert) => alert.ruta.linea === 'C1')).toBe(true);
    expect(c1Alerts.map((alert) => alert.ruta.parada)).toEqual(['815', '816']);
  });

  test('keeps global alerts when no informed entities are present', () => {
    const globalAlert = formattedAlerts.find(
      (alert) => alert.id === 'alert-global',
    );

    expect(globalAlert).toEqual(
      expect.objectContaining({
        id: 'alert-global',
        cause: 'UNKNOWN_CAUSE',
        effect: 'NO_SERVICE',
        resumen: 'Aviso general',
        descripcion: 'Información para toda la red',
      }),
    );
    expect(globalAlert.ruta).toEqual(
      expect.objectContaining({
        gtfsRouteId: null,
        linea: null,
        parada: null,
      }),
    );
  });

  test('deduplicates identical alerts but keeps entity and period changes', () => {
    const sameEntityAndPeriod = formattedAlerts.filter(
      (alert) =>
        alert.ruta.gtfsRouteId === '19' &&
        alert.ruta.parada === '815' &&
        alert.active_period === '[{"start":1785414371,"end":1785414551}]',
    );

    expect(sameEntityAndPeriod).toHaveLength(1);
    expect(
      formattedAlerts.some(
        (alert) =>
          alert.id === 'alert-19-other-stop' && alert.ruta.parada === '817',
      ),
    ).toBe(true);
    expect(
      formattedAlerts.some(
        (alert) =>
          alert.id === 'alert-19-later-period' &&
          alert.ruta.parada === '815' &&
          alert.active_period === '[{"start":1785500771,"end":1785504551}]',
      ),
    ).toBe(true);
  });

  test('preserves alert metadata in the frontend-compatible response', () => {
    const c1Alert = formattedAlerts.find((alert) => alert.id === 'alert-c1');

    expect(c1Alert).toEqual(
      expect.objectContaining({
        id: 'alert-c1',
        cause: 'OTHER_CAUSE',
        effect: 'DETOUR',
        active_period: '[{"start":1785414371,"end":1785414551}]',
        header_text: 'Desvío línea C1',
        description_text:
          'Línea C1 desviada entre Embajadores y Avenida Segovia',
        resumen: 'Desvío línea C1',
        descripcion: 'Línea C1 desviada entre Embajadores y Avenida Segovia',
      }),
    );
  });

  test('serves resolved alerts from GET /alertas/', async () => {
    getAlerts.mockResolvedValue(formattedAlerts);
    const app = express();
    app.use(v2Routes);

    const response = await request(app).get('/alertas/');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(formattedAlerts.length);
    expect(
      response.body.filter(
        (alert) =>
          alert.ruta.gtfsRouteId === null &&
          alert.ruta.linea === null &&
          alert.ruta.parada === null,
      ),
    ).toHaveLength(1);
    expect(
      response.body.some(
        (alert) => alert.ruta.gtfsRouteId === '21' && alert.ruta.linea === 'C1',
      ),
    ).toBe(true);
  });
});
