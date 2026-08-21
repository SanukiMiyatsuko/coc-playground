type Sort = "prop" | "type"

type Term =
| { tag: "sort"; name: Sort }
| { tag: "free"; name: string }
| { tag: "bind"; idx: number }
| { tag: "lam"; type: Term; body: Term }
| { tag: "pi"; type: Term; body: Term }
| { tag: "arr"; dom: Term; cod: Term }
| { tag: "app"; fun: Term; arg: Term }
| { tag: "letin"; type: Term; def: Term; body: Term }

const sort = (name: Sort): Term => ({ tag: "sort", name });
const free = (name: string): Term => ({ tag: "free", name });
const bind = (idx: number): Term => ({ tag: "bind", idx });
const lam = (type: Term, body: Term): Term => ({ tag: "lam", type, body });
const pi = (type: Term, body: Term): Term => ({ tag: "pi", type, body });
const arr = (dom: Term, cod: Term): Term => ({ tag: "arr", dom, cod });
const app = (fun: Term, arg: Term): Term => ({ tag: "app", fun, arg });
const letin = (type: Term, def: Term, body: Term): Term => ({ tag: "letin", type, def, body });
