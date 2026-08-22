import type { Range } from "./junction-defs";

export type Program = Decl[];

export type Decl =
  | { tag: "VarDecl"; name: string; nameRange: Range; binders: Binder[]; typeTerm: Term; range: Range }
  | { tag: "DefDecl"; name: string; nameRange: Range; binders: Binder[]; typeTerm?: Term; body: Term; range: Range }
  | { tag: "EvalDecl"; term: Term; range: Range };

export type Term =
  | { tag: "LamTerm"; binders: Binder[]; body: Term; range: Range }
  | { tag: "PiTerm"; binders: Binder[]; body: Term; range: Range }
  | { tag: "LetTerm"; name: string; binders: Binder[]; typeTerm?: Term; value: Term; inTerm: Term; range: Range }
  | { tag: "ArrowTerm"; fst: Term; other: Term[]; range: Range }
  | { tag: "AppTerm"; fst: Term; other: Term[]; range: Range }
  | Sort
  | Ident;

export type Sort = { tag: "Sort"; value: "Prop" | "Type"; range: Range };
export type Ident = { tag: "Ident"; name: string; range: Range };

export type Binder = {
  names: string[];
  typeTerm: Term;
};