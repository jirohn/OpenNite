# OpenNite

Battle royale libre y de código abierto para **PC (Windows)**, sin modo construcción. Mapas grandes, modelos y animaciones CC0, efectos y gráficos configurables (incluido perfil para equipos low-end), botín, tormenta, bots y **autoactualización desde GitHub Releases**.

> Estado: **ALPHA**. Es un proyecto en desarrollo; pueden quedar detalles de balance y rendimiento por pulir.

## Características

- **Tercera persona**: salto desde el autobús, planeador, recogida de armas/armadura, escudo, tormenta por fases y victoria por eliminación.
- **Sin construcción**: nada de paredes, rampas ni recolectar materiales.
- **Mapas enormes**: 4–5 km por lado, generados proceduralmente con pueblos, puertos, presas, torres, ruinas, carreteras, bosques, rocas y agua.
- **Mapas descargables gratis** desde GitHub desde el menú `MAPAS`; una vez instalados funcionan sin conexión.
- **5 armas** (pistola, SMG, fusil, escopeta, francotirador) con 5 rarezas, ADS, retroceso, dispersión, recarga, daño por distancia y cabezazos.
- **Hasta 60 bots** con IA: salto, búsqueda de objetivo, línea de visión, esquiva de la tormenta, disparos con precisión según dificultad.
- **Gráficos escalables**: perfiles Baja / Media / Alta / Ultra, escala de resolución, distancia de dibujo, vegetación, sombras, bloom, SSAO y FOV.
- **Efectos**: partículas, trazadoras, impactos, decalcos, destellos, ondas expansivas, cielo atmosférico, agua animada y sonido sintetizado.
- **Actualizaciones automáticas** con `electron-updater` + GitHub Releases (canal prerelease alpha).

## Controles

| Tecla | Acción |
| --- | --- |
| WASD | Moverse |
| Ratón | Mirar |
| ESPACIO | Salir del autobús / saltar / abrir o cerrar el planeador (pulsación) |
| SHIFT | Correr |
| CTRL / C | Agacharse |
| CLIC izq. | Disparar |
| CLIC der. | Apuntar (ADS / mira) |
| R | Recargar |
| E | Recoger / abrir cofre |
| 1–5, rueda | Cambiar de arma |
| ESC | Pausa |

## Requisitos

- Windows 10/11 de 64 bits.
- Recomendado: GPU con WebGL 2, 8 GB RAM.
- Perfil **Baja** pensado para integradas/low-end: 68% resolución, sin sombras ni bloom, menos vegetación y distancia de dibujo reducida.

## Instalar y probar

### Desde un release (cuando esté publicado)
1. Descarga `OpenNite-Setup-<versión>.exe` (instalador) o `OpenNite-Portable-<versión>.exe` desde la pestaña **Releases**.
2. Ejecuta el instalador y abre **OpenNite**.
3. El juego comprobará actualizaciones al arrancar. También puedes usar **Buscar actualizaciones** en el menú.

### Desde el código fuente
Necesitas Node.js 20+ y npm.

```powershell
npm install
npm run assets      # descarga RobotExpressive.glb (CC0)
npm run icons       # genera PNG e ICO del logo
npm run dev         # abre http://127.0.0.1:5173 en el navegador
```

Para probar la app de escritorio:

```powershell
npm run electron
```

Para generar el instalador localmente:

```powershell
npm run dist:win
# los archivos quedan en release/
```

## Publicar un release alpha en GitHub

El workflow `.github/workflows/release.yml` compila y publica automáticamente el instalador y el `latest.yml` que usa el autoactualizador.

1. Crea el repositorio en GitHub con el nombre que elegiste.
2. Ajusta `owner` y `repo` en `build.publish` de `package.json` y la URL base en `public/maps/index.json`.
3. Sube el código y crea un tag:
   ```powershell
   git tag v0.1.0-alpha.1
   git push origin v0.1.0-alpha.1
   ```
4. El workflow genera una release **prerelease** con el instalador, el portable y los metadatos de actualización.

> `GITHUB_TOKEN` ya está disponible en Actions con permisos `contents: write`; no hace falta un token personal para el workflow. Solo necesitas un PAT si quieres publicar desde tu equipo con `electron-builder --publish always`.

## Estructura

```
src/core/       ajustes, audio WebAudio, entrada, catálogo de mapas, utilidades
src/game/       mundo procedural, jugador, bots, armas, efectos, botín, tormenta, HUD
src/ui/         menús, lobby, ajustes, mapas, pausa, resultados
electron/       ventana, IPC, servidor local, autoactualizador
public/maps/    mapas incluidos + índice descargable
assets/icons/   logo SVG, PNG e ICO
scripts/        descarga de assets CC0 y generación de iconos
```

## Licencias y créditos

Código MIT. Modelos y animaciones **CC0** de Quaternius / Tomás Laulhé. Ver [CREDITS.md](CREDITS.md).

Proyecto independiente, no afiliado a Epic Games. Fortnite® es marca registrada de Epic Games; no se usan sus recursos.
