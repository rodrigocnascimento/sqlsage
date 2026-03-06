import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { QueryPerformancePredictor } from './model.js';
import { IVectorizedQuery } from './types.js';
import { SEQ_LEN } from './tokenizer.js';

const META_DIM = 18;

function makeVector(opts?: Partial<{ seqFill: number; metaFill: number }>): IVectorizedQuery {
  const fill = opts || {};
  return {
    tokenSequence: Array(SEQ_LEN).fill(fill.seqFill ?? 1),
    structuralFeatures: Array(META_DIM).fill(fill.metaFill ?? 0),
  };
}

describe('QueryPerformancePredictor', () => {
  let predictor: QueryPerformancePredictor;

  beforeEach(() => {
    predictor = new QueryPerformancePredictor();
  });

  afterEach(() => {
    tf.dispose();
  });

  describe('constructor', () => {
    it('should create predictor with zero queries processed', () => {
      expect(predictor).toBeDefined();
      expect(predictor.queriesProcessed).toBe(0);
    });

    it('should start with isTrainedModel false', () => {
      expect(predictor.isTrainedModel).toBe(false);
    });
  });

  describe('buildModel', () => {
    it('should build a valid TensorFlow.js model', () => {
      predictor.buildModel();
      expect(predictor.getModel()).not.toBeNull();
    });

    it('should handle multiple buildModel calls', () => {
      predictor.buildModel();
      predictor.buildModel();
      expect(predictor.getModel()).not.toBeNull();
    });
  });

  describe('predict', () => {
    beforeEach(() => {
      predictor.buildModel();
    });

    it('should return prediction result with score and insights', async () => {
      const vector = makeVector();
      const result = await predictor.predict(vector);

      expect(result).toHaveProperty('performanceScore');
      expect(result).toHaveProperty('insights');
      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(1);
    });

    it('should return empty insights array (insights come from heuristic engine)', async () => {
      const vector = makeVector();
      const result = await predictor.predict(vector);

      expect(result.insights).toEqual([]);
    });

    it('should increment queriesProcessed counter', async () => {
      const vector = makeVector();

      expect(predictor.queriesProcessed).toBe(0);
      await predictor.predict(vector);
      expect(predictor.queriesProcessed).toBe(1);
      await predictor.predict(vector);
      expect(predictor.queriesProcessed).toBe(2);
    });

    it('should throw error if model not built', async () => {
      const newPredictor = new QueryPerformancePredictor();
      const vector = makeVector();

      await expect(newPredictor.predict(vector)).rejects.toThrow('Model not initialized');
    });

    it('should return score in valid range for all-zero features', async () => {
      const vector = makeVector({ seqFill: 0, metaFill: 0 });
      const result = await predictor.predict(vector);

      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(1);
    });

    it('should return score in valid range for mid features', async () => {
      const vector = makeVector({ seqFill: 5, metaFill: 0.5 });
      const result = await predictor.predict(vector);

      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
      expect(result.performanceScore).toBeLessThanOrEqual(1);
    });

    it('should handle various feature combinations', async () => {
      const testCases = [
        { seqFill: 0, metaFill: 0 },
        { seqFill: 10, metaFill: 1 },
        { seqFill: 50, metaFill: 0.5 },
      ];

      for (const tc of testCases) {
        const vector = makeVector(tc);
        const result = await predictor.predict(vector);
        expect(result.performanceScore).toBeGreaterThanOrEqual(0);
        expect(result.performanceScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('weight serialization', () => {
    beforeEach(() => {
      predictor.buildModel();
    });

    it('should save weights to a file', () => {
      const tmpFile = path.join(os.tmpdir(), `test-weights-${Date.now()}.json`);

      try {
        predictor.saveWeights(tmpFile);

        expect(fs.existsSync(tmpFile)).toBe(true);
        const content = fs.readFileSync(tmpFile, 'utf-8');
        const parsed = JSON.parse(content);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed[0]).toHaveProperty('name');
        expect(parsed[0]).toHaveProperty('shape');
        expect(parsed[0]).toHaveProperty('data');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });

    it('should throw when saving weights without model', () => {
      const noModel = new QueryPerformancePredictor();
      expect(() => noModel.saveWeights('/tmp/test.json')).toThrow('Model not initialized');
    });

    it('should throw when loading weights without model', () => {
      const noModel = new QueryPerformancePredictor();
      expect(() => noModel.loadWeights('/tmp/test.json')).toThrow('Model not built');
    });

    it('should throw when loading non-existent file', () => {
      expect(() => predictor.loadWeights('/nonexistent/weights.json')).toThrow('Weights file not found');
    });
  });

  describe('findLatestModel', () => {
    it('should return null for non-existent directory', () => {
      const result = QueryPerformancePredictor.findLatestModel('/nonexistent/dir');
      expect(result).toBeNull();
    });

    it('should return null when no weight files exist', () => {
      const fs = require('fs');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['readme.md', 'other.txt']);

      const result = QueryPerformancePredictor.findLatestModel('/fake/models');
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('should return latest model when weight + topology files exist', () => {
      const fs = require('fs');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'model-v1000.json',
        'model-v1000-weights.json',
        'model-v2000.json',
        'model-v2000-weights.json',
      ]);

      const result = QueryPerformancePredictor.findLatestModel('/fake/models');
      expect(result).toEqual({
        topology: '/fake/models/model-v2000.json',
        weights: '/fake/models/model-v2000-weights.json',
      });

      vi.restoreAllMocks();
    });

    it('should skip weight files without matching topology', () => {
      const fs = require('fs');
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'model-v2000-weights.json',
        'model-v1000.json',
        'model-v1000-weights.json',
      ]);

      const result = QueryPerformancePredictor.findLatestModel('/fake/models');
      expect(result).toEqual({
        topology: '/fake/models/model-v1000.json',
        weights: '/fake/models/model-v1000-weights.json',
      });

      vi.restoreAllMocks();
    });
  });

  describe('edge cases', () => {
    it('should handle all zeros in token sequence', async () => {
      predictor.buildModel();
      const vector = makeVector({ seqFill: 0, metaFill: 0 });
      const result = await predictor.predict(vector);
      expect(result).toBeDefined();
    });

    it('should handle max token values', async () => {
      predictor.buildModel();
      const vector: IVectorizedQuery = {
        tokenSequence: Array(SEQ_LEN).fill(100),
        structuralFeatures: Array(META_DIM).fill(1),
      };
      const result = await predictor.predict(vector);
      expect(result.performanceScore).toBeGreaterThanOrEqual(0);
    });
  });
});
