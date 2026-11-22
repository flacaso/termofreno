# Genera las frases del GPS y los avisos con ElevenLabs, en DOS voces:
#   voz_elevenlabs/hombre/  y  voz_elevenlabs/mujer/   (66 mp3 por voz, 132 en total)
#
# Uso: doble clic en generar_voz.bat  (o:  python generar_voz.py)
#  1. La primera vez te pide tu clave de API de ElevenLabs (elevenlabs.io -> tu perfil -> API Keys)
#     y que elijas una voz de hombre y una de mujer de "Mis voces" de tu cuenta.
#     Lo guarda en tu carpeta de usuario (C:\Users\TU_NOMBRE\termofreno_elevenlabs.json),
#     fuera del proyecto, para que tu clave nunca se suba a GitHub ni vaya en el .zip.
#  2. Genera primero dos frases de cada voz para que las escuches y confirmes.
#     Puedes cambiar el tono, la velocidad y la emocion en la seccion AJUSTES DE VOZ (abajo).
#  3. Genera el resto. Si un archivo ya existe lo salta; para regenerar uno, borralo.
#  4. Al final copia TODO lo de voz_elevenlabs/ dentro de ats-gps/voz/ (reemplazando).
#
# Gasta unos 5 700 creditos para las dos voces (el plan gratis da 10 000 al mes).
# Plan gratis de ElevenLabs: solo uso NO comercial y hay que dar credito a "elevenlabs.io".
import json, os, time
import requests

# =====================================================================
#  AJUSTES DE VOZ  (cambia aqui; si ya generaste voces, el programa te
#  pregunta si borrarlas para hacerlas de nuevo con los ajustes nuevos)
# =====================================================================

# Modelo:
#   "eleven_v4"              -> el mas nuevo y expresivo; acepta ETIQUETAS de emocion (abajo).
#   "eleven_v3"              -> el anterior expresivo; tambien acepta etiquetas.
#   "eleven_multilingual_v2" -> el clasico, muy estable en espanol (sin etiquetas).
MODELO = "eleven_v4"

# Ajustes de cada voz (los mismos controles de la pagina de ElevenLabs):
#   stability        0 a 1. Bajo = mas expresiva y variable; alto = mas pareja.
#                    Con eleven_v3 solo vale 0 (creativa), 0.5 (natural) o 1 (robusta).
#   similarity_boost 0 a 1. Que tanto se parece a la voz original (alto puede meter ruido).
#   style            0 a 1. Exagera el estilo propio de la voz (0 = nada).
#   speed            1.0 = normal; 0.9 = mas lenta; 1.1 = mas rapida.
AJUSTES = {
    "hombre": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "speed": 0.95},
    "mujer":  {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "speed": 0.95},
}

# Etiquetas de emocion: SOLO funcionan con MODELO = "eleven_v4" o "eleven_v3" (con el clasico se ignoran).
# Se ponen al inicio de la frase, por ejemplo "[serious]", "[calm]", "[urgent]", "[excited]".
# Estan en ingles porque asi vienen en la guia de ElevenLabs; en espanol quiza tambien funcionen.
# Deja "" para no poner etiqueta.
ETIQUETAS = {
    "guia":    "",            # indicaciones de giro, llegada, recalculando, inicio
    "avisos":  "[serious]",   # avisos de tanque, inclinacion, descanso, parada...
    "peligro": "[urgent]",    # avisos de frenos y de velocidad
}
PELIGRO = {"a_velocidad_1", "a_velocidad_2", "a_velocidad_fin", "a_freno_1", "a_freno_2"}
# Etiqueta para una frase en particular (gana sobre las de arriba). Ejemplo:
#   ETIQUETA_FRASE = {"a_velocidad_fin": "[very serious]"}
ETIQUETA_FRASE = {}

# Frases que se generan primero para que las escuches antes de hacer todas
PRUEBA = ["inicio", "a_freno_1"]
# =====================================================================

API = "https://api.elevenlabs.io/v1"
FORMATO = "mp3_44100_128"
CONFIG = os.path.join(os.path.expanduser("~"), "termofreno_elevenlabs.json")
SALIDA = "voz_elevenlabs"

DIST = {"2000": "En dos kilómetros", "800": "En ochocientos metros",
        "400": "En cuatrocientos metros", "200": "En doscientos metros", "ahora": "Ahora"}
MAN = {"gira_der": "gira a la derecha", "gira_izq": "gira a la izquierda",
       "leve_der": "gira ligeramente a la derecha", "leve_izq": "gira ligeramente a la izquierda",
       "cerrada_der": "gira cerrado a la derecha", "cerrada_izq": "gira cerrado a la izquierda",
       "vuelta": "da vuelta en U"}

