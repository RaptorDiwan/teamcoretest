/* ═══════════════════════════════════════════════════════════
   K7TeamCore — CSAT Module
   Loaded by index.html via <script src="csat_module_patch.js">
   Edit freely. Never touch index.html for CSAT changes.

   ▸ Set your group email address on the line below.
═══════════════════════════════════════════════════════════ */

var CSAT_GROUP_EMAIL = 'team@k7computing.com'; // ← change to your group mail

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
var CSAT_DATA = { consumer:null, vision:null, esp:null, chat:null };
var CSAT_ACTIVE_TAB = 'consumer';
var CSAT_SETTINGS = { pageVisible:true, dsatVisible:true, uploadAccess:{} };

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
var _SCORE_MAP = {
  'excellent':5, 'very good':4, 'good':3, 'poor':2, 'very poor':1
};

function csatToScore(v) {
  if (!v||String(v).trim()==='') return null;
  var s=String(v).trim().toLowerCase();
  if (_SCORE_MAP[s]!==undefined) return _SCORE_MAP[s];
  var n=parseFloat(s); return isNaN(n)?null:n;
}
function csatAvgCls(a) {
  if (a===null||a===undefined) return 'cs-avg-m';
  if (a>=4.5) return 'cs-avg-h'; if (a>=3.5) return 'cs-avg-m';
  if (a>=3)   return 'cs-avg-l'; return 'cs-avg-p';
}
function csatScoreCls(s) {
  if (s>=5) return 'cs-5'; if (s>=4) return 'cs-4';
  if (s>=3) return 'cs-3'; if (s>=2) return 'cs-2'; return 'cs-1';
}
function csatToast(msg) {
  var t=document.getElementById('_csat_toast');
  if (!t) {
    t=document.createElement('div'); t.id='_csat_toast';
    t.style.cssText='position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);'
      +'background:rgba(19,23,49,.97);color:#fff;border:1px solid #2D3748;'
      +'border-radius:12px;padding:.7rem 1.5rem;font-size:.82rem;'
      +'font-family:"DM Sans",sans-serif;z-index:9999;'
      +'box-shadow:0 8px 32px rgba(4,8,30,.4);pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent=msg; t.style.display='block';
  clearTimeout(t._tt); t._tt=setTimeout(function(){t.style.display='none';},3500);
}

// ─────────────────────────────────────────────────────────
// SETTINGS (localStorage — survives refresh for admin)
// ─────────────────────────────────────────────────────────
function csatLoadSettings() {
  try { var s=localStorage.getItem('csat_settings_v1'); if(s) CSAT_SETTINGS=JSON.parse(s); } catch(e){}
}
function csatSaveSettings() {
  try { localStorage.setItem('csat_settings_v1',JSON.stringify(CSAT_SETTINGS)); } catch(e){}
}

// ─────────────────────────────────────────────────────────
// INIT — called every time the CSAT page is opened
// ─────────────────────────────────────────────────────────
function csatInit() {
  csatLoadSettings();
  var isAdminOrTL = currentUser && (currentUser.role==='admin'||currentUser.role==='tl');

  // Page hidden by admin for agents
  if (!isAdminOrTL && CSAT_SETTINGS.pageVisible===false) {
    document.getElementById('page-csat').innerHTML =
      '<div class="placeholder-page"><div class="big-icon">'
      +'<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/>'
      +'<path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/></svg></div>'
      +'<h2>CSAT Reports</h2><p>This section is currently disabled.</p></div>';
    return;
  }

  // Email button visibility
  var ew=document.getElementById('csat-email-wrap');
  if (ew) ew.style.display=isAdminOrTL?'':'none';

  // Render current tab
  csatRenderTab(CSAT_ACTIVE_TAB);
}

// ─────────────────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────────────────
function csatSwitchTab(tab, btn) {
  CSAT_ACTIVE_TAB=tab;
  ['consumer','vision','esp','chat'].forEach(function(t) {
    var b=document.getElementById('csat-tab-'+t);
    var p=document.getElementById('csat-panel-'+t);
    if (b) b.classList.toggle('active',t===tab);
    if (p) p.style.display=t===tab?'':'none';
  });
  csatRenderTab(tab);
}

// ─────────────────────────────────────────────────────────
// RENDER TAB
// ─────────────────────────────────────────────────────────
function csatRenderTab(tab) {
  var inner=document.getElementById('csat-inner-'+tab);
  if (!inner) return;
  var data=CSAT_DATA[tab];
  var canUpload=csatCanUpload();

  if (!data) { inner.innerHTML=csatEmptyPanel(tab,canUpload); csatBindUpload(tab); return; }

  // For Consumer tab: if VH data also exists, merge VH rows at the bottom
  var vhData = (tab==='consumer' && CSAT_DATA['vision']) ? CSAT_DATA['vision'] : null;

  inner.innerHTML=csatBuildPanel(tab, data, canUpload, vhData);
  csatBindUpload(tab);

  // Mark dot green
  var dot=document.getElementById('csat-dot-'+tab);
  if (dot) dot.style.background='var(--accent-green)';
  var tabBtn=document.getElementById('csat-tab-'+tab);
  if (tabBtn) tabBtn.classList.add('has-data');
}

function csatCanUpload() {
  if (!currentUser) return false;
  if (currentUser.role==='admin'||currentUser.role==='tl') return true;
  return CSAT_SETTINGS.uploadAccess[currentUser.id]===true;
}

// ─────────────────────────────────────────────────────────
// EMPTY PANEL
// ─────────────────────────────────────────────────────────
function csatEmptyPanel(tab, canUpload) {
  var lbl={consumer:'Consumer Survey Report',vision:'Vision Helpdesk Report',esp:'ESP Report',chat:'Live Chat Satisfaction Report'};
  var up=canUpload?`
    <div style="margin-top:1.2rem;">
      <div class="csat-upload-zone" id="csat-uz-${tab}">
        <input type="file" id="csat-fi-${tab}" accept=".xlsx,.xls,.csv"/>
        <div style="font-size:1.6rem;margin-bottom:.5rem;">📂</div>
        <div style="font-size:.88rem;font-weight:600;color:var(--text-primary);margin-bottom:.3rem;">Upload ${lbl[tab]}</div>
        <div style="font-size:.76rem;color:var(--text-muted);">.xlsx from CRM — drag & drop or click</div>
      </div>
    </div>`:'';
  return `<div class="csat-no-data">
    <div class="csat-no-data-icon">📊</div>
    <div class="csat-no-data-title">No data uploaded yet for today</div>
    <div class="csat-no-data-sub">${lbl[tab]} hasn't been uploaded yet.</div>
  </div>${up}`;
}

// ─────────────────────────────────────────────────────────
// BUILD FULL PANEL
// ─────────────────────────────────────────────────────────
function csatBuildPanel(tab, data, canUpload, vhData) {
  var rows=data.rows, uploadTime=data.uploadTime;
  var isAdmin=currentUser&&(currentUser.role==='admin'||currentUser.role==='tl');
  var myName=currentUser?currentUser.name.toLowerCase():'';
  var showDsat=isAdmin||CSAT_SETTINGS.dsatVisible!==false;
  var lbl={consumer:'Consumer',vision:'Vision Helpdesk (VH)',esp:'Enterprise (ESP)',chat:'Live Chat'};
  var lbl2={consumer:'Consumer Survey Report',vision:'Vision Helpdesk Report',esp:'Enterprise Survey Report',chat:'Live Chat Report'};

  // Detect if this tab's data is enterprise
  var isEnterprise = rows.length>0 && rows[0].isEnterprise;

  // Group by agent
  var agentMap={};
  rows.forEach(function(r){ var k=r.agent||'Unknown'; if(!agentMap[k]) agentMap[k]=[]; agentMap[k].push(r); });

  var agentData=[];
  Object.keys(agentMap).sort().forEach(function(name){
    var tix=agentMap[name];
    var trows=tix.map(function(t){
      var cols = isEnterprise
        ? [t.scores.knowledge,t.scores.professionalism,t.scores.followUp,t.scores.timeResolved,t.scores.overallExp]
        : [t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService];
      var valid=cols.filter(function(s){return s!==null;});
      return Object.assign({},t,{rowAvg:valid.length>0?valid.reduce(function(a,b){return a+b;},0)/valid.length:null});
    });
    var allS=[];
    trows.forEach(function(t){
      var cols = isEnterprise
        ? [t.scores.knowledge,t.scores.professionalism,t.scores.followUp,t.scores.timeResolved,t.scores.overallExp]
        : [t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService];
      cols.forEach(function(s){if(s!==null)allS.push(s);});
    });
    var agentAvg=allS.length>0?allS.reduce(function(a,b){return a+b;},0)/allS.length:null;
    var comments=trows.map(function(t){return t.comment;}).filter(function(c){return c&&c.trim()!=='';}).join(' | ');
    agentData.push({name:name,ticketRows:trows,agentAvg:agentAvg,comments:comments});
  });

  // Sort by agentAvg descending (highest first)
  agentData.sort(function(a, b){
    var avgA = a.agentAvg !== null ? a.agentAvg : -1;
    var avgB = b.agentAvg !== null ? b.agentAvg : -1;
    if (avgB !== avgA) return avgB - avgA;
    return a.name.localeCompare(b.name);
  });

  // Stats
  var allAvgs=agentData.map(function(a){return a.agentAvg;}).filter(function(a){return a!==null;});
  var overallAvg=allAvgs.length>0?allAvgs.reduce(function(a,b){return a+b;},0)/allAvgs.length:0;
  var dsatCount=agentData.filter(function(a){return a.agentAvg!==null&&a.agentAvg<3;}).length;
  var csatPct=allAvgs.length>0?Math.round((allAvgs.filter(function(a){return a>=4;}).length/allAvgs.length)*100):0;

  var html='';

  // Upload strip
  if (canUpload) {
    html+=`<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:.75rem;">
      <div class="csat-upload-badge">🟢 Last uploaded: ${uploadTime}</div>
      <div class="csat-upload-zone" id="csat-uz-${tab}" style="padding:.55rem 1rem;display:inline-flex;align-items:center;gap:.5rem;cursor:pointer;text-align:left;border-radius:var(--radius-sm);">
        <input type="file" id="csat-fi-${tab}" accept=".xlsx,.xls,.csv"/>
        <span style="font-size:.95rem;">📂</span>
        <span style="font-size:.76rem;color:var(--text-muted);">Re-upload ${lbl2[tab]}</span>
      </div>
    </div>`;
  } else {
    html+=`<div style="margin-bottom:.75rem;"><div class="csat-upload-badge">🟢 Last updated: ${uploadTime}</div></div>`;
  }

  // Stats row
  var vhCount = (!isEnterprise && vhData && vhData.rows) ? vhData.rows.length : 0;
  var totalResponses = rows.length + vhCount;
  html+=`<div class="csat-stats" style="margin-bottom:1.2rem;">
    <div class="csat-stat"><div class="csat-stat-label">Total Responses</div><div class="csat-stat-val">${totalResponses}${vhCount>0?` <span style="font-size:.65rem;color:var(--accent-blue);font-family:'DM Sans',sans-serif;">(+${vhCount} VH)</span>`:''}</div></div>
    <div class="csat-stat"><div class="csat-stat-label">Agents Covered</div><div class="csat-stat-val blue">${agentData.length}</div></div>
    <div class="csat-stat"><div class="csat-stat-label">Overall Avg</div><div class="csat-stat-val ${overallAvg>=4?'green':overallAvg>=3?'gold':'red'}">${overallAvg.toFixed(2)}</div></div>
    <div class="csat-stat"><div class="csat-stat-label">CSAT ≥4 Rate</div><div class="csat-stat-val green">${csatPct}%</div></div>
    <div class="csat-stat"><div class="csat-stat-label">DSAT Agents</div><div class="csat-stat-val ${dsatCount>0?'red':'green'}">${dsatCount}</div></div>
  </div>`;

  // DSAT section
  var dsatAgents=agentData.filter(function(a){return a.agentAvg!==null&&a.agentAvg<3;});
  if (showDsat&&dsatAgents.length>0) {
    html+=`<div style="margin-bottom:1.2rem;">
      <div class="section-title">⚠️ DSAT Agents (avg below 3.0)</div>
      <div style="display:flex;flex-direction:column;gap:.45rem;">
        ${dsatAgents.map(function(a){return `
          <div style="display:flex;align-items:center;gap:1rem;padding:.65rem 1rem;background:rgba(239,73,60,.07);border:1px solid rgba(239,73,60,.2);border-radius:var(--radius-sm);">
            <div style="font-weight:600;font-size:.875rem;flex:1;">${a.name}</div>
            <div style="font-size:.72rem;color:var(--text-muted);">${a.ticketRows.length} ticket${a.ticketRows.length!==1?'s':''}</div>
            <span class="cs-avg cs-avg-p">${a.agentAvg.toFixed(2)}</span>
          </div>`;}).join('')}
      </div>
    </div>`;
  }

  // Leaderboard
  var sorted=agentData.slice().sort(function(a,b){return (b.agentAvg||0)-(a.agentAvg||0);});
  html+=`<div class="section-title">🏆 Agent Leaderboard</div>
  <div class="csat-lb" style="margin-bottom:1.5rem;">
    ${sorted.map(function(a,i){
      var isDsat=a.agentAvg!==null&&a.agentAvg<3;
      var isMe=a.name.toLowerCase()===myName;
      var pct=a.agentAvg!==null?Math.round((a.agentAvg/5)*100):0;
      var rankCls=i===0?'top1':i===1?'top2':i===2?'top3':'';
      var rowCls=(isDsat?'lb-dsat ':'')+(isMe?'lb-my':'');
      var medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
      return `<div class="csat-lb-row ${rowCls}">
        <div class="csat-lb-rank ${rankCls}">${medal}</div>
        <div style="flex:1;">
          <div class="csat-lb-name">${a.name}${isMe?' <span style="font-size:.62rem;background:rgba(239,73,60,.15);color:var(--gold);padding:1px 7px;border-radius:10px;font-weight:700;margin-left:.35rem;">YOU</span>':''}</div>
          <div class="csat-lb-tickets">${a.ticketRows.length} ticket${a.ticketRows.length!==1?'s':''}</div>
        </div>
        <div class="csat-lb-bar-wrap">
          <div class="csat-lb-bar-bg"><div class="csat-lb-bar-fill" style="width:${pct}%"></div></div>
        </div>
        <span class="cs-avg ${csatAvgCls(a.agentAvg)}" style="min-width:52px;text-align:center;">${a.agentAvg!==null?a.agentAvg.toFixed(2):'—'}</span>
      </div>`;
    }).join('')}
  </div>`;

  // Detail table — columns differ by vertical
  var colHeaders = isEnterprise
    ? `<th style="min-width:140px;">Agent</th>
       <th>Ticket ID</th>
       <th style="min-width:160px;">Account Name</th>
       <th>Knowledge &amp; Expertise</th>
       <th>Professionalism</th>
       <th>Follow-up &amp; Communication</th>
       <th>Time to Resolve</th>
       <th>Overall Exp.</th>
       <th>Average</th>
       <th style="min-width:200px;">Comments</th>`
    : `<th style="min-width:140px;">Agent</th><th>Ticket ID</th>
       <th>Knowledge</th><th>Time Taken</th><th>Understandability</th>
       <th>Customer Service</th><th>Average</th>
       <th style="min-width:180px;">Comments</th>`;

  html+=`<div class="section-title">📋 Detailed Report — ${lbl[tab]}</div>
  <div class="csat-table-wrap">
    <div class="csat-table-header">
      <div>
        <div style="font-size:.88rem;font-weight:600;color:var(--text-primary);">Ticket-level breakdown</div>
        <div style="font-size:.72rem;color:var(--text-muted);margin-top:.15rem;">${isEnterprise
          ? 'Excellent/Very satisfied=5 · Satisfied=4 · Neutral=3 · Dissatisfied=2 · Very dissatisfied=1'
          : 'Excellent=5 · Very Good=4 · Good=3 · Poor=2 · Very Poor=1 · Product Performance excluded'}</div>
      </div>
      <div class="csat-filter-bar">
        <input class="csat-filter-inp" placeholder="🔍 Filter agent / ticket..." oninput="csatFilter(this.value,'${tab}')"/>
        ${isAdmin?`<button class="xc-btn" onclick="csatExportExcel('${tab}')" style="padding:.4rem .9rem;font-size:.76rem;">⬇ Excel</button>`:''}
      </div>
    </div>
    <div class="csat-tbl-scroll">
      <table class="csat-tbl" id="csat-tbl-${tab}">
        <thead><tr>${colHeaders}</tr></thead>
        <tbody id="csat-tbody-${tab}">`;

  if (isEnterprise) {
    // Enterprise: same grouped-by-agent layout as Consumer, with Account Name column
    agentData.forEach(function(agent,idx){
      var tc=agent.ticketRows.length;
      var isMe=agent.name.toLowerCase()===myName;
      agent.ticketRows.forEach(function(t,ti){
        var isDsat=t.rowAvg!==null&&t.rowAvg<3&&showDsat;
        var rowCls=(isDsat?'csat-dsat-row ':'')+(isMe?'csat-my-row ':'');
        if (ti===tc-1&&idx<agentData.length-1) rowCls+=' csat-agent-sep';
        function sc(v){
          if(v===null) return '<td style="text-align:center;color:var(--text-dim);">—</td>';
          return '<td style="text-align:center;"><span class="cs-chip '+csatScoreCls(v)+'">'+v+'</span></td>';
        }
        var agentTd=ti===0
          ?`<td rowspan="${tc}" style="font-weight:600;vertical-align:middle;border-right:1px solid var(--navy-border);">${agent.name}</td>`
          :'';

        var commentTd=ti===tc-1
          ?`<td style="max-width:200px;white-space:normal;font-size:.76rem;color:var(--text-muted);line-height:1.4;">${agent.comments||'—'}</td>`
          :'<td></td>';
        var rowAvgTd=t.rowAvg!==null
          ?`<td style="text-align:center;"><span class="cs-avg ${csatAvgCls(t.rowAvg)}">${t.rowAvg.toFixed(2)}</span></td>`
          :'<td style="text-align:center;color:var(--text-dim);">—</td>';
        html+=`<tr class="${rowCls}">
          ${agentTd}
          <td style="font-family:monospace;font-size:.74rem;color:var(--accent-blue);font-weight:600;">${t.ticket||'—'}</td>
          <td style="font-size:.8rem;font-weight:500;">${t.account||t.customer||'—'}</td>
          ${sc(t.scores.knowledge)}${sc(t.scores.professionalism)}${sc(t.scores.followUp)}${sc(t.scores.timeResolved)}${sc(t.scores.overallExp)}
          ${rowAvgTd}${commentTd}
        </tr>`;
      });
    });
  } else {
    // Consumer: ONE merged row per agent — all tickets combined, each column averaged
    agentData.forEach(function(agent){
      var isMe=agent.name.toLowerCase()===myName;

      // All ticket IDs joined
      var allTickets=agent.ticketRows.map(function(t){return t.ticket;}).filter(Boolean).join(', ');
      // Average each score column across all tickets for this agent
      function colAvg(key){
        var vals=agent.ticketRows.map(function(t){return t.scores[key];}).filter(function(v){return v!==null;});
        return vals.length>0?+(vals.reduce(function(a,b){return a+b;},0)/vals.length).toFixed(2):null;
      }
      var aKnowledge        =colAvg('knowledge');
      var aTimeTaken        =colAvg('timeTaken');
      var aUnderstandability=colAvg('understandability');
      var aCustomerService  =colAvg('customerService');

      // Overall average for this agent (all 4 cols, all tickets)
      var allVals=[];
      agent.ticketRows.forEach(function(t){
        [t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService]
          .forEach(function(s){if(s!==null)allVals.push(s);});
      });
      var agentAvg=allVals.length>0?+(allVals.reduce(function(a,b){return a+b;},0)/allVals.length).toFixed(2):null;

      var isDsat=agentAvg!==null&&agentAvg<3&&showDsat;
      var rowCls=(isDsat?'csat-dsat-row ':'')+(isMe?'csat-my-row ':'');

      function sc(v){
        if(v===null) return '<td style="text-align:center;color:var(--text-dim);">—</td>';
        var rounded=Math.round(v);
        return '<td style="text-align:center;"><span class="cs-chip '+csatScoreCls(rounded)+'">'+v+'</span></td>';
      }
      var avgCell=agentAvg!==null
        ?`<td style="text-align:center;"><span class="cs-avg ${csatAvgCls(agentAvg)}">${agentAvg}</span></td>`
        :'<td style="text-align:center;color:var(--text-dim);">—</td>';

      html+=`<tr class="${rowCls}">
        <td style="font-weight:600;">${agent.name}</td>
        <td style="font-family:monospace;font-size:.72rem;color:var(--accent-blue);font-weight:600;white-space:normal;line-height:1.7;">${allTickets||'—'}</td>
        ${sc(aKnowledge)}${sc(aTimeTaken)}${sc(aUnderstandability)}${sc(aCustomerService)}
        ${avgCell}
        <td style="max-width:200px;white-space:normal;font-size:.76rem;color:var(--text-muted);line-height:1.5;">${agent.comments||'—'}</td>
      </tr>`;
    });
  }

  // ── VH section: appended below Consumer table if VH data uploaded ──
  if (!isEnterprise && vhData && vhData.rows && vhData.rows.length>0) {
    // Group VH rows by agent same as consumer
    var vhAgentMap={};
    vhData.rows.forEach(function(r){ var k=r.agent||'Unknown'; if(!vhAgentMap[k]) vhAgentMap[k]=[]; vhAgentMap[k].push(r); });
    var vhAgentData=[];
    Object.keys(vhAgentMap).sort().forEach(function(name){
      var tix=vhAgentMap[name];
      function vhColAvg(key){
        var vals=tix.map(function(t){return t.scores[key];}).filter(function(v){return v!==null;});
        return vals.length>0?+(vals.reduce(function(a,b){return a+b;},0)/vals.length).toFixed(2):null;
      }
      var aK=vhColAvg('knowledge'), aTT=vhColAvg('timeTaken'), aU=vhColAvg('understandability'), aCS=vhColAvg('customerService');
      var allVals=[];
      tix.forEach(function(t){[t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService].forEach(function(s){if(s!==null)allVals.push(s);});});
      var avg=allVals.length>0?+(allVals.reduce(function(a,b){return a+b;},0)/allVals.length).toFixed(2):null;
      var comments=tix.map(function(t){return t.comment;}).filter(function(c){return c&&c.trim()!=='';}).join(' | ');
      var allTickets=tix.map(function(t){return t.ticket;}).filter(Boolean).join(', ');
      vhAgentData.push({name:name,ticketRows:tix,agentAvg:avg,comments:comments,allTickets:allTickets,aK:aK,aTT:aTT,aU:aU,aCS:aCS});
    });

    // Sort by agentAvg descending (highest first)
    vhAgentData.sort(function(a, b){
      var avgA = a.agentAvg !== null ? a.agentAvg : -1;
      var avgB = b.agentAvg !== null ? b.agentAvg : -1;
      if (avgB !== avgA) return avgB - avgA;
      return a.name.localeCompare(b.name);
    });

    // VH separator row + rows
    html+=`<tr><td colspan="7" style="background:rgba(76,118,168,.07);border-top:2px solid var(--accent-blue);border-bottom:1px solid var(--navy-border);padding:.5rem 1rem;">
      <span style="font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent-blue);">📋 Vision Helpdesk (VH) — ${vhData.rows.length} response${vhData.rows.length!==1?'s':''}</span>
    </td></tr>`;

    vhAgentData.forEach(function(a){
      var isMe=a.name.toLowerCase()===myName;
      var isDsat=a.agentAvg!==null&&a.agentAvg<3&&showDsat;
      var rowCls=(isDsat?'csat-dsat-row ':'')+(isMe?'csat-my-row ':'');
      function sc(v){
        if(v===null) return '<td style="text-align:center;color:var(--text-dim);">—</td>';
        var rounded=Math.round(v);
        return '<td style="text-align:center;"><span class="cs-chip '+csatScoreCls(rounded)+'">'+v+'</span></td>';
      }
      var avgCell=a.agentAvg!==null
        ?`<td style="text-align:center;"><span class="cs-avg ${csatAvgCls(a.agentAvg)}">${a.agentAvg}</span></td>`
        :'<td style="text-align:center;color:var(--text-dim);">—</td>';
      html+=`<tr class="${rowCls}">
        <td style="font-weight:600;">${a.name}</td>
        <td style="font-family:monospace;font-size:.72rem;color:var(--accent-blue);font-weight:600;white-space:normal;line-height:1.7;">${a.allTickets||'—'}</td>
        ${sc(a.aK)}${sc(a.aTT)}${sc(a.aU)}${sc(a.aCS)}
        ${avgCell}
        <td style="max-width:200px;white-space:normal;font-size:.76rem;color:var(--text-muted);line-height:1.5;">${a.comments||'—'}</td>
      </tr>`;
    });
  }

  html+=`</tbody></table></div></div>`;
  return html;
}
// ─────────────────────────────────────────────────────────
// UPLOAD — bind file input + drag drop
// ─────────────────────────────────────────────────────────
function csatBindUpload(tab) {
  var inp=document.getElementById('csat-fi-'+tab);
  var zone=document.getElementById('csat-uz-'+tab);
  if (inp) inp.addEventListener('change',function(){ if(this.files[0]) csatReadFile(tab,this.files[0]); });
  if (zone) {
    zone.addEventListener('dragover',function(e){e.preventDefault();zone.classList.add('drag');});
    zone.addEventListener('dragleave',function(){zone.classList.remove('drag');});
    zone.addEventListener('drop',function(e){
      e.preventDefault();zone.classList.remove('drag');
      var f=e.dataTransfer.files[0]; if(f) csatReadFile(tab,f);
    });
  }
}

function csatReadFile(tab,file) {
  if (typeof XLSX==='undefined') { csatToast('⚠️ XLSX library not loaded'); return; }
  var reader=new FileReader();
  reader.onload=function(e){
    try {
      var data=new Uint8Array(e.target.result);
      var wb=XLSX.read(data,{type:'array',raw:false});
      var ws=wb.Sheets[wb.SheetNames[0]];
      var all=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});

      // Detect VH format: header row 1 contains INCIDENTHASH / OWNER / Respondent ID
      var isVH = all.length>0 && all[0].join('|').includes('INCIDENTHASH');

      var parsed;
      if (isVH) {
        // VH format: row 0=headers, row 1=type labels (skip), data from row 2
        parsed = csatParseVH(all);
      } else {
        // Standard CRM format
        var hdr=-1;
        for (var i=0;i<Math.min(all.length,20);i++){
          var str=all[i].join('|').toLowerCase();
          if ((str.includes('ticket')||str.includes('case'))&&(str.includes('customer')||str.includes('agent')||str.includes('owner'))){hdr=i;break;}
        }
        if (hdr===-1){
          for (var j=0;j<all.length;j++){
            if (all[j].filter(function(c){return String(c).trim()!=='';}).length>=3){hdr=j;break;}
          }
        }
        if (hdr===-1){csatToast('⚠️ Cannot detect header row. Check file.');return;}
        var headers=all[hdr];
        var jsonRows=all.slice(hdr+1).map(function(row){
          var obj={}; headers.forEach(function(h,i){if(String(h).trim()!=='') obj[h]=row[i]!==undefined?row[i]:'';});
          return obj;
        }).filter(function(obj){return Object.values(obj).some(function(v){return String(v).trim()!=='';});});
        parsed=csatParseRows(jsonRows,tab);
      }
      if (parsed.length===0){csatToast('⚠️ No valid records found. Check file format.');return;}

      var now=new Date().toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      CSAT_DATA[tab]={rows:parsed,uploadTime:now,fileName:file.name};
      csatRenderTab(tab);
      // If VH uploaded, also refresh Consumer tab so VH rows appear there
      if (tab==='vision' && CSAT_DATA['consumer']) csatRenderTab('consumer');
      csatToast('✅ '+parsed.length+' records loaded — '+tab);
    } catch(err){ csatToast('❌ Error: '+err.message); }
  };
  reader.readAsArrayBuffer(file);
}

