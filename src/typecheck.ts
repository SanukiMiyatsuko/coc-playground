import type { Range } from "./junction-defs";
import {
  type Term,
  type Judgment,
  type Derivation,
  type GlobalElement,
  type GlobalContext,
  type JudgContext,
  sort,
  pi,
  app,
  bind,
  judgCtx,
  pushLocal,
} from "./core-ast";
import {
  type Result,
  succ,
  err,
  isErr,
  isSucc,
  type Unit,
  unit,
} from "./junction-defs";
import { alphaEq, shift, subst } from "./core-defs";

export type NotConvertible = { tag: "NotConvertible"; eqLeft: Term; eqRight: Term; range?: Range };

export type TypeError =
  | { tag: "TypeHasNoType"; range?: Range }
  | { tag: "ExpectedSort"; actual: Term; range?: Range }
  | { tag: "ExpectedPi"; fun: Term; actual: Term; range?: Range }
  | { tag: "TypeMismatch"; actual: Term; expected: Term; range?: Range; cause: NotConvertible };

type WFError = { error: TypeError; at: GlobalElement; range?: Range };

type WithDerivation<A> = { value: A; derivation: Derivation };

type TCResult<A, B> = Result<WithDerivation<A>, B>;

function notConvertible(t0: Term, t1: Term): NotConvertible {
  return { tag: "NotConvertible", eqLeft: t0, eqRight: t1, range: t0.range ?? t1.range };
}

function expectedSort(actual: Term, range?: Range): TypeError {
  return { tag: "ExpectedSort", actual, range };
}

const mkDer = (rule: string, judgment: Judgment, children: Derivation[]): Derivation =>
  ({ rule, judgment, children });

const redJ = (jc: JudgContext, from: Term, to: Term): Judgment =>
  ({ tag: "Reduction", context: jc, from, to });
const cnvJ = (jc: JudgContext, eqLeft: Term, eqRight: Term): Judgment =>
  ({ tag: "Conversion", context: jc, eqLeft, eqRight });
const synJ = (jc: JudgContext, fromTerm: Term, toType: Term): Judgment =>
  ({ tag: "Synthesis", context: jc, fromTerm, toType });
const chkJ = (jc: JudgContext, toTerm: Term, fromType: Term): Judgment =>
  ({ tag: "Check", context: jc, toTerm, fromType });
const wfJ = (jc: JudgContext): Judgment =>
  ({ tag: "WellFormed", context: jc });

function whnfOf(jc: JudgContext, t: Term): { nf: Term; ders: Derivation[] } {
  const r = whNF(jc, t);
  return isSucc(r) ? { nf: r.succ.value, ders: [r.succ.derivation] } : { nf: r.err, ders: [] };
}

function stepThen(jc: JudgContext, from: Term, to: Term, step: Derivation): TCResult<Term, Term> {
  const next = whNF(jc, to);
  if (isErr(next)) return succ({ value: to, derivation: step });
  return succ({
    value: next.succ.value,
    derivation: mkDer("transitivity", redJ(jc, from, next.succ.value), [step, next.succ.derivation]),
  });
}

export function whNF(jc: JudgContext, t: Term): TCResult<Term, Term> {
  switch (t.tag) {
    case "free": {
      const ge = jc.global.find((e) => e.name === t.name);
      if (ge && ge.tag === "Def")
        return stepThen(jc, t, ge.def, mkDer("delta_global", redJ(jc, t, ge.def), []));
      break;
    }
    case "bind": {
      const le = jc.local[t.idx];
      if (le && le.tag === "Def") {
        const res = shift(le.def, t.idx + 1, 0);
        return stepThen(jc, t, res, mkDer("delta_local", redJ(jc, t, res), []));
      }
      break;
    }
    case "letin": {
      const res = subst(t.body, 0, t.def);
      return stepThen(jc, t, res, mkDer("zeta", redJ(jc, t, res), []));
    }
    case "app": {
      const { nf: funTerm, ders: funDers } = whnfOf(jc, t.fun);
      const reduced = app(funTerm, t.arg);
      const der = mkDer("cong_app", redJ(jc, t, reduced), funDers);
      if (funTerm.tag === "lam") {
        const res = subst(funTerm.body, 0, t.arg);
        const beta = mkDer("beta", redJ(jc, reduced, res), []);
        const transDer = mkDer("transitivity", redJ(jc, t, res), [der, beta]);
        return stepThen(jc, t, res, transDer);
      }
      return succ({ value: reduced, derivation: der });
    }
  }
  return err(t);
}