CLIPS = {f"m_{d}_{m}": f"{dt}, {mt}." for d, dt in DIST.items() for m, mt in MAN.items()}
CLIPS.update({"llegada": "Has llegado a tu destino.",
              "recalculando": "Recalculando ruta.",
              "inicio": "Iniciando ruta."})

AVISOS = {   # voz de monitorista: habla por radio, de tu y al grano
    "a_tanque_1": "Oye, ya traes un cuarto de tanque. Carga en la próxima gasolinera.",
    "a_tanque_2": "Sigues bajo de diésel. Carga en cuanto puedas.",
    "a_velocidad_1": "Vas pasado de velocidad, bájale.",
    "a_velocidad_2": "Sigues pasado de velocidad. Ya te dije que le bajes.",
    "a_velocidad_fin": "Es el último aviso. Si te pasa algo por ir rápido, ya es tu problema.",
    "a_inclinacion_1": "Subida fuerte. Mete el bloqueo de diferencial.",
    "a_inclinacion_2": "Sigue la subida, no le quites el bloqueo de diferencial.",
    "a_freno_1": "Se te está yendo el camión, usa freno de motor o retarder.",
    "a_freno_2": "La carga tiene que llegar. Usa los frenos de asistencia.",
    "a_ultima_gas_1": "Ya casi no traes diésel. ¿Te paso una gasolinera cercana?",
    "a_ultima_gas_2": "Ya no vas a llegar a otra, no seas terco.",
    "a_descanso_1": "Oye, deberías descansar un rato. ¿Te paso una ubicación autorizada?",
    "a_descanso_2": "Oye, en serio, ya te toca descansar. ¿Te paso la ubicación?",
    "a_ruta_parada_1": "Listo, ya te puse la ruta a la parada.",
}

# Avisos de CONFIANZA: los mismos avisos, mas cortos, para cuando ya llevas horas usando el GPS
# (el monitorista ya te conoce). avisos.js los va mezclando poco a poco con los de arriba.
CONFIANZA = {
    "c_tanque_1": "Ya vas en un cuarto de tanque, ya sabes.",
    "c_tanque_2": "¿Y el diésel qué? Carga ya.",
    "c_velocidad_1": "Bájale, que te estoy viendo.",
    "c_velocidad_2": "Otra vez pasado. Bájale.",
    "c_velocidad_fin": "Ya no te digo nada, es tu problema.",
    "c_inclinacion_1": "Subida. Ya sabes, el diferencial.",
    "c_inclinacion_2": "Aguanta la subida, no quites el diferencial.",
    "c_freno_1": "Se te va el camión, freno de motor.",
    "c_freno_2": "Los frenos de asistencia, que se te calientan.",
    "c_ultima_gas_1": "Ya casi vas en reserva. ¿Te paso la gasolinera?",
    "c_ultima_gas_2": "No seas terco, carga aquí.",
    "c_descanso_1": "Oye, ya te sabes el horario de los descansos.",
    "c_descanso_2": "Te va a ganar el sueño, ya acepta la ubicación.",
    "c_ruta_parada_1": "Va, ahí te va la ruta.",
}

FRASES = {**CLIPS, **AVISOS, **CONFIANZA}


class Alto(Exception):
    """Error que no se arregla reintentando (clave mala, sin creditos...)."""


def cargar_config():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def guardar_config(cfg):
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def detalle(r):
    try:
        d = r.json().get("detail")
        if isinstance(d, dict):
            return (d.get("status") or "") + " " + (d.get("message") or "")
        return str(d)
    except ValueError:
        return r.text[:200]


def listar_voces(clave):
    """Lista de "Mis voces". Usa /v2/voices (la de /v1 quedo obsoleta). Si no se puede leer la lista
    (por ejemplo, la clave no tiene permiso de leer voces), sigue igual: se pueden pegar los voice ID."""
    h = {"xi-api-key": clave}
    ultimo = None
    for url, params in ((API.replace("/v1", "/v2") + "/voices", {"page_size": 100}), (f"{API}/voices", None)):
        r = requests.get(url, headers=h, params=params, timeout=30)
        if r.ok:
            return r.json().get("voices", [])
        if r.status_code == 401 and "missing_permissions" not in detalle(r):
            raise Alto("La clave de API no es valida: " + detalle(r))
        ultimo = r
    print(f"No pude leer la lista de tus voces ({ultimo.status_code} {detalle(ultimo)}).")
    print("No pasa nada: cuando te pregunte por cada voz, pega su voice ID.")
    return []


