/* theme-utils.js
 * Portal ambient theme engine + schedule system
 * Requires: sbQuery, sbUpdate, sbInsert (Supabase helpers from index)
 */

// ══════════════════════════════════════════════════════════

var _ambKey = 'ambient_theme';
var _ambCurrent = 'off';
var _ambRAF = null;
var _ambParticles = [];
var _ambPollInterval = null;
var _ambOpacity  = 0.70;  // 0.1 – 1.0, applied to canvas element
var _ambSpeed    = 1.0;   // 0.2 – 2.0, multiplies all movement speeds
var _ambDensity  = 1.0;   // 0.1 – 2.0, multiplies particle count
var _ambCtrlKey  = 'ambient_controls'; // persisted in settings

var _ambThemes = [
  { id:'off',      label:'Off',        icon:'⭕' },
  { id:'rain',     label:'Rain',       icon:'🌧️' },
  { id:'thunder',  label:'Thunder',    icon:'⛈️' },
  { id:'snow',     label:'Snow',       icon:'❄️' },
  { id:'wind',     label:'Windy',      icon:'💨' },
  { id:'fog',      label:'Foggy',      icon:'🌫️' },
  { id:'sunny',    label:'Sunny',      icon:'☀️' },
  { id:'night',      label:'Full Moon',   icon:'🌕' },
  { id:'nighthalf',  label:'Half Moon',   icon:'🌙' },
  { id:'romantic',   label:'Romantic',    icon:'🌹' },
  { id:'autumn',   label:'Autumn',     icon:'🍂' },
  { id:'sunset',   label:'Sunset',     icon:'🌅' },
  { id:'womensday',label:"Women's Day",icon:'💜' },
  { id:'christmas',label:'Christmas',  icon:'🎄' },
  { id:'diwali',   label:'Diwali',     icon:'🪔' },
  { id:'easter',   label:'Easter',     icon:'🐣' },
  { id:'ocean',     label:'Ocean',       icon:'🌊' },
  { id:'tornado',   label:'Tornado',     icon:'🌪️' },
  { id:'rainbow',   label:'Rainbow',     icon:'🌈' },
  { id:'cherry',    label:'Cherry Blossom', icon:'🌸' },
  { id:'forest',    label:'Forest Breeze',  icon:'🍃' },
  { id:'dawn',      label:'Dawn',        icon:'🌄' },
  { id:'citynite',  label:'City Night',  icon:'🌃' },
  { id:'goldhour',  label:'Golden Hour', icon:'🌆' },
  { id:'ramadan',   label:'Ramadan',     icon:'🌙' },
  { id:'bubbles',   label:'Bubbles',     icon:'🫧' },
  { id:'galaxy',    label:'Galaxy',      icon:'✨' },
  { id:'ember',     label:'Ember',       icon:'🔥' },
  { id:'paper',     label:'Paper Blizzard', icon:'📄' }
];

// ── Load theme from DB and apply ──
async function ambLoad(){
  try{
    var rows = await sbQuery('settings','key=eq.'+_ambKey+'&select=value');
    var theme = (rows&&rows.length) ? (rows[0].value||'off') : 'off';
    ambApply(theme);
  }catch(e){}
}

// ── Poll for theme changes every 30s (so agents see it live) ──
function ambStartPoll(){
  if(_ambPollInterval) clearInterval(_ambPollInterval);
  _ambPollInterval = setInterval(ambLoad, 30000);
  ambLoadControls();
  ambLoad();
  ambSchedStart();
}

