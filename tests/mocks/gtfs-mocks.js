/**
 * Mocks y utilidades para testing del wrapper robusto de GTFS
 * Proporciona simulación de diferentes escenarios de fallo y éxito
 */

/**
 * Mock básico de node-gtfs con diferentes comportamientos configurables
 */
class MockGtfs {
  constructor() {
    this.reset();
  }

  reset() {
    this.callCount = 0;
    this.behavior = 'success';
    this.delay = 0;
    this.errorMessage = 'Mock GTFS error';
    this.results = [];
  }

  /**
   * Configura el comportamiento del mock
   * @param {Object} config - Configuración del comportamiento
   * @param {string} config.behavior - 'success', 'error', 'timeout', 'intermittent'
   * @param {number} config.delay - Delay en ms antes de responder
   * @param {string} config.errorMessage - Mensaje de error personalizado
   * @param {Array} config.results - Array de resultados para comportamiento secuencial
   */
  configure(config = {}) {
    this.behavior = config.behavior || 'success';
    this.delay = config.delay || 0;
    this.errorMessage = config.errorMessage || 'Mock GTFS error';
    this.results = config.results || [];
    return this;
  }

  async updateGtfsRealtime(gtfsConfig) {
    this.callCount++;

    // Aplicar delay si está configurado
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // Comportamiento secuencial basado en array de resultados
    if (this.results.length > 0) {
      const resultIndex = (this.callCount - 1) % this.results.length;
      const result = this.results[resultIndex];
      
      if (result.type === 'success') {
        return result.data || { success: true };
      } else if (result.type === 'error') {
        throw new Error(result.message || this.errorMessage);
      } else if (result.type === 'timeout') {
        // Simular timeout con delay muy largo
        await new Promise(resolve => setTimeout(resolve, 60000));
        return { success: true };
      }
    }

    // Comportamiento basado en tipo simple
    switch (this.behavior) {
      case 'success':
        return { 
          success: true, 
          timestamp: Date.now(),
          callCount: this.callCount
        };
        
      case 'error':
        throw new Error(this.errorMessage);
        
      case 'network_error':
        const networkError = new Error('fetch failed');
        networkError.cause = { code: 'ECONNREFUSED' };
        throw networkError;
        
      case 'timeout':
        // Simular función que nunca completa (para testing de timeout)
        await new Promise(() => {}); // Promise que nunca se resuelve
        break;
        
      case 'slow':
        // Simular respuesta lenta pero exitosa
        await new Promise(resolve => setTimeout(resolve, this.delay || 5000));
        return { success: true, slow: true };
        
      case 'intermittent':
        // Alternar entre éxito y fallo
        if (this.callCount % 2 === 0) {
          throw new Error(`Intermittent failure #${this.callCount}`);
        }
        return { success: true, intermittent: true, callCount: this.callCount };
        
      default:
        throw new Error(`Unknown mock behavior: ${this.behavior}`);
    }
  }

  getCallCount() {
    return this.callCount;
  }
}

/**
 * Factory para crear diferentes escenarios de testing comunes
 */
const GtfsScenarios = {
  // Éxito consistente
  success: () => new MockGtfs().configure({ behavior: 'success' }),

  // Error consistente
  error: (message = 'Consistent error') => 
    new MockGtfs().configure({ behavior: 'error', errorMessage: message }),

  // Error de red (para testing de circuit breaker de red)
  networkError: () => new MockGtfs().configure({ behavior: 'network_error' }),

  // Timeout (nunca completa)
  timeout: () => new MockGtfs().configure({ behavior: 'timeout' }),

  // Respuesta lenta pero exitosa
  slow: (delay = 5000) => 
    new MockGtfs().configure({ behavior: 'slow', delay }),

  // Comportamiento intermitente (falla cada 2 llamadas)
  intermittent: () => new MockGtfs().configure({ behavior: 'intermittent' }),

  // Secuencia específica de respuestas
  sequence: (results) => new MockGtfs().configure({ results }),

  // Fallo inicial seguido de recuperación
  recovery: () => new MockGtfs().configure({
    results: [
      { type: 'error', message: 'Initial failure' },
      { type: 'error', message: 'Second failure' },
      { type: 'error', message: 'Third failure' },
      { type: 'success', data: { recovered: true } },
      { type: 'success', data: { stable: true } }
    ]
  }),

  // Simulación de degradación progresiva
  degradation: () => new MockGtfs().configure({
    results: [
      { type: 'success' },
      { type: 'success' },
      { type: 'error', message: 'First sign of trouble' },
      { type: 'success' },
      { type: 'error', message: 'Getting worse' },
      { type: 'error', message: 'Complete failure' },
      { type: 'error', message: 'Still failing' }
    ]
  })
};