// ─────────────────────────────────────────────────────────
// PARSE VH (Vision Helpdesk) FORMAT
// Row 0 = headers, Row 1 = type labels (skip), Row 2+ = data
// Col index (0-based): 9=Knowledge,10=TimeTaken,11=Helpful,13=Overall,14=Comments,16=Ticket,17=Agent
// ─────────────────────────────────────────────────────────
function csatParseVH(all) {
  var out=[];
  // data starts at row index 2 (skip header row 0 and type-label row 1)
  for (var i=2; i<all.length; i++) {
    var row=all[i];
    if (!row || row.filter(function(c){return String(c||'').trim()!=='';}).length===0) continue;
    var ticket  = String(row[16]||'').trim();  // INCIDENTHASH
    var agent   = String(row[17]||'').trim();  // OWNER
    var comment = String(row[14]||'').trim();  // Comments
    var knowledge         = String(row[9] ||'').trim();  // Knowledgeable
    var timeTaken         = String(row[10]||'').trim();  // Time taken
    var understandability = String(row[11]||'').trim();  // Helpful/understanding
    var customerService   = String(row[13]||'').trim();  // Overall support (col 14, skip product perf col 13)
    if (!ticket && !agent) continue;
    out.push({
      ticket:ticket, customer:'', agent:agent, account:'',
      date:'', vertical:'VH', product:'', comment:comment,
      isEnterprise:false,
      scores:{
        knowledge:        csatToScore(knowledge),
        timeTaken:        csatToScore(timeTaken),
        understandability:csatToScore(understandability),
        customerService:  csatToScore(customerService)
      }
    });
  }
  return out;
}

