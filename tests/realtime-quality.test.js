const {
  assessRealtimeImport,
  countRecordsCreatedSince,
  updateRealtimeWithQualityRetry,
} = require('../lib/gtfs/realtime-quality');

const records = (count, createdTimestamp) =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    created_timestamp: createdTimestamp,
  }));

describe('GTFS Realtime import quality', () => {
  test('counts only records created by the current import', () => {
    const input = [...records(3, 99), ...records(4, 100)];

    expect(countRecordsCreatedSince(input, 100)).toBe(4);
  });

  test('accepts an idle period with no trips and no vehicles', () => {
    expect(
      assessRealtimeImport({
        tripUpdates: [],
        vehiclePositions: [],
        startedAt: 100,
      }),
    ).toEqual({
      hasActiveService: false,
      suspicious: false,
      tripUpdatesCount: 0,
      vehiclePositionsCount: 0,
    });
  });

  test('rejects an empty trip feed while vehicles are active', () => {
    const quality = assessRealtimeImport({
      tripUpdates: [],
      vehiclePositions: records(70, 100),
      startedAt: 100,
    });

    expect(quality.suspicious).toBe(true);
    expect(quality.hasActiveService).toBe(true);
  });

  test('rejects a partial trip feed smaller than the vehicle feed', () => {
    const quality = assessRealtimeImport({
      tripUpdates: records(20, 100),
      vehiclePositions: records(70, 100),
      startedAt: 100,
    });

    expect(quality.suspicious).toBe(true);
  });

  test('accepts a complete trip feed during active service', () => {
    const quality = assessRealtimeImport({
      tripUpdates: records(176, 100),
      vehiclePositions: records(70, 100),
      startedAt: 100,
    });

    expect(quality).toEqual({
      hasActiveService: true,
      suspicious: false,
      tripUpdatesCount: 176,
      vehiclePositionsCount: 70,
    });
  });

  test('ignores a handful of parked or residual vehicles', () => {
    const quality = assessRealtimeImport({
      tripUpdates: [],
      vehiclePositions: records(4, 100),
      startedAt: 100,
    });

    expect(quality.suspicious).toBe(false);
    expect(quality.hasActiveService).toBe(false);
  });

  test('does not retry a complete import', async () => {
    const importRealtime = jest.fn();
    const wait = jest.fn();
    const result = await updateRealtimeWithQualityRetry({
      importRealtime,
      getTripUpdates: () => records(176, 100),
      getVehiclePositions: () => records(70, 100),
      retryDelay: 7000,
      wait,
      now: () => 100000,
    });

    expect(importRealtime).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(result.retried).toBe(false);
    expect(result.quality.suspicious).toBe(false);
  });

  test('retries a partial import and accepts the following complete import', async () => {
    const importRealtime = jest.fn();
    const wait = jest.fn();
    const onPartial = jest.fn();
    let attempt = 0;
    const result = await updateRealtimeWithQualityRetry({
      importRealtime: async () => {
        importRealtime();
        attempt++;
      },
      getTripUpdates: () =>
        attempt === 1 ? records(20, 100) : records(176, 107),
      getVehiclePositions: () =>
        attempt === 1 ? records(70, 100) : records(70, 107),
      retryDelay: 7000,
      wait,
      now: jest.fn().mockReturnValueOnce(100000).mockReturnValueOnce(107000),
      onPartial,
    });

    expect(importRealtime).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(7000);
    expect(onPartial).toHaveBeenCalledWith(
      expect.objectContaining({
        suspicious: true,
        tripUpdatesCount: 20,
        vehiclePositionsCount: 70,
      }),
    );
    expect(result.retried).toBe(true);
    expect(result.quality.suspicious).toBe(false);
  });

  test('reports a feed that remains partial after the retry', async () => {
    const result = await updateRealtimeWithQualityRetry({
      importRealtime: jest.fn(),
      getTripUpdates: () => records(20, 100),
      getVehiclePositions: () => records(70, 100),
      retryDelay: 7000,
      wait: jest.fn(),
      now: () => 100000,
    });

    expect(result.retried).toBe(true);
    expect(result.quality.suspicious).toBe(true);
  });

  test('does not retry an idle nighttime import', async () => {
    const importRealtime = jest.fn();
    const wait = jest.fn();
    const result = await updateRealtimeWithQualityRetry({
      importRealtime,
      getTripUpdates: () => [],
      getVehiclePositions: () => [],
      retryDelay: 7000,
      wait,
      now: () => 100000,
    });

    expect(importRealtime).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(result.quality.hasActiveService).toBe(false);
    expect(result.quality.suspicious).toBe(false);
  });
});
