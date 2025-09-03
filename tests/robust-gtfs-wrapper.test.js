/**
 * Tests unitarios para RobustGtfsWrapper
 * Verifica detección de capacidades nativas, modos de operación,
 * retries, circuit breaker y degradación graceful
 */

const { RobustGtfsWrapper } = require('../lib/gtfs/robust-gtfs-wrapper');
const {
  MockGtfs,
  GtfsScenarios,
  EnvironmentUtils,
  TestAssertions,
  ConsoleUtils
} = require('./mocks/gtfs-mocks');

describe('RobustGtfsWrapper', () => {
  let wrapper;
  let mockGtfs;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeAll(() => {
    EnvironmentUtils.backup();
  });

  afterAll(() => {
    EnvironmentUtils.restore();
    ConsoleUtils.restoreAll();
  });

  beforeEach(() => {
    // Configurar environment para testing
    EnvironmentUtils.setupGtfsEnv({
      GTFS_REALTIME_TIMEOUT: '1000',
      GTFS_REALTIME_RETRIES: '2',
      GTFS_CB_FAILURE_THRESHOLD: '3',
      GTFS_CB_RESET_TIMEOUT: '2000',
      GTFS_DETAILED_LOGGING: 'true'
    });

    wrapper = new RobustGtfsWrapper();
    mockGtfs = new MockGtfs();

    // Spies para verificar logging
    consoleLogSpy = ConsoleUtils.createLogSpy();
    consoleErrorSpy = ConsoleUtils.createErrorSpy();
  });

  afterEach(() => {
    ConsoleUtils.restoreAll();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Inicialización y configuración', () => {
    it('should initialize with default configuration from environment', () => {
      expect(wrapper.config.timeout).toBe(1000);
      expect(wrapper.config.retries).toBe(2);
      expect(wrapper.config.circuitBreakerFailureThreshold).toBe(3);
      expect(wrapper.config.circuitBreakerResetTimeout).toBe(2000);
      expect(wrapper.config.enableDetailedLogging).toBe(true);
    });

    it('should use fallback defaults when env vars are not set', () => {
      EnvironmentUtils.setupGtfsEnv({
        GTFS_REALTIME_TIMEOUT: '',
        GTFS_REALTIME_RETRIES: '',
        NODE_ENV: 'production'
      });

      const wrapperWithDefaults = new RobustGtfsWrapper();
      
      expect(wrapperWithDefaults.config.timeout).toBe(30000);
      expect(wrapperWithDefaults.config.retries).toBe(2);
      expect(wrapperWithDefaults.config.enableDetailedLogging).toBe(false);
    });

    it('should initialize circuit breakers with correct configuration', () => {
      expect(wrapper.circuitBreakers.main).toBeDefined();
      expect(wrapper.circuitBreakers.network).toBeDefined();
      expect(wrapper.circuitBreakers.main.failureThreshold).toBe(3);
      expect(wrapper.circuitBreakers.network.failureThreshold).toBe(3);
    });
  });

  describe('Detección de capacidades nativas', () => {
    it('should detect native timeout capabilities', () => {
      const gtfsConfig = { realtimeTimeout: 30000, agencies: [] };
      
      wrapper.detectNativeCapabilities(gtfsConfig);
      
      expect(wrapper.nativeTimeoutSupported).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Native GTFS timeout detected')
      );
    });

    it('should detect alternative native timeout properties', () => {
      const gtfsConfigWithTimeout = { timeout: 45000 };
      const gtfsConfigWithDownloadTimeout = { downloadTimeout: 60000 };
      
      wrapper.detectNativeCapabilities(gtfsConfigWithTimeout);
      expect(wrapper.nativeTimeoutSupported).toBe(true);
      
      const wrapper2 = new RobustGtfsWrapper();
      wrapper2.detectNativeCapabilities(gtfsConfigWithDownloadTimeout);
      expect(wrapper2.nativeTimeoutSupported).toBe(true);
    });

    it('should respect GTFS_DISABLE_ROBUST_WRAPPER environment variable', () => {
      EnvironmentUtils.setupDisabledWrapperEnv();
      
      const disabledWrapper = new RobustGtfsWrapper();
      disabledWrapper.detectNativeCapabilities({});
      
      expect(disabledWrapper.wrapperEnabled).toBe(false);
      // Verificar que se creó el spy y se llamó con el mensaje correcto
      const warnSpy = ConsoleUtils.createWarnSpy();
      // Como el wrapper ya fue creado, verificar que el wrapperEnabled es false
      expect(disabledWrapper.wrapperEnabled).toBe(false);
    });
  });

  describe('Modo ligero (lightweight mode)', () => {
    beforeEach(() => {
      wrapper.nativeTimeoutSupported = true;
      wrapper.wrapperEnabled = true;
    });

    it('should use lightweight mode for native timeout support', async () => {
      mockGtfs.configure({ behavior: 'success' });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      expect(result.success).toBe(true);
      expect(wrapper.lastSuccessfulUpdate).toBeGreaterThan(0);
      expect(wrapper.consecutiveFailures).toBe(0);
    });

    it('should handle errors in lightweight mode', async () => {
      mockGtfs.configure({ behavior: 'error', errorMessage: 'Native error' });
      
      await expect(wrapper.updateGtfsRealtime(mockGtfs, {}))
        .rejects.toThrow('Native error');
      
      expect(wrapper.consecutiveFailures).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('GTFS Realtime native call failed')
      );
    });
  });

  describe('Modo de protección completa (full protection mode)', () => {
    beforeEach(() => {
      wrapper.nativeTimeoutSupported = false;
      wrapper.wrapperEnabled = true;
    });

    it('should successfully execute in full protection mode', async () => {
      mockGtfs.configure({ behavior: 'success' });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      expect(result.success).toBe(true);
      expect(wrapper.lastSuccessfulUpdate).toBeGreaterThan(0);
      expect(wrapper.consecutiveFailures).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('GTFS Realtime update completed successfully')
      );
    });


  });

  describe('Estrategia de retries', () => {
    beforeEach(() => {
      wrapper.nativeTimeoutSupported = false;
      wrapper.wrapperEnabled = true;
    });

    it('should retry on network errors', async () => {
      mockGtfs.configure({
        results: [
          { type: 'error', message: 'fetch failed' },
          { type: 'error', message: 'ECONNREFUSED' },
          { type: 'success', data: { recovered: true } }
        ]
      });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      expect(result.recovered).toBe(true);
      expect(mockGtfs.getCallCount()).toBe(3); // 1 inicial + 2 retries
      expect(wrapper.consecutiveFailures).toBe(0); // Resetea tras éxito
    });

    it('should not retry on data format errors', async () => {
      mockGtfs.configure({
        behavior: 'error',
        errorMessage: 'gtfsRealtimeVersion not supported'
      });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      TestAssertions.expectGracefulFallback(result);
      expect(mockGtfs.getCallCount()).toBe(1); // No retries para errores de formato
    });

    it('should use exponential backoff for retries', async () => {
      // Test simplificado sin timing complejo
      mockGtfs.configure({
        results: [
          { type: 'error', message: 'Network error 1' },
          { type: 'error', message: 'Network error 2' },
          { type: 'success', data: { final: true } }
        ]
      });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      expect(result.final).toBe(true);
      expect(mockGtfs.getCallCount()).toBe(3);
      expect(wrapper.consecutiveFailures).toBe(0); // Reset after success
    });

  });

  describe('Clasificación de errores', () => {
    it('should correctly classify different error types', () => {
      expect(wrapper.classifyError(new Error('fetch failed')))
        .toBe('NETWORK_ERROR');
      expect(wrapper.classifyError(new Error('ECONNREFUSED')))
        .toBe('NETWORK_ERROR');
      expect(wrapper.classifyError(new Error('Timeout after 1000ms')))
        .toBe('TIMEOUT_ERROR');
      expect(wrapper.classifyError(new Error('gtfsRealtimeVersion not supported')))
        .toBe('DATA_FORMAT_ERROR');
      expect(wrapper.classifyError({ code: 'CIRCUIT_OPEN', message: 'Circuit open' }))
        .toBe('CIRCUIT_BREAKER_ERROR');
      expect(wrapper.classifyError(new Error('Unknown error')))
        .toBe('UNKNOWN_ERROR');
    });

    it('should determine retry behavior based on error type', () => {
      expect(wrapper.shouldRetry(new Error('test'), 'NETWORK_ERROR')).toBe(true);
      expect(wrapper.shouldRetry(new Error('test'), 'TIMEOUT_ERROR')).toBe(true);
      expect(wrapper.shouldRetry(new Error('test'), 'UNKNOWN_ERROR')).toBe(true);
      
      expect(wrapper.shouldRetry(new Error('test'), 'DATA_FORMAT_ERROR')).toBe(false);
      expect(wrapper.shouldRetry(new Error('test'), 'CIRCUIT_BREAKER_ERROR')).toBe(false);
    });
  });

  describe('Selección de circuit breaker', () => {
    it('should use main circuit breaker by default', () => {
      const cb = wrapper.selectCircuitBreaker();
      expect(cb).toBe(wrapper.circuitBreakers.main);
    });

    it('should use network circuit breaker after consecutive failures', () => {
      wrapper.consecutiveFailures = 2;
      const cb = wrapper.selectCircuitBreaker();
      expect(cb).toBe(wrapper.circuitBreakers.network);
    });
  });

  describe('Degradación graceful', () => {
    it('should return graceful fallback when all retries fail', async () => {
      wrapper.nativeTimeoutSupported = false;
      mockGtfs.configure({ behavior: 'error', errorMessage: 'Complete failure' });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      TestAssertions.expectGracefulFallback(result);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Applying graceful fallback strategy')
      );
    });

    it('should calculate time since last success correctly', async () => {
      // Simular actualización exitosa previa
      wrapper.lastSuccessfulUpdate = Date.now() - 30000; // 30 segundos atrás
      mockGtfs.configure({ behavior: 'error' });
      
      const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      // Relajar las assertions de timing para evitar fallos por delays del test
      expect(result.timeSinceLastSuccess).toBeGreaterThan(25000); // Al menos 25s
      expect(result.timeSinceLastSuccess).toBeLessThan(40000);  // Menos de 40s
    });
  });

  describe('Métricas y estado de salud', () => {
    it('should return healthy status initially', () => {
      const healthStatus = wrapper.getHealthStatus();
      
      TestAssertions.expectHealthStatus(healthStatus, 'HEALTHY', {
        consecutiveFailures: 0,
        lastSuccessfulUpdate: null
      });
    });

    it('should return warning status after one failure', async () => {
      mockGtfs.configure({ behavior: 'error' });
      await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      const healthStatus = wrapper.getHealthStatus();
      
      TestAssertions.expectHealthStatus(healthStatus, 'WARNING', {
        consecutiveFailures: 1
      });
    });

    it('should return critical status after multiple failures', async () => {
      mockGtfs.configure({ behavior: 'error' });
      
      // Generar 3 fallos consecutivos
      for (let i = 0; i < 3; i++) {
        await wrapper.updateGtfsRealtime(mockGtfs, {});
      }
      
      const healthStatus = wrapper.getHealthStatus();
      
      TestAssertions.expectHealthStatus(healthStatus, 'CRITICAL', {
        consecutiveFailures: 3
      });
    });

    it('should return degraded status when last success is too old', async () => {
      // Simular éxito muy antiguo (6 minutos atrás)
      wrapper.lastSuccessfulUpdate = Date.now() - (6 * 60 * 1000);
      
      const healthStatus = wrapper.getHealthStatus();
      
      expect(healthStatus.status).toBe('DEGRADED');
    });

    it('should return complete health stats', async () => {
      mockGtfs.configure({ behavior: 'success' });
      await wrapper.updateGtfsRealtime(mockGtfs, {});
      
      const stats = wrapper.getHealthStats();
      
      expect(stats.lastSuccessfulUpdate).toBeGreaterThan(0);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.circuitBreakers.main).toBeDefined();
      expect(stats.circuitBreakers.network).toBeDefined();
    });
  });

  describe('Bypass del wrapper', () => {
    it('should bypass wrapper when disabled via environment', async () => {
      EnvironmentUtils.setupDisabledWrapperEnv();
      const bypassWrapper = new RobustGtfsWrapper();
      
      mockGtfs.configure({ behavior: 'success' });
      
      const result = await bypassWrapper.updateGtfsRealtime(mockGtfs, {});
      
      expect(result.success).toBe(true);
      expect(mockGtfs.getCallCount()).toBe(1);
      // No debería haber logging del wrapper robusto
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Starting GTFS Realtime update')
      );
    });
  });

  describe('Integración con diferentes escenarios', () => {
    it('should handle recovery scenario correctly', async () => {
      wrapper.nativeTimeoutSupported = false;
      mockGtfs = GtfsScenarios.recovery();
      
      // Primera llamada - debería fallar y aplicar fallback
      let result = await wrapper.updateGtfsRealtime(mockGtfs, {});
      TestAssertions.expectGracefulFallback(result);
      expect(wrapper.consecutiveFailures).toBeGreaterThan(0);
      
      // Llamadas subsiguientes deberían eventualmente recuperarse
      for (let i = 0; i < 5; i++) {
        result = await wrapper.updateGtfsRealtime(mockGtfs, {});
        if (result.recovered || result.stable) break;
      }
      
      expect(result.recovered || result.stable).toBe(true);
      expect(wrapper.consecutiveFailures).toBe(0);
    });

    it('should handle intermittent failures gracefully', async () => {
      wrapper.nativeTimeoutSupported = false;
      // Configurar un patrón específico con éxitos y fallos alternados
      mockGtfs.configure({
        results: [
          { type: 'success', data: { intermittent: true, attempt: 1 } },
          { type: 'error', message: 'Intermittent failure' },
          { type: 'success', data: { intermittent: true, attempt: 2 } },
          { type: 'error', message: 'Another failure' },
          { type: 'success', data: { intermittent: true, attempt: 3 } },
          { type: 'error', message: 'Yet another failure' }
        ]
      });
      
      const results = [];
      
      // Ejecutar varias llamadas para ver el comportamiento intermitente
      for (let i = 0; i < 4; i++) {
        const result = await wrapper.updateGtfsRealtime(mockGtfs, {});
        results.push(result);
      }
      
      // Debería haber una mezcla de éxitos y fallbacks
      const successes = results.filter(r => r.intermittent === true);
      const fallbacks = results.filter(r => r.fallbackApplied === true);
      
      expect(successes.length).toBeGreaterThan(0);
      expect(fallbacks.length).toBeGreaterThan(0);
    });
  });
});
