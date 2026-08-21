import type { Range } from "./junction-defs";

export type Program = Decl[];

export type Decl =
  | { tag: "VarDecl"; name: string; nameRange: Range; binders: Binder[]; typeTerm: Term }
  | { tag: "DefDecl"; name: string; nameRange: Range; binders: Binder[]; typeTerm: Term; body: Term }
  | { tag: "EvalDecl"; term: Term };

export type Term =
  | { tag: "LamTerm"; binders: Binder[]; body: Term }
  | { tag: "PiTerm"; binders: Binder[]; body: Term }
  | { tag: "LetTerm"; name: string; binders: Binder[]; typeTerm: Term; value: Term; inTerm: Term }
  | { tag: "ArrowTerm"; fst: Term; other: Term[] }
  | { tag: "AppTerm"; fst: Term; other: Term[] }
  | Sort
  | Ident;

export type Sort = { tag: "Sort"; value: "Prop" | "Type" };
export type Ident = { tag: "Ident"; name: string; range: Range };

export type Binder = {
  names: string[];
  typeTerm: Term;
};