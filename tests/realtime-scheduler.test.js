const {
  DEFAULT_REFRESH_JITTER,
  DEFAULT_REFRESH_RATE,
  MIN_REFRESH_DELAY,
  createRealtimeScheduler,
  getNextRefreshDelay,
} = require('../lib/gtfs/realtime-scheduler');

describe('GTFS Realtime scheduler', () => {
  test('applies deterministic jitter around the base interval', () => {
    expect(
      getNextRefreshDelay({
        refreshRate: 30000,
        refreshJitter: 5000,
        random: () => 0,
      }),
    ).toBe(25000);
    expect(
      getNextRefreshDelay({
        refreshRate: 30000,
        refreshJitter: 5000,
        random: () => 0.5,
      }),
    ).toBe(30000);
    expect(
      getNextRefreshDelay({
        refreshRate: 30000,
        refreshJitter: 5000,
        random: () => 1,
      }),
    ).toBe(35000);
  });

  test('uses safe defaults and never schedules below the minimum delay', () => {
    expect(
      getNextRefreshDelay({
        refreshRate: 'invalid',
        refreshJitter: 'invalid',
        random: () => 0.5,
      }),
    ).toBe(DEFAULT_REFRESH_RATE);
    expect(DEFAULT_REFRESH_JITTER).toBe(5000);
    expect(
      getNextRefreshDelay({
        refreshRate: 2000,
        refreshJitter: 5000,
        random: () => 0,
      }),
    ).toBe(MIN_REFRESH_DELAY);
  });

  test('schedules the next update only after the current update finishes', async () => {
    const scheduled = [];
    let finishUpdate;
    const update = jest.fn(
      () =>
        new Promise((resolve) => {
          finishUpdate = resolve;
        }),
    );
    const scheduler = createRealtimeScheduler({
      update,
      refreshRate: 30000,
      refreshJitter: 0,
      setTimer: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      clearTimer: jest.fn(),
    });

    scheduler.start();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(30000);

    const runningUpdate = scheduled[0].callback();
    expect(update).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);

    finishUpdate();
    await runningUpdate;
    expect(scheduled).toHaveLength(2);
  });

  test('reports update errors and continues scheduling', async () => {
    const scheduled = [];
    const error = new Error('upstream failure');
    const onError = jest.fn();
    const scheduler = createRealtimeScheduler({
      update: jest.fn().mockRejectedValue(error),
      refreshRate: 30000,
      refreshJitter: 0,
      setTimer: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      clearTimer: jest.fn(),
      onError,
    });

    scheduler.start();
    await scheduled[0].callback();

    expect(onError).toHaveBeenCalledWith(error);
    expect(scheduled).toHaveLength(2);
  });

  test('can be stopped before a scheduled update runs', async () => {
    const scheduled = [];
    const clearTimer = jest.fn();
    const update = jest.fn();
    const scheduler = createRealtimeScheduler({
      update,
      refreshRate: 30000,
      refreshJitter: 0,
      setTimer: (callback) => {
        scheduled.push(callback);
        return 42;
      },
      clearTimer,
    });

    scheduler.start();
    scheduler.stop();
    await scheduled[0]();

    expect(clearTimer).toHaveBeenCalledWith(42);
    expect(update).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });
});
