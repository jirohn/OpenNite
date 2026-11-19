# Créditos

## Código
- OpenNite Contributors — MIT.
- [Three.js](https://threejs.org/) — MIT.
- [Electron](https://www.electronjs.org/) — MIT.
- [Vite](https://vite.dev/) — MIT.
- [electron-updater](https://github.com/electron-userland/electron-builder) — MIT.
- [Firebase](https://firebase.google.com/) (Auth, Firestore y Cloud Functions) — licencia Apache 2.0. Solo se usa cuando el proyecto está configurado; sin credenciales el juego funciona en modo offline.

## Modelos y animaciones
- **Cuerpo y 19 piezas modulares** — [NoLimitNexus/game-models](https://github.com/NoLimitNexus/game-models), **CC0**. Cuerpo, pelo, barbas, sombreros, camisas, pantalones, botas y mochilas comparten un único esqueleto, lo que permite 20 personajes animados con coste reducido.
- **132 animaciones y esqueleto Rig_Medium** — [Kay Lousberg / KayKit](https://kaylousberg.com/), **CC0 1.0**. Se usa el subconjunto de 9 archivos GLB que necesita OpenNite (general, movimiento, combate, simulación y animaciones propias del kit). Licencia incluida en `public/models/opennite/library/licenses/kaykit-character-animations.txt`. Generable con `npm run assets`.
- **Stylized Nature MegaKit** — por [Quaternius](https://quaternius.itch.io/stylized-nature-megakit), **CC0 1.0**. Se usa un subconjunto optimizado de 20 modelos (árboles, arbustos, helechos, hierba, flores, rocas, guijarros y setas) y 11 texturas para decorar San Borondon. Licencia incluida en `public/models/quaternius/LICENSE.txt`.
- **Fantasy Props MegaKit** — por [Quaternius](https://quaternius.itch.io/fantasy-props-megakit), **CC0 1.0**. Subconjunto optimizado de 17 modelos (cofre de madera, cajas, barriles, puestos de mercado, mesas, bancos, antorchas y más) y 12 texturas. Se usa para los cofres reales de botín y el mobiliario de pueblos, puertos y caminos. Licencia incluida en `public/models/quaternius/props/LICENSE.txt`. Generable con `npm run prepare:props`.

## Recursos generados por código
- Armas, vehículo, paracaídas, sistemas de partículas, trazadoras, impactos, cielo, agua, carreteras, terreno y estructuras: geometría y shaders propios de OpenNite.
- Efectos de sonido: síntesis WebAudio en tiempo real, sin archivos de terceros.
- Icono `O` con revólver: SVG original de OpenNite.

## Aviso legal
OpenNite es un proyecto independiente de código abierto inspirado en el género *battle royale*. No está afiliado a Epic Games. Fortnite® es una marca registrada de Epic Games; no se utilizan sus recursos visuales, sonoros ni de marca.
