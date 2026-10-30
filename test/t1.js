const path=require('path'),fs=require('fs');
global.THREE=require('../pkg/node_modules/three/build/three.cjs');
global.window=global;
const src=['00-core','10-csg','20-geo'].map(f=>fs.readFileSync(path.join(__dirname,'../src',f+'.js'),'utf8')).join('\n');
const F=new Function(src+'\nreturn F;')();
const T=THREE;
function volume(g){ // signed volume of non-indexed/indexed mesh
  const p=g.attributes.position,idx=g.index; let v=0; const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  const n=idx?idx.count:p.count;
  for(let i=0;i<n;i+=3){const ia=idx?idx.getX(i):i,ib=idx?idx.getX(i+1):i+1,ic=idx?idx.getX(i+2):i+2;
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic); v+=a.dot(b.clone().cross(c))/6;}
  return v;}
let fails=0; function ok(c,m){ if(!c){console.log('FAIL',m);fails++;} else console.log('ok  ',m); }
const mk=(g,x=0)=>{const m=new T.Mesh(g,new T.MeshBasicMaterial());m.position.x=x;m.updateMatrixWorld(true);return m;};
// Box 2x2x2 minus cylinder r=.5 h=4 along Y -> volume 8 - pi*.25*2
const A=mk(new T.BoxGeometry(2,2,2)), B=mk(new T.CylinderGeometry(.5,.5,4,48));
let t=Date.now();
const sub=F.csg.run('subtract',A,B); console.log('subtract tris',sub.attributes.position.count/3,'ms',Date.now()-t);
const expect=8-Math.PI*.25*2;
ok(Math.abs(volume(sub)-expect)<0.02,'subtract volume '+volume(sub).toFixed(4)+' vs '+expect.toFixed(4));
const uni=F.csg.run('union',mk(new T.BoxGeometry(2,2,2)),mk(new T.BoxGeometry(2,2,2),1));
ok(Math.abs(volume(uni)-12)<1e-3,'union volume '+volume(uni));
const int=F.csg.run('intersect',mk(new T.BoxGeometry(2,2,2)),mk(new T.BoxGeometry(2,2,2),1));
ok(Math.abs(volume(int)-4)<1e-3,'intersect volume '+volume(int));
// sphere - box
const S=mk(new T.SphereGeometry(1,32,16)), Bx=mk(new T.BoxGeometry(1,1,1),.5);
const s2=F.csg.run('subtract',S,Bx); const vs=volume(s2); console.log('sphere-box vol',vs, 'sphere', 4/3*Math.PI);
ok(vs<4/3*Math.PI && vs>3.0,'sphere minus box plausible');
// geo ops
const sph=new T.SphereGeometry(1,16,12);
const w=F.geo.weld(sph,false); ok(w.index && w.attributes.position.count< sph.attributes.position.count,'weld reduces verts '+sph.attributes.position.count+' -> '+w.attributes.position.count);
const ls=F.geo.subdivideLoop(new T.BoxGeometry(2,2,2)); console.log('loop box verts',ls.attributes.position.count,'tris',ls.index.count/3);
ok(ls.index.count/3===12*4,'loop subdiv triangles x4');
// loop subdiv of a box should shrink (rounded)
let corners=0;const lp=ls.attributes.position;for(let i=0;i<lp.count;i++){if(Math.abs(lp.getX(i))>0.9999&&Math.abs(lp.getY(i))>0.9999&&Math.abs(lp.getZ(i))>0.9999)corners++;} ok(corners===0,'loop subdiv rounds corners');
const fl=F.geo.subdivideFlat(new T.BoxGeometry(1,1,1)); ok(fl.index.count/3===12*4,'flat subdiv x4 (uv kept? '+!!fl.attributes.uv+')');
const sm=F.geo.smooth(new T.IcosahedronGeometry(1,2),2,0.5); ok(sm.index!=null,'smooth ok');
const m=F.geo.mirror(new T.BoxGeometry(1,1,1).translate(1,0,0),0,false); m.computeBoundingBox(); ok(Math.abs(m.boundingBox.min.x+1.5)<1e-5 && Math.abs(m.boundingBox.max.x-1.5)<1e-5,'mirror bbox');
ok(Math.abs(volume(m)-2)<1e-4,'mirror volume positive '+volume(m));
const ar=F.geo.array(new T.BoxGeometry(1,1,1),4,[2,0,0]); ar.computeBoundingBox(); ok(Math.abs(ar.boundingBox.max.x-6.5)<1e-5,'array bbox');
const sh=F.geo.shell(new T.SphereGeometry(1,24,16),0.1); const vsh=volume(sh); ok(Math.abs(vsh-(4/3*Math.PI*(1-0.729)))<0.15,'shell volume '+vsh.toFixed(3));
const cyl=new T.CylinderGeometry(.5,.5,2,16,8); const c0=cyl.clone(); F.geo.deform(cyl,'twist',90); ok(cyl.attributes.position.count===c0.attributes.position.count,'twist keeps count');
const bd=new T.BoxGeometry(.5,2,.5,1,16,1); F.geo.deform(bd,'bend',90); bd.computeBoundingBox(); ok(bd.boundingBox.max.x>0.3,'bend moved x '+bd.boundingBox.max.x);
const uvb=F.geo.uv(new T.BoxGeometry(1,1,1),'box',1); ok(uvb.attributes.uv.count===36,'box uv');
const o=mk(new T.BoxGeometry(1,1,1),3); F.geo.bake(o); o.geometry.computeBoundingBox(); ok(Math.abs(o.geometry.boundingBox.min.x-2.5)<1e-6 && o.position.x===0,'bake');
const j=F.geo.joined([mk(new T.BoxGeometry(1,1,1),0),mk(new T.BoxGeometry(1,1,1),4)]); ok(j.attributes.position.count===72,'joined');
console.log(fails?('FAILS '+fails):'ALL OK');
