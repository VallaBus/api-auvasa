const activePeriod = (start, end) => JSON.stringify([{ start, end }]);

const informedEntity = (alertId, routeId, stopId) => ({
  alert_id: alertId,
  agency_id: null,
  route_id: routeId,
  route_type: 3,
  stop_id: stopId,
  trip_id: null,
  direction_id: null,
  created_timestamp: 1785414371,
  expiration_timestamp: 1785414551,
});

const duplicateAlerts = Array.from({ length: 6 }, (_, index) => {
  const id = `alert-19-815-${index + 1}`;

  return {
    id,
    active_period: activePeriod(1785414371, 1785414551),
    cause: 'OTHER_CAUSE',
    effect: 'DETOUR',
    url: 'http://www.auvasa.es',
    start_time: null,
    end_time: null,
    header_text: 'Desvío línea 19',
    description_text:
      'Línea 19 desviada entre Plaza España 13 y Plaza Cruz Verde 5',
    tts_header_text: null,
    tts_description_text: null,
    severity_level: null,
    informed_entity: [informedEntity(id, '19', '195')],
  };
});

module.exports = {
  routes: [
    {
      route_id: '19',
      route_short_name: '19',
    },
    {
      route_id: '21',
      route_short_name: 'C1',
    },
  ],
  stops: [
    {
      stop_id: '195',
      stop_code: '815',
      stop_name: 'Plaza España 13',
    },
    {
      stop_id: '196',
      stop_code: '816',
      stop_name: 'Plaza Cruz Verde 5',
    },
    {
      stop_id: '197',
      stop_code: '817',
      stop_name: 'Calle Panaderos 2',
    },
  ],
  serviceAlerts: [
    ...duplicateAlerts,
    {
      id: 'alert-c1',
      active_period: activePeriod(1785414371, 1785414551),
      cause: 'OTHER_CAUSE',
      effect: 'DETOUR',
      url: 'http://www.auvasa.es',
      start_time: null,
      end_time: null,
      header_text: 'Desvío línea C1',
      description_text: 'Línea C1 desviada entre Embajadores y Avenida Segovia',
      informed_entity: [
        informedEntity('alert-c1', '21', '195'),
        informedEntity('alert-c1', '21', '196'),
      ],
    },
    {
      id: 'alert-global',
      active_period: activePeriod(1785414371, 1785414551),
      cause: 'UNKNOWN_CAUSE',
      effect: 'NO_SERVICE',
      url: null,
      start_time: null,
      end_time: null,
      header_text: 'Aviso general',
      description_text: 'Información para toda la red',
      informed_entity: [],
    },
    {
      id: 'alert-19-other-stop',
      active_period: activePeriod(1785414371, 1785414551),
      cause: 'OTHER_CAUSE',
      effect: 'DETOUR',
      url: 'http://www.auvasa.es',
      start_time: null,
      end_time: null,
      header_text: 'Desvío línea 19',
      description_text:
        'Línea 19 desviada entre Plaza España 13 y Plaza Cruz Verde 5',
      informed_entities: [informedEntity('alert-19-other-stop', '19', '197')],
    },
    {
      id: 'alert-19-later-period',
      active_period: activePeriod(1785500771, 1785504551),
      cause: 'OTHER_CAUSE',
      effect: 'DETOUR',
      url: 'http://www.auvasa.es',
      start_time: null,
      end_time: null,
      header_text: 'Desvío línea 19',
      description_text:
        'Línea 19 desviada entre Plaza España 13 y Plaza Cruz Verde 5',
      informed_entities: [informedEntity('alert-19-later-period', '19', '195')],
    },
  ],
};
