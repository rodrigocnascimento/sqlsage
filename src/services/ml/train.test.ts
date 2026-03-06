import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { ModelTrainer } from './train.js';
import type { IFeatureRecord } from './train.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

function makeMockRecord(index: number): IFeatureRecord {
  const queries = [
    'SELECT * FROM users WHERE id = 1',
    'SELECT name, email FROM orders JOIN users ON orders.user_id = users.id WHERE orders.total > 100',
    'SELECT COUNT(*) FROM products WHERE price < 50',
    'SELECT u.name FROM users u WHERE u.active = 1 ORDER BY u.name LIMIT 10',
    'SELECT * FROM logs WHERE created_at > NOW() AND level = "ERROR"',
    'SELECT p.name, c.name FROM products p JOIN categories c ON p.category_id = c.id',
    'SELECT id FROM sessions WHERE expired = 1',
    'SELECT AVG(total) FROM orders GROUP BY user_id HAVING AVG(total) > 200',
    'SELECT * FROM users WHERE email LIKE "%@example.com"',
    'SELECT o.id, o.total FROM orders o WHERE o.status = "pending" ORDER BY o.created_at',
    'SELECT DISTINCT department FROM employees WHERE salary > 50000',
    'SELECT t.name, COUNT(p.id) FROM teams t LEFT JOIN players p ON t.id = p.team_id GROUP BY t.name',
  ];

  const executionTimes = [50, 1200, 80, 30, 500, 250, 10, 900, 350, 60, 45, 700];

  const featureSets: Record<string, number>[] = [
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 1, tableCount: 1, whereColumnsIndexed: 0, estimatedRows: 0, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 1, joinCount: 1, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 2, whereColumnsIndexed: 1, estimatedRows: 0.5, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 1, whereColumnsIndexed: 0, estimatedRows: 0.3, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 1, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 1, whereColumnsIndexed: 1, estimatedRows: 0.1, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 1, hasLimit: 1, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 1, selectStar: 1, tableCount: 1, whereColumnsIndexed: 0, estimatedRows: 0.4, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 1, joinCount: 1, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 2, whereColumnsIndexed: 0, estimatedRows: 0.2, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 1, whereColumnsIndexed: 1, estimatedRows: 0, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 1, whereColumnsIndexed: 0, estimatedRows: 0.6, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 1, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 1, tableCount: 1, whereColumnsIndexed: 0, estimatedRows: 0.3, hasOr: 0, hasUnion: 0, hasLike: 1, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 1, whereColumnsIndexed: 1, estimatedRows: 0.1, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 1, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 0, joinCount: 0, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 1, whereColumnsIndexed: 0, estimatedRows: 0.2, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 0, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
    { hasJoin: 1, joinCount: 1, hasSubquery: 0, subqueryCount: 0, hasFunctionInWhere: 0, selectStar: 0, tableCount: 2, whereColumnsIndexed: 0, estimatedRows: 0.7, hasOr: 0, hasUnion: 0, hasLike: 0, hasCountStar: 0, nestedJoinDepth: 0, hasGroupBy: 1, hasOrderBy: 0, hasLimit: 0, orConditionCount: 0 },
  ];

  const i = index % queries.length;

  return {
    query: queries[i],
    executionTimeMs: executionTimes[i],
    database: 'testdb',
    timestamp: `2024-01-01T00:00:0${index}.000Z`,
    features: featureSets[i],
  };
}

function buildMockJsonl(count: number): string {
  return Array.from({ length: count }, (_, i) => JSON.stringify(makeMockRecord(i))).join('\n');
}

