// Motor mínimo de fórmulas de Excel para correr los cotizadores de GMM tal como
// vienen de la aseguradora: se cargan las celdas (scripts/gmm-excel-a-json.py),
// se sobreescriben las celdas de captura y se evalúan las fórmulas bajo demanda.

export type Valor = number | string | boolean | null | ErrorExcel;
type Celda = Valor | [string, Valor];

export interface LibroJson {
  nombres: Record<string, string>;
  hojas: Record<string, Record<string, Celda>>;
}

export class ErrorExcel {
  constructor(readonly codigo: string) {}
  toString() {
    return this.codigo;
  }
}
const NA = new ErrorExcel("#N/A");
const VALOR = new ErrorExcel("#VALUE!");
const REF = new ErrorExcel("#REF!");
const DIV0 = new ErrorExcel("#DIV/0!");
const NOMBRE = new ErrorExcel("#NAME?");

interface Rango {
  hoja: string;
  c1: number;
  f1: number;
  c2: number;
  f2: number;
}

type Nodo =
  | { t: "val"; v: Valor }
  | { t: "ref"; r: Rango }
  | { t: "nombre"; n: string }
  | { t: "fn"; n: string; a: Nodo[] }
  | { t: "op"; o: string; a: Nodo; b: Nodo }
  | { t: "un"; o: string; a: Nodo };

const esError = (v: unknown): v is ErrorExcel => v instanceof ErrorExcel;

