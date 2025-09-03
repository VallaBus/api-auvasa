/**
 * Wrapper robusto para updateGtfsRealtime con timeout, circuit breaker y logging mejorado
 * 
 * Implementa:
 * - Timeout configurable para evitar bloqueos indefinidos
 * - Circuit breaker para manejar fallos repetitivos
 * - Logging detallado para diagnóstico de problemas
 * - Métricas de rendimiento y estado de salud
 */

const { environment } = require('../utils');

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5; // Fallos consecutivos antes de abrir
    this.timeout = options.timeout || 30000; // 30 segundos de timeout por defecto
    this.resetTimeout = options.resetTimeout || 60000; // 1 minuto antes de reintentar
    
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      timeouts: 0,
      circuitOpenCount: 0,
      averageResponseTime: 0,
      lastSuccessTime: null,
      lastFailureTime: null
    };
  }

  async execute(fn) {
    this.stats.totalRequests++;
    
    // Si el circuito está abierto, verificar si es tiempo de reintentarlo
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime < this.resetTimeout) {
        const error = new Error(`Circuit breaker OPEN for ${this.name}. Next retry in ${Math.ceil((this.resetTimeout - (now - this.lastFailureTime)) / 1000)}s`);
        error.code = 'CIRCUIT_OPEN';
        throw error;
      } else {
        this.state = 'HALF_OPEN';
        console.log(`🔄 Circuit breaker ${this.name}: transitioning to HALF_OPEN state`);
      }
    }

    const startTime = Date.now();
    
    try {
      // Crear timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          this.stats.timeouts++;
          reject(new Error(`Timeout after ${this.timeout}ms for ${this.name}`));
        }, this.timeout);
      });

      // Ejecutar la función con timeout
      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Éxito - resetear contador de fallos
      this.onSuccess(Date.now() - startTime);
      return result;
      
    } catch (error) {
      this.onFailure(error, Date.now() - startTime);
      throw error;
    }
  }

  onSuccess(responseTime) {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.stats.successfulRequests++;
    this.stats.lastSuccessTime = Date.now();
    this.updateAverageResponseTime(responseTime);
    
    console.log(`✅ Circuit breaker ${this.name}: SUCCESS (${responseTime}ms)`);
  }

  onFailure(error, responseTime) {
    this.failureCount++;
    this.stats.failedRequests++;
    this.stats.lastFailureTime = Date.now();
    this.lastFailureTime = Date.now();
    this.updateAverageResponseTime(responseTime);
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.stats.circuitOpenCount++;
      console.error(`🚫 Circuit breaker ${this.name}: OPENED after ${this.failureCount} failures`);
    }
    
    console.error(`❌ Circuit breaker ${this.name}: FAILURE (${responseTime}ms) - ${error.message}`);
  }

  updateAverageResponseTime(newTime) {
    const totalRequests = this.stats.totalRequests;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (totalRequests - 1) + newTime) / totalRequests;
  }

  getStats() {
    return {
      ...this.stats,
      state: this.state,
      failureCount: this.failureCount,
      healthStatus: this.getHealthStatus()
    };
  }

  getHealthStatus() {
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulRequests / this.stats.totalRequests) * 100 
      : 100; // Sin requests es considerado saludable
      
    if (this.state === 'OPEN') return 'CRITICAL';
    if (this.stats.totalRequests > 0 && successRate < 50) return 'DEGRADED';
    if (this.stats.totalRequests > 0 && successRate <= 90) return 'WARNING';
    return 'HEALTHY';
  }
}

class RobustGtfsWrapper {
  constructor() {
    // Configuración con defaults seguros - NO requiere nuevas env vars
    this.config = {
      timeout: parseInt(environment.GTFS_REALTIME_TIMEOUT) || 30000, 
      retries: parseInt(environment.GTFS_REALTIME_RETRIES) || 2,
      circuitBreakerFailureThreshold: parseInt(environment.GTFS_CB_FAILURE_THRESHOLD) || 5,
      circuitBreakerResetTimeout: parseInt(environment.GTFS_CB_RESET_TIMEOUT) || 60000,
      enableDetailedLogging: environment.GTFS_DETAILED_LOGGING === 'true' || environment.NODE_ENV === 'development'
    };
    
    // Detección automática de capacidades nativas de node-gtfs
    this.nativeTimeoutSupported = false;
    this.wrapperEnabled = true;

    // Circuit breakers para diferentes tipos de fallos
    this.circuitBreakers = {
      main: new CircuitBreaker('GTFS-Realtime-Main', {
        failureThreshold: this.config.circuitBreakerFailureThreshold,
        timeout: this.config.timeout,
        resetTimeout: this.config.circuitBreakerResetTimeout
      }),
      network: new CircuitBreaker('GTFS-Realtime-Network', {
        failureThreshold: 3, // Más sensible para errores de red
        timeout: this.config.timeout,
        resetTimeout: this.config.circuitBreakerResetTimeout
      })
    };

    this.lastSuccessfulUpdate = null;
    this.consecutiveFailures = 0;
    this.retryTracker = new Map(); // Rastrear retries por operationId
  }

