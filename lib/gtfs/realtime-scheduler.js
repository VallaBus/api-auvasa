const DEFAULT_REFRESH_RATE = 60000;
const DEFAULT_REFRESH_JITTER = 5000;
const MIN_REFRESH_DELAY = 1000;

const positiveIntegerOr = (value, fallback) => {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
};

const nonNegativeIntegerOr = (value, fallback) => {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue >= 0
    ? parsedValue
    : fallback;
};

const getNextRefreshDelay = ({
  refreshRate,
  refreshJitter,
  random = Math.random,
}) => {
  const baseDelay = positiveIntegerOr(refreshRate, DEFAULT_REFRESH_RATE);
  const jitter = nonNegativeIntegerOr(refreshJitter, DEFAULT_REFRESH_JITTER);
  const randomOffset = Math.round((random() * 2 - 1) * jitter);

  return Math.max(MIN_REFRESH_DELAY, baseDelay + randomOffset);
};

const createRealtimeScheduler = ({
  update,
  refreshRate,
  refreshJitter,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onError = () => {},
}) => {
  let timer = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;

    const delay = getNextRefreshDelay({
      refreshRate,
      refreshJitter,
      random,
    });

    timer = setTimer(async () => {
      timer = null;

      if (stopped) return;

      try {
        await update();
      } catch (error) {
        onError(error);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  return {
    start() {
      if (!stopped && timer === null) scheduleNext();
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
};

module.exports = {
  DEFAULT_REFRESH_JITTER,
  DEFAULT_REFRESH_RATE,
  MIN_REFRESH_DELAY,
  createRealtimeScheduler,
  getNextRefreshDelay,
};
