# Termofreno + GPS para American Truck Simulator

Dos herramientas gratuitas para jugar American Truck Simulator (ATS) con más realismo, desde la PC y desde una tablet o un celular en la misma red WiFi:

- **Termofreno**: simula la temperatura de los frenos del camión (se calientan al frenar, pierden fuerza si abusas en una bajada y se enfrían con el tiempo) y la aplica a tu volante o mando a través de vJoy. Incluye tableros para la tablet (velocidad, combustible, ruta, inclinación, botones del camión) y una mini ventana para jugar con un solo monitor.
- **GPS propio** (`ats-gps`): un mapa estilo Google Maps / Waze que sigue a tu camión, calcula la ruta en el navegador, avisa los giros con voz, busca gasolineras, talleres y descansos, y toma el destino que pusiste en el GPS del juego.

> Probado en ATS con el Kenworth W900, el Freightliner Cascadia y el mapa **Reforma**. Otros camiones funcionan: la fuerza de frenado de cada camión, remolque y carga se aprende sola mientras manejas.

---

## Descarga

Descarga `TermofrenoGPS_<fecha>.zip` de la sección **Releases** de este repositorio. Ese .zip ya trae todo listo: `Termofreno.exe` (no necesitas instalar Python), el servidor de telemetría, el mapa completo y las voces.

El código de este repositorio **no** trae los mosaicos del mapa (`tiles`, unos 450 MB y más de 300 000 archivos): vienen solo en el .zip de Releases.

## Requisitos

