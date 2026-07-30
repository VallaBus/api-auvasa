const DEFAULT_MIN_VEHICLES_FOR_VALIDATION = 5;

const countRecordsCreatedSince = (records, timestamp) =>
  records.filter(
    (record) => Number(record.created_timestamp) >= Number(timestamp),
  ).length;

const assessRealtimeImport = ({
  tripUpdates,
  vehiclePositions,
  startedAt,
  minVehiclesForValidation = DEFAULT_MIN_VEHICLES_FOR_VALIDATION,
}) => {
  const tripUpdatesCount = countRecordsCreatedSince(tripUpdates, startedAt);
  const vehiclePositionsCount = countRecordsCreatedSince(
    vehiclePositions,
    startedAt,
  );
  const hasActiveService = vehiclePositionsCount >= minVehiclesForValidation;
  const suspicious =
    hasActiveService && tripUpdatesCount < vehiclePositionsCount;

  return {
    hasActiveService,
    suspicious,
    tripUpdatesCount,
    vehiclePositionsCount,
  };
};

const updateRealtimeWithQualityRetry = async ({
  importRealtime,
  getTripUpdates,
  getVehiclePositions,
  retryDelay,
  wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  now = () => Date.now(),
  onPartial = () => {},
}) => {
  const importAndAssess = async () => {
    const startedAt = Math.floor(now() / 1000);

    await importRealtime();

    return assessRealtimeImport({
      tripUpdates: getTripUpdates(),
      vehiclePositions: getVehiclePositions(),
      startedAt,
    });
  };

  let quality = await importAndAssess();

  if (!quality.suspicious) {
    return { quality, retried: false };
  }

  onPartial(quality);
  await wait(retryDelay);
  quality = await importAndAssess();

  return { quality, retried: true };
};

module.exports = {
  DEFAULT_MIN_VEHICLES_FOR_VALIDATION,
  assessRealtimeImport,
  countRecordsCreatedSince,
  updateRealtimeWithQualityRetry,
};