// ── Apply a theme ──
function ambApply(theme){
  var canvas = document.getElementById('ambient-canvas');
  if(!canvas) return;

  // Stop any running animation immediately
  if(_ambRAF){ cancelAnimationFrame(_ambRAF); _ambRAF=null; }
  _ambParticles = [];
  window._ambMoon = null;
  window._ambThunder = null;

  _ambCurrent = theme;

  if(!theme || theme==='off'){
    canvas.classList.remove('active');
    canvas.style.opacity = '';   // clear inline so CSS transition takes over → fades to 0
    // Clear canvas pixels so nothing lingers
    var ctx = canvas.getContext('2d');
    if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  // Size canvas to window
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.opacity = _ambOpacity;
  canvas.classList.add('active');

  // Spawn particles and start loop
  ambSpawn(theme, canvas);
  ambLoop(theme, canvas);
}

// ── Resize handler ──
window.addEventListener('resize', function(){
  var canvas = document.getElementById('ambient-canvas');
  if(canvas && _ambCurrent !== 'off'){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
});

// ── Spawn initial particles ──
function ambSpawn(theme, canvas){
  var w = canvas.width, h = canvas.height;
  var base = { rain:180, thunder:220, snow:110, wind:80, fog:10, sunny:16, night:160, nighthalf:130, romantic:90, autumn:55, sunset:70, womensday:90, christmas:130, diwali:200, easter:65,
    ocean:80, tornado:100, rainbow:60, cherry:120, forest:90,
    dawn:50, citynite:70, goldhour:55, ramadan:65,
    bubbles:70, galaxy:160, ember:110, paper:80
  }[theme] || 80;
  var count = Math.max(5, Math.round(base * _ambDensity));
  _ambParticles = [];
  for(var i=0; i<count; i++){
    _ambParticles.push(ambNewParticle(theme, w, h, true));
  }
}

function ambNewParticle(theme, w, h, randomY){
  var p = {};
  var s = _ambSpeed; // speed multiplier
  if(theme==='rain'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -10;
    p.len = 14 + Math.random()*22;
    p.speed = (18 + Math.random()*14) * s;
    p.alpha = 0.55 + Math.random()*0.4;
    p.width = 1.2 + Math.random()*1.2;
  } else if(theme==='thunder'){
    // Heavy rain drops — same as rain but heavier + thunder state lives in window._ambThunder
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -10;
    p.len = 16 + Math.random()*26;
    p.speed = (22 + Math.random()*16) * s;
    p.alpha = 0.6 + Math.random()*0.35;
    p.width = 1.4 + Math.random()*1.4;
  } else if(theme==='snow'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -10;
    p.r = 2.5 + Math.random()*5;
    p.speed = (0.9 + Math.random()*1.8) * s;
    p.drift = (Math.random()-0.5)*0.7;
    p.alpha = 0.75 + Math.random()*0.25;
    p.wobble = Math.random()*Math.PI*2;
  } else if(theme==='wind'){
    p.x = randomY ? Math.random()*w : -20;
    p.y = Math.random()*h;
    p.len = 60 + Math.random()*120;
    p.speed = (8 + Math.random()*10) * s;
    p.alpha = 0.28 + Math.random()*0.3;
    p.width = 1 + Math.random()*2.5;
    p.angle = -0.1 + Math.random()*0.2;
  } else if(theme==='fog'){
    p.x = Math.random()*w;
    p.y = Math.random()*h;
    p.r = 140 + Math.random()*220;
    p.speed = (0.2 + Math.random()*0.3) * s;
    p.alpha = 0;
    p.targetAlpha = 0.12 + Math.random()*0.14;
    p.drift = (Math.random()-0.5)*0.3;
  } else if(theme==='sunny'){
    var angle = Math.random()*Math.PI*2;
    p.x = w*0.82 + Math.cos(angle)*(30+Math.random()*60);
    p.y = h*0.07 + Math.sin(angle)*(30+Math.random()*60);
    p.len = 120 + Math.random()*200;
    p.angle = angle;
    p.alpha = 0.12 + Math.random()*0.14;
    p.speed = (0.002 + Math.random()*0.003) * s;
  } else if(theme==='night'){
    var isShooting = Math.random() < 0.05;
    p.isShooting = isShooting;
    if(isShooting){
      p.x = Math.random()*w*0.6;
      p.y = Math.random()*h*0.3;
      p.vx = (7 + Math.random()*9) * s;
      p.vy = (2.5 + Math.random()*4) * s;
      p.len = 90 + Math.random()*130;
      p.alpha = 0;
      p.life = 1;
      p.fade = (0.014 + Math.random()*0.01) * Math.max(s, 0.3);
      p.delay = Math.floor(Math.random()*600);
    } else {
      p.x = Math.random()*w;
      p.y = Math.random()*h*0.75;
      p.r = 1.0 + Math.random()*2.8;
      p.baseAlpha = 0.5 + Math.random()*0.5;
      p.alpha = p.baseAlpha;
      p.twinkleSpeed = (0.006 + Math.random()*0.018) * Math.max(s, 0.5);
      p.twinkleDir = Math.random()>0.5?1:-1;
    }
  } else if(theme==='nighthalf'){
    // Same stars as full night but fewer shooting stars
    var isShootingH = Math.random() < 0.04;
    p.isShooting = isShootingH;
    if(isShootingH){
      p.x = Math.random()*w*0.6; p.y = Math.random()*h*0.3;
      p.vx = (6+Math.random()*8)*s; p.vy = (2+Math.random()*3.5)*s;
      p.len = 80+Math.random()*110; p.alpha=0; p.life=1;
      p.fade=(0.012+Math.random()*0.01)*Math.max(s,0.3);
      p.delay=Math.floor(Math.random()*700);
    } else {
      p.x=Math.random()*w; p.y=Math.random()*h*0.78;
      p.r=0.8+Math.random()*2.4;
      p.baseAlpha=0.4+Math.random()*0.5; p.alpha=p.baseAlpha;
      p.twinkleSpeed=(0.005+Math.random()*0.016)*Math.max(s,0.5);
      p.twinkleDir=Math.random()>0.5?1:-1;
    }
  } else if(theme==='romantic'){
    // Floating glowing bokeh hearts + firefly dots
    p.x=Math.random()*w;
    p.y=randomY?Math.random()*h:h+20;
    p.isHeart=Math.random()>0.45;
    p.r=p.isHeart?(5+Math.random()*9):(2+Math.random()*5);
    p.speed=-(0.25+Math.random()*0.55)*s;
    p.drift=(Math.random()-0.5)*0.5;
    p.wobble=Math.random()*Math.PI*2;
    p.baseAlpha=0.35+Math.random()*0.45; p.alpha=p.baseAlpha;
    p.twinkleSpeed=(0.004+Math.random()*0.012)*Math.max(s,0.4);
    p.twinkleDir=Math.random()>0.5?1:-1;
    p.hue=340+Math.random()*30; // deep rose to soft pink
  } else if(theme==='autumn'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -20;
    p.r = 6 + Math.random()*8;
    p.speed = (1.2 + Math.random()*2) * s;
    p.drift = (Math.random()-0.5)*1.8;
    p.rot = Math.random()*Math.PI*2;
    p.rotSpeed = (Math.random()-0.5)*0.08 * s;
    p.alpha = 0.8 + Math.random()*0.2;
    p.hue = 10 + Math.floor(Math.random()*5)*10;
  } else if(theme==='sunset'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+10;
    p.r = 5 + Math.random()*12;
    p.speed = -(0.5 + Math.random()*0.9) * s;
    p.drift = (Math.random()-0.5)*0.5;
    p.alpha = 0.35 + Math.random()*0.35;
    p.hue = 10 + Math.random()*35;
  } else if(theme==='womensday'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+20;
    p.r = 5 + Math.random()*12;
    p.speed = -(0.6 + Math.random()*1.1) * s;
    p.drift = (Math.random()-0.5)*0.8;
    p.alpha = 0.45 + Math.random()*0.4;
    p.isHeart = Math.random() > 0.5;
    p.hue = 285 + Math.random()*65;
  } else if(theme==='christmas'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -15;
    p.isStar = Math.random() > 0.65;
    p.r = p.isStar ? (5 + Math.random()*7) : (2.5 + Math.random()*4.5);
    p.speed = (1.0 + Math.random()*1.8) * s;
    p.drift = (Math.random()-0.5)*1.0;
    p.wobble = Math.random()*Math.PI*2;
    p.rot = Math.random()*Math.PI*2;
    p.rotSpeed = (Math.random()-0.5)*0.06 * s;
    p.alpha = 0.75 + Math.random()*0.25;
  } else if(theme==='diwali'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h*0.8 : Math.random()*h*0.8;
    var spd = (1.5 + Math.random()*3.5) * s;
    var ang = Math.random()*Math.PI*2;
    p.vx = Math.cos(ang)*spd;
    p.vy = Math.sin(ang)*spd;
    p.r = 1.5 + Math.random()*3;
    p.alpha = 0.85 + Math.random()*0.15;
    p.fade = (0.007 + Math.random()*0.01) * Math.max(s, 0.3);
    p.hue = Math.random()*80;
    p.life = 1;
  } else if(theme==='easter'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -25;
    p.ry = (7 + Math.random()*8) * 1.35;
    p.rx = p.ry * 0.72;
    p.speed = (0.8 + Math.random()*1.4) * s;
    p.drift = (Math.random()-0.5)*0.9;
    p.rot = (Math.random()-0.5)*0.35;
    p.alpha = 0.7 + Math.random()*0.3;
    var pastels = ['355,88%,72%','145,65%,68%','270,65%,74%','48,95%,70%','200,75%,72%'];
    p.hsl = pastels[Math.floor(Math.random()*pastels.length)];
  } else if(theme==='ocean'){
    p.x = Math.random()*w;
    p.y = h*0.55 + Math.random()*h*0.5;
    p.r = 6 + Math.random()*18;
    p.speed = (0.3 + Math.random()*0.5)*s;
    p.drift = (Math.random()-0.5)*0.3;
    p.alpha = 0.12 + Math.random()*0.18;
    p.hue = 190 + Math.random()*30;
    p.isBubble = Math.random()>0.7;
    if(p.isBubble){ p.r=3+Math.random()*7; p.speed=(0.8+Math.random()*1.2)*s; p.alpha=0.25+Math.random()*0.3; p.y=h+10; }
  } else if(theme==='tornado'){
    p.angle = Math.random()*Math.PI*2;
    p.radius = 10 + Math.random()*120;
    p.y = h*0.3 + Math.random()*h*0.7;
    p.speed = (1.5 + Math.random()*3)*s;
    p.rotSpeed = (0.04 + Math.random()*0.06)*s;
    p.alpha = 0.25 + Math.random()*0.45;
    p.r = 2 + Math.random()*5;
    p.hue = 200 + Math.random()*40;
    p.rise = (0.5 + Math.random()*1.5)*s;
  } else if(theme==='rainbow'){
    p.bandIndex = Math.floor(Math.random()*7);
    p.x = -50;
    p.y = randomY ? Math.random()*h : Math.random()*h;
    p.speed = (0.4 + Math.random()*0.6)*s;
    p.r = 2 + Math.random()*4;
    p.alpha = 0.4 + Math.random()*0.4;
    p.drift = (Math.random()-0.5)*0.3;
  } else if(theme==='cherry'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -15;
    p.r = 3 + Math.random()*5;
    p.speed = (0.6 + Math.random()*1.2)*s;
    p.drift = (Math.random()-0.5)*2.5;
    p.rot = Math.random()*Math.PI*2;
    p.rotSpeed = (Math.random()-0.5)*0.05*s;
    p.wobble = Math.random()*Math.PI*2;
    p.alpha = 0.65 + Math.random()*0.35;
    p.hue = 340 + Math.random()*25;
  } else if(theme==='forest'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : -20;
    p.r = 4 + Math.random()*6;
    p.speed = (0.4 + Math.random()*0.8)*s;
    p.drift = (Math.random()-0.5)*1.5;
    p.rot = Math.random()*Math.PI*2;
    p.rotSpeed = (Math.random()-0.5)*0.04*s;
    p.wobble = Math.random()*Math.PI*2;
    p.alpha = 0.55 + Math.random()*0.35;
    p.hue = 100 + Math.random()*50;
  } else if(theme==='dawn'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+10;
    p.r = 4 + Math.random()*10;
    p.speed = -(0.3 + Math.random()*0.5)*s;
    p.drift = (Math.random()-0.5)*0.4;
    p.alpha = 0.12 + Math.random()*0.18;
    p.hue = 25 + Math.random()*40;
  } else if(theme==='citynite'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : Math.random()*h;
    p.r = 1 + Math.random()*2.5;
    p.alpha = 0;
    p.targetAlpha = 0.4 + Math.random()*0.55;
    p.flicker = Math.random()*100;
    p.flickerSpeed = 0.5 + Math.random()*2;
    p.hue = Math.random()*60;
    p.isOrange = Math.random()>0.5;
  } else if(theme==='goldhour'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+10;
    p.r = 3 + Math.random()*8;
    p.speed = -(0.25+Math.random()*0.45)*s;
    p.drift = (Math.random()-0.5)*0.5;
    p.alpha = 0.2 + Math.random()*0.25;
    p.hue = 35 + Math.random()*20;
  } else if(theme==='ramadan'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+20;
    p.isLantern = Math.random()>0.72;
    p.r = p.isLantern ? (8+Math.random()*10) : (1.2+Math.random()*2.2);
    p.speed = p.isLantern ? -(0.25+Math.random()*0.35)*s : 0;
    p.drift = (Math.random()-0.5)*(p.isLantern?0.4:0);
    p.wobble = Math.random()*Math.PI*2;
    p.alpha = p.isLantern ? (0.55+Math.random()*0.35) : (0.3+Math.random()*0.6);
    p.baseAlpha = p.alpha;
    p.twinkleSpeed = (0.005+Math.random()*0.015)*Math.max(s,0.4);
    p.twinkleDir = Math.random()>0.5?1:-1;
    p.hue = 38 + Math.random()*20;
    if(!p.isLantern){ p.x=Math.random()*w; p.y=Math.random()*h*0.7; }
  } else if(theme==='bubbles'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+20;
    p.r = 8 + Math.random()*28;
    p.speed = -(0.3+Math.random()*0.7)*s;
    p.drift = (Math.random()-0.5)*0.6;
    p.wobble = Math.random()*Math.PI*2;
    p.alpha = 0.08 + Math.random()*0.12;
    p.hue = Math.random()*360;
    p.shimmer = Math.random()*Math.PI*2;
  } else if(theme==='galaxy'){
    p.isStar = Math.random()>0.15;
    if(p.isStar){
      p.x = Math.random()*w; p.y = Math.random()*h;
      p.r = 0.5+Math.random()*2.5;
      p.baseAlpha = 0.3+Math.random()*0.7; p.alpha=p.baseAlpha;
      p.twinkleSpeed=(0.005+Math.random()*0.02)*Math.max(s,0.4);
      p.twinkleDir=Math.random()>0.5?1:-1;
      p.hue=200+Math.random()*160;
    } else {
      // Nebula dust
      p.x=Math.random()*w; p.y=Math.random()*h;
      p.r=40+Math.random()*100;
      p.alpha=0; p.targetAlpha=0.04+Math.random()*0.06;
      p.speed=(0.1+Math.random()*0.2)*s;
      p.drift=(Math.random()-0.5)*0.15;
      p.hue=220+Math.random()*120;
    }
  } else if(theme==='ember'){
    p.x = Math.random()*w;
    p.y = randomY ? Math.random()*h : h+5;
    p.r = 1.5+Math.random()*3.5;
    p.speed = -(0.8+Math.random()*2)*s;
    p.drift = (Math.random()-0.5)*1.5;
    p.wobble = Math.random()*Math.PI*2;
    p.alpha = 0.6+Math.random()*0.4;
    p.hue = 15+Math.random()*30;
    p.fade = (0.003+Math.random()*0.005)*Math.max(s,0.3);
    p.life = 0.5+Math.random()*0.5;
  } else if(theme==='paper'){
    p.x = randomY ? Math.random()*w : -60+Math.random()*w*1.2;
    p.y = randomY ? Math.random()*h : -30;
    p.w = 16+Math.random()*24;
    p.h = p.w*0.7;
    p.speed = (1.2+Math.random()*2)*s;
    p.drift = (Math.random()-0.5)*1.8;
    p.rot = Math.random()*Math.PI*2;
    p.rotSpeed = (Math.random()-0.5)*0.08*s;
    p.alpha = 0.55+Math.random()*0.35;
    p.hue = Math.random()*60;
    p.isDoc = Math.random()>0.5;
  }
  return p;
}

// ── Animation loop ──
function ambLoop(theme, canvas){
  if(_ambCurrent !== theme) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  if(theme==='rain'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      ctx.beginPath();
      ctx.strokeStyle='rgba(140,195,255,'+p.alpha+')';
      ctx.lineWidth=p.width;
      ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x+p.len*0.2, p.y+p.len);
      ctx.stroke();
      p.y+=p.speed; p.x+=p.speed*0.2;
      if(p.y>h+20||p.x>w+20){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; }
    }

  } else if(theme==='thunder'){
    // ── Dark storm overlay ──
    ctx.fillStyle='rgba(20,25,50,0.18)'; ctx.fillRect(0,0,w,h);

    // ── Heavy rain ──
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      ctx.beginPath();
      ctx.strokeStyle='rgba(130,170,220,'+p.alpha+')';
      ctx.lineWidth=p.width;
      ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x+p.len*0.22, p.y+p.len);
      ctx.stroke();
      p.y+=p.speed; p.x+=p.speed*0.22;
      if(p.y>h+20||p.x>w+20){ var tnp=ambNewParticle(theme,w,h,false); p.x=tnp.x; p.y=tnp.y; }
    }

    // ── Lightning system ──
    if(!window._ambThunder){
      window._ambThunder={ flashAlpha:0, nextFlash:60+Math.random()*180, bolt:null, rumbleAlpha:0 };
    }
    var T=window._ambThunder;
    T.nextFlash--;

    if(T.nextFlash<=0){
      // Trigger a new bolt
      var bx=w*0.15+Math.random()*w*0.7;
      var segs=[{x:bx,y:0}];
      var cy=0;
      while(cy<h*0.75){
        var step=40+Math.random()*60;
        cy+=step;
        bx+=(Math.random()-0.5)*90;
        segs.push({x:bx,y:cy});
        // Random fork
        if(Math.random()<0.4 && cy<h*0.5){
          var fx=bx, fy=cy;
          for(var f=0;f<2+Math.floor(Math.random()*2);f++){
            fx+=(Math.random()-0.3)*70; fy+=30+Math.random()*50;
            segs.push({x:fx,y:fy,fork:true,forkStart:segs.length-1});
          }
        }
      }
      T.bolt=segs;
      T.flashAlpha=1.0;
      T.rumbleAlpha=1.0;
      T.nextFlash=80+Math.random()*220;
      // Double-flash effect
      setTimeout(function(){ if(T){T.flashAlpha=Math.min(T.flashAlpha+0.6,1.0);} },60);
    }

    // Draw flash white-out
    if(T.flashAlpha>0.01){
      ctx.fillStyle='rgba(200,215,255,'+( T.flashAlpha*0.35)+')';
      ctx.fillRect(0,0,w,h);
      T.flashAlpha*=0.82;
    }

    // Draw lightning bolt
    if(T.bolt && T.flashAlpha>0.05){
      var bolt=T.bolt;
      ctx.save();
      ctx.shadowColor='rgba(180,210,255,0.9)';
      ctx.shadowBlur=18;
      // Main trunk
      ctx.beginPath(); ctx.moveTo(bolt[0].x,bolt[0].y);
      var forkStarts=[];
      for(var bi=1;bi<bolt.length;bi++){
        if(bolt[bi].fork){ forkStarts.push(bi); continue; }
        ctx.lineTo(bolt[bi].x,bolt[bi].y);
      }
      ctx.strokeStyle='rgba(220,235,255,'+Math.min(T.flashAlpha*1.4,1)+')';
      ctx.lineWidth=2.5; ctx.stroke();
      // Bright core
      ctx.lineWidth=1.0;
      ctx.strokeStyle='rgba(255,255,255,'+Math.min(T.flashAlpha*1.8,1)+')';
      ctx.stroke();
      // Forks
      forkStarts.forEach(function(fi){
        ctx.beginPath(); ctx.moveTo(bolt[fi-1].x,bolt[fi-1].y);
        for(var fj=fi;fj<bolt.length&&bolt[fj].fork;fj++) ctx.lineTo(bolt[fj].x,bolt[fj].y);
        ctx.strokeStyle='rgba(200,220,255,'+Math.min(T.flashAlpha*0.9,1)+')';
        ctx.lineWidth=1.2; ctx.stroke();
      });
      ctx.restore();
    }
    if(T.rumbleAlpha>0.01) T.rumbleAlpha*=0.96;

  } else if(theme==='snow'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.022; p.x+=Math.sin(p.wobble)*p.drift; p.y+=p.speed;
      // Draw snowflake as a circle with a soft glow
      var sg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2);
      sg.addColorStop(0,'rgba(230,242,255,'+p.alpha+')');
      sg.addColorStop(0.5,'rgba(210,230,255,'+(p.alpha*0.6)+')');
      sg.addColorStop(1,'rgba(210,230,255,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2);
      ctx.fillStyle=sg; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='rgba(240,248,255,'+p.alpha+')'; ctx.fill();
      if(p.y>h+10){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; p.wobble=np.wobble; }
    }

  } else if(theme==='wind'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      // Gradient streak — bright at head, fades to tail
      var wx1=p.x, wy1=p.y, wx2=p.x+p.len, wy2=p.y+p.angle*p.len;
      var wg=ctx.createLinearGradient(wx1,wy1,wx2,wy2);
      wg.addColorStop(0,'rgba(200,220,240,0)');
      wg.addColorStop(0.3,'rgba(200,220,240,'+p.alpha+')');
      wg.addColorStop(1,'rgba(200,220,240,0)');
      ctx.beginPath(); ctx.moveTo(wx1,wy1); ctx.lineTo(wx2,wy2);
      ctx.strokeStyle=wg; ctx.lineWidth=p.width; ctx.stroke();
      p.x+=p.speed;
      if(p.x>w+100){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; }
    }

  } else if(theme==='fog'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.alpha+=(p.targetAlpha-p.alpha)*0.006;
      p.x+=p.speed; p.y+=p.drift;
      if(p.x>w+p.r) p.x=-p.r;
      if(p.y>h+p.r) p.y=-p.r; if(p.y<-p.r) p.y=h+p.r;
      var fg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      fg.addColorStop(0,'rgba(190,210,230,'+p.alpha+')');
      fg.addColorStop(1,'rgba(190,210,230,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=fg; ctx.fill();
    }

  } else if(theme==='sunny'){
    // Wide soft rays
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.angle+=p.speed;
      var sx=w*0.82, sy=h*0.07;
      var rx=sx+Math.cos(p.angle)*p.len, ry=sy+Math.sin(p.angle)*p.len;
      var sg2=ctx.createLinearGradient(sx,sy,rx,ry);
      sg2.addColorStop(0,'rgba(255,230,100,'+p.alpha+')');
      sg2.addColorStop(1,'rgba(255,200,60,0)');
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(rx,ry);
      ctx.strokeStyle=sg2; ctx.lineWidth=28; ctx.stroke();
    }
    // Big warm glow
    var sun=ctx.createRadialGradient(w*0.82,h*0.07,0,w*0.82,h*0.07,220);
    sun.addColorStop(0,'rgba(255,240,140,0.28)');
    sun.addColorStop(0.4,'rgba(255,210,80,0.14)');
    sun.addColorStop(1,'rgba(255,180,50,0)');
    ctx.beginPath(); ctx.arc(w*0.82,h*0.07,220,0,Math.PI*2);
    ctx.fillStyle=sun; ctx.fill();

  } else if(theme==='night'){
    // ── Full Moon ──
    if(!window._ambMoon){
      window._ambMoon={ x:w*0.80, y:h*0.13, r:44, glow:0, glowDir:1 };
    }
    var moon=window._ambMoon;
    moon.glow+=0.007*moon.glowDir;
    if(moon.glow>1)moon.glowDir=-1; if(moon.glow<0)moon.glowDir=1;
    // Wide outer halo
    var halo=ctx.createRadialGradient(moon.x,moon.y,moon.r,moon.x,moon.y,moon.r*5);
    halo.addColorStop(0,'rgba(210,228,255,'+(0.22+moon.glow*0.10)+')');
    halo.addColorStop(0.4,'rgba(190,215,255,'+(0.10+moon.glow*0.05)+')');
    halo.addColorStop(1,'rgba(170,200,255,0)');
    ctx.beginPath(); ctx.arc(moon.x,moon.y,moon.r*5,0,Math.PI*2);
    ctx.fillStyle=halo; ctx.fill();
    // Full bright disc
    var disc=ctx.createRadialGradient(moon.x-moon.r*0.18,moon.y-moon.r*0.18,2,moon.x,moon.y,moon.r);
    disc.addColorStop(0,'rgba(255,255,252,1.0)');
    disc.addColorStop(0.45,'rgba(245,250,255,0.98)');
    disc.addColorStop(0.80,'rgba(228,238,255,0.95)');
    disc.addColorStop(1,'rgba(210,225,255,0.88)');
    ctx.beginPath(); ctx.arc(moon.x,moon.y,moon.r,0,Math.PI*2);
    ctx.fillStyle=disc; ctx.fill();
    // Subtle crater shadows
    ctx.save(); ctx.globalAlpha=0.10;
    [[0.28,0.20,0.13],[-0.18,0.28,0.09],[0.08,-0.30,0.11],[-0.30,-0.16,0.07]].forEach(function(c){
      ctx.beginPath(); ctx.arc(moon.x+c[0]*moon.r,moon.y+c[1]*moon.r,c[2]*moon.r,0,Math.PI*2);
      ctx.fillStyle='rgba(120,145,185,1)'; ctx.fill();
    });
    ctx.restore();
    // Bright edge
    ctx.beginPath(); ctx.arc(moon.x,moon.y,moon.r,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,0.30)'; ctx.lineWidth=1.5; ctx.stroke();

    // ── Stars + shooting stars ──
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      if(p.isShooting){
        if(p.delay>0){ p.delay--; continue; }
        p.alpha=Math.min(1, p.alpha+0.05);
        p.life-=p.fade;
        if(p.life<=0){ var ns=ambNewParticle(theme,w,h,true); Object.assign(p,ns); continue; }
        var hx=p.x, hy=p.y;
        var spd=Math.sqrt(p.vx*p.vx+p.vy*p.vy)||1;
        var tx2=hx-p.vx*(p.len/spd), ty2=hy-p.vy*(p.len/spd);
        var stg=ctx.createLinearGradient(tx2,ty2,hx,hy);
        stg.addColorStop(0,'rgba(255,255,255,0)');
        stg.addColorStop(0.6,'rgba(220,235,255,'+(p.alpha*p.life*0.6)+')');
        stg.addColorStop(1,'rgba(255,255,255,'+(p.alpha*p.life)+')');
        ctx.beginPath(); ctx.moveTo(tx2,ty2); ctx.lineTo(hx,hy);
        ctx.strokeStyle=stg; ctx.lineWidth=2; ctx.stroke();
        ctx.beginPath(); ctx.arc(hx,hy,2.5,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+(p.alpha*p.life)+')'; ctx.fill();
        p.x+=p.vx; p.y+=p.vy;
        if(p.x>w+50||p.y>h+50){ var ns2=ambNewParticle(theme,w,h,true); Object.assign(p,ns2); }
      } else {
        // Twinkling: swing between dim and full brightness
        p.alpha+=p.twinkleSpeed*p.twinkleDir;
        if(p.alpha>=p.baseAlpha){ p.alpha=p.baseAlpha; p.twinkleDir=-1; }
        if(p.alpha<=p.baseAlpha*0.12){ p.alpha=p.baseAlpha*0.12; p.twinkleDir=1; }
        if(p.r>2.2){
          // 4-point star shape for bigger stars
          var arm=p.r*2.8;
          ctx.save(); ctx.translate(p.x,p.y);
          var sg=ctx.createRadialGradient(0,0,0,0,0,arm*2);
          sg.addColorStop(0,'rgba(230,242,255,'+p.alpha+')');
          sg.addColorStop(0.5,'rgba(210,228,255,'+(p.alpha*0.35)+')');
          sg.addColorStop(1,'rgba(200,220,255,0)');
          ctx.beginPath(); ctx.arc(0,0,arm*2,0,Math.PI*2);
          ctx.fillStyle=sg; ctx.fill();
          ctx.strokeStyle='rgba(245,252,255,'+p.alpha+')';
          ctx.lineWidth=1.3;
          ctx.beginPath(); ctx.moveTo(-arm,0); ctx.lineTo(arm,0); ctx.stroke();
          ctx.lineWidth=0.9;
          ctx.beginPath(); ctx.moveTo(0,-arm*0.75); ctx.lineTo(0,arm*0.75); ctx.stroke();
          ctx.beginPath(); ctx.arc(0,0,p.r*0.8,0,Math.PI*2);
          ctx.fillStyle='rgba(255,255,255,'+Math.min(p.alpha*1.4,1)+')'; ctx.fill();
          ctx.restore();
        } else {
          var sg2=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3);
          sg2.addColorStop(0,'rgba(245,252,255,'+p.alpha+')');
          sg2.addColorStop(0.5,'rgba(220,238,255,'+(p.alpha*0.4)+')');
          sg2.addColorStop(1,'rgba(200,225,255,0)');
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2);
          ctx.fillStyle=sg2; ctx.fill();
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
          ctx.fillStyle='rgba(255,255,255,'+p.alpha+')'; ctx.fill();
        }
      }
    }

  } else if(theme==='nighthalf'){
    // ── Half Moon (crescent) ──
    if(!window._ambMoon){
      window._ambMoon={ x:w*0.78, y:h*0.12, r:40, glow:0, glowDir:1 };
    }
    var moon=window._ambMoon;
    moon.glow+=0.005*moon.glowDir;
    if(moon.glow>1)moon.glowDir=-1; if(moon.glow<0)moon.glowDir=1;
    // Soft halo
    var haloH=ctx.createRadialGradient(moon.x,moon.y,moon.r*0.8,moon.x,moon.y,moon.r*4);
    haloH.addColorStop(0,'rgba(180,205,245,'+(0.16+moon.glow*0.08)+')');
    haloH.addColorStop(1,'rgba(160,190,240,0)');
    ctx.beginPath(); ctx.arc(moon.x,moon.y,moon.r*4,0,Math.PI*2);
    ctx.fillStyle=haloH; ctx.fill();
    // Moon disc
    var discH=ctx.createRadialGradient(moon.x-moon.r*0.1,moon.y-moon.r*0.1,2,moon.x,moon.y,moon.r);
    discH.addColorStop(0,'rgba(240,245,255,0.95)');
    discH.addColorStop(0.7,'rgba(215,228,255,0.90)');
    discH.addColorStop(1,'rgba(190,210,255,0.80)');
    ctx.beginPath(); ctx.arc(moon.x,moon.y,moon.r,0,Math.PI*2);
    ctx.fillStyle=discH; ctx.fill();
    // Crescent shadow — offset circle cuts away the right side
    ctx.beginPath(); ctx.arc(moon.x+moon.r*0.52,moon.y-moon.r*0.08,moon.r*0.88,0,Math.PI*2);
    // Use destination-out to cut — we fake it with the background
    ctx.fillStyle='rgba(8,12,30,0.96)'; ctx.fill();
    // Rim glow on the lit edge
    ctx.beginPath(); ctx.arc(moon.x,moon.y,moon.r,0,Math.PI*2);
    ctx.strokeStyle='rgba(200,220,255,'+(0.18+moon.glow*0.10)+')'; ctx.lineWidth=1.5; ctx.stroke();
    // Stars (same logic as full night)
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      if(p.isShooting){
        if(p.delay>0){ p.delay--; continue; }
        p.alpha=Math.min(1,p.alpha+0.05); p.life-=p.fade;
        if(p.life<=0){ var nhp=ambNewParticle(theme,w,h,true); Object.assign(p,nhp); continue; }
        var nhx=p.x,nhy=p.y,nspd=Math.sqrt(p.vx*p.vx+p.vy*p.vy)||1;
        var ntx=nhx-p.vx*(p.len/nspd),nty=nhy-p.vy*(p.len/nspd);
        var nstg=ctx.createLinearGradient(ntx,nty,nhx,nhy);
        nstg.addColorStop(0,'rgba(255,255,255,0)');
        nstg.addColorStop(1,'rgba(255,255,255,'+(p.alpha*p.life)+')');
        ctx.beginPath(); ctx.moveTo(ntx,nty); ctx.lineTo(nhx,nhy);
        ctx.strokeStyle=nstg; ctx.lineWidth=1.8; ctx.stroke();
        ctx.beginPath(); ctx.arc(nhx,nhy,2,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+(p.alpha*p.life)+')'; ctx.fill();
        p.x+=p.vx; p.y+=p.vy;
        if(p.x>w+50||p.y>h+50){ var nhp2=ambNewParticle(theme,w,h,true); Object.assign(p,nhp2); }
      } else {
        p.alpha+=p.twinkleSpeed*p.twinkleDir;
        if(p.alpha>=p.baseAlpha){ p.alpha=p.baseAlpha; p.twinkleDir=-1; }
        if(p.alpha<=p.baseAlpha*0.12){ p.alpha=p.baseAlpha*0.12; p.twinkleDir=1; }
        var hsg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.5);
        hsg.addColorStop(0,'rgba(235,245,255,'+p.alpha+')');
        hsg.addColorStop(1,'rgba(200,220,255,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2);
        ctx.fillStyle=hsg; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+p.alpha+')'; ctx.fill();
      }
    }

  } else if(theme==='romantic'){
    // ── Deep blue-violet night wash ──
    var rwash=ctx.createLinearGradient(0,0,0,h);
    rwash.addColorStop(0,'rgba(30,15,55,0.22)');
    rwash.addColorStop(1,'rgba(60,10,30,0.10)');
    ctx.fillStyle=rwash; ctx.fillRect(0,0,w,h);

    // ── Large soft romantic moon — warm golden ──
    if(!window._ambMoon){
      window._ambMoon={ x:w*0.76, y:h*0.16, r:46, glow:0, glowDir:1 };
    }
    var rmoon=window._ambMoon;
    rmoon.glow+=0.005*rmoon.glowDir;
    if(rmoon.glow>1)rmoon.glowDir=-1; if(rmoon.glow<0)rmoon.glowDir=1;
    // Wide warm halo
    var rhalo=ctx.createRadialGradient(rmoon.x,rmoon.y,rmoon.r,rmoon.x,rmoon.y,rmoon.r*5.5);
    rhalo.addColorStop(0,'rgba(255,210,120,'+(0.20+rmoon.glow*0.10)+')');
    rhalo.addColorStop(0.4,'rgba(255,170,80,'+(0.08+rmoon.glow*0.05)+')');
    rhalo.addColorStop(1,'rgba(220,120,50,0)');
    ctx.beginPath(); ctx.arc(rmoon.x,rmoon.y,rmoon.r*5.5,0,Math.PI*2);
    ctx.fillStyle=rhalo; ctx.fill();
    // Moon disc — warm ivory gold
    var rdisc=ctx.createRadialGradient(rmoon.x-rmoon.r*0.2,rmoon.y-rmoon.r*0.2,2,rmoon.x,rmoon.y,rmoon.r);
    rdisc.addColorStop(0,'rgba(255,252,230,0.98)');
    rdisc.addColorStop(0.5,'rgba(255,240,190,0.95)');
    rdisc.addColorStop(0.85,'rgba(245,220,155,0.90)');
    rdisc.addColorStop(1,'rgba(230,200,120,0.82)');
    ctx.beginPath(); ctx.arc(rmoon.x,rmoon.y,rmoon.r,0,Math.PI*2);
    ctx.fillStyle=rdisc; ctx.fill();
    ctx.beginPath(); ctx.arc(rmoon.x,rmoon.y,rmoon.r,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,230,140,0.25)'; ctx.lineWidth=1.5; ctx.stroke();

    // ── Rising hearts + bokeh fireflies ──
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.018; p.x+=p.drift+Math.sin(p.wobble)*0.4; p.y+=p.speed;
      p.alpha+=p.twinkleSpeed*p.twinkleDir;
      if(p.alpha>=p.baseAlpha){p.alpha=p.baseAlpha;p.twinkleDir=-1;}
      if(p.alpha<=p.baseAlpha*0.2){p.alpha=p.baseAlpha*0.2;p.twinkleDir=1;}
      if(p.isHeart){
        ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.r/7,p.r/7);
        ctx.beginPath();
        ctx.moveTo(0,-3.5);
        ctx.bezierCurveTo(4.5,-8,11,-3.5,0,6);
        ctx.bezierCurveTo(-11,-3.5,-4.5,-8,0,-3.5);
        ctx.fillStyle='hsla('+p.hue+',82%,68%,'+p.alpha+')';
        ctx.shadowColor='hsla('+p.hue+',90%,70%,0.6)';
        ctx.shadowBlur=10;
        ctx.fill(); ctx.restore();
      } else {
        // Soft firefly glow
        var rfg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.5);
        rfg.addColorStop(0,'hsla('+p.hue+',75%,70%,'+(p.alpha*1.2)+')');
        rfg.addColorStop(0.5,'hsla('+p.hue+',70%,65%,'+(p.alpha*0.4)+')');
        rfg.addColorStop(1,'hsla('+p.hue+',70%,65%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2);
        ctx.fillStyle=rfg; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*0.6,0,Math.PI*2);
        ctx.fillStyle='rgba(255,220,210,'+(p.alpha*0.9)+')'; ctx.fill();
      }
      if(p.y<-25){ var rnp=ambNewParticle(theme,w,h,false); p.x=rnp.x; p.y=rnp.y; p.wobble=Math.random()*Math.PI*2; }
    }

  } else if(theme==='autumn'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed; p.rot+=p.rotSpeed;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      // Leaf body
      ctx.beginPath();
      ctx.moveTo(0,-p.r);
      ctx.bezierCurveTo(p.r,-p.r*0.5, p.r*0.8,p.r*0.5, 0,p.r);
      ctx.bezierCurveTo(-p.r*0.8,p.r*0.5, -p.r,-p.r*0.5, 0,-p.r);
      ctx.fillStyle='hsla('+p.hue+',88%,48%,'+p.alpha+')';
      ctx.fill();
      // Vein
      ctx.beginPath(); ctx.moveTo(0,-p.r*0.8); ctx.lineTo(0,p.r*0.8);
      ctx.strokeStyle='hsla('+p.hue+',60%,35%,'+(p.alpha*0.6)+')';
      ctx.lineWidth=0.8; ctx.stroke();
      ctx.restore();
      if(p.y>h+25){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; p.rot=np.rot; }
    }

  } else if(theme==='sunset'){
    // Vivid sky gradient wash
    var sky=ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,'rgba(255,80,20,0.18)');
    sky.addColorStop(0.35,'rgba(255,150,40,0.13)');
    sky.addColorStop(0.65,'rgba(255,180,60,0.10)');
    sky.addColorStop(1,'rgba(220,60,20,0.08)');
    ctx.fillStyle=sky; ctx.fillRect(0,0,w,h);
    // Rising warm dust motes with glow
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed;
      var dg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2);
      dg.addColorStop(0,'hsla('+p.hue+',95%,62%,'+p.alpha+')');
      dg.addColorStop(1,'hsla('+p.hue+',95%,62%,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2);
      ctx.fillStyle=dg; ctx.fill();
      if(p.y<-p.r*2){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; }
    }
    // Strong horizon glow
    var hg=ctx.createLinearGradient(0,h*0.5,0,h*0.8);
    hg.addColorStop(0,'rgba(255,100,30,0)');
    hg.addColorStop(0.35,'rgba(255,80,20,0.22)');
    hg.addColorStop(0.65,'rgba(220,50,10,0.18)');
    hg.addColorStop(1,'rgba(180,30,5,0)');
    ctx.fillStyle=hg; ctx.fillRect(0,h*0.5,w,h*0.3);
    // Sun disc
    var sdg=ctx.createRadialGradient(w*0.5,h*0.62,0,w*0.5,h*0.62,60);
    sdg.addColorStop(0,'rgba(255,220,100,0.55)');
    sdg.addColorStop(0.5,'rgba(255,140,40,0.30)');
    sdg.addColorStop(1,'rgba(255,80,10,0)');
    ctx.beginPath(); ctx.arc(w*0.5,h*0.62,60,0,Math.PI*2);
    ctx.fillStyle=sdg; ctx.fill();

  } else if(theme==='womensday'){
    // Soft purple overlay tint
    ctx.fillStyle='rgba(180,100,230,0.04)'; ctx.fillRect(0,0,w,h);
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed;
      if(p.isHeart){
        ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.r/7,p.r/7);
        ctx.beginPath();
        ctx.moveTo(0,-4);
        ctx.bezierCurveTo(5,-9,12,-4,0,7);
        ctx.bezierCurveTo(-12,-4,-5,-9,0,-4);
        ctx.fillStyle='hsla('+p.hue+',82%,68%,'+p.alpha+')';
        ctx.shadowColor='hsla('+p.hue+',90%,70%,0.8)';
        ctx.shadowBlur=8;
        ctx.fill();
        ctx.restore();
      } else {
        var bg2=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
        bg2.addColorStop(0,'hsla('+p.hue+',75%,70%,'+p.alpha+')');
        bg2.addColorStop(1,'hsla('+p.hue+',75%,70%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=bg2; ctx.fill();
      }
      if(p.y<-25){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; }
    }

  } else if(theme==='christmas'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.018; p.x+=Math.sin(p.wobble)*p.drift; p.y+=p.speed;
      if(p.isStar){
        p.rot+=p.rotSpeed;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.beginPath();
        for(var sp=0;sp<5;sp++){
          var sang=sp*Math.PI*2/5-Math.PI/2;
          var sang2=sang+Math.PI/5;
          if(sp===0) ctx.moveTo(Math.cos(sang)*p.r,Math.sin(sang)*p.r);
          else ctx.lineTo(Math.cos(sang)*p.r,Math.sin(sang)*p.r);
          ctx.lineTo(Math.cos(sang2)*p.r*0.42,Math.sin(sang2)*p.r*0.42);
        }
        ctx.closePath();
        ctx.fillStyle='rgba(255,225,80,'+p.alpha+')';
        ctx.shadowColor='rgba(255,200,50,0.9)';
        ctx.shadowBlur=12;
        ctx.fill();
        ctx.restore();
      } else {
        var csg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*1.8);
        csg.addColorStop(0,'rgba(235,248,255,'+p.alpha+')');
        csg.addColorStop(1,'rgba(200,230,255,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*1.8,0,Math.PI*2);
        ctx.fillStyle=csg; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(240,250,255,'+p.alpha+')'; ctx.fill();
      }
      if(p.y>h+15){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; p.wobble=np.wobble; }
    }

  } else if(theme==='diwali'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.vx; p.y+=p.vy;
      p.life-=p.fade;
      if(p.life<=0){
        var np=ambNewParticle(theme,w,h,false); Object.assign(p,np);
      } else {
        var a=p.alpha*p.life;
        // Glow
        var dg2=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*4);
        dg2.addColorStop(0,'hsla('+p.hue+',100%,68%,'+a+')');
        dg2.addColorStop(1,'hsla('+p.hue+',100%,68%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*4,0,Math.PI*2);
        ctx.fillStyle=dg2; ctx.fill();
        // Core
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,200,'+Math.min(a*1.4,1)+')'; ctx.fill();
      }
    }

  } else if(theme==='easter'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      // Egg outline glow
      ctx.beginPath(); ctx.ellipse(0,0,p.rx+3,p.ry+3,0,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hsl+',0.2)'; ctx.fill();
      // Egg fill
      ctx.beginPath(); ctx.ellipse(0,0,p.rx,p.ry,0,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hsl+','+p.alpha+')';
      // Shine
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(-p.rx*0.22,-p.ry*0.3,p.rx*0.22,p.ry*0.15,-0.4,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.fill();
      ctx.restore();
      if(p.y>h+25){ var np=ambNewParticle(theme,w,h,false); p.x=np.x; p.y=np.y; }
    }
  } else if(theme==='ocean'){
    // Deep ocean gradient wash
    var ow=ctx.createLinearGradient(0,h*0.45,0,h);
    ow.addColorStop(0,'rgba(0,80,140,0.10)'); ow.addColorStop(1,'rgba(0,40,90,0.16)');
    ctx.fillStyle=ow; ctx.fillRect(0,h*0.45,w,h*0.55);
    // Slow wave bands
    if(!window._ambWave) window._ambWave={t:0};
    window._ambWave.t+=0.008*_ambSpeed;
    var wt=window._ambWave.t;
    for(var wb=0;wb<3;wb++){
      ctx.beginPath(); ctx.moveTo(0,h*0.55+wb*22);
      for(var wx=0;wx<=w;wx+=8){
        ctx.lineTo(wx, h*0.55+wb*22+Math.sin(wx*0.012+wt+wb*1.2)*10);
      }
      ctx.strokeStyle='rgba(80,180,255,'+(0.12-wb*0.03)+')'; ctx.lineWidth=2+wb; ctx.stroke();
    }
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      if(p.isBubble){
        p.y+=p.speed; p.x+=Math.sin(p.y*0.04)*0.8;
        var bg=ctx.createRadialGradient(p.x-p.r*0.3,p.y-p.r*0.3,0,p.x,p.y,p.r);
        bg.addColorStop(0,'rgba(180,230,255,'+(p.alpha*0.6)+')');
        bg.addColorStop(0.7,'rgba(80,160,220,'+(p.alpha*0.15)+')');
        bg.addColorStop(1,'rgba(60,140,200,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=bg; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.strokeStyle='rgba(160,220,255,'+(p.alpha*0.5)+')'; ctx.lineWidth=0.8; ctx.stroke();
        if(p.y<-p.r){ var onp=ambNewParticle(theme,w,h,false); p.x=onp.x; p.y=onp.y; }
      } else {
        p.x+=p.drift; p.y-=p.speed;
        var wg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
        wg.addColorStop(0,'hsla('+p.hue+',70%,60%,'+p.alpha+')');
        wg.addColorStop(1,'hsla('+p.hue+',70%,60%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=wg; ctx.fill();
        if(p.y<h*0.45) p.y=h+10;
      }
    }

  } else if(theme==='tornado'){
    // Dark swirling overlay
    ctx.fillStyle='rgba(20,25,40,0.12)'; ctx.fillRect(0,0,w,h);
    if(!window._ambTornado) window._ambTornado={t:0};
    window._ambTornado.t+=0.03*_ambSpeed;
    var tt=window._ambTornado.t;
    // Funnel outline
    var cx=w*0.5, cy=h*0.15;
    for(var fy=0;fy<h*0.85;fy+=4){
      var fr=(fy/h)*130;
      ctx.beginPath();
      ctx.arc(cx,cy+fy,fr*0.4+Math.sin(tt+fy*0.03)*5,0,Math.PI*2);
      ctx.strokeStyle='rgba(150,170,210,'+(0.04+fr/600)+')'; ctx.lineWidth=1; ctx.stroke();
    }
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.angle+=p.rotSpeed; p.y-=p.rise;
      var tnr=p.radius*(1-(p.y-h*0.3)/(h*0.7));
      if(tnr<5)tnr=5;
      var tpx=w*0.5+Math.cos(p.angle+tt)*tnr;
      var tpy=p.y;
      ctx.beginPath(); ctx.arc(tpx,tpy,p.r,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hue+',40%,65%,'+p.alpha+')'; ctx.fill();
      if(p.y<h*0.1||tpy<0){ var tnp=ambNewParticle(theme,w,h,false); Object.assign(p,tnp); p.y=h*0.3+Math.random()*h*0.7; }
    }

  } else if(theme==='rainbow'){
    // Seven colour bands arching across sky
    var rbands=['rgba(255,50,50,','rgba(255,140,0,','rgba(255,220,0,','rgba(50,200,50,','rgba(30,120,255,','rgba(100,50,200,','rgba(200,80,200,'];
    for(var ri=0;ri<7;ri++){
      var ry=h*0.08+ri*22; var rr=w*0.7+ri*18;
      ctx.beginPath();
      ctx.arc(w*0.5,h*0.9,rr,-Math.PI,0);
      ctx.strokeStyle=rbands[ri]+'0.18)'; ctx.lineWidth=16; ctx.stroke();
    }
    // Shimmer particles along the bands
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.speed; p.y+=p.drift;
      var rHues=[0,30,55,120,220,270,300];
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='hsla('+rHues[p.bandIndex]+',90%,65%,'+p.alpha+')'; ctx.fill();
      if(p.x>w+20){ var rnp=ambNewParticle(theme,w,h,false); p.x=-10; p.y=Math.random()*h; }
    }

  } else if(theme==='cherry'){
    // Soft pink tint wash
    ctx.fillStyle='rgba(255,180,200,0.04)'; ctx.fillRect(0,0,w,h);
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.02; p.x+=p.drift+Math.sin(p.wobble)*0.8; p.y+=p.speed; p.rot+=p.rotSpeed;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      // Petal shape
      ctx.beginPath();
      ctx.ellipse(0,0,p.r*0.6,p.r,0,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hue+',85%,75%,'+p.alpha+')'; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.r*0.4,0,p.r*0.55,p.r*0.85,0.4,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hue+',80%,80%,'+(p.alpha*0.7)+')'; ctx.fill();
      ctx.restore();
      if(p.y>h+20){ var cnp=ambNewParticle(theme,w,h,false); p.x=cnp.x; p.y=cnp.y; }
    }

  } else if(theme==='forest'){
    // Green tint
    ctx.fillStyle='rgba(30,80,20,0.06)'; ctx.fillRect(0,0,w,h);
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.015; p.x+=p.drift+Math.sin(p.wobble)*0.6; p.y+=p.speed; p.rot+=p.rotSpeed;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(0,-p.r);
      ctx.bezierCurveTo(p.r*0.8,-p.r*0.4, p.r*0.6,p.r*0.5, 0,p.r);
      ctx.bezierCurveTo(-p.r*0.6,p.r*0.5, -p.r*0.8,-p.r*0.4, 0,-p.r);
      ctx.fillStyle='hsla('+p.hue+',65%,42%,'+p.alpha+')'; ctx.fill();
      ctx.restore();
      if(p.y>h+20){ var fnp=ambNewParticle(theme,w,h,false); p.x=fnp.x; p.y=fnp.y; }
    }
    // Light dapples
    if(!window._ambDapple) window._ambDapple={t:0};
    window._ambDapple.t+=0.015*_ambSpeed;
    for(var d=0;d<6;d++){
      var dx=w*(0.1+d*0.16)+Math.sin(window._ambDapple.t+d)*20;
      var dy=h*(0.2+Math.cos(window._ambDapple.t*0.7+d)*0.15);
      var dg=ctx.createRadialGradient(dx,dy,0,dx,dy,40+d*8);
      dg.addColorStop(0,'rgba(180,240,130,0.09)'); dg.addColorStop(1,'rgba(180,240,130,0)');
      ctx.beginPath(); ctx.arc(dx,dy,40+d*8,0,Math.PI*2); ctx.fillStyle=dg; ctx.fill();
    }

  } else if(theme==='dawn'){
    // Horizon gradient
    var dawnG=ctx.createLinearGradient(0,0,0,h);
    dawnG.addColorStop(0,'rgba(20,30,80,0.10)');
    dawnG.addColorStop(0.5,'rgba(255,120,50,0.08)');
    dawnG.addColorStop(0.75,'rgba(255,180,80,0.10)');
    dawnG.addColorStop(1,'rgba(255,210,120,0.06)');
    ctx.fillStyle=dawnG; ctx.fillRect(0,0,w,h);
    // Sun rising at horizon
    var sunX=w*0.5, sunY=h*0.68;
    var sunRad=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,160);
    sunRad.addColorStop(0,'rgba(255,240,160,0.32)');
    sunRad.addColorStop(0.3,'rgba(255,160,60,0.18)');
    sunRad.addColorStop(1,'rgba(255,100,30,0)');
    ctx.beginPath(); ctx.arc(sunX,sunY,160,0,Math.PI*2); ctx.fillStyle=sunRad; ctx.fill();
    // Mist particles rising
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed;
      var dmg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2);
      dmg.addColorStop(0,'hsla('+p.hue+',80%,70%,'+p.alpha+')');
      dmg.addColorStop(1,'hsla('+p.hue+',80%,70%,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2); ctx.fillStyle=dmg; ctx.fill();
      if(p.y<-p.r*2){ var dnp=ambNewParticle(theme,w,h,false); p.x=dnp.x; p.y=dnp.y; }
    }

  } else if(theme==='citynite'){
    // Skyline silhouette
    if(!window._ambCity){ window._ambCity={t:0}; }
    window._ambCity.t+=0.005*_ambSpeed;
    // Draw skyline buildings
    var bw=40, bx=0;
    ctx.fillStyle='rgba(8,12,30,0.35)';
    ctx.fillRect(0,h*0.55,w,h*0.45);
    var bHeights=[0.35,0.25,0.42,0.28,0.38,0.22,0.45,0.30,0.36,0.24,0.40,0.27,0.33,0.20,0.38,0.26,0.43,0.29,0.35,0.23];
    for(var b=0;b<20;b++){
      var bW=w/20; var bH=h*bHeights[b];
      var bY=h-bH;
      ctx.fillStyle='rgba(15,20,45,0.8)';
      ctx.fillRect(b*bW,bY,bW-2,bH);
    }
    // Window lights
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.flicker+=p.flickerSpeed;
      var fa=p.targetAlpha*(0.6+Math.sin(p.flicker)*0.4);
      ctx.beginPath(); ctx.rect(p.x,p.y,p.r*2,p.r*1.4);
      ctx.fillStyle=p.isOrange?'rgba(255,190,80,'+fa+')':'rgba(180,220,255,'+fa+')'; ctx.fill();
    }
    // Street glow at bottom
    var streetG=ctx.createLinearGradient(0,h*0.9,0,h);
    streetG.addColorStop(0,'rgba(255,160,40,0.0)');
    streetG.addColorStop(0.5,'rgba(255,120,30,0.08)');
    streetG.addColorStop(1,'rgba(255,80,20,0.0)');
    ctx.fillStyle=streetG; ctx.fillRect(0,h*0.9,w,h*0.1);

  } else if(theme==='goldhour'){
    // Warm golden atmosphere
    var ghG=ctx.createLinearGradient(0,0,0,h);
    ghG.addColorStop(0,'rgba(255,140,20,0.08)');
    ghG.addColorStop(0.5,'rgba(255,180,60,0.10)');
    ghG.addColorStop(1,'rgba(200,80,10,0.06)');
    ctx.fillStyle=ghG; ctx.fillRect(0,0,w,h);
    // Side sun
    var ghSx=w*0.05, ghSy=h*0.45;
    var ghSg=ctx.createRadialGradient(ghSx,ghSy,0,ghSx,ghSy,200);
    ghSg.addColorStop(0,'rgba(255,220,100,0.30)');
    ghSg.addColorStop(0.4,'rgba(255,160,50,0.15)');
    ghSg.addColorStop(1,'rgba(255,100,20,0)');
    ctx.beginPath(); ctx.arc(ghSx,ghSy,200,0,Math.PI*2); ctx.fillStyle=ghSg; ctx.fill();
    // Long shadow rays
    for(var r=0;r<8;r++){
      var rAng=(r/8)*Math.PI*0.6-Math.PI*0.1;
      ctx.beginPath(); ctx.moveTo(ghSx,ghSy);
      ctx.lineTo(ghSx+Math.cos(rAng)*w*1.5, ghSy+Math.sin(rAng)*h*1.5);
      ctx.strokeStyle='rgba(255,200,80,0.04)'; ctx.lineWidth=30; ctx.stroke();
    }
    // Dust motes
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed;
      var gg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2);
      gg.addColorStop(0,'hsla('+p.hue+',90%,65%,'+p.alpha+')');
      gg.addColorStop(1,'hsla('+p.hue+',90%,65%,0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2,0,Math.PI*2); ctx.fillStyle=gg; ctx.fill();
      if(p.y<-p.r*2){ var gnp=ambNewParticle(theme,w,h,false); p.x=gnp.x; p.y=gnp.y; }
    }

  } else if(theme==='ramadan'){
    // Deep indigo night wash
    ctx.fillStyle='rgba(10,8,40,0.14)'; ctx.fillRect(0,0,w,h);
    // Crescent moon
    var rmx=w*0.8, rmy=h*0.12, rmr=32;
    var rma=ctx.createRadialGradient(rmx,rmy,rmr*0.6,rmx,rmy,rmr*3);
    rma.addColorStop(0,'rgba(255,220,100,0.18)'); rma.addColorStop(1,'rgba(255,180,60,0)');
    ctx.beginPath(); ctx.arc(rmx,rmy,rmr*3,0,Math.PI*2); ctx.fillStyle=rma; ctx.fill();
    var rmd=ctx.createRadialGradient(rmx-rmr*0.1,rmy-rmr*0.1,1,rmx,rmy,rmr);
    rmd.addColorStop(0,'rgba(255,248,220,0.96)'); rmd.addColorStop(1,'rgba(245,220,140,0.85)');
    ctx.beginPath(); ctx.arc(rmx,rmy,rmr,0,Math.PI*2); ctx.fillStyle=rmd; ctx.fill();
    ctx.beginPath(); ctx.arc(rmx+rmr*0.45,rmy-rmr*0.06,rmr*0.80,0,Math.PI*2);
    ctx.fillStyle='rgba(10,8,40,0.95)'; ctx.fill();
    // Stars + lanterns
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      if(p.isLantern){
        p.wobble+=0.02; p.x+=p.drift+Math.sin(p.wobble)*0.5; p.y+=p.speed;
        p.alpha+=p.twinkleSpeed*p.twinkleDir;
        if(p.alpha>=p.baseAlpha)p.twinkleDir=-1; if(p.alpha<=p.baseAlpha*0.4)p.twinkleDir=1;
        // Lantern body
        var lg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.5);
        lg.addColorStop(0,'hsla('+p.hue+',95%,65%,'+p.alpha+')');
        lg.addColorStop(0.5,'hsla('+p.hue+',90%,55%,'+(p.alpha*0.4)+')');
        lg.addColorStop(1,'hsla('+p.hue+',85%,50%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2); ctx.fillStyle=lg; ctx.fill();
        ctx.save(); ctx.translate(p.x,p.y);
        ctx.fillStyle='hsla('+p.hue+',90%,60%,'+(p.alpha*0.9)+')';
        ctx.fillRect(-p.r*0.7,-p.r,p.r*1.4,p.r*2);
        ctx.restore();
        if(p.y<-20){ var rnp2=ambNewParticle(theme,w,h,false); p.x=rnp2.x; p.y=rnp2.y; }
      } else {
        p.alpha+=p.twinkleSpeed*p.twinkleDir;
        if(p.alpha>=p.baseAlpha)p.twinkleDir=-1; if(p.alpha<=p.baseAlpha*0.1)p.twinkleDir=1;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,245,200,'+p.alpha+')'; ctx.fill();
      }
    }

  } else if(theme==='bubbles'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.025; p.x+=p.drift+Math.sin(p.wobble)*0.5; p.y+=p.speed;
      p.shimmer+=0.04;
      // Iridescent bubble
      var ba=p.alpha;
      var bg2=ctx.createRadialGradient(p.x-p.r*0.35,p.y-p.r*0.35,0,p.x,p.y,p.r);
      bg2.addColorStop(0,'rgba(255,255,255,'+(ba*0.55)+')');
      bg2.addColorStop(0.3,'hsla('+(p.hue+p.shimmer*30%360)+',80%,75%,'+(ba*0.12)+')');
      bg2.addColorStop(0.7,'hsla('+(p.hue+180)%360+',70%,70%,'+(ba*0.08)+')');
      bg2.addColorStop(1,'rgba(200,230,255,'+(ba*0.04)+')');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=bg2; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.strokeStyle='rgba(180,220,255,'+(ba*0.35)+')'; ctx.lineWidth=1.2; ctx.stroke();
      // Highlight
      ctx.beginPath(); ctx.arc(p.x-p.r*0.32,p.y-p.r*0.32,p.r*0.22,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,'+(ba*0.6)+')'; ctx.fill();
      if(p.y<-p.r){ var bnp=ambNewParticle(theme,w,h,false); p.x=bnp.x; p.y=bnp.y; }
    }

  } else if(theme==='galaxy'){
    // Deep space background
    var gxG=ctx.createRadialGradient(w*0.5,h*0.5,0,w*0.5,h*0.5,Math.max(w,h)*0.8);
    gxG.addColorStop(0,'rgba(25,5,50,0.08)');
    gxG.addColorStop(0.5,'rgba(5,10,40,0.06)');
    gxG.addColorStop(1,'rgba(0,5,20,0.04)');
    ctx.fillStyle=gxG; ctx.fillRect(0,0,w,h);
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      if(p.isStar){
        p.alpha+=p.twinkleSpeed*p.twinkleDir;
        if(p.alpha>=p.baseAlpha)p.twinkleDir=-1; if(p.alpha<=p.baseAlpha*0.1)p.twinkleDir=1;
        var gsg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*3);
        gsg.addColorStop(0,'hsla('+p.hue+',70%,85%,'+p.alpha+')');
        gsg.addColorStop(0.5,'hsla('+p.hue+',60%,75%,'+(p.alpha*0.3)+')');
        gsg.addColorStop(1,'hsla('+p.hue+',50%,70%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r*3,0,Math.PI*2); ctx.fillStyle=gsg; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+p.alpha+')'; ctx.fill();
      } else {
        p.alpha+=(p.targetAlpha-p.alpha)*0.005;
        p.x+=p.speed; p.y+=p.drift;
        if(p.x>w+p.r)p.x=-p.r;
        var ngg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
        ngg.addColorStop(0,'hsla('+p.hue+',70%,55%,'+p.alpha+')');
        ngg.addColorStop(1,'hsla('+p.hue+',60%,50%,0)');
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=ngg; ctx.fill();
      }
    }

  } else if(theme==='ember'){
    // Dark warm bg
    ctx.fillStyle='rgba(40,8,0,0.14)'; ctx.fillRect(0,0,w,h);
    // Fire glow at bottom
    var efg=ctx.createLinearGradient(0,h*0.7,0,h);
    efg.addColorStop(0,'rgba(255,60,0,0)');
    efg.addColorStop(0.5,'rgba(255,80,10,0.12)');
    efg.addColorStop(1,'rgba(200,40,0,0.08)');
    ctx.fillStyle=efg; ctx.fillRect(0,h*0.7,w,h*0.3);
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.wobble+=0.06*_ambSpeed; p.x+=p.drift+Math.sin(p.wobble)*0.8; p.y+=p.speed;
      p.life-=p.fade;
      if(p.life<=0){ var enp=ambNewParticle(theme,w,h,false); Object.assign(p,enp); p.y=h+5; continue; }
      var ea=p.alpha*p.life;
      var ecol=p.life>0.5?'hsla('+p.hue+',100%,62%,':'hsla('+p.hue+',80%,40%,';
      var erg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.5);
      erg.addColorStop(0,'rgba(255,240,180,'+(ea*0.9)+')');
      erg.addColorStop(0.4,ecol+(ea*0.6)+')');
      erg.addColorStop(1,ecol+'0)');
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2); ctx.fillStyle=erg; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*0.6,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,200,'+(ea*0.8)+')'; ctx.fill();
    }

  } else if(theme==='paper'){
    for(var i=0;i<_ambParticles.length;i++){
      var p=_ambParticles[i];
      p.x+=p.drift; p.y+=p.speed; p.rot+=p.rotSpeed;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      // Paper sheet
      ctx.fillStyle='rgba(245,240,225,'+p.alpha+')';
      ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
      // Lines on paper
      ctx.strokeStyle='rgba(150,140,120,'+(p.alpha*0.5)+')'; ctx.lineWidth=0.8;
      for(var l=1;l<3;l++){
        ctx.beginPath(); ctx.moveTo(-p.w/2+3,-p.h/2+l*(p.h/3));
        ctx.lineTo(p.w/2-3,-p.h/2+l*(p.h/3)); ctx.stroke();
      }
      if(p.isDoc){
        // Tiny heading line
        ctx.strokeStyle='rgba(80,100,160,'+(p.alpha*0.4)+')'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(-p.w/2+3,-p.h/2+4); ctx.lineTo(p.w*0.2,-p.h/2+4); ctx.stroke();
      }
      ctx.restore();
      if(p.y>h+30){ var pnp=ambNewParticle(theme,w,h,false); p.x=pnp.x; p.y=pnp.y; p.rot=pnp.rot; }
    }
  }

  _ambRAF = requestAnimationFrame(function(){ ambLoop(theme, canvas); });
}

