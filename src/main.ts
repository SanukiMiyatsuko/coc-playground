import { type Result, succ, err, isErr } from "./junction-defs";
import { type TokenizerError, Tokenizer } from "./tokenizer";
import { type ParserError, Parser } from "./parser";
import { type ScopeError, scopeCheckProgram } from "./scope-check";
import { desugarProgram } from "./desugar";
import { elabGlobalContext } from "./desugared-to-core";
import { type TypeError, wellFormedGlobal } from "./typecheck";

const program =
`def Truth: Prop := forall A: Prop, A -> A

def id: Truth := fun (A : Prop) (x : A) => x

def Eq (A : Prop) (a b : A) : Prop := forall P : A -> Prop, P a -> P b

def subst_Eq (A : Prop) (P : A -> Prop) (a b : A) (eq : Eq A a b) (pa : P a) : P b :=
  eq P pa

def ref_Eq (A : Prop) (a : A) : Eq A a a := fun P : A -> Prop => id (P a)

def symm_Eq (A : Prop) (a b : A) : Eq A a b -> Eq A b a :=
  fun (eqab : Eq A a b) (P : A -> Prop) =>
    let q : (P a -> P a) -> P b -> P a := eqab (fun x : A => P x -> P a) in
    q (id (P a))

def trans_Eq (A : Prop) (a b c : A) : Eq A a b -> Eq A b c -> Eq A a c :=
  fun (eqab : Eq A a b)
    (eqbc : Eq A b c)
    (P : A -> Prop)
    (pa : P a) =>
    eqbc P (eqab P pa)

def fun_Eq (A B : Prop) (f g : A -> B) : Prop :=
  forall a : A, Eq B (f a) (g a)

def Fun_Eq (A B : Prop) (f g : A -> B) : Prop :=
  Eq (A -> B) f g

def F_to_f (A B : Prop) (f g : A -> B) : Fun_Eq A B f g -> fun_Eq A B f g :=
  fun (F : Fun_Eq A B f g)
    (a : A)
    (R : B -> Prop) =>
    F (fun h : A -> B => R (h a))`

function runner(text: string) {
  const tokens = Tokenizer.mkTokens(text);
  if (isErr(tokens)) return "tokenize";
  const parsed = Parser.parseProgram(tokens.succ);
  if (isErr(parsed)) return `message : ${parsed.err.tag}, char : ${parsed.err.pos.character}, line : ${parsed.err.pos.line}` ;
  const checked = scopeCheckProgram(parsed.succ);
  if (isErr(checked)) return "scope";
  const desugared = desugarProgram(parsed.succ);
  const core = elabGlobalContext(desugared);
  const well = wellFormedGlobal(core);
  if (isErr(well)) return "typecheck";
  return "ok";
}

console.log(runner(program));