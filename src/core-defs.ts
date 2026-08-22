import * as Core from "./core-ast";
import type { Term } from "./core-ast";

export function shift(t: Term, d: number, c: number): Term {
  switch (t.tag) {
    case "sort":
    case "free":
      return t;
    case "bind":
      return t.idx >= c ? Core.bind(t.idx + d) : t;
    case "lam":
      return Core.lam(shift(t.type, d, c), shift(t.body, d, c + 1));
    case "pi":
      return Core.pi(shift(t.type, d, c), shift(t.body, d, c + 1));
    case "app":
      return Core.app(shift(t.fun, d, c), shift(t.arg, d, c));
    case "letin":
      return Core.letin(
        t.type ? shift(t.type, d, c) : undefined,
        shift(t.def, d, c),
        shift(t.body, d, c + 1),
      );
  }
}

export function subst(t: Term, idx: number, u: Term): Term {
  switch (t.tag) {
    case "sort":
    case "free":
      return t;
    case "bind":
      if (t.idx === idx) return u;
      if (t.idx > idx) return Core.bind(t.idx - 1);
      return t;
    case "lam":
      return Core.lam(subst(t.type, idx, u), subst(t.body, idx + 1, shift(u, 1, 0)));
    case "pi":
      return Core.pi(subst(t.type, idx, u), subst(t.body, idx + 1, shift(u, 1, 0)));
    case "app":
      return Core.app(subst(t.fun, idx, u), subst(t.arg, idx, u));
    case "letin":
      return Core.letin(
        t.type ? subst(t.type, idx, u) : undefined,
        subst(t.def, idx, u),
        subst(t.body, idx + 1, shift(u, 1, 0)),
      );
  }
}

export function alphaEq(t1: Term, t2: Term): boolean {
  switch (t1.tag) {
    case "sort":
      return t2.tag === "sort" && t1.name === t2.name;
    case "free":
      return t2.tag === "free" && t1.name === t2.name;
    case "bind":
      return t2.tag === "bind" && t1.idx === t2.idx;
    case "lam":
      return t2.tag === "lam" && alphaEq(t1.type, t2.type) && alphaEq(t1.body, t2.body);
    case "pi":
      return t2.tag === "pi" && alphaEq(t1.type, t2.type) && alphaEq(t1.body, t2.body);
    case "app":
      return t2.tag === "app" && alphaEq(t1.fun, t2.fun) && alphaEq(t1.arg, t2.arg);
    case "letin":
      return (
        t2.tag === "letin" &&
        (t1.type === undefined ? t2.type === undefined : t2.type !== undefined && alphaEq(t1.type, t2.type)) &&
        alphaEq(t1.def, t2.def) &&
        alphaEq(t1.body, t2.body)
      );
  }
}