// ── Control Deck: render the theme picker dropdown ──
function cdAmbRender(){
  var sel    = document.getElementById('cd-amb-select');
  var status = document.getElementById('cd-amb-status');
  if(sel){
    sel.innerHTML = _ambThemes.map(function(t){
      var selected = _ambCurrent === t.id ? ' selected' : '';
      return '<option value="'+t.id+'"'+selected+'>'+t.icon+' '+t.label+'</option>';
    }).join('');
    sel.value = _ambCurrent;
  }
  if(status){
    var cur = _ambThemes.find(function(t){return t.id===_ambCurrent;});
    status.textContent = cur && cur.id!=='off' ? cur.icon+' '+cur.label+' active' : '';
  }
}

async function cdAmbLoadAndRender(){
  try{
    var rows = await sbQuery('settings','key=eq.'+_ambKey+'&select=value');
    var theme = (rows&&rows.length) ? (rows[0].value||'off') : 'off';
    ambApply(theme); // ambApply now sets _ambCurrent itself
  }catch(e){}
  // Sync sliders to current values
  var oslider=document.getElementById('cd-amb-opacity');
  if(oslider){ oslider.value=Math.round(_ambOpacity*100); var ov=document.getElementById('cd-amb-opacity-val'); if(ov) ov.textContent=Math.round(_ambOpacity*100)+'%'; }
  var sslider=document.getElementById('cd-amb-speed');
  if(sslider){ sslider.value=Math.round(_ambSpeed*100); var sv=document.getElementById('cd-amb-speed-val'); if(sv) sv.textContent=_ambSpeed.toFixed(1)+'×'; }
  var dslider=document.getElementById('cd-amb-density');
  if(dslider){ dslider.value=Math.round(_ambDensity*100); var dv=document.getElementById('cd-amb-density-val'); if(dv) dv.textContent=_ambDensity.toFixed(1)+'×'; }
  cdAmbRender();
  cdAmbSchedRenderPicker();
  cdAmbSchedLoad();
}