function csatParseRows(jsonRows, tab) {
  var out=[];
  jsonRows.forEach(function(row){
    var keys=Object.keys(row);
    function gc(searches){
      for (var si=0;si<searches.length;si++){
        var s=searches[si];
        if (row[s]!==undefined) return String(row[s]);
        var k=keys.find(function(k){return k.toLowerCase().includes(s.toLowerCase());});
        if (k!==undefined) return String(row[k]);
      }
      return '';
    }

    // ── Common fields ──
    var ticket   = gc(['Case Number','Ticket Number','Ticket ID','ticket']);
    var customer = gc(['Customer','customer_name','Client','Name']);
    var agent    = gc(['Case Owner','Agent','Owner','Representative','Engineer']);
    var vertical = gc(['Vertical Type','Vertical','vertical']);
    var product  = gc(['Product','product_name']);
    var comment  = gc(['Tell us more!','Comments:','Comments','Feedback','Remarks']);
    var date     = gc(['Survey Response Date','Response Date','Date']);
    var account  = gc(['Account(Company)','Account','Company','AccountName']);

    if (!ticket.trim()&&!agent.trim()) return;

    // ── Detect Enterprise vs Consumer by tab or vertical field ──
    var isEnterprise = (tab==='esp') ||
      (vertical.toLowerCase().includes('enterprise')) ||
      gc(['Knowledge and expertise','Knowledge and Expertise'])!=='';

    var scores;
    if (isEnterprise) {
      // Enterprise: 5 scored columns + NPS (excluded from avg)
      var knowledge        = gc(['Knowledge and expertise','Knowledge and Expertise']);
      var professionalism  = gc(['Professionalism and courteousness','Professionalism']);
      var followUp         = gc(['Follow-up and clear communication','Follow-up']);
      var timeResolved     = gc(['Time required to resolve','Time required']);
      var overallExp       = gc(['Overall support experience','Overall support','Overall']);
      scores = {
        knowledge:       csatToScore(knowledge),
        professionalism: csatToScore(professionalism),
        followUp:        csatToScore(followUp),
        timeResolved:    csatToScore(timeResolved),
        overallExp:      csatToScore(overallExp)
      };
    } else {
      // Consumer: 4 scored columns
      var knowledge2         = gc(['Knowledgeable and Competent','Knowledgeable','Knowledge']);
      var timeTaken          = gc(['time taken by the technical','Time taken','TimeTaken']);
      var understandability  = gc(['helpful and understanding','Helpful','Helpfulness','Understandab']);
      var customerService    = gc(['overall support experience','Overall','Customer service','Customer Service','Satisfaction']);
      scores = {
        knowledge:         csatToScore(knowledge2),
        timeTaken:         csatToScore(timeTaken),
        understandability: csatToScore(understandability),
        customerService:   csatToScore(customerService)
      };
    }

    out.push({
      ticket:ticket.trim(), customer:customer.trim(), agent:agent.trim(),
      account:account.trim(), date:date.trim(), vertical:vertical.trim(),
      product:product.trim(), comment:comment.trim(),
      isEnterprise:isEnterprise, scores:scores
    });
  });
  return out;
}

