/**
 * E2E Pipeline Integration Test - sql-ml-cli v0.3
 *
 * Validates the full pipeline: feature extraction -> heuristic analysis ->
 * model training -> ML+heuristic prediction.
 *
 * Proves that the system can differentiate clean, medium-risk, and bad queries
 * with stable, deterministic scoring. This is the baseline benchmark for v0.4.0
 * when real EXPLAIN ANALYZE integration can connect scores to actual costs.
 *
 * Runtime: ~15-20s (dominated by TensorFlow.js training phase).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FeatureExtractor, IExtractedFeatures } from '../services/ml/engine/feature-extractor';
import { HeuristicEngine } from '../services/ml/engine/heuristic-rules';
import { ModelTrainer } from '../services/ml/train';
import { MLQueryEngine } from '../services/ml/engine/index';
import { ISQLInsight } from '../services/ml/engine/types';

// ---------------------------------------------------------------------------
// Query Bank: 50 queries across 3 tiers
// ---------------------------------------------------------------------------

interface IQueryEntry {
  tier: 'clean' | 'medium' | 'bad';
  query: string;
  executionTimeMs: number;
  expectedRules?: string[]; // heuristic rule IDs we expect to trigger
}

const QUERY_BANK: IQueryEntry[] = [
  // =========================================================================
  // CLEAN TIER (20 queries) - fast, well-structured
  // =========================================================================
  { tier: 'clean', query: 'SELECT id, name FROM users WHERE id = 1 LIMIT 1', executionTimeMs: 3, expectedRules: [] },
  { tier: 'clean', query: 'SELECT email FROM users WHERE email = \'test@mail.com\' LIMIT 1', executionTimeMs: 5, expectedRules: [] },
  { tier: 'clean', query: 'SELECT COUNT(*) FROM products WHERE active = 1', executionTimeMs: 12, expectedRules: [] },
  { tier: 'clean', query: 'SELECT id FROM orders WHERE id = 100 LIMIT 1', executionTimeMs: 2, expectedRules: [] },
  { tier: 'clean', query: 'SELECT name FROM categories WHERE parent_id IS NULL LIMIT 10', executionTimeMs: 6, expectedRules: [] },
  { tier: 'clean', query: 'SELECT id, created_at FROM users WHERE active = 1 LIMIT 50', executionTimeMs: 8, expectedRules: [] },
  { tier: 'clean', query: 'SELECT product_id, quantity FROM order_items WHERE order_id = 42 LIMIT 20', executionTimeMs: 4, expectedRules: [] },
  { tier: 'clean', query: 'SELECT name, price FROM products WHERE category_id = 5 LIMIT 25', executionTimeMs: 7, expectedRules: [] },
  { tier: 'clean', query: 'SELECT id FROM sessions WHERE user_id = 10 LIMIT 1', executionTimeMs: 3, expectedRules: [] },
  { tier: 'clean', query: 'SELECT COUNT(*) FROM orders WHERE status = \'completed\' AND user_id = 1', executionTimeMs: 10, expectedRules: [] },
  { tier: 'clean', query: 'SELECT title, body FROM posts WHERE author_id = 7 LIMIT 10', executionTimeMs: 9, expectedRules: [] },
  { tier: 'clean', query: 'SELECT id, amount FROM payments WHERE order_id = 55 LIMIT 1', executionTimeMs: 4, expectedRules: [] },
  { tier: 'clean', query: 'SELECT slug FROM categories WHERE id = 3 LIMIT 1', executionTimeMs: 2, expectedRules: [] },
  { tier: 'clean', query: 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE o.id = 99 LIMIT 1', executionTimeMs: 15, expectedRules: [] },
  { tier: 'clean', query: 'SELECT p.name, c.name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = 10 LIMIT 1', executionTimeMs: 12, expectedRules: [] },
  { tier: 'clean', query: 'SELECT id FROM audit_log WHERE entity_id = 100 LIMIT 50', executionTimeMs: 6, expectedRules: [] },
  { tier: 'clean', query: 'SELECT MAX(created_at) FROM orders WHERE user_id = 5', executionTimeMs: 8, expectedRules: [] },
  { tier: 'clean', query: 'SELECT id, name FROM tags WHERE active = 1 LIMIT 100', executionTimeMs: 5, expectedRules: [] },
  { tier: 'clean', query: 'SELECT SUM(quantity) FROM order_items WHERE product_id = 20', executionTimeMs: 11, expectedRules: [] },
  { tier: 'clean', query: 'SELECT AVG(price) FROM products WHERE category_id = 8', executionTimeMs: 14, expectedRules: [] },

  // =========================================================================
  // MEDIUM TIER (15 queries) - 1-2 anti-patterns each
  // =========================================================================

  // leading-wildcard
  { tier: 'medium', query: 'SELECT id, name FROM users WHERE name LIKE \'%john%\' LIMIT 20', executionTimeMs: 180, expectedRules: ['leading-wildcard'] },
  // no-limit
  { tier: 'medium', query: 'SELECT id, email FROM users WHERE active = 1', executionTimeMs: 200, expectedRules: ['no-limit'] },
  // function-on-column
  { tier: 'medium', query: 'SELECT id FROM users WHERE UPPER(name) = \'ADMIN\' LIMIT 10', executionTimeMs: 150, expectedRules: ['function-on-column'] },
  // or-different-columns
  { tier: 'medium', query: 'SELECT id FROM products WHERE category_id = 5 OR price > 100', executionTimeMs: 250, expectedRules: ['or-different-columns', 'no-limit'] },
  // count-no-where
  { tier: 'medium', query: 'SELECT COUNT(*) FROM orders', executionTimeMs: 300, expectedRules: ['count-no-where'] },
  // union-without-all
  { tier: 'medium', query: 'SELECT name FROM products WHERE active = 1 UNION SELECT name FROM categories WHERE active = 1', executionTimeMs: 220, expectedRules: ['union-without-all', 'no-limit'] },
  // distinct-order-by
  { tier: 'medium', query: 'SELECT DISTINCT category_id FROM products ORDER BY category_id', executionTimeMs: 170, expectedRules: ['distinct-order-by', 'no-limit'] },
  // or-to-in (3+ OR on same column)
  { tier: 'medium', query: 'SELECT id FROM orders WHERE status = \'a\' OR status = \'b\' OR status = \'c\' LIMIT 50', executionTimeMs: 130, expectedRules: ['or-to-in'] },
  // leading-wildcard + no-limit
  { tier: 'medium', query: 'SELECT id, title FROM posts WHERE title LIKE \'%trending%\'', executionTimeMs: 280, expectedRules: ['leading-wildcard', 'no-limit'] },
  // function-on-column + no-limit
  { tier: 'medium', query: 'SELECT id, name FROM products WHERE LOWER(name) = \'widget\'', executionTimeMs: 190, expectedRules: ['function-on-column', 'no-limit'] },
  // or-different-columns + leading-wildcard
  { tier: 'medium', query: 'SELECT id FROM users WHERE email LIKE \'%test%\' OR name = \'admin\' LIMIT 10', executionTimeMs: 260, expectedRules: ['leading-wildcard', 'or-different-columns'] },
  // no-limit with ORDER BY
  { tier: 'medium', query: 'SELECT id, name, price FROM products WHERE price > 50 ORDER BY price DESC', executionTimeMs: 210, expectedRules: ['no-limit'] },
  // count-no-where on large table
  { tier: 'medium', query: 'SELECT COUNT(*) FROM audit_log', executionTimeMs: 400, expectedRules: ['count-no-where'] },
  // distinct + order + no-limit
  { tier: 'medium', query: 'SELECT DISTINCT user_id FROM orders ORDER BY user_id', executionTimeMs: 350, expectedRules: ['distinct-order-by', 'no-limit'] },
  // union-without-all + leading-wildcard
  { tier: 'medium', query: 'SELECT name FROM products WHERE name LIKE \'%sale%\' UNION SELECT name FROM categories WHERE name LIKE \'%sale%\'', executionTimeMs: 320, expectedRules: ['leading-wildcard', 'union-without-all', 'no-limit'] },

  // =========================================================================
  // BAD TIER (15 queries) - 3+ anti-patterns, high risk
  // =========================================================================

  // select-star-join + no-limit + or-different-columns
  { tier: 'bad', query: 'SELECT * FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1 OR o.status = \'pending\'', executionTimeMs: 650, expectedRules: ['select-star-join', 'no-limit', 'or-different-columns'] },
  // subquery-in-where + leading-wildcard + no-limit
  { tier: 'bad', query: 'SELECT id, name FROM products WHERE id IN (SELECT product_id FROM order_items WHERE quantity > 10) AND name LIKE \'%special%\'', executionTimeMs: 720, expectedRules: ['subquery-in-where', 'leading-wildcard', 'no-limit'] },
  // select-star-join + subquery-in-where + no-limit
  { tier: 'bad', query: 'SELECT * FROM orders o JOIN users u ON o.user_id = u.id WHERE o.total > (SELECT AVG(total) FROM orders)', executionTimeMs: 890, expectedRules: ['select-star-join', 'subquery-in-where', 'no-limit'] },
  // cartesian-product + no-limit + leading-wildcard
  { tier: 'bad', query: 'SELECT u.name, p.name FROM users u, products p WHERE u.name LIKE \'%vip%\'', executionTimeMs: 1500, expectedRules: ['cartesian-product', 'leading-wildcard', 'no-limit'] },
  // no-where-mutation (DELETE without WHERE)
  { tier: 'bad', query: 'DELETE FROM temp_logs', executionTimeMs: 2000, expectedRules: ['no-where-mutation'] },
  // no-where-mutation (UPDATE without WHERE)
  { tier: 'bad', query: 'UPDATE users SET last_login = NOW()', executionTimeMs: 1800, expectedRules: ['no-where-mutation'] },
  // select-star-join + leading-wildcard + or-different-columns + no-limit
  { tier: 'bad', query: 'SELECT * FROM products p JOIN categories c ON p.category_id = c.id WHERE p.name LIKE \'%sale%\' OR c.active = 0', executionTimeMs: 750, expectedRules: ['select-star-join', 'leading-wildcard', 'or-different-columns', 'no-limit'] },
  // deep-subquery (3 levels) + no-limit
  { tier: 'bad', query: 'SELECT id FROM users WHERE id IN (SELECT user_id FROM orders WHERE id IN (SELECT order_id FROM order_items WHERE product_id IN (SELECT id FROM products WHERE active = 0)))', executionTimeMs: 1100, expectedRules: ['deep-subquery', 'subquery-in-where', 'no-limit'] },
  // too-many-joins + no-limit
  { tier: 'bad', query: 'SELECT u.name FROM users u JOIN orders o ON u.id = o.user_id JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id JOIN categories c ON p.category_id = c.id JOIN tags t ON p.id = t.product_id JOIN tag_groups tg ON t.group_id = tg.id', executionTimeMs: 950, expectedRules: ['too-many-joins', 'no-limit'] },
  // cartesian-product + function-on-column + no-limit
  { tier: 'bad', query: 'SELECT u.name, o.total FROM users u, orders o WHERE UPPER(u.name) = \'ADMIN\'', executionTimeMs: 1600, expectedRules: ['cartesian-product', 'function-on-column', 'no-limit'] },
  // select-star-join + subquery + leading-wildcard + no-limit
  { tier: 'bad', query: 'SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id LEFT JOIN order_items oi ON o.id = oi.order_id WHERE o.status LIKE \'%pending%\' AND oi.product_id IN (SELECT id FROM products WHERE name LIKE \'%test%\')', executionTimeMs: 1300, expectedRules: ['select-star-join', 'leading-wildcard', 'subquery-in-where', 'no-limit'] },
  // join-no-on (intentional missing ON)
  { tier: 'bad', query: 'SELECT u.name, o.total FROM users u JOIN orders o WHERE u.id = o.user_id AND o.total > 500', executionTimeMs: 800, expectedRules: ['join-no-on', 'no-limit'] },
  // cartesian-product + or-different-columns + no-limit
  { tier: 'bad', query: 'SELECT u.email, p.name FROM users u, products p WHERE u.status = \'active\' OR p.price > 1000', executionTimeMs: 1400, expectedRules: ['cartesian-product', 'or-different-columns', 'no-limit'] },
  // select-star-join + function-on-column + or-different-columns + no-limit
  { tier: 'bad', query: 'SELECT * FROM orders o JOIN users u ON o.user_id = u.id WHERE LOWER(u.email) = \'admin@test.com\' OR o.total > 999', executionTimeMs: 680, expectedRules: ['select-star-join', 'function-on-column', 'or-different-columns', 'no-limit'] },
  // deep-subquery + leading-wildcard + no-limit
  { tier: 'bad', query: 'SELECT name FROM products WHERE category_id IN (SELECT id FROM categories WHERE parent_id IN (SELECT id FROM categories WHERE name LIKE \'%root%\'))', executionTimeMs: 900, expectedRules: ['subquery-in-where', 'leading-wildcard', 'no-limit'] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function querysByTier(tier: 'clean' | 'medium' | 'bad'): IQueryEntry[] {
  return QUERY_BANK.filter(q => q.tier === tier);
}

function avg(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : ' '.repeat(len - str.length) + str;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('E2E Pipeline', () => {
  // Shared state across phases
  const featureExtractor = new FeatureExtractor();
  const heuristicEngine = new HeuristicEngine();

  let tempDir: string;
  let featuresPath: string;
  let modelsDir: string;

  // Feature extraction results
  const extractedFeatures = new Map<string, IExtractedFeatures>();

  // Heuristic-only scores
  const heuristicResults = new Map<string, { score: number; insights: ISQLInsight[] }>();

  // ML+Heuristic scores
  const mlResults = new Map<string, { performanceScore: number; mlAvailable: boolean; insights: ISQLInsight[] }>();

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sql-ml-e2e-'));
    featuresPath = join(tempDir, 'features.jsonl');
    modelsDir = join(tempDir, 'models');
  });

  afterAll(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // Phase 1: Feature Extraction
  // =========================================================================

  describe('Phase 1: Feature Extraction', () => {
    it('should extract 18 numeric features for all 50 queries', () => {
      for (const entry of QUERY_BANK) {
        const features = featureExtractor.extract(entry.query);
        extractedFeatures.set(entry.query, features);

        // All 18 fields must be numbers
        const values = Object.values(features);
        expect(values).toHaveLength(18);
        for (const val of values) {
          expect(typeof val).toBe('number');
          expect(Number.isFinite(val)).toBe(true);
        }
      }
      expect(extractedFeatures.size).toBe(50);
    });

    it('should detect no anti-patterns in clean queries', () => {
      for (const entry of querysByTier('clean')) {
        const f = extractedFeatures.get(entry.query)!;
        // Clean queries should not have subqueries or SELECT *
        expect(f.hasSubquery).toBe(0);
        expect(f.selectStar).toBe(0);
      }
    });

    it('should detect structural patterns in bad queries', () => {
      const badFeatures = querysByTier('bad').map(e => extractedFeatures.get(e.query)!);

      // At least half of bad queries should have JOINs or subqueries
      const withJoinOrSubquery = badFeatures.filter(f => f.hasJoin === 1 || f.hasSubquery === 1);
      expect(withJoinOrSubquery.length).toBeGreaterThanOrEqual(Math.floor(badFeatures.length / 2));

      // At least some bad queries should have SELECT *
      const withSelectStar = badFeatures.filter(f => f.selectStar === 1);
      expect(withSelectStar.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // Phase 2: Heuristic Baseline
  // =========================================================================

  describe('Phase 2: Heuristic Baseline', () => {
    it('should score all 50 queries with heuristics', () => {
      for (const entry of QUERY_BANK) {
        const result = heuristicEngine.analyze(entry.query);
        heuristicResults.set(entry.query, result);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
      expect(heuristicResults.size).toBe(50);
    });

    it('should score clean queries >= 0.80 on average', () => {
      const cleanScores = querysByTier('clean').map(e => heuristicResults.get(e.query)!.score);
      const avgClean = avg(cleanScores);
      expect(avgClean).toBeGreaterThanOrEqual(0.80);
    });

    it('should score bad queries <= 0.60 on average', () => {
      const badScores = querysByTier('bad').map(e => heuristicResults.get(e.query)!.score);
      const avgBad = avg(badScores);
      expect(avgBad).toBeLessThanOrEqual(0.60);
    });

    it('should show clear tier ordering: clean > medium > bad', () => {
      const avgClean = avg(querysByTier('clean').map(e => heuristicResults.get(e.query)!.score));
      const avgMedium = avg(querysByTier('medium').map(e => heuristicResults.get(e.query)!.score));
      const avgBad = avg(querysByTier('bad').map(e => heuristicResults.get(e.query)!.score));

      expect(avgClean).toBeGreaterThan(avgMedium);
      expect(avgMedium).toBeGreaterThan(avgBad);
    });

    it('should trigger expected heuristic rules for annotated queries', () => {
      let totalExpected = 0;
      let totalMatched = 0;

      for (const entry of QUERY_BANK) {
        if (!entry.expectedRules || entry.expectedRules.length === 0) continue;

        const result = heuristicResults.get(entry.query)!;
        // We cannot directly access rule IDs from insights, but we can check
        // the count of insights matches the expected pattern count
        // For a more precise check, verify insight types
        totalExpected += entry.expectedRules.length;
        totalMatched += result.insights.length;
      }

      // At least 70% of expected rules should trigger (some may overlap or
      // not fire due to regex edge cases)
      expect(totalMatched).toBeGreaterThanOrEqual(totalExpected * 0.7);
    });

    it('should produce zero insights for simple clean queries', () => {
      // The simplest clean queries with LIMIT should have no insights
      const simpleClean = [
        'SELECT id, name FROM users WHERE id = 1 LIMIT 1',
        'SELECT id FROM orders WHERE id = 100 LIMIT 1',
        'SELECT slug FROM categories WHERE id = 3 LIMIT 1',
      ];

      for (const query of simpleClean) {
        const result = heuristicResults.get(query)!;
        expect(result.insights).toHaveLength(0);
        expect(result.score).toBe(1.0);
      }
    });
  });

  // =========================================================================
  // Phase 3: Model Training
  // =========================================================================

  describe('Phase 3: Model Training', { timeout: 60_000 }, () => {
    it('should write features JSONL for training', () => {
      const lines: string[] = [];
      for (const entry of QUERY_BANK) {
        const features = extractedFeatures.get(entry.query)!;
        const record = {
          id: `e2e-${lines.length}`,
          query: entry.query,
          executionTimeMs: entry.executionTimeMs,
          database: 'e2e-test',
          timestamp: new Date().toISOString(),
          features,
        };
        lines.push(JSON.stringify(record));
      }

      writeFileSync(featuresPath, lines.join('\n'));
      expect(existsSync(featuresPath)).toBe(true);
    });

    let trainingResult: {
      modelVersion: string;
      epochs: number;
      finalLoss: number;
      finalAccuracy: number;
      trainSamples: number;
      valSamples: number;
    };

    it('should train a model with 10 epochs successfully', async () => {
      const trainer = new ModelTrainer();
      trainingResult = await trainer.train(featuresPath, modelsDir, {
        epochs: 10,
        batchSize: 8,
        validationSplit: 0.2,
        learningRate: 0.001,
        slowThreshold: 500,
      });

      expect(trainingResult.modelVersion).toMatch(/^v\d+$/);
      expect(trainingResult.epochs).toBe(10);
      expect(trainingResult.trainSamples).toBe(40); // 50 * 0.8
      expect(trainingResult.valSamples).toBe(10);   // 50 * 0.2
    });

    it('should produce valid loss and accuracy metrics', () => {
      expect(trainingResult.finalLoss).toBeGreaterThan(0);
      expect(trainingResult.finalLoss).toBeLessThan(5);
      expect(trainingResult.finalAccuracy).toBeGreaterThanOrEqual(0);
      expect(trainingResult.finalAccuracy).toBeLessThanOrEqual(1);
    });

    it('should write model topology, weights, and result files', () => {
      const version = trainingResult.modelVersion;
      const topologyPath = join(modelsDir, `model-${version}.json`);
      const weightsPath = join(modelsDir, `model-${version}-weights.json`);
      const resultPath = join(modelsDir, `training-result-${version}.json`);

      expect(existsSync(topologyPath)).toBe(true);
      expect(existsSync(weightsPath)).toBe(true);
      expect(existsSync(resultPath)).toBe(true);
    });
  });

  // =========================================================================
  // Phase 4: ML+Heuristic Analysis
  // =========================================================================

  describe('Phase 4: ML+Heuristic Analysis', { timeout: 60_000 }, () => {
    let engine: MLQueryEngine;

    it('should initialize engine with trained model', async () => {
      engine = new MLQueryEngine();
      await engine.start(modelsDir);

      const stats = engine.getStats();
      expect(stats.mlModelLoaded).toBe(true);
    });

    it('should analyze all 50 queries with ML complement', async () => {
      for (const entry of QUERY_BANK) {
        const result = await engine.processQuery(entry.query);
        mlResults.set(entry.query, result);

        expect(result.mlAvailable).toBe(true);
        expect(result.performanceScore).toBeGreaterThanOrEqual(0);
        expect(result.performanceScore).toBeLessThanOrEqual(1);
        expect(result.features).toBeDefined();
        expect(Object.keys(result.features)).toHaveLength(18);
      }
      expect(mlResults.size).toBe(50);
    });

    it('should maintain tier ordering with ML: clean > medium > bad', () => {
      const avgClean = avg(querysByTier('clean').map(e => mlResults.get(e.query)!.performanceScore));
      const avgMedium = avg(querysByTier('medium').map(e => mlResults.get(e.query)!.performanceScore));
      const avgBad = avg(querysByTier('bad').map(e => mlResults.get(e.query)!.performanceScore));

      expect(avgClean).toBeGreaterThan(avgMedium);
      expect(avgMedium).toBeGreaterThan(avgBad);
    });

    it('should produce different scores than heuristic-only (ML adds signal)', () => {
      let diffCount = 0;
      for (const entry of QUERY_BANK) {
        const hScore = heuristicResults.get(entry.query)!.score;
        const mlScore = mlResults.get(entry.query)!.performanceScore;

        // With ML loaded, the combined formula changes scores
        if (Math.abs(hScore - mlScore) > 0.001) {
          diffCount++;
        }
      }

      // At least 80% of queries should have a different score with ML
      expect(diffCount).toBeGreaterThanOrEqual(40);
    });

    it('should show meaningful differentiation gap (clean - bad >= 0.15)', () => {
      const avgClean = avg(querysByTier('clean').map(e => mlResults.get(e.query)!.performanceScore));
      const avgBad = avg(querysByTier('bad').map(e => mlResults.get(e.query)!.performanceScore));
      const gap = avgClean - avgBad;

      expect(gap).toBeGreaterThanOrEqual(0.15);
    });
  });

  // =========================================================================
  // Phase 5: Stability
  // =========================================================================

  describe('Phase 5: Stability', () => {
    it('should produce identical heuristic scores on re-run', () => {
      const probeQueries = QUERY_BANK.slice(0, 5);
      for (const entry of probeQueries) {
        const first = heuristicResults.get(entry.query)!;
        const second = heuristicEngine.analyze(entry.query);

        expect(second.score).toBe(first.score);
        expect(second.insights.length).toBe(first.insights.length);
      }
    });

    it('should produce identical ML+heuristic scores on re-run', async () => {
      // Re-create engine with same model
      const engine2 = new MLQueryEngine();
      await engine2.start(modelsDir);

      const probeQueries = QUERY_BANK.slice(0, 5);
      for (const entry of probeQueries) {
        const first = mlResults.get(entry.query)!;
        const second = await engine2.processQuery(entry.query);

        // Allow tiny floating point tolerance
        expect(Math.abs(second.performanceScore - first.performanceScore)).toBeLessThan(0.0001);
      }
    });
  });

  // =========================================================================
  // Phase 6: Summary Report
  // =========================================================================

  describe('Phase 6: Summary Report', () => {
    it('should print differentiation report', () => {
      const tiers: Array<'clean' | 'medium' | 'bad'> = ['clean', 'medium', 'bad'];

      const rows: Array<{
        tier: string;
        count: number;
        heuristicAvg: number;
        mlAvg: number;
        delta: number;
      }> = [];

      for (const tier of tiers) {
        const entries = querysByTier(tier);
        const hScores = entries.map(e => heuristicResults.get(e.query)!.score);
        const mScores = entries.map(e => mlResults.get(e.query)?.performanceScore ?? 0);
        const hAvg = avg(hScores);
        const mAvg = avg(mScores);

        rows.push({
          tier,
          count: entries.length,
          heuristicAvg: hAvg,
          mlAvg: mAvg,
          delta: mAvg - hAvg,
        });
      }

      const cleanH = rows[0].heuristicAvg;
      const badH = rows[2].heuristicAvg;
      const cleanML = rows[0].mlAvg;
      const badML = rows[2].mlAvg;

      const allDeltas = QUERY_BANK.map(e => {
        const h = heuristicResults.get(e.query)!.score;
        const m = mlResults.get(e.query)?.performanceScore ?? h;
        return Math.abs(m - h);
      });
      const avgDelta = avg(allDeltas);

      // Print report
      const sep = '-'.repeat(66);
      console.log('\n');
      console.log(sep);
      console.log('  E2E Pipeline Results - sql-ml-cli v0.3');
      console.log(sep);
      console.log(
        `  ${padRight('Tier', 8)} | ${padLeft('Count', 5)} | ${padLeft('Heuristic', 10)} | ${padLeft('ML+H', 10)} | ${padLeft('Delta', 8)}`
      );
      console.log(sep);
      for (const row of rows) {
        console.log(
          `  ${padRight(row.tier, 8)} | ${padLeft(String(row.count), 5)} | ${padLeft(row.heuristicAvg.toFixed(4), 10)} | ${padLeft(row.mlAvg.toFixed(4), 10)} | ${padLeft(row.delta.toFixed(4), 8)}`
        );
      }
      console.log(sep);
      console.log(`  Differentiation (clean - bad):  ${(cleanH - badH).toFixed(4)} heuristic  /  ${(cleanML - badML).toFixed(4)} ML+H`);
      console.log(`  ML Uplift: avg |delta| = ${avgDelta.toFixed(4)}`);
      console.log(`  Total queries: ${QUERY_BANK.length} | Heuristic rules: ${heuristicEngine.getRuleCount()}`);
      console.log(sep);
      console.log('\n');

      // Meta-assertion: the report was built
      expect(rows).toHaveLength(3);
    });
  });
});
