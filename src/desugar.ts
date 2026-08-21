import * as SA from "./surface-ast";
import * as DA from "./desugared-ast";

const ANON = "_";

const wrapBinders = (
  tag: "PiTerm" | "LamTerm",
  binders: readonly SA.Binder[],
  inner: DA.Term,
): DA.Term => {
  let result = inner;
  for (let bi = binders.length - 1; bi >= 0; bi--) {
    const binder = binders[bi]!;
    const typeTerm = desugarTerm(binder.typeTerm);
    for (let ni = binder.names.length - 1; ni >= 0; ni--) {
      result = { tag, name: binder.names[ni]!, typeTerm, body: result };
    }
  }
  return result;
};

const wrapPi = (binders: readonly SA.Binder[], inner: DA.Term): DA.Term =>
  wrapBinders("PiTerm", binders, inner);

const wrapLam = (binders: readonly SA.Binder[], inner: DA.Term): DA.Term =>
  wrapBinders("LamTerm", binders, inner);

const desugarArrowChain = (terms: readonly DA.Term[]): DA.Term => {
  let result = terms[terms.length - 1]!;
  for (let i = terms.length - 2; i >= 0; i--) {
    result = { tag: "PiTerm", name: ANON, typeTerm: terms[i]!, body: result };
  }
  return result;
};

export const desugarTerm = (term: SA.Term): DA.Term => {
  switch (term.tag) {
    case "Sort":
      return { tag: "Sort", value: term.value };

    case "Ident":
      return { tag: "Ident", name: term.name, range: term.range };

    case "LamTerm":
      return wrapLam(term.binders, desugarTerm(term.body));

    case "PiTerm":
      return wrapPi(term.binders, desugarTerm(term.body));

    case "LetTerm": {
      const typeTerm = wrapPi(term.binders, desugarTerm(term.typeTerm));
      const value = wrapLam(term.binders, desugarTerm(term.value));
      const inTerm = desugarTerm(term.inTerm);
      return { tag: "LetTerm", name: term.name, typeTerm, value, inTerm };
    }

    case "ArrowTerm":
      return desugarArrowChain([term.fst, ...term.other].map(desugarTerm));

    case "AppTerm": {
      let result = desugarTerm(term.fst);
      for (const arg of term.other)
        result = { tag: "AppTerm", func: result, arg: desugarTerm(arg) };
      return result;
    }
  }
};

export const desugarDecl = (decl: SA.Decl): DA.Decl => {
  switch (decl.tag) {
    case "VarDecl": {
      const typeTerm = wrapPi(decl.binders, desugarTerm(decl.typeTerm));
      return { tag: "VarDecl", name: decl.name, nameRange: decl.nameRange, typeTerm };
    }

    case "DefDecl": {
      const typeTerm = wrapPi(decl.binders, desugarTerm(decl.typeTerm));
      const body = wrapLam(decl.binders, desugarTerm(decl.body));
      return { tag: "DefDecl", name: decl.name, nameRange: decl.nameRange, typeTerm, body };
    }

    case "EvalDecl":
      return { tag: "EvalDecl", term: desugarTerm(decl.term) };
  }
};

export const desugarProgram = (program: SA.Program): DA.Program =>
  program.map(desugarDecl);