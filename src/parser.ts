import { type Position, type Result, succ, err, isErr } from "./junction-defs";
import { type Token, type TokenType } from "./tokenizer";
import * as AST from "./surface-ast";

export type ParserError =
| { tag: "UnexpectedToken"; expected: string; got: Token; pos: Position }
| { tag: "Message"; msg: string; pos: Position };

export class Parser {
  private tokens: Token[] = [];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const t = this.peek();
    if (t.type !== "EOF")
      this.pos++;
    return t;
  }

  private expect(type: TokenType, expected: string): Result<Token, ParserError> {
    const t = this.peek();
    if (t.type === type)
      return succ(this.advance());
    return err({ tag: "UnexpectedToken", expected, got: t, pos: t.range.start });
  }
}