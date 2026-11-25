/**
 * OpenNite - Terreno de Easy Game Developer (formato "egd-map").
 *
 * Este archivo es el MISMO código de terreno de Easy Game Developer (EGD):
 * rejilla de teselas, alturas en pasos de 0.5 m, rampas, estilo "suave"
 * (bordes redondeados) y "bloques", líquidos, caminos/puentes y hierba.
 * Se ha extraído del motor tal cual para que un mapa tenga exactamente la
 * misma forma y las mismas alturas en EGD, en el juego y en el editor.
 *
 * Lo único que cambia en OpenNite son los materiales y colores (estilo
 * cartoon sin contorno de OpenNite): ver EgdSurfaceMaterial y applyOpenNiteLook().
 *
 * No editar el bloque "Código de EGD" a mano: si EGD cambia su terreno, se
 * vuelve a extraer con scripts/extract-egd-terrain (ver docs en el README del módulo).
 */
/* eslint-disable */
import * as THREE from 'three';
import { getCartoonGradient } from './cartoon.mjs';

/** Material de superficie: el de EGD es MeshStandardMaterial; OpenNite usa toon. */
export class EgdSurfaceMaterial extends THREE.MeshToonMaterial {
  constructor(params = {}) {
    const { roughness, metalness, flatShading, ...rest } = params;
    super({ ...rest, gradientMap: getCartoonGradient() });
  }
}
/** Material de la hierba (EGD: MeshLambertMaterial + onBeforeCompile de viento). */
export class EgdGrassMaterial extends THREE.MeshToonMaterial {
  constructor(params = {}) {
    super({ ...params, gradientMap: getCartoonGradient() });
  }
}

