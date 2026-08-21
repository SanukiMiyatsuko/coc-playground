export type Term =
  | { tag: "sort"; name: "Prop" | "Type" }
  | { tag: "free"; name: string }
  | { tag: "bind"; idx: number }
  | { tag: "lam"; type: Term; body: Term }
  | { tag: "pi"; type: Term; body: Term }
  | { tag: "app"; fun: Term; arg: Term }
  | { tag: "letin"; type: Term; def: Term; body: Term }

export const sort = (name: "Prop" | "Type"): Term => ({ tag: "sort", name });
export const free = (name: string): Term => ({ tag: "free", name });
export const bind = (idx: number): Term => ({ tag: "bind", idx });
export const lam = (type: Term, body: Term): Term => ({ tag: "lam", type, body });
export const pi = (type: Term, body: Term): Term => ({ tag: "pi", type, body });
export const app = (fun: Term, arg: Term): Term => ({ tag: "app", fun, arg });
export const letin = (type: Term, def: Term, body: Term): Term => ({ tag: "letin", type, def, body });

export type GlobalElement =
  | { tag: "Var"; name: string; type: Term }
  | { tag: "Def"; name: string; type: Term; def: Term };

export type GlobalContext = GlobalElement[];

export const globalElem = (name: string, type: Term, def: Term | undefined): GlobalElement =>
  def ? { tag: "Def", name, type, def } : { tag: "Var", name, type };

export type LocalElement =
  | { tag: "Var"; name?: string; type: Term }
  | { tag: "Def"; name?: string; type: Term; def: Term };

export type LocalContext = LocalElement[];

export const localElem = (name: string | undefined, type: Term, def?: Term): LocalElement =>
  def ? { tag: "Def", name, type, def } : { tag: "Var", name, type };

export type JudgContext = { global: GlobalContext; local: LocalContext };

export const judgCtx = (global: GlobalContext, local: LocalContext): JudgContext => ({ global: [...global], local: [...local] });

export function pushLocal(jc: JudgContext, name: string | undefined, type: Term, def?: Term): JudgContext {
  return judgCtx(jc.global, [localElem(name, type, def), ...jc.local]);
}

export type Judgment =
  | { tag: "Reduction"; context: JudgContext; from: Term; to: Term }
  | { tag: "Conversion"; context: JudgContext; eqLeft: Term; eqRight: Term }
  | { tag: "Synthesis"; context: JudgContext; fromTerm: Term; toType: Term }
  | { tag: "WellFormed"; context: JudgContext };

export type Derivation = {
  rule: string;
  judgment: Judgment;
  children: Derivation[];
};