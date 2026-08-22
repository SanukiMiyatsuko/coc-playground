import type { Range } from "./junction-defs";
import {
  type Term,
  sort,
  pi,
  app,
  type GlobalElement,
  type GlobalContext,
  type JudgContext,
  judgCtx,
  bind,
  type LocalContext,
  pushLocal,
  type Derivation,
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

export type TypeError =
  | { tag: "NotConvertible"; eqLeft: Term; eqRight: Term; range?: Range }
  | { tag: "TypeHasNoType"; range?: Range }
  | { tag: "UnboundVariableName"; name: string; range?: Range }
  | { tag: "UnboundVariableIndex"; index: string | number; range?: Range }
  | { tag: "ExpectedSort"; actual: Term; range?: Range }
  | { tag: "ExpectedPi"; fun: Term; actual: Term; range?: Range }
  | { tag: "TypeMismatch"; actual: Term; expected: Term; range?: Range };

type WFError = { error: TypeError; at: GlobalElement; range?: Range };

type WithDerivation<A> = { value: A; derivation: Derivation };

type TCResult<A, B> = Result<WithDerivation<A>, B>;

// Small helpers so the range attached to a given error tag stays consistent
// across the (several) places each tag can be constructed.
function notConvertible(t0: Term, t1: Term): TypeError {
  return { tag: "NotConvertible", eqLeft: t0, eqRight: t1, range: t0.range ?? t1.range };
}

function expectedSort(actual: Term, range?: Range): TypeError {
  return { tag: "ExpectedSort", actual, range };
}

export function whNF(jc: JudgContext, t: Term): TCResult<Term, Term> {
  switch (t.tag) {
    case "free": {
      const ge = jc.global.find((e) => e.name === t.name);
      if (ge && ge.tag === "Def") {
        const res = ge.def;
        const der: Derivation = {
          rule: "delta_global",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: t,
            to: res,
          },
          children: [],
        };
        const nextRes = whNF(jc, res);
        if (isErr(nextRes)) return succ({ value: res, derivation: der });
        const result = nextRes.succ.value;
        const finalDer: Derivation = {
          rule: "transitivity",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: t,
            to: result,
          },
          children: [der, nextRes.succ.derivation],
        };
        return succ({ value: result, derivation: finalDer });
      }
      break;
    }
    case "bind": {
      const le = jc.local[t.idx];
      if (le && le.tag === "Def") {
        const res = shift(le.def, t.idx + 1, 0);
        const der: Derivation = {
          rule: "delta_local",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: t,
            to: res,
          },
          children: [],
        };
        const nextRes = whNF(jc, res);
        if (isErr(nextRes)) return succ({ value: res, derivation: der });
        const result = nextRes.succ.value;
        const finalDer: Derivation = {
          rule: "transitivity",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: t,
            to: result,
          },
          children: [der, nextRes.succ.derivation],
        };
        return succ({ value: result, derivation: finalDer });
      }
      break;
    }
    case "letin": {
      const res = subst(t.body, 0, t.def);
      const der: Derivation = {
        rule: "zeta",
        judgment: {
          tag: "Reduction",
          context: jc,
          from: t,
          to: res,
        },
        children: [],
      };
      const nextRes = whNF(jc, res);
      if (isErr(nextRes)) return succ({ value: res, derivation: der });
      const result = nextRes.succ.value;
      const finalDer: Derivation = {
        rule: "transitivity",
        judgment: {
          tag: "Reduction",
          context: jc,
          from: t,
          to: result,
        },
        children: [der, nextRes.succ.derivation],
      };
      return succ({ value: result, derivation: finalDer });
    }
    case "app": {
      const fun = whNF(jc, t.fun);
      const funTerm = isSucc(fun) ? fun.succ.value : fun.err;
      const funDerivs = isSucc(fun) ? [fun.succ.derivation] : [];
      const reduced = app(funTerm, t.arg);
      const der: Derivation = {
        rule: "cong_app",
        judgment: {
          tag: "Reduction",
          context: jc,
          from: t,
          to: reduced,
        },
        children: funDerivs,
      };
      if (funTerm.tag === "lam") {
        const res = subst(funTerm.body, 0, t.arg);
        const derbeta: Derivation = {
          rule: "beta",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: reduced,
            to: res,
          },
          children: [],
        };
        const transDer: Derivation = {
          rule: "transitivity",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: t,
            to: res,
          },
          children: [der, derbeta],
        };
        const nextRes = whNF(jc, res);
        if (isErr(nextRes)) return succ({ value: res, derivation: transDer });
        const result = nextRes.succ.value;
        const finalDer: Derivation = {
          rule: "transitivity",
          judgment: {
            tag: "Reduction",
            context: jc,
            from: t,
            to: result,
          },
          children: [transDer, nextRes.succ.derivation],
        };
        return succ({ value: result, derivation: finalDer });
      }
      return succ({ value: reduced, derivation: der });
    }
  }
  return err(t);
}

