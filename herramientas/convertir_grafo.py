#!/usr/bin/env python3
# convertir_grafo.py - Convierte graph.json (exportado por TsMap, ExportGraph) a grafo.bin (lo que lee ruta.js).
#
# Uso:   python convertir_grafo.py graph.json grafo.bin
#        python convertir_grafo.py graph.json grafo_corregido.bin --corregir-giros
#        python convertir_grafo.py graph.json grafo.bin --corregir-giros --sin-rebotes
#
# --corregir-giros (opcional, recomendado probarlo aparte): el export de TsMap trae ~14 700 giros de
#   prefab (de 375 413) con la orientacion invertida respecto a las carreteras de sentido unico que
#   llegan a sus extremos: un giro que EMPIEZA en un nodo donde solo sale una carretera de sentido unico
#   (nadie puede llegar ahi) o que TERMINA en un nodo donde solo desemboca una (nadie puede salir).
#   Con la opcion, esos giros se invierten. Ejemplo comprobado: en una ruta de Dakota del Sur el GPS
#   daba una vuelta de 28.3 km (x20 = 566 km) y, con los giros corregidos, 21.6 km (x20 = 431 km),
#   cerca de los 403 km del juego.
#
# --sin-rebotes (opcional): agrega al final de grafo.bin la lista de pares de giros prohibidos.
#   En un nodo, un giro de una pieza (cruce/union) que SALE por ese nodo seguido de un giro de la
#   MISMA pieza que vuelve a ENTRAR, cuando la carretera de antes y la de despues van en sentidos
#   opuestos (mas de 135 grados), es una vuelta en U que el juego no permite (ej.: union us_joint de
#   una calle de doble cuerpo). ruta.js, si encuentra la lista, calcula por tramos y se los salta.
#   Sin la opcion el .bin sale igual que antes.
#
# Solo usa la libreria estandar de Python (no hace falta instalar nada).
#
# Formato de grafo.bin (little-endian), el mismo que lee ruta.js:
#   'ATSG' | N u32 | E u32 | xs f32[N] | zs f32[N] | off u32[N+1] | tg u32[E] | ln f32[E] | fl u8[E] | cl u8[E] (opcional)
#   | relleno hasta multiplo de 4 | 'GIRO' | M u32 | pares u32[2M] (opcional, --sin-rebotes; exige cl)
#   pares: (arista que llega, arista que sale) prohibida, con indices de arista del .bin
#   fl: 0 = normal, 1 = oculto (carretera oculta o giro de prefab oculto), 2 = secreto
#   cl (solo si graph.json trae el arreglo "k"): clase de la arista, 0 sin clase (giros de prefab), 1 local,
#       2 dividida, 3 autopista (freeway), 4 no transitable (tren, sin vehiculos)
#
# Reglas (deducidas comparando con el grafo.bin anterior; ver contexto_gps_ats_termofreno.md):
#   - tipo 0 (carretera de doble sentido) -> 2 aristas (A->B y B->A)
#   - tipo 1 (giro de prefab) y tipo 2 (sentido unico inicio->fin) -> A->B
#   - tipo 3 (sentido unico fin->inicio) -> B->A
#   - fl = 2 si la arista es secreta; si no, fl = 1 si su origen "o" es distinto de 0; si no, 0
#   - se conservan las aristas duplicadas (como en el grafo.bin anterior)
#   - se descartan los vertices que no tocan ninguna arista (evita que el GPS se "pegue" a uno aislado)
# Diferencia conocida con el grafo.bin anterior: no se reproduce su filtro exacto de omision
# (aprox. 4 200 aristas de giros de prefab de menos en el anterior).