async function cdAmbSet(theme){
  var msg = document.getElementById('cd-amb-msg');
  try{
    var existing = await sbQuery('settings','key=eq.'+_ambKey+'&select=key');
    if(existing&&existing.length){ await sbUpdate('settings','key',_ambKey,{value:theme}); }
    else{ await sbInsert('settings',{key:_ambKey,value:theme}); }
    ambApply(theme);
    _ambSchedManualOverride = true;
    setTimeout(function(){ _ambSchedManualOverride = false; }, 30*60*1000); // auto-release after 30min
    if(msg){ msg.textContent='✅ Theme set to '+(theme==='off'?'Off':theme)+'. All agents will see it within 30s.'; msg.style.color='var(--accent-green)'; msg.style.display='block'; setTimeout(function(){msg.style.display='none';},3500); }
  }catch(e){
    if(msg){ msg.textContent='Error: '+e.message; msg.style.color='var(--accent-red)'; msg.style.display='block'; setTimeout(function(){msg.style.display='none';},3000); }
  }
  cdAmbRender();
}

// ── Opacity / Speed / Density controls ──
function ambSetOpacity(val){
  _ambOpacity = val/100;
  var canvas=document.getElementById('ambient-canvas');
  if(canvas) canvas.style.opacity=_ambOpacity;
  var el=document.getElementById('cd-amb-opacity-val');
  if(el) el.textContent=val+'%';
  ambSaveControls();
}
function ambSetSpeed(val){
  _ambSpeed = val/100;
  var el=document.getElementById('cd-amb-speed-val');
  if(el) el.textContent=(val/100).toFixed(1)+'×';
  // Respawn particles so speed takes effect immediately
  var canvas=document.getElementById('ambient-canvas');
  if(canvas&&_ambCurrent!=='off'){
    if(_ambRAF){cancelAnimationFrame(_ambRAF);_ambRAF=null;}
    _ambParticles=[];
    window._ambMoon=null;
    ambSpawn(_ambCurrent,canvas);
    ambLoop(_ambCurrent,canvas);
  }
  ambSaveControls();
}
function ambSetDensity(val){
  _ambDensity = val/100;
  var el=document.getElementById('cd-amb-density-val');
  if(el) el.textContent=(val/100).toFixed(1)+'×';
  // Respawn with new count
  var canvas=document.getElementById('ambient-canvas');
  if(canvas&&_ambCurrent!=='off'){
    if(_ambRAF){cancelAnimationFrame(_ambRAF);_ambRAF=null;}
    _ambParticles=[];
    window._ambMoon=null;
    ambSpawn(_ambCurrent,canvas);
    ambLoop(_ambCurrent,canvas);
  }
  ambSaveControls();
}
async function ambSaveControls(){
  try{
    var val=JSON.stringify({opacity:_ambOpacity,speed:_ambSpeed,density:_ambDensity});
    var ex=await sbQuery('settings','key=eq.'+_ambCtrlKey+'&select=key');
    if(ex&&ex.length) await sbUpdate('settings','key',_ambCtrlKey,{value:val});
    else await sbInsert('settings',{key:_ambCtrlKey,value:val});
  }catch(e){}
}
async function ambLoadControls(){
  try{
    var rows=await sbQuery('settings','key=eq.'+_ambCtrlKey+'&select=value');
    if(!rows||!rows.length) return;
    var ctrl=JSON.parse(rows[0].value||'{}');
    if(ctrl.opacity!=null) _ambOpacity=ctrl.opacity;
    if(ctrl.speed!=null)   _ambSpeed=ctrl.speed;
    if(ctrl.density!=null) _ambDensity=ctrl.density;
    // Apply to canvas
    var canvas=document.getElementById('ambient-canvas');
    if(canvas) canvas.style.opacity=_ambOpacity;
    // Sync sliders if CD is open
    var oslider=document.getElementById('cd-amb-opacity');
    if(oslider){ oslider.value=Math.round(_ambOpacity*100); var ov=document.getElementById('cd-amb-opacity-val'); if(ov) ov.textContent=Math.round(_ambOpacity*100)+'%'; }
    var sslider=document.getElementById('cd-amb-speed');
    if(sslider){ sslider.value=Math.round(_ambSpeed*100); var sv=document.getElementById('cd-amb-speed-val'); if(sv) sv.textContent=_ambSpeed.toFixed(1)+'×'; }
    var dslider=document.getElementById('cd-amb-density');
    if(dslider){ dslider.value=Math.round(_ambDensity*100); var dv=document.getElementById('cd-amb-density-val'); if(dv) dv.textContent=_ambDensity.toFixed(1)+'×'; }
  }catch(e){}
}

//  Stored in settings table: ambient_schedules
//  Value: JSON array of { id, theme, start, end, days }
//  days: array of 0-6 (0=Sun ... 6=Sat)
// ══════════════════════════════════════════════════════════

var _ambSchedKey = 'ambient_schedules';
var _ambSchedCheckInterval = null;
var _ambSchedManualOverride = false; // true when admin manually set a theme, ignores schedule until next schedule tick

function ambSchedStart(){
  if(_ambSchedCheckInterval) clearInterval(_ambSchedCheckInterval);
  _ambSchedCheckInterval = setInterval(ambSchedTick, 60000); // check every minute
  ambSchedTick();
}

async function ambSchedTick(){
  if(_ambSchedManualOverride) return;
  try{
    var rows = await sbQuery('settings','key=eq.'+_ambSchedKey+'&select=value');
    if(!rows||!rows.length) return;
    var schedules = JSON.parse(rows[0].value||'[]');
    if(!schedules.length) return;
    var now = new Date();
    var day = now.getDay(); // 0=Sun
    var hhmm = now.getHours()*60 + now.getMinutes();
    var matched = null;
    for(var i=0;i<schedules.length;i++){
      var s = schedules[i];
      if(s.days.indexOf(day) === -1) continue;
      var start = ambTimeToMins(s.start);
      var end   = ambTimeToMins(s.end);
      if(end <= start) end += 1440; // overnight wrap
      var nowAdj = hhmm;
      if(end > 1440 && hhmm < start) nowAdj += 1440;
      if(nowAdj >= start && nowAdj < end){ matched = s; break; }
    }
    var target = matched ? matched.theme : 'off';
    if(target !== _ambCurrent){ ambApply(target); }
  }catch(e){}
}

function ambTimeToMins(t){
  if(!t) return 0;
  var parts = t.split(':');
  return parseInt(parts[0]||0)*60 + parseInt(parts[1]||0);
}

// ── Render schedule picker (called when CD opens) ──
function cdAmbSchedRenderPicker(){
  // Populate theme dropdown
  var sel = document.getElementById('cd-amb-sched-theme');
  if(sel && !sel.options.length){
    _ambThemes.filter(function(t){return t.id!=='off';}).forEach(function(t){
      var o = document.createElement('option');
      o.value = t.id; o.textContent = t.icon+' '+t.label;
      sel.appendChild(o);
    });
  }
  // Populate day checkboxes
  var daysWrap = document.getElementById('cd-amb-sched-days');
  if(daysWrap && !daysWrap.children.length){
    var dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    daysWrap.innerHTML = dayNames.map(function(d,i){
      return '<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.62rem;color:var(--text-muted);cursor:pointer;">'+
        '<input type="checkbox" value="'+i+'" class="cd-amb-day-cb" style="accent-color:var(--gold);width:13px;height:13px;" '+(i>=1&&i<=5?'checked':'')+'/>'+ d +'</label>';
    }).join('');
  }
}

async function cdAmbSchedLoad(){
  var list = document.getElementById('cd-amb-sched-list');
  if(!list) return;
  try{
    var rows = await sbQuery('settings','key=eq.'+_ambSchedKey+'&select=value');
    var schedules = (rows&&rows.length) ? JSON.parse(rows[0].value||'[]') : [];
    if(!schedules.length){
      list.innerHTML='<div style="font-size:.78rem;color:var(--text-dim);">No schedules yet.</div>';
      return;
    }
    var dayNames=['Su','Mo','Tu','We','Th','Fr','Sa'];
    list.innerHTML = schedules.map(function(s){
      var t = _ambThemes.find(function(x){return x.id===s.theme;})||{icon:'?',label:s.theme};
      var daysStr = s.days.map(function(d){return dayNames[d];}).join(', ');
      return '<div style="display:flex;align-items:center;gap:.6rem;padding:.45rem .6rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:8px;font-size:.78rem;">'+
        '<span style="font-size:1rem;">'+t.icon+'</span>'+
        '<span style="font-weight:600;color:var(--text-primary);min-width:80px;">'+t.label+'</span>'+
        '<span style="color:var(--text-muted);">'+s.start+' – '+s.end+'</span>'+
        '<span style="color:var(--text-dim);font-size:.7rem;">'+daysStr+'</span>'+
        '<button onclick="cdAmbSchedDelete(\''+s.id+'\')" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--accent-red);font-size:.8rem;padding:0 2px;" title="Remove">✕</button>'+
      '</div>';
    }).join('');
  }catch(e){
    if(list) list.innerHTML='<div style="font-size:.78rem;color:var(--accent-red);">Could not load schedules.</div>';
  }
}

async function cdAmbSchedAdd(){
  var msg = document.getElementById('cd-amb-sched-msg');
  var theme = (document.getElementById('cd-amb-sched-theme')||{}).value;
  var start = (document.getElementById('cd-amb-sched-start')||{}).value;
  var end   = (document.getElementById('cd-amb-sched-end')||{}).value;
  var dayCbs = document.querySelectorAll('.cd-amb-day-cb:checked');
  var days = [];
  dayCbs.forEach(function(cb){ days.push(parseInt(cb.value)); });

  if(!theme||!start||!end){ if(msg){msg.textContent='Please fill in theme, start and end time.';msg.style.color='var(--accent-red)';msg.style.display='block';setTimeout(function(){msg.style.display='none';},3000);} return; }
  if(!days.length){ if(msg){msg.textContent='Select at least one day.';msg.style.color='var(--accent-red)';msg.style.display='block';setTimeout(function(){msg.style.display='none';},3000);} return; }

  try{
    var rows = await sbQuery('settings','key=eq.'+_ambSchedKey+'&select=value');
    var schedules = (rows&&rows.length) ? JSON.parse(rows[0].value||'[]') : [];
    schedules.push({ id: Date.now().toString(36), theme:theme, start:start, end:end, days:days });
    var val = JSON.stringify(schedules);
    if(rows&&rows.length){ await sbUpdate('settings','key',_ambSchedKey,{value:val}); }
    else { await sbInsert('settings',{key:_ambSchedKey,value:val}); }
    if(msg){msg.textContent='✅ Schedule added.';msg.style.color='var(--accent-green)';msg.style.display='block';setTimeout(function(){msg.style.display='none';},2500);}
    cdAmbSchedLoad();
  }catch(e){ if(msg){msg.textContent='Error: '+e.message;msg.style.color='var(--accent-red)';msg.style.display='block';setTimeout(function(){msg.style.display='none';},3000);} }
}

async function cdAmbSchedDelete(id){
  try{
    var rows = await sbQuery('settings','key=eq.'+_ambSchedKey+'&select=value');
    var schedules = (rows&&rows.length) ? JSON.parse(rows[0].value||'[]') : [];
    schedules = schedules.filter(function(s){return s.id!==id;});
    await sbUpdate('settings','key',_ambSchedKey,{value:JSON.stringify(schedules)});
    cdAmbSchedLoad();
  }catch(e){ alert('Error: '+e.message); }
}




var _cdPwResetUnlocked = false;
function cdPwResetUnlock(){
  if(_cdPwResetUnlocked) return;
  var pinEl = document.getElementById('cd-pwreset-pin');
  var errEl = document.getElementById('cd-pwreset-pin-err');
  var pin = (pinEl ? pinEl.value : '').trim();
  if(pin !== '7070'){
    if(errEl){ errEl.style.display='inline'; setTimeout(function(){ errEl.style.display='none'; }, 2000); }
    if(pinEl){ pinEl.value=''; pinEl.focus(); }
    return;
  }
  _cdPwResetUnlocked = true;
  var lockedDiv = document.getElementById('cd-pwreset-locked');
  var panelDiv  = document.getElementById('cd-pwreset-panel');
  var unlockBtn = document.getElementById('cd-pwreset-unlock-btn');
  if(lockedDiv) lockedDiv.style.display = 'none';
  if(panelDiv)  panelDiv.style.display  = 'block';
  if(unlockBtn) unlockBtn.style.display = 'none';
  cdPwResetLoad();
}

