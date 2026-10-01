/** Extract one top-level field without allocating the rest of a large JSON body. */
export function readTopLevelJsonField(body: string, field: string, maxFieldChars = 256_000): unknown {
  let cursor = 0;
  const whitespace = () => { while (/\s/.test(body[cursor] ?? '') && cursor < body.length) cursor++; };
  const stringEnd = (start: number): number => {
    for (let i = start + 1; i < body.length; i++) {
      if (body[i] === '\\') { i++; continue; }
      if (body[i] === '"') return i + 1;
    }
    throw new SyntaxError('Unterminated JSON string');
  };
  const valueEnd = (start: number): number => {
    if (body[start] === '"') return stringEnd(start);
    if (body[start] === '{' || body[start] === '[') {
      const closing: string[] = [];
      for (let i = start; i < body.length; i++) {
        const char = body[i];
        if (char === '"') { i = stringEnd(i) - 1; continue; }
        if (char === '{') closing.push('}');
        else if (char === '[') closing.push(']');
        else if (char === '}' || char === ']') {
          if (closing.pop() !== char) throw new SyntaxError('Invalid JSON nesting');
          if (!closing.length) return i + 1;
        }
      }
      throw new SyntaxError('Unterminated JSON value');
    }
    let end = start;
    while (end < body.length && body[end] !== ',' && body[end] !== '}') end++;
    return end;
  };
  whitespace();
  if (body[cursor++] !== '{') throw new SyntaxError('Expected a JSON object');
  whitespace();
  if (body[cursor] === '}') return undefined;
  while (cursor < body.length) {
    if (body[cursor] !== '"') throw new SyntaxError('Expected a JSON key');
    const keyEnd = stringEnd(cursor);
    // Bound key allocation too; irrelevant long keys are never parsed.
    const matches = keyEnd - cursor <= field.length * 6 + 2 && JSON.parse(body.slice(cursor, keyEnd)) === field;
    cursor = keyEnd;
    whitespace();
    if (body[cursor++] !== ':') throw new SyntaxError('Expected a JSON colon');
    whitespace();
    const end = valueEnd(cursor);
    if (matches) {
      if (end - cursor > maxFieldChars) throw new RangeError('JSON field exceeds extraction limit');
      return JSON.parse(body.slice(cursor, end));
    }
    cursor = end;
    whitespace();
    if (body[cursor] === '}') return undefined;
    if (body[cursor++] !== ',') throw new SyntaxError('Expected a JSON separator');
    whitespace();
  }
  throw new SyntaxError('Unterminated JSON object');
}