function convWhNF(jc: JudgContext, t0: Term, t1: Term): TCResult<Unit, NotConvertible> {
  const { nf: w0, ders: d0 } = whnfOf(jc, t0);
  const { nf: w1, ders: d1 } = whnfOf(jc, t1);
  const wder = [...d0, ...d1];

  if (alphaEq(w0, w1)) {
    const refl = mkDer("conv_refl", cnvJ(jc, w0, w1), []);
    return succ({ value: unit, derivation: mkDer("conv_whnf", cnvJ(jc, t0, t1), [...wder, refl]) });
  }

  switch (w0.tag) {
    case "lam": {
      if (w1.tag === "lam") {
        const typeResult = conv(jc, w0.type, w1.type);
        if (isErr(typeResult)) return typeResult;
        const bodyResult = conv(pushLocal(jc, w0.type), w0.body, w1.body);
        if (isErr(bodyResult)) return bodyResult;
        return succ({
          value: unit,
          derivation: mkDer("conv_lam", cnvJ(jc, t0, t1), [...wder, typeResult.succ.derivation, bodyResult.succ.derivation]),
        });
      }
      const result = conv(pushLocal(jc, w0.type), w0.body, app(shift(w1, 1, 0), bind(0)));
      if (isErr(result)) return result;
      return succ({
        value: unit,
        derivation: mkDer("eta_lam_right", cnvJ(jc, t0, t1), [...wder, result.succ.derivation]),
      });
    }
    case "pi": {
      if (w1.tag !== "pi") return err(notConvertible(t0, t1));
      const typeResult = conv(jc, w0.type, w1.type);
      if (isErr(typeResult)) return typeResult;
      const bodyResult = conv(pushLocal(jc, w0.type), w0.body, w1.body);
      if (isErr(bodyResult)) return bodyResult;
      return succ({
        value: unit,
        derivation: mkDer("conv_pi", cnvJ(jc, t0, t1), [...wder, typeResult.succ.derivation, bodyResult.succ.derivation]),
      });
    }
    case "app": {
      if (w1.tag !== "app") return err(notConvertible(t0, t1));
      const funResult = conv(jc, w0.fun, w1.fun);
      if (isErr(funResult)) return funResult;
      const argResult = conv(jc, w0.arg, w1.arg);
      if (isErr(argResult)) return argResult;
      return succ({
        value: unit,
        derivation: mkDer("conv_app", cnvJ(jc, t0, t1), [...wder, funResult.succ.derivation, argResult.succ.derivation]),
      });
    }
  }

  if (w1.tag === "lam") {
    const result = conv(pushLocal(jc, w1.type), app(shift(w0, 1, 0), bind(0)), w1.body);
    if (isErr(result)) return result;
    return succ({
      value: unit,
      derivation: mkDer("eta_lam_left", cnvJ(jc, t0, t1), [...wder, result.succ.derivation]),
    });
  }
  return err(notConvertible(t0, t1));
}

function conv(jc: JudgContext, t0: Term, t1: Term): TCResult<Unit, NotConvertible> {
  if (alphaEq(t0, t1))
    return succ({ value: unit, derivation: mkDer("conv_refl", cnvJ(jc, t0, t1), []) });
  return convWhNF(jc, t0, t1);
}

