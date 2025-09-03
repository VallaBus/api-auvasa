/**
 * Tests unitarios para la clase CircuitBreaker
 * Verifica comportamiento de timeout, estados del circuit breaker,
 * métricas y transiciones entre estados
 */

const { CircuitBreaker } = require('../lib/gtfs/robust-gtfs-wrapper');

describe('CircuitBreaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 3,
      timeout: 1000,
      resetTimeout: 2000
    });
  });

  afterEach(() => {
    // Limpiar cualquier timeout pendiente
    jest.clearAllTimers();
  });

  describe('Inicialización', () => {
    it('should initialize with correct default values', () => {
      const cb = new CircuitBreaker('test');
      
      expect(cb.name).toBe('test');
      expect(cb.failureThreshold).toBe(5);
      expect(cb.timeout).toBe(30000);
      expect(cb.resetTimeout).toBe(60000);
      expect(cb.state).toBe('CLOSED');
      expect(cb.failureCount).toBe(0);
      expect(cb.stats.totalRequests).toBe(0);
    });

    it('should initialize with custom options', () => {
      const cb = new CircuitBreaker('custom', {
        failureThreshold: 2,
        timeout: 5000,
        resetTimeout: 10000
      });

      expect(cb.failureThreshold).toBe(2);
      expect(cb.timeout).toBe(5000);
      expect(cb.resetTimeout).toBe(10000);
    });
  });

  describe('Estado CLOSED - Operaciones exitosas', () => {
    it('should execute function successfully and update metrics', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failureCount).toBe(0);
      expect(circuitBreaker.stats.totalRequests).toBe(1);
      expect(circuitBreaker.stats.successfulRequests).toBe(1);
      expect(circuitBreaker.stats.failedRequests).toBe(0);
      expect(circuitBreaker.stats.lastSuccessTime).toBeTruthy();
    });

    it('should calculate average response time correctly', async () => {
      const mockFn1 = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result1'), 100))
      );
      const mockFn2 = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('result2'), 200))
      );

      jest.useFakeTimers();
      
      const promise1 = circuitBreaker.execute(mockFn1);
      jest.advanceTimersByTime(100);
      await promise1;

      const promise2 = circuitBreaker.execute(mockFn2);
      jest.advanceTimersByTime(200);
      await promise2;

      jest.useRealTimers();

      expect(circuitBreaker.stats.averageResponseTime).toBeGreaterThan(0);
      expect(circuitBreaker.stats.totalRequests).toBe(2);
      expect(circuitBreaker.stats.successfulRequests).toBe(2);
    });
  });

  describe('Manejo de fallos', () => {
    it('should handle function failures and update failure count', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test failure'));
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test failure');
      
      expect(circuitBreaker.failureCount).toBe(1);
      expect(circuitBreaker.state).toBe('CLOSED'); // Aún cerrado
      expect(circuitBreaker.stats.totalRequests).toBe(1);
      expect(circuitBreaker.stats.successfulRequests).toBe(0);
      expect(circuitBreaker.stats.failedRequests).toBe(1);
      expect(circuitBreaker.stats.lastFailureTime).toBeTruthy();
    });

    it('should open circuit after reaching failure threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Repeated failure'));
      
      // Ejecutar suficientes fallos para alcanzar el threshold (3)
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Repeated failure');
      }
      
      expect(circuitBreaker.state).toBe('OPEN');
      expect(circuitBreaker.failureCount).toBe(3);
      expect(circuitBreaker.stats.circuitOpenCount).toBe(1);
    });

    it('should reject immediately when circuit is OPEN', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Initial failure'));
      
      // Causar suficientes fallos para abrir el circuito
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Initial failure');
      }
      
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Intentar ejecutar con circuito abierto
      const newMockFn = jest.fn().mockResolvedValue('should not be called');
      
      await expect(circuitBreaker.execute(newMockFn)).rejects.toThrow('Circuit breaker OPEN');
      expect(newMockFn).not.toHaveBeenCalled();
    });
  });

  describe('Timeout functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should timeout long-running functions', async () => {
      const mockFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('too late'), 2000))
      );
      
      const executePromise = circuitBreaker.execute(mockFn);
      
      // Avanzar el tiempo más allá del timeout (1000ms)
      jest.advanceTimersByTime(1001);
      
      await expect(executePromise).rejects.toThrow('Timeout after 1000ms');
      expect(circuitBreaker.stats.timeouts).toBe(1);
      expect(circuitBreaker.stats.failedRequests).toBe(1);
    });

    it('should complete before timeout for fast functions', async () => {
      const mockFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('fast result'), 500))
      );
      
      const executePromise = circuitBreaker.execute(mockFn);
      
      // Avanzar el tiempo solo hasta que la función complete
      jest.advanceTimersByTime(500);
      
      await expect(executePromise).resolves.toBe('fast result');
      expect(circuitBreaker.stats.timeouts).toBe(0);
      expect(circuitBreaker.stats.successfulRequests).toBe(1);
    });
  });

  describe('Transición de estados del Circuit Breaker', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should transition from OPEN to HALF_OPEN after reset timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Abrir el circuito
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Failure');
      }
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Avanzar tiempo hasta justo antes del resetTimeout
      jest.advanceTimersByTime(1999);
      
      // Debería seguir rechazando inmediatamente
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Circuit breaker OPEN');
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Avanzar tiempo pasado el resetTimeout
      jest.advanceTimersByTime(2);
      
      // Debería intentar la función y transicionar a HALF_OPEN
      const testFn = jest.fn().mockResolvedValue('test success');
      await expect(circuitBreaker.execute(testFn)).resolves.toBe('test success');
      expect(circuitBreaker.state).toBe('CLOSED'); // Éxito en HALF_OPEN cierra el circuito
    });

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Abrir el circuito
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Failure');
      }
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Esperar el resetTimeout
      jest.advanceTimersByTime(2001);
      
      // Intentar con función que falla -> debería volver a OPEN
      const failingFn = jest.fn().mockRejectedValue(new Error('Still failing'));
      await expect(circuitBreaker.execute(failingFn)).rejects.toThrow('Still failing');
      
      expect(circuitBreaker.state).toBe('OPEN');
    });

    it('should transition from HALF_OPEN to CLOSED on success', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Abrir el circuito
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Failure');
      }
      expect(circuitBreaker.state).toBe('OPEN');
      
      // Esperar el resetTimeout
      jest.advanceTimersByTime(2001);
      
      // Intentar con función exitosa -> debería cerrar el circuito
      const successFn = jest.fn().mockResolvedValue('recovered');
      await expect(circuitBreaker.execute(successFn)).resolves.toBe('recovered');
      
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failureCount).toBe(0);
    });
  });

  describe('Métricas y health status', () => {
    it('should return correct health status for healthy circuit', () => {
      expect(circuitBreaker.getHealthStatus()).toBe('HEALTHY');
    });

    it('should return CRITICAL for open circuit', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Failure'));
      
      // Abrir el circuito
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Failure');
      }
      
      expect(circuitBreaker.getHealthStatus()).toBe('CRITICAL');
    });

    it('should return WARNING for low success rate', async () => {
      // 9 exitosos, 1 fallido = 90% éxito (< 90% pero >= 50%)
      const successFn = jest.fn().mockResolvedValue('success');
      const failFn = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Primero 9 éxitos
      for (let i = 0; i < 9; i++) {
        await circuitBreaker.execute(successFn);
      }
      
      // Luego 1 fallo (pero no suficiente para abrir el circuito)
      try {
        await circuitBreaker.execute(failFn);
      } catch (e) {
        // Ignorar el error
      }
      
      // 9/10 = 90%, exactamente en el límite para WARNING
      expect(circuitBreaker.getHealthStatus()).toBe('WARNING');
    });

    it('should return complete stats', async () => {
      const mockFn = jest.fn().mockResolvedValue('test');
      await circuitBreaker.execute(mockFn);
      
      const stats = circuitBreaker.getStats();
      
      expect(stats).toEqual({
        totalRequests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        timeouts: 0,
        circuitOpenCount: 0,
        averageResponseTime: expect.any(Number),
        lastSuccessTime: expect.any(Number),
        lastFailureTime: null,
        state: 'CLOSED',
        failureCount: 0,
        healthStatus: 'HEALTHY'
      });
    });
  });
});