def pedir_clave(cfg):
    while True:
        clave = input("Pega tu clave de API de ElevenLabs y pulsa Enter: ").strip()
        if not clave:
            continue
        try:
            voces = listar_voces(clave)
        except Alto as e:
            print(e); continue
        cfg["clave"] = clave
        guardar_config(cfg)
        return voces


def elegir(voces, quien):
    while True:
        r = input(f"Numero de la voz de {quien.upper()} (o pega un voice ID): ").strip()
        if r.isdigit() and 1 <= int(r) <= len(voces):
            v = voces[int(r) - 1]
            return v["voice_id"], v.get("name", "")
        if len(r) >= 15 and " " not in r:      # parece un voice ID copiado de la pagina
            return r, r
        print("No entendi. Escribe un numero de la lista.")


def elegir_voces(cfg, voces):
    print("\nVoces en tu cuenta (\"Mis voces\"). Puedes escucharlas en elevenlabs.io.")
    print("Si quieres una de la Biblioteca de voces, primero agregala a Mis voces o copia su voice ID.\n")
    for i, v in enumerate(voces, 1):
        lab = v.get("labels") or {}
        extra = ", ".join(x for x in (lab.get("gender"), lab.get("accent"), lab.get("age"), v.get("category")) if x)
        print(f"{i:3}. {v.get('name', '?')}  ({extra})")
    print()
    cfg["hombre"], cfg["hombre_nombre"] = elegir(voces, "hombre")
    cfg["mujer"], cfg["mujer_nombre"] = elegir(voces, "mujer")
    guardar_config(cfg)


def etiqueta(nombre):
    if nombre in ETIQUETA_FRASE:
        return ETIQUETA_FRASE[nombre]
    base = "a_" + nombre[2:] if nombre.startswith("c_") else nombre     # los de confianza llevan la misma emocion
    if base in PELIGRO:
        return ETIQUETAS.get("peligro", "")
    return ETIQUETAS.get("avisos" if base.startswith("a_") else "guia", "")


def texto_de(nombre):
    t = FRASES[nombre]
    e = etiqueta(nombre).strip() if MODELO in ("eleven_v3", "eleven_v4") else ""
    return f"{e} {t}" if e else t


def ajustes_de(quien):
    a = dict(AJUSTES.get(quien) or {})
    if MODELO == "eleven_v3" and "stability" in a:      # v3 solo acepta 0, 0.5 o 1
        a["stability"] = min((0.0, 0.5, 1.0), key=lambda v: abs(v - a["stability"]))
    return a


def huella():
    # resumen de los ajustes: si cambia, las voces ya hechas no corresponden
    return json.dumps([MODELO, {q: ajustes_de(q) for q in ("hombre", "mujer")},
                       {n: texto_de(n) for n in FRASES}], sort_keys=True, ensure_ascii=False)


def generar(clave, voz, texto, ruta, ajustes=None):
    url = f"{API}/text-to-speech/{voz}?output_format={FORMATO}"
    cuerpo = {"text": texto, "model_id": MODELO}
    if ajustes:
        cuerpo["voice_settings"] = ajustes
    for intento in range(4):
        try:
            r = requests.post(url, headers={"xi-api-key": clave, "Content-Type": "application/json"},
                              json=cuerpo, timeout=60)
        except requests.RequestException as e:
            print("   sin conexion:", type(e).__name__)
            time.sleep(3 * (intento + 1)); continue
        if r.status_code == 200 and r.content:
            with open(ruta, "wb") as f:
                f.write(r.content)
            return True
        msg = detalle(r)
        if r.status_code in (401, 402, 403) or "quota" in msg.lower():
            raise Alto(f"ElevenLabs no acepto la peticion ({r.status_code}): {msg}")
        if r.status_code in (400, 404, 422):
            raise Alto(f"Peticion rechazada ({r.status_code}): {msg}\n"
                       f"Revisa que el voice ID sea correcto (borra {CONFIG} para elegir de nuevo).")
        print(f"   fallo {r.status_code}, reintento {intento + 1}: {msg}")
        time.sleep(3 * (intento + 1))
    return False


def generar_lote(cfg, nombres):
    malos = []
    for quien in ("hombre", "mujer"):
        os.makedirs(f"{SALIDA}/{quien}", exist_ok=True)
        for nombre in nombres:
            ruta = f"{SALIDA}/{quien}/{nombre}.mp3"
            if os.path.exists(ruta):
                print("ya existe", quien, nombre); continue
            if generar(cfg["clave"], cfg[quien], texto_de(nombre), ruta, ajustes_de(quien)):
                print("ok", quien, nombre)
            else:
                print("NO SE PUDO", quien, nombre); malos.append(f"{quien}/{nombre}")
    return malos


