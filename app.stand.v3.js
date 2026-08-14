const BALL_MM = 42.67;
const TILT_LIMIT = 1.5;
const STABLE_MS = 1000;
const screens = [...document.querySelectorAll('.screen')];
const video = document.querySelector('#camera');
const captureCanvas = document.querySelector('#captureCanvas');
const photoCanvas = document.querySelector('#photoCanvas');
const ctx = photoCanvas.getContext('2d');
let stream = null, image = null, points = [], stableSince = 0, lastMotion = 0, counting = false, captured = false, gravityAvailable = false;
let ballMode = 'auto', ballCandidate = null, searchRegion = null;
let draggedPoint = -1;
let dragOffset = {x:0,y:0};
let currentHorizontalTilt = 0, captureHorizontalTilt = null, shaftDetection = null;

function show(id){ screens.forEach(s=>s.classList.toggle('active',s.id===id)); }
function stopCamera(){ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=null; window.removeEventListener('deviceorientation',onOrientation); window.removeEventListener('devicemotion',onMotion); }

async function requestSensors(){
  try{
    if(typeof window.DeviceOrientationEvent?.requestPermission==='function'){
      const state=await window.DeviceOrientationEvent.requestPermission();
      if(state!=='granted') return false;
    }
    if(typeof window.DeviceMotionEvent?.requestPermission==='function') await window.DeviceMotionEvent.requestPermission();
    window.addEventListener('deviceorientation',onOrientation,true);
    window.addEventListener('devicemotion',onMotion,true);
    return true;
  }catch{return false;}
}

function onMotion(e){
  const gravity=e.accelerationIncludingGravity;
  if(gravity&&gravity.x!=null&&gravity.y!=null&&gravity.z!=null){
    gravityAvailable=true;
    const gx=gravity.x,gy=gravity.y,gz=gravity.z;
    const tiltX=Math.atan2(gx,Math.hypot(gy,gz))*180/Math.PI;
    const tiltY=Math.atan2(gz,Math.hypot(gx,gy))*180/Math.PI;
    updateLevel(tiltX,tiltY);
  }
  const a=e.acceleration;
  if(a){
    const movement=Math.hypot(a.x||0,a.y||0,a.z||0);
    if(movement>.35){lastMotion=performance.now();stableSince=0;cancelCountdown();}
  }
}

async function startCamera(){
  captured=false; stableSince=0; counting=false; gravityAvailable=false; currentHorizontalTilt=0; captureHorizontalTilt=null; shaftDetection=null; show('cameraScreen');
  try{
    await requestSensors();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
    video.srcObject=stream; await video.play();
  }catch(err){
    stopCamera(); show('homeScreen');
    alert('카메라를 열 수 없습니다. 카메라 권한을 허용하거나 기존 사진을 불러와 주세요.');
  }
}

function onOrientation(e){
  if(captured||gravityAvailable) return;
  updateLevel(e.gamma??99,Math.abs(e.beta??0)-90);
}

function updateLevel(x,y){
  if(captured)return;
  currentHorizontalTilt=x;
  const level=document.querySelector('#level');
  const title=document.querySelector('#levelTitle');
  const detail=document.querySelector('#levelDetail');
  const horizontalTrack=document.querySelector('#horizontalTrack'),verticalTrack=document.querySelector('#verticalTrack');
  const horizontalMarker=document.querySelector('#horizontalMarker'),verticalMarker=document.querySelector('#verticalMarker');
  const radarLimit=12.5,normalizedX=Math.max(-1,Math.min(1,x/radarLimit)),normalizedY=Math.max(-1,Math.min(1,y/radarLimit));
  level.querySelector('i').style.transform=`translate(${normalizedX*25}px,${normalizedY*25}px)`;
  const markerPosition=normalized=>50+normalized*46;
  horizontalMarker.style.left=`${markerPosition(normalizedX)}%`;verticalMarker.style.top=`${markerPosition(normalizedY)}%`;
  document.querySelector('#horizontalValue').textContent=`${x>=0?'+':''}${x.toFixed(1)}°`;
  document.querySelector('#verticalValue').textContent=`${y>=0?'+':''}${y.toFixed(1)}°`;
  horizontalTrack.classList.toggle('ok',Math.abs(x)<=TILT_LIMIT);verticalTrack.classList.toggle('ok',Math.abs(y)<=TILT_LIMIT);
  const ok=Math.abs(x)<=TILT_LIMIT&&Math.abs(y)<=TILT_LIMIT;
  level.classList.toggle('ok',ok);
  if(ok){
    title.textContent='수직이 맞았습니다'; detail.textContent=`좌우 ${x.toFixed(1)}° · 앞뒤 ${y.toFixed(1)}° — 움직이지 마세요`;
    if(!stableSince) stableSince=performance.now();
    if(performance.now()-stableSince>=STABLE_MS&&performance.now()-lastMotion>=STABLE_MS&&!counting) autoCountdown();
  }else{
    stableSince=0; cancelCountdown(); title.textContent='휴대폰을 수직으로 세워주세요';
    detail.textContent=`좌우 ${x.toFixed(1)}° · 앞뒤 ${y.toFixed(1)}° (허용 ±${TILT_LIMIT}°)`;
  }
}

async function autoCountdown(){
  counting=true; const el=document.querySelector('#countdown');
  for(let n=3;n>0;n--){ if(!counting)return; el.textContent=n; navigator.vibrate?.(35); await new Promise(r=>setTimeout(r,1000)); }
  if(counting) takePhoto();
}
function cancelCountdown(){ counting=false; document.querySelector('#countdown').textContent=''; }

