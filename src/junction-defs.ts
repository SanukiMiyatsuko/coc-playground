export type Position = { line: number; character: number };
export type Range = { start: Position; end: Position };

export type Succ<A> = { tag: "succ"; succ: A }
export type Err<B> = { tag: "err"; err: B };
export type Result<A, B> = Succ<A> | Err<B>

export const succ = <A>(succ: A): Succ<A> => ({ tag: "succ", succ });
export const err = <B>(err: B): Err<B> => ({ tag: "err", err });

export const isSucc = <A, B>(vali: Result<A, B>): vali is Succ<A> => vali.tag === "succ";
export const isErr = <A, B>(vali: Result<A, B>): vali is Err<B> => vali.tag === "err";

export type Unit = { tag: "Unit" };
export const unit: Unit = { tag: "Unit" };