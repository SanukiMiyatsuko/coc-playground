import * as SA from "./surface-ast";
import * as DA from "./desugared-ast";

const ANON = "_";

/** TODO */

export const desugarDecl = (decl: SA.Decl): DA.Decl => {
  /** TODO */
};

export const desugarProgram = (program: SA.Program): DA.Program =>
  program.map(desugarDecl);