function convWhNF(
  jc: JudgContext,
  t0: Term,
  t1: Term,
): TCResult<Unit, TypeError> {
  const res0 = whNF(jc, t0);
  const w0 = isSucc(res0) ? res0.succ.value : res0.err;
  const wder0 = isSucc(res0) ? [res0.succ.derivation] : [];
  const res1 = whNF(jc, t1);
  const w1 = isSucc(res1) ? res1.succ.value : res1.err;
  const wder = isSucc(res1) ? [...wder0, res1.succ.derivation] : [...wder0];
  if (alphaEq(w0, w1)) {
    const refl: Derivation = {
      rule: "conv_refl",
      judgment: {
        tag: "Conversion",
        context: jc,
        eqLeft: w0,
        eqRight: w1,
      },
      children: [],
    };
    const der: Derivation = {
      rule: "conv_whnf",
      judgment: {
        tag: "Conversion",
        context: jc,
        eqLeft: t0,
        eqRight: t1,
      },
      children: [...wder, refl],
    };
    return succ({ value: unit, derivation: der });
  }
  switch (w0.tag) {
    case "lam": {
      if (w1.tag === "lam") {
        const typeResult = conv(jc, w0.type, w1.type);
        if (isErr(typeResult)) return typeResult;
        const newJc = pushLocal(jc, w0.type);
        const bodyResult = conv(newJc, w0.body, w1.body);
        if (isErr(bodyResult)) return bodyResult;
        const der: Derivation = {
          rule: "conv_lam",
          judgment: {
            tag: "Conversion",
            context: jc,
            eqLeft: t0,
            eqRight: t1,
          },
          children: [
            ...wder,
            typeResult.succ.derivation,
            bodyResult.succ.derivation,
          ],
        };
        return succ({ value: unit, derivation: der });
      }
      const newJc = pushLocal(jc, w0.type);
      const result = conv(
        newJc,
        w0.body,
        app(shift(w1, 1, 0), bind(0)),
      );
      if (isErr(result)) return result;
      const der: Derivation = {
        rule: "eta_lam_right",
        judgment: {
          tag: "Conversion",
          context: jc,
          eqLeft: t0,
          eqRight: t1,
        },
        children: [...wder, result.succ.derivation],
      };
      return succ({ value: unit, derivation: der });
    }
    case "pi": {
      if (w1.tag !== "pi")
        return err(notConvertible(t0, t1));
      const typeResult = conv(jc, w0.type, w1.type);
      if (isErr(typeResult)) return typeResult;
      const newJc = pushLocal(jc, w0.type);
      const bodyResult = conv(newJc, w0.body, w1.body);
      if (isErr(bodyResult)) return bodyResult;
      const der: Derivation = {
        rule: "conv_pi",
        judgment: {
          tag: "Conversion",
          context: jc,
          eqLeft: t0,
          eqRight: t1,
        },
        children: [
          ...wder,
          typeResult.succ.derivation,
          bodyResult.succ.derivation,
        ],
      };
      return succ({ value: unit, derivation: der });
    }
    case "app": {
      if (w1.tag !== "app")
        return err(notConvertible(t0, t1));
      const funResult = conv(jc, w0.fun, w1.fun);
      if (isErr(funResult)) return funResult;
      const argResult = conv(jc, w0.arg, w1.arg);
      if (isErr(argResult)) return argResult;
      const der: Derivation = {
        rule: "conv_app",
        judgment: {
          tag: "Conversion",
          context: jc,
          eqLeft: t0,
          eqRight: t1,
        },
        children: [
          ...wder,
          funResult.succ.derivation,
          argResult.succ.derivation,
        ],
      };
      return succ({ value: unit, derivation: der });
    }
  }
  if (w1.tag === "lam") {
    const newJc = pushLocal(jc, w1.type);
    const result = conv(newJc, app(shift(w0, 1, 0), bind(0)), w1.body);
    if (isErr(result)) return result;
    const der: Derivation = {
      rule: "eta_lam_left",
      judgment: {
        tag: "Conversion",
        context: jc,
        eqLeft: t0,
        eqRight: t1,
      },
      children: [...wder, result.succ.derivation],
    };
    return succ({ value: unit, derivation: der });
  }
  return err(notConvertible(t0, t1));
}

