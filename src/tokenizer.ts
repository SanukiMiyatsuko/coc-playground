import { type Position, type Range, type Result, succ, err, isErr } from "./junction-defs";

export type TokenizerError =
  | { tag: "UnexpectedChar"; char: string; pos: Position }
  | { tag: "UnclosedComment"; pos: Position };

export type TokenType =
  | "BLANKS"
  | "COMMENT"
  | "RES_VAR"
  | "RES_DEF"
  | "RES_EVAL"
  | "RES_FUN"
  | "RES_FORALL"
  | "RES_LET"
  | "RES_IN"
  | "RES_PROP"
  | "RES_TYPE"
  | "ASSIGN"
  | "COLON"
  | "FATARROW"
  | "ARROW"
  | "COMMA"
  | "LPAREN"
  | "RPAREN"
  | "IDENT"
  | "EOF";

export type Token = {
  type: TokenType;
  value: string;
  range: Range;
};

type Pattern = { type: TokenType; re: RegExp };

const patterns: Pattern[] = [
  { type: "BLANKS", re: /\s+/y },
  { type: "COMMENT", re: /--[^\n]*(?:\n|$)/y },
  { type: "RES_DEF", re: /def(?![\w'])/y },
  { type: "RES_VAR", re: /var(?![\w'])/y },
  { type: "RES_EVAL", re: /eval(?![\w'])/y },
  { type: "RES_FUN", re: /fun(?![\w'])/y },
  { type: "RES_FORALL", re: /forall(?![\w'])/y },
  { type: "RES_LET", re: /let(?![\w'])/y },
  { type: "RES_IN", re: /in(?![\w'])/y },
  { type: "RES_PROP", re: /Prop(?![\w'])/y },
  { type: "RES_TYPE", re: /Type(?![\w'])/y },
  { type: "ASSIGN", re: /:=/y },
  { type: "COLON",  re: /:/y },
  { type: "FATARROW",  re: /=>/y },
  { type: "ARROW",  re: /->/y },
  { type: "COMMA",  re: /,/y },
  { type: "LPAREN", re: /\(/y },
  { type: "RPAREN", re: /\)/y },
  { type: "IDENT", re: /[A-Za-z_][\w']*/y },
];

export class Tokenizer {
  private src: string;
  private pos = 0;
  private line = 0;
  private char = 0;

  constructor(src: string) {
    this.src = src.replace(/\r\n|\r/g, "\n");
  }

  private eof(): boolean {
    return this.pos >= this.src.length;
  }

  private advance(text: string) {
    for (const ch of text) {
      if (ch === "\n") {
        this.line++;
        this.char = 0;
      } else {
        this.char++;
      }
    }
    this.pos += text.length;
  }

  private currentPosition(): Position {
    return { line: this.line, character: this.char };
  }

  private next(): Result<Token, TokenizerError> {
    while (!this.eof()) {
      if (this.src.startsWith("{-", this.pos)) {
        const close_index = this.src.indexOf("-}", this.pos + 2);
        if (close_index === -1) {
          return err({
            tag: "UnclosedComment",
            pos: this.currentPosition(),
          });
        }
        const value = this.src.slice(this.pos, close_index + 2);
        this.advance(value);
        continue;
      }
      const start = this.currentPosition();
      let skippedTrivia = false;
      for (const { type, re } of patterns) {
        re.lastIndex = this.pos;
        const m = re.exec(this.src);
        if (!m) continue;
        const value = m[0];
        this.advance(value);
        if (type === "BLANKS" || type === "COMMENT") {
          skippedTrivia = true;
          break;
        }
        const end = this.currentPosition();
        return succ({
          type,
          value,
          range: { start, end },
        });
      }
      if (skippedTrivia) {
        continue;
      }
      return err({
        tag: "UnexpectedChar",
        char: this.src[this.pos]!,
        pos: this.currentPosition(),
      });
    }
    const p = this.currentPosition();
    return succ({
      type: "EOF",
      value: "",
      range: { start: p, end: p },
    });
  }

  static mkTokens(src: string): Result<Token[], TokenizerError> {
    const lexer = new Tokenizer(src);
    const tokens: Token[] = [];
    while (true) {
      const res = lexer.next();
      if (isErr(res))
        return res;
      tokens.push(res.succ);
      if (res.succ.type === "EOF") break;
    }
    return succ(tokens);
  }
}