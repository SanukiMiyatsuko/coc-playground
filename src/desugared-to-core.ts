import * as DA from "./desugared-ast";
import * as CA from "./core-ast";

export function elabTerm(t: DA.Term, env: string[]): CA.Term {
  switch (t.tag) {
    case "Sort":
      return CA.sort(t.value, t.range);
    case "Ident": {
      const index = env.indexOf(t.name);
      return index === -1
        ? CA.free(t.name, t.range)
        : CA.bind(index, t.range);
    }
    case "LamTerm":
      return CA.lam(
        elabTerm(t.typeTerm, env),
        elabTerm(t.body, [t.name, ...env]),
        t.range
      );
    case "PiTerm":
      return CA.pi(
        elabTerm(t.typeTerm, env),
        elabTerm(t.body, [t.name, ...env]),
        t.range
      );
    case "LetTerm":
      return CA.letin(
        elabTerm(t.typeTerm, env),
        elabTerm(t.value, env),
        elabTerm(t.inTerm, [t.name, ...env]),
        t.range
      );
    case "AppTerm":
      return CA.app(
        elabTerm(t.func, env),
        elabTerm(t.arg, env),
        t.range
      );
  }
}

export function elabGlobalContext(ctx: DA.Program): CA.GlobalContext {
  const res: CA.GlobalContext = [];
  for (const e of ctx) {
    const convert = (t: DA.Term) => elabTerm(t, []);
    if (e.tag === "VarDecl")
      res.push(CA.globalElem(e.name, convert(e.typeTerm)));
    else if (e.tag === "DefDecl")
      res.push(CA.globalElem(e.name, convert(e.typeTerm), convert(e.body)));
  };
  return res;
}