function conv(jc: JudgContext, t0: Term, t1: Term): TCResult<Unit, TypeError> {
  if (alphaEq(t0, t1)) {
    const der: Derivation = {
      rule: "conv_refl",
      judgment: {
        tag: "Conversion",
        context: jc,
        eqLeft: t0,
        eqRight: t1,
      },
      children: [],
    };
    return succ({ value: unit, derivation: der });
  }
  return convWhNF(jc, t0, t1);
}

function wellFormedLocal(jc: JudgContext): TCResult<Unit, TypeError> {
  if (jc.local.length === 0) {
    return succ({
      value: unit,
      derivation: {
        rule: "wf_empty",
        judgment: {
          tag: "WellFormed",
          context: jc,
        },
        children: [],
      },
    });
  }
  const l: LocalContext = jc.local.slice(1);
  const e = jc.local[0]!;
  const ctx = judgCtx(jc.global, l);
  if (e.tag === "Var") {
    const s = typeInfer(ctx, e.type);
    if (isErr(s)) return s;
    const sWhnf = whNF(ctx, s.succ.value);
    const sNF = isSucc(sWhnf) ? sWhnf.succ.value : sWhnf.err;
    const sDer = isSucc(sWhnf) ? [sWhnf.succ.derivation] : [];
    if (sNF.tag !== "sort")
      return err(expectedSort(sNF, e.type.range));
    const der: Derivation = {
      rule: "local_assm",
      judgment: {
        tag: "WellFormed",
        context: jc,
      },
      children: [...sDer, s.succ.derivation],
    };
    return succ({ value: unit, derivation: der });
  }
  const r = typeCheck(ctx, e.def, e.type);
  if (isErr(r)) return r;
  const der: Derivation = {
    rule: "local_def",
    judgment: {
      tag: "WellFormed",
      context: jc,
    },
    children: [r.succ.derivation],
  };
  return succ({ value: unit, derivation: der });
}