// ─────────────────────────────────────────────────────────
// FILTER & EXPORT
// ─────────────────────────────────────────────────────────
function csatFilter(q,tab) {
  q=q.toLowerCase().trim();
  var tbody=document.getElementById('csat-tbody-'+tab);
  if (!tbody) return;
  Array.from(tbody.querySelectorAll('tr')).forEach(function(r){
    r.style.display=(!q||r.textContent.toLowerCase().includes(q))?'':'none';
  });
}

function csatExportExcel(tab) {
  if (typeof XLSX==='undefined') { csatToast('XLSX not loaded'); return; }
  var data=CSAT_DATA[tab]; if (!data){csatToast('No data');return;}
  var agentMap={};
  data.rows.forEach(function(r){var k=r.agent||'Unknown';if(!agentMap[k])agentMap[k]=[];agentMap[k].push(r);});
  var out=[['Agent','Ticket ID','Customer','Knowledge','Time Taken','Understandability','Customer Service','Average','Comments']];
  var agentList = Object.keys(agentMap).map(function(name){
    var tix=agentMap[name];
    var trows=tix.map(function(t){
      var cols=[t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService];
      var valid=cols.filter(function(s){return s!==null;});
      return Object.assign({},t,{rowAvg:valid.length>0?+(valid.reduce(function(a,b){return a+b;},0)/valid.length).toFixed(2):''});
    });
    var allS=[];
    trows.forEach(function(t){[t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService].forEach(function(s){if(s!==null)allS.push(s);});});
    var agentAvg=allS.length>0?+(allS.reduce(function(a,b){return a+b;},0)/allS.length).toFixed(2):'';
    var comments=trows.map(function(t){return t.comment;}).filter(function(c){return c&&c.trim()!=='';}).join(' | ');
    return { name: name, trows: trows, agentAvg: agentAvg, comments: comments };
  });

  agentList.sort(function(a, b){
    var valA = a.agentAvg !== '' ? parseFloat(a.agentAvg) : -1;
    var valB = b.agentAvg !== '' ? parseFloat(b.agentAvg) : -1;
    if (valB !== valA) return valB - valA;
    return a.name.localeCompare(b.name);
  });

  var out=[['Agent','Ticket ID','Customer','Knowledge','Time Taken','Understandability','Customer Service','Average','Comments']];
  agentList.forEach(function(agent){
    var name = agent.name;
    var trows = agent.trows;
    var comments = agent.comments;
    trows.forEach(function(t,ti){
      out.push([ti===0?name:'',t.ticket,t.customer,
        t.scores.knowledge!==null?t.scores.knowledge:'',
        t.scores.timeTaken!==null?t.scores.timeTaken:'',
        t.scores.understandability!==null?t.scores.understandability:'',
        t.scores.customerService!==null?t.scores.customerService:'',
        t.rowAvg,ti===trows.length-1?comments:'']);
    });
    out.push([]);
  });
  var ws=XLSX.utils.aoa_to_sheet(out);
  ws['!cols']=[{wch:22},{wch:16},{wch:22},{wch:12},{wch:12},{wch:12},{wch:12},{wch:10},{wch:35},{wch:12}];
  var wb2=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2,ws,'CSAT');
  XLSX.writeFile(wb2,'CSAT_'+tab+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  csatToast('✅ Exported!');
}

