import { describe, it, expect } from 'vitest';
import { tokenizeQuery, getTokenForWord, isKeywordToken, isIdentifierToken, VOCAB_SIZE, SEQ_LEN } from './tokenizer.js';

describe('tokenizer', () => {
  describe('constants', () => {
    it('should export VOCAB_SIZE as 100', () => {
      expect(VOCAB_SIZE).toBe(100);
    });

    it('should export SEQ_LEN as 20', () => {
      expect(SEQ_LEN).toBe(20);
    });
  });

  describe('tokenizeQuery', () => {
    it('should return array of length SEQ_LEN', () => {
      const tokens = tokenizeQuery('SELECT * FROM users');
      expect(tokens).toHaveLength(SEQ_LEN);
    });

    it('should pad short queries with zeros', () => {
      const tokens = tokenizeQuery('SELECT');
      expect(tokens[0]).toBeGreaterThan(0);
      // Rest should be padding (0)
      for (let i = 1; i < SEQ_LEN; i++) {
        expect(tokens[i]).toBe(0);
      }
    });

    it('should truncate long queries to SEQ_LEN tokens', () => {
      const longQuery = Array(50).fill('SELECT').join(' ');
      const tokens = tokenizeQuery(longQuery);
      expect(tokens).toHaveLength(SEQ_LEN);
    });

    it('should assign fixed token to SELECT keyword', () => {
      const tokens = tokenizeQuery('SELECT');
      expect(tokens[0]).toBe(2); // SELECT = 2
    });

    it('should assign fixed token to FROM keyword', () => {
      const tokens = tokenizeQuery('FROM');
      expect(tokens[0]).toBe(3); // FROM = 3
    });

    it('should assign fixed token to WHERE keyword', () => {
      const tokens = tokenizeQuery('WHERE');
      expect(tokens[0]).toBe(4); // WHERE = 4
    });

    it('should assign fixed token to JOIN keyword', () => {
      const tokens = tokenizeQuery('JOIN');
      expect(tokens[0]).toBe(5); // JOIN = 5
    });

    it('should tokenize a simple SELECT FROM WHERE query', () => {
      const tokens = tokenizeQuery('SELECT name FROM users WHERE id = 1');
      expect(tokens[0]).toBe(2); // SELECT
      // tokens[1] = 'name' -> identifier hash
      expect(tokens[2]).toBe(3); // FROM
      // tokens[3] = 'users' -> identifier hash
      expect(tokens[4]).toBe(4); // WHERE
    });

    it('should be case-insensitive', () => {
      const upper = tokenizeQuery('SELECT FROM WHERE');
      const lower = tokenizeQuery('select from where');
      const mixed = tokenizeQuery('Select From Where');

      expect(upper).toEqual(lower);
      expect(upper).toEqual(mixed);
    });

    it('should assign identifiers to range 61-100', () => {
      const tokens = tokenizeQuery('SELECT mycolumn FROM mytable');
      // tokens[1] = 'mycolumn' -> identifier
      expect(tokens[1]).toBeGreaterThanOrEqual(61);
      expect(tokens[1]).toBeLessThanOrEqual(100);
      // tokens[3] = 'mytable' -> identifier
      expect(tokens[3]).toBeGreaterThanOrEqual(61);
      expect(tokens[3]).toBeLessThanOrEqual(100);
    });

    it('should produce deterministic output for same input', () => {
      const tokens1 = tokenizeQuery('SELECT * FROM users WHERE id = 1');
      const tokens2 = tokenizeQuery('SELECT * FROM users WHERE id = 1');
      expect(tokens1).toEqual(tokens2);
    });

    it('should handle empty string', () => {
      const tokens = tokenizeQuery('');
      expect(tokens).toHaveLength(SEQ_LEN);
      expect(tokens.every(t => t === 0)).toBe(true);
    });

    it('should assign all tokens within valid range [0, VOCAB_SIZE]', () => {
      const tokens = tokenizeQuery('SELECT a, b, c FROM t1 JOIN t2 ON t1.id = t2.id WHERE x > 1 ORDER BY a LIMIT 10');
      for (const t of tokens) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(VOCAB_SIZE);
      }
    });

    it('should tokenize all major SQL keywords', () => {
      const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE'];
      for (const kw of keywords) {
        const tokens = tokenizeQuery(kw);
        expect(isKeywordToken(tokens[0])).toBe(true);
      }
    });
  });

  describe('getTokenForWord', () => {
    it('should return fixed token for SQL keywords', () => {
      expect(getTokenForWord('SELECT')).toBe(2);
      expect(getTokenForWord('FROM')).toBe(3);
      expect(getTokenForWord('WHERE')).toBe(4);
    });

    it('should be case-insensitive', () => {
      expect(getTokenForWord('select')).toBe(2);
      expect(getTokenForWord('Select')).toBe(2);
    });

    it('should return identifier range for non-keywords', () => {
      const token = getTokenForWord('users');
      expect(token).toBeGreaterThanOrEqual(61);
      expect(token).toBeLessThanOrEqual(100);
    });

    it('should be deterministic', () => {
      expect(getTokenForWord('myTable')).toBe(getTokenForWord('myTable'));
    });
  });

  describe('isKeywordToken', () => {
    it('should return true for tokens in range 2-60', () => {
      expect(isKeywordToken(2)).toBe(true);
      expect(isKeywordToken(30)).toBe(true);
      expect(isKeywordToken(60)).toBe(true);
    });

    it('should return false for PAD and UNK tokens', () => {
      expect(isKeywordToken(0)).toBe(false);
      expect(isKeywordToken(1)).toBe(false);
    });

    it('should return false for identifier tokens', () => {
      expect(isKeywordToken(61)).toBe(false);
      expect(isKeywordToken(100)).toBe(false);
    });
  });

  describe('isIdentifierToken', () => {
    it('should return true for tokens in range 61-100', () => {
      expect(isIdentifierToken(61)).toBe(true);
      expect(isIdentifierToken(80)).toBe(true);
      expect(isIdentifierToken(100)).toBe(true);
    });

    it('should return false for keyword tokens', () => {
      expect(isIdentifierToken(2)).toBe(false);
      expect(isIdentifierToken(60)).toBe(false);
    });

    it('should return false for PAD and UNK', () => {
      expect(isIdentifierToken(0)).toBe(false);
      expect(isIdentifierToken(1)).toBe(false);
    });
  });
});