function wellFormedLocal(jc: JudgContext): TCResult<Unit, TypeError> {
  if (jc.local.length === 0)
    return succ({ value: unit, derivation: mkDer("wf_empty", wfJ(jc), []) });

  const e = jc.local[0]!;
  const ctx = judgCtx(jc.global, jc.local.slice(1));

  if (e.tag === "Var") {
    const s = typeInfer(ctx, e.type);
    if (isErr(s)) return s;
    const { nf: sNF, ders: sDer } = whnfOf(ctx, s.succ.value);
    if (sNF.tag !== "sort") return err(expectedSort(sNF, e.type.range));
    return succ({ value: unit, derivation: mkDer("local_assm", wfJ(jc), [...sDer, s.succ.derivation]) });
  }

  const r = typeCheck(ctx, e.def, e.type);
  if (isErr(r)) return r;
  return succ({ value: unit, derivation: mkDer("local_def", wfJ(jc), [r.succ.derivation]) });
}

function typeInfer(jc: JudgContext, t: Term): TCResult<Term, TypeError> {
  switch (t.tag) {
    case "sort": {
      const r = wellFormedLocal(jc);
      if (isErr(r)) return r;
      if (t.name === "Type") return err({ tag: "TypeHasNoType", range: t.range });
      const res = sort("Type");
      return succ({ value: res, derivation: mkDer("axiom", synJ(jc, t, res), [r.succ.derivation]) });
    }

    case "free": {
      const ge = jc.global.find((e) => e.name === t.name)!;
      const res = ge.type!;
      return succ({ value: res, derivation: mkDer("constant", synJ(jc, t, res), []) });
    }

    case "bind": {
      const r = wellFormedLocal(jc);
      if (isErr(r)) return r;
      const le = jc.local[t.idx]!;
      const res = shift(le.type, t.idx + 1, 0);
      return succ({ value: res, derivation: mkDer("variable", synJ(jc, t, res), [r.succ.derivation]) });
    }

    case "lam": {
      const bodyType = typeInfer(pushLocal(jc, t.type), t.body);
      if (isErr(bodyType)) return bodyType;
      const termType = pi(t.type, bodyType.succ.value);
      const s = typeInfer(jc, termType);
      if (isErr(s)) return s;
      const { nf: sNF, ders: sDer } = whnfOf(jc, s.succ.value);
      if (sNF.tag !== "sort") return err(expectedSort(sNF, t.range));
      return succ({
        value: termType,
        derivation: mkDer("abstraction", synJ(jc, t, termType), [bodyType.succ.derivation, s.succ.derivation, ...sDer]),
      });
    }

    case "pi": {
      const s0 = typeInfer(jc, t.type);
      if (isErr(s0)) return s0;
      const { nf: s0NF, ders: s0Der } = whnfOf(jc, s0.succ.value);
      if (s0NF.tag !== "sort") return err(expectedSort(s0NF, t.type.range));

      const newJc = pushLocal(jc, t.type);
      const s1 = typeInfer(newJc, t.body);
      if (isErr(s1)) return s1;
      const { nf: s1NF, ders: s1Der } = whnfOf(newJc, s1.succ.value);
      if (s1NF.tag !== "sort") return err(expectedSort(s1NF, t.body.range));

      return succ({
        value: s1NF,
        derivation: mkDer("product", synJ(jc, t, s1NF), [s0.succ.derivation, ...s0Der, s1.succ.derivation, ...s1Der]),
      });
    }

    case "letin": {
      let defType: Term;
      let defDerivation: Derivation;
      if (t.type !== undefined) {
        const defTypeResult = typeCheck(jc, t.def, t.type);
        if (isErr(defTypeResult)) return defTypeResult;
        defType = t.type;
        defDerivation = defTypeResult.succ.derivation;
      } else {
        const inferred = typeInfer(jc, t.def);
        if (isErr(inferred)) return inferred;
        defType = inferred.succ.value;
        defDerivation = inferred.succ.derivation;
      }
      const bodyType = typeInfer(pushLocal(jc, defType, t.def), t.body);
      if (isErr(bodyType)) return bodyType;
      const res = subst(bodyType.succ.value, 0, t.def);
      return succ({
        value: res,
        derivation: mkDer("let", synJ(jc, t, res), [defDerivation, bodyType.succ.derivation]),
      });
    }

    case "app": {
      const funType = typeInfer(jc, t.fun);
      if (isErr(funType)) return funType;
      const { nf: funTypeNF, ders: funTypeDer } = whnfOf(jc, funType.succ.value);
      if (funTypeNF.tag !== "pi") {
        const { nf: fun } = whnfOf(jc, t.fun);
        return err({ tag: "ExpectedPi", fun, actual: funTypeNF, range: t.fun.range });
      }

      const argType = typeInfer(jc, t.arg);
      if (isErr(argType)) return argType;
      const resConv = conv(jc, argType.succ.value, funTypeNF.type);
      if (isErr(resConv))
        return err({ tag: "TypeMismatch", actual: argType.succ.value, expected: funTypeNF.type, range: t.arg.range, cause: resConv.err });

      const res = subst(funTypeNF.body, 0, t.arg);
      return succ({
        value: res,
        derivation: mkDer("application", synJ(jc, t, res), [
          funType.succ.derivation,
          ...funTypeDer,
          argType.succ.derivation,
          resConv.succ.derivation,
        ]),
      });
    }
  }
}

