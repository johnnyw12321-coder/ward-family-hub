/**
 * A small, safe arithmetic evaluator for amount boxes and the calculator:
 * numbers, + − × ÷ (also * / x), parentheses, unary minus, and thousands
 * commas ("1,200 + 350"). No eval, no names, no functions. Returns null for
 * anything else, or a result that isn't a finite number (e.g. ÷ 0).
 */
type Token = { type: "num"; value: number } | { type: "op"; value: string };

function tokenize(input: string): Token[] | null {
  const s = input.replace(/[×xX]/g, "*").replace(/[÷]/g, "/").replace(/[−–]/g, "-").replace(/\s+/g, "");
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if ("+-*/()".includes(c)) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    const m = s.slice(i).match(/^(\d{1,3}(,\d{3})+|\d*)(\.\d*)?/);
    if (!m || !m[0] || m[0] === ".") return null;
    tokens.push({ type: "num", value: Number(m[0].replace(/,/g, "")) });
    i += m[0].length;
  }
  return tokens;
}

export function evaluate(input: string): number | null {
  const parsed = tokenize(input);
  if (!parsed || !parsed.length) return null;
  const tokens: Token[] = parsed;
  let pos = 0;
  const peek = () => tokens[pos];
  const op = (v: string) => peek()?.type === "op" && peek().value === v;

  // expr := term (('+'|'-') term)*; term := factor (('*'|'/') factor)*; factor := '-' factor | num | '(' expr ')'
  function expr(): number | null {
    let left = term();
    while (left !== null && (op("+") || op("-"))) {
      const o = tokens[pos++].value;
      const right = term();
      if (right === null) return null;
      left = o === "+" ? left + right : left - right;
    }
    return left;
  }
  function term(): number | null {
    let left = factor();
    while (left !== null && (op("*") || op("/"))) {
      const o = tokens[pos++].value;
      const right = factor();
      if (right === null) return null;
      left = o === "*" ? left * right : left / right;
    }
    return left;
  }
  function factor(): number | null {
    const t = peek();
    if (!t) return null;
    if (op("-")) {
      pos++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (op("(")) {
      pos++;
      const v = expr();
      if (!op(")")) return null;
      pos++;
      return v;
    }
    if (t.type === "num") {
      pos++;
      return t.value;
    }
    return null;
  }

  const result = expr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) return null;
  return result;
}

/** True when the text is a sum to work out, not just a number (a leading minus alone doesn't count). */
export function isExpression(input: string): boolean {
  return /\d\s*[+\-*/×x÷−–]\s*[\d(.]|[()]/.test(input.trim());
}

/** A result rounded to cents and written without trailing zeros: 12.5, 360, 0.33. */
export function formatResult(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return String(rounded);
}