  /**
   * Detecta si node-gtfs tiene capacidades nativas de timeout
   * Future-proof: Automáticamente desactiva wrapper cuando no sea necesario
   */
  detectNativeCapabilities(gtfsConfig) {
    // Verificar si el config de GTFS tiene timeout nativo
    if (gtfsConfig && (
      gtfsConfig.realtimeTimeout || 
      gtfsConfig.timeout ||
      gtfsConfig.downloadTimeout
    )) {
      console.log('🔍 Native GTFS timeout detected, using lightweight wrapper mode');
      this.nativeTimeoutSupported = true;
    }
    
    // Verificar si hay variable para forzar bypass del wrapper  
    if (environment.GTFS_DISABLE_ROBUST_WRAPPER === 'true') {
      console.log('⚠️  Robust wrapper disabled via GTFS_DISABLE_ROBUST_WRAPPER=true');
      this.wrapperEnabled = false;
    }
  }
  
  /**
   * Wrapper principal que reemplaza la llamada directa a updateGtfsRealtime
   * FUTURE-PROOF: Automáticamente se adapta si node-gtfs implementa timeout nativo
   */
  async updateGtfsRealtime(gtfs, gtfsConfig) {
    // Detectar capacidades nativas en la primera llamada
    if (this.lastSuccessfulUpdate === null) {
      this.detectNativeCapabilities(gtfsConfig);
    }
    
    // Si wrapper está deshabilitado, usar llamada directa
    if (!this.wrapperEnabled) {
      return await gtfs.updateGtfsRealtime(gtfsConfig);
    }
    
    // Si tiene timeout nativo, usar modo ligero (solo métricas)
    if (this.nativeTimeoutSupported) {
      return await this.lightweightMode(gtfs, gtfsConfig);
    }
    
    // Modo completo con toda la protección
    return await this.fullProtectionMode(gtfs, gtfsConfig);
  }
  
  /**
   * Modo ligero: Solo métricas cuando node-gtfs tiene timeout nativo
   */
  async lightweightMode(gtfs, gtfsConfig) {
    const startTime = Date.now();
    try {
      const result = await gtfs.updateGtfsRealtime(gtfsConfig);
      this.onUpdateSuccess(`native-${Date.now()}`);
      this.circuitBreakers.main.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.onUpdateFailure(error, `native-${Date.now()}`);
      this.circuitBreakers.main.onFailure(error, Date.now() - startTime);
      throw error; // Re-throw para mantener comportamiento original
    }
  }
  
  /**
   * Modo completo: Toda la protección cuando node-gtfs no tiene timeout
   */
  async fullProtectionMode(gtfs, gtfsConfig) {
    const operationId = `gtfs-rt-${Date.now()}`;
    
    if (this.config.enableDetailedLogging) {
      console.log(`🚀 [${operationId}] Starting GTFS Realtime update...`);
    }

    try {
      // Determinar qué circuit breaker usar según el historial de errores
      const circuitBreaker = this.selectCircuitBreaker();
      
      // Ejecutar actualización con circuit breaker y timeout
      const result = await circuitBreaker.execute(async () => {
        return await gtfs.updateGtfsRealtime(gtfsConfig);
      });

      // Éxito
      this.onUpdateSuccess(operationId);
      return result;

    } catch (error) {
      // Manejo de diferentes tipos de errores
      return await this.handleUpdateError(error, operationId, gtfs, gtfsConfig);
    }
  }
  
  /**
   * Manejo simple de fallo para modo ligero
   */
  onUpdateFailure(error, operationId) {
    this.consecutiveFailures++;
    console.error(`❌ [${operationId}] GTFS Realtime native call failed: ${error.message}`);
  }

  selectCircuitBreaker() {
    // Usar circuit breaker específico de red si los últimos errores fueron de red
    if (this.consecutiveFailures >= 2) {
      return this.circuitBreakers.network;
    }
    return this.circuitBreakers.main;
  }

  onUpdateSuccess(operationId) {
    this.lastSuccessfulUpdate = Date.now();
    this.consecutiveFailures = 0;
    
    // Limpiar tracker de retries para esta operación
    this.retryTracker.delete(operationId);
    
    if (this.config.enableDetailedLogging) {
      console.log(`✅ [${operationId}] GTFS Realtime update completed successfully`);
    }
  }