export function inferType(jc: JudgContext, t: Term): TCResult<Term, TypeError> {
  return typeInfer(jc, t);
}

function typeCheck(jc: JudgContext, t: Term, expected: Term): TCResult<Unit, TypeError> {
  const { nf: expectedNF, ders: expectedDer } = whnfOf(jc, expected);
  const s = typeInfer(jc, expectedNF);
  if (isErr(s)) return s;
  const { nf: sNF, ders: sDer } = whnfOf(jc, s.succ.value);
  if (sNF.tag !== "sort") return err(expectedSort(sNF, expected.range));

  const inferred = typeInfer(jc, t);
  if (isErr(inferred)) return inferred;
  const resConv = conv(jc, inferred.succ.value, expectedNF);
  if (isErr(resConv))
    return err({ tag: "TypeMismatch", actual: inferred.succ.value, expected: expectedNF, range: t.range, cause: resConv.err });

  return succ({
    value: unit,
    derivation: mkDer("check_conv", chkJ(jc, t, expectedNF), [...expectedDer, ...sDer, inferred.succ.derivation, resConv.succ.derivation]),
  });
}

export type WFGSucc = Map<
  string,
  { elem: GlobalElement; derivation: Derivation }
>;

export function wellFormedGlobal(global: GlobalContext): Result<WFGSucc, WFError> {
  const g: GlobalContext = [];
  const res: WFGSucc = new Map();
  for (const e of global) {
    if (e.tag === "Var") {
      const s = typeInfer(judgCtx(g, []), e.type);
      if (isErr(s)) return err({ error: s.err, at: e, range: s.err.range ?? e.type.range });
      const { nf: sNF, ders: sDer } = whnfOf(judgCtx(g, []), s.succ.value);
      if (sNF.tag !== "sort") {
        const error = expectedSort(sNF, e.type.range);
        return err({ error, at: e, range: error.range });
      }
      g.push(e);
      res.set(e.name, { elem: e, derivation: mkDer("wf_global_assm", wfJ(judgCtx(g, [])), [...sDer, s.succ.derivation]) });
      continue;
    }

    if (e.type !== undefined) {
      const r = typeCheck(judgCtx(g, []), e.def, e.type);
      if (isErr(r)) return err({ error: r.err, at: e, range: r.err.range ?? e.def.range });
      g.push(e);
      res.set(e.name, { elem: e, derivation: mkDer("wf_global_def", wfJ(judgCtx(g, [])), [r.succ.derivation]) });
    } else {
      const inferred = typeInfer(judgCtx(g, []), e.def);
      if (isErr(inferred)) return err({ error: inferred.err, at: e, range: inferred.err.range ?? e.def.range });
      const resolved: GlobalElement = { tag: "Def", name: e.name, type: inferred.succ.value, def: e.def };
      g.push(resolved);
      res.set(e.name, { elem: resolved, derivation: mkDer("wf_global_def_inferred", wfJ(judgCtx(g, [])), [inferred.succ.derivation]) });
    }
  }
  return succ(res);
}