async function cdPwResetLoad(){
  var container = document.getElementById('cd-pwreset-agents');
  if(!container) return;
  container.innerHTML = '<div style="color:var(--text-dim);font-size:.82rem;">Loading agents…</div>';
  try{
    var users = await sbQuery('users','select=id,name,email,role&order=name.asc');
    if(!users||!users.length){ container.innerHTML='<div style="color:var(--text-dim);font-size:.82rem;">No agents found.</div>'; return; }
    container.innerHTML = users.map(function(u){
      var ni=(u.name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
      return '<div style="display:flex;align-items:center;gap:.75rem;padding:.6rem .8rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:var(--radius-sm);">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dim),var(--gold));display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:#fff;flex-shrink:0;">'+ni+'</div>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-weight:600;font-size:.84rem;color:var(--text-primary);">'+esc(u.name)+'</div>'+
          '<div style="font-size:.72rem;color:var(--text-muted);">'+esc(u.email)+'</div>'+
        '</div>'+
        '<input id="cd-pw-inp-'+u.id+'" type="text" placeholder="New password (min 6)" class="cd-input" style="max-width:180px;font-size:.8rem;" onkeydown="if(event.key===\'Enter\')cdPwResetSave(\''+u.id+'\',\''+esc(u.name)+'\')"/>'+
        '<button class="xc-btn-sm" onclick="cdPwResetSave(\''+u.id+'\',\''+esc(u.name)+'\')">Set PW</button>'+
      '</div>';
    }).join('');
  }catch(e){ container.innerHTML='<div style="color:var(--accent-red);font-size:.82rem;">Error: '+e.message+'</div>'; }
}

async function cdPwResetSave(userId, name){
  var inp = document.getElementById('cd-pw-inp-'+userId);
  var msg = document.getElementById('cd-pwreset-msg');
  if(!inp) return;
  var newPw = (inp.value||'').trim();
  if(!newPw || newPw.length < 6){
    if(msg){ msg.style.display='block'; msg.textContent='Password must be at least 6 characters.'; msg.style.color='var(--accent-red)'; setTimeout(function(){ msg.style.display='none'; }, 3000); }
    return;
  }
  try{
    var hashed = await hashPassword(newPw);
    await sbUpdate('users','id',userId,{password:hashed});
    inp.value = '';
    if(msg){ msg.style.display='block'; msg.textContent='✅ Password for '+name+' reset. New password: '+newPw; msg.style.color='var(--accent-green)'; setTimeout(function(){ msg.style.display='none'; }, 5000); }
  }catch(e){
    if(msg){ msg.style.display='block'; msg.textContent='Error: '+e.message; msg.style.color='var(--accent-red)'; setTimeout(function(){ msg.style.display='none'; }, 4000); }
  }
}

// ── Celebration display (shown to agents) ──
function showCelebration(data){
  if(!data||!data.active) return;
  // Don't show if already dismissed this launch
  var seenKey = 'cel_seen_'+data.launched_at;
  if(sessionStorage.getItem(seenKey)) return;

  var ov = document.getElementById('grand-overlay');
  var modal = document.getElementById('grand-modal');
  var canvas = document.getElementById('grand-canvas');
  if(!ov||!modal||!canvas) return;

  // Update modal content
  modal.innerHTML =
    '<div style="font-size:3rem;margin-bottom:.5rem;">'+data.icon+'</div>'+
    '<div style="font-family:Cormorant Garamond,serif;font-size:1.7rem;font-weight:700;color:#fff;margin-bottom:.6rem;line-height:1.3;">'+esc(data.message)+'</div>'+
    '<div style="font-size:.78rem;color:rgba(255,255,255,.4);margin-bottom:1.6rem;">From the K7 Support Team 🧡</div>'+
    '<button id="cel-dismiss-btn" style="background:linear-gradient(135deg,#ef493c,#d03020);border:none;border-radius:12px;color:#fff;font-family:DM Sans,sans-serif;font-size:.9rem;font-weight:700;padding:.8rem 2.5rem;cursor:pointer;box-shadow:0 4px 20px rgba(239,73,60,.4);">Yay! 🎉</button>';

  document.getElementById('cel-dismiss-btn').onclick = function(){
    sessionStorage.setItem(seenKey, '1');
    closeCelebration();
  };

  // Custom firework colours
  var cols = data.colors || ['#ef493c','#ffaa50','#4c76a8','#2ec56f','#ffffff'];
  ov.style.display='block';
  ov.style.opacity='1';
  ov.style.transition='';
  modal.style.transform='translate(-50%,-50%) scale(1)';

  // Fireworks with custom colours
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  var ctx=canvas.getContext('2d');
  var pts=[];
  function burst(x,y){
    for(var i=0;i<90;i++){
      var a=Math.random()*Math.PI*2, sp=2+Math.random()*7;
      pts.push({x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.5,al:1,col:cols[Math.floor(Math.random()*cols.length)],sz:1.5+Math.random()*3,g:0.1+Math.random()*0.1});
    }
  }
  var shots=[200,500,900,1300,1800,2400,3100,4000,5000];
  shots.forEach(function(t){ setTimeout(function(){ if(ov.style.display!=='none') burst(80+Math.random()*(window.innerWidth-160),40+Math.random()*(window.innerHeight*0.55)); },t); });
  burst(window.innerWidth*0.3,window.innerHeight*0.35);
  setTimeout(function(){ burst(window.innerWidth*0.7,window.innerHeight*0.25); },250);
  function draw(){
    if(ov.style.display==='none'){ctx.clearRect(0,0,canvas.width,canvas.height);return;}
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(var i=pts.length-1;i>=0;i--){
      var p=pts[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.vx*=0.98; p.al-=0.013;
      if(p.al<=0){pts.splice(i,1);continue;}
      ctx.save(); ctx.globalAlpha=p.al;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.sz,0,Math.PI*2); ctx.fillStyle=p.col; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-p.vx*2.5,p.y-p.vy*2.5);
      ctx.strokeStyle=p.col; ctx.lineWidth=p.sz*0.6; ctx.stroke(); ctx.restore();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

function closeCelebration(){
  var ov=document.getElementById('grand-overlay');
  var modal=document.getElementById('grand-modal');
  if(!ov)return;
  if(modal) modal.style.transform='translate(-50%,-50%) scale(0)';
  ov.style.opacity='0'; ov.style.transition='opacity .4s';
  setTimeout(function(){ ov.style.display='none'; ov.style.opacity=''; },450);
}

// ── Check for active celebration in settings poll ──
async function checkCelebration(){
  try{
    var rows = await sbQuery('settings','key=eq.'+CD_CEL_KEY+'&select=value');
    if(!rows||!rows.length) return;
    var data = JSON.parse(rows[0].value);
    if(data&&data.active) showCelebration(data);
    else closeCelebration();
  }catch(e){}
}


// ════════════════════════════════════════════════════════
//  VOICE HUB — Walkie Talkie + Group Rooms (WebRTC)
// ════════════════════════════════════════════════════════
var VH = {
  // State
  wtEnabled: false,          // this user's WT toggle
  peers: {},                 // peerId -> RTCPeerConnection
  localStream: null,         // mic stream
  currentCall: {             // active 1-to-1 call
    peerId: null,
    peerName: null,
    isInitiator: false,
    timerInterval: null,
    startTime: null
  },
  currentRoom: null,         // active group room id
  roomMuted: true,
  pollInterval: null,
  signalPollInterval: null,
  roomPollInterval: null,
  speakingIntervals: {},

  // Supabase signaling table: voice_signals
  // Columns: id, from_id, from_name, to_id, to_room, type, payload, created_at
  // voice_wt_status table: user_id, user_name, wt_on, updated_at
  // voice_rooms table: id, name, created_by, created_at, members (jsonb)

  STUN: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ] },

  // Built at runtime from CF_TURN_TOKEN_ID / CF_TURN_API_TOKEN
  ICE: null
};

// ── Get ICE config (STUN + Cloudflare TURN) ──
// Cloudflare TURN credentials expire after 24h, so we fetch fresh ones each session
async function vhGetIceConfig(){
  if(VH.ICE) return VH.ICE; // cached for this session
  // Default STUN-only fallback
  var fallback = { iceServers:[
    {urls:'stun:stun.l.google.com:19302'},
    {urls:'stun:stun1.l.google.com:19302'}
  ]};
  if(!CF_TURN_TOKEN_ID || CF_TURN_TOKEN_ID==='YOUR_CF_TURN_TOKEN_ID'){
    VH.ICE = fallback; return VH.ICE;
  }
  try{
    var r = await fetch(
      'https://rtc.live.cloudflare.com/v1/turn/keys/'+CF_TURN_TOKEN_ID+'/credentials/generate',
      {
        method:'POST',
        headers:{'Authorization':'Bearer '+CF_TURN_API_TOKEN,'Content-Type':'application/json'},
        body:JSON.stringify({ttl:86400})
      }
    );
    if(!r.ok) throw new Error('CF TURN '+r.status);
    var data = await r.json();
    VH.ICE = {
      iceServers:[
        {urls:'stun:stun.l.google.com:19302'},
        {urls:'stun:stun1.l.google.com:19302'},
        {
          urls: data.iceServers.urls,
          username: data.iceServers.username,
          credential: data.iceServers.credential
        }
      ]
    };
  }catch(e){
    console.warn('VH: Cloudflare TURN fetch failed, using STUN only:', e.message);
    VH.ICE = fallback;
  }
  return VH.ICE;
}

// ── Audio beeps ──
function vhBeep(type){
  try{
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    if(type==='call'){ o.frequency.value=880; g.gain.setValueAtTime(.3,ctx.currentTime); o.start(); o.stop(ctx.currentTime+.18); }
    else if(type==='end'){ o.frequency.value=440; g.gain.setValueAtTime(.2,ctx.currentTime); o.start(); o.stop(ctx.currentTime+.25); }
    else if(type==='ptt'){ o.frequency.value=1200; g.gain.setValueAtTime(.15,ctx.currentTime); o.start(); o.stop(ctx.currentTime+.08); }
    else if(type==='incoming'){ 
      o.frequency.value=660; g.gain.setValueAtTime(.3,ctx.currentTime);
      o.start(); o.stop(ctx.currentTime+.12);
      setTimeout(function(){
        try{var c2=new (window.AudioContext||window.webkitAudioContext)();var o2=c2.createOscillator();var g2=c2.createGain();o2.connect(g2);g2.connect(c2.destination);o2.frequency.value=880;g2.gain.setValueAtTime(.3,c2.currentTime);o2.start();o2.stop(c2.currentTime+.12);}catch(e){}
      },200);
    }
  }catch(e){}
}

// ── Supabase signal helpers ──
async function vhSendSignal(toId, toRoom, type, payload){
  if(!currentUser) return;
  try{
    await sbInsert('voice_signals',{
      from_id: currentUser.id,
      from_name: currentUser.name,
      to_id: toId||null,
      to_room: toRoom||null,
      type: type,
      payload: JSON.stringify(payload||{}),
      created_at: new Date().toISOString()
    });
  }catch(e){ console.warn('VH signal send failed',e); }
}

var _vhProcessedSignals = new Set();
var _vhTableExists = null; // null=unknown, true/false

async function vhPollSignals(){
  if(!currentUser) return;
  if(_vhTableExists === false) return; // table confirmed missing, stop polling
  try{
    var since = new Date(Date.now()-9000).toISOString();
    // PostgREST OR filter: to_id matches me OR to_room matches current room
    var roomFilter = VH.currentRoom ? ',to_room.eq.'+VH.currentRoom : '';
    var rows = await sbQuery('voice_signals',
      'created_at=gt.'+encodeURIComponent(since)+
      '&or=(to_id.eq.'+currentUser.id+roomFilter+')'+
      '&order=created_at.asc&limit=40&select=id,from_id,from_name,to_id,to_room,type,payload,created_at'
    );
    _vhTableExists = true;
    if(!rows||!rows.length) return;
    for(var i=0;i<rows.length;i++){
      var sig = rows[i];
      if(sig.from_id === currentUser.id) continue; // skip own
      if(_vhProcessedSignals.has(sig.id)) continue; // dedupe
      _vhProcessedSignals.add(sig.id);
      // Keep set small
      if(_vhProcessedSignals.size > 200) _vhProcessedSignals.clear();
      await vhHandleSignal(sig);
    }
  }catch(e){
    // If table doesn't exist (404/400), mark and stop spamming
    if(e.message && (e.message.includes('does not exist') || e.message.includes('relation') || e.message.includes('404'))){
      _vhTableExists = false;
      console.warn('Voice Hub: voice_signals table missing. Run the SQL setup.');
    }
  }
}

async function vhHandleSignal(sig){
  var payload = {};
  try{ payload = JSON.parse(sig.payload||'{}'); }catch(e){}
  var from = sig.from_id;
  var fromName = sig.from_name;

  switch(sig.type){
    case 'call_invite':
      // Incoming 1-to-1 call
      if(VH.currentCall.peerId || VH.currentRoom) return; // busy
      vhShowIncomingCall(from, fromName);
      break;
    case 'call_accept':
      if(VH.currentCall.peerId === from) vhOnCallAccepted(from);
      break;
    case 'call_reject':
      if(VH.currentCall.peerId === from) vhOnCallRejected();
      break;
    case 'call_end':
      if(VH.currentCall.peerId === from) vhCleanupCall(true);
      break;
    case 'offer':
      if(VH.currentCall.peerId === from || (sig.to_room && sig.to_room === VH.currentRoom))
        await vhHandleOffer(from, fromName, payload, !!sig.to_room);
      break;
    case 'answer':
      if(VH.currentCall.peerId === from || (sig.to_room && sig.to_room === VH.currentRoom))
        await vhHandleAnswer(from, payload);
      break;
    case 'ice':
      await vhHandleICE(from, payload);
      break;
    case 'room_join':
      if(VH.currentRoom && sig.to_room === VH.currentRoom) vhRenderRoomWidget();
      break;
    case 'room_leave':
      if(VH.currentRoom && sig.to_room === VH.currentRoom){
        // close peer
        if(VH.peers[from]){ VH.peers[from].close(); delete VH.peers[from]; }
        vhRenderRoomWidget();
      }
      break;

  }
}

// ── Get mic ──
async function vhGetMic(){
  if(VH.localStream) return VH.localStream;
  try{
    VH.localStream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    return VH.localStream;
  }catch(e){
    alert('Microphone access denied. Please allow mic access for Voice Hub.');
    return null;
  }
}

// ── Page: load & tab switch ──
function vhSwitchTab(tab){
  document.getElementById('vh-panel-wt').style.display = tab==='wt'?'block':'none';
  document.getElementById('vh-panel-rooms').style.display = tab==='rooms'?'block':'none';
  document.getElementById('vh-tab-wt').classList.toggle('active', tab==='wt');
  document.getElementById('vh-tab-rooms').classList.toggle('active', tab==='rooms');
  if(tab==='wt') vhLoadAgents();
  if(tab==='rooms') vhLoadRooms();
}

async function vhPageInit(){
  // Load my WT status — silently handle missing table
  try{
    var rows = await sbQuery('voice_wt_status','user_id=eq.'+currentUser.id+'&select=wt_on');
    var on = rows && rows.length && rows[0].wt_on;
    VH.wtEnabled = !!on;
  }catch(e){ VH.wtEnabled = false; }
  var tog = document.getElementById('vh-my-wt-toggle');
  var lbl = document.getElementById('vh-my-wt-label');
  if(tog) tog.checked = VH.wtEnabled;
  if(lbl) lbl.textContent = VH.wtEnabled ? 'ON' : 'OFF';
  vhLoadAgents();
  vhStartSignalPoll();
  // Check if tables exist — show setup warning if not
  setTimeout(async function(){
    var warn = document.getElementById('vh-setup-warn');
    if(!warn) return;
    try{
      await sbQuery('voice_signals','limit=1&select=id');
      warn.style.display='none'; // tables exist
    }catch(e){
      warn.style.display='block'; // show SQL instructions
    }
  }, 1500);
}

async function vhToggleMyWT(on){
  VH.wtEnabled = on;
  var lbl = document.getElementById('vh-my-wt-label');
  if(lbl) lbl.textContent = on ? 'ON' : 'OFF';
  try{
    var ex = await sbQuery('voice_wt_status','user_id=eq.'+currentUser.id+'&select=user_id');
    if(ex && ex.length){
      await sbUpdate('voice_wt_status','user_id',currentUser.id,{wt_on:on,updated_at:new Date().toISOString()});
    } else {
      await sbInsert('voice_wt_status',{user_id:currentUser.id,user_name:currentUser.name,wt_on:on,updated_at:new Date().toISOString()});
    }
  }catch(e){ console.warn('VH WT toggle save failed',e); }
  vhLoadAgents();
}

async function vhLoadAgents(){
  var list = document.getElementById('vh-agents-list');
  if(!list) return;
  list.innerHTML = '<div style="color:var(--text-dim);font-size:.82rem;padding:.5rem 0;">Loading…</div>';
  try{
    // Always load from users table — works even if voice_wt_status doesn't exist yet
    var users = await sbQuery('users','role=neq.syslevel&select=id,name,role&order=name.asc');
    users = (users||[]).filter(function(u){ return u.id !== currentUser.id; });

    // Try to get WT status — silently ignore if table missing
    var wtMap = {};
    try{
      var wtRows = await sbQuery('voice_wt_status','select=user_id,wt_on');
      (wtRows||[]).forEach(function(r){ wtMap[r.user_id] = !!r.wt_on; });
    }catch(e){ /* table may not exist yet — all default to OFF */ }

    if(!users.length){
      list.innerHTML = '<div style="color:var(--text-dim);font-size:.82rem;padding:.5rem 0;">No other agents found.</div>';
      return;
    }

    list.innerHTML = users.map(function(u){
      var ini = (u.name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
      var wtOn = !!wtMap[u.id];
      var isBusy = VH.currentCall.peerId && VH.currentCall.peerId !== u.id;
      var wtBadge = wtOn
        ? '<span style="font-size:.7rem;background:rgba(46,197,111,.12);color:#2ec56f;padding:2px 8px;border-radius:20px;margin-right:.4rem;">WT ON</span>'
        : '<span style="font-size:.7rem;background:var(--navy-hover);color:var(--text-dim);padding:2px 8px;border-radius:20px;margin-right:.4rem;border:1px solid var(--navy-border);">WT OFF</span>';
      var callBtn = wtOn
        ? (isBusy
            ? '<span style="font-size:.75rem;color:var(--text-dim);">Busy</span>'
            : '<button class="vh-call-btn" data-id="'+u.id+'" data-name="'+esc(u.name)+'" style="padding:.35rem .9rem;background:var(--gold);color:#fff;border:none;border-radius:6px;font-family:DM Sans,sans-serif;font-size:.76rem;font-weight:700;cursor:pointer;">📞 Call</button>')
        : '<span style="font-size:.75rem;color:var(--text-dim);">Unavailable</span>';
      return '<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:var(--radius-sm);opacity:'+(wtOn?'1':'.6')+';">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:#4c76a8;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:#fff;flex-shrink:0;">'+ini+'</div>'+
        '<div style="flex:1;font-size:.84rem;font-weight:600;color:var(--text-primary);">'+esc(u.name)+'</div>'+
        wtBadge+
        callBtn+
      '</div>';
    }).join('');
  }catch(e){
    console.error('vhLoadAgents error:', e);
    list.innerHTML = '<div style="color:var(--text-dim);font-size:.82rem;">Could not load agents: '+esc(e.message)+'</div>';
  }
}

// ── 1-to-1 Call Flow ──
async function vhCallAgent(peerId, peerName){
  if(VH.currentCall.peerId){ alert('Already in a call.'); return; }
  VH.currentCall.peerId = peerId;
  VH.currentCall.peerName = peerName;
  VH.currentCall.isInitiator = true;
  vhBeep('call');
  await vhSendSignal(peerId, null, 'call_invite', {});
  // Show active call widget in "calling" state
  var w = document.getElementById('vh-active-call');
  var nameEl = document.getElementById('vh-call-with-name');
  if(nameEl) nameEl.textContent = 'Calling ' + peerName + '…';
  if(w) w.style.display = 'block';

}

function vhShowIncomingCall(fromId, fromName){
  vhBeep('incoming');
  VH.currentCall.peerId = fromId;
  VH.currentCall.peerName = fromName;
  VH.currentCall.isInitiator = false;
  var overlay = document.getElementById('vh-call-overlay');
  var callerEl = document.getElementById('vh-caller-name');
  if(callerEl) callerEl.textContent = fromName;
  if(overlay){ overlay.style.display = 'flex'; }
}

async function vhAcceptCall(){
  var overlay = document.getElementById('vh-call-overlay');
  if(overlay) overlay.style.display = 'none';
  var peerId = VH.currentCall.peerId;
  var peerName = VH.currentCall.peerName;
  await vhSendSignal(peerId, null, 'call_accept', {});
  await vhStartWebRTC(peerId, false);
  vhShowActiveCall(peerName);
  vhBeep('call');
}

async function vhRejectCall(){
  var overlay = document.getElementById('vh-call-overlay');
  if(overlay) overlay.style.display = 'none';
  await vhSendSignal(VH.currentCall.peerId, null, 'call_reject', {});
  VH.currentCall.peerId = null;
  VH.currentCall.peerName = null;
}

async function vhOnCallAccepted(peerId){
  await vhStartWebRTC(peerId, true);
  vhShowActiveCall(VH.currentCall.peerName);
}

function vhOnCallRejected(){
  var w = document.getElementById('vh-active-call');
  if(w) w.style.display = 'none';
  VH.currentCall.peerId = null;
  VH.currentCall.peerName = null;
  vhBeep('end');
  alert('Call was declined.');
}

function vhShowActiveCall(peerName){
  var w = document.getElementById('vh-active-call');
  var nameEl = document.getElementById('vh-call-with-name');
  var timerEl = document.getElementById('vh-call-timer');
  if(nameEl) nameEl.textContent = peerName;
  if(w) w.style.display = 'block';
  _vhMuted = false;
  if(VH.localStream) VH.localStream.getAudioTracks().forEach(function(t){ t.enabled=true; });
  var muteBtn = document.getElementById('vh-mute-btn');
  if(muteBtn){ muteBtn.style.background='rgba(46,197,111,.15)'; muteBtn.style.borderColor='rgba(46,197,111,.4)'; muteBtn.style.color='#2ec56f'; muteBtn.textContent='🎙 Mic On — Click to Mute'; }
  VH.currentCall.startTime = Date.now();
  VH.currentCall.timerInterval = setInterval(function(){
    if(!timerEl) return;
    var s = Math.floor((Date.now()-VH.currentCall.startTime)/1000);
    timerEl.textContent = Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;
  }, 1000);
}

async function vhEndCall(){
  if(VH.currentCall.peerId){
    await vhSendSignal(VH.currentCall.peerId, null, 'call_end', {});
  }
  vhCleanupCall(false);
}

function vhCleanupCall(remote){
  if(!remote) vhBeep('end');
  else vhBeep('end');
  clearInterval(VH.currentCall.timerInterval);
  // Close peer connection
  var pc = VH.peers[VH.currentCall.peerId];
  if(pc){ pc.close(); delete VH.peers[VH.currentCall.peerId]; }
  // Stop local stream tracks used for call
  if(VH.localStream && !VH.currentRoom){
    VH.localStream.getTracks().forEach(function(t){ t.stop(); });
    VH.localStream = null;
  }
  VH.currentCall = {peerId:null,peerName:null,isInitiator:false,timerInterval:null,startTime:null};
  var w = document.getElementById('vh-active-call');
  if(w) w.style.display = 'none';
  var overlay = document.getElementById('vh-call-overlay');
  if(overlay) overlay.style.display = 'none';
}

// ── Mute toggle (full duplex) ──
var _vhMuted = false;
function vhToggleMute(){
  _vhMuted = !_vhMuted;
  if(VH.localStream) VH.localStream.getAudioTracks().forEach(function(t){ t.enabled=!_vhMuted; });
  var btn = document.getElementById('vh-mute-btn');
  if(_vhMuted){
    if(btn){ btn.style.background='rgba(239,73,60,.15)'; btn.style.borderColor='rgba(239,73,60,.4)'; btn.style.color='#ef493c'; btn.textContent='🔇 Muted — Click to Unmute'; }
  } else {
    if(btn){ btn.style.background='rgba(46,197,111,.15)'; btn.style.borderColor='rgba(46,197,111,.4)'; btn.style.color='#2ec56f'; btn.textContent='🎙 Mic On — Click to Mute'; }
  }
}

// ── WebRTC peer connection ──
async function vhStartWebRTC(peerId, isInitiator){
  var stream = await vhGetMic();
  if(!stream) return;
  var iceConfig = await vhGetIceConfig();
  var pc = new RTCPeerConnection(iceConfig);
  VH.peers[peerId] = pc;

  stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });

  pc.ontrack = function(e){
    var audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };

  pc.onicecandidate = function(e){
    if(e.candidate){
      vhSendSignal(peerId, null, 'ice', {candidate: e.candidate});
    }
  };

  if(isInitiator){
    var offer = await pc.createOffer({offerToReceiveAudio:true});
    await pc.setLocalDescription(offer);
    await vhSendSignal(peerId, null, 'offer', {sdp: pc.localDescription});
  }
}