function typeInfer(jc: JudgContext, t: Term): TCResult<Term, TypeError> {
  switch (t.tag) {
    case "sort": {
      const r = wellFormedLocal(jc);
      if (isErr(r)) return r;
      if (t.name === "Type")
        return err({
          tag: "TypeHasNoType",
          range: t.range,
        });
      const res = sort("Type");
      const der: Derivation = {
        rule: "axiom",
        judgment: {
          tag: "Synthesis",
          context: jc,
          fromTerm: t,
          toType: res,
        },
        children: [r.succ.derivation],
      };
      return succ({ value: res, derivation: der });
    }
    case "free": {
      const ge = jc.global.find((e) => e.name === t.name);
      if (ge) {
        const res = ge.type;
        const der: Derivation = {
          rule: "constant",
          judgment: {
            tag: "Synthesis",
            context: jc,
            fromTerm: t,
            toType: res,
          },
          children: [],
        };
        return succ({ value: res, derivation: der });
      }
      return err({
        tag: "UnboundVariableName",
        name: t.name,
        range: t.range,
      });
    }
    case "bind": {
      const r = wellFormedLocal(jc);
      if (isErr(r)) return r;
      const le = jc.local[t.idx];
      if (le) {
        const res = shift(le.type, t.idx + 1, 0);
        const der: Derivation = {
          rule: "variable",
          judgment: {
            tag: "Synthesis",
            context: jc,
            fromTerm: t,
            toType: res,
          },
          children: [r.succ.derivation],
        };
        return succ({ value: res, derivation: der });
      }
      return err({
        tag: "UnboundVariableIndex",
        index: t.idx,
        range: t.range,
      });
    }
    case "lam": {
      const newJc = pushLocal(jc, t.type);
      const bodyType = typeInfer(newJc, t.body);
      if (isErr(bodyType)) return bodyType;
      const termType = pi(t.type, bodyType.succ.value);
      const s = typeInfer(jc, termType);
      if (isErr(s)) return s;
      const sWhNF = whNF(jc, s.succ.value);
      const sNF = isSucc(sWhNF) ? sWhNF.succ.value : sWhNF.err;
      const sDer = isSucc(sWhNF) ? [sWhNF.succ.derivation] : [];
      if (sNF.tag !== "sort")
        return err(expectedSort(sNF, t.range));
      const der: Derivation = {
        rule: "abstraction",
        judgment: {
          tag: "Synthesis",
          context: jc,
          fromTerm: t,
          toType: termType,
        },
        children: [bodyType.succ.derivation, s.succ.derivation, ...sDer],
      };
      return succ({ value: termType, derivation: der });
    }
    case "pi": {
      const s0 = typeInfer(jc, t.type);
      if (isErr(s0)) return s0;
      const s0WhNF = whNF(jc, s0.succ.value);
      const s0NF = isSucc(s0WhNF) ? s0WhNF.succ.value : s0WhNF.err;
      const s0Der = isSucc(s0WhNF) ? [s0WhNF.succ.derivation] : [];
      if (s0NF.tag !== "sort")
        return err(expectedSort(s0NF, t.type.range));
      const newJc = pushLocal(jc, t.type);
      const s1 = typeInfer(newJc, t.body);
      if (isErr(s1)) return s1;
      const s1WhNF = whNF(newJc, s1.succ.value);
      const s1NF = isSucc(s1WhNF) ? s1WhNF.succ.value : s1WhNF.err;
      const s1Der = isSucc(s1WhNF) ? [s1WhNF.succ.derivation] : [];
      if (s1NF.tag !== "sort")
        return err(expectedSort(s1NF, t.body.range));
      const der: Derivation = {
        rule: "product",
        judgment: {
          tag: "Synthesis",
          context: jc,
          fromTerm: t,
          toType: s1NF,
        },
        children: [s0.succ.derivation, ...s0Der, s1.succ.derivation, ...s1Der],
      };
      return succ({ value: s1NF, derivation: der });
    }
    case "letin": {
      let defType: Term;
      let defTypeDer: Derivation;
      if (t.type) {
        const r = typeCheck(jc, t.def, t.type);
        if (isErr(r)) return r;
        defType = t.type;
        defTypeDer = r.succ.derivation;
      } else {
        const r = typeInfer(jc, t.def);
        if (isErr(r)) return r;
        defType = r.succ.value;
        defTypeDer = r.succ.derivation;
      }
      const newJc = pushLocal(jc, defType, t.def);
      const bodyType = typeInfer(newJc, t.body);
      if (isErr(bodyType)) return bodyType;
      const res = subst(bodyType.succ.value, 0, t.def);
      const der: Derivation = {
        rule: "let",
        judgment: {
          tag: "Synthesis",
          context: jc,
          fromTerm: t,
          toType: res,
        },
        children: [defTypeDer, bodyType.succ.derivation],
      };
      return succ({ value: res, derivation: der });
    }
    case "app": {
      const funType = typeInfer(jc, t.fun);
      if (isErr(funType)) return funType;
      const funTypeWhNF = whNF(jc, funType.succ.value);
      const funTypeNF = isSucc(funTypeWhNF)
        ? funTypeWhNF.succ.value
        : funTypeWhNF.err;
      const funTypeDer = isSucc(funTypeWhNF)
        ? [funTypeWhNF.succ.derivation]
        : [];
      if (funTypeNF.tag !== "pi") {
        const funWhNF = whNF(jc, t.fun);
        const fun = isSucc(funWhNF) ? funWhNF.succ.value : funWhNF.err;
        return err({
          tag: "ExpectedPi",
          fun: fun,
          actual: funTypeNF,
          range: t.fun.range,
        });
      }
      const argType = typeInfer(jc, t.arg);
      if (isErr(argType)) return argType;
      const resConv = conv(jc, argType.succ.value, funTypeNF.type);
      if (isErr(resConv))
        return err({
          tag: "TypeMismatch",
          actual: argType.succ.value,
          expected: funTypeNF.type,
          range: t.arg.range,
        });
      const res = subst(funTypeNF.body, 0, t.arg);
      const der: Derivation = {
        rule: "application",
        judgment: {
          tag: "Synthesis",
          context: jc,
          fromTerm: t,
          toType: res,
        },
        children: [
          funType.succ.derivation,
          ...funTypeDer,
          argType.succ.derivation,
          resConv.succ.derivation,
        ],
      };
      return succ({ value: res, derivation: der });
    }
  }
}

