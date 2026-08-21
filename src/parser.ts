import { type Position, type Result, succ, err, isErr } from "./junction-defs";
import { type Token, type TokenType } from "./tokenizer";
import * as AST from "./surface-ast";

export type ParserError =
  | { tag: "UnexpectedToken"; expected: string; got: Token; pos: Position }
  | { tag: "Message"; msg: string; pos: Position };

const ATOMIC_START: TokenType[] = ["RES_PROP", "RES_TYPE", "IDENT", "LPAREN"];

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

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkAny(types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  private expect(type: TokenType, expected: string): Result<Token, ParserError> {
    const t = this.peek();
    if (t.type === type)
      return succ(this.advance());
    return err({ tag: "UnexpectedToken", expected, got: t, pos: t.range.start });
  }

  parseProgram(): Result<AST.Program, ParserError> {
    const decls: AST.Decl[] = [];
    while (!this.check("EOF")) {
      const d = this.parseDecl();
      if (isErr(d)) return d;
      decls.push(d.succ);
    }
    return succ(decls);
  }

  private parseDecl(): Result<AST.Decl, ParserError> {
    const t = this.peek();
    switch (t.type) {
      case "RES_VAR": {
        this.advance();
        const name = this.expect("IDENT", "identifier");
        if (isErr(name)) return name;
        const binders = this.parseOptBinderList();
        if (isErr(binders)) return binders;
        const colon = this.expect("COLON", "':'");
        if (isErr(colon)) return colon;
        const typeTerm = this.parseTerm();
        if (isErr(typeTerm)) return typeTerm;
        return succ({
          tag: "VarDecl",
          name: name.succ.value,
          nameRange: name.succ.range,
          binders: binders.succ,
          typeTerm: typeTerm.succ,
        });
      }
      case "RES_DEF": {
        this.advance();
        const name = this.expect("IDENT", "identifier");
        if (isErr(name)) return name;
        const binders = this.parseOptBinderList();
        if (isErr(binders)) return binders;
        const colon = this.expect("COLON", "':'");
        if (isErr(colon)) return colon;
        const typeTerm = this.parseTerm();
        if (isErr(typeTerm)) return typeTerm;
        const assign = this.expect("ASSIGN", "':='");
        if (isErr(assign)) return assign;
        const body = this.parseTerm();
        if (isErr(body)) return body;
        return succ({
          tag: "DefDecl",
          name: name.succ.value,
          nameRange: name.succ.range,
          binders: binders.succ,
          typeTerm: typeTerm.succ,
          body: body.succ,
        });
      }
      case "RES_EVAL": {
        this.advance();
        const term = this.parseTerm();
        if (isErr(term)) return term;
        return succ({ tag: "EvalDecl", term: term.succ });
      }
      default:
        return err({
          tag: "UnexpectedToken",
          expected: "'var', 'def' or 'eval'",
          got: t,
          pos: t.range.start,
        });
    }
  }

  private parseTerm(): Result<AST.Term, ParserError> {
    switch (this.peek().type) {
      case "RES_FUN":
        return this.parseLamTerm();
      case "RES_FORALL":
        return this.parsePiTerm();
      case "RES_LET":
        return this.parseLetTerm();
      default:
        return this.parseArrowTerm();
    }
  }

  private parseLamTerm(): Result<AST.Term, ParserError> {
    const fun = this.expect("RES_FUN", "'fun'");
    if (isErr(fun)) return fun;
    const binders = this.parseBinderOrBinderList();
    if (isErr(binders)) return binders;
    const fatarrow = this.expect("FATARROW", "'=>'");
    if (isErr(fatarrow)) return fatarrow;
    const body = this.parseTerm();
    if (isErr(body)) return body;
    return succ({ tag: "LamTerm", binders: binders.succ, body: body.succ });
  }

  private parsePiTerm(): Result<AST.Term, ParserError> {
    const forall = this.expect("RES_FORALL", "'forall'");
    if (isErr(forall)) return forall;
    const binders = this.parseBinderOrBinderList();
    if (isErr(binders)) return binders;
    const comma = this.expect("COMMA", "','");
    if (isErr(comma)) return comma;
    const body = this.parseTerm();
    if (isErr(body)) return body;
    return succ({ tag: "PiTerm", binders: binders.succ, body: body.succ });
  }

  private parseLetTerm(): Result<AST.Term, ParserError> {
    const letTok = this.expect("RES_LET", "'let'");
    if (isErr(letTok)) return letTok;
    const name = this.expect("IDENT", "identifier");
    if (isErr(name)) return name;
    const binders = this.parseOptBinderList();
    if (isErr(binders)) return binders;
    const colon = this.expect("COLON", "':'");
    if (isErr(colon)) return colon;
    const typeTerm = this.parseTerm();
    if (isErr(typeTerm)) return typeTerm;
    const assign = this.expect("ASSIGN", "':='");
    if (isErr(assign)) return assign;
    const value = this.parseTerm();
    if (isErr(value)) return value;
    const inTok = this.expect("RES_IN", "'in'");
    if (isErr(inTok)) return inTok;
    const inTerm = this.parseTerm();
    if (isErr(inTerm)) return inTerm;
    return succ({
      tag: "LetTerm",
      name: name.succ.value,
      binders: binders.succ,
      typeTerm: typeTerm.succ,
      value: value.succ,
      inTerm: inTerm.succ,
    });
  }

  private parseArrowTerm(): Result<AST.Term, ParserError> {
    const fst = this.parseAppTerm();
    if (isErr(fst)) return fst;
    const other: AST.Term[] = [];
    while (this.check("ARROW")) {
      this.advance();
      const next = this.parseAppTerm();
      if (isErr(next)) return next;
      other.push(next.succ);
    }
    if (other.length === 0) return succ(fst.succ);
    return succ({ tag: "ArrowTerm", fst: fst.succ, other });
  }

  private parseAppTerm(): Result<AST.Term, ParserError> {
    const fst = this.parseAtomicTerm();
    if (isErr(fst)) return fst;
    const other: AST.Term[] = [];
    while (this.checkAny(ATOMIC_START)) {
      const next = this.parseAtomicTerm();
      if (isErr(next)) return next;
      other.push(next.succ);
    }
    if (other.length === 0) return succ(fst.succ);
    return succ({ tag: "AppTerm", fst: fst.succ, other });
  }

  private parseAtomicTerm(): Result<AST.Term, ParserError> {
    const t = this.peek();
    switch (t.type) {
      case "RES_PROP":
        this.advance();
        return succ({ tag: "Sort", value: "Prop" });
      case "RES_TYPE":
        this.advance();
        return succ({ tag: "Sort", value: "Type" });
      case "IDENT":
        this.advance();
        return succ({ tag: "Ident", name: t.value, range: t.range });
      case "LPAREN": {
        this.advance();
        const inner = this.parseTerm();
        if (isErr(inner)) return inner;
        const rparen = this.expect("RPAREN", "')'");
        if (isErr(rparen)) return rparen;
        return succ(inner.succ);
      }
      default:
        return err({ tag: "UnexpectedToken", expected: "term", got: t, pos: t.range.start });
    }
  }

  private parseBinderOrBinderList(): Result<AST.Binder[], ParserError> {
    if (this.check("LPAREN"))
      return this.parseBinderList();
    const b = this.parseBinder();
    if (isErr(b)) return b;
    return succ([b.succ]);
  }

  private parseOptBinderList(): Result<AST.Binder[], ParserError> {
    if (this.check("LPAREN"))
      return this.parseBinderList();
    return succ([]);
  }

  private parseBinderList(): Result<AST.Binder[], ParserError> {
    const binders: AST.Binder[] = [];
    do {
      const lparen = this.expect("LPAREN", "'('");
      if (isErr(lparen)) return lparen;
      const b = this.parseBinder();
      if (isErr(b)) return b;
      binders.push(b.succ);
      const rparen = this.expect("RPAREN", "')'");
      if (isErr(rparen)) return rparen;
    } while (this.check("LPAREN"));
    return succ(binders);
  }

  private parseBinder(): Result<AST.Binder, ParserError> {
    const first = this.expect("IDENT", "identifier");
    if (isErr(first)) return first;
    const names: string[] = [first.succ.value];
    while (this.check("IDENT"))
      names.push(this.advance().value);
    const colon = this.expect("COLON", "':'");
    if (isErr(colon)) return colon;
    const typeTerm = this.parseTerm();
    if (isErr(typeTerm)) return typeTerm;
    return succ({ names, typeTerm: typeTerm.succ });
  }

  static parseProgram(tokens: Token[]): Result<AST.Program, ParserError> {
    return new Parser(tokens).parseProgram();
  }
}