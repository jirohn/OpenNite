# OpenNite

Battle royale libre y de código abierto para **PC (Windows)**, sin modo construcción. Un mapa isleño compacto llamado **San Borondon**, modelos y animaciones CC0, efectos y gráficos configurables (incluido perfil para equipos low-end), botín, tormenta, 19 bots y **autoactualización desde GitHub Releases**.

> Estado: **ALPHA**. Es un proyecto en desarrollo; pueden quedar detalles de balance y rendimiento por pulir.

## Características

- **Tercera persona**: salto desde el autobús, planeador, recogida de armas/armadura, escudo, tormenta por fases y victoria por eliminación.
- **Sin construcción**: nada de paredes, rampas ni recolectar materiales.
- **Un mapa, San Borondon**: isla de 360 m con costa irregular, ensenadas, acantilados y playas. Núcleos de pueblo densos con plazas y calles conectadas, puerto con pasarela de tablones, faro, ermita, caminos secundarios y césped del Stylized Nature MegaKit (CC0). Cofres y mobiliario reales del Fantasy Props MegaKit (CC0). El agua flota: caer al mar no causa daño.
- **20 personajes humanoides animados**: cuerpo modular y 19 piezas CC0 de NoLimitNexus con 132 animaciones KayKit (CC0). Todos comparten esqueleto; la galería del lobby muestra ocho aspectos animados en 3D.
- **Tienda, taquilla y economía**: gana créditos con el pase de batalla (200 gratis / 1000 premium; pase 800), compra trajes y colores y equípulos al instante desde la taquilla.
- **Cuenta con Google y Firebase**: inicia sesión con OAuth de Google, sincroniza perfil y progreso con Firestore y valida compras en Cloud Functions. Sin configurar Firebase, el juego funciona offline y guarda el perfil en local.
- **Mapas descargables gratis** desde GitHub desde el menú `MAPAS`; una vez instalados funcionan sin conexión.
- **5 armas** (pistola, SMG, fusil, escopeta, francotirador) con 5 rarezas, ADS, retroceso, dispersión, recarga, daño por distancia y cabezazos.
- **Hasta 19 bots** con IA (20 jugadores): salto, búsqueda de objetivo, línea de visión, esquiva de la tormenta, disparos con precisión según dificultad.
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
npm run assets      # descarga el kit de personajes CC0 (cuerpo, piezas y animaciones)
npm run prepare:nature <kit>  # opcional: regenera el subconjunto de naturaleza
npm run prepare:props <kit>   # opcional: regenera el subconjunto de props
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

## Configurar Firebase, Google OAuth y economía

El juego funciona sin Firebase: en ese caso usa un perfil local con 2000 créditos de bienvenida. Para activar la cuenta online:

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/) y añade una **app web**.
2. En *Authentication → Sign-in method*, activa **Google**. Añade `127.0.0.1` a los dominios autorizados.
3. Crea una base de datos **Cloud Firestore** y copia `firestore.rules` en las reglas (o despliega con Firebase CLI).
4. Copia `.env.example` a `.env.local` y rellena `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_FUNCTIONS_REGION` y, si aplica, el resto de valores.
5. Despliega las reglas y las funciones autoritativas:

```powershell
cd functions
npm install
cd ..
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,functions
```

La ventana de Electron permite emergentes de `accounts.google.com` y `*.firebaseapp.com` para que el flujo de OAuth devuelva la credencial a la app.

### Reglas económicas

- 2000 créditos de bienvenida por perfil nuevo (los perfiles antiguos reciben el regalo una sola vez).
- Pase premium: **800 ¢**. Recompensas por nivel: **20 ¢** gratis y **100 ¢** premium.
- Con 10 niveles: **200 ¢** gratuitos y **1000 ¢** premium por temporada.
- XP por partida: supervivencia, puesto final, eliminaciones y bonus de victoria.
- Firestore impide que el cliente modifique créditos, XP, inventario o recompensas: `purchaseItem`, `purchaseBattlePass`, `claimBattlePassReward`, `equipItem` y `awardMatch` se ejecutan en Cloud Functions.

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
src/core/       ajustes, cuenta Firebase/offline, economía, audio, entrada, mapas, utilidades
src/game/       mundo procedural, caminos, personajes CC0, jugador, bots, armas, botín, HUD
src/ui/         menú, lobby, tienda, taquilla, pase, cuenta, ajustes, mapas, pausa, resultados
electron/       ventana, OAuth emergente, IPC, servidor local, autoactualizador
functions/      Cloud Functions autoritativas de créditos, pase y taquilla
public/models/  kits CC0 de personajes, naturaleza y props
public/maps/    mapas incluidos + índice descargable
assets/icons/   logo SVG, PNG e ICO
scripts/        descarga de assets CC0 y generación de iconos
```

## Licencias y créditos

Código MIT. Modelos y animaciones **CC0** de NoLimitNexus, Kay Lousberg / KayKit y Quaternius. Ver [CREDITS.md](CREDITS.md).

Proyecto independiente, no afiliado a Epic Games. Fortnite® es marca registrada de Epic Games; no se usan sus recursos.