function takePhoto(){
  if(captured||!video.videoWidth)return; captured=true; cancelCountdown();
  captureHorizontalTilt=currentHorizontalTilt;
  const frame=document.querySelector('.frame').getBoundingClientRect(),videoRect=video.getBoundingClientRect();
  const sourceWidth=video.videoWidth,sourceHeight=video.videoHeight,coverScale=Math.max(videoRect.width/sourceWidth,videoRect.height/sourceHeight);
  const renderedWidth=sourceWidth*coverScale,renderedHeight=sourceHeight*coverScale;
  const cropX=(frame.left-videoRect.left+(renderedWidth-videoRect.width)/2)/coverScale;
  const cropY=(frame.top-videoRect.top+(renderedHeight-videoRect.height)/2)/coverScale;
  const cropWidth=frame.width/coverScale,cropHeight=frame.height/coverScale;
  const sx=Math.max(0,Math.min(sourceWidth-1,cropX)),sy=Math.max(0,Math.min(sourceHeight-1,cropY));
  const sw=Math.max(1,Math.min(sourceWidth-sx,cropWidth)),sh=Math.max(1,Math.min(sourceHeight-sy,cropHeight));
  captureCanvas.width=Math.round(sw);captureCanvas.height=Math.round(sh);
  captureCanvas.getContext('2d').drawImage(video,sx,sy,sw,sh,0,0,captureCanvas.width,captureCanvas.height);
  loadImage(captureCanvas.toDataURL('image/jpeg',.94));stopCamera();
}

