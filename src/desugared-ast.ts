import type { Range } from "./junction-defs";

export type Program = Decl[];

export type Decl =
  | { tag: "VarDecl"; name: string; nameRange: Range; typeTerm: Term, range: Range }
  | { tag: "DefDecl"; name: string; nameRange: Range; typeTerm: Term; body: Term, range: Range }
  | { tag: "EvalDecl"; term: Term, range: Range };

export type Term =
  | { tag: "LamTerm"; name: string; typeTerm: Term; body: Term, range: Range }
  | { tag: "PiTerm"; name: string; typeTerm: Term; body: Term, range: Range }
  | { tag: "LetTerm"; name: string; typeTerm: Term; value: Term; inTerm: Term, range: Range }
  | { tag: "AppTerm"; func: Term; arg: Term, range: Range }
  | Sort
  | Ident;

export type Sort = { tag: "Sort"; value: "Prop" | "Type", range: Range };
export type Ident = { tag: "Ident"; name: string; range: Range };