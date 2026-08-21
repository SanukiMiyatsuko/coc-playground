import { type Result, succ, err, isErr, unit, type Unit, type Range } from "./junction-defs";
import * as AST from "./surface-ast";

export type ScopeError =
  | { tag: "UnboundVariable"; name: string; range: Range }
  | { tag: "SelfReference"; name: string; range: Range }
  | { tag: "DuplicateGlobalName"; name: string; range: Range; firstRange: Range };

type Locals = readonly string[];

const hasLocal = (locals: Locals, name: string): boolean => locals.includes(name);

function checkIdent(
  name: string,
  range: Range,
  locals: Locals,
  globals: ReadonlySet<string>,
  beingDefined: readonly string[],
): Result<Unit, ScopeError> {
  if (hasLocal(locals, name) || globals.has(name)) return succ(unit);
  if (beingDefined.includes(name)) return err({ tag: "SelfReference", name, range });
  return err({ tag: "UnboundVariable", name, range });
}

function checkBinders(
  binders: readonly AST.Binder[],
  locals: Locals,
  globals: ReadonlySet<string>,
  beingDefined: readonly string[],
): Result<Locals, ScopeError> {
  let cur = locals;
  for (const binder of binders) {
    const r = checkTerm(binder.typeTerm, cur, globals, beingDefined);
    if (isErr(r)) return r;
    cur = [...binder.names, ...cur];
  }
  return succ(cur);
}

function checkTerm(
  term: AST.Term,
  locals: Locals,
  globals: ReadonlySet<string>,
  beingDefined: readonly string[],
): Result<Unit, ScopeError> {
  switch (term.tag) {
    case "Sort":
      return succ(unit);

    case "Ident":
      return checkIdent(term.name, term.range, locals, globals, beingDefined);

    case "LamTerm":
    case "PiTerm": {
      const bindersRes = checkBinders(term.binders, locals, globals, beingDefined);
      if (isErr(bindersRes)) return bindersRes;
      return checkTerm(term.body, bindersRes.succ, globals, beingDefined);
    }

    case "LetTerm": {
      const selfPending = [...beingDefined, term.name];

      const bindersRes = checkBinders(term.binders, locals, globals, selfPending);
      if (isErr(bindersRes)) return bindersRes;
      const innerLocals = bindersRes.succ;

      const typeRes = checkTerm(term.typeTerm, innerLocals, globals, selfPending);
      if (isErr(typeRes)) return typeRes;

      const valueRes = checkTerm(term.value, innerLocals, globals, selfPending);
      if (isErr(valueRes)) return valueRes;

      const bodyLocals = [term.name, ...locals];
      return checkTerm(term.inTerm, bodyLocals, globals, beingDefined);
    }

    case "ArrowTerm":
    case "AppTerm": {
      const fstRes = checkTerm(term.fst, locals, globals, beingDefined);
      if (isErr(fstRes)) return fstRes;
      for (const t of term.other) {
        const r = checkTerm(t, locals, globals, beingDefined);
        if (isErr(r)) return r;
      }
      return succ(unit);
    }
  }
}

function checkDecl(
  decl: AST.Decl,
  globals: ReadonlySet<string>,
): Result<Unit, ScopeError> {
  switch (decl.tag) {
    case "VarDecl": {
      const selfPending = [decl.name];
      const bindersRes = checkBinders(decl.binders, [], globals, selfPending);
      if (isErr(bindersRes)) return bindersRes;
      return checkTerm(decl.typeTerm, bindersRes.succ, globals, selfPending);
    }

    case "DefDecl": {
      const selfPending = [decl.name];
      const bindersRes = checkBinders(decl.binders, [], globals, selfPending);
      if (isErr(bindersRes)) return bindersRes;
      const innerLocals = bindersRes.succ;

      const typeRes = checkTerm(decl.typeTerm, innerLocals, globals, selfPending);
      if (isErr(typeRes)) return typeRes;

      return checkTerm(decl.body, innerLocals, globals, selfPending);
    }

    case "EvalDecl":
      return checkTerm(decl.term, [], globals, []);
  }
}

export function scopeCheckProgram(program: AST.Program): Result<Unit, ScopeError> {
  const globals = new Set<string>();
  const declaredAt = new Map<string, Range>();

  for (const decl of program) {
    const r = checkDecl(decl, globals);
    if (isErr(r)) return r;

    if (decl.tag === "VarDecl" || decl.tag === "DefDecl") {
      const prev = declaredAt.get(decl.name);
      if (prev !== undefined)
        return err({
          tag: "DuplicateGlobalName",
          name: decl.name,
          range: decl.nameRange,
          firstRange: prev,
        });
      globals.add(decl.name);
      declaredAt.set(decl.name, decl.nameRange);
    }
  }

  return succ(unit);
}