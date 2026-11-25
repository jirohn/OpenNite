/**
 * OpenNite - Objetos de Easy Game Developer (piezas modulares, decorados,
 * primitivas y objetos compuestos) construidos con el MISMO código del motor,
 * para que casas, árboles y props tengan exactamente la misma forma que en EGD.
 * Solo cambian los materiales (toon de OpenNite, ver EgdSurfaceMaterial).
 */
/* eslint-disable */
import * as THREE from 'three';
import { EgdSurfaceMaterial, EgdGrassMaterial } from './egd-terrain.mjs';

// ----------------------------------------------------------------------------
// Código de EGD (extraído del motor; nombres originales minimizados)
// ----------------------------------------------------------------------------
const {Group: Oe, BufferGeometry: st, BufferAttribute: Zt, Mesh: ee, Float32BufferAttribute: Ve, ConeGeometry: vn, Shape: Ps, ExtrudeGeometry: sr, MeshBasicMaterial: $t, SphereGeometry: ln, CylinderGeometry: je, CapsuleGeometry: $c, TorusGeometry: wi, IcosahedronGeometry: Ui, DodecahedronGeometry: al, OctahedronGeometry: Ls, DoubleSide: nn, Matrix4: be, Quaternion: nt, Vector3: C, InstancedMesh: di, Color: fe, CatmullRomCurve3: tl, CurvePath: il, LineCurve3: nl, BoxGeometry: ge, PlaneGeometry: nr} = THREE;
const rt = EgdSurfaceMaterial, Ka = EgdGrassMaterial;
function xh(r,{ghost:e=!1}={}){let t=new Oe,n=Kt[r.material]||Kt.wood,i=.94+rS(r.position[0],r.position[1],r.position[2])*.1,s=new fe(n.color).multiplyScalar(i).getStyle(),a=n.trim,o=(l,c,h,d,u,p,f=!0,y=s,m=0)=>aS(t,l,c,h,d,u,p,y,f,m);switch(r.piece){case"floor":o(bt,dn,bt,0,-dn/2,0);break;case"wall":o(bt,Qt,dn,0,Qt/2,0);break;case"wallDoor":{let h=(bt-1.3)/2;o(h,Qt,dn,-(1.3/2+h/2),Qt/2,0),o(h,Qt,dn,1.3/2+h/2,Qt/2,0),o(1.3,Qt-2.3,dn,0,2.3+(Qt-2.3)/2,0),o(.12,2.3,dn+.08,-1.3/2,2.3/2,0,!1,a),o(.12,2.3,dn+.08,1.3/2,2.3/2,0,!1,a),o(1.3+.24,.12,dn+.08,0,2.3,0,!1,a);break}case"wallWindow":{let d=(bt-1.4)/2;o(d,Qt,dn,-(1.4/2+d/2),Qt/2,0),o(d,Qt,dn,1.4/2+d/2,Qt/2,0),o(1.4,1,dn,0,1/2,0),o(1.4,Qt-1-1.1,dn,0,1+1.1+(Qt-1-1.1)/2,0),o(1.4+.2,.1,dn+.12,0,1,0,!1,a),o(1.4+.2,.1,dn+.12,0,1+1.1,0,!1,a),o(.1,1.1,dn+.12,-1.4/2,1+1.1/2,0,!1,a),o(.1,1.1,dn+.12,1.4/2,1+1.1/2,0,!1,a),o(.08,1.1,dn*.4,0,1+1.1/2,0,!1,a);break}case"halfWall":o(bt,1.1,dn,0,.55,0),o(bt,.1,dn+.1,0,1.12,0,!1,a);break;case"pillar":o(.45,Qt,.45,0,Qt/2,0);break;case"stairs":{for(let d=0;d<12;d++)o(bt-.3,.16,bt/12+.02,0,(d+1)*Qt/12-.08,-bt/2+(d+.5)*(bt/12),!1);let c=Math.hypot(bt,Qt),h=Math.atan2(Qt,bt);for(let d of[-1,1])o(.15,.35,c,d*(bt/2-.075),Qt/2-.1,0,!1,a,-h);break}case"switchback":{for(let l=0;l<6;l++)o(1.9,.16,.52,-1,(l+1)*.25-.08,-2+(l+.5)*.5,!1);o(bt-.1,.16,1,0,1.5-.08,1.5,!1);for(let l=0;l<6;l++)o(1.9,.16,.35,1,1.5+(l+1)*.25-.08,1-(l+.5)/3,!1);o(1.9,.16,1,1,Qt-.08,-1.5,!1),o(.12,Qt,2,0,Qt/2,0,!0,a);break}case"roof":{let l=Math.hypot(bt,lo)+.3,c=Math.atan2(lo,bt);o(bt+.2,.2,l,0,lo/2,0,!1,s,-c);for(let h=1;h<5;h++)o(bt+.22,.05,.08,0,lo*h/5+.1,-bt/2+bt*h/5,!1,a);break}case"pyramid":{let l=new ee(new vn(bt/Math.SQRT2,An.pyramidRise,4,1),new rt({color:s,roughness:.85,flatShading:!0}));l.rotation.y=Math.PI/4,l.position.y=An.pyramidRise/2,l.castShadow=!0,l.receiveShadow=!0,t.add(l);break}case"gable":{let l=new Ps;l.moveTo(-bt/2,0),l.lineTo(bt/2,0),l.lineTo(bt/2,lo),l.lineTo(-bt/2,0);let c=new sr(l,{depth:dn,bevelEnabled:!1});c.translate(0,0,-dn/2);let h=new ee(c,new rt({color:s,roughness:.85}));h.castShadow=!0,h.receiveShadow=!0,t.add(h);break}default:o(1,1,1,0,.5,0)}return["stairs","switchback","roof","pyramid"].includes(r.piece)&&(t.userData.surface=r.piece),t.userData.buildPiece=r.piece,e&&t.traverse(l=>{l.isMesh&&(l.material=new $t({color:"#58d0ff",transparent:!0,opacity:.45,depthWrite:!1}),l.castShadow=!1)}),t}
function T0(r){let e=Hn[r]||Hn.rock,t=e.build();return t.name=e.name,t}
function Wi(r){let e=new Oe;return e.name=r?.name||"Objeto",(r?.parts||[]).forEach((t,n)=>{let i=sS(t);i.userData.partIndex=n,e.add(i)}),e}
function nE(r){switch(r){case"sphere":return new ln(.5,24,16);case"cylinder":return new je(.5,.5,1,24);case"cone":return new vn(.5,1,24);case"capsule":return new $c(.35,.5,6,16);case"torus":return new wi(.4,.12,12,32);case"plane":return new ge(1,.05,1);case"ramp":{let e=new Ps;e.moveTo(-.5,-.5),e.lineTo(.5,-.5),e.lineTo(.5,.5),e.lineTo(-.5,-.5);let t=new sr(e,{depth:1,bevelEnabled:!1});return t.translate(0,0,-.5),t.rotateY(-Math.PI/2),t}default:return new ge(1,1,1)}}
function co(r,e,t,{rot:n=0,wall:i="plaster",roof:s="tile",floor:a="wood",breakable:o=!0,name:l=""}={}){let c=vh(r,e,t,n,{material:i,breakable:o,name:l});for(let h of[-2,2])for(let d of[-2,2])c.add("floor",h,0,d,0,{material:a});return y0(c,0),x0(c,3,s,i),c.list}
function Op(r,e,t,{rot:n=0,wall:i="plaster",roof:s="tile",floor:a="wood",breakable:o=!0,name:l=""}={}){let c=vh(r,e,t,n,{material:i,breakable:o,name:l});for(let h of[-2,2])for(let d of[-2,2])c.add("floor",h,0,d,0,{material:a});y0(c,0),c.add("stairs",-2,0,-2,0,{material:"wood"});for(let[h,d]of[[2,-2],[2,2],[-2,2]])c.add("floor",h,3,d,0,{material:a});return c.add("wallWindow",-2,3,4),c.add("wallDoor",2,3,4),c.add("wallWindow",-2,3,-4),c.add("wallWindow",2,3,-4),c.add("wall",-4,3,-2,90),c.add("wallWindow",-4,3,2,90),c.add("wallWindow",4,3,-2,90),c.add("wall",4,3,2,90),c.add("floor",2,3,6,0,{material:"wood"}),c.add("halfWall",2,3,8,0,{material:"wood"}),c.add("halfWall",0,3,6,90,{material:"wood"}),c.add("halfWall",4,3,6,90,{material:"wood"}),x0(c,6,s,i),c.list}
function kp(r,e,t,{rot:n=0,material:i="wood",roof:s="tile",breakable:a=!0,name:o=""}={}){let l=vh(r,e,t,n,{material:i,breakable:a,name:o});for(let[h,d]of[[-2,-2],[2,-2],[2,2],[-2,2]])l.add("floor",h,0,d,0,{material:"stone"});for(let h=0;h<4;h++){l.add("switchback",-2,h*3,-2);for(let[d,u]of[[-4,-4],[4,-4],[4,4],[-4,4],[4,0],[0,4]])l.add("pillar",d,h*3,u)}let c=12;for(let[h,d]of[[2,-2],[2,2],[-2,2]])l.add("floor",h,c,d);for(let[h,d,u]of[[-2,4,0],[2,4,0],[4,-2,90],[4,2,90],[2,-4,0],[-2,-4,0],[-4,2,90],[-4,-2,90],[-2,0,0]])l.add("halfWall",h,c,d,u);for(let[h,d]of[[-4,-4],[4,-4],[4,4],[-4,4]])l.add("pillar",h,c,d);return l.add("pyramid",0,c+3,0,0,{material:s,scale:[2,1,2]}),l.list}
function aS(r,e,t,n,i,s,a,o,l=!0,c=0){let h=new ee(new ge(e,t,n),new rt({color:o,roughness:.85}));return h.position.set(i,s,a),h.rotation.x=c,h.castShadow=!0,h.receiveShadow=!0,h.userData.solid=l,r.add(h),h}
function sS(r){let e;switch(r.shape){case"sphere":e=new ln(.5,16,12);break;case"cylinder":e=new je(.5,.5,1,16);break;case"cone":e=new vn(.5,1,16);break;default:e=new ge(1,1,1)}let t=new ee(e,new rt({color:r.color,roughness:r.metal?.3:.6,metalness:r.metal?.7:.05,emissive:r.glow?r.color:"#000000",emissiveIntensity:r.glow?.9:0}));return t.scale.fromArray(r.size),t.position.fromArray(r.pos),t.rotation.set(r.rot[0]*Ht,r.rot[1]*Ht,r.rot[2]*Ht),t.castShadow=!0,t}
function vh(r,e,t,n,i){let s=n*Math.PI/180,a=Math.cos(s),o=Math.sin(s),l=[];return{add:(h,d,u,p,f=0,y={})=>{l.push({type:"build",piece:h,material:y.material||i.material,breakable:y.breakable??i.breakable,position:[Np(r+d*a+p*o),Np(e+u),Np(t-d*o+p*a)],rotation:[0,((f+n)%360+360)%360,0],scale:y.scale||[1,1,1],name:(y.namePrefix||i.name||"")+Ei[h].name})},list:l}}
function y0(r,e){r.add("wallDoor",-2,e,4),r.add("wallWindow",2,e,4),r.add("wallWindow",-2,e,-4),r.add("wall",2,e,-4),r.add("wallWindow",-4,e,-2,90),r.add("wall",-4,e,2,90),r.add("wall",4,e,-2,90),r.add("wallWindow",4,e,2,90)}
function x0(r,e,t,n){for(let i of[-2,2])r.add("roof",i,e,-2,0,{material:t}),r.add("roof",i,e,2,180,{material:t});for(let i of[-4,4])r.add("gable",i,e,-2,-90,{material:n}),r.add("gable",i,e,2,90,{material:n})}
function Ze(r,e,t=0,n=0,i=0,s){let a=new ee(r,pS(e,s));return a.position.set(t,n,i),a.castShadow=!0,a.receiveShadow=!0,a}
function pS(r,e={}){let t=r+JSON.stringify(e);if(!Hp.has(t)){let n=new rt({color:r,roughness:.85,flatShading:!0,...e});n.userData.shared=!0,Hp.set(t,n)}return Hp.get(t)}
var Ei = {floor:{name:"Suelo",icon:"\u25AD",hint:"4\xD74 m, se coloca en el centro de la celda"},wall:{name:"Muro",icon:"\u25AE",hint:"4\xD73 m, en el borde de la celda"},wallDoor:{name:"Muro con puerta",icon:"\u{1F6AA}",hint:"Hueco de 1,3\xD72,3 m"},wallWindow:{name:"Muro con ventana",icon:"\u{1FA9F}",hint:"Ventana de 1,4\xD71,1 m"},halfWall:{name:"Barandilla / muro bajo",icon:"\u25AC",hint:"4\xD71,1 m"},pillar:{name:"Pilar",icon:"\u2503",hint:"0,45\xD73 m, en las esquinas"},stairs:{name:"Escalera",icon:"\u25E2",hint:"Sube 3 m en 4 m (sube hacia +Z)"},switchback:{name:"Escalera de ida y vuelta",icon:"\u21C5",hint:"Sube 3 m dentro de una celda; apilable para torres"},roof:{name:"Tejado inclinado",icon:"\u27CB",hint:"Sube 2 m hacia +Z"},pyramid:{name:"Tejado pir\xE1mide",icon:"\u25B2",hint:"4\xD74 m, 2,5 m de alto"},gable:{name:"Hastial",icon:"\u25E3",hint:"Tri\xE1ngulo para cerrar los tejados"}};
var Kt = {wood:{name:"Madera",color:"#a9773f",trim:"#6b4426",hp:150,harvest:"Madera"},stone:{name:"Piedra",color:"#9a9ca3",trim:"#6d7077",hp:300,harvest:"Piedra"},volcanic:{name:"Piedra volc\xE1nica",color:"#5a5354",trim:"#3a3436",hp:320,harvest:"Piedra"},brick:{name:"Ladrillo",color:"#b0553a",trim:"#e8dcc0",hp:250,harvest:"Piedra"},plaster:{name:"Encalado canario",color:"#f1ece1",trim:"#2f6b4a",hp:200,harvest:"Piedra"},tile:{name:"Teja",color:"#b5502f",trim:"#8a3b22",hp:120,harvest:"Piedra"},metal:{name:"Metal",color:"#7d858e",trim:"#4f565e",hp:400,harvest:"Metal"}};
var rS = (r,e,t)=>{let n=Math.sin(r*12.9898+e*78.233+t*37.719)*43758.5453;return n-Math.floor(n)};
var An = {cell:4,height:3,thick:.25,roofRise:2,pyramidRise:2.5};
var bt = An.cell;
var dn = An.thick;
var Qt = An.height;
var lo = An.roofRise;
var Rn = (...r)=>{let e=new Oe;return r.forEach(t=>e.add(t)),e};
var Hn = {tree:{name:"\xC1rbol",build:()=>Rn(Ze(new je(.15,.22,1.4,7),"#7a4f2a",0,.7,0),Ze(new Ui(.9,0),"#3f8f3a",0,1.9,0),Ze(new Ui(.6,0),"#4aa344",.35,2.4,.1))},pine:{name:"Pino",build:()=>Rn(Ze(new je(.12,.18,1,6),"#6b4426",0,.5,0),Ze(new vn(.9,1.3,7),"#2f6e3b",0,1.4,0),Ze(new vn(.7,1.1,7),"#34793f",0,2,0),Ze(new vn(.45,.9,7),"#3a8546",0,2.6,0))},bush:{name:"Arbusto",build:()=>Rn(Ze(new Ui(.45,0),"#3f8f3a",0,.35,0),Ze(new Ui(.35,0),"#4aa344",.35,.3,.1),Ze(new Ui(.3,0),"#46993f",-.3,.28,-.1))},rock:{name:"Roca",build:()=>{let r=Ze(new al(.6,0),"#878a90",0,.35,0);return r.scale.set(1.2,.8,1),Rn(r)}},bigrock:{name:"Roca grande",build:()=>{let r=Ze(new al(1.2,0),"#7c7f86",0,.8,0);return r.scale.set(1.3,.9,1.1),Rn(r)}},flower:{name:"Flores",build:()=>Rn(Ze(new je(.02,.02,.4,4),"#3f8f3a",0,.2,0),Ze(new Ui(.1,0),"#ff6fa8",0,.42,0),Ze(new je(.02,.02,.3,4),"#3f8f3a",.15,.15,.1),Ze(new Ui(.08,0),"#ffe066",.15,.32,.1))},wall:{name:"Muro",build:()=>Rn(Ze(new ge(2,2,.4),"#9a9ca3",0,1,0))},fence:{name:"Valla",build:()=>Rn(Ze(new ge(.12,1,.12),"#8a5f31",-.9,.5,0),Ze(new ge(.12,1,.12),"#8a5f31",.9,.5,0),Ze(new ge(2,.1,.06),"#a9773f",0,.75,0),Ze(new ge(2,.1,.06),"#a9773f",0,.4,0))},crate:{name:"Caja",build:()=>Rn(Ze(new ge(.9,.9,.9),"#a9773f",0,.45,0))},barrel:{name:"Barril",build:()=>Rn(Ze(new je(.4,.4,1,12),"#8a5f31",0,.5,0),Ze(new je(.42,.42,.06,12),"#555",0,.25,0),Ze(new je(.42,.42,.06,12),"#555",0,.75,0))},chest:{name:"Cofre",build:()=>Rn(Ze(new ge(1,.6,.7),"#8a5f31",0,.3,0),Ze(new ge(1.02,.25,.72),"#a9773f",0,.72,0),Ze(new ge(.14,.18,.05),"#e6c14a",0,.6,.37,{metalness:.6}))},lamp:{name:"Farola",build:()=>Rn(Ze(new je(.06,.08,2.2,6),"#333",0,1.1,0),Ze(new ge(.35,.35,.35),"#ffd98a",0,2.3,0,{emissive:"#ffcc66",emissiveIntensity:1.5}))},house:{name:"Casa",build:()=>{let r=Ze(new vn(2.6,1.5,4),"#a5533c",0,2.95,0);return r.rotation.y=Math.PI/4,Rn(Ze(new ge(3.2,2.2,3.2),"#e8dcc0",0,1.1,0),r,Ze(new ge(.8,1.4,.06),"#6b4426",0,.7,1.62),Ze(new ge(.6,.6,.06),"#8ec9ff",.95,1.35,1.62))}},tower:{name:"Torre",build:()=>Rn(Ze(new je(1.2,1.4,5,10),"#8c8f96",0,2.5,0),Ze(new vn(1.6,1.8,10),"#5a3b8a",0,5.9,0))},bridge:{name:"Puente",build:()=>Rn(Ze(new ge(2,.2,4),"#a9773f",0,.1,0))},palm:{name:"Palmera canaria",build:()=>{let r=Rn(),e=0,t=0;for(let n=0;n<6;n++){let i=Ze(new je(.2-n*.012,.24-n*.012,.75,8),n%2?"#8a6a45":"#7a5c3a",t,e+.37,0);i.rotation.z=-.05*n,r.add(i),e+=.72,t+=.04*n}for(let n=0;n<9;n++){let i=n/9*Math.PI*2,s=Ze(new vn(.22,2.4,4),n%2?"#3f8f3a":"#4fa846",0,0,0);s.scale.set(1,1,.25);let a=new Oe;a.position.set(t,e,0),a.rotation.y=i,s.position.set(0,.25,1.1),s.rotation.x=Math.PI/2+.35,a.add(s),r.add(a)}return r.add(Ze(new ln(.28,8,6),"#d98c2b",t,e-.25,0)),r}},drago:{name:"Drago",build:()=>{let r=Rn(Ze(new je(.45,.75,2.2,9),"#9c9284",0,1.1,0)),e=(t,n,i,s,a,o)=>{let l=new Oe;l.position.set(t,n,i),l.rotation.set(0,s,.55);let c=Ze(new je(.16+o*.06,.22+o*.07,a,7),"#a39887",0,a/2,0);l.add(c),r.add(l);let h=new C(0,a,0).applyEuler(l.rotation).add(l.position);if(o>0)for(let d of[-.6,.6])e(h.x,h.y,h.z,s+d,a*.8,o-1);else{let d=Ze(new Ui(.75,0),"#4c7d3a",h.x,h.y+.25,h.z);d.scale.set(1.1,.55,1.1),r.add(d)}};for(let t=0;t<5;t++)e(0,2.1,0,t/5*Math.PI*2,1.1,1);return r}},dock:{name:"Poste de muelle",build:()=>Rn(Ze(new je(.14,.16,2.4,8),"#6b4426",0,.2,0))},crystal:{name:"Cristal",build:()=>Rn(Ze(new Ls(.5,0),"#7fe3ff",0,.8,0,{emissive:"#39b8ff",emissiveIntensity:.7}))}};
var Ht = Math.PI/180;
var Np = r=>Math.round(r*1e3)/1e3;
var Hp = new Map;