// ─────────────────────────────────────────────────────────
// BUILD EMAIL HTML — plain table, dark navy header, only avg colored
// ─────────────────────────────────────────────────────────
function csatBuildEmailHTML() {
  var todayStr = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  var TH   = 'background:#1a2744;color:#ffffff;padding:8px 12px;text-align:center;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;border:1px solid #ffffff;white-space:nowrap;';
  var TD   = 'padding:7px 11px;text-align:center;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;white-space:nowrap;';
  var TDL  = 'padding:7px 11px;text-align:left;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;white-space:nowrap;';
  var TDTK = 'padding:7px 11px;text-align:left;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;white-space:normal;max-width:200px;';
  var TDCM = 'padding:7px 11px;text-align:left;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;white-space:normal;max-width:260px;';
  function renderAvgCell(avg) {
    if (avg === null || avg === undefined || avg === '') {
      return '<td style="padding:7px 11px;text-align:center;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;color:#666;vertical-align:middle;">—</td>';
    }
    var val = parseFloat(avg);
    var bg = val >= 4 ? '#90EE90' : val > 0 ? '#FFD700' : 'transparent';
    if (bg === 'transparent') {
      return '<td style="padding:7px 11px;text-align:center;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;color:#666;vertical-align:middle;">—</td>';
    }
    return '<td style="padding:0;text-align:center;font-family:Arial,sans-serif;font-size:13px;border:1px solid #d0d0d0;white-space:nowrap;vertical-align:middle;">' +
      '<div style="background-color:' + bg + ';padding:7px 11px;font-weight:bold;color:#000;">' + avg + '</div>' +
      '</td>';
  }
  function ca(arr){ var v=arr.filter(function(s){return s!==null;}); return v.length>0?+(v.reduce(function(a,b){return a+b;},0)/v.length).toFixed(2):null; }

  var html = '<div style="font-family:Arial,sans-serif;font-size:13px;color:#000;">';
  html += '<p>Hi Team,</p>';
  html += '<p>Please find the CSAT report for <strong>' + todayStr + '</strong> below.</p>';

  // ── CONSUMER + VH ──
  var conData = CSAT_DATA['consumer'];
  var vhData  = CSAT_DATA['vision'];
  if ((conData && conData.rows && conData.rows.length > 0) || (vhData && vhData.rows && vhData.rows.length > 0)) {
    html += '<p style="margin:20px 0 6px;"><strong>CONSUMER</strong></p>';
    html += '<table style="border-collapse:collapse;width:100%;">';
    html += '<tr><th style="' + TH + '">Names</th><th style="' + TH + '">Ticket id</th><th style="' + TH + '">Knowledge</th><th style="' + TH + '">Time taken</th><th style="' + TH + '">Understandability</th><th style="' + TH + '">Customer service</th><th style="' + TH + '">Comments</th><th style="' + TH + '">Average</th></tr>';

    function renderConsumerRows(rows, stripe) {
      var agentMap = {};
      rows.forEach(function(r){ var k=r.agent||'Unknown'; if(!agentMap[k]) agentMap[k]=[]; agentMap[k].push(r); });
      var list = Object.keys(agentMap).map(function(name) {
        var tix = agentMap[name];
        var aK=ca(tix.map(function(t){return t.scores.knowledge;}));
        var aTT=ca(tix.map(function(t){return t.scores.timeTaken;}));
        var aU=ca(tix.map(function(t){return t.scores.understandability;}));
        var aCS=ca(tix.map(function(t){return t.scores.customerService;}));
        var allV=[]; tix.forEach(function(t){[t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService].forEach(function(s){if(s!==null)allV.push(s);});});
        var avg = ca(allV.map(function(v){return v;}));
        var tickets  = tix.map(function(t){return t.ticket;}).filter(Boolean).join(', ');
        var comments = tix.map(function(t){return t.comment;}).filter(function(c){return c&&c.trim()!=='';}).join(' | ');
        return { name: name, aK: aK, aTT: aTT, aU: aU, aCS: aCS, avg: avg, tickets: tickets, comments: comments };
      });
      list.sort(function(a, b) {
        var valA = a.avg !== null ? a.avg : -1;
        var valB = b.avg !== null ? b.avg : -1;
        if (valB !== valA) return valB - valA;
        return a.name.localeCompare(b.name);
      });
      list.forEach(function(item, ni) {
        var bg = (stripe && ni%2===0) ? 'background:#f9f9f9;' : '';
        html += '<tr style="' + bg + '"><td style="' + TDL + '">' + item.name + '</td><td style="' + TDTK + '">' + item.tickets + '</td><td style="' + TD + '">' + (item.aK||'—') + '</td><td style="' + TD + '">' + (item.aTT||'—') + '</td><td style="' + TD + '">' + (item.aU||'—') + '</td><td style="' + TD + '">' + (item.aCS||'—') + '</td><td style="' + TDCM + '">' + (item.comments||'—') + '</td>' + renderAvgCell(item.avg) + '</tr>';
      });
    }

    if (conData && conData.rows && conData.rows.length > 0) renderConsumerRows(conData.rows, true);

    if (vhData && vhData.rows && vhData.rows.length > 0) {
      html += '<tr><td colspan="8" style="background:#1a2744;color:#ffffff;padding:5px 10px;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;border:1px solid #ffffff;">Vision Helpdesk (VH) — ' + vhData.rows.length + ' response' + (vhData.rows.length!==1?'s':'') + '</td></tr>';
      renderConsumerRows(vhData.rows, false);
    }
    html += '</table><br/>';
  }

  // ── ENTERPRISE (ESP) ──
  var espData = CSAT_DATA['esp'];
  if (espData && espData.rows && espData.rows.length > 0) {
    html += '<p style="margin:20px 0 6px;"><strong>ENTERPRISE (ESP)</strong></p>';
    html += '<table style="border-collapse:collapse;width:100%;">';
    html += '<tr><th style="' + TH + '">Ticket id</th><th style="' + TH + '">Account Name</th><th style="' + TH + '">Names</th><th style="' + TH + '">Knowledge and Expertise</th><th style="' + TH + '">Professionalism and courteousness</th><th style="' + TH + '">Follow-up and clear communication on solution</th><th style="' + TH + '">Time required to resolved</th><th style="' + TH + '">Overall support experience</th><th style="' + TH + '">Comments</th><th style="' + TH + '">Average</th></tr>';
    var espList = espData.rows.map(function(t) {
      var cols=[t.scores.knowledge,t.scores.professionalism,t.scores.followUp,t.scores.timeResolved,t.scores.overallExp];
      return { t: t, avg: ca(cols) };
    });
    espList.sort(function(a, b) {
      var valA = a.avg !== null ? a.avg : -1;
      var valB = b.avg !== null ? b.avg : -1;
      if (valB !== valA) return valB - valA;
      return (a.t.agent||'').localeCompare(b.t.agent||'');
    });
    espList.forEach(function(item, ti) {
      var t = item.t;
      var bg = ti%2===0 ? 'background:#f9f9f9;' : '';
      html += '<tr style="' + bg + '"><td style="' + TD + '">' + (t.ticket||'—') + '</td><td style="' + TDL + '">' + (t.account||t.customer||'—') + '</td><td style="' + TDL + '">' + (t.agent||'—') + '</td><td style="' + TD + '">' + (t.scores.knowledge||'—') + '</td><td style="' + TD + '">' + (t.scores.professionalism||'—') + '</td><td style="' + TD + '">' + (t.scores.followUp||'—') + '</td><td style="' + TD + '">' + (t.scores.timeResolved||'—') + '</td><td style="' + TD + '">' + (t.scores.overallExp||'—') + '</td><td style="' + TDCM + '">' + (t.comment||'—') + '</td>' + renderAvgCell(item.avg) + '</tr>';
    });
    html += '</table><br/>';
  }

  // ── LIVE CHAT ──
  var chatData = CSAT_DATA['chat'];
  if (chatData && chatData.rows && chatData.rows.length > 0) {
    html += '<p style="margin:20px 0 6px;"><strong>LIVE CHAT</strong></p>';
    html += '<table style="border-collapse:collapse;width:100%;">';
    html += '<tr><th style="' + TH + '">Names</th><th style="' + TH + '">Ticket id</th><th style="' + TH + '">Knowledge</th><th style="' + TH + '">Time taken</th><th style="' + TH + '">Understandability</th><th style="' + TH + '">Customer service</th><th style="' + TH + '">Comments</th><th style="' + TH + '">Average</th></tr>';
    var chatMap={};
    chatData.rows.forEach(function(r){var k=r.agent||'Unknown';if(!chatMap[k])chatMap[k]=[];chatMap[k].push(r);});
    var chatList = Object.keys(chatMap).map(function(name){
      var tix=chatMap[name];
      var aK=ca(tix.map(function(t){return t.scores.knowledge;}));
      var aTT=ca(tix.map(function(t){return t.scores.timeTaken;}));
      var aU=ca(tix.map(function(t){return t.scores.understandability;}));
      var aCS=ca(tix.map(function(t){return t.scores.customerService;}));
      var allV=[]; tix.forEach(function(t){[t.scores.knowledge,t.scores.timeTaken,t.scores.understandability,t.scores.customerService].forEach(function(s){if(s!==null)allV.push(s);});});
      var avg=ca(allV.map(function(v){return v;}));
      var tickets=tix.map(function(t){return t.ticket;}).filter(Boolean).join(', ');
      var comments=tix.map(function(t){return t.comment;}).filter(function(c){return c&&c.trim()!=='';}).join(' | ');
      return { name: name, aK: aK, aTT: aTT, aU: aU, aCS: aCS, avg: avg, tickets: tickets, comments: comments };
    });
    chatList.sort(function(a, b) {
      var valA = a.avg !== null ? a.avg : -1;
      var valB = b.avg !== null ? b.avg : -1;
      if (valB !== valA) return valB - valA;
      return a.name.localeCompare(b.name);
    });
    chatList.forEach(function(item,ni){
      var bg = ni%2===0 ? 'background:#f9f9f9;' : '';
      html += '<tr style="' + bg + '"><td style="' + TDL + '">' + item.name + '</td><td style="' + TDTK + '">' + item.tickets + '</td><td style="' + TD + '">' + (item.aK||'—') + '</td><td style="' + TD + '">' + (item.aTT||'—') + '</td><td style="' + TD + '">' + (item.aU||'—') + '</td><td style="' + TD + '">' + (item.aCS||'—') + '</td><td style="' + TDCM + '">' + (item.comments||'—') + '</td>' + renderAvgCell(item.avg) + '</tr>';
    });
    html += '</table><br/>';
  }

  html += '<p style="color:#666;font-size:12px;margin-top:16px;">Generated by K7TeamCore &nbsp;·&nbsp; ' + (currentUser?currentUser.name:'—') + '</p>';
  html += '</div>';
  return html;
}

