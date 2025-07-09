import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('checkHealth', () => {
    it('should return basic health status', async () => {
      const result = await service.checkHealth();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('should return valid timestamp', async () => {
      const result = await service.checkHealth();
      const timestamp = new Date(result.timestamp);

      expect(timestamp.getTime()).toBeGreaterThan(0);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });
  });

  describe('checkDetailedHealth', () => {
    it('should return detailed health status', async () => {
      const result = await service.checkDetailedHealth();

      expect(result).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.any(Object),
        version: expect.any(String),
      });
    });

    it('should return valid memory usage', async () => {
      const result = await service.checkDetailedHealth();

      expect(result.memory).toHaveProperty('rss');
      expect(result.memory).toHaveProperty('heapTotal');
      expect(result.memory).toHaveProperty('heapUsed');
      expect(result.memory).toHaveProperty('external');
      expect(typeof result.memory.rss).toBe('number');
      expect(typeof result.memory.heapTotal).toBe('number');
      expect(typeof result.memory.heapUsed).toBe('number');
      expect(typeof result.memory.external).toBe('number');
    });

    it('should return valid uptime', async () => {
      const result = await service.checkDetailedHealth();

      expect(result.uptime).toBeGreaterThan(0);
      expect(typeof result.uptime).toBe('number');
    });

    it('should return valid Node.js version', async () => {
      const result = await service.checkDetailedHealth();

      expect(result.version).toMatch(/^v\d+\.\d+\.\d+$/);
    });
  });
}); 