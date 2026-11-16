/* ═══════════════════════════════════════════════════════════════
   K7TeamCore — Teams Module
   Loaded by index.html via <script src="teams_module_patch.js">
   (must load BEFORE roster_planner_patch.js)

   ▸ Team registry (teams table): K7C · K7CS · SOC, editable in Control Deck
   ▸ Assign a team per user: Manage Users (dropdown per user) + Control Deck list
   ▸ People page: team tabs + colour tag on every card
   ▸ Exposes tmTeams() / tmTeamOf(userId) / tmMyTeam() / tmMembers(code)
     which the Roster Planner uses for team-scoped rosters.
═══════════════════════════════════════════════════════════════ */

var TM_DEFAULT_TEAMS = [
  { code: 'K7C',  name: 'K7 Computing',      company: 'K7 Computing',      color: '#C9352B', sort_order: 1, active: true },
  { code: 'K7CS', name: 'K7 Cyber Security', company: 'K7 Cyber Security', color: '#1E3A5F', sort_order: 2, active: true },
  { code: 'SOC',  name: 'SOC',               company: 'K7 Cyber Security', color: '#4C3A9E', sort_order: 3, active: true }
];
var TM_DEFAULT_CODE = 'K7C';

var TM = { teams: [], byCode: {}, assign: {}, names: {}, loaded: false, loadError: null, loading: null, filter: 'all' };

// ─────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────
function tmTeams() { return TM.teams.filter(function (t) { return t.active !== false; }); }
function tmTeam(code) { return TM.byCode[String(code || '').toUpperCase()] || null; }
function tmTeamOf(userId) { return TM.assign[String(userId)] || TM_DEFAULT_CODE; }
function tmTeamOfName(name) { var k = String(name || '').toLowerCase().trim(); return TM.names[k] || null; }
function tmMyTeam() { return currentUser ? tmTeamOf(currentUser.id) : TM_DEFAULT_CODE; }
function tmIsAdmin() { return !!currentUser && ['admin', 'superadmin', 'syslevel'].indexOf(String(currentUser.role || '').toLowerCase()) > -1; }
function tmEsc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }
function tmToast(m, ms) { if (typeof showToast === 'function') showToast(m, ms || 3000); else console.log('[Teams]', m); }
function tmLabel(code) { var t = tmTeam(code); return t ? t.name : code; }
function tmColor(code) { var t = tmTeam(code); return t ? t.color : '#64748B'; }
function tmTextOn(hex) { // white or dark text for a background
  var h = String(hex || '').replace('#', ''); if (h.length !== 6) return '#fff';
  var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#1F2937' : '#fff';
}
function tmChip(code, small) {
  var t = tmTeam(code); if (!t) return '';
  return '<span class="tm-chip' + (small ? ' tm-chip-sm' : '') + '" style="background:' + t.color + ';color:' + tmTextOn(t.color) + '" title="' + tmEsc(t.name + ' · ' + t.company) + '">' + tmEsc(t.code) + '</span>';
}
// Members of a team: [{id,name,role}] from the users table (loaded lazily)
async function tmMembers(code) {
  var users = await tmLoadUsers();
  code = String(code || '').toUpperCase();
  return users.filter(function (u) { return tmTeamOf(u.id) === code; });
}

// ─────────────────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────────────────
function tmLoad(force) {
  if (TM.loaded && !force) return Promise.resolve();
  if (TM.loading) return TM.loading;
  TM.loading = (async function () {
    try {
      var teams = await sbQuery('teams', 'select=code,name,company,color,sort_order,active&order=sort_order.asc,name.asc');
      if (!teams || !teams.length) {
        try { await sbInsert('teams', TM_DEFAULT_TEAMS); teams = TM_DEFAULT_TEAMS.slice(); } catch (e) { teams = TM_DEFAULT_TEAMS.slice(); }
      }
      TM.teams = teams; TM.byCode = {};
      teams.forEach(function (t) { TM.byCode[String(t.code).toUpperCase()] = t; });
      var rows = await sbQuery('user_teams', 'select=user_id,user_name,team_code');
      TM.assign = {}; TM.names = {};
      (rows || []).forEach(function (r) { TM.assign[String(r.user_id)] = String(r.team_code).toUpperCase(); if (r.user_name) TM.names[String(r.user_name).toLowerCase().trim()] = String(r.team_code).toUpperCase(); });
      TM.loadError = null;
    } catch (e) {
      TM.loadError = e.message; console.warn('[Teams] load failed (run teams_schema.sql?):', e.message);
      if (!TM.teams.length) { TM.teams = TM_DEFAULT_TEAMS.slice(); TM.teams.forEach(function (t) { TM.byCode[t.code] = t; }); }
    }
    TM.loaded = true; TM.loading = null;
  })();
  return TM.loading;
}
async function tmLoadUsers(force) {
  if (TM.users && !force) return TM.users;
  try {
    var u = await sbQuery('users', 'select=id,name,role&order=name.asc');
    TM.users = (u || []).filter(function (x) { return ['superadmin', 'syslevel'].indexOf(String(x.role || '').toLowerCase()) === -1 && x.name; });
  } catch (e) { TM.users = []; }
  return TM.users;
}
async function tmAssign(userId, userName, code) {
  code = String(code || '').toUpperCase();
  try {
    await sbUpsert('user_teams', { user_id: String(userId), user_name: userName || null, team_code: code, assigned_by: currentUser ? currentUser.name : null, assigned_at: new Date().toISOString() }, 'user_id');
    TM.assign[String(userId)] = code; if (userName) TM.names[String(userName).toLowerCase().trim()] = code;
    // keep people.team in sync so the People card's "role · team" line matches
    try { await sbUpdate('people', 'user_id', userId, { team: tmLabel(code) }); } catch (e) { }
    tmToast('✅ ' + (userName || 'User') + ' → ' + tmLabel(code));
    if (window._pplData && typeof pplRender === 'function') { try { pplRender(window._pplData); } catch (e) { } }
    return true;
  } catch (e) { tmToast('❌ Could not assign team: ' + e.message, 5000); return false; }
}