describe('ModelTrainer', () => {
  let trainer: ModelTrainer;

  beforeEach(() => {
    trainer = new ModelTrainer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    tf.dispose();
  });

  describe('train() validation', () => {
    it('should throw when dataset has fewer than 10 samples', async () => {
      const fewRecords = buildMockJsonl(5);
      vi.mocked(readFileSync).mockReturnValue(fewRecords);

      await expect(
        trainer.train('/fake/input.jsonl', '/fake/output')
      ).rejects.toThrow('Need at least 10 samples for training');
    });

    it('should throw when dataset has exactly 9 samples', async () => {
      const nineRecords = buildMockJsonl(9);
      vi.mocked(readFileSync).mockReturnValue(nineRecords);

      await expect(
        trainer.train('/fake/input.jsonl', '/fake/output')
      ).rejects.toThrow('Need at least 10 samples for training');
    });

    it('should throw when dataset is empty', async () => {
      vi.mocked(readFileSync).mockReturnValue('');

      await expect(
        trainer.train('/fake/input.jsonl', '/fake/output')
      ).rejects.toThrow('Need at least 10 samples for training');
    });

    it('should throw when dataset has only invalid JSON lines', async () => {
      const invalidLines = Array(12).fill('not valid json').join('\n');
      vi.mocked(readFileSync).mockReturnValue(invalidLines);

      await expect(
        trainer.train('/fake/input.jsonl', '/fake/output')
      ).rejects.toThrow('Need at least 10 samples for training');
    });
  });

  describe('train() full flow', { timeout: 60000 }, () => {
    it('should complete training and return a valid result', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('modelVersion');
      expect(result).toHaveProperty('epochs');
      expect(result).toHaveProperty('finalLoss');
      expect(result).toHaveProperty('finalAccuracy');
      expect(result).toHaveProperty('trainSamples');
      expect(result).toHaveProperty('valSamples');
      expect(result).toHaveProperty('metrics');
    });

    it('should return correct epoch count in result', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(result.epochs).toBe(2);
    });

    it('should compute correct train/val sample split', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      const expectedValSamples = Math.floor(12 * 0.2);
      const expectedTrainSamples = 12 - expectedValSamples;

      expect(result.valSamples).toBe(expectedValSamples);
      expect(result.trainSamples).toBe(expectedTrainSamples);
    });

    it('should return numeric finalLoss and finalAccuracy', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(typeof result.finalLoss).toBe('number');
      expect(typeof result.finalAccuracy).toBe('number');
      expect(result.finalLoss).toBeGreaterThanOrEqual(0);
      expect(result.finalAccuracy).toBeGreaterThanOrEqual(0);
    });

    it('should return metrics arrays with length equal to epochs', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(result.metrics.loss).toHaveLength(2);
      expect(result.metrics.accuracy).toHaveLength(2);
      expect(result.metrics.valLoss).toHaveLength(2);
      expect(result.metrics.valAccuracy).toHaveLength(2);
    });

    it('should return a model version string starting with "v"', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(result.modelVersion).toMatch(/^v\d+$/);
    });
  });

  describe('train() file I/O', { timeout: 60000 }, () => {
    it('should write model JSON and training result to output directory', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      await trainer.train('/fake/input.jsonl', '/fake/output', config);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;

      // Should have at least 2 writes: model JSON + training result JSON
      expect(writeCalls.length).toBeGreaterThanOrEqual(2);

      const modelWriteCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('model-v')
      );
      expect(modelWriteCall).toBeDefined();
      expect((modelWriteCall![0] as string)).toMatch(/^\/fake\/output\/model-v\d+\.json$/);

      const resultWriteCall = writeCalls.find(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes('training-result-v')
      );
      expect(resultWriteCall).toBeDefined();
      expect((resultWriteCall![0] as string)).toMatch(/^\/fake\/output\/training-result-v\d+\.json$/);
    });

    it('should create output directory when it does not exist', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(false);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(mkdirSync).toHaveBeenCalledWith('/fake/output', { recursive: true });
    });

    it('should not call mkdirSync when output directory already exists', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('should write valid JSON content for model and result files', async () => {
      const mockData = buildMockJsonl(12);
      vi.mocked(readFileSync).mockReturnValue(mockData);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      await trainer.train('/fake/input.jsonl', '/fake/output', config);

      const writeCalls = vi.mocked(writeFileSync).mock.calls;

      for (const call of writeCalls) {
        const content = call[1] as string;
        expect(() => JSON.parse(content)).not.toThrow();
      }
    });
  });

  describe('loadDataset edge cases', { timeout: 60000 }, () => {
    it('should skip blank lines in JSONL', async () => {
      const lines = [
        JSON.stringify(makeMockRecord(0)),
        '',
        '   ',
        ...Array.from({ length: 11 }, (_, i) => JSON.stringify(makeMockRecord(i + 1))),
      ].join('\n');

      vi.mocked(readFileSync).mockReturnValue(lines);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(result.trainSamples + result.valSamples).toBe(12);
    });

    it('should skip lines with invalid JSON mixed with valid lines', async () => {
      const lines = [
        ...Array.from({ length: 10 }, (_, i) => JSON.stringify(makeMockRecord(i))),
        'this is not json',
        '{"broken json',
        ...Array.from({ length: 2 }, (_, i) => JSON.stringify(makeMockRecord(i + 10))),
      ].join('\n');

      vi.mocked(readFileSync).mockReturnValue(lines);
      vi.mocked(existsSync).mockReturnValue(true);

      const config = {
        epochs: 2,
        batchSize: 4,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      };

      const result = await trainer.train('/fake/input.jsonl', '/fake/output', config);

      expect(result.trainSamples + result.valSamples).toBe(12);
    });

    it('should reject records without features property', async () => {
      const recordsWithoutFeatures = Array.from({ length: 12 }, (_, i) =>
        JSON.stringify({ query: `SELECT ${i}`, executionTimeMs: 100, database: 'db', timestamp: '2024-01-01T00:00:00Z' })
      ).join('\n');

      vi.mocked(readFileSync).mockReturnValue(recordsWithoutFeatures);

      await expect(
        trainer.train('/fake/input.jsonl', '/fake/output')
      ).rejects.toThrow('Need at least 10 samples for training');
    });
  });
});
