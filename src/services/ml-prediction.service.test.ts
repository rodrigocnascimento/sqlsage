import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MLPredictionService, MLPredictionRequest } from './ml-prediction.service.js';
import * as tf from '@tensorflow/tfjs';

describe('MLPredictionService', () => {
  let service: MLPredictionService;

  beforeEach(async () => {
    service = new MLPredictionService();
    await service.initialize();
  });

  afterEach(() => {
    tf.dispose();
  });

  describe('constructor', () => {
    it('should create service instance', () => {
      const svc = new MLPredictionService();
      expect(svc).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should initialize the ML engine', async () => {
      const svc = new MLPredictionService();
      await svc.initialize();
      expect(svc).toBeDefined();
    });

    it('should allow multiple initialize calls', async () => {
      const svc = new MLPredictionService();
      await svc.initialize();
      await svc.initialize();
      expect(svc).toBeDefined();
    });
  });

  describe('predict', () => {
    it('should return prediction with all required fields', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users WHERE id = 1' };
      const result = await service.predict(request);

      expect(result).toHaveProperty('performanceScore');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('features');
      expect(result).toHaveProperty('mlAvailable');
    });

    it('should return performance score between 0 and 1', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };
      const result = await service.predict(request);

      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(1);
    });

    it('should return insights array', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };
      const result = await service.predict(request);

      expect(Array.isArray(result.insights)).toBe(true);
    });

    it('should return features object with expected fields', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };
      const result = await service.predict(request);

      expect(result.features).toHaveProperty('hasJoin');
      expect(result.features).toHaveProperty('joinCount');
      expect(result.features).toHaveProperty('hasSubquery');
      expect(result.features).toHaveProperty('subqueryCount');
      expect(result.features).toHaveProperty('selectStar');
      expect(result.features).toHaveProperty('tableCount');
      expect(result.features).toHaveProperty('hasOr');
      expect(result.features).toHaveProperty('hasLike');
    });

    it('should return mlAvailable as boolean', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };
      const result = await service.predict(request);

      expect(typeof result.mlAvailable).toBe('boolean');
    });

    it('should report mlAvailable false without trained model', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };
      const result = await service.predict(request);

      // No trained model loaded, so ML should not be available
      expect(result.mlAvailable).toBe(false);
    });

    it('should count JOINs correctly', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM a JOIN b ON a.id = b.id JOIN c ON b.id = c.id' };
      const result = await service.predict(request);

      expect(result.features.joinCount).toBeGreaterThanOrEqual(2);
    });

    it('should detect subqueries', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)' };
      const result = await service.predict(request);

      expect(result.features.hasSubquery).toBe(1);
    });

    it('should handle empty SQL', async () => {
      const request: MLPredictionRequest = { sql: '' };
      const result = await service.predict(request);

      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(1);
    });

    it('should generate insights for cartesian product', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users, orders' };
      const result = await service.predict(request);

      const hasInsight = result.insights.length > 0;
      expect(hasInsight).toBe(true);
    });

    it('should throw if engine not initialized', async () => {
      const uninitializedService = new MLPredictionService();
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };

      await expect(uninitializedService.predict(request)).rejects.toThrow('ML engine not initialized');
    });
  });

  describe('getStatus', () => {
    it('should return status with isLoaded true after initialization', async () => {
      const status = await service.getStatus();

      expect(status.isLoaded).toBe(true);
    });

    it('should return queriesAnalyzed in status', async () => {
      const status = await service.getStatus();

      expect(typeof status.queriesAnalyzed).toBe('number');
    });

    it('should return updated queriesAnalyzed after prediction', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users' };
      await service.predict(request);

      const status = await service.getStatus();
      expect(status.queriesAnalyzed).toBeGreaterThanOrEqual(1);
    });

    it('should return heuristicRules count', async () => {
      const status = await service.getStatus();
      expect(typeof status.heuristicRules).toBe('number');
      expect(status.heuristicRules).toBeGreaterThan(0);
    });

    it('should return mlModelLoaded in status', async () => {
      const status = await service.getStatus();
      expect(typeof status.mlModelLoaded).toBe('boolean');
    });
  });

  describe('edge cases', () => {
    it('should handle very long SQL query', async () => {
      const longSql = 'SELECT ' + Array(100).fill('col').join(', ') + ' FROM users';
      const request: MLPredictionRequest = { sql: longSql };
      const result = await service.predict(request);

      expect(result).toBeDefined();
    });

    it('should handle SQL with only keywords', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT FROM WHERE AND OR' };
      const result = await service.predict(request);

      expect(result).toBeDefined();
    });

    it('should handle SQL with numbers', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM users WHERE age > 21 AND id < 100' };
      const result = await service.predict(request);

      expect(result).toBeDefined();
    });

    it('should handle SQL with special characters', async () => {
      const request: MLPredictionRequest = { sql: 'SELECT * FROM `my-table` WHERE `col-1` = 1' };
      const result = await service.predict(request);

      expect(result).toBeDefined();
    });
  });
});
