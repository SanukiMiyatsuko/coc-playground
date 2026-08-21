import { type Result, succ, err, isErr, unit, type Unit, type Range } from "./junction-defs";
import * as AST from "./surface-ast";

export type ScopeError =
| { tag: "UndefinedVariable"; name: string; range: Range }
| { tag: "DuplicateGlobal"; name: string; range: Range };

type Scope = ReadonlySet<string>;

const emptyScope: Scope = new Set();

const extend = (scope: Scope, names: readonly string[]): Scope =>
  names.length === 0 ? scope : new Set([...scope, ...names]);

const isInScope = (name: string, locals: Scope, globals: Scope): boolean =>
  locals.has(name) || globals.has(name);

const checkBinders = (
  binders: readonly AST.Binder[],
  locals: Scope,
  globals: Scope,
): Result<Scope, ScopeError> => {
  let scope = locals;
  for (const binder of binders) {
    const res = checkTerm(binder.typeTerm, scope, globals);
    if (isErr(res)) return res;
    scope = extend(scope, binder.names);
  }
  return succ(scope);
};

const checkTerms = (
  terms: readonly AST.Term[],
  locals: Scope,
  globals: Scope,
): Result<Unit, ScopeError> => {
  for (const term of terms) {
    const res = checkTerm(term, locals, globals);
    if (isErr(res)) return res;
  }
  return succ(unit);
};

const checkTerm = (term: AST.Term, locals: Scope, globals: Scope): Result<Unit, ScopeError> => {
  switch (term.tag) {
    case "Sort":
      return succ(unit);

    case "Ident":
      if (isInScope(term.name, locals, globals))
        return succ(unit);
      return err({ tag: "UndefinedVariable", name: term.name, range: term.range });

    case "LamTerm":
    case "PiTerm": {
      const scoped = checkBinders(term.binders, locals, globals);
      if (isErr(scoped)) return scoped;
      return checkTerm(term.body, scoped.succ, globals);
    }

    case "LetTerm": {
      const scoped = checkBinders(term.binders, locals, globals);
      if (isErr(scoped)) return scoped;
      const typeRes = checkTerm(term.typeTerm, scoped.succ, globals);
      if (isErr(typeRes)) return typeRes;
      const valueRes = checkTerm(term.value, scoped.succ, globals);
      if (isErr(valueRes)) return valueRes;
      return checkTerm(term.inTerm, extend(locals, [term.name]), globals);
    }

    case "ArrowTerm":
      return checkTerms([term.fst, ...term.other], locals, globals);

    case "AppTerm":
      return checkTerms([term.fst, ...term.other], locals, globals);
  }
};

const checkDecl = (decl: AST.Decl, globals: Scope): Result<Unit, ScopeError> => {
  switch (decl.tag) {
    case "VarDecl":
    case "DefDecl": {
      if (globals.has(decl.name))
        return err({ tag: "DuplicateGlobal", name: decl.name, range: decl.nameRange });
      const scoped = checkBinders(decl.binders, emptyScope, globals);
      if (isErr(scoped)) return scoped;
      const typeRes = checkTerm(decl.typeTerm, scoped.succ, globals);
      if (isErr(typeRes)) return typeRes;
      return decl.tag === "DefDecl"
        ? checkTerm(decl.body, scoped.succ, globals)
        : succ(unit);
    }

    case "EvalDecl":
      return checkTerm(decl.term, emptyScope, globals);
  }
};

export const checkProgram = (program: AST.Program): Result<Unit, ScopeError> => {
  let globals: Scope = emptyScope;
  for (const decl of program) {
    const res = checkDecl(decl, globals);
    if (isErr(res)) return res;
    if (decl.tag === "VarDecl" || decl.tag === "DefDecl")
      globals = extend(globals, [decl.name]);
  }
  return succ(unit);
};