// ─────────────────────────────────────────────────────────
// MANAGE USERS — team dropdown per user card
// ─────────────────────────────────────────────────────────
function tmSelectHtml(userId, userName, cur, cls) {
  return '<select class="' + (cls || 'tm-select') + '" style="border-color:' + tmColor(cur) + '" onchange="tmAssign(\'' + tmEsc(userId) + '\',\'' + tmEsc(userName) + '\',this.value).then(function(ok){ if(ok) tmRestyleSelect(); })" data-user="' + tmEsc(userId) + '">' +
    tmTeams().map(function (t) { return '<option value="' + tmEsc(t.code) + '"' + (t.code === cur ? ' selected' : '') + '>' + tmEsc(t.name) + (t.company !== t.name ? ' · ' + tmEsc(t.company) : '') + '</option>'; }).join('') +
    '</select>';
}
function tmRestyleSelect() { document.querySelectorAll('.tm-select, .tm-cd-select').forEach(function (s) { s.style.borderColor = tmColor(s.value); }); }
async function tmDecorateUsersPage() {
  await tmLoad();
  document.querySelectorAll('#um-user-list .um-user-card').forEach(function (card) {
    if (card.querySelector('.tm-um-wrap')) return;
    var btn = card.querySelector('[data-id]'); if (!btn) return;
    var id = btn.getAttribute('data-id'), name = btn.getAttribute('data-name') || '';
    var info = card.querySelector('.um-user-info') || card;
    var wrap = document.createElement('div'); wrap.className = 'tm-um-wrap';
    wrap.innerHTML = '<span class="tm-um-lbl">Team</span>' + tmSelectHtml(id, name, tmTeamOf(id));
    info.appendChild(wrap);
  });
}