  async handleUpdateError(error, operationId, gtfs, gtfsConfig) {
    const errorType = this.classifyError(error);
    const shouldRetry = this.shouldRetry(error, errorType);
    
    console.error(`❌ [${operationId}] GTFS Realtime update failed:`, {
      error: error.message,
      type: errorType,
      consecutiveFailures: this.consecutiveFailures,
      willRetry: shouldRetry
    });

    // Si es un circuit breaker abierto, no reintentar
    if (error.code === 'CIRCUIT_OPEN') {
      console.warn(`⏸️  [${operationId}] Skipping update due to open circuit breaker`);
      this.consecutiveFailures++; // Solo incrementar en fallo final
      return this.getGracefulFallback();
    }

    // Usar un contador local de retries para no afectar consecutiveFailures
    const currentRetryCount = this.getCurrentRetryCount(operationId);
    
    // Si debe reintentar y no hemos excedido el límite
    if (shouldRetry && currentRetryCount < this.config.retries) {
      const delay = this.getRetryDelay(currentRetryCount + 1);
      console.log(`⏳ [${operationId}] Retrying in ${delay}ms (attempt ${currentRetryCount + 1}/${this.config.retries})`);
      
      await this.sleep(delay);
      return await this.fullProtectionMode(gtfs, gtfsConfig);
    }

    // No se pudo recuperar - aplicar estrategia de degradación graceful
    // SOLO AHORA incrementar consecutiveFailures (un fallo por operación completa)
    this.consecutiveFailures++;
    this.retryTracker.delete(operationId); // Limpiar tracker al finalizar
    console.error(`💥 [${operationId}] All retry attempts failed. Applying graceful degradation.`);
    return this.getGracefulFallback();
  }

  classifyError(error) {
    // Verificar primero si hay un code específico
    if (error.code === 'CIRCUIT_OPEN') {
      return 'CIRCUIT_BREAKER_ERROR';
    }
    
    const message = error.message || '';
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('Timeout')) {
      return 'TIMEOUT_ERROR';
    }
    if (message.includes('CIRCUIT_OPEN')) {
      return 'CIRCUIT_BREAKER_ERROR';
    }
    if (message.includes('gtfsRealtimeVersion') || message.includes('protobuf')) {
      return 'DATA_FORMAT_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  shouldRetry(error, errorType) {
    // No reintentar errores de circuit breaker
    if (errorType === 'CIRCUIT_BREAKER_ERROR') return false;
    
    // Reintentar errores de red y timeouts
    if (errorType === 'NETWORK_ERROR' || errorType === 'TIMEOUT_ERROR') return true;
    
    // No reintentar errores de formato de datos
    if (errorType === 'DATA_FORMAT_ERROR') return false;
    
    // Reintentar errores desconocidos (por seguridad)
    return true;
  }

  getRetryDelay(attemptNumber) {
    // Exponential backoff: 2^attempt * 1000ms, max 30s
    return Math.min(Math.pow(2, attemptNumber) * 1000, 30000);
  }

  getCurrentRetryCount(operationId) {
    // Obtener contador de retries para una operación específica
    const count = this.retryTracker.get(operationId) || 0;
    this.retryTracker.set(operationId, count + 1);
    return count;
  }

  /**
   * Estrategia de degradación graceful cuando fallan todas las llamadas
   */
  getGracefulFallback() {
    const now = Date.now();
    const timeSinceLastSuccess = this.lastSuccessfulUpdate 
      ? now - this.lastSuccessfulUpdate 
      : null;

    console.log(`🛟 Applying graceful fallback strategy:`, {
      lastSuccessfulUpdate: this.lastSuccessfulUpdate ? new Date(this.lastSuccessfulUpdate).toISOString() : 'Never',
      timeSinceLastSuccess: timeSinceLastSuccess ? `${Math.round(timeSinceLastSuccess / 1000)}s ago` : 'N/A',
      strategy: 'Continue with cached data'
    });

    // Retornar indicador de que la operación falló pero la aplicación debe continuar
    return { 
      success: false, 
      fallbackApplied: true, 
      message: 'Using cached realtime data due to update failures',
      timeSinceLastSuccess 
    };
  }

  /**
   * Obtener estadísticas de salud del sistema
   */
  getHealthStats() {
    const stats = {
      lastSuccessfulUpdate: this.lastSuccessfulUpdate,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakers: {}
    };

    for (const [name, cb] of Object.entries(this.circuitBreakers)) {
      stats.circuitBreakers[name] = cb.getStats();
    }

    return stats;
  }

  /**
   * Endpoint de health check
   */
  getHealthStatus() {
    const stats = this.getHealthStats();
    const now = Date.now();
    
    // Determinar estado general
    let overallHealth = 'HEALTHY';
    
    // Verificar cualquier circuit breaker abierto - condición crítica
    const hasOpenCircuit = Object.values(this.circuitBreakers)
      .some(cb => cb.state === 'OPEN');
    
    if (hasOpenCircuit) {
      overallHealth = 'CRITICAL';
    } else if (this.consecutiveFailures >= 5) {
      overallHealth = 'CRITICAL';
    } else if (this.consecutiveFailures >= 1) {
      overallHealth = 'WARNING';
    }
    
    // Verificar si ha pasado mucho tiempo desde la última actualización exitosa
    if (this.lastSuccessfulUpdate && (now - this.lastSuccessfulUpdate) > 300000) { // 5 minutos
      overallHealth = 'DEGRADED';
    }

    return {
      status: overallHealth,
      timestamp: now,
      ...stats
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const robustGtfsWrapper = new RobustGtfsWrapper();

module.exports = {
  CircuitBreaker,
  RobustGtfsWrapper,
  robustGtfsWrapper
};
