/* ui-transitions.js
 * Portal interaction layer — animations and UI state helpers
 * No external dependencies
 */

// ══════════════════════════════════════════════════════════
//  EASTER EGG SYSTEM
//  Triggers (outside input fields only):
//    Konami code  ↑↑↓↓←→←→BA  → Gravity
//    k7magic      → Barrel roll
//    k7matrix     → Matrix rain
//    k7rave       → Rave party
//    k7thanos     → Thanos snap
//    k7tilt       → Tilt page  (k7straight to restore)
//    k7diwan      → Special tribute splash
// ══════════════════════════════════════════════════════════

(function(){

  // ── Key sequence tracker ──
  var _egBuffer = '';
  var _egKonami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var _egKonamiPos = 0;
  var _egActive = {};   // which effects are currently running

  function egInInput(){
    var t = document.activeElement;
    if(!t) return false;
    var tag = t.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return true;
    if(t.isContentEditable) return true;
    return false; // divs, body, buttons etc are fine
  }

  // Debug: expose buffer so you can check in console
  Object.defineProperty(window, '_egDebug', { get: function(){ return { buffer: _egBuffer, konamiPos: _egKonamiPos, active: _egActive }; } });

  function egHint(msg){
    var el = document.getElementById('eg-hint-toast');
    if(!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._ht);
    el._ht = setTimeout(function(){ el.classList.remove('show'); }, 2800);
  }

  document.addEventListener('keydown', function(e){
    // Konami code check (works even in inputs for arrow keys to not block normal use)
    var expected = _egKonami[_egKonamiPos];
    var key = e.key;
    if(key === expected){
      _egKonamiPos++;
      if(_egKonamiPos === _egKonami.length){
        _egKonamiPos = 0;
        egGravity();
      }
    } else {
      _egKonamiPos = (key === _egKonami[0]) ? 1 : 0;
    }

    // Text sequences — only outside inputs
    if(egInInput()) return;
    if(e.key === 'Escape'){
      egEscapeAll();
      return;
    }
    if(e.key.length === 1){
      _egBuffer += e.key.toLowerCase();
      if(_egBuffer.length > 20) _egBuffer = _egBuffer.slice(-20);
      egCheckBuffer();
    }
  });

  function egCheckBuffer(){
    var b = _egBuffer;
    if(b.endsWith('k7magic'))   { _egBuffer=''; egBarrelRoll(); }
    else if(b.endsWith('k7matrix'))  { _egBuffer=''; egMatrix(); }
    else if(b.endsWith('k7rave'))    { _egBuffer=''; egRave(); }
    else if(b.endsWith('k7thanos'))  { _egBuffer=''; egThanos(); }
    else if(b.endsWith('k7tilt'))    { _egBuffer=''; egTilt(); }
    else if(b.endsWith('k7straight')){ _egBuffer=''; egUnTilt(); }
    else if(b.endsWith('k7diwan'))   { _egBuffer=''; egDiwan(); }
  }

  function egEscapeAll(){
    egGravityStop();
    egMatrixStop();
    egRaveStop();
    egDiwanClose();
    egUnTilt();
    _egActive = {};
  }

  // ════════════════════════════
  //  GRAVITY
  // ════════════════════════════
  var _egGravityBodies = [];
  var _egGravityRAF = null;

  function egGravity(){
    if(_egActive.gravity){ egGravityStop(); return; }
    _egActive.gravity = true;
    egHint('🌍 Gravity activated! Click elements to throw them. Konami again to restore.');

    // Grab all meaningful elements
    var sel = '.sidebar-item, .cd-card, .main-content > div > div, .home-card, .stat-card, .topbar-msg-btn, .work-clock-wrap';
    var els = document.querySelectorAll(sel);
    var W = window.innerWidth, H = window.innerHeight;

    els.forEach(function(el){
      var r = el.getBoundingClientRect();
      if(r.width < 10 || r.height < 10) return;

      // Save original styles
      var orig = {
        position: el.style.position, left: el.style.left, top: el.style.top,
        width: el.style.width, zIndex: el.style.zIndex,
        transform: el.style.transform, margin: el.style.margin,
        transition: el.style.transition
      };

      // Fix dimensions and position
      el.style.position = 'fixed';
      el.style.left     = r.left + 'px';
      el.style.top      = r.top  + 'px';
      el.style.width    = r.width + 'px';
      el.style.zIndex   = '8000';
      el.style.margin   = '0';
      el.style.transition = 'none';
      el.classList.add('eg-gravity-el');

      var body = {
        el: el, orig: orig,
        x: r.left, y: r.top,
        vx: (Math.random()-0.5)*2,
        vy: -(Math.random()*1.5),
        rot: 0, rotV: (Math.random()-0.5)*4,
        w: r.width, h: r.height,
        mass: Math.max(0.4, Math.min(2.0, (r.width*r.height)/40000)),
        bounces: 0
      };

      el.addEventListener('click', function(ev){
        if(!_egActive.gravity) return;
        ev.stopPropagation();
        body.vy = -(8 + Math.random()*6);
        body.vx = (Math.random()-0.5)*10;
        body.rotV = (Math.random()-0.5)*12;
      }, true);

      _egGravityBodies.push(body);
    });

    _egGravityRAF = requestAnimationFrame(egGravityTick);
  }

  function egGravityTick(){
    if(!_egActive.gravity){ _egGravityRAF=null; return; }
    var H = window.innerHeight;
    var W = window.innerWidth;
    var gravity = 0.45;

    _egGravityBodies.forEach(function(b){
      b.vy += gravity * b.mass;
      b.x  += b.vx;
      b.y  += b.vy;
      b.rot += b.rotV;

      // Floor bounce
      if(b.y + b.h >= H){
        b.y  = H - b.h;
        b.vy = -(b.vy * 0.42);
        b.vx *=  0.78;
        b.rotV *= 0.7;
        b.bounces++;
        if(Math.abs(b.vy) < 0.8) b.vy = 0;
        if(Math.abs(b.vx) < 0.2) b.vx = 0;
      }
      // Side walls
      if(b.x < 0){ b.x=0; b.vx=Math.abs(b.vx)*0.5; }
      if(b.x + b.w > W){ b.x=W-b.w; b.vx=-Math.abs(b.vx)*0.5; }

      b.el.style.left      = b.x + 'px';
      b.el.style.top       = b.y + 'px';
      b.el.style.transform = 'rotate('+b.rot+'deg)';
    });

    _egGravityRAF = requestAnimationFrame(egGravityTick);
  }

  function egGravityStop(){
    _egActive.gravity = false;
    if(_egGravityRAF){ cancelAnimationFrame(_egGravityRAF); _egGravityRAF=null; }
    _egGravityBodies.forEach(function(b){
      b.el.classList.remove('eg-gravity-el');
      b.el.style.position   = b.orig.position;
      b.el.style.left       = b.orig.left;
      b.el.style.top        = b.orig.top;
      b.el.style.width      = b.orig.width;
      b.el.style.zIndex     = b.orig.zIndex;
      b.el.style.transform  = b.orig.transform;
      b.el.style.margin     = b.orig.margin;
      b.el.style.transition = b.orig.transition;
    });
    _egGravityBodies = [];
  }

  // ════════════════════════════
  //  BARREL ROLL
  // ════════════════════════════
  function egBarrelRoll(){
    if(_egActive.barrel) return;
    _egActive.barrel = true;
    egHint('🛢️ Do a barrel roll!');
    var root = document.getElementById('dashboard-view') || document.body;
    root.classList.add('eg-barrel');
    root.addEventListener('animationend', function done(){
      root.classList.remove('eg-barrel');
      root.removeEventListener('animationend', done);
      _egActive.barrel = false;
    });
  }

  // ════════════════════════════
  //  MATRIX RAIN
  // ════════════════════════════
  var _egMatrixRAF = null;
  var _egMatrixDrops = [];

  function egMatrix(){
    if(_egActive.matrix){ egMatrixStop(); return; }
    _egActive.matrix = true;
    egHint('💊 There is no spoon. Type k7matrix again or Escape to exit.');

    var canvas = document.getElementById('eg-matrix-canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.classList.add('active');

    var ctx  = canvas.getContext('2d');
    var cols = Math.floor(canvas.width / 16);
    _egMatrixDrops = Array(cols).fill(1);

    function tick(){
      if(!_egActive.matrix){ ctx.clearRect(0,0,canvas.width,canvas.height); return; }
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#00ff41';
      ctx.font = '14px monospace';
      _egMatrixDrops.forEach(function(y,i){
        var ch = String.fromCharCode(0x30A0 + Math.random()*96);
        ctx.fillStyle = y===1 ? '#fff' : '#00ff41';
        ctx.fillText(ch, i*16, y*16);
        if(y*16 > canvas.height && Math.random() > 0.975) _egMatrixDrops[i] = 0;
        _egMatrixDrops[i]++;
      });
      _egMatrixRAF = requestAnimationFrame(tick);
    }
    tick();

    // Auto stop after 12 seconds
    setTimeout(function(){ if(_egActive.matrix) egMatrixStop(); }, 12000);
  }

  function egMatrixStop(){
    _egActive.matrix = false;
    if(_egMatrixRAF){ cancelAnimationFrame(_egMatrixRAF); _egMatrixRAF=null; }
    var canvas = document.getElementById('eg-matrix-canvas');
    if(canvas){
      canvas.classList.remove('active');
      setTimeout(function(){ var ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); }, 500);
    }
  }

  // ════════════════════════════
  //  RAVE
  // ════════════════════════════
  var _egRaveTimer = null;
  var _egRaveInterval = null;

  function egRave(){
    if(_egActive.rave){ egRaveStop(); return; }
    _egActive.rave = true;
    egHint('🎉 RAVE MODE! Type k7rave again or Escape to stop.');

    var overlay = document.getElementById('eg-rave-overlay');
    var hues = [0,30,60,120,180,240,300];
    var i = 0;
    overlay.style.opacity = '1';

    _egRaveInterval = setInterval(function(){
      if(!_egActive.rave){ return; }
      var h = hues[i++ % hues.length];
      overlay.style.background = 'hsla('+h+',100%,60%,0.18)';
      document.body.style.filter = 'hue-rotate('+h+'deg)';
    }, 160);

    // Auto stop after 8s
    _egRaveTimer = setTimeout(function(){ if(_egActive.rave) egRaveStop(); }, 8000);
  }

  function egRaveStop(){
    _egActive.rave = false;
    clearInterval(_egRaveInterval);
    clearTimeout(_egRaveTimer);
    var overlay = document.getElementById('eg-rave-overlay');
    if(overlay) overlay.style.opacity = '0';
    document.body.style.filter = '';
  }

  // ════════════════════════════
  //  THANOS SNAP
  // ════════════════════════════
  function egThanos(){
    if(_egActive.thanos) return;
    _egActive.thanos = true;
    egHint('⚡ Perfectly balanced, as all things should be.');

    var els = Array.from(document.querySelectorAll('.sidebar-item'));
    var half = Math.floor(els.length / 2);
    var victims = els.sort(function(){ return Math.random()-0.5; }).slice(0, half);

    victims.forEach(function(el, idx){
      setTimeout(function(){
        var r = el.getBoundingClientRect();
        // Spawn dust particles
        for(var p=0; p<18; p++){
          var d = document.createElement('div');
          d.className = 'eg-dust-particle';
          var hue = 20+Math.random()*40;
          d.style.cssText =
            'left:'+(r.left+Math.random()*r.width)+'px;'+
            'top:'+(r.top+Math.random()*r.height)+'px;'+
            'width:'+(3+Math.random()*5)+'px;'+
            'height:'+(3+Math.random()*5)+'px;'+
            'background:hsl('+hue+',80%,55%);'+
            '--tx:'+(Math.random()-0.5)*120+'px;'+
            '--ty:'+(-(20+Math.random()*100))+'px;'+
            '--dur:'+(0.8+Math.random()*0.7)+'s;';
          document.body.appendChild(d);
          setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, 1600);
        }
        el.style.transition = 'opacity .6s, transform .6s';
        el.style.opacity    = '0';
        el.style.transform  = 'scale(0.3) translateY(-20px)';
      }, idx * 80);
    });

    setTimeout(function(){
      egHint('🫳 Snapped. Escape to restore.');
      _egActive.thanos = false;
    }, victims.length*80 + 800);

    // Restore after 6s
    setTimeout(function(){
      victims.forEach(function(el){
        el.style.transition = 'opacity .5s, transform .5s';
        el.style.opacity    = '';
        el.style.transform  = '';
      });
    }, 6000);
  }

  // ════════════════════════════
  //  TILT
  // ════════════════════════════
  var _egTilted = false;

  function egTilt(){
    if(_egTilted) return;
    _egTilted = true;
    egHint('↗️ Tilted! Type k7straight to fix.');
    var root = document.getElementById('dashboard-view') || document.body;
    root.classList.add('eg-tilted');
  }

  function egUnTilt(){
    if(!_egTilted) return;
    _egTilted = false;
    var root = document.getElementById('dashboard-view') || document.body;
    root.classList.remove('eg-tilted');
    egHint('✅ Back to normal.');
  }

  // ════════════════════════════
  //  K7DIWAN TRIBUTE
  // ════════════════════════════
  function egDiwan(){
    if(_egActive.diwan) return;
    _egActive.diwan = true;
    var splash = document.getElementById('eg-diwan-splash');
    if(!splash) return;
    splash.style.display = 'flex';
    splash.style.opacity = '0';
    void splash.offsetWidth; // force reflow so transition fires
    splash.classList.add('active');

    // Confetti burst
    var colors = ['#f59e0b','#ef4444','#8b5cf6','#06b6d4','#10b981','#f97316','#ec4899'];
    for(var i=0; i<80; i++){
      (function(){
        var c = document.createElement('div');
        c.className = 'eg-confetti';
        c.style.cssText =
          'left:'+(10+Math.random()*80)+'vw;'+
          'top:-20px;'+
          'background:'+colors[Math.floor(Math.random()*colors.length)]+';'+
          '--dur:'+(2+Math.random()*2)+'s;'+
          '--ey:'+(window.innerHeight+40)+'px;'+
          '--r:'+(360+Math.random()*720)+'deg;'+
          '--ex:'+(Math.random()-0.5)*200+'px;';
        document.body.appendChild(c);
        setTimeout(function(){ if(c.parentNode) c.parentNode.removeChild(c); }, 4200);
      })();
    }
  }

  window.egDiwanClose = function(){
    var splash = document.getElementById('eg-diwan-splash');
    if(splash){
      splash.classList.remove('active');
      splash.style.opacity = '0';
      setTimeout(function(){ splash.style.display = 'none'; }, 650);
    }
    _egActive.diwan = false;
  };

  // Hook Escape to also close diwan splash
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && _egActive.diwan) egDiwanClose();
  });

  // ── Init: expose for console testing and Escape ──
  window._egEscapeAll = egEscapeAll;
  window.egGravity    = egGravity;
  window.egBarrelRoll = egBarrelRoll;
  window.egMatrix     = egMatrix;
  window.egRave       = egRave;
  window.egThanos     = egThanos;
  window.egTilt       = egTilt;
  window.egDiwan      = egDiwan;

})();