async function vhHandleOffer(fromId, fromName, payload, isRoom){
  var toId = isRoom ? null : fromId;
  var toRoom = isRoom ? VH.currentRoom : null;

  var pc = VH.peers[fromId];
  if(!pc){
    var stream = await vhGetMic();
    if(!stream) return;
    stream.getAudioTracks().forEach(function(t){ t.enabled = isRoom ? !VH.roomMuted : false; });
    var iceConfig2 = await vhGetIceConfig();
    pc = new RTCPeerConnection(iceConfig2);
    VH.peers[fromId] = pc;
    stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
    pc.ontrack = function(e){
      var audio = new Audio();
      audio.srcObject = e.streams[0];
      audio.autoplay = true;
      document.body.appendChild(audio);
      if(isRoom) vhMarkSpeaking(fromId, fromName, e.streams[0]);
    };
    pc.onicecandidate = function(e){
      if(e.candidate) vhSendSignal(toId, toRoom, 'ice', {candidate: e.candidate, for: fromId});
    };
  }
  await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  var answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await vhSendSignal(toId, toRoom, 'answer', {sdp: pc.localDescription, for: fromId});
}

async function vhHandleAnswer(fromId, payload){
  var pc = VH.peers[fromId];
  if(pc && pc.signalingState !== 'stable'){
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  }
}

async function vhHandleICE(fromId, payload){
  var pc = VH.peers[payload.for||fromId] || VH.peers[fromId];
  if(pc && payload.candidate){
    try{ await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }catch(e){}
  }
}

// ── Group Rooms ──
async function vhLoadRooms(){
  var list = document.getElementById('vh-rooms-list');
  if(!list) return;
  try{
    var rows = await sbQuery('voice_rooms','select=id,name,created_by,members&order=created_at.desc&limit=20');
    if(!rows||!rows.length){
      list.innerHTML = '<div style="color:var(--text-dim);font-size:.82rem;padding:.5rem 0;">No active rooms. Create one above.</div>';
      return;
    }
    list.innerHTML = rows.map(function(r){
      var members = [];
      try{ members = JSON.parse(r.members||'[]'); }catch(e){}
      var inRoom = VH.currentRoom === r.id;
      return '<div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:var(--radius-sm);">'+
        '<div style="flex:1;">'+
          '<div style="font-size:.84rem;font-weight:700;color:var(--text-primary);">'+esc(r.name)+'</div>'+
          '<div style="font-size:.72rem;color:var(--text-dim);margin-top:2px;">'+members.length+' member'+(members.length!==1?'s':'')+' · by '+esc(r.created_by)+'</div>'+
        '</div>'+
        (inRoom
          ? '<span style="font-size:.72rem;color:#2ec56f;font-weight:700;">● You\'re In</span>'
          : (VH.currentCall.peerId || VH.currentRoom
              ? '<span style="font-size:.75rem;color:var(--text-dim);">Busy</span>'
              : '<button class="vh-join-btn" data-id="'+r.id+'" data-name="'+esc(r.name)+'" style="padding:.35rem .9rem;background:var(--gold);color:#fff;border:none;border-radius:6px;font-family:DM Sans,sans-serif;font-size:.76rem;font-weight:700;cursor:pointer;">Join</button>'))+
        (isAdminUser()||r.created_by===currentUser.name ? '<button class="vh-del-room-btn" data-id="'+r.id+'" style="margin-left:.4rem;padding:.3rem .7rem;background:rgba(239,73,60,.1);color:#ef493c;border:1px solid rgba(239,73,60,.25);border-radius:6px;font-size:.72rem;cursor:pointer;">🗑</button>' : '')+
      '</div>';
    }).join('');
  }catch(e){ list.innerHTML='<div style="color:var(--text-dim);font-size:.82rem;">Could not load rooms.</div>'; }
}

async function vhCreateRoom(){
  var inp = document.getElementById('vh-room-name-input');
  var name = (inp&&inp.value||'').trim();
  if(!name){ alert('Please enter a room name.'); return; }
  try{
    var row = await sbInsert('voice_rooms',{
      name: name,
      created_by: currentUser.name,
      members: JSON.stringify([{id:currentUser.id,name:currentUser.name}]),
      created_at: new Date().toISOString()
    });
    if(inp) inp.value='';
    vhLoadRooms();
    // Auto-join
    if(row&&row.length) vhJoinRoom(row[0].id, name);
  }catch(e){ alert('Could not create room: '+e.message); }
}

async function vhJoinRoom(roomId, roomName){
  if(VH.currentCall.peerId){ alert('End your current call first.'); return; }
  if(VH.currentRoom) await vhLeaveRoom();
  VH.currentRoom = roomId;
  VH.roomMuted = true;
  // Get mic
  var stream = await vhGetMic();
  if(!stream){ VH.currentRoom=null; return; }
  stream.getAudioTracks().forEach(function(t){ t.enabled=false; });
  // Update members in DB
  try{
    var rows = await sbQuery('voice_rooms','id=eq.'+roomId+'&select=members');
    var members = [];
    if(rows&&rows.length) try{ members=JSON.parse(rows[0].members||'[]'); }catch(e){}
    if(!members.find(function(m){return m.id===currentUser.id;})){
      members.push({id:currentUser.id,name:currentUser.name});
      await sbUpdate('voice_rooms','id',roomId,{members:JSON.stringify(members)});
    }
  }catch(e){}
  // Signal others in room
  await vhSendSignal(null, roomId, 'room_join', {name:currentUser.name});
  // Show widget
  vhRenderRoomWidget(roomName);
  vhBeep('call');
  // Connect to existing members
  try{
    var rows2 = await sbQuery('voice_rooms','id=eq.'+roomId+'&select=members');
    var members2 = [];
    if(rows2&&rows2.length) try{ members2=JSON.parse(rows2[0].members||'[]'); }catch(e){}
    for(var i=0;i<members2.length;i++){
      var m = members2[i];
      if(m.id===currentUser.id) continue;
      await vhStartRoomWebRTC(m.id, roomId);
    }
  }catch(e){}
  vhLoadRooms();
  // Start room poll
  VH.roomPollInterval = setInterval(vhLoadRooms, 5000);
}

async function vhStartRoomWebRTC(peerId, roomId){
  var stream = VH.localStream;
  if(!stream) return;
  var iceConfig3 = await vhGetIceConfig();
  var pc = new RTCPeerConnection(iceConfig3);
  VH.peers[peerId] = pc;
  stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
  pc.ontrack = function(e){
    var audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
  };
  pc.onicecandidate = function(e){
    if(e.candidate) vhSendSignal(null, roomId, 'ice', {candidate:e.candidate, for:peerId});
  };
  var offer = await pc.createOffer({offerToReceiveAudio:true});
  await pc.setLocalDescription(offer);
  await vhSendSignal(null, roomId, 'offer', {sdp:pc.localDescription, for:peerId});
}

async function vhLeaveRoom(){
  if(!VH.currentRoom) return;
  clearInterval(VH.roomPollInterval);
  await vhSendSignal(null, VH.currentRoom, 'room_leave', {});
  // Update members in DB
  try{
    var rows = await sbQuery('voice_rooms','id=eq.'+VH.currentRoom+'&select=members');
    var members = [];
    if(rows&&rows.length) try{ members=JSON.parse(rows[0].members||'[]'); }catch(e){}
    members = members.filter(function(m){ return m.id!==currentUser.id; });
    await sbUpdate('voice_rooms','id',VH.currentRoom,{members:JSON.stringify(members)});
  }catch(e){}
  // Close all peer connections
  Object.keys(VH.peers).forEach(function(pid){
    if(VH.peers[pid]){ VH.peers[pid].close(); delete VH.peers[pid]; }
  });
  if(VH.localStream && !VH.currentCall.peerId){
    VH.localStream.getTracks().forEach(function(t){ t.stop(); });
    VH.localStream = null;
  }
  VH.currentRoom = null;
  VH.roomMuted = true;
  document.getElementById('vh-room-widget').style.display = 'none';
  vhBeep('end');
  vhLoadRooms();
}

async function vhDeleteRoom(roomId){
  if(!confirm('Delete this room?')) return;
  try{
    await fetch(SUPABASE_URL+'/rest/v1/voice_rooms?id=eq.'+roomId,{method:'DELETE',headers:sbHeaders()});
    if(VH.currentRoom===roomId) await vhLeaveRoom();
    vhLoadRooms();
  }catch(e){ alert('Error: '+e.message); }
}

function vhRenderRoomWidget(roomName){
  var w = document.getElementById('vh-room-widget');
  var nameEl = document.getElementById('vh-room-widget-name');
  var membersEl = document.getElementById('vh-room-widget-members');
  if(roomName && nameEl) nameEl.textContent = roomName;
  if(w) w.style.display = 'block';
  // Refresh member count from DB
  if(VH.currentRoom){
    sbQuery('voice_rooms','id=eq.'+VH.currentRoom+'&select=members').then(function(rows){
      var members = [];
      if(rows&&rows.length) try{ members=JSON.parse(rows[0].members||'[]'); }catch(e){}
      if(membersEl) membersEl.textContent = members.length+' member'+(members.length!==1?'s':'');
    }).catch(function(){});
  }
}

function vhRoomToggleMute(){
  VH.roomMuted = !VH.roomMuted;
  if(VH.localStream) VH.localStream.getAudioTracks().forEach(function(t){ t.enabled=!VH.roomMuted; });
  var btn = document.getElementById('vh-room-mute-btn');
  if(VH.roomMuted){
    if(btn){ btn.style.background='rgba(76,118,168,.15)'; btn.style.borderColor='var(--navy-border)'; btn.style.color='var(--text-muted)'; btn.textContent='🎙 Muted — Click to Speak'; }
  } else {
    if(btn){ btn.style.background='rgba(239,73,60,.2)'; btn.style.borderColor='#ef493c'; btn.style.color='#ef493c'; btn.textContent='🔴 Speaking — Click to Mute'; }
  }
}

