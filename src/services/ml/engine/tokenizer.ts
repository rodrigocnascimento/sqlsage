/**
 * SQL Tokenizer com vocabulario explicito para keywords SQL.
 * Keywords recebem tokens fixos (sem colisao).
 * Identificadores usam hash no range 61-100.
 *
 * Token map:
 *   0 = PAD
 *   1 = UNK
 *   2-60 = SQL keywords (fixos)
 *   61-100 = identificadores (hash)
 */

const SQL_KEYWORDS: Record<string, number> = {
  'SELECT': 2,
  'FROM': 3,
  'WHERE': 4,
  'JOIN': 5,
  'LEFT': 6,
  'RIGHT': 7,
  'INNER': 8,
  'OUTER': 9,
  'ON': 10,
  'AND': 11,
  'OR': 12,
  'IN': 13,
  'NOT': 14,
  'NULL': 15,
  'IS': 16,
  'LIKE': 17,
  'BETWEEN': 18,
  'EXISTS': 19,
  'GROUP': 20,
  'BY': 21,
  'ORDER': 22,
  'HAVING': 23,
  'LIMIT': 24,
  'OFFSET': 25,
  'UNION': 26,
  'INSERT': 27,
  'UPDATE': 28,
  'DELETE': 29,
  'CREATE': 30,
  'ALTER': 31,
  'DROP': 32,
  'INDEX': 33,
  'TABLE': 34,
  'AS': 35,
  'DISTINCT': 36,
  'COUNT': 37,
  'SUM': 38,
  'AVG': 39,
  'MAX': 40,
  'MIN': 41,
  'CASE': 42,
  'WHEN': 43,
  'THEN': 44,
  'ELSE': 45,
  'END': 46,
  'ASC': 47,
  'DESC': 48,
  'SET': 49,
  'VALUES': 50,
  'INTO': 51,
  'CROSS': 52,
  'FULL': 53,
  'ALL': 54,
  'ANY': 55,
  'SOME': 56,
  'INTERVAL': 57,
  'PRIMARY': 58,
  'KEY': 59,
  'FOREIGN': 60,
};

const PAD_TOKEN = 0;
const UNK_TOKEN = 1;
const IDENT_RANGE_START = 61;
const IDENT_RANGE_END = 100;
const IDENT_RANGE_SIZE = IDENT_RANGE_END - IDENT_RANGE_START + 1;

export const VOCAB_SIZE = 100;
export const SEQ_LEN = 20;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Tokeniza uma query SQL em uma sequencia de inteiros de tamanho fixo.
 * Keywords SQL recebem tokens determinísticos (2-60).
 * Identificadores recebem hash no range 61-100.
 * Resultado e padded/truncado para SEQ_LEN.
 */
export function tokenizeQuery(query: string): number[] {
  const words = query.toUpperCase().match(/\b\w+\b/g) || [];
  const tokens: number[] = [];

  for (const word of words.slice(0, SEQ_LEN)) {
    const keywordToken = SQL_KEYWORDS[word];
    if (keywordToken !== undefined) {
      tokens.push(keywordToken);
    } else {
      const hash = simpleHash(word);
      tokens.push(IDENT_RANGE_START + (hash % IDENT_RANGE_SIZE));
    }
  }

  while (tokens.length < SEQ_LEN) {
    tokens.push(PAD_TOKEN);
  }

  return tokens;
}

/**
 * Retorna o token para uma palavra especifica (util para testes).
 */
export function getTokenForWord(word: string): number {
  const upper = word.toUpperCase();
  const keywordToken = SQL_KEYWORDS[upper];
  if (keywordToken !== undefined) {
    return keywordToken;
  }
  const hash = simpleHash(upper);
  return IDENT_RANGE_START + (hash % IDENT_RANGE_SIZE);
}

/**
 * Verifica se um token corresponde a uma keyword SQL fixa.
 */
export function isKeywordToken(token: number): boolean {
  return token >= 2 && token <= 60;
}

/**
 * Verifica se um token corresponde a um identificador (hash).
 */
export function isIdentifierToken(token: number): boolean {
  return token >= IDENT_RANGE_START && token <= IDENT_RANGE_END;
}
