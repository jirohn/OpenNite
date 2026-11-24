const fs=require('fs');
const f='src/game/world.js';
let s=fs.readFileSync(f,'utf8');
const old=`  /** Isla pequeña hecha con terreno propio y objetos del Stylized Nature MegaKit. */
  async loadIsland() {
    const customPieces = await this.fetchCustomPieces();
    this.customPieces = Array.isArray(customPieces) ? customPieces : null;
    if (this.customPieces && this.customPieces.length) {
      // Mapa limpio del editor: terreno + agua + piezas personalizadas + naturaleza zonificada.
      this.setupWater();
      const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
      for (let cx = -range; cx <= range; cx++) {
        for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
      }
      // Mapa pequeño ya precargado: evitar streaming/churn de chunks en runtime.
      this.staticChunks = true;
      if (this.useKitAssets) {
        await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
        // Colocar primero piezas (crea colisionadores) y luego naturaleza para evitar solapes.
        this.placeCustomPieces(this.customPieces);
        this.placeNatureZones();
        this.placePropObjects();
      } else {
        await this.loadBuildKit();
        this.placeCustomPieces(this.customPieces);
      }
      this.generateLootForCustomMap(this.customPieces);
    } else {`;
const neu=`  /** Isla pequeña hecha con terreno propio y objetos del Stylized Nature MegaKit. */
  async loadIsland() {
    const customData = await this.fetchCustomPieces();
    const customPieces = Array.isArray(customData?.pieces) ? customData.pieces : (Array.isArray(customData) ? customData : null);
    this.customPieces = customPieces && customPieces.length ? customPieces : null;
    this._applyCustomTerrainData(customData);
    if (this.customPieces && this.customPieces.length) {
      // Mapa limpio del editor: terreno + agua + piezas personalizadas + naturaleza zonificada.
      this.setupWater();
      this._buildWaterPatches();
      const range = Math.ceil(this.half / CHUNK_SIZE) + 1;
      for (let cx = -range; cx <= range; cx++) {
        for (let cz = -range; cz <= range; cz++) this.createChunk(cx, cz);
      }
      // Mapa pequeño ya precargado: evitar streaming/churn de chunks en runtime.
      this.staticChunks = true;
      if (this.useKitAssets) {
        await Promise.all([this.loadKitModels(), this.loadBuildKit()]);
        // Colocar primero piezas (crea colisionadores) y luego naturaleza para evitar solapes.
        this.placeCustomPieces(this.customPieces);
        this.placeNatureZones();
        this.placePropObjects();
      } else {
        await this.loadBuildKit();
        this.placeCustomPieces(this.customPieces);
      }
      this.generateLootForCustomMap(this.customPieces);
    } else {`;
if(!s.includes(old)){console.error('not found'); process.exit(1);} 
fs.writeFileSync(f,s.replace(old,neu)); console.log('ok');