// ----------------------------------------------------------------------------
export const EGD_PROPS = Hn;
export const EGD_BUILD_PIECES = Ei;
/**
 * Conjuntos de EGD (mismas funciones del motor): devuelven la lista de piezas
 * modulares de una casa de 1 planta, casa canaria de 2 plantas o torre.
 * (x, y, z) es el centro; opts = { rot (grados), wall, roof, floor, material, name }.
 */
export const EGD_PRESETS = {
  house: { name: 'Casa (1 planta)', build: (x, y, z, opts) => co(x, y, z, opts) },
  house2: { name: 'Casa canaria (2 plantas)', build: (x, y, z, opts) => Op(x, y, z, opts) },
  tower: { name: 'Torre de vigilancia', build: (x, y, z, opts) => kp(x, y, z, opts) },
};
export const EGD_BUILD_MATERIALS = Kt;
export const EGD_RENDERABLE = ['build', 'prop', 'primitive', 'composite'];

/** Objeto 3D de una entidad de EGD (mismo resultado que Zr en el motor), o null. */
export function egdBuildEntityObject(r) {
  let n;
  switch (r.type) {
    case 'primitive': {
      n = new THREE.Mesh(nE(r.shape), new EgdSurfaceMaterial({ color: r.color || '#c8c8c8' }));
      n.castShadow = true; n.receiveShadow = true;
      break;
    }
    case 'prop': n = T0(r.prop); break;
    case 'build': n = xh(r); break;
    case 'composite': {
      n = Wi({ name: r.name, parts: r.parts || [] });
      n.traverse((i) => { if (i.isMesh) i.receiveShadow = true; });
      break;
    }
    default: return null;
  }
  const pos = r.position || [0, 0, 0], rot = r.rotation || [0, 0, 0], sc = r.scale || [1, 1, 1];
  n.position.fromArray(pos);
  n.rotation.set(rot[0] * Ht, rot[1] * Ht, rot[2] * Ht);
  n.scale.fromArray(sc);
  n.name = r.name || r.type;
  n.userData.entityId = r.id;
  n.userData.egdEntity = r;
  return n;
}