function vhMarkSpeaking(userId, userName, stream){
  // Simple speaking detection via AudioContext analyser
  try{
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    var src = ctx.createMediaStreamSource(stream);
    var analyser = ctx.createAnalyser();
    src.connect(analyser);
    var data = new Uint8Array(analyser.fftSize);
    VH.speakingIntervals[userId] = setInterval(function(){
      analyser.getByteTimeDomainData(data);
      var vol = data.reduce(function(s,v){return s+Math.abs(v-128);},0)/data.length;
      var spkEl = document.getElementById('vh-spk-'+userId);
      if(spkEl) spkEl.style.background = vol>5 ? '#ef493c' : '#4c76a8';
    },200);
    // Add speaker pill
    var speakers = document.getElementById('vh-room-speakers');
    if(speakers && !document.getElementById('vh-spk-'+userId)){
      var pill = document.createElement('div');
      pill.id = 'vh-spk-'+userId;
      pill.title = userName;
      var ini = (userName||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
      pill.style.cssText='width:28px;height:28px;border-radius:50%;background:#4c76a8;display:flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:700;color:#fff;transition:background .2s;';
      pill.textContent=ini;
      speakers.appendChild(pill);
    }
  }catch(e){}
}

// ── Signal polling ──
function vhStartSignalPoll(){
  if(VH.signalPollInterval) return;
  VH.signalPollInterval = setInterval(vhPollSignals, 2000);
}
function vhStopSignalPoll(){
  clearInterval(VH.signalPollInterval);
  VH.signalPollInterval = null;
}

// ── Control Deck: per-agent WT access ──
async function cdLoadVHAgents(){
  var list = document.getElementById('cd-vh-agents');
  if(!list) return;
  try{
    var users = await sbQuery('users','role=neq.syslevel&select=id,name,role&order=name.asc');
    var wtRows = await sbQuery('voice_wt_status','select=user_id,wt_on');
    var wtMap = {};
    (wtRows||[]).forEach(function(r){ wtMap[r.user_id]=r.wt_on; });
    list.innerHTML = (users||[]).map(function(u){
      var on = !!wtMap[u.id];
      return '<div style="display:flex;align-items:center;gap:.75rem;padding:.55rem .75rem;background:var(--navy-card);border:1px solid var(--navy-border);border-radius:var(--radius-sm);">'+
        '<div style="flex:1;font-size:.82rem;font-weight:600;color:var(--text-primary);">'+esc(u.name)+'<span style="font-size:.7rem;color:var(--text-dim);margin-left:.4rem;">('+u.role+')</span></div>'+
        '<label class="cat-toggle-wrap"><input type="checkbox" class="vh-agent-tog" data-uid="'+u.id+'" data-uname="'+esc(u.name)+'" '+(on?'checked':'')+'/><span class="cat-toggle-slider"></span></label>'+
      '</div>';
    }).join('');
    var statusEl = document.getElementById('cd-vh-status');
    var onCount = Object.values(wtMap).filter(Boolean).length;
    if(statusEl) statusEl.textContent = onCount+' agent'+(onCount!==1?'s':'')+' active';
    var countEl = document.getElementById('cd-vh-agents-count');
    if(countEl) countEl.textContent = (users||[]).length+' agent'+((users||[]).length!==1?'s':'');
  }catch(e){ list.innerHTML='<div style="color:var(--text-dim);font-size:.8rem;">Could not load.</div>'; }
}

async function cdVHAgentToggle(userId, userName, on){
  try{
    var ex = await sbQuery('voice_wt_status','user_id=eq.'+userId+'&select=user_id');
    if(ex&&ex.length){
      await sbUpdate('voice_wt_status','user_id',userId,{wt_on:on,updated_at:new Date().toISOString()});
    } else {
      await sbInsert('voice_wt_status',{user_id:userId,user_name:userName,wt_on:on,updated_at:new Date().toISOString()});
    }
    cdLoadVHAgents();
  }catch(e){ alert('Error: '+e.message); }
}

// ── Hook into page show ──
var _origShowPage = typeof showPage === 'function' ? showPage : null;


// ════════════════════════════════════════════════════════
//  ABOUT PAGE — Editable What's New & Coming Soon
// ════════════════════════════════════════════════════════
var ABOUT_WN_KEY = 'about_whats_new';
var ABOUT_CS_KEY = 'about_coming_soon';

var ABOUT_WN_DEFAULT = [
  '🐱 Orange Cat AI Assistant — built for & by K7 Support team',
  'Roster, attendance, quiz & cases — all readable by Cat',
  'Send DMs & broadcasts via Cat',
  'Reminders — Apple-style task manager',
  'Roster multi-month & Case Tracker improvements'
];
var ABOUT_CS_DEFAULT = [
  'AI-based improvements to Orange Cat',
  'Live Dynamics 365 CRM integration',
  'Advanced reporting with export',
  'Vision Helpdesk live ticket sync',
  'VICIdial real-time agent status'
];

async function aboutLoadItems(){
  await aboutRenderList('whats_new');
  await aboutRenderList('coming_soon');
  // Show + Add and edit buttons only for admin
  if(isAdminUser()){
    var wnBtn = document.getElementById('about-wn-add-btn');
    var csBtn = document.getElementById('about-cs-add-btn');
    if(wnBtn) wnBtn.style.display='block';
    if(csBtn) csBtn.style.display='block';
  }
}

async function aboutGetItems(type){
  var key = type==='whats_new' ? ABOUT_WN_KEY : ABOUT_CS_KEY;
  var def = type==='whats_new' ? ABOUT_WN_DEFAULT : ABOUT_CS_DEFAULT;
  try{
    var rows = await sbQuery('settings','key=eq.'+key+'&select=value');
    if(rows&&rows.length){
      var parsed = JSON.parse(rows[0].value);
      return Array.isArray(parsed) ? parsed : def;
    }
  }catch(e){}
  return def;
}

async function aboutSaveItems(type, items){
  var key = type==='whats_new' ? ABOUT_WN_KEY : ABOUT_CS_KEY;
  try{
    var ex = await sbQuery('settings','key=eq.'+key+'&select=key');
    if(ex&&ex.length){ await sbUpdate('settings','key',key,{value:JSON.stringify(items)}); }
    else { await sbInsert('settings',{key:key,value:JSON.stringify(items)}); }
  }catch(e){ alert('Save failed: '+e.message); }
}

async function aboutRenderList(type){
  var listId = type==='whats_new' ? 'about-wn-list' : 'about-cs-list';
  var dotColor = type==='whats_new' ? '#1a7a45' : 'var(--accent-blue)';
  var list = document.getElementById(listId);
  if(!list) return;
  var items = await aboutGetItems(type);
  var isAdmin = isAdminUser();
  list.innerHTML = items.map(function(item, idx){
    return '<div class="about-update-item" id="about-item-'+type+'-'+idx+'" style="display:flex;align-items:flex-start;gap:.5rem;justify-content:space-between;">'+
      '<div style="display:flex;align-items:flex-start;gap:.5rem;flex:1;min-width:0;">'+
        '<span class="about-update-dot" style="background:'+dotColor+';margin-top:.45rem;flex-shrink:0;"></span>'+
        '<span id="about-text-'+type+'-'+idx+'" style="flex:1;">'+esc(item)+'</span>'+
      '</div>'+
      (isAdmin ?
        '<div style="display:flex;gap:.3rem;flex-shrink:0;margin-left:.5rem;">'+
          '<button class="about-edit-btn" data-type="'+type+'" data-idx="'+idx+'" title="Edit" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:.8rem;padding:0 2px;opacity:.6;">✏️</button>'+
          '<button class="about-del-btn" data-type="'+type+'" data-idx="'+idx+'" title="Delete" style="background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:.8rem;padding:0 2px;opacity:.6;">🗑</button>'+
        '</div>'
      : '')+
    '</div>';
  }).join('');
}

function aboutEditItem(type, idx){
  var textEl = document.getElementById('about-text-'+type+'-'+idx);
  if(!textEl) return;
  var current = textEl.textContent;
  var rowEl = document.getElementById('about-item-'+type+'-'+idx);
  // Replace the text span with an input
  textEl.style.display='none';
  // Build inline editor
  var editorId = 'about-editor-'+type+'-'+idx;
  if(document.getElementById(editorId)) return; // already editing
  var editor = document.createElement('div');
  editor.id = editorId;
  editor.style.cssText='display:flex;gap:.4rem;flex:1;align-items:center;';
  editor.innerHTML =
    '<input type="text" value="'+current.replace(/"/g,'&quot;')+'" style="flex:1;padding:.3rem .6rem;border:1px solid var(--navy-border);border-radius:6px;background:var(--navy-hover);color:var(--text-primary);font-family:DM Sans,sans-serif;font-size:.8rem;outline:none;" id="about-inp-'+type+'-'+idx+'"/>'+
    '<button class="about-save-btn" data-type="'+type+'" data-idx="'+idx+'" style="padding:.28rem .7rem;background:var(--gold);color:#fff;border:none;border-radius:5px;font-family:DM Sans,sans-serif;font-size:.74rem;font-weight:700;cursor:pointer;">Save</button>'+
    '<button class="about-cancel-btn" data-type="'+type+'" data-idx="'+idx+'" style="padding:.28rem .7rem;background:transparent;border:1px solid var(--navy-border);border-radius:5px;font-family:DM Sans,sans-serif;font-size:.74rem;cursor:pointer;color:var(--text-muted);">✕</button>';
  textEl.parentNode.insertBefore(editor, textEl.nextSibling);
  var inp = document.getElementById('about-inp-'+type+'-'+idx);
  if(inp){ inp.focus(); inp.select();
    inp.addEventListener('keydown',function(e){ if(e.key==='Enter') aboutSaveItem(type,idx); if(e.key==='Escape') aboutCancelEdit(type,idx); });
  }
}

function aboutCancelEdit(type, idx){
  var textEl = document.getElementById('about-text-'+type+'-'+idx);
  var editor = document.getElementById('about-editor-'+type+'-'+idx);
  if(textEl) textEl.style.display='';
  if(editor) editor.remove();
}

async function aboutSaveItem(type, idx){
  var inp = document.getElementById('about-inp-'+type+'-'+idx);
  if(!inp) return;
  var newVal = inp.value.trim();
  if(!newVal){ alert('Cannot save empty item.'); return; }
  var items = await aboutGetItems(type);
  items[idx] = newVal;
  await aboutSaveItems(type, items);
  await aboutRenderList(type);
}

async function aboutDeleteItem(type, idx){
  if(!confirm('Delete this item?')) return;
  var items = await aboutGetItems(type);
  items.splice(idx, 1);
  await aboutSaveItems(type, items);
  await aboutRenderList(type);
}

async function aboutAddItem(type){
  var items = await aboutGetItems(type);
  items.push('New item — click ✏️ to edit');
  await aboutSaveItems(type, items);
  await aboutRenderList(type);
  // Auto-open edit on last item
  setTimeout(function(){ aboutEditItem(type, items.length-1); }, 80);
}

// ════════════════════════════════════════════════════════
//  VOICE HUB — Global ON/OFF toggle (Control Deck)
// ════════════════════════════════════════════════════════
var CD_VH_GLOBAL_KEY = 'vh_global_enabled';

async function cdVHLoadGlobalStatus(){
  try{
    var rows = await sbQuery('settings','key=eq.'+CD_VH_GLOBAL_KEY+'&select=value');
    var on = !rows||!rows.length || rows[0].value !== 'false';
    var tog = document.getElementById('cd-vh-toggle');
    var statusEl = document.getElementById('cd-vh-status');
    if(tog) tog.checked = on;
    if(statusEl) statusEl.textContent = on ? 'Enabled' : 'Disabled';
  }catch(e){}
}

async function cdVHGlobalToggle(on){
  var statusEl = document.getElementById('cd-vh-status');
  var msgEl = document.getElementById('cd-vh-msg');
  if(statusEl) statusEl.textContent = on ? 'Enabled' : 'Disabled';
  if(msgEl){ msgEl.style.display='block'; msgEl.textContent = on ? '✅ Voice Hub enabled for all agents' : '🔇 Voice Hub hidden from all agents'; setTimeout(function(){ msgEl.style.display='none'; },2500); }
  try{
    var val = on ? 'true' : 'false';
    var ex = await sbQuery('settings','key=eq.'+CD_VH_GLOBAL_KEY+'&select=key');
    if(ex&&ex.length){ await sbUpdate('settings','key',CD_VH_GLOBAL_KEY,{value:val}); }
    else { await sbInsert('settings',{key:CD_VH_GLOBAL_KEY,value:val}); }
  }catch(e){ alert('Error: '+e.message); }
}

async function checkVHGlobal(){
  try{
    var rows = await sbQuery('settings','key=eq.'+CD_VH_GLOBAL_KEY+'&select=value');
    var on = !rows||!rows.length || rows[0].value !== 'false';
    var vhItem = document.getElementById('sidebar-voicehub');
    if(vhItem){
      if(!on){
        vhItem.style.display='none';
        // If currently on voicehub page, redirect to home
        var vhPage = document.getElementById('page-voicehub');
        if(vhPage && vhPage.classList.contains('active')){
          showPage('home', document.querySelector('.sidebar-item'));
        }
      } else {
        vhItem.style.display='flex';
      }
    }
  }catch(e){}
}


// ── Event delegation for VH + About dynamic buttons ──
document.addEventListener('click', function(e){
  // Walkie talkie call button
  var callBtn = e.target.closest('.vh-call-btn');
  if(callBtn){ vhCallAgent(callBtn.dataset.id, callBtn.dataset.name); return; }
  // Room join button
  var joinBtn = e.target.closest('.vh-join-btn');
  if(joinBtn){ vhJoinRoom(joinBtn.dataset.id, joinBtn.dataset.name); return; }
  // Room delete button
  var delBtn = e.target.closest('.vh-del-room-btn');
  if(delBtn){ vhDeleteRoom(delBtn.dataset.id); return; }
  // About edit button
  var editBtn = e.target.closest('.about-edit-btn');
  if(editBtn){ aboutEditItem(editBtn.dataset.type, parseInt(editBtn.dataset.idx)); return; }
  // About delete button
  var aDelBtn = e.target.closest('.about-del-btn');
  if(aDelBtn){ aboutDeleteItem(aDelBtn.dataset.type, parseInt(aDelBtn.dataset.idx)); return; }
  // About save button
  var saveBtn = e.target.closest('.about-save-btn');
  if(saveBtn){ aboutSaveItem(saveBtn.dataset.type, parseInt(saveBtn.dataset.idx)); return; }
  // About cancel button
  var cancelBtn = e.target.closest('.about-cancel-btn');
  if(cancelBtn){ aboutCancelEdit(cancelBtn.dataset.type, parseInt(cancelBtn.dataset.idx)); return; }
});

// Event delegation for VH agent toggles in control deck
document.addEventListener('change', function(e){
  if(e.target.classList.contains('vh-agent-tog')){
    cdVHAgentToggle(e.target.dataset.uid, e.target.dataset.uname, e.target.checked);
  }
});

// ════════════════════════════════════════════════════════
//  DOCK CALL — Voice & Video calls inside chat dock
//  Reuses VH signaling (voice_signals table) + TURN config
// ════════════════════════════════════════════════════════
var DC = {
  peerId: null,
  peerName: null,
  peerBg: null,
  isVideo: false,
  isInitiator: false,
  pc: null,           // RTCPeerConnection
  localStream: null,
  micMuted: false,
  camOff: false,
  processedSigs: new Set(),
  pollInterval: null
};

// ── Helpers ──
function dcIni(name){ return (name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase(); }

function dcGetWin(userId){ return document.getElementById('dock-win-'+userId); }

function dcShowCallPanel(userId, html){
  var body = document.getElementById('dock-body-'+userId);
  if(!body) return;
  // Hide messages + input, show call panel
  var msgs = document.getElementById('dock-msgs-'+userId);
  var inp  = document.getElementById('dock-input-'+userId);
  var emojiBtn = body.querySelector('.dock-emoji-btn');
  var sendBtn  = body.querySelector('.dock-send-btn');
  var inputRow = body.querySelector('.dock-input-row');
  if(msgs) msgs.style.display='none';
  if(inputRow) inputRow.style.display='none';
  // Remove old call panel if any
  var old = document.getElementById('dc-panel-'+userId);
  if(old) old.remove();
  var panel = document.createElement('div');
  panel.id = 'dc-panel-'+userId;
  panel.className = 'dock-call-panel';
  panel.innerHTML = html;
  body.appendChild(panel);
  // Expand window if minimised
  var win = dcGetWin(userId);
  if(win){ win.classList.remove('minimised'); win.style.height = DC.isVideo ? '460px' : '320px'; }
}

function dcRestoreChat(userId){
  var body = document.getElementById('dock-body-'+userId);
  if(!body) return;
  var msgs = document.getElementById('dock-msgs-'+userId);
  var inputRow = body.querySelector('.dock-input-row');
  if(msgs) msgs.style.display='flex';
  if(inputRow) inputRow.style.display='flex';
  var panel = document.getElementById('dc-panel-'+userId);
  if(panel) panel.remove();
  var win = dcGetWin(userId);
  if(win) win.style.height='380px';
}

// ── Start call (initiator) ──
async function dcStartCall(peerId, peerName, bg, isVideo){
  if(DC.peerId){ alert('You are already in a call. End it first.'); return; }
  if(VH.currentCall.peerId){ alert('You have an active Voice Hub call. End it first.'); return; }

  DC.peerId = peerId; DC.peerName = peerName; DC.peerBg = bg;
  DC.isVideo = isVideo; DC.isInitiator = true;

  // Show calling state
  dcShowCallingPanel(peerId, peerName, bg, isVideo);

  // Get media
  var stream = await dcGetMedia(isVideo);
  if(!stream){ dcCleanup(peerId); return; }
  DC.localStream = stream;

  // Send invite signal
  await vhSendSignal(peerId, null, isVideo ? 'dc_video_invite' : 'dc_voice_invite', {name:currentUser.name});

  // Start polling for answer
  dcStartPoll();
}

function dcShowCallingPanel(peerId, peerName, bg, isVideo){
  var ini = dcIni(peerName);
  var html =
    '<div class="dock-call-ringing">'+
      '<div class="dock-ring-av" style="background:'+bg+';">'+ini+'</div>'+
      '<div class="dock-ring-label">'+esc(peerName)+'</div>'+
      '<div class="dock-ring-sub">'+(isVideo?'Video':'Voice')+' calling…</div>'+
      '<div class="dock-ring-btns">'+
        '<button class="dock-ring-decline" onclick="dcCancelCall(\''+peerId+'\')" title="Cancel">📵</button>'+
      '</div>'+
    '</div>';
  dcShowCallPanel(peerId, html);
}

// ── Incoming call ──
function dcShowIncomingPanel(fromId, fromName, fromBg, isVideo){
  // Open chat window with this person if not open
  if(!document.getElementById('dock-win-'+fromId)){
    dockOpenChat(fromId, fromName, fromBg||'#4c76a8');
    // Wait a tick for DOM
    setTimeout(function(){ dcShowIncomingPanel(fromId, fromName, fromBg, isVideo); }, 120);
    return;
  }
  var ini = dcIni(fromName);
  var html =
    '<div class="dock-call-ringing">'+
      '<div class="dock-ring-av" style="background:'+(fromBg||'#4c76a8')+';">'+ini+'</div>'+
      '<div class="dock-ring-label">'+esc(fromName)+'</div>'+
      '<div class="dock-ring-sub">'+(isVideo?'Video':'Voice')+' calling…</div>'+
      '<div class="dock-ring-btns">'+
        '<button class="dock-ring-accept" onclick="dcAcceptCall(\''+fromId+'\',\''+esc(fromName)+'\','+(isVideo?'true':'false')+')" title="Accept">📞</button>'+
        '<button class="dock-ring-decline" onclick="dcDeclineCall(\''+fromId+'\')" title="Decline">📵</button>'+
      '</div>'+
    '</div>';
  DC.peerId = fromId; DC.peerName = fromName; DC.peerBg = fromBg; DC.isVideo = isVideo; DC.isInitiator = false;
  dcShowCallPanel(fromId, html);
  vhBeep('incoming');
  // Expand the window
  var win = dcGetWin(fromId);
  if(win){ win.classList.remove('minimised'); win.style.height='320px'; }
}

// ── Accept call ──
async function dcAcceptCall(fromId, fromName, isVideo){
  DC.isVideo = isVideo;
  var stream = await dcGetMedia(isVideo);
  if(!stream){ dcDeclineCall(fromId); return; }
  DC.localStream = stream;
  await vhSendSignal(fromId, null, 'dc_accepted', {name:currentUser.name});
  await dcStartWebRTC(fromId, false, isVideo);
  dcShowActiveCallPanel(fromId, isVideo);
  dcStartPoll();
}

// ── Cancel (initiator) / Decline (receiver) ──
async function dcCancelCall(peerId){
  await vhSendSignal(peerId, null, 'dc_cancelled', {});
  dcCleanup(peerId);
}

async function dcDeclineCall(fromId){
  await vhSendSignal(fromId, null, 'dc_declined', {});
  dcCleanup(fromId);
}

// ── Show active call UI ──
function dcShowActiveCallPanel(peerId, isVideo){
  var muteIcon = '<svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>';
  var camIcon  = '<svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
  var endIcon  = '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.12 1.19 2 2 0 012.12.01h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92z"/></svg>';

  var videoArea = '';
  if(isVideo){
    videoArea =
      '<div class="dock-video-area">'+
        '<div class="dock-video-tile" id="dc-remote-tile-'+peerId+'">'+
          '<div class="dock-tile-av" style="background:'+(DC.peerBg||'#4c76a8')+';">'+dcIni(DC.peerName)+'</div>'+
          '<span class="dock-tile-label">'+esc(DC.peerName)+'</span>'+
        '</div>'+
        '<div class="dock-video-tile" id="dc-local-tile-'+peerId+'">'+
          '<div class="dock-tile-av" style="background:#2ec56f;">'+dcIni(currentUser.name)+'</div>'+
          '<span class="dock-tile-label">You</span>'+
        '</div>'+
      '</div>';
  } else {
    // Voice only — show a simple "in call" banner
    videoArea =
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.6rem;background:var(--navy);padding:1rem;">'+
        '<div style="width:52px;height:52px;border-radius:50%;background:'+(DC.peerBg||'#4c76a8')+';display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700;color:#fff;box-shadow:0 0 0 8px rgba(46,197,111,.12);">'+dcIni(DC.peerName)+'</div>'+
        '<div style="font-size:.82rem;font-weight:700;color:var(--text-primary);">'+esc(DC.peerName)+'</div>'+
        '<div style="font-size:.72rem;color:#2ec56f;" id="dc-call-timer-'+peerId+'">0:00</div>'+
      '</div>';
  }

  var camBtn = isVideo
    ? '<button class="dock-call-ctrl-btn cam-off" id="dc-cam-btn-'+peerId+'" onclick="dcToggleCam(\''+peerId+'\')" title="Camera">'+camIcon+'</button>'
    : '';

  var html =
    '<div class="dock-call-panel">'+
      videoArea+
      '<div class="dock-call-controls">'+
        '<button class="dock-call-ctrl-btn mute-off" id="dc-mute-btn-'+peerId+'" onclick="dcToggleMic(\''+peerId+'\')" title="Mute">'+muteIcon+'</button>'+
        camBtn+
        '<button class="dock-call-ctrl-btn end-btn" onclick="dcEndCall(\''+peerId+'\')" title="End call">'+endIcon+'</button>'+
      '</div>'+
    '</div>';

  dcShowCallPanel(peerId, html);

  // Attach video streams to tiles
  if(isVideo){
    setTimeout(function(){
      var localTile = document.getElementById('dc-local-tile-'+peerId);
      if(localTile && DC.localStream){
        var lv = document.createElement('video');
        lv.srcObject = DC.localStream; lv.autoplay = true; lv.muted = true; lv.playsInline = true;
        lv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:8px;';
        localTile.appendChild(lv);
      }
    }, 100);
  }

  // Start call timer
  var startTime = Date.now();
  if(!isVideo){
    var timerEl = document.getElementById('dc-call-timer-'+peerId);
    DC._timerInterval = setInterval(function(){
      if(!timerEl) return;
      var s = Math.floor((Date.now()-startTime)/1000);
      timerEl.textContent = Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;
    },1000);
  }
}

// ── Mic and Camera toggles ──
function dcToggleMic(peerId){
  DC.micMuted = !DC.micMuted;
  if(DC.localStream) DC.localStream.getAudioTracks().forEach(function(t){ t.enabled=!DC.micMuted; });
  var btn = document.getElementById('dc-mute-btn-'+peerId);
  if(btn){
    btn.className = DC.micMuted ? 'dock-call-ctrl-btn mute-on' : 'dock-call-ctrl-btn mute-off';
    btn.title = DC.micMuted ? 'Unmute' : 'Mute';
  }
}

function dcToggleCam(peerId){
  DC.camOff = !DC.camOff;
  if(DC.localStream) DC.localStream.getVideoTracks().forEach(function(t){ t.enabled=!DC.camOff; });
  var btn = document.getElementById('dc-cam-btn-'+peerId);
  if(btn) btn.className = DC.camOff ? 'dock-call-ctrl-btn cam-on' : 'dock-call-ctrl-btn cam-off';
}

// ── End call ──
async function dcEndCall(peerId){
  await vhSendSignal(peerId, null, 'dc_ended', {});
  dcCleanup(peerId);
  vhBeep('end');
}

function dcCleanup(peerId){
  clearInterval(DC.pollInterval); DC.pollInterval=null;
  clearInterval(DC._timerInterval); DC._timerInterval=null;
  if(DC.pc){ DC.pc.close(); DC.pc=null; }
  if(DC.localStream){ DC.localStream.getTracks().forEach(function(t){t.stop();}); DC.localStream=null; }
  // Remove remote audio/video
  var ra=document.getElementById('dc-remote-audio-'+peerId); if(ra) ra.remove();
  DC.peerId=null; DC.peerName=null; DC.peerBg=null;
  DC.isVideo=false; DC.isInitiator=false; DC.micMuted=false; DC.camOff=false;
  DC.processedSigs.clear();
  dcRestoreChat(peerId);
}

// ── WebRTC ──
async function dcGetMedia(isVideo){
  try{
    return await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true},
      video:isVideo ? {width:{ideal:640},height:{ideal:480},frameRate:{ideal:24}} : false
    });
  }catch(e){
    alert((isVideo?'Camera':'Microphone')+' access denied. Please allow access and try again.');
    return null;
  }
}

async function dcStartWebRTC(peerId, isInitiator, isVideo){
  var stream = DC.localStream;
  if(!stream) return;
  var iceConfig = await vhGetIceConfig();
  var pc = new RTCPeerConnection(iceConfig);
  DC.pc = pc;
  stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });

  pc.ontrack = function(e){
    if(e.track.kind==='audio'){
      var audio = document.createElement('audio');
      audio.id = 'dc-remote-audio-'+peerId;
      audio.srcObject = e.streams[0]; audio.autoplay=true;
      document.body.appendChild(audio);
    }
    if(e.track.kind==='video' && isVideo){
      var remoteTile = document.getElementById('dc-remote-tile-'+peerId);
      if(remoteTile){
        var rv = remoteTile.querySelector('video');
        if(!rv){ rv=document.createElement('video'); rv.autoplay=true; rv.playsInline=true; rv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:8px;'; remoteTile.appendChild(rv); }
        rv.srcObject = e.streams[0];
      }
    }
  };

  pc.onicecandidate = function(e){
    if(e.candidate) vhSendSignal(peerId, null, 'dc_ice', {candidate:e.candidate});
  };

  pc.onconnectionstatechange = function(){
    if(pc.connectionState==='failed'||pc.connectionState==='disconnected'){
      dcCleanup(peerId);
    }
  };

  if(isInitiator){
    var offer = await pc.createOffer({offerToReceiveAudio:true, offerToReceiveVideo:isVideo});
    await pc.setLocalDescription(offer);
    await vhSendSignal(peerId, null, 'dc_offer', {sdp:pc.localDescription});
  }
}

// ── Signal polling ──
function dcStartPoll(){
  if(DC.pollInterval) return;
  DC.pollInterval = setInterval(dcPollSignals, 1500);
}

async function dcPollSignals(){
  if(!currentUser) return;
  try{
    var since = new Date(Date.now()-9000).toISOString();
    var rows = await sbQuery('voice_signals',
      'created_at=gt.'+encodeURIComponent(since)+
      '&to_id=eq.'+currentUser.id+
      '&order=created_at.asc&limit=30&select=id,from_id,from_name,type,payload,created_at'
    );
    if(!rows||!rows.length) return;
    for(var i=0;i<rows.length;i++){
      var sig=rows[i];
      if(sig.from_id===currentUser.id) continue;
      if(DC.processedSigs.has(sig.id)) continue;
      DC.processedSigs.add(sig.id);
      if(DC.processedSigs.size>200) DC.processedSigs.clear();
      await dcHandleSignal(sig);
    }
  }catch(e){}
}