// ----------------------------------------------------------------------------
// Código de EGD (extraído del motor; nombres originales minimizados)
// ----------------------------------------------------------------------------
const {Group: Oe, BufferGeometry: st, BufferAttribute: Zt, Mesh: ee, Float32BufferAttribute: Ve, DoubleSide: nn, Matrix4: be, Quaternion: nt, Vector3: C, InstancedMesh: di, Color: fe, CatmullRomCurve3: tl, CurvePath: il, LineCurve3: nl, BoxGeometry: ge, PlaneGeometry: nr} = THREE;
const rt = EgdSurfaceMaterial, Ka = EgdGrassMaterial;
function Hr(r=32,e=2,t="grass"){return{size:r,tileSize:e,tiles:Array.from({length:r*r},()=>gh(t,0)),sky:"#8ec9ff",fog:!0,sun:2.4,ambient:1,mist:0,grassOn:!0,grassHeight:.55,grassBase:"#2f7d32",grassTip:"#b7e35a",style:"smooth",round:.8,fade:1.2,paths:[]}}
function M0(r){r.name??="Mapa principal",r.sky??="#8ec9ff",r.fog??=!0,r.sun??=2.4,r.ambient??=1,r.tileSize??=2,r.size??=Math.round(Math.sqrt(r.tiles.length)),r.style??="smooth",r.round??=.8,r.fade??=1.2,r.paths??=[],r.mist??=0,r.grassOn??=!0,r.grassHeight??=.55,r.grassBase??="#2f7d32",r.grassTip??="#b7e35a"}
function fi(r,e,t,{liquidSurface:n=!1}={}){let{ix:i,iz:s}=Gi(r,e,t),a=Vi(r,i,s);if(!a||!mt[a.t])return-1/0;let o=a.h*ds;if(mt[a.t].liquid)return n?o-.15:o-.6;if(a.m==="ramp"){let[l,c]=yh(r,i,s),[h,d]=Y1[a.d||0],u=_t(((e-l)*h+(t-c)*d)/r.tileSize+.5,0,1);o+=u*(a.r||2)*ds}return o}
function Gi(r,e,t){let n=hr(r);return{ix:Math.floor((e-n)/r.tileSize),iz:Math.floor((t-n)/r.tileSize)}}
function yh(r,e,t){let n=hr(r);return[n+(e+.5)*r.tileSize,n+(t+.5)*r.tileSize]}
function Nn(r="dirt",e={}){let t=hn[r]||hn.dirt;return{id:Mt("path"),name:t.name,type:r,width:t.width,mode:t.bridge?"free":"ground",smooth:!0,points:[],...e}}
function d0(r,e){return typeof r.grass=="string"&&r.grass.length===r.tiles.length?+r.grass[e]||0:r.tiles[e]?.t==="grass"?2:0}
function gl(r){typeof r.grass=="string"&&r.grass.length===r.tiles.length||(r.grass=r.tiles.map((e,t)=>d0({tiles:r.tiles},t)).join(""))}
function yl(r,e,t){gl(r),r.grass=r.grass.slice(0,e)+String(t)+r.grass.slice(e+1)}
function nS(r){if(Rp[r])return Rp[r];let e=mt[r],t=e.liquid?{transparent:!0,opacity:.78}:{},n=vl(new rt({color:e.top,roughness:e.liquid?.25:.9,emissive:e.glow?e.top:"#000000",emissiveIntensity:e.glow?.6:0,...t})),i=vl(new rt({color:e.side,roughness:.95,emissive:e.glow?e.side:"#000000",emissiveIntensity:e.glow?.4:0,...t}));return Rp[r]={top:n,side:i}}
function u0(r){let e=new fe(r);return[e.r,e.g,e.b]}
function Ip(r,e,t,n=1){if(t<1)return r;let i=t/2,s=[];for(let o=-t;o<=t;o++)s.push(Math.exp(-(o*o)/(2*i*i)));let a=(o,l)=>{let c=new Float32Array(o.length);for(let h=0;h<e;h++)for(let d=0;d<e;d++){let u=(h*e+d)*n;if(isNaN(o[u])){for(let y=0;y<n;y++)c[u+y]=NaN;continue}let p=new Array(n).fill(0),f=0;for(let y=-t;y<=t;y++){let m=l?d+y:d,g=l?h:h+y;if(m<0||g<0||m>=e||g>=e)continue;let b=(g*e+m)*n;if(isNaN(o[b]))continue;let x=s[y+t];for(let v=0;v<n;v++)p[v]+=o[b+v]*x;f+=x}for(let y=0;y<n;y++)c[u+y]=p[y]/f}return c};return a(a(r,!0),!1)}
function X1(r,e){let n=[],i=[],s=[],a=[],o=new fe(r),l=new fe(e);for(let d=0;d<=4;d++){let u=d/4,p=.5*(1-u)*(1-u*.2),f=u*u*.25,y=o.clone().lerp(l,Math.pow(u,.8));for(let m of[-1,1])d===4&&m===1||(n.push(d===4?0:m*p,u,f),i.push(y.r,y.g,y.b),s.push(0,1,0))}for(let d=0;d<3;d++){let u=d*2;a.push(u,u+1,u+2,u+1,u+3,u+2)}let c=3*2;a.push(c,c+1,c+2);let h=new st;return h.setAttribute("position",new Ve(n,3)),h.setAttribute("color",new Ve(i,3)),h.setAttribute("normal",new Ve(s,3)),h.setIndex(a),h}
function q1(){let r=new Ka({vertexColors:!0,side:nn});return r.onBeforeCompile=e=>{e.uniforms.uTime=io.time,e.uniforms.uPlayer=io.player,e.vertexShader=`uniform float uTime;
uniform vec3 uPlayer;
`+e.vertexShader.replace("#include <project_vertex>",`
      vec4 wp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
      #endif
      float hh = position.y;
      float wave = sin(uTime * 1.5 + wp.x * 0.22 + wp.z * 0.16) * 0.6 + sin(uTime * 2.9 + wp.x * 0.9 - wp.z * 0.7) * 0.22;
      wp.xz += vec2(0.8, 0.55) * wave * hh * hh * 0.32;
      vec2 dpl = wp.xz - uPlayer.xz;
      float dist = length(dpl);
      float push = (1.0 - smoothstep(0.25, 1.3, dist)) * (1.0 - step(2.5, abs(wp.y - uPlayer.y)));
      wp.xz += normalize(dpl + vec2(0.0001)) * push * hh * 0.65;
      wp.y -= push * hh * 0.3;
      vec4 mvPosition = viewMatrix * modelMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
    `),e.fragmentShader=e.fragmentShader.replace("#include <normal_fragment_begin>",`float faceDirection = 1.0;
vec3 normal = normalize( vNormal );
vec3 nonPerturbedNormal = normal;`)},r}
function vl(r){return r.userData.shared=!0,r}
function tS(){let r=[-.5,0,-.5],e=[.5,0,-.5],t=[.5,0,.5],n=[-.5,0,.5],i=[-.5,1,.5],s=[.5,1,.5],a=[r,i,s,r,s,e,n,t,s,n,s,i,r,e,t,r,t,n,r,n,i,e,s,t],o=new st;return o.setAttribute("position",new Ve(a.flat(),3)),o.computeVertexNormals(),o.addGroup(0,6,0),o.addGroup(6,18,1),o}
var hr = r=>-r.size*r.tileSize/2;
var Vi = (r,e,t)=>e<0||t<0||e>=r.size||t>=r.size?null:r.tiles[t*r.size+e];
var mt = {grass:{name:"C\xE9sped",top:"#5fa84a",side:"#7a5534"},dirt:{name:"Tierra",top:"#8a6239",side:"#6b4a2e"},sand:{name:"Arena",top:"#e0cf94",side:"#bfa874"},stone:{name:"Piedra",top:"#8c8f96",side:"#6d7077"},brick:{name:"Ladrillo",top:"#a5533c",side:"#8a4431"},wood:{name:"Madera",top:"#a9773f",side:"#8a5f31"},snow:{name:"Nieve",top:"#f1f5f9",side:"#a9b4bf"},volcanic:{name:"Roca volc\xE1nica",top:"#4d4547",side:"#3a3436"},picon:{name:"Pic\xF3n (lapilli)",top:"#7a3a2c",side:"#5a2a20"},blacksand:{name:"Arena negra",top:"#45403e",side:"#2f2b2a"},water:{name:"Agua",top:"#3a8fd6",side:"#2b6aa0",liquid:!0,speed:.55},lava:{name:"Lava",top:"#ff6a1f",side:"#b23a10",liquid:!0,speed:.45,damage:30,glow:!0}};
var ds = .5;
var so = -3;
var hn = {dirt:{name:"Camino de tierra",color:"#9a7b55",width:2.2},gravel:{name:"Sendero de grava",color:"#b3aa98",width:1.8},stone:{name:"Camino empedrado",color:"#9d9a92",width:2.6},road:{name:"Carretera",color:"#3d3f44",width:5,lines:!0},woodBridge:{name:"Puente de madera",color:"#a9773f",width:2.6,bridge:!0,rail:"#7a4f2a",pillar:"#6b4426"},stoneBridge:{name:"Puente de piedra",color:"#a7a59d",width:3.4,bridge:!0,rail:"#8c8f96",pillar:"#7c7f86"},roadBridge:{name:"Puente de carretera",color:"#3d3f44",width:5.4,bridge:!0,lines:!0,rail:"#c9ccd2",pillar:"#9a9ca3"}};
var Br = .4;
var _t = (r,e,t)=>Math.max(e,Math.min(t,r));
var ph = class{constructor(e){this.terrain=e,this.group=new Oe,this.group.name="Caminos",this.meshes=[],this.cache=[],this.samplesAll=[]}allSamples(){return this.samplesAll}get list(){return this.terrain.world.paths||[]}dispose(){for(let e of[...this.group.children])this.group.remove(e),e.traverse(t=>{t.geometry?.dispose(),t.isInstancedMesh&&t.dispose()});this.meshes=[],this.cache=[],this.samplesAll=[],this.junctions=[]}rebuild(){this.dispose();let e=[];for(let t of this.list)try{let n=hn[t.type]||hn.dirt,i=this.sample(t);i.length>=2&&e.push({p:t,def:n,S:i,w:t.width||n.width,free:t.mode==="free"})}catch(n){console.warn("Camino no v\xE1lido",t?.name,n)}this.junctions=this.findJunctions(e);for(let t of e)try{this.buildPath(t.p,t.S)}catch(n){console.warn("Camino no v\xE1lido",t.p?.name,n)}for(let t of this.junctions)t.cont||this.buildJunction(t)}_ground(e,t){let n=this.terrain.heightAt(e,t);return isFinite(n)?n:-6}_surfY(e,t){return e.free?t.y:this._ground(t.x,t.z)+.07}nearestOn(e,t,n){let i=null;for(let s=0;s<e.length-1;s++){let a=e[s],o=e[s+1],l=o.x-a.x,c=o.z-a.z,h=l*l+c*c||1e-6,d=_t(((t-a.x)*l+(n-a.z)*c)/h,0,1),u=a.x+l*d,p=a.z+c*d,f=Math.hypot(t-u,n-p);(!i||f<i.d)&&(i={d:f,x:u,z:p,y:a.y+(o.y-a.y)*d,i:s,t:d,tx:a.tx,tz:a.tz})}return i}findJunctions(e){let t=[],n=(a,o,l,c)=>t.push({x:a,z:o,y:l,members:c});for(let a=0;a<e.length;a++){let o=e[a];for(let[l,c]of[[0,o.S[0]],[o.S.length-1,o.S[o.S.length-1]]]){let h=this._surfY(o,c);for(let d=0;d<e.length;d++){if(d===a)continue;let u=e[d],p=this.nearestOn(u.S,c.x,c.z);if(!p||p.d>Math.max(.9,u.w/2))continue;let f=u.free?p.y:this._ground(p.x,p.z)+.07;if(Math.abs(h-f)>1.3)continue;let y=Math.hypot(p.x-u.S[0].x,p.z-u.S[0].z)<1.2||Math.hypot(p.x-u.S[u.S.length-1].x,p.z-u.S[u.S.length-1].z)<1.2,m=l===0?{x:o.S[0].tx,z:o.S[0].tz}:{x:-o.S[l].tx,z:-o.S[l].tz};n(p.x,p.z,Math.max(h,f),[{it:o,end:!0,tx:m.x,tz:m.z},{it:u,end:y,tx:p.tx,tz:p.tz}])}}for(let l=a+1;l<e.length;l++){let c=e[l];for(let h=0;h<o.S.length-1;h++){let d=o.S[h],u=o.S[h+1];for(let p=0;p<c.S.length-1;p++){let f=c.S[p],y=c.S[p+1],m=(u.x-d.x)*(y.z-f.z)-(u.z-d.z)*(y.x-f.x);if(Math.abs(m)<1e-9)continue;let g=((f.x-d.x)*(y.z-f.z)-(f.z-d.z)*(y.x-f.x))/m,b=((f.x-d.x)*(u.z-d.z)-(f.z-d.z)*(u.x-d.x))/m;if(g<0||g>1||b<0||b>1)continue;let x=d.x+(u.x-d.x)*g,v=d.z+(u.z-d.z)*g,S=I=>Math.hypot(x-I.S[0].x,v-I.S[0].z)<1.2||Math.hypot(x-I.S[I.S.length-1].x,v-I.S[I.S.length-1].z)<1.2;if(S(o)||S(c))continue;let M=o.free?d.y+(u.y-d.y)*g:this._ground(x,v)+.07,T=c.free?f.y+(y.y-f.y)*b:this._ground(x,v)+.07;Math.abs(M-T)>1.3||n(x,v,Math.max(M,T),[{it:o,end:!1,tx:d.tx,tz:d.tz},{it:c,end:!1,tx:f.tx,tz:f.tz}])}}}}let i=[];for(let a of t){let o=i.find(l=>Math.hypot(l.x-a.x,l.z-a.z)<2.2);if(o){for(let l of a.members){let c=o.members.find(h=>h.it===l.it);c?c.end=c.end&&l.end:o.members.push(l)}o.y=Math.max(o.y,a.y)}else i.push({...a,members:[...a.members]})}let s={road:5,roadBridge:5,stone:3,stoneBridge:3,woodBridge:2,gravel:2,dirt:1};for(let a of i){let o=a.members.map(p=>p.it.w),l=Math.max(...o);a.cont=a.members.length===2&&a.members.every(p=>p.end);let[c,h]=a.members,d=Math.abs(c.tx*h.tz-c.tz*h.tx);a.r=a.cont?0:l/2/Math.max(.5,d)+.6,a.arms=[];for(let p of a.members){let f={x:p.tx,z:p.tz};if(p.end){let y=p.it.S,m=y[0],g=y[y.length-1],x=Math.hypot(m.x-a.x,m.z-a.z)<Math.hypot(g.x-a.x,g.z-a.z)?y[Math.min(3,y.length-1)]:y[Math.max(0,y.length-4)],v=Math.hypot(x.x-a.x,x.z-a.z)||1;f={x:(x.x-a.x)/v,z:(x.z-a.z)/v},a.arms.push({...f,w:p.it.w})}else a.arms.push({...f,w:p.it.w},{x:-f.x,z:-f.z,w:p.it.w})}let u=a.members.reduce((p,f)=>(s[f.it.p.type]||0)>(s[p.it.p.type]||0)?f:p,a.members[0]);a.color=u.it.def.color,a.free=a.members.every(p=>p.it.free),a.paths=a.members.map(p=>p.it.p.id)}return i}inJunction(e,t,n=0){for(let i of this.junctions||[])if(!i.cont&&Math.hypot(e-i.x,t-i.z)<i.r+n)return i;return null}buildJunction(e){let t=[];for(let f of e.arms){let y=-f.z,m=f.x,g=f.w/2+.03,b=e.r;for(let x of[-g,g])t.push([e.x+y*x,e.z+m*x]),t.push([e.x+f.x*b+y*x,e.z+f.z*b+m*x])}t.sort((f,y)=>f[0]-y[0]||f[1]-y[1]);let n=(f,y,m)=>(y[0]-f[0])*(m[1]-f[1])-(y[1]-f[1])*(m[0]-f[0]),i=[],s=[];for(let f of t){for(;i.length>=2&&n(i[i.length-2],i[i.length-1],f)<=0;)i.pop();i.push(f)}for(let f=t.length-1;f>=0;f--){let y=t[f];for(;s.length>=2&&n(s[s.length-2],s[s.length-1],y)<=0;)s.pop();s.push(y)}let a=i.slice(0,-1).concat(s.slice(0,-1));if(a.length<3)return;let o=[];for(let f=0;f<a.length;f++){let y=a[f],m=a[(f+1)%a.length],g=Math.max(1,Math.ceil(Math.hypot(m[0]-y[0],m[1]-y[1])/.8));for(let b=0;b<g;b++)o.push([y[0]+(m[0]-y[0])*(b/g),y[1]+(m[1]-y[1])*(b/g)])}let l=(f,y)=>e.free?e.y+.015:Math.max(this._ground(f,y)+.085,e.y-.5),c=[e.x,l(e.x,e.z),e.z],h=[];for(let[f,y]of o){let m=(f+e.x)/2,g=(y+e.z)/2;c.push(m,l(m,g),g)}for(let[f,y]of o)c.push(f,l(f,y),y);let d=o.length;for(let f=0;f<d;f++){let y=(f+1)%d,m=1+f,g=1+y,b=1+d+f,x=1+d+y;h.push(0,g,m,m,g,b,g,x,b)}let u=new st;u.setAttribute("position",new Ve(c,3)),u.setIndex(h),u.computeVertexNormals();let p=new ee(u,new rt({color:e.color,roughness:.9,side:nn,polygonOffset:!0,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));p.receiveShadow=!0,p.userData.pathId=e.paths[0],p.userData.junction=!0,this.group.add(p),this.meshes.push(p)}sample(e){let t=(e.points||[]).map(o=>new C(o[0],o[1],o[2]));if(t.length<2)return[];let n;if(e.smooth!==!1&&t.length>2)n=new tl(t,!1,"centripetal");else{n=new il;for(let o=0;o<t.length-1;o++)n.add(new nl(t[o],t[o+1]))}let i=n.getLength();if(i<.05)return[];let s=Math.max(2,Math.ceil(i/.4)),a=n.getSpacedPoints(s);return a.map((o,l)=>{let c=a[Math.max(0,l-1)],h=a[Math.min(a.length-1,l+1)],d=h.x-c.x,u=h.z-c.z,p=Math.hypot(d,u)||1;return d/=p,u/=p,{x:o.x,y:o.y,z:o.z,tx:d,tz:u,sx:-u,sz:d}})}buildPath(e,t=this.sample(e)){let n=hn[e.type]||hn.dirt;if(t.length<2)return;let i=this.terrain,s=e.width||n.width,a=e.mode==="free";this.samplesAll.push({S:t,hw:s/2});let o=(x,v)=>{let S=i.heightAt(x,v);return isFinite(S)?S:-6},l=new fe(n.color),c=l.clone().multiplyScalar(.72),h=[],d=[],u=[],p=(x,v,S,M)=>(h.push(x,v,S),d.push(M.r,M.g,M.b),h.length/3-1),f=(x,v,S,M)=>u.push(x,v,S,v,M,S),y=a?2:6,m=t.map(x=>{let v=[];for(let S=0;S<=y;S++){let M=(S/y-.5)*s,T=x.x+x.sx*M,I=x.z+x.sz*M,w=a?x.y:o(T,I)+.07,_=.93+(Math.sin(T*12.9+I*78.2)*43758.5%1+1)%1*.1;v.push(p(T,w,I,l.clone().multiplyScalar(_)))}return v});for(let x=0;x<m.length-1;x++)for(let v=0;v<y;v++)f(m[x][v],m[x][v+1],m[x+1][v],m[x+1][v+1]);if(a){for(let x of[-1,1]){let v=[];for(let S of t){let M=S.x+S.sx*x*s/2,T=S.z+S.sz*x*s/2,I=n.bridge?S.y-Br:Math.min(S.y,o(M,T)-.2);v.push([p(M,S.y,T,c),p(M,I,T,c)])}for(let S=0;S<v.length-1;S++)f(v[S][0],v[S+1][0],v[S][1],v[S+1][1])}if(n.bridge){let x=t.map(v=>[p(v.x-v.sx*s/2,v.y-Br,v.z-v.sz*s/2,c),p(v.x+v.sx*s/2,v.y-Br,v.z+v.sz*s/2,c)]);for(let v=0;v<x.length-1;v++)f(x[v][0],x[v][1],x[v+1][0],x[v+1][1])}for(let x of[t[0],t[t.length-1]]){let v=n.bridge?x.y-Br:o(x.x-x.sx*s/2,x.z-x.sz*s/2)-.2,S=n.bridge?x.y-Br:o(x.x+x.sx*s/2,x.z+x.sz*s/2)-.2;f(p(x.x-x.sx*s/2,x.y,x.z-x.sz*s/2,c),p(x.x+x.sx*s/2,x.y,x.z+x.sz*s/2,c),p(x.x-x.sx*s/2,Math.min(x.y,v),x.z-x.sz*s/2,c),p(x.x+x.sx*s/2,Math.min(x.y,S),x.z+x.sz*s/2,c))}}if(n.lines){let x=new fe("#e9e9e9"),v=new fe("#f2c230"),S=(T,I)=>(a?T.y:o(T.x+T.sx*I,T.z+T.sz*I)+.07)+.02,M=(T,I,w,_)=>{let P=0;for(let H=0;H<t.length-1;H++){let A=t[H],N=t[H+1];if(P+=Math.hypot(N.x-A.x,N.z-A.z),_&&P%3>1.6||this.inJunction((A.x+N.x)/2,(A.z+N.z)/2,.15))continue;let D=X=>[p(X.x+X.sx*(T-I/2),S(X,T),X.z+X.sz*(T-I/2),w),p(X.x+X.sx*(T+I/2),S(X,T),X.z+X.sz*(T+I/2),w)],[U,j]=D(A),[O,F]=D(N);f(U,j,O,F)}};M(0,.14,v,!0),M(s/2-.3,.12,x,!1),M(-(s/2-.3),.12,x,!1);for(let T of this.junctions||[]){if(T.cont||!T.paths.includes(e.id)||T.members.filter(_=>_.it.def.lines).length<2)continue;let I=T.r+.4,w=I+1.8;for(let _=0;_<t.length-1;_++){let P=Math.hypot(t[_].x-T.x,t[_].z-T.z),H=Math.hypot(t[_+1].x-T.x,t[_+1].z-T.z);if(P<I==H<I)continue;let A=P<I?t[_+1]:t[_],N=P<I?1:-1,D=A.tx*N,U=A.tz*N;for(let j=-s/2+.55;j<=s/2-.5;j+=.85){let O=A.x+A.sx*j,F=A.z+A.sz*j,X=S(A,j),Y=[O-A.sx*.22,F-A.sz*.22],re=[O+A.sx*.22,F+A.sz*.22];f(p(Y[0],X,Y[1],x),p(re[0],X,re[1],x),p(Y[0]+D*(w-I),X,Y[1]+U*(w-I),x),p(re[0]+D*(w-I),X,re[1]+U*(w-I),x))}}}}let g=new st;g.setAttribute("position",new Ve(h,3)),g.setAttribute("color",new Ve(d,3)),g.setIndex(u),g.computeVertexNormals();let b=new ee(g,new rt({vertexColors:!0,roughness:.9,side:nn,polygonOffset:!a,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));if(b.castShadow=a,b.receiveShadow=!0,b.userData.pathId=e.id,this.group.add(b),this.meshes.push(b),n.bridge){let x=[],v=[],S=0,M=0,T=2;for(let F=0;F<t.length;F++){F>0&&(S+=Math.hypot(t[F].x-t[F-1].x,t[F].z-t[F-1].z));let X=t[F];if((S>=M||F===t.length-1)&&!this.inJunction(X.x,X.z,.3)){M=S+1.6;for(let Y of[-1,1])x.push([X.x+X.sx*Y*(s/2-.1),X.y,X.z+X.sz*Y*(s/2-.1),0])}if(S>=T&&F<t.length-3){T=S+4.5;let Y=Math.min(o(X.x,X.z),X.y);X.y-Y>.8&&v.push([X.x,Y-.5,X.z,X.y-Br-Y+.5,Math.atan2(X.tx,X.tz)])}}let I=new rt({color:n.rail,roughness:.8}),w=new ge(1,1,1).translate(0,.5,0),_=new be,P=new nt,H=new C,A=new C,N=new C(0,1,0);if(x.length){let F=new di(w,I,x.length);x.forEach(([X,Y,re],_e)=>F.setMatrixAt(_e,_.compose(A.set(X,Y,re),P.identity(),H.set(.14,.95,.14)))),F.castShadow=!0,this.group.add(F)}if(v.length){let F=new di(w,new rt({color:n.pillar,roughness:.9}),v.length);v.forEach(([X,Y,re,_e,Z],oe)=>F.setMatrixAt(oe,_.compose(A.set(X,Y,re),P.setFromAxisAngle(N,Z),H.set(s*.8,_e,.6)))),F.castShadow=!0,F.receiveShadow=!0,this.group.add(F)}let D=[],U=[];for(let F of[-1,1]){let X=D.length/3;t.forEach(Y=>{let re=Y.x+Y.sx*F*(s/2-.1),_e=Y.z+Y.sz*F*(s/2-.1);D.push(re,Y.y+.82,_e,re,Y.y+.98,_e)});for(let Y=0;Y<t.length-1;Y++){if(this.inJunction(t[Y].x,t[Y].z,.3)||this.inJunction(t[Y+1].x,t[Y+1].z,.3))continue;let re=X+Y*2;U.push(re,re+1,re+2,re+1,re+3,re+2)}}let j=new st;j.setAttribute("position",new Ve(D,3)),j.setIndex(U),j.computeVertexNormals();let O=new ee(j,new rt({color:n.rail,roughness:.8,side:nn}));O.castShadow=!0,this.group.add(O)}if(a){let x=1/0,v=-1/0,S=1/0,M=-1/0;for(let T of t)x=Math.min(x,T.x),v=Math.max(v,T.x),S=Math.min(S,T.z),M=Math.max(M,T.z);this.cache.push({S:t,hw:s/2,bridge:!!n.bridge,minX:x-s,maxX:v+s,minZ:S-s,maxZ:M+s})}}surfacesAt(e,t){let n=[];for(let i of this.cache){if(e<i.minX||e>i.maxX||t<i.minZ||t>i.maxZ)continue;let s=null,a=1/0;for(let o=0;o<i.S.length-1;o++){let l=i.S[o],c=i.S[o+1],h=c.x-l.x,d=c.z-l.z,u=h*h+d*d||1e-6,p=_t(((e-l.x)*h+(t-l.z)*d)/u,0,1),f=l.x+h*p,y=l.z+d*p,m=Math.hypot(e-f,t-y);m<a&&(a=m,s=l.y+(c.y-l.y)*p)}a<=i.hw&&s!==null&&n.push({y:s,bottom:i.bridge?s-Br:-1/0})}return n}};
var io = {time:{value:0},player:{value:new C(1e5,0,1e5)}};
var W1 = [0,14,34,64];
var fh = class{constructor(e){this.terrain=e,this.group=new Oe,this.group.name="Hierba",this.mesh=null}dispose(){this.mesh&&(this.group.remove(this.mesh),this.mesh.geometry.dispose(),this.mesh.material.dispose(),this.mesh.dispose(),this.mesh=null)}rebuild(){this.dispose();let e=this.terrain,t=e.world;if(t.grassOn===!1)return;let n=t.size,i=t.tileSize,s=hr(t),a=t.grassHeight??.55,o=.5,l=Math.ceil(n*i/o),c=new Uint8Array(l*l);for(let S of e.paths.allSamples()){let M=S.hw+.15;for(let T of S.S){let I=Math.floor((T.x-M-s)/o),w=Math.floor((T.x+M-s)/o),_=Math.floor((T.z-M-s)/o),P=Math.floor((T.z+M-s)/o);for(let H=Math.max(0,_);H<=Math.min(l-1,P);H++)for(let A=Math.max(0,I);A<=Math.min(l-1,w);A++){let N=s+(A+.5)*o,D=s+(H+.5)*o;(N-T.x)**2+(D-T.z)**2<=M*M&&(c[H*l+A]=1)}}}let h=[],d=1337,u=()=>(d=d*16807%2147483647,d/2147483647);for(let S=0;S<t.tiles.length;S++){let M=d0(t,S),T=t.tiles[S];if(!M||!T||!mt[T.t]||mt[T.t].liquid)continue;let I=S%n,w=S/n|0;d=(S*7919+17)%2147483647||1;for(let _=0;_<W1[M];_++){let P=s+(I+u())*i,H=s+(w+u())*i,A=Math.floor((P-s)/o),N=Math.floor((H-s)/o);if(c[N*l+A])continue;let D=e.heightAt(P,H);!isFinite(D)||Math.abs(e.heightAt(P+.3,H)-D)+Math.abs(e.heightAt(P,H+.3)-D)>.45||h.push(P,D-.02,H,u()*Math.PI*2,a*(.55+u()*.8)*(.8+M*.1),.09+u()*.07,.82+u()*.3)}}let p=h.length/7;if(!p)return;let f=new di(X1(t.grassBase||"#2f7d32",t.grassTip||"#b7e35a"),q1(),p),y=new be,m=new nt,g=new C,b=new C,x=new C(0,1,0),v=new fe;for(let S=0;S<p;S++){let M=S*7;g.set(h[M],h[M+1],h[M+2]),m.setFromAxisAngle(x,h[M+3]),b.set(h[M+5]*h[M+4]*1.6,h[M+4],h[M+4]),f.setMatrixAt(S,y.compose(g,m,b)),f.setColorAt(S,v.setScalar(h[M+6]))}f.receiveShadow=!0,f.castShadow=!1,f.frustumCulled=!1,f.onBeforeRender=()=>{io.time.value=performance.now()/1e3},this.mesh=f,this.group.add(f)}};
var iS = (r,e,t)=>{let n=_t((t-r)/(e-r),0,1);return n*n*(3-2*n)};
var Cp = (r,e)=>{let t=r*374761393+e*668265263|0;return t=Math.imul(t^t>>>13,1274126177),((t^t>>>16)>>>0)/4294967295};
var eS = vl(new nr(1,1));
var J1 = vl(new ge(1,1,1).translate(0,.5,0));
var Q1 = vl(tS());
var us = class{constructor(e){this.world=e,this.world.paths??=[],this.group=new Oe,this.group.name="Terreno",this.meshes=[],this.paths=new ph(this),this.group.add(this.paths.group),this.grass=new fh(this),this.group.add(this.grass.group),this.rebuild()}get size(){return this.world.size}get ts(){return this.world.tileSize}get smooth(){return this.world.style!=="blocks"&&!!this.H}tileAt(e,t){let{ix:n,iz:i}=Gi(this.world,e,t);return Vi(this.world,n,i)}liquidAt(e,t){let n=this.tileAt(e,t);return n&&mt[n.t]?.liquid?mt[n.t]:null}heightAt(e,t,n){if(!this.smooth)return fi(this.world,e,t,n);let i=this.tileAt(e,t);if(!i||!mt[i.t])return-1/0;if(n?.liquidSurface&&mt[i.t].liquid)return i.h*ds-.15;let{V:s,step:a,o,H:l}=this.grid,c=s-1,h=(e-o)/a,d=(t-o)/a,u=_t(Math.floor(h),0,c-1),p=_t(Math.floor(d),0,c-1),f=h-u,y=d-p,m=l[p*s+u],g=l[p*s+u+1],b=l[(p+1)*s+u],x=l[(p+1)*s+u+1];return isNaN(m)||isNaN(g)||isNaN(b)||isNaN(x)?fi(this.world,e,t,n):f+y<=1?m+(g-m)*f+(b-m)*y:x+(b-x)*(1-f)+(g-x)*(1-y)}pathSurfaces(e,t){return this.paths.surfacesAt(e,t)}rebuild(){this.disposeTerrain(),this.H=null,this.world.style==="blocks"?this.buildBlocks():this.buildSmooth(),this.rebuildPaths()}rebuildPaths(){this.paths.rebuild(),this.grass.rebuild()}rebuildGrass(){this.grass.rebuild()}_add(e){e.userData.terrain=!0,this.group.add(e),this.meshes.push(e)}buildSmooth(){let e=this.world,t=e.tileSize,n=e.size,i=n>64?2:n>40?3:4,s=t/i,a=n*i,o=a+1,l=hr(e),c=l+n*t-.001,h=new Float32Array(o*o),d=new Float32Array(o*o*3),u=new Float32Array(o*o*3);for(let O=0;O<o;O++)for(let F=0;F<o;F++){let X=Math.min(l+F*s,c),Y=Math.min(l+O*s,c),re=O*o+F,{ix:_e,iz:Z}=Gi(e,X,Y),oe=Vi(e,_e,Z),Ee=oe&&mt[oe.t];if(!Ee){h[re]=NaN,d.fill(NaN,re*3,re*3+3),u.fill(NaN,re*3,re*3+3);continue}h[re]=fi(e,X,Y);let pe=u0(Ee.liquid?Ee.side:Ee.top),Be=u0(Ee.side);d.set(pe,re*3),u.set(Be,re*3)}let p=Ip(h,o,Math.round((e.round??.8)/s)),f=Math.round((e.fade??1.2)/s),y=Ip(d,o,f,3),m=Ip(u,o,f,3);this.H=p,this.grid={V:o,step:s,o:l,H:p};let g=new Float32Array(o*o*3);for(let O=0;O<o;O++)for(let F=0;F<o;F++){let X=O*o+F;g[X*3]=l+F*s,g[X*3+1]=isNaN(p[X])?so:p[X],g[X*3+2]=l+O*s}let b=[];for(let O=0;O<a;O++)for(let F=0;F<a;F++){let X=Vi(e,Math.floor(F/i),Math.floor(O/i));if(!X||!mt[X.t])continue;let Y=O*o+F,re=Y+1,_e=Y+o,Z=_e+1;b.push(Y,_e,re,re,_e,Z)}let x=new st;x.setAttribute("position",new Zt(g,3)),x.setIndex(b),x.computeVertexNormals();let v=x.getAttribute("normal"),S=new Float32Array(o*o*3);for(let O=0;O<o*o;O++){let F=iS(.22,.55,1-v.getY(O)),X=.94+Cp(O%o,O/o|0)*.1;for(let Y=0;Y<3;Y++){let re=isNaN(y[O*3+Y])?.5:y[O*3+Y],_e=isNaN(m[O*3+Y])?.4:m[O*3+Y];S[O*3+Y]=(re+(_e-re)*F)*X}}x.setAttribute("color",new Zt(S,3));let M=new ee(x,new rt({vertexColors:!0,roughness:.95}));M.castShadow=!0,M.receiveShadow=!0,this._add(M);let T=[],I=[],w=O=>{let F=T.length/3;for(let X of O)T.push(g[X*3],g[X*3+1],g[X*3+2],g[X*3],so,g[X*3+2]);for(let X=0;X<O.length-1;X++){let Y=F+X*2;I.push(Y,Y+1,Y+2,Y+1,Y+3,Y+2)}},_=O=>Array.from({length:o},(F,X)=>O(X));w(_(O=>O)),w(_(O=>a*o+O)),w(_(O=>O*o)),w(_(O=>O*o+a));let P=new st;P.setAttribute("position",new Ve(T,3)),P.setIndex(I),P.computeVertexNormals();let H=new ee(P,new rt({color:"#6b4a2e",roughness:1,side:nn}));H.receiveShadow=!0,this.group.add(H),this.meshes.push(H);let A={};e.tiles.forEach((O,F)=>{O&&mt[O.t]?.liquid&&(A[O.t]??=[]).push(F)});let N=new be,D=new nt().setFromAxisAngle(new C(1,0,0),-Math.PI/2),U=new C(t,t,1),j=new C;for(let[O,F]of Object.entries(A)){let X=mt[O],Y=new rt({color:X.top,transparent:!0,opacity:.8,roughness:.15,metalness:.1,emissive:X.glow?X.top:"#000000",emissiveIntensity:X.glow?.8:0}),re=new di(eS,Y,F.length);F.forEach((_e,Z)=>{let oe=e.tiles[_e];j.set(l+(_e%n+.5)*t,oe.h*ds-.15,l+((_e/n|0)+.5)*t),re.setMatrixAt(Z,N.compose(j,D,U))}),re.receiveShadow=!0,this.group.add(re),this.meshes.push(re)}}buildBlocks(){let e=this.world,t=e.size,n=e.tileSize,i=hr(e),s={};for(let u=0;u<e.tiles.length;u++){let p=e.tiles[u];if(!p||!mt[p.t])continue;let f=s[p.t]??={blocks:[],ramps:[]};f.blocks.push(u),p.m==="ramp"&&!mt[p.t].liquid&&f.ramps.push(u)}let a=new be,o=new nt,l=new C,c=new C,h=new fe,d=new C(0,1,0);for(let[u,p]of Object.entries(s)){let{top:f,side:y}=nS(u),m=mt[u],g=new di(J1,[y,y,f,y,y,y],p.blocks.length);if(p.blocks.forEach((b,x)=>{let v=e.tiles[b],S=b%t,M=b/t|0,T=v.h*ds-(m.liquid?.15:0);c.set(i+(S+.5)*n,so,i+(M+.5)*n),l.set(n,Math.max(.02,T-so),n),o.identity(),g.setMatrixAt(x,a.compose(c,o,l)),g.setColorAt(x,h.setScalar(.92+Cp(S,M)*.14))}),g.castShadow=!m.liquid,g.receiveShadow=!0,g.userData.terrain=!0,this.group.add(g),this.meshes.push(g),p.ramps.length){let b=new di(Q1,[f,y],p.ramps.length);p.ramps.forEach((x,v)=>{let S=e.tiles[x],M=x%t,T=x/t|0;c.set(i+(M+.5)*n,S.h*ds,i+(T+.5)*n),l.set(n,(S.r||2)*ds,n),o.setFromAxisAngle(d,(S.d||0)*Math.PI/2),b.setMatrixAt(v,a.compose(c,o,l)),b.setColorAt(v,h.setScalar(.92+Cp(M,T)*.14))}),b.castShadow=!0,b.receiveShadow=!0,b.userData.terrain=!0,this._add(b)}}}disposeTerrain(){for(let e of this.meshes)this.group.remove(e),e.isInstancedMesh?(e.dispose(),!e.material.userData?.shared&&!Array.isArray(e.material)&&e.material.dispose()):(e.geometry.dispose(),e.material.dispose());this.meshes=[]}dispose(){this.disposeTerrain(),this.paths.dispose(),this.grass.dispose()}};
var gh = (r="grass",e=0)=>({t:r,h:e,m:"block",d:0,r:2});
var Ns = -4;
var ji = 40;
var Y1 = [[0,1],[1,0],[0,-1],[-1,0]];
var p0 = ["Norte (+Z)","Este (+X)","Sur (-Z)","Oeste (-X)"];
var c0 = {ground:"Seguir el terreno",free:"Alturas libres (rampas y puentes)"};
var h0 = {0:"Sin hierba",1:"Rala",2:"Normal",3:"Densa"};
var Mt = (r="id")=>`${r}_${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-3)}`;
var Rp = {};

// ----------------------------------------------------------------------------
// Aspecto OpenNite: mismos tipos y forma, colores del estilo cartoon de OpenNite.
// ----------------------------------------------------------------------------
const OPENNITE_TILE_COLORS = {
  grass: { top: '#67bf45', side: '#7b819f' },
  dirt: { top: '#dcc493', side: '#a58a63' },
  sand: { top: '#f0dfa4', side: '#d9c58a' },
  stone: { top: '#c3c0d6', side: '#7b819f' },
  brick: { top: '#b3593f', side: '#8a4431' },
  wood: { top: '#b07c42', side: '#8a5f31' },
  snow: { top: '#f4f7fb', side: '#b9c4d2' },
  volcanic: { top: '#5a5153', side: '#3f383a' },
  picon: { top: '#8a4232', side: '#5e2c22' },
  blacksand: { top: '#4d4846', side: '#34302f' },
  water: { top: '#3fb4e6', side: '#cdb98a' },
  lava: { top: '#ff7a26', side: '#c23e12' },
};
const OPENNITE_PATH_COLORS = { dirt: '#dcc493', gravel: '#c9c2b0', stone: '#c4bfb3', road: '#4a4d55', woodBridge: '#b07c42', stoneBridge: '#b9b6b0', roadBridge: '#4a4d55' };
export const EGD_ORIGINAL_TILE_COLORS = Object.fromEntries(Object.entries(mt).map(([k, v]) => [k, { top: v.top, side: v.side }]));
/** Aplica (una vez) la paleta de OpenNite a los tipos de tesela y caminos de EGD. */
export function applyOpenNiteLook() {
  for (const [k, c] of Object.entries(OPENNITE_TILE_COLORS)) if (mt[k]) Object.assign(mt[k], c);
  for (const [k, c] of Object.entries(OPENNITE_PATH_COLORS)) if (hn[k]) hn[k].color = c;
  for (const k of Object.keys(Rp)) delete Rp[k];
}
applyOpenNiteLook();

export const EGD_MAP_FORMAT = 'egd-map';
export const EGD_HEIGHT_STEP = ds; // 0.5 m por unidad de altura
export const EGD_MIN_HEIGHT = Ns;
export const EGD_MAX_HEIGHT = ji;
export const EGD_DIRS = Y1; // 0 = +Z, 1 = +X, 2 = -Z, 3 = -X
export const EGD_DIR_NAMES = p0;
export const EGD_TILE_TYPES = mt;
export const EGD_PATH_TYPES = hn;
export const EGD_PATH_MODES = c0;
export const EGD_GRASS_LEVELS = h0;
export const EGD_GRASS_UNIFORMS = io;
export {
  us as EgdTerrain,
  Hr as egdCreateWorld,
  M0 as egdNormalizeWorld,
  fi as egdTileHeightAt,
  Gi as egdTileIndexAt,
  yh as egdTileCenter,
  hr as egdOrigin,
  Vi as egdTile,
  gh as egdMakeTile,
  Nn as egdMakePath,
  d0 as egdGrassAt,
  gl as egdEnsureGrass,
  yl as egdSetGrass,
};
