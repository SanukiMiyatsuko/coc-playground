import { type Result, succ, err, isErr, unit, type Unit, type Range } from "./junction-defs";
import * as AST from "./surface-ast";

export type ScopeError =
| { tag: "UndefinedVariable"; name: string; range: Range }
| { tag: "DuplicateGlobal"; name: string; range: Range }
| { tag: "UndefinedOperator"; name: string; range: Range };