- Windows 10 u 11.
- American Truck Simulator.
- [vJoy](https://sourceforge.net/projects/vjoystick/) instalado, con al menos el *Device 1* habilitado (para Termofreno).
- Recomendado: el mod de mapa **Reforma**. El mapa del GPS se hizo con él; sin Reforma, la parte de México del GPS no coincide con tu juego.
- Para la tablet o el celular: que estén en la misma red WiFi que la PC y que tengan internet (el mapa usa la librería Leaflet, que se carga desde internet).

## Instalación

1. Descomprime `TermofrenoGPS_<fecha>.zip` en una carpeta donde tu usuario pueda escribir, por ejemplo `D:\TermofrenoGPS` o `Documentos\TermofrenoGPS`. No lo abras desde dentro del .zip ni lo pongas en `Program Files`: Termofreno guarda su configuración y lo que aprende junto al `.exe`.
2. **Servidor de telemetría** (de Funbit): cierra el juego y abre `ets2-telemetry-server-master\server\Ets2Telemetry.exe`. La primera vez pulsa **Install** (pide permisos de administrador): instala el plugin en el juego y abre el puerto 25555 solo para tu red local. Déjalo abierto mientras juegas.
3. **Termofreno**: abre `Termofreno\Termofreno.exe`. Mantén juntos el `.exe`, la carpeta `_internal` y los `.html`. La primera vez aparece un asistente para elegir tu volante o mando.
4. En ATS, en *Opciones → Controles*, elige `Teclado + vJoy Device` y asigna el freno al eje de vJoy.
5. Entra a una partida de ATS (el menú principal no basta).
6. En la tablet o el celular abre la dirección que muestra Termofreno en *Abrir en otros dispositivos* (o escanea el código QR):
   - Tablero con GPS: `http://IP-DE-TU-PC:8080/panel_tablero` (para tablets viejas: `/panel_tablero_humilde`).
   - Solo el GPS: `http://IP-DE-TU-PC:25555/skins/ats-gps/index.html`.

### Freno del juego y mod recomendado

Termofreno funciona **con o sin** el mod [Flacooo Physics & FFB Pack](https://steamcommunity.com/sharedfiles/filedetails/?id=3821886843) del Steam Workshop. El freno de ese mod está pensado para quien juega **sin** Termofreno (frenadas largas, como un camión pesado); con Termofreno, el programa se encarga de que el camión frene como uno real.

En las opciones del juego, el deslizador **Intensidad del freno**:

| | Intensidad del freno |
|---|---|
| Sin el mod | **100 %** |
| Con el mod | **150 %** |

Si el freno del juego se queda corto aun a fondo, Termofreno lo nota y muestra una sugerencia en la ventana principal. Es solo una sugerencia: puedes jugar con la configuración que prefieras.

### Para que el GPS tome el destino del juego

El GPS lee el destino que pusiste en el GPS del juego desde la partida guardada. Para eso:

1. En ATS, en *Opciones → Controles*, asigna **Guardado rápido** a la tecla **Bloq Despl** (Scroll Lock).
2. Deja la ventana del juego activa: Termofreno pulsa esa tecla al abrir el GPS y al salir de una pausa.
3. Si tus guardados están cifrados, `SII_Decrypt.exe` (incluido junto a Termofreno) los lee.

## Uso del GPS

- **Estilos**: Google Maps (*gluglu*), Waze (*wazaaa*) y claro (*pineaple*). Se cambia en el menú.
- **Buscar**: escribe una ciudad o *gasolinera*, *taller* o *descanso* en la barra de búsqueda; salen los más cercanos con su distancia aproximada.
- **Menú**: en el estilo Google, desliza hacia arriba la barra de abajo o toca los minutos; en el estilo Waze, el botón amarillo y el engrane del panel de ruta.
- **Opciones de ruta**: evitar autopistas, bloquear un tramo, rutas alternativas, añadir una parada (gasolinera, taller o descanso).
- **Voz**: guía de giros y avisos (tanque, velocidad, inclinación, frenos, descanso) con voz de hombre o de mujer, con sonido de radio. *Solo alertas* calla la guía y deja los avisos.
- **Mapa completo**: en el tablero, el botón de pantalla completa abre la vista grande.

## Termofreno: qué hace

- **Temperatura de frenos**: el calor de cada frenada sale de la energía real que pierde el camión (masa, velocidad, deceleración); los tambores se enfrían con el aire y más rápido a mayor temperatura.
- **Pérdida de eficacia (fading)**: normal hasta ~150 °C, empieza a notarse hacia los 260 °C y a los 450 °C los frenos ya no frenan. Descuenta el fading propio del juego para no aplicarlo dos veces.
- **Frenado calibrado por peso**: a fondo y en frío, el camión frena como marca la norma de EE. UU. (FMVSS 121): 5.0 m/s² con el tractor solo, 4.7 m/s² hasta ~36 t (60 mph en 250 ft) y 3.8 m/s² con combinaciones muy pesadas.
- **Aprende cada combinación**: la fuerza del freno del juego para cada camión + remolque + carga se aprende mientras frenas y se guarda para la próxima vez.
- **Lee la carga real**: si la telemetría no da el peso de la carga (pasa al cargar una partida con el remolque ya enganchado), lo toma de la partida guardada.
- **Memoria térmica**: si cargas una partida anterior, vuelves a la temperatura que tenías; si el tiempo del juego salta (grúa, dormir), los frenos se enfrían según los minutos.
- **Ventana principal** con pestañas (Inicio, Dispositivo, Frenos, Diagnóstico, Acerca de), **mini ventana** encima del juego y **bandeja del sistema**.
- **Tableros web** para la tablet o el celular, con código QR, y **panel de botones** que envía al juego una lista fija de teclas (si una tecla se queda mantenida más de 20 s, se suelta sola).
- **Cuidado con vJoy**: deja los controles en reposo al abrir y al cerrar, y tiene un botón "Reiniciar controles".
- Español e inglés.

### Estado de la calibración

- Calibrado y probado con el **Kenworth W900** (tractor solo y cargas de 20 a 56 t, en frío y en caliente).
- Sin el mod (freno al 100 %) se comprobó con el W900 y el **Freightliner Cascadia**, vacíos y con 20 t. Con el mod (freno al 150 %), con el W900 vacío y con 20 t.
- Pendiente (no calibrado): freno de motor, retarder y freno de remolque (botón).

## Transparencia y avisos de antivirus

`Termofreno.exe` está hecho con Python y **PyInstaller** y **no está firmado digitalmente**. Por eso Windows SmartScreen puede mostrar *"Windows protegió tu PC"* (pulsa **Más información → Ejecutar de todos modos**) y algunos antivirus pueden marcarlo por error (falso positivo, algo común en programas de Python empaquetados). Todo el código está en este repositorio para que lo revises, y puedes correrlo desde el código sin el `.exe` (ver *Compilar desde el código*).

Qué hace el programa:

- Lee la telemetría del juego desde el servidor de Funbit en `http://localhost:25555`.
- Envía valores de ejes a un joystick virtual (vJoy).
- Abre un **servidor web local** (puerto 8080, se puede cambiar) para mostrar los tableros en tu celular o tablet. Escucha en tu red local, así que otros dispositivos de tu red pueden abrir esas páginas. Si no lo quieres, bloquéalo en el firewall de Windows.
- **Simula pulsaciones de teclado**: las teclas del panel de botones (una lista fija; cualquier otra se rechaza) y la tecla de guardado rápido (Bloq Despl) para que el juego guarde la partida.
- **Lee tus partidas guardadas** de ATS (`Documentos\American Truck Simulator`) para tomar el destino del GPS y el peso de la carga. Solo las lee: trabaja sobre una copia temporal y no cambia ninguna partida.
- Si la partida está cifrada, ejecuta `SII_Decrypt.exe` (de otro autor, incluido junto al programa, licencia MPL-2.0) sobre esa copia temporal. Algún antivirus puede marcarlo también por heurística; es el ejecutable original de su autor (compara su SHA-256 con el de su página de releases).
- Guarda su configuración, lo aprendido y sus registros en archivos junto al `.exe`.

Qué **no** hace: no se conecta a ningún servidor en internet, no se agrega al inicio de Windows ni al registro, no modifica archivos del sistema y no descarga nada.

Para verificar tu descarga, compara el **SHA-256** con el que aparece en la descripción de cada release:

```
certutil -hashfile Termofreno.exe SHA256
```

## Estructura

```
Termofreno/        programa (termofreno.pyw) y sus páginas: ventana, mini ventana y tableros
  build_termofreno.bat, version_info.txt   para compilar Termofreno.exe
ats-gps/           el GPS: va dentro de ets2-telemetry-server-master\server\Html\skins\
  index.html       todo el GPS (mapa, ruta, menús, búsqueda, voz)
  ruta.js          cálculo de la ruta (A*)
  grafo.bin        red de carreteras (exportada con TsMap)
  poi.js, poi.json, Cities.json   gasolineras, talleres, descansos y ciudades
  avisos.js        avisos de voz y sonido de radio
  voz/             frases en mp3 (hombre y mujer)
  tiles/, tiles_lejos/   mosaicos del mapa (solo en el .zip de Releases)
herramientas/      para quien quiera regenerar el mapa o las voces
```

### Herramientas (opcional)

- `convertir_grafo.py`: convierte el `graph.json` que exporta TsMap en `grafo.bin`. Uso recomendado:
  ```
  python convertir_grafo.py graph.json grafo.bin --corregir-giros --sin-rebotes
  ```
  `--corregir-giros` arregla giros de cruces exportados al revés y `--sin-rebotes` evita vueltas en U imposibles.
- `generar_voz.py` / `generar_voz.bat`: genera las voces con [ElevenLabs](https://elevenlabs.io) (necesita internet y una cuenta). La primera vez pide tu clave de API y que elijas una voz de hombre y una de mujer; la clave se guarda en tu carpeta de usuario (`termofreno_elevenlabs.json`), fuera del proyecto. Al terminar copia lo de `voz_elevenlabs/` dentro de `ats-gps/voz/`.

## Compilar desde el código

Para correrlo sin compilar (Python 3.10 o más nuevo, con *Add Python to PATH*):

```
pip install -r requirements.txt
python Termofreno\termofreno.pyw
```

Para generar `Termofreno.exe`, ejecuta `Termofreno\build_termofreno.bat`. Crea un entorno limpio, compila con PyInstaller (carpeta, sin UPX, con datos de versión) y deja el resultado en `Termofreno\dist\Termofreno\`, con los hashes SHA-256 en `dist\SHA256.txt` y las versiones usadas en `dist\versiones_build.txt`.

## Problemas comunes

- **Windows o el antivirus bloquean `Termofreno.exe`**: es un falso positivo (ver *Transparencia*). Comprueba el SHA-256 con el del release y, si confías, permítelo; o corre el programa desde el código.
- **"Esperando el juego"**: el servidor de Funbit no está abierto o el plugin no se instaló; ábrelo como administrador una vez.
- **La tablet no abre el tablero**: revisa que esté en la misma WiFi y que el firewall de Windows permita Termofreno en red privada.
- **El GPS no toma el destino del juego**: revisa la tecla de Guardado rápido (Bloq Despl) y que la ventana del juego esté activa.
- **Los frenos no responden**: revisa vJoy y, en Termofreno, la pestaña *Diagnóstico*.

## Créditos

- Termofreno y GPS: **El Flacooo**.
- Servidor de telemetría: [Funbit / ets2-telemetry-server](https://github.com/Funbit/ets2-telemetry-server) (licencia GPL-3.0, incluida en su carpeta).
- Mapa y red de carreteras exportados con [TsMap](https://github.com/dariowouters/ts-map) (versión modificada).
- Mapa base: American Truck Simulator (SCS Software) y el mod de mapa Reforma. Agradecimiento especial al **equipo Reforma** por darme su permiso para usar los datos de su mapa.
- [Leaflet](https://leafletjs.com/) para el mapa web.
- `SII_Decrypt.exe` de [TheLazyTomcat](https://github.com/TheLazyTomcat/SII_Decrypt) para leer los guardados cifrados (licencia MPL-2.0, incluida junto al .exe en `SII_Decrypt-LICENSE.txt`).
- Voces del GPS generadas con [ElevenLabs](https://elevenlabs.io) (elevenlabs.io).
- [vJoy](https://sourceforge.net/projects/vjoystick/) para enviar el freno al juego.

## Licencia

Termofreno y el GPS son **gratis** y su código está a la vista, bajo la licencia [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) (archivo `LICENSE`):

- Puedes usarlo, estudiarlo, compartirlo y modificarlo para fines **no comerciales**.
- **No** puedes venderlo, cobrar por él ni usarlo en algo de paga sin permiso por escrito de El Flacooo.

Las partes de terceros (servidor de Funbit, SII_Decrypt, Leaflet, voces y mapa) conservan su propia licencia; el detalle está al final de `LICENSE`.
