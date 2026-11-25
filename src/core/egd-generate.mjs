/**
 * OpenNite - Generador de terreno de Easy Game Developer (mismo código que el
 * motor): llano, colinas, isla, montañas, cañón y San Borondón.
 * Rellena world.tiles de un mundo egd-map. Sin Three.js.
 */
/* eslint-disable */
function dr(r,e="hills",t=1){if(delete r.grass,e==="sanborondon")return Z1(r,t);let n=ml(t),i=r.size;for(let s=0;s<i;s++)for(let a=0;a<i;a++){let o=a/i,l=s/i,c=0,h="grass";if(e==="hills")c=Math.round((n(o*3,l*3)-.4)*12);else if(e==="island"){let d=o-.5,u=l-.5,p=Math.sqrt(d*d+u*u)*2;c=Math.round((n(o*3+10,l*3+10)*.9+.45-p*1.1)*8)}else e==="mountains"?c=Math.round(Math.pow(n(o*2.5,l*2.5),1.6)*26-3):e==="canyon"&&(c=Math.abs(n(o*2,l*2)-.5)<.06?-1:Math.round(3+n(o*5,l*5)*4));e!=="flat"&&(c<0?(h="water",c=-1):c===0?h="sand":c>=14?h="snow":c>=9&&(h="stone")),r.tiles[s*i+a]=gh(h,_t(c,Ns,ji))}}
function Z1(r,e=1){let t=ml(e),n=ml(e+7),i=ml(e+13),s=r.size,a=r.tileSize,o=hr(r),l=s*a/2;for(let c=0;c<s;c++)for(let h=0;h<s;h++){let d=o+(h+.5)*a,u=o+(c+.5)*a,p=d/l,f=u/l,y=(t(p*1.6+5,f*1.6+5)-.5)*.5,g=1-(Math.sqrt(p*p*.95+f*f*1.1)+y)/.88,b=Math.hypot(d-mh[0],u-mh[1])/l,x=Math.max(0,1-b*2.4);x=x*x*24,b<.08&&(x-=(.08-b)/.08*10);let v=(n(p*3+2,f*3+2)-.5)*6,S,M="grass";if(g<=0)S=-1,M="water";else{S=Math.round(1+g*6+v*Math.min(1,g*2)+x),g<.09?(S=Math.min(S,0),M=i(p*5,f*5)>.62?"sand":"blacksand"):S>=17?M="volcanic":S>=13?M=i(p*6,f*6)>.5?"picon":"volcanic":S>=10?M=i(p*7,f*7)>.55?"stone":"grass":n(p*8+9,f*8)>.7&&(M="dirt"),b<.045&&(M="water",S=Math.max(S,12));let T=K1(d,u,$1);if(T<4.5&&g>.05&&b>.12){let I=Math.max(0,Math.round(S*.25));S=T<1.8?I:Math.min(S,I+Math.round((T-1.8)*1.2)),M=T<1.6?"water":"volcanic",M==="water"&&(S=Math.max(0,I))}}r.tiles[c*s+h]=gh(M,_t(S,Ns,ji))}}
function ml(r=1){let e=(i,s)=>{let a=i*374761393+s*668265263+r*1442695041|0;return a=Math.imul(a^a>>>13,1274126177),a^=a>>>16,(a>>>0)/4294967295},t=i=>i*i*(3-2*i),n=(i,s)=>{let a=Math.floor(i),o=Math.floor(s),l=i-a,c=s-o,h=e(a,o),d=e(a+1,o),u=e(a,o+1),p=e(a+1,o+1),f=t(l),y=t(c);return hs(hs(h,d,f),hs(u,p,f),y)};return(i,s,a=4)=>{let o=0,l=1,c=1,h=0;for(let d=0;d<a;d++)o+=n(i*c,s*c)*l,h+=l,l*=.5,c*=2;return o/h}}
function K1(r,e,t){let n=1/0;for(let i=0;i<t.length-1;i++){let[s,a]=t[i],[o,l]=t[i+1],c=o-s,h=l-a,d=c*c+h*h,u=_t(((r-s)*c+(e-a)*h)/d,0,1);n=Math.min(n,Math.hypot(r-s-c*u,e-a-h*u))}return n}
var gh = (r="grass",e=0)=>({t:r,h:e,m:"block",d:0,r:2});
var _t = (r,e,t)=>Math.max(e,Math.min(t,r));
var Ns = -4;
var ji = 40;
var hr = r=>-r.size*r.tileSize/2;
var mh = [8,-14];
var $1 = [[6,-6],[2,8],[0,22],[-1,36],[-2,52]];
var hs = (r,e,t)=>r+(e-r)*t;

export const EGD_GENERATORS = { flat: 'Llano', hills: 'Colinas', island: 'Isla', mountains: 'Montañas', canyon: 'Cañón', sanborondon: 'San Borondón' };
/** Genera el terreno de `world` (igual que "Generar" en EGD). */
export function egdGenerate(world, kind = 'island', seed = 1) { dr(world, kind, seed); return world; }
