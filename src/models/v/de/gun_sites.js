import * as THREE from 'three';
import { Parts, V, box, rbox, rod, sphere, projectUV, grainTextures, woodTextures } from '../../kit.js';
import { fbm, mulberry32 } from '../../../noise.js';
import { addP, sandbagWall, siteMats } from './vweap_kit.js';

// Static scenery for a firing position. Forward is -Z, matching the gun rigs.
// Keep the middle open for traverse, recoil, crews and the muzzle blast.
function canvasTexture(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function positionTextures() {
  const size = 256, earth = document.createElement('canvas');
  earth.width = earth.height = size;
  const ctx = earth.getContext('2d'), im = ctx.createImageData(size, size), rnd = mulberry32(914);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Blend opposite noise samples so the metre-scaled soil tile has no seams.
    const u = x / size, v = y / size;
    const noise = (f) => (1-u)*(1-v)*fbm(u*f,v*f,3,21) + u*(1-v)*fbm((u-1)*f,v*f,3,21)
      + (1-u)*v*fbm(u*f,(v-1)*f,3,21) + u*v*fbm((u-1)*f,(v-1)*f,3,21);
    const k = 1 + noise(5) * 0.65 + noise(24) * 0.35 + (rnd()-0.5)*0.2;
    const i = (y*size+x)*4;
    im.data[i] = 107*k; im.data[i+1] = 94*k; im.data[i+2] = 72*k; im.data[i+3] = 255;
  }
  ctx.putImageData(im,0,0);
  const ground = document.createElement('canvas'); ground.width = ground.height = size;
  const gc = ground.getContext('2d'), gi = gc.createImageData(size,size);
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const i=(y*size+x)*4, r=Math.hypot((x-128)/128,(y-128)/128);
    const edge=fbm(x/24,y/24,3,54)*0.22;
    gi.data[i]=im.data[i]; gi.data[i+1]=im.data[i+1]; gi.data[i+2]=im.data[i+2];
    gi.data[i+3]=Math.max(0,Math.min(1,(0.98-r+edge)*3.5))*230;
  }
  gc.putImageData(gi,0,0);
  const net = document.createElement('canvas'); net.width=net.height=512;
  const nc=net.getContext('2d');
  nc.strokeStyle='#5b5940'; nc.lineWidth=1.7;
  // Open knotted mesh remains visible between irregular strips of dyed hessian.
  for(let a=-512;a<=1024;a+=32) {
    nc.beginPath(); nc.moveTo(a,0); nc.lineTo(a+512,512); nc.stroke();
    nc.beginPath(); nc.moveTo(a,0); nc.lineTo(a-512,512); nc.stroke();
  }
  const colors=['#4b5332','#646344','#797052','#444b31','#65563d'];
  for(let i=0;i<420;i++) {
    const x=rnd()*512,y=rnd()*512,w=8+rnd()*31,h=5+rnd()*15,a=rnd()*Math.PI;
    // Repeat edge-crossing strips to avoid a visible border on tiled nets.
    for(const dx of [-512,0,512]) for(const dy of [-512,0,512]) {
      nc.save(); nc.translate(x+dx,y+dy); nc.rotate(a); nc.fillStyle=colors[i%colors.length];
      nc.beginPath(); nc.moveTo(-w/2,-h/3); nc.lineTo(-w/5,-h/2); nc.lineTo(w/2,-h/4);
      nc.lineTo(w/3,h/2); nc.lineTo(0,h/4); nc.lineTo(-w/2,h/2); nc.closePath(); nc.fill();
      nc.restore();
    }
  }
  return { earth:canvasTexture(earth), ground:canvasTexture(ground,false), net:canvasTexture(net) };
}

let sharedMats;
function mats() {
  if(sharedMats) return sharedMats;
  const t=positionTextures(), grain=grainTextures(), wood=woodTextures();
  const std=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:1,vertexColors:true,...extra});
  return sharedMats={
    ...siteMats(),
    earth:std(0xffffff,{map:t.earth,bumpMap:grain.rough,bumpScale:0.055,side:THREE.DoubleSide}),
    ground:std(0xffffff,{map:t.ground,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),
    cut:std(0x2d2b23,{map:t.earth}),
    timber:std(0xa79b80,{map:wood.map,normalMap:wood.normal,roughnessMap:wood.rough}),
    rope:std(0x69644a,{normalMap:grain.normal}),
    scrub:std(0x555d39,{map:t.earth,side:THREE.DoubleSide}),
    net:std(0xffffff,{map:t.net,alphaTest:0.35,side:THREE.DoubleSide}),
    strap:std(0x33372e,{metalness:0.45,roughness:0.8}),
  };
}