function loadImage(src,cleanup){
  const img=new Image();
  img.onload=()=>{image=img;points=[];ballMode='auto';ballCandidate=null;searchRegion=null;shaftDetection=null;draggedPoint=-1;document.querySelector('#ballConfirm').hidden=true;document.querySelector('#adjustPanel').hidden=true;document.querySelector('#canvasWrap').classList.remove('adjusting');draw();show('measureScreen');updateStep();cleanup?.();};
  img.onerror=()=>{cleanup?.();alert('사진을 불러오지 못했습니다. JPG, PNG 또는 WebP 사진으로 다시 시도해 주세요.');};
  img.src=src;
}
function draw(){
  if(!image)return; photoCanvas.width=image.naturalWidth||image.width; photoCanvas.height=image.naturalHeight||image.height; ctx.drawImage(image,0,0);
  if(searchRegion){
    ctx.save();ctx.beginPath();ctx.rect(0,0,photoCanvas.width,photoCanvas.height);ctx.arc(searchRegion.x,searchRegion.y,searchRegion.radius,0,Math.PI*2,true);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fill('evenodd');
    ctx.beginPath();ctx.arc(searchRegion.x,searchRegion.y,searchRegion.radius,0,Math.PI*2);ctx.setLineDash([14,10]);ctx.lineWidth=Math.max(4,photoCanvas.width/350);ctx.strokeStyle='#fff';ctx.stroke();ctx.restore();
  }
  if(ballCandidate){ctx.save();ctx.beginPath();ctx.arc(ballCandidate.x,ballCandidate.y,ballCandidate.radius,0,Math.PI*2);ctx.lineWidth=Math.max(3,photoCanvas.width/520);ctx.strokeStyle='rgba(185,255,61,.88)';ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=4;ctx.stroke();ctx.restore();}
  const colors=['#b9ff3d','#b9ff3d','#ff633f','#ff633f'];
  points.forEach((p,i)=>{
    const putterPoint=i>=2;
    if(!putterPoint){const radius=Math.max(7,photoCanvas.width/170);ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fillStyle='rgba(185,255,61,.38)';ctx.fill();ctx.lineWidth=Math.max(2,photoCanvas.width/600);ctx.strokeStyle='rgba(255,255,255,.8)';ctx.stroke();return;}
    const radius=Math.max(52,photoCanvas.width/11),stroke=Math.max(7,photoCanvas.width/180),accent=draggedPoint===i?'#ffe45e':'#ff633f';
    ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.lineWidth=stroke;ctx.strokeStyle=accent;ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.x-radius*.45,p.y);ctx.lineTo(p.x+radius*.45,p.y);ctx.moveTo(p.x,p.y-radius*.45);ctx.lineTo(p.x,p.y+radius*.45);ctx.lineWidth=Math.max(4,stroke*.55);ctx.strokeStyle='#fff';ctx.stroke();
    ctx.restore();
  });
  if(points.length>=2){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.strokeStyle='rgba(185,255,61,.48)';ctx.lineWidth=Math.max(2,photoCanvas.width/600);ctx.stroke();}
  if(points.length>=4){ctx.save();ctx.beginPath();ctx.moveTo(points[2].x,points[2].y);ctx.lineTo(points[3].x,points[3].y);ctx.strokeStyle='rgba(255,99,63,.75)';ctx.setLineDash([Math.max(14,photoCanvas.width/80),Math.max(10,photoCanvas.width/120)]);ctx.lineWidth=Math.max(5,photoCanvas.width/220);ctx.stroke();ctx.restore();}
  if(shaftDetection?.ok){
    const {start,end}=shaftDetection;
    ctx.save();ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.strokeStyle='rgba(71,224,255,.96)';ctx.lineWidth=Math.max(5,photoCanvas.width/260);ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=5;ctx.stroke();
    ctx.setLineDash([Math.max(12,photoCanvas.width/100),Math.max(8,photoCanvas.width/140)]);ctx.lineWidth=Math.max(2,photoCanvas.width/520);ctx.beginPath();ctx.moveTo(shaftDetection.groundStart.x,shaftDetection.groundStart.y);ctx.lineTo(shaftDetection.groundEnd.x,shaftDetection.groundEnd.y);ctx.strokeStyle='rgba(185,255,61,.82)';ctx.stroke();ctx.restore();
  }
}
function updateStep(){
  const title=document.querySelector('#stepTitle'),help=document.querySelector('#stepHelp'),panel=document.querySelector('#adjustPanel'),panelTitle=panel.querySelector('b'),panelHelp=panel.querySelector('span'),confirm=document.querySelector('#confirmPutter');
  let stage=1;
  if(points.length<2&&ballMode==='auto'&&!ballCandidate){title.textContent='골프공을 터치하세요';help.textContent='공이 들어 있는 영역을 터치하면 실제 외곽을 자동으로 찾습니다.';}
  else if(points.length<2){title.textContent='검출된 골프공을 확인하세요';help.textContent='초록색 원이 공 외곽과 맞으면 확인하고, 아니면 다시 선택하세요.';}
  else if(points.length===2){stage=2;title.textContent='퍼터 그립 끝을 선택하세요';help.textContent='그립의 가장 아래쪽 끝을 한 번 터치하세요.';}
  else if(points.length===3){stage=3;title.textContent='퍼터 솔의 바닥 기준점을 선택하세요';help.textContent='퍼터 헤드 바닥면이 지면에 닿는 기준점을 터치하세요.';}
  else{stage=4;title.textContent='선택점 위치를 보정하세요';help.textContent='주황색 두 점을 드래그해 맞춘 뒤 측정 버튼을 누르세요.';}
  panel.hidden=points.length<2;confirm.disabled=points.length<4;
  if(points.length===2){panelTitle.textContent='퍼터 그립 끝을 선택하세요';panelHelp.textContent='사진에서 그립의 가장 아래쪽 끝을 터치하세요.';confirm.textContent='두 점을 선택하면 측정할 수 있습니다';}
  else if(points.length===3){panelTitle.textContent='퍼터 솔의 바닥 기준점을 선택하세요';panelHelp.textContent='헤드 바닥면이 지면에 닿는 기준점을 터치하세요.';confirm.textContent='바닥 기준점을 선택해 주세요';}
  else if(points.length>=4){panelTitle.textContent='측정 기준점을 보정하세요';panelHelp.textContent='주황색 두 점을 그립 끝과 솔의 바닥 기준점에 맞추세요.';confirm.textContent='이 위치로 측정';}
  document.querySelector('#tapHint').textContent=stage;document.querySelector('#tapHint').hidden=stage===4;document.querySelector('#progressBar').style.width=`${stage*25}%`;
}
function luminance(data,index){return data[index]*.299+data[index+1]*.587+data[index+2]*.114;}
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0;}
function solve3(matrix,vector){
  const a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let col=0;col<3;col++){
    let pivot=col;for(let row=col+1;row<3;row++)if(Math.abs(a[row][col])>Math.abs(a[pivot][col]))pivot=row;
    if(Math.abs(a[pivot][col])<1e-9)return null;
    [a[col],a[pivot]]=[a[pivot],a[col]];
    const divisor=a[col][col];for(let j=col;j<4;j++)a[col][j]/=divisor;
    for(let row=0;row<3;row++)if(row!==col){const factor=a[row][col];for(let j=col;j<4;j++)a[row][j]-=factor*a[col][j];}
  }
  return[a[0][3],a[1][3],a[2][3]];
}
function fitCircle(points){
  if(points.length<8)return null;
  const mx=points.reduce((sum,p)=>sum+p.x,0)/points.length,my=points.reduce((sum,p)=>sum+p.y,0)/points.length;
  let uu=0,uv=0,vv=0,u=0,v=0,uq=0,vq=0,qsum=0;
  for(const p of points){const dx=p.x-mx,dy=p.y-my,q=dx*dx+dy*dy;uu+=dx*dx;uv+=dx*dy;vv+=dy*dy;u+=dx;v+=dy;uq+=dx*q;vq+=dy*q;qsum+=q;}
  const result=solve3([[uu,uv,u],[uv,vv,v],[u,v,points.length]],[-uq,-vq,-qsum]);if(!result)return null;
  const [A,B,C]=result,cx=-A/2,cy=-B/2,radius=Math.sqrt(Math.max(0,cx*cx+cy*cy-C));
  return radius>0&&Number.isFinite(radius)?{x:mx+cx,y:my+cy,radius}:null;
}
function robustCircle(points,step){
  let active=points,fit=null;
  for(let pass=0;pass<3;pass++){
    fit=fitCircle(active);if(!fit)return null;
    const residuals=active.map(p=>Math.abs(Math.hypot(p.x-fit.x,p.y-fit.y)-fit.radius));
    const mad=median(residuals),limit=Math.max(step*1.8,mad*2.8);
    active=active.filter((p,i)=>residuals[i]<=limit);if(active.length<8)return null;
  }
  const error=median(active.map(p=>Math.abs(Math.hypot(p.x-fit.x,p.y-fit.y)-fit.radius)))/fit.radius;
  return{...fit,error,pointCount:active.length};
}
function refineBallOuterEdge(pixels,width,height,initial,step){
  const edgePoints=[],sampleGap=Math.max(2,step*2),minR=initial.radius*.72,maxR=initial.radius*1.42;
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/72){
    const cs=Math.cos(angle),sn=Math.sin(angle);let bestRadius=0,bestScore=0;
    for(let radius=minR;radius<=maxR;radius+=Math.max(1,step)){
      const ix=Math.round(initial.x+cs*(radius-sampleGap)),iy=Math.round(initial.y+sn*(radius-sampleGap));
      const ox=Math.round(initial.x+cs*(radius+sampleGap)),oy=Math.round(initial.y+sn*(radius+sampleGap));
      if(ix<0||iy<0||ox<0||oy<0||ix>=width||ox>=width||iy>=height||oy>=height)continue;
      const score=luminance(pixels,(iy*width+ix)*4)-luminance(pixels,(oy*width+ox)*4);
      if(score>bestScore){bestScore=score;bestRadius=radius;}
    }
    if(bestRadius&&bestScore>10)edgePoints.push({x:initial.x+cs*bestRadius,y:initial.y+sn*bestRadius,radius:bestRadius,score:bestScore});
  }
  if(edgePoints.length<36)return initial;
  const typicalRadius=median(edgePoints.map(p=>p.radius));
  const consistent=edgePoints.filter(p=>Math.abs(p.radius-typicalRadius)<=Math.max(step*3,typicalRadius*.16));
  const refined=robustCircle(consistent,Math.max(1,step));
  if(!refined||refined.error>.08||refined.radius<initial.radius*.88||refined.radius>initial.radius*1.35)return initial;
  return{...refined,baseRadius:refined.radius,score:median(consistent.map(p=>p.score)),method:'outer-edge-circle-fit'};
}
function detectContrastBlob(pixels,width,height,x,y,roiRadius){
  const step=Math.max(1,Math.round(roiRadius/110));
  const centerSamples=[],backgroundSamples=[];
  for(let py=Math.max(0,Math.round(y-roiRadius));py<=Math.min(height-1,Math.round(y+roiRadius));py+=step){
    for(let px=Math.max(0,Math.round(x-roiRadius));px<=Math.min(width-1,Math.round(x+roiRadius));px+=step){
      const d=Math.hypot(px-x,py-y),value=luminance(pixels,(py*width+px)*4);
      if(d<roiRadius*.09)centerSamples.push(value);
      else if(d>roiRadius*.62&&d<roiRadius*.9)backgroundSamples.push(value);
    }
  }
  const centerTone=median(centerSamples),backgroundTone=median(backgroundSamples),contrast=centerTone-backgroundTone;
  if(Math.abs(contrast)<28)return null;
  const bright=contrast>0,threshold=backgroundTone+contrast*.46;
  const cols=Math.ceil(width/step),rows=Math.ceil(height/step),sx=Math.round(x/step),sy=Math.round(y/step);
  const key=(gx,gy)=>gy*cols+gx,seen=new Uint8Array(cols*rows),insideMask=new Uint8Array(cols*rows),queue=[[sx,sy]],component=[];
  let head=0,count=0,sumX=0,sumY=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  while(head<queue.length){
    const [gx,gy]=queue[head++];if(gx<0||gy<0||gx>=cols||gy>=rows||seen[key(gx,gy)])continue;seen[key(gx,gy)]=1;
    const px=Math.min(width-1,gx*step),py=Math.min(height-1,gy*step);if(Math.hypot(px-x,py-y)>roiRadius*.7)continue;
    const value=luminance(pixels,(py*width+px)*4),inside=bright?value>=threshold:value<=threshold;if(!inside)continue;
    insideMask[key(gx,gy)]=1;component.push([gx,gy]);count++;sumX+=px;sumY+=py;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)if(ox||oy)queue.push([gx+ox,gy+oy]);
  }
  if(count<12)return null;
  const diameterX=maxX-minX+step,diameterY=maxY-minY+step,ratio=Math.min(diameterX,diameterY)/Math.max(diameterX,diameterY);
  if(ratio<.68)return null;
  const boundary=component.filter(([gx,gy])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>gx+dx<0||gy+dy<0||gx+dx>=cols||gy+dy>=rows||!insideMask[key(gx+dx,gy+dy)])).map(([gx,gy])=>({x:gx*step,y:gy*step}));
  const circle=robustCircle(boundary,step);if(!circle)return null;
  if(circle.error>.12||circle.radius<roiRadius*.045||circle.radius>roiRadius*.34||Math.hypot(circle.x-x,circle.y-y)>circle.radius*1.25)return null;
  const initial={x:circle.x,y:circle.y,radius:circle.radius,baseRadius:circle.radius,score:Math.abs(contrast),fitError:circle.error,method:'robust-circle-fit'};
  return refineBallOuterEdge(pixels,width,height,initial,step);
}
function findBallInRegion(pixels,width,height,x,y,roiRadius){
  const step=Math.max(1,Math.round(roiRadius/100)),left=Math.max(0,Math.floor(x-roiRadius)),top=Math.max(0,Math.floor(y-roiRadius));
  const right=Math.min(width-1,Math.ceil(x+roiRadius)),bottom=Math.min(height-1,Math.ceil(y+roiRadius));
  const cols=Math.floor((right-left)/step)+1,rows=Math.floor((bottom-top)/step)+1,tones=[];
  const key=(gx,gy)=>gy*cols+gx,mask=new Uint8Array(cols*rows),seen=new Uint8Array(cols*rows);
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const px=left+gx*step,py=top+gy*step;if(Math.hypot(px-x,py-y)>roiRadius*.92)continue;
    tones.push(luminance(pixels,(py*width+px)*4));
  }
  if(tones.length<30)return null;
  const sorted=[...tones].sort((a,b)=>a-b),background=sorted[Math.floor(sorted.length*.5)],brightTone=sorted[Math.floor(sorted.length*.86)];
  const threshold=Math.max(135,background+28,brightTone+5);
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const px=left+gx*step,py=top+gy*step;if(Math.hypot(px-x,py-y)>roiRadius*.92)continue;
    if(luminance(pixels,(py*width+px)*4)>=threshold)mask[key(gx,gy)]=1;
  }
  const candidates=[];
  for(let sy=0;sy<rows;sy++)for(let sx=0;sx<cols;sx++){
    if(!mask[key(sx,sy)]||seen[key(sx,sy)])continue;
    const queue=[[sx,sy]],component=[];seen[key(sx,sy)]=1;
    for(let head=0;head<queue.length;head++){
      const [gx,gy]=queue[head];component.push([gx,gy]);
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        if(!ox&&!oy)continue;const nx=gx+ox,ny=gy+oy;
        if(nx<0||ny<0||nx>=cols||ny>=rows||seen[key(nx,ny)]||!mask[key(nx,ny)])continue;
        seen[key(nx,ny)]=1;queue.push([nx,ny]);
      }
    }
    if(component.length<18)continue;
    let minGX=Infinity,maxGX=-Infinity,minGY=Infinity,maxGY=-Infinity;
    for(const [gx,gy] of component){minGX=Math.min(minGX,gx);maxGX=Math.max(maxGX,gx);minGY=Math.min(minGY,gy);maxGY=Math.max(maxGY,gy);}
    const spanX=(maxGX-minGX+1)*step,spanY=(maxGY-minGY+1)*step;
    const ratio=Math.min(spanX,spanY)/Math.max(spanX,spanY);if(ratio<.62)continue;
    const boundary=component.filter(([gx,gy])=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>gx+dx<0||gy+dy<0||gx+dx>=cols||gy+dy>=rows||!mask[key(gx+dx,gy+dy)])).map(([gx,gy])=>({x:left+gx*step,y:top+gy*step}));
    const circle=robustCircle(boundary,step);if(!circle||circle.error>.15||circle.radius<roiRadius*.025||circle.radius>roiRadius*.28)continue;
    if(Math.hypot(circle.x-x,circle.y-y)+circle.radius>roiRadius*.94)continue;
    const initial={...circle,baseRadius:circle.radius,score:(brightTone-background)*ratio,fitError:circle.error,method:'region-component-circle'};
    const refined=refineBallOuterEdge(pixels,width,height,initial,step);
    candidates.push({...refined,regionScore:refined.radius*ratio/(1+(refined.error||circle.error)*8)});
  }
  candidates.sort((a,b)=>b.regionScore-a.regionScore);return candidates[0]||null;
}
function detectBallAt(x,y){
  const roiRadius=Math.round(Math.min(photoCanvas.width,photoCanvas.height)*.14);
  searchRegion=null;ballCandidate=null;draw();
  const pixels=ctx.getImageData(0,0,photoCanvas.width,photoCanvas.height).data;
  searchRegion={x,y,radius:roiRadius};
  const contrastBall=findBallInRegion(pixels,photoCanvas.width,photoCanvas.height,x,y,roiRadius);
  if(contrastBall){
    ballCandidate=contrastBall;draw();document.querySelector('#ballSize').value='100';document.querySelector('#ballSizeValue').textContent='100%';document.querySelector('#ballConfirm').hidden=false;document.querySelector('#stepTitle').textContent='골프공을 찾았습니다';document.querySelector('#stepHelp').textContent='외곽점에 원의 방정식을 맞췄습니다. 초록색 원을 확인하세요.';return;
  }
  const edgeRadii=[],edgeScores=[];
  const minR=Math.max(8,Math.round(roiRadius*.12)),maxR=Math.round(roiRadius*.78);
  for(let a=0;a<Math.PI*2;a+=Math.PI/36){
    let rayRadius=0,rayScore=0;
    for(let r=minR;r<=maxR;r+=2){
      const cs=Math.cos(a),sn=Math.sin(a),inner=r-3,outer=r+3;
      const x1=Math.round(x+cs*inner),y1=Math.round(y+sn*inner),x2=Math.round(x+cs*outer),y2=Math.round(y+sn*outer);
      if(x1<0||y1<0||x2<0||y2<0||x1>=photoCanvas.width||x2>=photoCanvas.width||y1>=photoCanvas.height||y2>=photoCanvas.height)continue;
      const gradient=Math.abs(luminance(pixels,(y1*photoCanvas.width+x1)*4)-luminance(pixels,(y2*photoCanvas.width+x2)*4));
      const score=gradient*(.8+.2*r/maxR);
      if(score>rayScore){rayScore=score;rayRadius=r;}
    }
    if(rayRadius){edgeRadii.push(rayRadius);edgeScores.push(rayScore);}
  }
  const bestRadius=median(edgeRadii),deviation=median(edgeRadii.map(r=>Math.abs(r-bestRadius))),confidence=median(edgeScores);
  ballCandidate=bestRadius&&confidence>7&&deviation<bestRadius*.38?{x,y,radius:bestRadius,baseRadius:bestRadius,score:confidence}:null;
  draw();
  if(ballCandidate){document.querySelector('#ballSize').value='100';document.querySelector('#ballSizeValue').textContent='100%';document.querySelector('#ballConfirm').hidden=false;document.querySelector('#stepTitle').textContent='골프공을 찾았습니다';document.querySelector('#stepHelp').textContent='슬라이더로 초록색 원을 실제 외곽에 정확히 맞추세요.';}
  else{ballMode='auto';searchRegion=null;alert('골프공 테두리를 찾지 못했습니다. 골프공 중심을 다시 터치하거나 다시 촬영해 주세요.');draw();updateStep();}
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function fitLinePca(samples){
  if(samples.length<2)return null;
  const cx=samples.reduce((s,p)=>s+p.x,0)/samples.length,cy=samples.reduce((s,p)=>s+p.y,0)/samples.length;
  let xx=0,xy=0,yy=0;for(const p of samples){const dx=p.x-cx,dy=p.y-cy;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
  const angle=.5*Math.atan2(2*xy,xx-yy);return{x:cx,y:cy,ux:Math.cos(angle),uy:Math.sin(angle)};
}
function pointLineDistance(p,line){return Math.abs((p.x-line.x)*line.uy-(p.y-line.y)*line.ux);}
function shaftAngleFromLine(line,roll){
  let signed=Math.atan2(-line.uy,line.ux)*180/Math.PI;
  signed=(signed+(roll||0)+360)%180;
  return Math.min(signed,180-signed);
}
function detectShaftLegacy(){
  shaftDetection=null;if(!image||points.length<4)return null;
  const grip=points[2],sole=points[3],dx=sole.x-grip.x,dy=sole.y-grip.y,length=Math.hypot(dx,dy);if(length<80)return null;
  const nx=-dy/length,ny=dx/length,searchHalf=Math.max(18,Math.min(photoCanvas.width*.07,length*.075));
  const sampleCanvas=document.createElement('canvas'),maxSide=1200,scale=Math.min(1,maxSide/Math.max(photoCanvas.width,photoCanvas.height));
  sampleCanvas.width=Math.max(1,Math.round(photoCanvas.width*scale));sampleCanvas.height=Math.max(1,Math.round(photoCanvas.height*scale));
  const sampleCtx=sampleCanvas.getContext('2d',{willReadFrequently:true});sampleCtx.drawImage(image,0,0,sampleCanvas.width,sampleCanvas.height);
  const pixels=sampleCtx.getImageData(0,0,sampleCanvas.width,sampleCanvas.height).data,w=sampleCanvas.width,h=sampleCanvas.height;
  const tone=(x,y)=>{const px=Math.max(0,Math.min(w-1,Math.round(x*scale))),py=Math.max(0,Math.min(h-1,Math.round(y*scale))),i=(py*w+px)*4;return luminance(pixels,i);};
  const candidates=[];
  for(let k=0;k<52;k++){
    const t=.29+k/51*.43,bx=grip.x+dx*t,by=grip.y+dy*t,values=[];
    for(let o=-searchHalf;o<=searchHalf;o+=2)values.push({o,v:(tone(bx+nx*(o-2),by+ny*(o-2))+tone(bx+nx*o,by+ny*o)+tone(bx+nx*(o+2),by+ny*(o+2)))/3});
    const background=median(values.map(v=>v.v)),best=values.reduce((a,b)=>b.v<a.v?b:a),contrast=background-best.v;
    if(contrast>=10)candidates.push({x:bx+nx*best.o,y:by+ny*best.o,weight:contrast});
  }
  if(candidates.length<16)return{ok:false,reason:'샤프트 직선 후보 부족',confidence:0};
  const tolerance=Math.max(3,length*.006);let bestInliers=[];
  for(let a=0;a<candidates.length-5;a++)for(let b=a+5;b<candidates.length;b+=2){
    const p=candidates[a],q=candidates[b],ldx=q.x-p.x,ldy=q.y-p.y,ll=Math.hypot(ldx,ldy);if(ll<length*.12)continue;
    const line={x:p.x,y:p.y,ux:ldx/ll,uy:ldy/ll},angle=shaftAngleFromLine(line,0);if(angle<58||angle>82)continue;
    const inliers=candidates.filter(c=>pointLineDistance(c,line)<=tolerance);if(inliers.length>bestInliers.length)bestInliers=inliers;
  }
  if(bestInliers.length<14)return{ok:false,reason:'일관된 샤프트 중심선 없음',confidence:Math.round(bestInliers.length/candidates.length*100)};
  let line=fitLinePca(bestInliers);if(!line)return null;
  const refined=bestInliers.filter(p=>pointLineDistance(p,line)<=tolerance*.8);if(refined.length>=10){bestInliers=refined;line=fitLinePca(refined);}
  const rawAngle=shaftAngleFromLine(line,0),correctedAngle=shaftAngleFromLine(line,captureHorizontalTilt||0);
  if(rawAngle<60||rawAngle>80)return{ok:false,reason:'검출 각도가 일반 범위를 벗어남',confidence:0,rawAngle};
  const projections=bestInliers.map(p=>(p.x-line.x)*line.ux+(p.y-line.y)*line.uy),minP=Math.min(...projections),maxP=Math.max(...projections);
  const residual=median(bestInliers.map(p=>pointLineDistance(p,line))),coverage=(maxP-minP)/(length*.43),support=bestInliers.length/candidates.length;
  const confidence=Math.max(0,Math.min(99,Math.round((support*.58+Math.min(1,coverage)*.27+Math.max(0,1-residual/tolerance)*.15)*100)));
  return{ok:confidence>=55,reason:confidence>=55?'자동 검출 완료':'검출 신뢰도 부족',rawAngle,correctedAngle,roll:captureHorizontalTilt,confidence,start:{x:line.x+line.ux*minP,y:line.y+line.uy*minP},end:{x:line.x+line.ux*maxP,y:line.y+line.uy*maxP},groundY:sole.y};
}
function detectShaft(){
  shaftDetection=null;if(!image||points.length<4)return null;
  const grip=points[2],sole=points[3],dx=sole.x-grip.x,dy=sole.y-grip.y,length=Math.hypot(dx,dy);if(length<80)return null;
  const ballCenter={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2},ballPx=distance(points[0],points[1]),pxPerMm=ballPx/BALL_MM;if(pxPerMm<=0)return null;
  const rollRad=(captureHorizontalTilt||0)*Math.PI/180,down={x:-Math.sin(rollRad),y:Math.cos(rollRad)},up={x:-down.x,y:-down.y},groundDir={x:down.y,y:-down.x};
  const ground={x:ballCenter.x+down.x*ballPx/2,y:ballCenter.y+down.y*ballPx/2};
  const nx=-dy/length,ny=dx/length,searchHalf=Math.max(22,Math.min(photoCanvas.width*.075,length*.085));
  const sampleCanvas=document.createElement('canvas'),maxSide=1500,scale=Math.min(1,maxSide/Math.max(photoCanvas.width,photoCanvas.height));
  sampleCanvas.width=Math.max(1,Math.round(photoCanvas.width*scale));sampleCanvas.height=Math.max(1,Math.round(photoCanvas.height*scale));
  const sampleCtx=sampleCanvas.getContext('2d',{willReadFrequently:true});sampleCtx.drawImage(image,0,0,sampleCanvas.width,sampleCanvas.height);
  const pixels=sampleCtx.getImageData(0,0,sampleCanvas.width,sampleCanvas.height).data,w=sampleCanvas.width,h=sampleCanvas.height;
  const tone=(x,y)=>{const px=Math.max(0,Math.min(w-1,Math.round(x*scale))),py=Math.max(0,Math.min(h-1,Math.round(y*scale))),i=(py*w+px)*4;return luminance(pixels,i);};
  const sections=[],offsetStep=Math.max(1.5,2/scale),minWidth=Math.max(4,length*.0035),maxWidth=Math.min(searchHalf*1.35,length*.055);
  for(let k=0;k<88;k++){
    const t=.08+k/87*.88,bx=grip.x+dx*t,by=grip.y+dy*t,profile=[];
    for(let o=-searchHalf;o<=searchHalf;o+=offsetStep)profile.push({o,v:(tone(bx+nx*(o-offsetStep),by+ny*(o-offsetStep))+2*tone(bx+nx*o,by+ny*o)+tone(bx+nx*(o+offsetStep),by+ny*(o+offsetStep)))/4});
    let best=null;
    for(let left=1;left<profile.length-3;left++)for(let right=left+2;right<profile.length-1;right++){
      const width=profile[right].o-profile[left].o;if(width<minWidth||width>maxWidth)continue;
      const edgeL=profile[left+1].v-profile[left-1].v,edgeR=profile[right+1].v-profile[right-1].v;if(edgeL*edgeR>=0)continue;
      const middle=Math.round((left+right)/2),inside=profile[middle].v,outside=(profile[Math.max(0,left-2)].v+profile[Math.min(profile.length-1,right+2)].v)/2;
      const contrast=Math.abs(outside-inside),edgeStrength=Math.abs(edgeL)+Math.abs(edgeR),symmetry=1-Math.min(1,Math.abs(Math.abs(edgeL)-Math.abs(edgeR))/Math.max(1,edgeStrength));
      const score=edgeStrength+contrast*.8+symmetry*8;if(contrast<5||score<(best?.score||0))continue;
      const x=bx+nx*(profile[left].o+profile[right].o)/2,y=by+ny*(profile[left].o+profile[right].o)/2,heightMm=((x-ground.x)*up.x+(y-ground.y)*up.y)/pxPerMm;
      best={t,x,y,width,score,edgeStrength,heightMm};
    }
    if(best)sections.push(best);
  }
  if(sections.length<22)return{ok:false,reason:'샤프트 양쪽 경계 후보 부족',confidence:0};
  const heightBand=sections.filter(s=>s.heightMm>=50&&s.heightMm<=350),sortedWidths=heightBand.map(s=>s.width).sort((a,b)=>a-b),shaftWidth=median(sortedWidths.slice(0,Math.max(8,Math.ceil(sortedWidths.length*.7))));
  const usable=heightBand.filter(s=>s.width<=shaftWidth*2.15);
  if(usable.length<16)return{ok:false,reason:'바닥 위 5~35cm 샤프트 경계 부족',confidence:0};
  const tolerance=Math.max(2.5,length*.0045),scoreFloor=median(usable.map(s=>s.score))*.55,candidates=usable.filter(s=>s.score>=scoreFloor);let bestInliers=[];
  for(let a=0;a<candidates.length-5;a++)for(let b=a+5;b<candidates.length;b+=2){
    const p=candidates[a],q=candidates[b],ldx=q.x-p.x,ldy=q.y-p.y,ll=Math.hypot(ldx,ldy);if(ll<length*.12)continue;
    const line={x:p.x,y:p.y,ux:ldx/ll,uy:ldy/ll},angle=shaftAngleFromLine(line,0);if(angle<58||angle>82)continue;
    const inliers=candidates.filter(c=>pointLineDistance(c,line)<=tolerance);if(inliers.length>bestInliers.length)bestInliers=inliers;
  }
  if(bestInliers.length<14)return{ok:false,reason:'샤프트 중심선의 직진성 부족',confidence:Math.round(bestInliers.length/Math.max(1,candidates.length)*100)};
  let line=fitLinePca(bestInliers);if(!line)return null;
  const refined=bestInliers.filter(p=>pointLineDistance(p,line)<=tolerance*.78);if(refined.length>=12){bestInliers=refined;line=fitLinePca(refined);}
  const rawAngle=shaftAngleFromLine(line,0),correctedAngle=shaftAngleFromLine(line,captureHorizontalTilt||0);
  if(rawAngle<60||rawAngle>80)return{ok:false,reason:'검출 각도가 일반 범위를 벗어남',confidence:0,rawAngle};
  const projections=bestInliers.map(p=>(p.x-line.x)*line.ux+(p.y-line.y)*line.uy),minP=Math.min(...projections),maxP=Math.max(...projections),residual=median(bestInliers.map(p=>pointLineDistance(p,line)));
  const widths=bestInliers.map(p=>p.width),widthMedian=median(widths),widthResidual=median(widths.map(v=>Math.abs(v-widthMedian)))/Math.max(1,widthMedian);
  const coverage=(maxP-minP)/(pxPerMm*300),support=bestInliers.length/candidates.length,straightness=Math.max(0,1-residual/tolerance),widthQuality=Math.max(0,1-widthResidual/.45);
  const confidence=Math.max(0,Math.min(99,Math.round((support*.42+Math.min(1,coverage)*.25+straightness*.23+widthQuality*.10)*100)));
  const groundSpan=Math.hypot(photoCanvas.width,photoCanvas.height);
  return{ok:confidence>=70,reason:confidence>=70?'자동 검출 완료':'검출 신뢰도 부족',rawAngle,correctedAngle,roll:captureHorizontalTilt,confidence,range:'5~35 cm',start:{x:line.x+line.ux*minP,y:line.y+line.uy*minP},end:{x:line.x+line.ux*maxP,y:line.y+line.uy*maxP},groundStart:{x:ground.x-groundDir.x*groundSpan,y:ground.y-groundDir.y*groundSpan},groundEnd:{x:ground.x+groundDir.x*groundSpan,y:ground.y+groundDir.y*groundSpan}};
}
function calculate(){
  const ballPx=distance(points[0],points[1]),putterPx=distance(points[2],points[3]);
  if(ballPx<5)return alert('골프공 기준점이 너무 가깝습니다. 다시 지정해 주세요.');
  const rawMm=putterPx/ballPx*BALL_MM;
  document.querySelector('#resultCm').textContent=(rawMm/10).toFixed(1);
  document.querySelector('#resultIn').textContent=(rawMm/25.4).toFixed(2);
  document.querySelector('#ballPixelDiameter').textContent=`${ballPx.toFixed(1)} px`;
  document.querySelector('#putterPixelLength').textContent=`${putterPx.toFixed(1)} px`;
  shaftDetection=detectShaft();draw();
  const angle=document.querySelector('#shaftAngle'),raw=document.querySelector('#shaftRaw'),correction=document.querySelector('#shaftCorrection'),confidence=document.querySelector('#shaftConfidence');
  if(shaftDetection?.ok){angle.textContent=`${shaftDetection.correctedAngle.toFixed(1)}°`;raw.textContent=`${shaftDetection.rawAngle.toFixed(1)}°`;correction.textContent=shaftDetection.roll==null?'센서 정보 없음':`${shaftDetection.roll>=0?'+':''}${shaftDetection.roll.toFixed(1)}°`;confidence.textContent=`${shaftDetection.confidence}%`;}
  else{angle.textContent='검출 실패';raw.textContent='—';correction.textContent=captureHorizontalTilt==null?'센서 정보 없음':`${captureHorizontalTilt>=0?'+':''}${captureHorizontalTilt.toFixed(1)}°`;confidence.textContent=shaftDetection?.reason||'샤프트를 찾지 못했습니다';}
  show('resultScreen');
}

function canvasPoint(e){const r=photoCanvas.getBoundingClientRect();return{x:(e.clientX-r.left)*photoCanvas.width/r.width,y:(e.clientY-r.top)*photoCanvas.height/r.height,scale:photoCanvas.width/r.width};}
photoCanvas.addEventListener('pointerdown',e=>{
  if(points.length!==4)return;
  const p=canvasPoint(e),hitRadius=68*p.scale;
  const candidates=[2,3].map(i=>({i,d:distance(p,points[i])})).filter(v=>v.d<=hitRadius).sort((a,b)=>a.d-b.d);
  if(!candidates.length)return;
  draggedPoint=candidates[0].i;dragOffset={x:points[draggedPoint].x-p.x,y:points[draggedPoint].y-p.y};photoCanvas.setPointerCapture?.(e.pointerId);draw();e.preventDefault();
});
photoCanvas.addEventListener('pointermove',e=>{if(draggedPoint<2)return;const p=canvasPoint(e);points[draggedPoint]={x:Math.max(0,Math.min(photoCanvas.width,p.x+dragOffset.x)),y:Math.max(0,Math.min(photoCanvas.height,p.y+dragOffset.y))};draw();e.preventDefault();});
photoCanvas.addEventListener('pointerup',e=>{
  if(draggedPoint>=2){draggedPoint=-1;dragOffset={x:0,y:0};shaftDetection=detectShaft();draw();return;}
  if(points.length>=4||ballCandidate)return;
  const p=canvasPoint(e);if(points.length===0&&ballMode==='auto')return detectBallAt(p.x,p.y);points.push({x:p.x,y:p.y});draw();updateStep();
  if(points.length===4){shaftDetection=detectShaft();document.querySelector('#canvasWrap').classList.add('adjusting');draw();updateStep();}
});
photoCanvas.addEventListener('pointercancel',()=>{draggedPoint=-1;dragOffset={x:0,y:0};draw();});
document.querySelector('#confirmBall').addEventListener('click',()=>{if(!ballCandidate)return;points=[{x:ballCandidate.x-ballCandidate.radius,y:ballCandidate.y},{x:ballCandidate.x+ballCandidate.radius,y:ballCandidate.y}];ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();updateStep();});
document.querySelector('#retryBall').addEventListener('click',()=>{ballCandidate=null;searchRegion=null;document.querySelector('#ballConfirm').hidden=true;draw();updateStep();});
document.querySelector('#ballSize').addEventListener('input',e=>{if(!ballCandidate)return;const percent=Number(e.target.value);ballCandidate.radius=ballCandidate.baseRadius*percent/100;document.querySelector('#ballSizeValue').textContent=`${percent}%`;draw();});
document.querySelector('#confirmPutter').addEventListener('click',calculate);
document.querySelector('#startButton').addEventListener('click',startCamera);
document.querySelector('#closeCamera').addEventListener('click',()=>{stopCamera();show('homeScreen');});
document.querySelector('#retakeButton').addEventListener('click',()=>{points=[];show('homeScreen');});
document.querySelector('#newMeasure').addEventListener('click',()=>{points=[];show('homeScreen');});
document.querySelector('#fileInput').addEventListener('change',e=>{
  const input=e.currentTarget,file=input.files?.[0];
  if(!file)return;
  if(!file.type.startsWith('image/')){alert('이미지 파일을 선택해 주세요.');input.value='';return;}
  captureHorizontalTilt=null;
  const objectUrl=URL.createObjectURL(file);
  loadImage(objectUrl,()=>URL.revokeObjectURL(objectUrl));input.value='';
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&stream)stopCamera();});