// ─────────────────────────────────────────────────────────
// SEND EMAIL — copies formatted HTML, opens compose window
// ─────────────────────────────────────────────────────────
function csatSendEmail() {
  var emailHTML = csatBuildEmailHTML();
  var todayStr  = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  var subject   = 'C-Sat Report of ' + todayStr;

  function showModal() { csatShowEmailModal(subject); }

  try {
    var blob = new Blob([emailHTML], {type:'text/html'});
    var item = new ClipboardItem({'text/html': blob});
    navigator.clipboard.write([item]).then(showModal).catch(function(){
      navigator.clipboard.writeText(emailHTML).then(showModal).catch(showModal);
    });
  } catch(e) { showModal(); }
}

function csatShowEmailModal(subject) {
  var old = document.getElementById('_csat_email_modal');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = '_csat_email_modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(7,13,45,.6);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1.5rem;';
  overlay.innerHTML =
    '<div style="background:var(--navy-card);border:1px solid var(--navy-border);border-radius:16px;max-width:500px;width:100%;padding:2rem;box-shadow:0 24px 64px rgba(4,8,30,.4);">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">' +
    '<div style="font-family:\'Cormorant Garamond\',serif;font-size:1.3rem;font-weight:600;color:var(--text-primary);">&#128231; Send CSAT Report</div>' +
    '<button onclick="document.getElementById(\'_csat_email_modal\').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.2rem;">&#10005;</button>' +
    '</div>' +
    '<div style="background:rgba(46,197,111,.08);border:1px solid rgba(46,197,111,.25);border-radius:8px;padding:.85rem 1rem;margin-bottom:1.2rem;display:flex;align-items:center;gap:.75rem;">' +
    '<span style="font-size:1.2rem;">&#10003;</span>' +
    '<div><div style="font-size:.85rem;font-weight:600;color:#1a7a45;">Report HTML copied to clipboard!</div>' +
    '<div style="font-size:.76rem;color:var(--text-muted);margin-top:.2rem;">Open Gmail or Outlook → New compose → Paste (Ctrl+V / Cmd+V) → Table appears with colors.</div></div>' +
    '</div>' +
    '<div style="margin-bottom:1rem;">' +
    '<div style="font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:.35rem;font-weight:500;">Subject Line (copy separately)</div>' +
    '<div style="display:flex;gap:.5rem;">' +
    '<input id="_csat_email_subj" value="' + subject + '" style="flex:1;padding:.55rem .85rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:8px;color:var(--text-primary);font-family:\'DM Sans\',sans-serif;font-size:.875rem;outline:none;"/>' +
    '<button onclick="navigator.clipboard.writeText(document.getElementById(\'_csat_email_subj\').value)" style="padding:.5rem .9rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:8px;cursor:pointer;font-size:.78rem;color:var(--text-muted);">Copy</button>' +
    '</div></div>' +
    '<div style="font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:.5rem;font-weight:500;">Open email client</div>' +
    '<div style="display:flex;gap:.6rem;">' +
    '<button onclick="window.open(\'https://mail.google.com/mail/?view=cm&fs=1&to=\'+encodeURIComponent(CSAT_GROUP_EMAIL)+\'&su=\'+encodeURIComponent(document.getElementById(\'_csat_email_subj\').value),\'_blank\')" style="flex:1;padding:.65rem 1rem;background:linear-gradient(135deg,#EA4335,#c5221f);border:none;border-radius:8px;color:#fff;font-family:\'DM Sans\',sans-serif;font-size:.84rem;font-weight:600;cursor:pointer;">&#128231; Open Gmail</button>' +
    '<button onclick="window.open(\'https://outlook.live.com/mail/0/deeplink/compose?to=\'+encodeURIComponent(CSAT_GROUP_EMAIL)+\'&subject=\'+encodeURIComponent(document.getElementById(\'_csat_email_subj\').value),\'_blank\')" style="flex:1;padding:.65rem 1rem;background:linear-gradient(135deg,#0078d4,#005a9e);border:none;border-radius:8px;color:#fff;font-family:\'DM Sans\',sans-serif;font-size:.84rem;font-weight:600;cursor:pointer;">&#128231; Open Outlook</button>' +
    '</div>' +
    '<div style="font-size:.7rem;color:var(--text-dim);text-align:center;margin-top:.6rem;">Click to open compose → Ctrl+V to paste the table</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) overlay.remove(); });
}
// ─────────────────────────────────────────────────────────
// CONTROL DECK
// ─────────────────────────────────────────────────────────
function csatBuildControlCard() {
  var card=document.getElementById('cd-csat-card');
  if (!card) return;
  csatLoadSettings();
  card.innerHTML=`
    <div class="cd-card">
      <div class="cd-card-header">
        <span class="cd-card-icon" style="background:rgba(76,118,168,.12);font-size:1.1rem;">📊</span>
        <div><div class="cd-card-title">CSAT Reports</div>
        <div class="cd-card-sub">Control report visibility and upload access per agent</div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:.7rem;margin-top:1rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.7rem 1rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:var(--radius-sm);">
          <div><div style="font-size:.85rem;font-weight:600;color:var(--text-primary);">CSAT Page Visibility</div>
          <div style="font-size:.74rem;color:var(--text-muted);">Hide/show CSAT Reports page for all agents</div></div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span id="cd-csat-page-status" style="font-size:.78rem;color:var(--text-muted);">${CSAT_SETTINGS.pageVisible!==false?'ON':'OFF'}</span>
            <label class="cat-toggle-wrap"><input type="checkbox" id="cd-csat-page-toggle" ${CSAT_SETTINGS.pageVisible!==false?'checked':''} onchange="cdCsatPageToggle(this.checked)"/><span class="cat-toggle-slider"></span></label>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.7rem 1rem;background:var(--navy-hover);border:1px solid var(--navy-border);border-radius:var(--radius-sm);">
          <div><div style="font-size:.85rem;font-weight:600;color:var(--text-primary);">DSAT Section Visibility</div>
          <div style="font-size:.74rem;color:var(--text-muted);">Hide/show red DSAT warning section from agent view</div></div>
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span id="cd-csat-dsat-status" style="font-size:.78rem;color:var(--text-muted);">${CSAT_SETTINGS.dsatVisible!==false?'ON':'OFF'}</span>
            <label class="cat-toggle-wrap"><input type="checkbox" id="cd-csat-dsat-toggle" ${CSAT_SETTINGS.dsatVisible!==false?'checked':''} onchange="cdCsatDsatToggle(this.checked)"/><span class="cat-toggle-slider"></span></label>
          </div>
        </div>
        
        <!-- Per-agent list — collapsed by default -->
        <div style="margin-top:.9rem;border-top:1px solid var(--navy-border);padding-top:.9rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;" onclick="cdToggleAgentList('cd-csat-agents-wrap','cd-csat-agents-arrow')">
            <div style="font-size:.72rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;">UPLOAD ACCESS — PER AGENT</div>
            <div style="display:flex;align-items:center;gap:.5rem;">
              <span id="cd-csat-agents-count" style="font-size:.72rem;color:var(--text-dim);"></span>
              <span id="cd-csat-agents-arrow" style="font-size:.7rem;color:var(--gold);transition:transform .2s;transform:rotate(-90deg);">▼</span>
            </div>
          </div>
          <div id="cd-csat-agents-wrap" style="display:none;margin-top:.65rem;">
            <div id="cd-csat-upload-agents" style="display:flex;flex-direction:column;gap:.35rem;">
              <div style="color:var(--text-dim);font-size:.8rem;">Loading agents…</div>
            </div>
          </div>
        </div>
      </div>
      <div id="cd-csat-msg" class="cd-msg" style="display:none;margin-top:.5rem;"></div>
    </div>`;
  cdLoadCsatUploadAgents();
}