async function dcHandleSignal(sig){
  var payload={};
  try{ payload=JSON.parse(sig.payload||'{}'); }catch(e){}
  var from=sig.from_id; var fromName=sig.from_name;

  // Get bg colour for this person
  var fromUser = (_chatUsers||[]).find(function(u){return u.id===from;});
  var fromBg = fromUser ? (fromUser._bg||'#4c76a8') : '#4c76a8';

  switch(sig.type){
    case 'dc_voice_invite':
      if(DC.peerId) break; // busy
      dcShowIncomingPanel(from, fromName, fromBg, false);
      break;
    case 'dc_video_invite':
      if(DC.peerId) break;
      dcShowIncomingPanel(from, fromName, fromBg, true);
      break;
    case 'dc_accepted':
      if(DC.peerId!==from) break;
      await dcStartWebRTC(from, true, DC.isVideo);
      dcShowActiveCallPanel(from, DC.isVideo);
      break;
    case 'dc_cancelled':
    case 'dc_declined':
      if(DC.peerId===from){ dcCleanup(from); vhBeep('end'); }
      break;
    case 'dc_ended':
      if(DC.peerId===from){ dcCleanup(from); vhBeep('end'); }
      break;
    case 'dc_offer':
      if(DC.pc && DC.peerId===from){
        await DC.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        var answer = await DC.pc.createAnswer();
        await DC.pc.setLocalDescription(answer);
        await vhSendSignal(from, null, 'dc_answer', {sdp:DC.pc.localDescription});
      }
      break;
    case 'dc_answer':
      if(DC.pc && DC.peerId===from && DC.pc.signalingState!=='stable'){
        await DC.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
      break;
    case 'dc_ice':
      if(DC.pc && payload.candidate){
        try{ await DC.pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }catch(e){}
      }
      break;
  }
}

// Hook DC poll into the VH signal poll start so it runs when user logs in
var _dcPollStarted = false;
var _origVhStartSignalPoll = vhStartSignalPoll;
vhStartSignalPoll = function(){
  _origVhStartSignalPoll();
  if(!_dcPollStarted){ _dcPollStarted=true; dcStartPoll(); }
};

async function checkTsGlobal(){
  try{
    var rows = await sbQuery('settings','key=eq.'+CD_TS_GLOBAL_KEY+'&select=value');
    if(!rows||!rows.length) return;
    var globalOn = rows[0].value !== 'false';
    var tsItem = document.getElementById('sidebar-ts');
    if(tsItem){
      if(!globalOn){ tsItem.style.display='none'; }
      else { var canSee=isAdminUser()||(currentUser&&currentUser.timesheetEnabled); tsItem.style.display=canSee?'flex':'none'; }
    }
  }catch(e){}
}

// ════════════════════════════════════════════════════════
//  TEAM MEET — Live huddle room (WebRTC + Supabase)
// ════════════════════════════════════════════════════════
var TM = {
  roomId: null,
  roomCode: null,
  roomName: null,
  muted: true,
  peers: {},
  localStream: null,
  pollInterval: null,
  chatPollInterval: null,
  signalPollInterval: null,
  processedSignals: new Set(),
  ICE: null,
  isCreator: false
};

// ── Get ICE config (reuse VH's cached config) ──
async function tmGetIceConfig(){
  if(TM.ICE) return TM.ICE;
  TM.ICE = await vhGetIceConfig();
  return TM.ICE;
}

// ── Page init ──
async function tmPageInit(){
  // Check if agents are allowed to create rooms
  var canCreate = isAdminUser(); // admin/TL always can
  if(!canCreate){
    try{
      var rows = await sbQuery('settings','key=eq.tm_agent_create_enabled&select=value');
      if(rows&&rows.length) canCreate = rows[0].value === 'true';
    }catch(e){}
  }
  var createWrap = document.getElementById('tm-admin-create-wrap');
  if(createWrap) createWrap.style.display = canCreate ? 'block' : 'none';
  // Show contextual hint for agents who can't create
  var sub = document.getElementById('tm-no-room-sub');
  if(sub && !canCreate) sub.textContent = 'Ask your admin or TL to start a room, or join using a room code below.';
  // Check URL param for auto-join
  var params = new URLSearchParams(window.location.search);
  var joinCode = params.get('huddle');
  if(joinCode){
    var inp = document.getElementById('tm-join-code-input');
    if(inp) inp.value = joinCode;
    await tmJoinByCode();
    return;
  }
  // Load current active room if any
  await tmRefreshRoomState();
}

async function tmRefreshRoomState(){
  try{
    var rows = await sbQuery('huddle_rooms','is_active=eq.true&order=created_at.desc&limit=1&select=id,name,created_by,created_by_name');
    if(!rows||!rows.length){
      tmShowNoRoom();
    } else {
      var r = rows[0];
      // If we're already in this room, stay; else show join prompt
      if(TM.roomId === r.id){
        tmUpdateRoomUI();
      } else if(!TM.roomId){
        // Show join option with room name
        var sub = document.getElementById('tm-no-room-sub');
        if(sub) sub.innerHTML = 'Active room: <strong style="color:var(--gold);">'+esc(r.name)+'</strong> — enter the room code to join, or get the invite link from your admin.';
        document.getElementById('tm-no-room').style.display='block';
        document.getElementById('tm-active-room').style.display='none';
      }
    }
  }catch(e){ console.warn('TM refresh room state failed:', e); }
}

function tmShowNoRoom(){
  document.getElementById('tm-no-room').style.display='block';
  document.getElementById('tm-active-room').style.display='none';
}

function tmShowCreateRoom(){
  document.getElementById('tm-create-panel').style.display='block';
  document.getElementById('tm-no-room').style.display='none';
  var inp = document.getElementById('tm-room-name-inp');
  if(inp){ inp.value=''; inp.focus(); }
}

function tmHideCreateRoom(){
  document.getElementById('tm-create-panel').style.display='none';
  document.getElementById('tm-no-room').style.display='block';
}

// ── Create room ──
async function tmCreateRoom(){
  // Check permission
  var canCreate = isAdminUser();
  if(!canCreate){
    try{
      var prows = await sbQuery('settings','key=eq.tm_agent_create_enabled&select=value');
      if(prows&&prows.length) canCreate = prows[0].value === 'true';
    }catch(e){}
  }
  if(!canCreate){ alert('Only Admin or TL can create a room. Ask your admin to enable this for agents.'); return; }
  var inp = document.getElementById('tm-room-name-inp');
  var name = (inp&&inp.value||'').trim();
  if(!name){ var msg=document.getElementById('tm-create-msg'); if(msg){msg.textContent='Please enter a room name.';msg.style.display='block';} return; }
  try{
    // Check if a room is already active
    var existing = await sbQuery('huddle_rooms','is_active=eq.true&select=id,name&limit=1');
    if(existing&&existing.length){
      if(!confirm('There is already an active room: "'+existing[0].name+'". End it and start a new one?')) return;
      await sbUpdate('huddle_rooms','id',existing[0].id,{is_active:false});
      // Clean up old participants
      await fetch(SUPABASE_URL+'/rest/v1/huddle_participants?room_id=eq.'+existing[0].id,{method:'DELETE',headers:sbHeaders()});
    }
    // Generate room code
    var code = Math.random().toString(36).slice(2,8).toUpperCase();
    var rows = await sbInsert('huddle_rooms',{
      id: code,
      name: name,
      created_by: currentUser.id,
      created_by_name: currentUser.name,
      is_active: true,
      created_at: new Date().toISOString()
    });
    document.getElementById('tm-create-panel').style.display='none';
    TM.isCreator = true;
    await tmJoinRoom(code, name);
  }catch(e){ var msg=document.getElementById('tm-create-msg'); if(msg){msg.textContent='Error: '+e.message;msg.style.display='block';} }
}

// ── Join by code input ──
async function tmJoinByCode(){
  var inp = document.getElementById('tm-join-code-input');
  var code = (inp&&inp.value||'').trim().toUpperCase();
  if(!code){ alert('Please enter a room code.'); return; }
  try{
    var rows = await sbQuery('huddle_rooms','id=eq.'+encodeURIComponent(code)+'&is_active=eq.true&select=id,name');
    if(!rows||!rows.length){ alert('Room not found or no longer active. Check the code and try again.'); return; }
    await tmJoinRoom(rows[0].id, rows[0].name);
  }catch(e){ alert('Could not join: '+e.message); }
}

// ── Join room ──
async function tmJoinRoom(roomId, roomName){
  if(TM.roomId) await tmLeaveRoom();
  TM.roomId = roomId;
  TM.roomCode = roomId;
  TM.roomName = roomName;
  TM.muted = true;

  // Get mic
  var stream = await tmGetMic();
  if(!stream){ TM.roomId=null; return; }
  stream.getAudioTracks().forEach(function(t){ t.enabled=false; });

  // Register participant
  try{
    var ex = await sbQuery('huddle_participants','room_id=eq.'+roomId+'&user_id=eq.'+currentUser.id+'&select=id');
    if(!ex||!ex.length){
      await sbInsert('huddle_participants',{room_id:roomId,user_id:currentUser.id,user_name:currentUser.name,is_muted:true,joined_at:new Date().toISOString()});
    }
  }catch(e){ console.warn('TM participant insert failed:',e); }

  // Signal others
  await tmSendSignal(null, 'tm_join', {name:currentUser.name});

  // Show room UI
  tmShowActiveRoom();

  // Connect to existing participants
  try{
    var parts = await sbQuery('huddle_participants','room_id=eq.'+roomId+'&user_id=neq.'+currentUser.id+'&select=user_id,user_name');
    for(var i=0;i<(parts||[]).length;i++){
      await tmStartPeerConnection(parts[i].user_id, true);
    }
  }catch(e){}

  // Start polls
  TM.signalPollInterval = setInterval(tmPollSignals, 1500);
  TM.pollInterval = setInterval(tmUpdateRoomUI, 4000);
  TM.chatPollInterval = setInterval(tmPollChat, 2000);

  tmUpdateRoomUI();
  tmPollChat();
}

function tmShowActiveRoom(){
  document.getElementById('tm-no-room').style.display='none';
  document.getElementById('tm-create-panel').style.display='none';
  document.getElementById('tm-active-room').style.display='block';
  var nameEl = document.getElementById('tm-room-name-display');
  var codeEl = document.getElementById('tm-room-code-display');
  var endBtn = document.getElementById('tm-end-btn');
  if(nameEl) nameEl.textContent = TM.roomName||'Room';
  if(codeEl) codeEl.textContent = TM.roomCode;
  if(endBtn) endBtn.style.display = isAdminUser() ? 'inline-block' : 'none';
  tmUpdateMuteBtn();
}

async function tmUpdateRoomUI(){
  if(!TM.roomId) return;
  try{
    var parts = await sbQuery('huddle_participants','room_id=eq.'+TM.roomId+'&select=user_id,user_name,is_muted&order=joined_at.asc');
    var metaEl = document.getElementById('tm-room-meta');
    var listEl = document.getElementById('tm-participants-list');
    if(metaEl) metaEl.textContent = (parts||[]).length+' participant'+(parts&&parts.length!==1?'s':'');
    if(listEl){
      listEl.innerHTML = (parts||[]).map(function(p){
        var isMe = p.user_id===currentUser.id;
        var ini = (p.user_name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
        return '<div style="display:flex;align-items:center;gap:.6rem;padding:.45rem .5rem;border-radius:var(--radius-sm);background:'+(isMe?'rgba(239,73,60,.06)':'transparent')+';border:1px solid '+(isMe?'rgba(239,73,60,.15)':'transparent')+';">' +
          '<div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dim),var(--gold));display:flex;align-items:center;justify-content:center;font-size:.58rem;font-weight:700;color:#fff;flex-shrink:0;" id="tm-part-av-'+p.user_id+'">'+ini+'</div>' +
          '<div style="flex:1;font-size:.82rem;font-weight:'+(isMe?'700':'600')+';color:var(--text-primary);">'+esc(p.user_name)+(isMe?' <span style="font-size:.68rem;color:var(--text-dim);">(you)</span>':'')+
          '</div>' +
          '<span style="font-size:.72rem;">'+(p.is_muted?'🔇':'🎙')+'</span>' +
        '</div>';
      }).join('');
    }
  }catch(e){}
}

// ── Mute ──
function tmToggleMute(){
  TM.muted = !TM.muted;
  if(TM.localStream) TM.localStream.getAudioTracks().forEach(function(t){ t.enabled=!TM.muted; });
  // Update in DB
  if(TM.roomId){
    sbUpdate('huddle_participants','user_id',currentUser.id,{is_muted:TM.muted}).catch(function(){});
    tmSendSignal(null,'tm_mute_state',{muted:TM.muted});
  }
  tmUpdateMuteBtn();
}

function tmUpdateMuteBtn(){
  var btn = document.getElementById('tm-mute-btn');
  if(!btn) return;
  if(TM.muted){
    btn.style.background='rgba(76,118,168,.15)'; btn.style.borderColor='var(--navy-border)'; btn.style.color='var(--text-muted)'; btn.textContent='🔇 Muted';
  } else {
    btn.style.background='rgba(239,73,60,.2)'; btn.style.borderColor='#ef493c'; btn.style.color='#ef493c'; btn.textContent='🔴 Live — Click to Mute';
  }
}

// ── Chat ──
var _tmLastChatTs = null;
async function tmSendChat(){
  var inp = document.getElementById('tm-chat-input');
  var text = (inp&&inp.value||'').trim();
  if(!text||!TM.roomId) return;
  inp.value='';
  try{
    await sbInsert('huddle_messages',{room_id:TM.roomId,user_id:currentUser.id,user_name:currentUser.name,content:text,created_at:new Date().toISOString()});
  }catch(e){ console.warn('TM chat send failed:',e); }
}

async function tmPollChat(){
  if(!TM.roomId) return;
  try{
    var filters='room_id=eq.'+TM.roomId+'&order=created_at.asc&select=id,user_id,user_name,content,created_at';
    if(_tmLastChatTs) filters+='&created_at=gt.'+encodeURIComponent(_tmLastChatTs);
    var msgs = await sbQuery('huddle_messages', filters);
    if(!msgs||!msgs.length) return;
    var container = document.getElementById('tm-chat-msgs');
    if(!container) return;
    // Clear placeholder on first message
    if(!_tmLastChatTs) container.innerHTML='';
    msgs.forEach(function(m){
      var isMe = m.user_id===currentUser.id;
      var time = m.created_at ? new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
      var div = document.createElement('div');
      div.style.cssText='display:flex;flex-direction:column;align-items:'+(isMe?'flex-end':'flex-start')+';gap:2px;';
      div.innerHTML='<div style="font-size:.68rem;color:var(--text-dim);padding:0 .3rem;">'+(isMe?'You':esc(m.user_name))+' · '+time+'</div>'+
        '<div style="max-width:80%;padding:.45rem .75rem;border-radius:12px;font-size:.82rem;color:var(--text-primary);background:'+(isMe?'rgba(239,73,60,.15)':'var(--navy-hover)')+';border:1px solid '+(isMe?'rgba(239,73,60,.25)':'var(--navy-border)')+';">'+esc(m.content)+'</div>';
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
    _tmLastChatTs = msgs[msgs.length-1].created_at;
  }catch(e){}
}

// ── Copy invite link ──
function tmCopyInvite(){
  var url = window.location.origin + window.location.pathname + '?huddle=' + TM.roomCode;
  navigator.clipboard.writeText(url).then(function(){
    var btn = document.querySelector('[onclick="tmCopyInvite()"]');
    if(btn){ btn.textContent='✅ Copied!'; setTimeout(function(){ btn.textContent='📋 Copy Link'; },2000); }
  }).catch(function(){ prompt('Copy this invite link:', url); });
}

// ── Leave room ──
async function tmLeaveRoom(){
  if(!TM.roomId) return;
  clearInterval(TM.signalPollInterval);
  clearInterval(TM.pollInterval);
  clearInterval(TM.chatPollInterval);
  TM.signalPollInterval=null; TM.pollInterval=null; TM.chatPollInterval=null;
  await tmSendSignal(null,'tm_leave',{});
  // Remove participant
  try{ await fetch(SUPABASE_URL+'/rest/v1/huddle_participants?room_id=eq.'+TM.roomId+'&user_id=eq.'+currentUser.id,{method:'DELETE',headers:sbHeaders()}); }catch(e){}
  // Close all peers
  Object.keys(TM.peers).forEach(function(pid){ if(TM.peers[pid]){TM.peers[pid].close();delete TM.peers[pid];} });
  if(TM.localStream){ TM.localStream.getTracks().forEach(function(t){t.stop();}); TM.localStream=null; }
  TM.roomId=null; TM.roomCode=null; TM.roomName=null; TM.muted=true; TM.isCreator=false; TM.ICE=null;
  TM.processedSignals.clear(); _tmLastChatTs=null;
  document.getElementById('tm-active-room').style.display='none';
  document.getElementById('tm-no-room').style.display='block';
  var inp=document.getElementById('tm-join-code-input'); if(inp) inp.value='';
  await tmRefreshRoomState();
}

// ── End room (admin only) ──
async function tmEndRoom(){
  if(!isAdminUser()){ alert('Only Admin or TL can end the room.'); return; }
  if(!confirm('End the room for everyone? All participants will be disconnected.')) return;
  try{
    await sbUpdate('huddle_rooms','id',TM.roomId,{is_active:false});
    await tmSendSignal(null,'tm_room_ended',{});
    // Clean participants
    await fetch(SUPABASE_URL+'/rest/v1/huddle_participants?room_id=eq.'+TM.roomId,{method:'DELETE',headers:sbHeaders()});
    await tmLeaveRoom();
  }catch(e){ alert('Could not end room: '+e.message); }
}

// ── WebRTC ──
async function tmGetMic(){
  if(TM.localStream) return TM.localStream;
  try{
    TM.localStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,sampleRate:48000},video:false});
    return TM.localStream;
  }catch(e){ alert('Microphone access denied. Please allow mic access for Team Meet.'); return null; }
}

async function tmStartPeerConnection(peerId, isInitiator){
  if(TM.peers[peerId]) return;
  var stream = TM.localStream;
  if(!stream) return;
  var iceConfig = await tmGetIceConfig();
  var pc = new RTCPeerConnection(iceConfig);
  TM.peers[peerId] = pc;
  stream.getTracks().forEach(function(t){ pc.addTrack(t, stream); });
  pc.ontrack = function(e){
    var audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.autoplay = true;
    audio.id = 'tm-audio-'+peerId;
    document.body.appendChild(audio);
    tmMarkSpeaking(peerId, e.streams[0]);
  };
  pc.onicecandidate = function(e){
    if(e.candidate) tmSendSignal(peerId,'tm_ice',{candidate:e.candidate,for:peerId});
  };
  pc.onconnectionstatechange = function(){
    if(pc.connectionState==='failed'||pc.connectionState==='disconnected'){
      pc.close(); delete TM.peers[peerId];
      var el=document.getElementById('tm-audio-'+peerId); if(el) el.remove();
    }
  };
  if(isInitiator){
    var offer = await pc.createOffer({offerToReceiveAudio:true});
    await pc.setLocalDescription(offer);
    await tmSendSignal(peerId,'tm_offer',{sdp:pc.localDescription,for:peerId});
  }
}

function tmMarkSpeaking(userId, stream){
  try{
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    var src = ctx.createMediaStreamSource(stream);
    var analyser = ctx.createAnalyser();
    src.connect(analyser);
    var data = new Uint8Array(analyser.fftSize);
    setInterval(function(){
      analyser.getByteTimeDomainData(data);
      var vol = data.reduce(function(s,v){return s+Math.abs(v-128);},0)/data.length;
      var av = document.getElementById('tm-part-av-'+userId);
      if(av) av.style.boxShadow = vol>5 ? '0 0 0 3px rgba(46,197,111,.5)' : 'none';
    },200);
  }catch(e){}
}

// ── Signaling ──
async function tmSendSignal(toUserId, type, payload){
  if(!currentUser||!TM.roomId) return;
  try{
    await sbInsert('voice_signals',{
      from_id:currentUser.id, from_name:currentUser.name,
      to_id:toUserId||null, to_room:'tm:'+TM.roomId,
      type:type, payload:JSON.stringify(payload||{}),
      created_at:new Date().toISOString()
    });
  }catch(e){ console.warn('TM signal send failed:',e); }
}

async function tmPollSignals(){
  if(!currentUser||!TM.roomId) return;
  try{
    var since = new Date(Date.now()-8000).toISOString();
    var roomFilter = 'tm:'+TM.roomId;
    var rows = await sbQuery('voice_signals',
      'created_at=gt.'+encodeURIComponent(since)+
      '&or=(to_id.eq.'+currentUser.id+',to_room.eq.'+encodeURIComponent(roomFilter)+')'+
      '&order=created_at.asc&limit=50&select=id,from_id,from_name,to_id,to_room,type,payload'
    );
    if(!rows||!rows.length) return;
    for(var i=0;i<rows.length;i++){
      var sig=rows[i];
      if(sig.from_id===currentUser.id) continue;
      if(TM.processedSignals.has(sig.id)) continue;
      TM.processedSignals.add(sig.id);
      if(TM.processedSignals.size>300) TM.processedSignals.clear();
      await tmHandleSignal(sig);
    }
  }catch(e){}
}

async function tmHandleSignal(sig){
  var payload={};
  try{ payload=JSON.parse(sig.payload||'{}'); }catch(e){}
  var from=sig.from_id;
  switch(sig.type){
    case 'tm_join':
      // New person joined — connect to them
      await tmStartPeerConnection(from, true);
      tmUpdateRoomUI();
      break;
    case 'tm_leave':
      if(TM.peers[from]){ TM.peers[from].close(); delete TM.peers[from]; }
      var ael=document.getElementById('tm-audio-'+from); if(ael) ael.remove();
      tmUpdateRoomUI();
      break;
    case 'tm_room_ended':
      if(!TM.isCreator){
        alert('The room has been ended by the admin.');
        await tmLeaveRoom();
      }
      break;
    case 'tm_mute_state':
      tmUpdateRoomUI();
      break;
    case 'tm_offer':
      if(payload.for!==currentUser.id) break;
      var pc=TM.peers[from];
      if(!pc){
        var stream=TM.localStream; if(!stream) break;
        var ice=await tmGetIceConfig();
        pc=new RTCPeerConnection(ice);
        TM.peers[from]=pc;
        stream.getTracks().forEach(function(t){pc.addTrack(t,stream);});
        pc.ontrack=function(e){
          var a=new Audio(); a.srcObject=e.streams[0]; a.autoplay=true; a.id='tm-audio-'+from; document.body.appendChild(a);
          tmMarkSpeaking(from,e.streams[0]);
        };
        pc.onicecandidate=function(e){ if(e.candidate) tmSendSignal(from,'tm_ice',{candidate:e.candidate,for:from}); };
      }
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      var answer=await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await tmSendSignal(from,'tm_answer',{sdp:pc.localDescription,for:from});
      break;
    case 'tm_answer':
      if(payload.for!==currentUser.id) break;
      var apc=TM.peers[from];
      if(apc&&apc.signalingState!=='stable') await apc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      break;
    case 'tm_ice':
      var ipc=TM.peers[payload.for||from]||TM.peers[from];
      if(ipc&&payload.candidate){ try{await ipc.addIceCandidate(new RTCIceCandidate(payload.candidate));}catch(e){} }
      break;
  }
}

