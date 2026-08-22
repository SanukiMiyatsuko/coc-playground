import type { Range } from "./junction-defs";
import * as SA from "./surface-ast";
import * as DA from "./desugared-ast";

const ANON = "@";

type FlatBinder = { name: string; typeTerm: SA.Term };

function flattenBinders(binders: readonly SA.Binder[]): FlatBinder[] {
  const flat: FlatBinder[] = [];
  for (const binder of binders) {
    for (const name of binder.names) {
      flat.push({ name, typeTerm: binder.typeTerm });
    }
  }
  return flat;
}

function desugarLam(binders: readonly SA.Binder[], body: SA.Term, range: Range): DA.Term {
  return flattenBinders(binders).reduceRight<DA.Term>(
    (acc, b) => ({
      tag: "LamTerm",
      name: b.name,
      typeTerm: desugarTerm(b.typeTerm),
      body: acc,
      range,
    }),
    desugarTerm(body),
  );
}

function desugarPi(binders: readonly SA.Binder[], body: SA.Term, range: Range): DA.Term {
  return flattenBinders(binders).reduceRight<DA.Term>(
    (acc, b) => ({
      tag: "PiTerm",
      name: b.name,
      typeTerm: desugarTerm(b.typeTerm),
      body: acc,
      range,
    }),
    desugarTerm(body),
  );
}

export const desugarTerm = (term: SA.Term): DA.Term => {
  switch (term.tag) {
    case "Sort":
      return { tag: "Sort", value: term.value, range: term.range };

    case "Ident":
      return { tag: "Ident", name: term.name, range: term.range };

    case "LamTerm":
      return desugarLam(term.binders, term.body, term.range);

    case "PiTerm":
      return desugarPi(term.binders, term.body, term.range);

    case "LetTerm":
      return {
        tag: "LetTerm",
        name: term.name,
        typeTerm: desugarPi(term.binders, term.typeTerm, term.range),
        value: desugarLam(term.binders, term.value, term.range),
        inTerm: desugarTerm(term.inTerm),
        range: term.range,
      };

    case "ArrowTerm": {
      const terms = [term.fst, ...term.other];
      const overallEnd = terms[terms.length - 1]!.range.end;
      let acc = desugarTerm(terms[terms.length - 1]!);
      for (let i = terms.length - 2; i >= 0; i--) {
        const domain = terms[i]!;
        acc = {
          tag: "PiTerm",
          name: ANON,
          typeTerm: desugarTerm(domain),
          body: acc,
          range: { start: domain.range.start, end: overallEnd },
        };
      }
      return acc;
    }

    case "AppTerm": {
      let acc = desugarTerm(term.fst);
      for (const arg of term.other) {
        acc = {
          tag: "AppTerm",
          func: acc,
          arg: desugarTerm(arg),
          range: { start: term.fst.range.start, end: arg.range.end },
        };
      }
      return acc;
    }
  }
};

export const desugarDecl = (decl: SA.Decl): DA.Decl => {
  switch (decl.tag) {
    case "VarDecl":
      return {
        tag: "VarDecl",
        name: decl.name,
        nameRange: decl.nameRange,
        typeTerm: desugarPi(decl.binders, decl.typeTerm, decl.range),
        range: decl.range,
      };

    case "DefDecl":
      return {
        tag: "DefDecl",
        name: decl.name,
        nameRange: decl.nameRange,
        typeTerm: desugarPi(decl.binders, decl.typeTerm, decl.range),
        body: desugarLam(decl.binders, decl.body, decl.range),
        range: decl.range,
      };

    case "EvalDecl":
      return {
        tag: "EvalDecl",
        term: desugarTerm(decl.term),
        range: decl.range,
      };
  }
};

export const desugarProgram = (program: SA.Program): DA.Program =>
  program.map(desugarDecl);