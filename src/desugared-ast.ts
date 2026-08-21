import type { Range } from "./junction-defs";

export type Program = Decl[];

export type Decl =
  | { tag: "VarDecl"; name: string; nameRange: Range; typeTerm: Term }
  | { tag: "DefDecl"; name: string; nameRange: Range; typeTerm: Term; body: Term }
  | { tag: "EvalDecl"; term: Term };

export type Term =
  | { tag: "LamTerm"; name: string; typeTerm: Term; body: Term }
  | { tag: "PiTerm"; name: string; typeTerm: Term; body: Term }
  | { tag: "LetTerm"; name: string; typeTerm: Term; value: Term; inTerm: Term }
  | { tag: "AppTerm"; func: Term; arg: Term }
  | Sort
  | Ident;

export type Sort = { tag: "Sort"; value: "Prop" | "Type" };
export type Ident = { tag: "Ident"; name: string; range: Range };