"""Convierte un cotizador de GMM en Excel a JSON para el motor de fórmulas del portal.

Uso: python3 scripts/gmm-excel-a-json.py ARCHIVO.xlsm SALIDA.json
Guarda cada celda con su valor o su fórmula (y el valor calculado por Excel, para pruebas).
"""
import datetime
import json
import sys

import openpyxl

EPOCA = datetime.datetime(1899, 12, 30)


def valor(v):
    if isinstance(v, datetime.datetime):
        return (v - EPOCA).total_seconds() / 86400
    if isinstance(v, datetime.date):
        return (datetime.datetime(v.year, v.month, v.day) - EPOCA).days
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    return str(v)


def main(origen, destino):
    wb = openpyxl.load_workbook(origen)
    wv = openpyxl.load_workbook(origen, data_only=True)
    salida = {"nombres": {}, "hojas": {}}
    for nombre, dn in wb.defined_names.items():
        salida["nombres"][nombre.upper()] = dn.attr_text
    for ws in wb.worksheets:
        celdas = {}
        vs = wv[ws.title]
        for fila in ws.iter_rows():
            for c in fila:
                if c.value is None:
                    continue
                v = c.value
                if isinstance(v, str) and v.startswith("=") and len(v) > 1:
                    celdas[c.coordinate] = [v, valor(vs[c.coordinate].value)]
                elif type(v).__name__ == "ArrayFormula":
                    celdas[c.coordinate] = [v.text, valor(vs[c.coordinate].value)]
                else:
                    celdas[c.coordinate] = valor(v)
        salida["hojas"][ws.title] = celdas
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