import json
import struct
import sys
from array import array


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opciones = [a for a in sys.argv[1:] if a.startswith("--")]
    corregir = "--corregir-giros" in opciones
    sin_rebotes = "--sin-rebotes" in opciones
    if len(args) != 2 or any(o not in ("--corregir-giros", "--sin-rebotes") for o in opciones):
        print("Uso: python convertir_grafo.py graph.json grafo.bin [--corregir-giros] [--sin-rebotes]")
        sys.exit(1)
    ruta_json, ruta_bin = args

    print("Leyendo", ruta_json, "...")
    with open(ruta_json, "r", encoding="utf-8") as f:
        d = json.load(f)

    v = d["v"]            # [x0, z0, x1, z1, ...]
    e = d["e"]            # [a, b, tipo, secreta, largo, a, b, ...]
    o = d.get("o")        # origen de cada arista (puede no existir en exports viejos)
    kcl = d.get("k")      # clase de cada arista (puede no existir en exports viejos)
    nv = len(v) // 2
    ne = len(e) // 5
    if o is not None and len(o) != ne:
        print("ERROR: 'o' tiene", len(o), "elementos y hay", ne, "aristas")
        sys.exit(1)
    if kcl is not None and len(kcl) != ne:
        print("ERROR: 'k' tiene", len(kcl), "elementos y hay", ne, "aristas")
        sys.exit(1)
    print("Vertices:", nv, " Aristas (json):", ne)

    # 0) (opcional) para cada vertice: llega / sale una carretera de sentido unico
    #    solo_llega = solo desemboca alli una carretera de sentido unico; solo_sale = solo sale una
    solo_llega = solo_sale = None
    if corregir:
        r_in = bytearray(nv)
        r_out = bytearray(nv)
        for i in range(ne):
            tipo = int(e[5 * i + 2])
            if tipo == 1:
                continue
            a = int(e[5 * i])
            b = int(e[5 * i + 1])
            if tipo == 0:
                r_in[a] = r_in[b] = r_out[a] = r_out[b] = 1
            elif tipo == 2:
                r_out[a] = 1
                r_in[b] = 1
            else:  # 3
                r_out[b] = 1
                r_in[a] = 1
        solo_llega = [bool(r_in[i]) and not r_out[i] for i in range(nv)]
        solo_sale = [bool(r_out[i]) and not r_in[i] for i in range(nv)]
    invertidos = 0

    # 1) aristas dirigidas: origen, destino, largo, marca
    src = array("I")
    dst = array("I")
    largo = array("f")
    marca = array("B")
    clase = array("B")
    origen_json = array("I")   # indice de la arista en graph.json (para --sin-rebotes)
    for i in range(ne):
        a = int(e[5 * i])
        b = int(e[5 * i + 1])
        tipo = int(e[5 * i + 2])
        secreta = int(e[5 * i + 3])
        ln = float(e[5 * i + 4])
        if secreta:
            fl = 2
        elif o is not None and o[i] != 0:
            fl = 1
        else:
            fl = 0
        if tipo == 0:
            pares = ((a, b), (b, a))
        elif tipo == 3:
            pares = ((b, a),)
        elif tipo == 1:
            if corregir and (solo_sale[a] or solo_llega[b]):
                pares = ((b, a),)
                invertidos += 1
            else:
                pares = ((a, b),)
        else:  # 2
            pares = ((a, b),)
        for s, t in pares:
            src.append(s)
            dst.append(t)
            largo.append(ln)
            marca.append(fl)
            clase.append(int(kcl[i]) if kcl is not None else 0)
            origen_json.append(i)
    E = len(src)
    print("Aristas dirigidas:", E)
    if corregir:
        print("Giros de prefab invertidos (--corregir-giros):", invertidos)

    # 2) vertices usados (se conserva el orden original) y renumeracion
    usado = bytearray(nv)
    for s in src:
        usado[s] = 1
    for t in dst:
        usado[t] = 1
    nuevo = array("i", [-1]) * nv
    xs = array("f")
    zs = array("f")
    n = 0
    for i in range(nv):
        if usado[i]:
            nuevo[i] = n
            xs.append(v[2 * i])
            zs.append(v[2 * i + 1])
            n += 1
    N = n
    print("Vertices usados:", N, "(descartados sin aristas:", nv - N, ")")

    # 3) CSR: aristas agrupadas por vertice de origen (orden estable)
    cuenta = [0] * (N + 1)
    for s in src:
        cuenta[nuevo[s] + 1] += 1
    for i in range(N):
        cuenta[i + 1] += cuenta[i]
    off = array("I", cuenta)
    pos = cuenta[:]  # siguiente hueco de cada vertice
    tg = array("I", [0]) * E
    ln_out = array("f", [0.0]) * E
    fl_out = array("B", [0]) * E
    cl_out = array("B", [0]) * E
    lugar = array("I", [0]) * E   # arista dirigida k -> su posicion en el .bin
    for k in range(E):
        s = nuevo[src[k]]
        p = pos[s]
        pos[s] = p + 1
        lugar[k] = p
        tg[p] = nuevo[dst[k]]
        ln_out[p] = largo[k]
        fl_out[p] = marca[k]
        cl_out[p] = clase[k]

    # 3b) (opcional) pares de giros prohibidos ("rebotes": salir de una pieza y volver a entrar)
    prohibidos = array("I")
    if sin_rebotes:
        prohibidos = buscar_rebotes(d, src, dst, origen_json, lugar)
        print("Pares de giros prohibidos (--sin-rebotes):", len(prohibidos) // 2)

    # 4) escribir (little-endian siempre)
    def le(arr):
        a = array(arr.typecode, arr)
        if sys.byteorder == "big":
            a.byteswap()
        return a.tobytes()

    with open(ruta_bin, "wb") as f:
        f.write(b"ATSG")
        f.write(struct.pack("<II", N, E))
        f.write(le(xs))
        f.write(le(zs))
        f.write(le(off))
        f.write(le(tg))
        f.write(le(ln_out))
        f.write(bytes(fl_out))
        if kcl is not None or sin_rebotes:
            f.write(bytes(cl_out))
        if sin_rebotes:
            hasta = 12 + 8 * N + 4 * (N + 1) + 8 * E + 2 * E
            f.write(b"\0" * ((4 - hasta % 4) % 4))
            f.write(b"GIRO")
            f.write(struct.pack("<I", len(prohibidos) // 2))
            f.write(le(prohibidos))

    esperado = 12 + 8 * N + 4 * (N + 1) + 8 * E + E + (E if (kcl is not None or sin_rebotes) else 0)
    if sin_rebotes:
        esperado += (4 - esperado % 4) % 4 + 8 + 4 * len(prohibidos)
    print("Escrito", ruta_bin, "-", esperado, "bytes")
    print("Aristas: normales", fl_out.count(0), " ocultas", fl_out.count(1), " secretas", fl_out.count(2))
    if kcl is not None:
        print("Clases: sin clase", cl_out.count(0), " local", cl_out.count(1), " dividida", cl_out.count(2),
              " autopista", cl_out.count(3), " no transitable", cl_out.count(4))
    else:
        print("graph.json sin arreglo 'k': el .bin se escribe sin clases (formato anterior)")
    sin_salida = sum(1 for i in range(N) if off[i] == off[i + 1])
    print("Vertices sin salida:", sin_salida)


def buscar_rebotes(d, src, dst, origen_json, lugar):
    """Pares (arista que llega a b, arista que sale de b) prohibidos: ambas son giros de la MISMA pieza
    y el tramo que llega al inicio del primero (carretera u otra pieza) va en sentido opuesto (> 135 grados)
    al que sale del final del segundo (o el segundo vuelve al mismo nodo de donde salio el primero)."""
    import math
    v, e, p, g = d["v"], d["e"], d["p"], d.get("g", {})
    nombres = d.get("n", [])
    def es_vuelta_u(pf):   # piezas hechas para dar la vuelta (u-turn) o gasolineras
        n = (nombres[pf] or "").lower() if 0 <= pf < len(nombres) else ""
        return "u-turn" in n or "u_turn" in n or "uturn" in n or "gasstation" in n
    def es_union(pf):      # uniones y cambios de tipo de carretera: tramos rectos donde no se puede girar
        n = (nombres[pf] or "").lower().split("/")[-1] if 0 <= pf < len(nombres) else ""
        return "joint" in n or n.startswith("us_change") or "_change_" in n
    X = lambda u: v[2 * u]
    Z = lambda u: v[2 * u + 1]

    def extremos(i, s):
        pts = g.get(str(i))
        if not pts or len(pts) < 4:
            return None
        P = [(pts[k], pts[k + 1]) for k in range(0, len(pts), 2)]
        if math.hypot(P[0][0] - X(s), P[0][1] - Z(s)) > math.hypot(P[-1][0] - X(s), P[-1][1] - Z(s)):
            P = P[::-1]
        return P

    def unit(x1, z1, x2, z2):
        n = math.hypot(x2 - x1, z2 - z1)
        return ((x2 - x1) / n, (z2 - z1) / n) if n > 0 else None

    llega = {}   # nodo -> [(direccion, pieza)] de los tramos que llegan (pieza -1 = carretera)
    sale = {}    # nodo -> [(direccion, pieza)] de los tramos que salen
    entra_giro = {}   # nodo -> [(k, nodo de origen, pieza)]
    llegan_a = {}     # nodo -> [k] de todas las aristas que llegan
    sale_giro = {}    # nodo -> [(k, nodo destino, pieza)]
    for k in range(len(src)):
        s, t, i = src[k], dst[k], origen_json[k]
        llegan_a.setdefault(t, []).append(k)
        pf = -1
        if e[5 * i + 2] == 1:
            pf = p[i]
            entra_giro.setdefault(t, []).append((k, s, pf))
            sale_giro.setdefault(s, []).append((k, t, pf))
            P = None
        else:
            P = extremos(i, s)
        a = unit(*P[-2], *P[-1]) if P else unit(X(s), Z(s), X(t), Z(t))
        b = unit(*P[0], *P[1]) if P else unit(X(s), Z(s), X(t), Z(t))
        if a:
            llega.setdefault(t, []).append((a, pf))
        if b:
            sale.setdefault(s, []).append((b, pf))
    lim = math.cos(math.radians(135))
    pares = array("I")
    # (a) un solo giro de una UNION (joint/change) que deja el camion en sentido contrario (giro de union
    #     mal exportado que --corregir-giros volteo y quedo como atajo entre los dos cuerpos de una calle
    #     dividida): se prohibe llegar a el desde cualquier tramo. En cruces no se aplica: ahi una vuelta
    #     muy cerrada puede ser legal (cruces en angulo agudo).
    sueltos = 0
    for b, ent in entra_giro.items():
        for k1, a, pf1 in ent:
            if es_vuelta_u(pf1) or not es_union(pf1) or a == b:
                continue
            ri = [u for u, q in llega.get(a, ()) if q != pf1]
            ro = [w for w, q in sale.get(b, ()) if q != pf1]
            if not ri or not ro:
                continue
            if max(u[0] * w[0] + u[1] * w[1] for u in ri for w in ro) >= lim:
                continue
            sueltos += 1
            for k0 in llegan_a.get(a, ()):
                pares.append(lugar[k0])
                pares.append(lugar[k1])
    print("  giros sueltos en sentido contrario:", sueltos)
    # (b) dos giros de la misma pieza: sale por b y vuelve a entrar
    for b, ent in entra_giro.items():
        sal = sale_giro.get(b)
        if not sal:
            continue
        for k1, a, pf1 in ent:
            for k2, c, pf2 in sal:
                if pf1 != pf2:
                    continue
                if a != c:
                    ri = [u for u, q in llega.get(a, ()) if q != pf1]
                    ro = [w for w, q in sale.get(c, ()) if q != pf1]
                    if not ri or not ro:
                        continue
                    if max(u[0] * w[0] + u[1] * w[1] for u in ri for w in ro) >= lim:
                        continue
                pares.append(lugar[k1])
                pares.append(lugar[k2])
    return pares


if __name__ == "__main__":
    main()