function cdCsatPageToggle(val) {
  csatLoadSettings(); CSAT_SETTINGS.pageVisible=val; csatSaveSettings();
  var st=document.getElementById('cd-csat-page-status'); if(st) st.textContent=val?'ON':'OFF';
  _csatCdMsg(val?'✅ CSAT page visible to agents':'⛔ CSAT page hidden from agents');
}
function cdCsatDsatToggle(val) {
  csatLoadSettings(); CSAT_SETTINGS.dsatVisible=val; csatSaveSettings();
  var st=document.getElementById('cd-csat-dsat-status'); if(st) st.textContent=val?'ON':'OFF';
  _csatCdMsg(val?'✅ DSAT section visible':'⛔ DSAT section hidden from agents');
}
function cdCsatUploadToggle(userId,val) {
  csatLoadSettings(); CSAT_SETTINGS.uploadAccess[userId]=val; csatSaveSettings();
  _csatCdMsg('✅ Upload access updated');
}
function _csatCdMsg(msg) {
  var m=document.getElementById('cd-csat-msg');
  if(m){m.textContent=msg;m.style.display='block';setTimeout(function(){m.style.display='none';},2500);}
}

async function cdLoadCsatUploadAgents() {
  var wrap=document.getElementById('cd-csat-upload-agents'); if(!wrap) return;
  csatLoadSettings();
  try {
    var agents=await sbQuery('users','select=id,name,role&order=name.asc');
    if (!agents||agents.length===0){wrap.innerHTML='<div style="color:var(--text-dim);font-size:.8rem;">No agents found.</div>';return;}
    
    var countEl = document.getElementById('cd-csat-agents-count');
    if(countEl) countEl.textContent = agents.length+' agent'+(agents.length!==1?'s':'');

    wrap.innerHTML=agents.map(function(u){
      var checked=CSAT_SETTINGS.uploadAccess[u.id]===true;
      return `<div class="cd-agent-row">
        <span class="cd-agent-name">${u.name} <span style="font-size:.66rem;color:var(--text-dim);">(${u.role})</span></span>
        <div style="display:flex;align-items:center;gap:.45rem;">
          <span style="font-size:.7rem;color:var(--text-muted);">Upload</span>
          <label class="cat-toggle-wrap" style="transform:scale(.85);">
            <input type="checkbox" ${checked?'checked':''} onchange="cdCsatUploadToggle('${u.id}',this.checked)"/>
            <span class="cat-toggle-slider"></span>
          </label>
        </div>
      </div>`;
    }).join('');
  } catch(e){ wrap.innerHTML='<div style="color:var(--text-dim);font-size:.8rem;">Could not load agents.</div>'; }
}

// ─────────────────────────────────────────────────────────
// HOOK INTO PORTAL showPage
// ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Wait for portal's showPage to be defined, then wrap it
  var _checkInterval = setInterval(function() {
    if (typeof window.showPage === 'function') {
      clearInterval(_checkInterval);
      var _orig = window.showPage;
      window.showPage = function(page, el) {
        _orig(page, el);
        if (page === 'csat') csatInit();
        if (page === 'controldeck') setTimeout(csatBuildControlCard, 150);
      };
    }
  }, 100);
});