function earthPart(P,key,g,tint=0xffffff) {
  g=g.index?g.toNonIndexed():g;
  if(!g.attributes.normal) g.computeVertexNormals();
  projectUV(g,2.2);
  P.add(key,g,{uv:true,tint});
}

function groundPatch(P,x,z,w,d,angle=0) {
  const g=new THREE.PlaneGeometry(w,d).rotateX(-Math.PI/2).rotateY(angle).translate(x,0.025,z);
  P.add('ground',g,{uv:true});
}

function berm(P,x,z,length,across,height,rnd) {
  // A continuous eroded profile: soft toes, ragged crest and tapered ends.
  const n=Math.max(6,Math.ceil(length/0.6)), lateral=[-1.18,-0.78,-0.36,0.05,0.39,0.82,1.21];
  const profile=[0,0.35,0.87,1,0.79,0.28,0], pos=[],idx=[];
  for(let i=0;i<=n;i++) {
    const s=length*(i/n-0.5), taper=Math.min(1,Math.sin(Math.PI*i/n)*3.2);
    for(let j=0;j<lateral.length;j++) {
      const v=lateral[j]*(0.91+rnd()*0.18), h=height*profile[j]*taper*(0.9+rnd()*0.18)-0.035;
      pos.push(across?x+s:x+v,h,across?z+v:z+s);
    }
  }
  for(let i=0;i<n;i++) for(let j=0;j<lateral.length-1;j++) {
    const a=i*lateral.length+j,b=a+lateral.length;
    if(across) idx.push(a,a+1,b,a+1,b+1,b); else idx.push(a,b,a+1,a+1,b,b+1);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
  earthPart(P,'earth',g);
  groundPatch(P,x,z,across?length+2:3.6,across?3.6:length+2);
  // Loose spoil breaks the boundary of the embankment without a row of identical rocks.
  for(let i=0;i<length*1.8;i++) {
    const s=(rnd()-0.5)*length,v=(rnd()<0.5?-1:1)*(0.8+rnd()*0.65),r=0.07+rnd()*0.16;
    earthPart(P,'earth',sphere(1,across?x+s:x+v,0.025,across?z+v:z+s,r,r*0.4,r*0.7,5),0xc2b59b);
  }
}

function brush(P,x,z,rnd,size=1) {
  // Cut branches pushed into the parapet: visible twigs and flat sprays of leaves.
  for(let i=0;i<3;i++) {
    const a=rnd()*Math.PI*2,h=(0.45+rnd()*0.55)*size;
    const top=V(x+Math.cos(a)*0.3*size,h,z+Math.sin(a)*0.3*size);
    P.add('timber',rod(V(x,0.04,z),top,0.018*size,5));
    for(let j=0;j<4;j++) {
      const p=V(x,0.04,z).lerp(top,0.35+j*0.17),b=a+j*2.4;
      const tip=p.clone().add(V(Math.cos(b)*0.28*size,0.1*size,Math.sin(b)*0.28*size));
      P.add('timber',rod(p,tip,0.007*size,4));
      const leaf=new THREE.CircleGeometry((0.11+rnd()*0.07)*size,5);
      leaf.scale(1,0.45,1).rotateX(-0.5-rnd()).rotateY(b).translate(tip.x,tip.y,tip.z);
      earthPart(P,'scrub',leaf,rnd()<0.35?0xc1af7b:0xffffff);
    }
  }
}

function net(P,x0,x1,z0,z1,y,rnd) {
  // Subdivided net sags consistently in two axes; the cutout texture casts a dappled shadow.
  const nx=Math.max(5,Math.ceil((x1-x0)/0.5)),nz=Math.max(5,Math.ceil((z1-z0)/0.5));
  const point=(u,v)=>V(x0+(x1-x0)*u,y-0.12*u-0.3*Math.sin(Math.PI*u)-0.22*Math.sin(Math.PI*v),z0+(z1-z0)*v);
  for(const u of [0,1]) for(const v of [0,1]) {
    const p=point(u,v);
    P.add('timber',rod(V(p.x,0,p.z),p.clone().add(V(0,0.13,0)),0.048,7));
    const anchor=V(p.x+(u?0.65:-0.65),0.06,p.z+(v?0.4:-0.4));
    P.add('rope',rod(p,anchor,0.009,4));
    P.add('timber',rod(anchor.clone().add(V(0,-0.04,0)),anchor.clone().add(V(0,0.22,0)),0.03,5));
  }
  const pos=[],uv=[],idx=[];
  for(let j=0;j<=nz;j++) for(let i=0;i<=nx;i++) {
    const p=point(i/nx,j/nz); pos.push(p.x,p.y,p.z);uv.push((p.x-x0)/2.4,(p.z-z0)/2.4);
  }
  for(let j=0;j<nz;j++) for(let i=0;i<nx;i++) {
    const a=j*(nx+1)+i,b=a+nx+1;idx.push(a,b,a+1,a+1,b,b+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  P.add('net',g,{uv:true});
  for(const v of [0,1]) for(let i=0;i<nx;i++) P.add('rope',rod(point(i/nx,v),point((i+1)/nx,v),0.014,5));
  for(const u of [0,1]) for(let j=0;j<nz;j++) P.add('rope',rod(point(u,j/nz),point(u,(j+1)/nz),0.014,5));
}

function crate(P,x,z,y=0.08,angle=0) {
  addP(P,'plank',rbox(0.66,0.38,0.94,0.025,x,y+0.19,z,0,angle,0),{tint:0xc5b38b});
  for(const dz of [-0.31,0.31]) {
    P.add('strap',box(0.69,0.018,0.038,x+Math.sin(angle)*dz,y+0.39,z+Math.cos(angle)*dz,0,angle,0));
    for(const dx of [-0.335,0.335]) P.add('strap',box(0.018,0.38,0.038,x+Math.cos(angle)*dx+Math.sin(angle)*dz,y+0.19,z-Math.sin(angle)*dx+Math.cos(angle)*dz,0,angle,0));
  }
}

function store(P,x,z,wide,rnd,covered=true) {
  groundPatch(P,x,z,wide+2.7,5);
  earthPart(P,'cut',box(wide,0.035,2.6,x,0.015,z));
  sandbagWall(P,x-wide/2,z-1.35,x-wide/2,z+1.35,5,0,11);
  sandbagWall(P,x+wide/2,z-1.35,x+wide/2,z+1.35,5,0,13);
  sandbagWall(P,x-wide/2,z+1.35,x+wide/2,z+1.35,5,0,17);
  for(let j=0;j<7;j++) addP(P,'plank',box(wide-0.25,0.045,0.25,x,0.055,z-0.9+j*0.29),{tint:0xb5ad94});
  for(const dx of [-0.78,0,0.78]) crate(P,x+dx,z+0.12,0.08,(rnd()-0.5)*0.08);
  crate(P,x+0.78,z+0.12,0.47,0.035);
  // A timber-lined ammunition niche at the back, its dark opening under a bagged roof.
  for(const dx of [-0.65,0.65]) addP(P,'plank',box(0.1,0.5,0.68,x+dx,0.96,z+0.96));
  addP(P,'plank',box(1.42,0.1,0.72,x,1.23,z+0.96));
  earthPart(P,'cut',box(1.2,0.47,0.035,x,0.96,z+1.28));
  sandbagWall(P,x-0.75,z+0.96,x+0.75,z+0.96,1,1.28,27);
  if(covered) net(P,x-wide/2-0.15,x+wide/2+0.15,z-1.5,z+1.5,2.55,rnd);
}

function trench(P,x,z,length,rnd) {
  groundPatch(P,x,z,4,length+2);
  earthPart(P,'cut',box(1.5,0.035,length,x,0.018,z));
  for(const s of [-1,1]) {
    berm(P,x+s*1.1,z,length,false,0.55,rnd);
    for(let row=0;row<3;row++) addP(P,'plank',box(0.07,0.13,length-0.3,x+s*0.67,0.13+row*0.145,z),{tint:0xc1b79c});
    for(let t=-length/2+0.5;t<length/2;t+=0.7) P.add('timber',box(0.09,0.58,0.09,x+s*0.6,0.29,z+t));
  }
  for(let t=-length/2+0.15;t<length/2;t+=0.3) addP(P,'plank',box(1.05,0.035,0.23,x,0.06,z+t),{tint:0xaaa18b});
  for(let t=0;t<length/2;t+=0.28) P.add('timber',rod(V(x-1.1,0.62,z+t),V(x+1.1,0.62,z+t),0.09,7));
  berm(P,x,z+length/4,length/2+0.25,false,0.85,rnd);
}

export function buildGermanGunSite(kind, seed = 1) {
  const rnd = mulberry32(seed * 173 + 43), P = new Parts(mats());
  const root = new THREE.Group();
  root.name = `${kind}-position`;
  const heavy = kind === 'k18' || kind === 'mrs18' || kind === 'bertha';
  const mobile = kind === 'karl';
  const rocket = kind === 'nbw41';
  // the leFH 18's trails swing with a traverse past 25 degrees (its carriage group): at 60 degrees a spade reaches
  // 3.9 m out, so its walls (posts at side - 0.69) stand wider
  const side = kind === 'bertha' ? 7.3 : heavy ? 5.7 : rocket ? 3.2 : mobile ? 7.5 : kind === 'sfh18' ? 4.2 : kind === 'lefh18' ? 4.7 : 3.5;
  const front = kind === 'bertha' ? -5.7 : heavy ? -4.6 : rocket ? -2.7 : mobile ? -8 : -3.4;
  const rear = kind === 'bertha' ? 8.8 : heavy ? 8.6 : rocket ? 3.8 : mobile ? 9 : kind === 'sfh18' ? 6.8 : 5.8;
  groundPatch(P, 0, (front + rear) / 2, side * 2 + 2.4, rear - front + 6);
  // Two compressed wheel tracks continue through the open entrance.
  for (const s of [-1, 1]) groundPatch(P, s * (mobile ? 2.4 : 1.05), rear - 0.2, mobile ? 1.5 : 0.65, 7.5);
  if (mobile) {
    // The Karl drives between positions: a screened hardstanding, no enclosed gun pit.
    for (const s of [-1, 1]) {
      berm(P, s * side, 0, 10, false, 0.55, rnd);
      for (let z = -4.5; z <= 5; z += 1.4) brush(P, s * (side + 0.3), z, rnd, 1.1);
    }
    store(P, side + 3.5, rear - 1.5, 3, rnd, false);
  } else {
    // Low parapets along the flanks; the front gap and rear path stay clear.
    for (const s of [-1, 1]) {
      berm(P, s * side, (front + rear) / 2, rear - front, false, heavy ? 0.95 : rocket ? 0.45 : 0.72, rnd);
      const wallH = heavy ? 0.76 : rocket ? 0.3 : 0.55;
      for (let row = 0; row < Math.ceil(wallH / 0.16); row++) {
        for (let z = front + 0.3; z < rear - 0.3; z += 2.1) {
          const len = Math.min(2.04, rear - 0.3 - z);
          if (len > 0.05) addP(P, 'plank', box(0.08, 0.145, len,
            s * (side - 0.52), 0.08 + row * 0.16, z + len / 2), { tint: rnd() < 0.4 ? 0xb8ab8c : 0xd0c4a5 });
        }
      }
      for (let z = front + 0.7; z < rear - 0.6; z += 1.25) {
        P.add('timber', box(0.14, wallH + 0.18, 0.14, s * (side - 0.62), (wallH + 0.18) / 2, z, 0, 0, s * 0.035));
        P.add('strap', box(0.018, 0.06, 0.16, s * (side - 0.7), wallH - 0.08, z));
      }
      if (!rocket) {
        // Short bagged shoulders guard the crew without enclosing the traverse sector.
        sandbagWall(P, s * side, rear - 3.2, s * side, rear - 0.5, 2, heavy ? 0.8 : 0.59, seed + (s > 0 ? 33 : 34));
      }
      for (let z = front + 1; z < rear; z += 1.4 + rnd() * 0.9) {
        if (rnd() > 0.16) brush(P, s * (side + 0.5 + rnd() * 0.3), z, rnd, (rocket ? 0.65 : 0.85) + rnd() * 0.4);
      }
    }
    if (!rocket) {
      berm(P, -(side + 1.4) / 2, front, side - 1.4, true, 0.55, rnd);
      berm(P, (side + 1.4) / 2, front, side - 1.4, true, 0.55, rnd);
      trench(P, -side - 2.5, rear + 1.2, heavy ? 5.2 : 4.1, rnd);
    }
    const storeZ = rear + (rocket ? 3.2 : 2.6);
    store(P, side + 2.8, storeZ, rocket ? 2.7 : 3.2, rnd, !rocket);
    if (rocket) {
      // Launcher exhaust and the heavy smoke demand an open top and clear rear.
      sandbagWall(P, -side + 0.5, rear, -1.3, rear, 2, 0, seed + 20);
      sandbagWall(P, 1.3, rear, side - 0.5, rear, 2, 0, seed + 21);
    } else {
      net(P, -side + 0.25, side - 0.25, rear - 0.7, rear + 2.5, heavy ? 3.2 : 2.7, rnd);
    }
  }
  P.build(root, { dirt: 0.12 });
  // Blended ground overlays receive light but must not cast rectangular shadows.
  const ground = root.getObjectByName('ground');
  if (ground) { ground.castShadow = false; ground.renderOrder = 1; }
  return { root };
}