function colANum(c: string): number {
  let n = 0;
  for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function numACol(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const dir = (c: number, f: number) => `${numACol(c)}${f}`;

function parseDir(s: string): { c: number; f: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(s.toUpperCase());
  return m ? { c: colANum(m[1]), f: Number(m[2]) } : null;
}

// ---------- Tokenizador y parser ----------

type Token = { k: string; v: string };

const ERRORES_LIT = ["#REF!", "#N/A", "#VALUE!", "#DIV/0!", "#NAME?", "#NUM!", "#NULL!"];

function tokenizar(f: string): Token[] {
  const t: Token[] = [];
  let i = 0;
  while (i < f.length) {
    const ch = f[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      i++;
      continue;
    }
    if (ch === '"') {
      let s = "";
      i++;
      while (i < f.length) {
        if (f[i] === '"') {
          if (f[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          break;
        }
        s += f[i++];
      }
      i++;
      t.push({ k: "str", v: s });
      continue;
    }
    if (ch === "#") {
      const e = ERRORES_LIT.find((x) => f.startsWith(x, i));
      if (!e) throw new Error(`Error literal desconocido en ${f}`);
      t.push({ k: "err", v: e });
      i += e.length;
      continue;
    }
    if (ch === "'") {
      let s = "";
      i++;
      while (i < f.length) {
        if (f[i] === "'") {
          if (f[i + 1] === "'") {
            s += "'";
            i += 2;
            continue;
          }
          break;
        }
        s += f[i++];
      }
      i++; // cierra '
      if (f[i] !== "!") throw new Error(`Hoja sin ! en ${f}`);
      i++;
      t.push({ k: "hoja", v: s });
      continue;
    }
    const dos = f.slice(i, i + 2);
    if (dos === "<>" || dos === "<=" || dos === ">=") {
      t.push({ k: "op", v: dos });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>%".includes(ch)) {
      t.push({ k: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "," || ch === ";" || ch === ":") {
      t.push({ k: ch === ";" ? "," : ch, v: ch });
      i++;
      continue;
    }
    const num = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(f.slice(i));
    if (num && !/^\d+[A-Za-z_]/.test(f.slice(i))) {
      t.push({ k: "num", v: num[0] });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_\\\u00C0-\u024F$][A-Za-z0-9_.\u00C0-\u024F$]*/.exec(f.slice(i));
    if (id) {
      i += id[0].length;
      if (f[i] === "!") {
        t.push({ k: "hoja", v: id[0] });
        i++;
      } else t.push({ k: "id", v: id[0] });
      continue;
    }
    throw new Error(`Carácter inesperado '${ch}' en ${f}`);
  }
  return t;
}

class Parser {
  private p = 0;
  constructor(
    private t: Token[],
    private hoja: string,
  ) {}
  private ver() {
    return this.t[this.p];
  }
  private tomar() {
    return this.t[this.p++];
  }
  parse(): Nodo {
    const n = this.comparacion();
    if (this.p < this.t.length) throw new Error("Tokens sobrantes");
    return n;
  }
  private comparacion(): Nodo {
    let a = this.concat();
    while (this.ver()?.k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(this.ver().v)) {
      const o = this.tomar().v;
      a = { t: "op", o, a, b: this.concat() };
    }
    return a;
  }
  private concat(): Nodo {
    let a = this.suma();
    while (this.ver()?.k === "op" && this.ver().v === "&") {
      this.tomar();
      a = { t: "op", o: "&", a, b: this.suma() };
    }
    return a;
  }
  private suma(): Nodo {
    let a = this.producto();
    while (this.ver()?.k === "op" && (this.ver().v === "+" || this.ver().v === "-")) {
      const o = this.tomar().v;
      a = { t: "op", o, a, b: this.producto() };
    }
    return a;
  }
  private producto(): Nodo {
    let a = this.potencia();
    while (this.ver()?.k === "op" && (this.ver().v === "*" || this.ver().v === "/")) {
      const o = this.tomar().v;
      a = { t: "op", o, a, b: this.potencia() };
    }
    return a;
  }
  private potencia(): Nodo {
    let a = this.unario();
    while (this.ver()?.k === "op" && this.ver().v === "^") {
      this.tomar();
      a = { t: "op", o: "^", a, b: this.unario() };
    }
    return a;
  }
  private unario(): Nodo {
    const tk = this.ver();
    if (tk?.k === "op" && (tk.v === "-" || tk.v === "+")) {
      this.tomar();
      return { t: "un", o: tk.v, a: this.unario() };
    }
    let n = this.primario();
    while (this.ver()?.k === "op" && this.ver().v === "%") {
      this.tomar();
      n = { t: "op", o: "/", a: n, b: { t: "val", v: 100 } };
    }
    return n;
  }
  private primario(): Nodo {
    const tk = this.tomar();
    if (!tk) throw new Error("Fórmula incompleta");
    if (tk.k === "num") return { t: "val", v: Number(tk.v) };
    if (tk.k === "str") return { t: "val", v: tk.v };
    if (tk.k === "err") return { t: "val", v: new ErrorExcel(tk.v) };
    if (tk.k === "(") {
      const n = this.comparacion();
      this.tomar();
      return n;
    }
    if (tk.k === "hoja") {
      const sig = this.tomar();
      if (sig.k === "err") return { t: "val", v: REF };
      return this.referencia(sig.v, tk.v);
    }
    if (tk.k === "id") {
      if (this.ver()?.k === "(") {
        this.tomar();
        const a: Nodo[] = [];
        if (this.ver()?.k !== ")") {
          for (;;) {
            if (this.ver()?.k === "," || this.ver()?.k === ")") a.push({ t: "val", v: null });
            else a.push(this.comparacion());
            if (this.ver()?.k === ",") {
              this.tomar();
              continue;
            }
            break;
          }
        }
        this.tomar(); // )
        return { t: "fn", n: tk.v.toUpperCase(), a };
      }
      const up = tk.v.toUpperCase();
      if (up === "TRUE" || up === "VERDADERO") return { t: "val", v: true };
      if (up === "FALSE" || up === "FALSO") return { t: "val", v: false };
      if (parseDir(tk.v)) return this.referencia(tk.v, this.hoja);
      return { t: "nombre", n: up };
    }
    throw new Error(`Token inesperado ${tk.v}`);
  }
  private referencia(a: string, hoja: string): Nodo {
    const d1 = parseDir(a);
    if (!d1) return { t: "nombre", n: a.toUpperCase() };
    let d2 = d1;
    if (this.ver()?.k === ":") {
      this.tomar();
      const sig = this.tomar();
      const p = parseDir(sig.v);
      if (!p) throw new Error(`Rango inválido ${a}:${sig.v}`);
      d2 = p;
    }
    return {
      t: "ref",
      r: {
        hoja,
        c1: Math.min(d1.c, d2.c),
        f1: Math.min(d1.f, d2.f),
        c2: Math.max(d1.c, d2.c),
        f2: Math.max(d1.f, d2.f),
      },
    };
  }
}

// ---------- Coerciones ----------

function aNumero(v: Valor): number | ErrorExcel {
  if (esError(v)) return v;
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = v.trim().replace(/[$,]/g, "");
  const pct = s.endsWith("%");
  const n = Number(pct ? s.slice(0, -1) : s);
  if (s === "" || Number.isNaN(n)) return VALOR;
  return pct ? n / 100 : n;
}

function aTexto(v: Valor): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(Number(v.toPrecision(15)));
  return String(v);
}

function aBool(v: Valor): boolean | ErrorExcel {
  if (esError(v)) return v;
  if (typeof v === "boolean") return v;
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  const u = v.toUpperCase();
  if (u === "TRUE" || u === "VERDADERO") return true;
  if (u === "FALSE" || u === "FALSO") return false;
  return VALOR;
}

const tipo = (v: Valor) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);

function comparar(a: Valor, b: Valor): number {
  if (a === null) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
  if (b === null) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
  const ta = tipo(a);
  const tb = tipo(b);
  if (ta !== tb) return ta - tb;
  if (typeof a === "string") {
    const x = a.toUpperCase();
    const y = (b as string).toUpperCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = Number(a);
  const y = Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function redondear(n: number, d: number): number {
  const f = Math.pow(10, d);
  const x = Math.abs(n) * f;
  const r = Math.round(Number(x.toPrecision(15)));
  return (Math.sign(n) * r) / f;
}

// ---------- Libro ----------

type Resultado = Valor | Rango;

export class LibroExcel {
  private cache = new Map<string, Valor>();
  private ast = new Map<string, Nodo>();
  private entradas = new Map<string, Valor>();
  private enCurso = new Set<string>();
  private hojasMayus = new Map<string, string>();

  constructor(
    private libro: LibroJson,
    private hoy = new Date(),
  ) {
    for (const h of Object.keys(libro.hojas)) this.hojasMayus.set(h.toUpperCase(), h);
  }

  // Fija el valor de una celda de captura ("HOJA!D10").
  poner(celda: string, v: Valor) {
    const [h, d] = this.separar(celda);
    this.entradas.set(`${h}!${d}`, v);
    this.cache.clear();
  }

  valor(celda: string): Valor {
    const [h, d] = this.separar(celda);
    return this.celda(h, d);
  }

  // Valor que Excel guardó al cerrar el archivo (para pruebas del motor).
  guardado(celda: string): Valor | undefined {
    const [h, d] = this.separar(celda);
    const c = this.libro.hojas[h]?.[d];
    return Array.isArray(c) ? c[1] : c;
  }

  formulas(): string[] {
    const r: string[] = [];
    for (const [h, celdas] of Object.entries(this.libro.hojas))
      for (const [d, c] of Object.entries(celdas)) if (Array.isArray(c)) r.push(`${h}!${d}`);
    return r;
  }

  private separar(celda: string): [string, string] {
    const i = celda.lastIndexOf("!");
    const h = this.hojasMayus.get(celda.slice(0, i).toUpperCase()) ?? celda.slice(0, i);
    return [h, celda.slice(i + 1).replace(/\$/g, "").toUpperCase()];
  }

  private celda(h: string, d: string): Valor {
    const k = `${h}!${d}`;
    if (this.entradas.has(k)) return this.entradas.get(k)!;
    if (this.cache.has(k)) return this.cache.get(k)!;
    const c = this.libro.hojas[h]?.[d];
    if (c === undefined) return this.libro.hojas[h] ? null : REF;
    if (!Array.isArray(c)) return c;
    if (c[1] === c[0]) return c[0]; // Excel la guardó como texto, no como fórmula
    if (this.enCurso.has(k)) return c[1]; // referencia circular: valor guardado
    this.enCurso.add(k);
    let v: Valor;
    try {
      let n = this.ast.get(k);
      if (!n) {
        n = new Parser(tokenizar(c[0].slice(1)), h).parse();
        this.ast.set(k, n);
      }
      v = this.escalar(this.evaluar(n, h, d));
    } finally {
      this.enCurso.delete(k);
    }
    if (v === null) v = 0;
    this.cache.set(k, v);
    return v;
  }

  private rangoNombre(n: string): Rango | ErrorExcel {
    const def = this.libro.nombres[n];
    if (!def || def.includes("#REF!") || def.includes("[")) return def ? REF : NOMBRE;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/.exec(def);
    if (!m) return NOMBRE;
    const hoja = this.hojasMayus.get((m[1] ?? m[2]).replace(/''/g, "'").toUpperCase()) ?? m[2];
    const a = parseDir(m[3])!;
    const b = m[4] ? parseDir(m[4])! : a;
    return { hoja, c1: a.c, f1: a.f, c2: b.c, f2: b.f };
  }

  // Un rango usado donde se espera un valor: intersección implícita con la fila/columna actual.
  private escalar(r: Resultado, hoja?: string, d?: string): Valor {
    if (!r || typeof r !== "object" || esError(r)) return r as Valor;
    const g = r as Rango;
    const h = this.hojasMayus.get(g.hoja.toUpperCase()) ?? g.hoja;
    if (g.c1 === g.c2 && g.f1 === g.f2) return this.celda(h, dir(g.c1, g.f1));
    if (d) {
      const p = parseDir(d)!;
      if (g.c1 === g.c2 && p.f >= g.f1 && p.f <= g.f2) return this.celda(h, dir(g.c1, p.f));
      if (g.f1 === g.f2 && p.c >= g.c1 && p.c <= g.c2) return this.celda(h, dir(p.c, g.f1));
    }
    void hoja;
    return VALOR;
  }

  private valores(r: Resultado): Valor[] {
    if (r && typeof r === "object" && !esError(r)) {
      const g = r as Rango;
      const h = this.hojasMayus.get(g.hoja.toUpperCase()) ?? g.hoja;
      const out: Valor[] = [];
      for (let f = g.f1; f <= g.f2; f++)
        for (let c = g.c1; c <= g.c2; c++) out.push(this.celda(h, dir(c, f)));
      return out;
    }
    return [r as Valor];
  }

  private evaluar(n: Nodo, h: string, d: string): Resultado {
    switch (n.t) {
      case "val":
        return n.v;
      case "ref":
        return n.r;
      case "nombre": {
        const r = this.rangoNombre(n.n);
        return r;
      }
      case "un": {
        const base = this.escalar(this.evaluar(n.a, h, d), h, d);
        if (n.o === "+") return base;
        const v = aNumero(base);
        if (esError(v)) return v;
        return n.o === "-" ? -v : v;
      }
      case "op":
        return this.operador(n.o, this.escalar(this.evaluar(n.a, h, d), h, d), this.escalar(this.evaluar(n.b, h, d), h, d));
      case "fn":
        return this.funcion(n.n, n.a, h, d);
    }
  }

  private operador(o: string, a: Valor, b: Valor): Valor {
    if (esError(a)) return a;
    if (esError(b)) return b;
    if (o === "&") return aTexto(a) + aTexto(b);
    if (["=", "<>", "<", ">", "<=", ">="].includes(o)) {
      const c = comparar(a, b);
      return o === "=" ? c === 0 : o === "<>" ? c !== 0 : o === "<" ? c < 0 : o === ">" ? c > 0 : o === "<=" ? c <= 0 : c >= 0;
    }
    const x = aNumero(a);
    const y = aNumero(b);
    if (esError(x)) return x;
    if (esError(y)) return y;
    switch (o) {
      case "+":
        return x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        return y === 0 ? DIV0 : x / y;
      case "^":
        return Math.pow(x, y);
    }
    return VALOR;
  }

  private funcion(nombre: string, args: Nodo[], h: string, d: string): Resultado {
    const ev = (i: number) => (args[i] ? this.evaluar(args[i], h, d) : null);
    const esc = (i: number) => this.escalar(ev(i), h, d);
    switch (nombre) {
      case "IF":
      case "SI": {
        const c = aBool(esc(0));
        if (esError(c)) return c;
        if (c) return args.length > 1 ? esc(1) : true;
        return args.length > 2 ? esc(2) : false;
      }
      case "IFERROR":
      case "SI.ERROR": {
        const v = esc(0);
        return esError(v) ? esc(1) : v;
      }
      case "ISERROR":
      case "ESERROR":
        return esError(esc(0));
      case "AND":
      case "Y":
      case "OR":
      case "O": {
        const y = nombre === "AND" || nombre === "Y";
        let r = y;
        for (let i = 0; i < args.length; i++) {
          for (const v of this.valores(ev(i))) {
            if (v === null || typeof v === "string") {
              if (args[i].t === "ref" || args[i].t === "nombre") continue;
            }
            const b = aBool(v);
            if (esError(b)) return b;
            r = y ? r && b : r || b;
          }
        }
        return r;
      }
      case "SUM":
      case "SUMA":
      case "AVERAGE":
      case "PROMEDIO": {
        let s = 0;
        let k = 0;
        for (let i = 0; i < args.length; i++) {
          const esRango = args[i].t === "ref" || args[i].t === "nombre";
          for (const v of this.valores(ev(i))) {
            if (esError(v)) return v;
            if (esRango && typeof v !== "number") continue;
            const x = aNumero(v);
            if (esError(x)) return x;
            s += x;
            k++;
          }
        }
        if (nombre === "SUM" || nombre === "SUMA") return s;
        return k === 0 ? DIV0 : s / k;
      }
      case "ROUND":
      case "REDONDEAR": {
        const x = aNumero(esc(0));
        const y = aNumero(esc(1));
        if (esError(x)) return x;
        if (esError(y)) return y;
        return redondear(x, Math.trunc(y));
      }
      case "INT":
      case "ENTERO": {
        const x = aNumero(esc(0));
        return esError(x) ? x : Math.floor(x);
      }
      case "VALUE":
      case "VALOR": {
        return aNumero(esc(0));
      }
      case "CONCATENATE":
      case "CONCATENAR": {
        let s = "";
        for (let i = 0; i < args.length; i++) {
          const v = esc(i);
          if (esError(v)) return v;
          s += aTexto(v);
        }
        return s;
      }
      case "TODAY":
      case "HOY": {
        const t = this.hoy;
        return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
      }
      case "VLOOKUP":
      case "BUSCARV":
        return this.buscarv(esc(0), ev(1), esc(2), args.length > 3 ? esc(3) : true);
    }
    throw new Error(`Función no soportada: ${nombre}`);
  }

  private buscarv(buscado: Valor, tabla: Resultado, col: Valor, aprox: Valor): Valor {
    if (esError(buscado)) return buscado;
    if (esError(tabla)) return tabla;
    if (!tabla || typeof tabla !== "object") return NA;
    const g = tabla as Rango;
    const h = this.hojasMayus.get(g.hoja.toUpperCase()) ?? g.hoja;
    const c = aNumero(col);
    if (esError(c)) return c;
    if (c < 1 || c > g.c2 - g.c1 + 1) return REF;
    const exacto = aBool(aprox) === false;
    if (buscado === null) buscado = 0;
    let fila = -1;
    for (let f = g.f1; f <= g.f2; f++) {
      const v = this.celda(h, dir(g.c1, f));
      if (exacto) {
        if (v !== null && tipo(v) === tipo(buscado) && comparar(v, buscado) === 0) {
          fila = f;
          break;
        }
      } else {
        if (v === null || esError(v) || tipo(v) !== tipo(buscado)) continue;
        if (comparar(v, buscado) <= 0) fila = f;
        else break;
      }
    }
    if (fila < 0) return NA;
    const r = this.celda(h, dir(g.c1 + c - 1, fila));
    return r === null ? 0 : r;
  }
}