/**
 * Utilidades para testing de variables de entorno
 */
const EnvironmentUtils = {
  // Backup del estado original
  originalEnv: null,

  /**
   * Guarda el estado actual del environment
   */
  backup() {
    this.originalEnv = { ...process.env };
  },

  /**
   * Restaura el environment al estado guardado
   */
  restore() {
    if (this.originalEnv) {
      process.env = { ...this.originalEnv };
    }
  },

  /**
   * Configura variables de entorno para testing
   */
  setupGtfsEnv(config = {}) {
    const defaults = {
      GTFS_REALTIME_TIMEOUT: '5000',
      GTFS_REALTIME_RETRIES: '2',
      GTFS_CB_FAILURE_THRESHOLD: '3',
      GTFS_CB_RESET_TIMEOUT: '10000',
      GTFS_DETAILED_LOGGING: 'false',
      GTFS_DISABLE_ROBUST_WRAPPER: 'false',
      NODE_ENV: 'test'
    };

    Object.assign(process.env, defaults, config);
  },

  /**
   * Configura entorno para simular timeout nativo en node-gtfs
   */
  setupNativeTimeoutEnv() {
    process.env.GTFS_DISABLE_ROBUST_WRAPPER = 'false';
    // Simular que gtfs config tiene timeout nativo
    return {
      realtimeTimeout: 30000,
      agencies: []
    };
  },

  /**
   * Configura entorno para deshabilitar el wrapper robusto
   */
  setupDisabledWrapperEnv() {
    process.env.GTFS_DISABLE_ROBUST_WRAPPER = 'true';
  }
};

/**
 * Utilidades para verificaciones de testing
 */
const TestAssertions = {
  /**
   * Verifica que las métricas del circuit breaker sean correctas
   */
  expectCircuitBreakerStats(stats, expected) {
    expect(stats.totalRequests).toBe(expected.totalRequests);
    expect(stats.successfulRequests).toBe(expected.successfulRequests);
    expect(stats.failedRequests).toBe(expected.failedRequests);
    
    if (expected.state) {
      expect(stats.state).toBe(expected.state);
    }
    
    if (expected.healthStatus) {
      expect(stats.healthStatus).toBe(expected.healthStatus);
    }
  },

  /**
   * Verifica el estado de salud del wrapper
   */
  expectHealthStatus(healthStatus, expectedStatus, additionalChecks = {}) {
    expect(healthStatus.status).toBe(expectedStatus);
    expect(healthStatus.timestamp).toBeGreaterThan(0);
    
    if (additionalChecks.consecutiveFailures !== undefined) {
      expect(healthStatus.consecutiveFailures).toBe(additionalChecks.consecutiveFailures);
    }
    
    if (additionalChecks.lastSuccessfulUpdate !== undefined) {
      if (additionalChecks.lastSuccessfulUpdate === null) {
        expect(healthStatus.lastSuccessfulUpdate).toBeNull();
      } else {
        expect(healthStatus.lastSuccessfulUpdate).toBeGreaterThan(0);
      }
    }
  },

  /**
   * Verifica que el fallback graceful funcione correctamente
   */
  expectGracefulFallback(result) {
    expect(result).toMatchObject({
      success: false,
      fallbackApplied: true,
      message: 'Using cached realtime data due to update failures'
    });
    
    // timeSinceLastSuccess puede ser null o un número
    expect(result.timeSinceLastSuccess === null || 
           (typeof result.timeSinceLastSuccess === 'number' && result.timeSinceLastSuccess >= 0))
      .toBe(true);
  }
};

/**
 * Helper para crear spies de console con limpieza automática
 */
const ConsoleUtils = {
  spies: new Set(),

  createSpy(method = 'log') {
    const spy = jest.spyOn(console, method).mockImplementation(() => {});
    this.spies.add(spy);
    return spy;
  },

  createLogSpy() {
    return this.createSpy('log');
  },

  createErrorSpy() {
    return this.createSpy('error');
  },

  createWarnSpy() {
    return this.createSpy('warn');
  },

  restoreAll() {
    for (const spy of this.spies) {
      spy.mockRestore();
    }
    this.spies.clear();
  }
};

module.exports = {
  MockGtfs,
  GtfsScenarios,
  EnvironmentUtils,
  TestAssertions,
  ConsoleUtils
};