// ─────────────────────────────────────────────────────────
// PEOPLE PAGE — tabs + tags
// ─────────────────────────────────────────────────────────
function tmPersonTeam(p) {
  if (!p) return null;
  if (p.user_id && TM.assign[String(p.user_id)]) return TM.assign[String(p.user_id)];
  var byName = tmTeamOfName(p.name); if (byName) return byName;
  if (p.team) { var hit = tmTeams().find(function (t) { return String(p.team).toLowerCase() === t.name.toLowerCase() || String(p.team).toLowerCase() === t.code.toLowerCase(); }); if (hit) return hit.code; }
  return p.user_id ? TM_DEFAULT_CODE : null;
}
function tmDecoratePeople() {
  var grid = document.getElementById('ppl-grid'); if (!grid) return;
  var data = window._pplData || [];
  var byId = {}; data.forEach(function (p) { byId[String(p.id)] = p; });
  var counts = { all: 0 };
  grid.querySelectorAll('.ppl-card').forEach(function (card) {
    var m = (card.getAttribute('onclick') || '').match(/pplOpenProfile\('([^']+)'\)/);
    var p = m ? byId[m[1]] : null;
    var code = tmPersonTeam(p);
    card.setAttribute('data-team', code || '');
    counts.all++; if (code) counts[code] = (counts[code] || 0) + 1;
    var old = card.querySelector('.tm-card-tag'); if (old) old.remove();
    var oldTile = card.querySelector('.tm-hover-tile'); if (oldTile) oldTile.remove();
    card.style.borderTop = ''; card.classList.remove('tm-has-team');
    if (code) {
      var t = tmTeam(code);
      // quiet text line under the role: small colour square + team name (+ company when it differs)
      var line = document.createElement('div'); line.className = 'tm-card-tag';
      line.innerHTML = '<span class="tm-card-sq" style="background:' + t.color + '"></span><span class="tm-card-team">' + tmEsc(t.name) + (t.company && t.company !== t.name ? ' · ' + tmEsc(t.company) : '') + '</span>';
      var roleEl = card.querySelector('.ppl-card-role') || card.querySelector('.ppl-card-name');
      if (roleEl && roleEl.parentNode) roleEl.parentNode.insertBefore(line, roleEl.nextSibling); else card.appendChild(line);
    }
  });
  // Tabs
  var tabs = document.getElementById('tm-ppl-tabs');
  if (!tabs) { tabs = document.createElement('div'); tabs.id = 'tm-ppl-tabs'; tabs.className = 'tm-tabs'; grid.parentNode.insertBefore(tabs, grid); }
  var items = [{ code: 'all', name: 'All', color: '#070D2D' }].concat(tmTeams());
  tabs.innerHTML = items.map(function (t) {
    var on = TM.filter === t.code;
    return '<button class="tm-tab' + (on ? ' active' : '') + '" style="' + (on ? 'background:' + t.color + ';border-color:' + t.color + ';color:' + tmTextOn(t.color) : '') + '" onclick="tmSetFilter(\'' + tmEsc(t.code) + '\')">' +
      '<span class="tm-tab-dot" style="background:' + t.color + '"></span>' + tmEsc(t.name) + '<span class="tm-tab-n">' + (counts[t.code] || 0) + '</span></button>';
  }).join('');
  tmApplyFilter();
}
function tmSetFilter(code) { TM.filter = code; tmDecoratePeople(); }
function tmApplyFilter() {
  var grid = document.getElementById('ppl-grid'); if (!grid) return;
  grid.querySelectorAll('.ppl-card').forEach(function (card) {
    var hiddenBySearch = card.getAttribute('data-tm-search') === 'hide';
    var teamOk = TM.filter === 'all' || card.getAttribute('data-team') === TM.filter;
    card.style.display = (teamOk && !hiddenBySearch) ? '' : 'none';
  });
}