export function inferType(jc: JudgContext, t: Term): TCResult<Term, TypeError> {
  return typeInfer(jc, t);
}

function typeCheck(
  jc: JudgContext,
  t: Term,
  expected: Term,
): TCResult<Unit, TypeError> {
  const expectedWhNF = whNF(jc, expected);
  const expectedNF = isSucc(expectedWhNF)
    ? expectedWhNF.succ.value
    : expectedWhNF.err;
  const expectedDer = isSucc(expectedWhNF)
    ? [expectedWhNF.succ.derivation]
    : [];
  const s = typeInfer(jc, expectedNF);
  if (isErr(s)) return s;
  const sWhNF = whNF(jc, s.succ.value);
  const sNF = isSucc(sWhNF) ? sWhNF.succ.value : sWhNF.err;
  const sDer = isSucc(sWhNF) ? [sWhNF.succ.derivation] : [];
  if (sNF.tag !== "sort")
    return err(expectedSort(sNF, expected.range));
  const inferred = typeInfer(jc, t);
  if (isErr(inferred)) return inferred;
  const resConv = conv(jc, inferred.succ.value, expectedNF);
  if (isErr(resConv))
    return err({
      tag: "TypeMismatch",
      actual: inferred.succ.value,
      expected: expectedNF,
      range: t.range,
    });
  const der: Derivation = {
    rule: "check_conv",
    judgment: {
      tag: "Check",
      context: jc,
      toTerm: t,
      fromType: expectedNF,
    },
    children: [
      ...expectedDer,
      ...sDer,
      inferred.succ.derivation,
      resConv.succ.derivation,
    ],
  };
  return succ({ value: unit, derivation: der });
}

export type WFGSucc = Map<
  string,
  { elem: GlobalElement; derivation: Derivation }
>;

export function wellFormedGlobal(
  global: GlobalContext,
): Result<WFGSucc, WFError> {
  const g: GlobalContext = [];
  const res: WFGSucc = new Map();
  for (const e of global) {
    if (e.tag === "Var") {
      const s = typeInfer(judgCtx(g, []), e.type);
      if (isErr(s)) return err({ error: s.err, at: e, range: s.err.range ?? e.type.range });
      const sWhNF = whNF(judgCtx(g, []), s.succ.value);
      const sNF = isSucc(sWhNF) ? sWhNF.succ.value : sWhNF.err;
      const sDer = isSucc(sWhNF) ? [sWhNF.succ.derivation] : [];
      if (sNF.tag !== "sort") {
        const error = expectedSort(sNF, e.type.range);
        return err({ error, at: e, range: error.range });
      }
      g.push(e);
      const der: Derivation = {
        rule: "wf_global_assm",
        judgment: {
          tag: "WellFormed",
          context: judgCtx(g, []),
        },
        children: [...sDer, s.succ.derivation],
      };
      res.set(e.name, { elem: e, derivation: der });
    } else {
      const r = typeCheck(judgCtx(g, []), e.def, e.type);
      if (isErr(r)) return err({ error: r.err, at: e, range: r.err.range ?? e.def.range });
      g.push(e);
      const der: Derivation = {
        rule: "wf_global_def",
        judgment: {
          tag: "WellFormed",
          context: judgCtx(g, []),
        },
        children: [r.succ.derivation],
      };
      res.set(e.name, { elem: e, derivation: der });
    }
  }
  return succ(res);
}