def nota(cfg):
    # va junto a las voces; armar_paquete.bat la busca para saber que ya son las de ElevenLabs
    with open(f"{SALIDA}/elevenlabs.txt", "w", encoding="utf-8") as f:
        f.write("Voces generadas con ElevenLabs (elevenlabs.io)\n")
        f.write(f"Fecha: {time.strftime('%Y-%m-%d')}\nModelo: {MODELO}\n")
        f.write(f"Hombre: {cfg.get('hombre_nombre', '')} ({cfg['hombre']}) {json.dumps(ajustes_de('hombre'))}\n")
        f.write(f"Mujer: {cfg.get('mujer_nombre', '')} ({cfg['mujer']}) {json.dumps(ajustes_de('mujer'))}\n")
        if MODELO in ("eleven_v3", "eleven_v4"):
            f.write(f"Etiquetas: {json.dumps(ETIQUETAS, ensure_ascii=False)} {json.dumps(ETIQUETA_FRASE, ensure_ascii=False)}\n")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    cfg = cargar_config()
    voces = None
    if not cfg.get("clave"):
        voces = pedir_clave(cfg)
    if not (cfg.get("hombre") and cfg.get("mujer")):
        if voces is None:
            voces = listar_voces(cfg["clave"])
        elegir_voces(cfg, voces)

    print(f"\nVoz de hombre: {cfg.get('hombre_nombre')}   Voz de mujer: {cfg.get('mujer_nombre')}")
    print(f"Modelo: {MODELO}   Ajustes: hombre {ajustes_de('hombre')}  mujer {ajustes_de('mujer')}")

    h = huella()
    if cfg.get("huella") != h:
        viejas = [f"{SALIDA}/{q}/{f}" for q in ("hombre", "mujer") if os.path.isdir(f"{SALIDA}/{q}")
                  for f in os.listdir(f"{SALIDA}/{q}") if f.endswith(".mp3")]
        if viejas and cfg.get("huella"):
            print(f"\nCambiaste los ajustes desde la ultima vez. Hay {len(viejas)} voces hechas con los anteriores.")
            if input("Las borro para hacerlas de nuevo? (s/n): ").strip().lower() == "s":
                for f in viejas:
                    os.remove(f)
        cfg["huella"] = h
        cfg["confirmado"] = False
        guardar_config(cfg)

    if not cfg.get("confirmado"):
        print("Generando frases de prueba de cada voz...")
        if generar_lote(cfg, PRUEBA):
            print("La prueba fallo; revisa los mensajes de arriba."); return
        print("\nEscucha estas y decide:")
        for quien in ("hombre", "mujer"):
            for n in PRUEBA:
                print(f"   {SALIDA}\\{quien}\\{n}.mp3")
        r = input("Te gustan? s = seguir con todas;  n = elegir otras voces;  "
                  "a = cambiar ajustes en este archivo y volver a probar: ").strip().lower()
        if r != "s":
            for quien in ("hombre", "mujer"):
                for n in PRUEBA:
                    try: os.remove(f"{SALIDA}/{quien}/{n}.mp3")
                    except OSError: pass
            if r == "n":
                for k in ("hombre", "mujer", "hombre_nombre", "mujer_nombre"):
                    cfg.pop(k, None)
                guardar_config(cfg)
                print("Listo. Vuelve a abrir generar_voz.bat para elegir otras voces.")
            else:
                print("Abre generar_voz.py con el Bloc de notas, cambia la seccion AJUSTES DE VOZ,"
                      " guarda y vuelve a abrir generar_voz.bat.")
            return
        cfg["confirmado"] = True
        guardar_config(cfg)

    malos = generar_lote(cfg, list(FRASES))
    nota(cfg)
    print()
    if malos:
        print("Faltaron:", ", ".join(malos))
        print("Vuelve a abrir generar_voz.bat: solo genera las que faltan.")
    else:
        print(f"TERMINADO. Copia todo lo de la carpeta {SALIDA} dentro de ats-gps\\voz (reemplaza los archivos).")
        print(f"Despues puedes borrar {SALIDA}. Tu clave y las voces elegidas quedan en {CONFIG}")


if __name__ == "__main__":
    try:
        main()
    except Alto as e:
        print("\n*** " + str(e))
    except requests.RequestException as e:
        print("\n*** Problema de conexion con ElevenLabs:", e)
    except KeyboardInterrupt:
        print("\nCancelado.")
