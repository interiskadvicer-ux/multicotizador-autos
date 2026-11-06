interface ItemTexto {
  str: string;
  transform: number[];
  hasEOL?: boolean;
}

// Extrae el texto de un PDF renglón por renglón (agrupa por coordenada Y),
// para que número de póliza e importe queden en la misma línea.
export async function extraerTextoPdf(datos: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(datos),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const lineas: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      const renglones = new Map<number, { x: number; str: string }[]>();
      for (const item of contenido.items as ItemTexto[]) {
        if (!item.str?.trim()) continue;
        const y = Math.round(item.transform[5] / 2) * 2;
        const fila = renglones.get(y) ?? [];
        fila.push({ x: item.transform[4], str: item.str });
        renglones.set(y, fila);
      }
      Array.from(renglones.entries())
        .sort((a, b) => b[0] - a[0])
        .forEach(([, fila]) =>
          lineas.push(
            fila
              .sort((a, b) => a.x - b.x)
              .map((f) => f.str.trim())
              .join("  "),
          ),
        );
      pagina.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return lineas.join("\n");
}