// ─────────────────────────────────────────────────────────
// CONTROL DECK CARD — teams editor + per-user assignment
// ─────────────────────────────────────────────────────────
async function tmBuildControlCard() {
  var card = document.getElementById('cd-teams-card'); if (!card) return;
  await tmLoad(true); var users = await tmLoadUsers(true);
  var rows = TM.teams.map(function (t, i) {
    return '<div class="tm-cd-row">' +
      '<input class="tm-cd-inp" style="width:64px" value="' + tmEsc(t.code) + '" placeholder="Code" ' + (t._new ? '' : 'readonly') + ' onchange="tmCdEdit(' + i + ',\'code\',this.value)">' +
      '<input class="tm-cd-inp" style="flex:1" value="' + tmEsc(t.name) + '" placeholder="Team name" onchange="tmCdEdit(' + i + ',\'name\',this.value)">' +
      '<input class="tm-cd-inp" style="flex:1" value="' + tmEsc(t.company) + '" placeholder="Company" list="tm-companies" onchange="tmCdEdit(' + i + ',\'company\',this.value)">' +
      '<input type="color" class="tm-cd-color" value="' + tmEsc(t.color) + '" onchange="tmCdEdit(' + i + ',\'color\',this.value)">' +
      '<label class="tm-cd-active" title="Active"><input type="checkbox" ' + (t.active !== false ? 'checked' : '') + ' onchange="tmCdEdit(' + i + ',\'active\',this.checked)"> on</label>' +
      '</div>';
  }).join('');
  var counts = {}; users.forEach(function (u) { var c = tmTeamOf(u.id); counts[c] = (counts[c] || 0) + 1; });
  var summary = tmTeams().map(function (t) { return tmChip(t.code, true) + ' ' + (counts[t.code] || 0); }).join(' &nbsp; ');
  var ulist = users.map(function (u) {
    return '<div class="cd-agent-row"><span class="cd-agent-name">' + tmEsc(u.name) + ' <span style="font-size:.66rem;color:var(--text-dim);">(' + tmEsc(u.role) + ')</span></span>' +
      tmSelectHtml(u.id, u.name, tmTeamOf(u.id), 'tm-cd-select') + '</div>';
  }).join('');
  card.innerHTML =
    '<div class="cd-card"><div class="cd-card-header"><span class="cd-card-icon" style="background:rgba(30,58,95,.12);font-size:1.1rem;">🏷️</span>' +
    '<div><div class="cd-card-title">Teams</div><div class="cd-card-sub">Two companies, three teams. Each team has its own roster; the tag shows on People and Manage Users.</div></div></div>' +
    (TM.loadError ? '<div class="cd-msg" style="display:block;margin-top:.6rem;color:var(--accent-red);">Teams tables not found — run <code>teams_schema.sql</code>. (' + tmEsc(TM.loadError) + ')</div>' : '') +
    '<div style="margin-top:1rem;"><div style="font-size:.72rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;margin-bottom:.5rem;">TEAMS &amp; COMPANIES</div>' +
    '<datalist id="tm-companies"><option value="K7 Computing"></option><option value="K7 Cyber Security"></option></datalist>' +
    '<div id="tm-cd-rows" style="display:flex;flex-direction:column;gap:.35rem;">' + rows + '</div>' +
    '<div style="display:flex;gap:.5rem;margin-top:.6rem;flex-wrap:wrap;"><button class="rp-btn" onclick="tmCdAdd()">+ Add team</button><button class="rp-btn rp-btn-primary" onclick="tmCdSave()">Save teams</button></div></div>' +
    '<div style="margin-top:1rem;border-top:1px solid var(--navy-border);padding-top:.9rem;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;" onclick="cdToggleAgentList(\'tm-cd-users-wrap\',\'tm-cd-users-arrow\')">' +
    '<div style="font-size:.72rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;">ASSIGN TEAM — PER USER</div>' +
    '<div style="display:flex;align-items:center;gap:.6rem;"><span style="font-size:.72rem;color:var(--text-dim);">' + summary + '</span><span id="tm-cd-users-arrow" style="font-size:.7rem;color:var(--gold);transition:transform .2s;transform:rotate(-90deg);">▼</span></div></div>' +
    '<div id="tm-cd-users-wrap" style="display:none;margin-top:.65rem;"><div style="font-size:.72rem;color:var(--text-dim);margin-bottom:.5rem;">Users without an assignment count as <b>' + tmEsc(tmLabel(TM_DEFAULT_CODE)) + '</b>.</div>' +
    '<div style="display:flex;flex-direction:column;gap:.35rem;">' + (ulist || '<div style="color:var(--text-dim);font-size:.8rem;">No users found.</div>') + '</div></div></div>' +
    '<div id="tm-cd-msg" class="cd-msg" style="display:none;margin-top:.5rem;"></div></div>';
}
function tmCdEdit(i, f, v) { if (TM.teams[i]) TM.teams[i][f] = (f === 'code' ? String(v).trim().toUpperCase() : v); }
function tmCdAdd() { TM.teams.push({ code: '', name: '', company: 'K7 Cyber Security', color: '#2A9D8F', sort_order: TM.teams.length + 1, active: true, _new: true }); tmBuildControlCardRows(); }
function tmBuildControlCardRows() { tmBuildControlCard(); }
async function tmCdSave() {
  var payload = TM.teams.filter(function (t) { return t.code && t.name; }).map(function (t, i) { return { code: t.code, name: t.name, company: t.company || '', color: t.color || '#4C76A8', sort_order: i + 1, active: t.active !== false }; });
  try { await sbUpsert('teams', payload, 'code'); await tmLoad(true); tmToast('✅ Teams saved'); tmBuildControlCard(); }
  catch (e) { tmToast('❌ ' + e.message, 5000); }
}

// ─────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────
(function tmInstallHooks() {
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (typeof window.showPage !== 'function') { if (tries > 300) clearInterval(iv); return; }
    clearInterval(iv);

    var _showPage = window.showPage;
    window.showPage = function (page, el) {
      _showPage(page, el);
      if (page === 'controldeck') setTimeout(tmBuildControlCard, 250);
      if (page === 'users') setTimeout(tmDecorateUsersPage, 400);
      if (page === 'people') tmLoad().then(function () { setTimeout(tmDecoratePeople, 300); });
    };
    if (typeof window.loadUsersPage === 'function') {
      var _lup = window.loadUsersPage;
      window.loadUsersPage = async function () { var r = await _lup.apply(this, arguments); tmDecorateUsersPage(); return r; };
    }
    if (typeof window.pplRender === 'function') {
      var _ppr = window.pplRender;
      window.pplRender = function (people) { var r = _ppr.apply(this, arguments); tmLoad().then(tmDecoratePeople); return r; };
    }
    if (typeof window.pplFilter === 'function') {
      var _ppf = window.pplFilter;
      window.pplFilter = function (search) {
        var r = _ppf.apply(this, arguments);
        // remember what the search hid, then re-apply the team filter on top
        document.querySelectorAll('#ppl-grid .ppl-card').forEach(function (c) { c.setAttribute('data-tm-search', c.style.display === 'none' ? 'hide' : ''); });
        tmApplyFilter(); return r;
      };
    }
    tmLoad();
  }, 100);
})();
