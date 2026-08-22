import type { Range } from "./junction-defs";

export type Term =
  | { tag: "sort"; name: "Prop" | "Type"; range?: Range }
  | { tag: "free"; name: string; range?: Range }
  | { tag: "bind"; idx: number; range?: Range }
  | { tag: "lam"; type: Term; body: Term; range?: Range }
  | { tag: "pi"; type: Term; body: Term; range?: Range }
  | { tag: "app"; fun: Term; arg: Term; range?: Range }
  | { tag: "letin"; type?: Term; def: Term; body: Term; range?: Range }

export const sort = (name: "Prop" | "Type", range?: Range): Term => ({ tag: "sort", name, range });
export const free = (name: string, range?: Range): Term => ({ tag: "free", name, range });
export const bind = (idx: number, range?: Range): Term => ({ tag: "bind", idx, range });
export const lam = (type: Term, body: Term, range?: Range): Term => ({ tag: "lam", type, body, range });
export const pi = (type: Term, body: Term, range?: Range): Term => ({ tag: "pi", type, body, range });
export const app = (fun: Term, arg: Term, range?: Range): Term => ({ tag: "app", fun, arg, range });
export const letin = (type: Term | undefined, def: Term, body: Term, range?: Range): Term =>
  ({ tag: "letin", type, def, body, range });

export type GlobalElement =
  | { tag: "Var"; name: string; type: Term }
  | { tag: "Def"; name: string; type?: Term; def: Term };

export type GlobalContext = GlobalElement[];

export const globalVar = (name: string, type: Term): GlobalElement => ({ tag: "Var", name, type });
export const globalDef = (name: string, def: Term, type?: Term): GlobalElement => ({ tag: "Def", name, type, def });

export type LocalElement =
  | { tag: "Var"; type: Term }
  | { tag: "Def"; type: Term; def: Term };

export type LocalContext = LocalElement[];

export const localElem = (type: Term, def?: Term): LocalElement =>
  def ? { tag: "Def", type, def } : { tag: "Var", type };

export type JudgContext = { global: GlobalContext; local: LocalContext };

export const judgCtx = (global: GlobalContext, local: LocalContext): JudgContext => ({ global: [...global], local: [...local] });

export function pushLocal(jc: JudgContext, type: Term, def?: Term): JudgContext {
  return judgCtx(jc.global, [localElem(type, def), ...jc.local]);
}

export type Judgment =
  | { tag: "Reduction"; context: JudgContext; from: Term; to: Term }
  | { tag: "Conversion"; context: JudgContext; eqLeft: Term; eqRight: Term }
  | { tag: "Synthesis"; context: JudgContext; fromTerm: Term; toType: Term }
  | { tag: "Check"; context: JudgContext; toTerm: Term; fromType: Term }
  | { tag: "WellFormed"; context: JudgContext };

export type Derivation = {
  rule: string;
  judgment: Judgment;
  children: Derivation[];
};