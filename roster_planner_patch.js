/* ═══════════════════════════════════════════════════════════════
   K7TeamCore — Roster Planner Module
   Loaded by index.html via <script src="roster_planner_patch.js">
   Edit freely. Never touch index.html for roster-planner changes.

   WHAT IT DOES
   ▸ Admin/TL "Roster Planner" page: paint-grid month planner
     (Option A) with weekly-pattern, copy-previous-month and
     auto-week-off shortcuts, Draft → Release flow, Excel export.
   ▸ Stores rosters in roster_months / roster_entries (see roster_schema.sql).
   ▸ Feeds RELEASED months into the existing roster pipeline in the
     exact row shape the Google-Sheet CSV produced, so the roster page,
     home banner, "My shift" card, week view and timesheet keep working.
     Months without a DB roster still fall back to the Google Sheet.
   ▸ Control Deck card: shift codes/colours, who may plan, coverage alarm.
   ▸ TEAM-SCOPED: one roster per team (K7C / K7CS / SOC) via teams_module_patch.js.
     Keys are '<TEAM>|YYYY-MM'. Agents see their own team's released roster.
═══════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────
// CONSTANTS & STATE
// ─────────────────────────────────────────────────────────
var RP_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var RP_MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var RP_DOW          = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Codes the EXISTING roster parser understands specially. Keep these codes as-is.
//   WO → Off · WFH → Work from home · HL → Half day · L / CO → Leave
// Any other code is shown as a working shift with the code as its label.
var RP_DEFAULT_SHIFTS = [
  { code:'S1',  label:'Morning',        time:'07:00 – 16:00', bg:'#F2C94C', fg:'#3B2A00', kind:'work'  },
  { code:'S2',  label:'General',        time:'09:00 – 18:00', bg:'#4C76A8', fg:'#FFFFFF', kind:'work'  },
  { code:'S3',  label:'Afternoon',      time:'13:00 – 22:00', bg:'#2A9D8F', fg:'#FFFFFF', kind:'work'  },
  { code:'N',   label:'Night',          time:'22:00 – 07:00', bg:'#1F2937', fg:'#FFFFFF', kind:'night' },
  { code:'WO',  label:'Week off',       time:'',              bg:'#D1D9E4', fg:'#374151', kind:'off'   },
  { code:'WFH', label:'Work from home', time:'',              bg:'#8B6BD1', fg:'#FFFFFF', kind:'work'  },
  { code:'HL',  label:'Half day',       time:'',              bg:'#E65100', fg:'#FFFFFF', kind:'half'  },
  { code:'L',   label:'Leave',          time:'',              bg:'#EF493C', fg:'#FFFFFF', kind:'leave' },
  { code:'CO',  label:'Comp off',       time:'',              bg:'#B91C1C', fg:'#FFFFFF', kind:'leave' }
];

var RP_SETTINGS = {
  enabled: true,            // use DB roster (falls back to sheet per month anyway)
  tlCanPlan: true,          // TLs may open the planner
  tlOwnTeamOnly: true,      // TLs plan only their own team; admins plan every team
  minCoverage: 4,           // coverage row turns red below this many working agents
  shifts: RP_DEFAULT_SHIFTS.slice()
};

var RP = {
  months: {},        // 'YYYY-MM' → { year, month, status, released_at, released_by, updated_at }
  entries: {},       // 'YYYY-MM' → [ { agent_name, user_id, emp_id, sort_order, days:[31] } ]
  loaded: false,
  key: null,         // currently open planner month 'YYYY-MM'
  team: null,        // team being planned (code)
  viewTeam: null,    // team whose released roster the Roster page shows
  rosterView: null,  // 'my' | 'team' on the Roster page
  archiveOpen: false,
  lastRows: null,    // rows last handed to the roster page (DB or sheet)
  brush: null,       // selected shift code ('' = eraser)
  dirty: {},         // agent_name → true (unsaved)
  saveTimer: null,
  painting: false,
  paintCode: null,
  users: null
};

// ─────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────
function rpKey(y, m) { return y + '-' + (m < 10 ? '0' + m : m); }
// ── team-scoped storage helpers ──
function rpDefaultTeam() { return (typeof TM_DEFAULT_CODE !== 'undefined') ? TM_DEFAULT_CODE : 'K7C'; }
function rpTeamsList() { return (typeof tmTeams === 'function') ? tmTeams() : [{ code: rpDefaultTeam(), name: rpDefaultTeam(), color: '#C9352B' }]; }
function rpTeamName(code) { return (typeof tmLabel === 'function') ? tmLabel(code) : code; }
function rpTeamColor(code) { return (typeof tmColor === 'function') ? tmColor(code) : '#C9352B'; }
function rpMyTeam() { return (typeof tmMyTeam === 'function') ? tmMyTeam() : rpDefaultTeam(); }
function rpTeamsLoad() { return (typeof tmLoad === 'function') ? tmLoad() : Promise.resolve(); }
function rpMK(k, team) { return (team || RP.team || rpDefaultTeam()) + '|' + k; }
function rpM(k, team) { return RP.months[rpMK(k, team)]; }
function rpSetM(k, m) { RP.months[rpMK(k)] = m; }
function rpE(k, team) { var mk = rpMK(k, team); if (!RP.entries[mk]) RP.entries[mk] = []; return RP.entries[mk]; }
function rpSetE(k, arr) { RP.entries[rpMK(k)] = arr; }
function rpMonthKeys(team) { team = team || RP.team; return Object.keys(RP.months).filter(function (mk) { return mk.split('|')[0] === team; }).map(function (mk) { return mk.split('|')[1]; }).sort(); }
// which teams may this user plan?
function rpPlannableTeams() {
  var all = rpTeamsList();
  if (rpIsAdmin() || RP_SETTINGS.tlOwnTeamOnly === false) return all;
  var mine = rpMyTeam(); return all.filter(function (t) { return t.code === mine; });
}
function rpParseKey(k) { var p = k.split('-'); return { year: +p[0], month: +p[1] }; }
function rpDaysIn(y, m) { return new Date(y, m, 0).getDate(); } // m = 1..12
function rpEsc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function rpToast(msg, ms) {
  if (typeof showToast === 'function') { showToast(msg, ms || 3000); return; }
  if (typeof csatToast === 'function') { csatToast(msg); return; }
  console.log('[Roster]', msg);
}
function rpRole() { return currentUser ? String(currentUser.role || '').toLowerCase() : ''; }
function rpIsAdmin() { return ['admin', 'superadmin', 'syslevel'].indexOf(rpRole()) > -1; }
function rpCanPlan() { return rpIsAdmin() || (rpRole() === 'tl' && RP_SETTINGS.tlCanPlan !== false); }
function rpShift(code) {
  code = String(code || '').toUpperCase();
  for (var i = 0; i < RP_SETTINGS.shifts.length; i++) if (RP_SETTINGS.shifts[i].code.toUpperCase() === code) return RP_SETTINGS.shifts[i];
  return null;
}
function rpKind(code) {
  var s = rpShift(code); if (s) return s.kind;
  var u = String(code || '').toUpperCase();
  if (!u) return 'empty';
  if (u === 'WO') return 'off';
  if (u.indexOf('WFH') > -1) return 'work';
  if (u.indexOf('HL') > -1) return 'half';
  if (/^(L|CO|W|EO|CL|SL|PL|ML)$/.test(u)) return 'leave';
  return 'work';
}
function rpChipStyle(code) {
  var s = rpShift(code);
  if (s) return 'background:' + s.bg + ';color:' + s.fg + ';';
  if (!code) return '';
  return 'background:#94A3B8;color:#fff;';
}
function rpNow() { return new Date().toISOString(); }
function rpTodayKey() { var d = new Date(); return rpKey(d.getFullYear(), d.getMonth() + 1); }
function rpNextKey(k) { var p = rpParseKey(k); var m = p.month + 1, y = p.year; if (m > 12) { m = 1; y++; } return rpKey(y, m); }
function rpPrevKey(k) { var p = rpParseKey(k); var m = p.month - 1, y = p.year; if (m < 1) { m = 12; y--; } return rpKey(y, m); }
function rpLabel(k) { var p = rpParseKey(k); return RP_MONTHS_SHORT[p.month - 1] + ' ' + p.year; }
function rpLabelLong(k) { var p = rpParseKey(k); return RP_MONTHS_LONG[p.month - 1] + ' ' + p.year; }
function rpFmtTs(ts) { try { return new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ts || ''; } }

// ─────────────────────────────────────────────────────────
// SETTINGS (settings table, key = roster_planner_settings)
// ─────────────────────────────────────────────────────────
async function rpLoadSettings() {
  try {
    var rows = await sbQuery('settings', 'key=eq.roster_planner_settings&select=value&limit=1');
    if (rows && rows[0] && rows[0].value) {
      var v = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      RP_SETTINGS = Object.assign({}, RP_SETTINGS, v || {});
      if (!Array.isArray(RP_SETTINGS.shifts) || !RP_SETTINGS.shifts.length) RP_SETTINGS.shifts = RP_DEFAULT_SHIFTS.slice();
    }
  } catch (e) { /* table may not have the key yet — defaults apply */ }
  try { localStorage.setItem('rp_settings_cache', JSON.stringify(RP_SETTINGS)); } catch (e) { }
}
function rpLoadSettingsCache() {
  try { var s = localStorage.getItem('rp_settings_cache'); if (s) RP_SETTINGS = Object.assign({}, RP_SETTINGS, JSON.parse(s)); } catch (e) { }
}
async function rpSaveSettings() {
  var val = JSON.stringify(RP_SETTINGS);
  try {
    var ex = await sbQuery('settings', 'key=eq.roster_planner_settings&select=key');
    if (ex && ex.length) await sbUpdate('settings', 'key', 'roster_planner_settings', { value: val });
    else await sbInsert('settings', { key: 'roster_planner_settings', value: val });
    try { localStorage.setItem('rp_settings_cache', val); } catch (e) { }
    return true;
  } catch (e) { rpToast('❌ Could not save roster settings: ' + e.message); return false; }
}

// ─────────────────────────────────────────────────────────
// DATA — months & entries
// ─────────────────────────────────────────────────────────
async function rpLoadAll(force) {
  if (RP.loaded && !force) return;
  try {
    var months = await sbQuery('roster_months', 'select=id,team,year,month,status,released_at,released_by,updated_at,updated_by&order=year.asc,month.asc');
    var entries = await sbQuery('roster_entries', 'select=team,year,month,user_id,agent_name,emp_id,sort_order,days&order=year.asc,month.asc,sort_order.asc,agent_name.asc');
    RP.months = {}; RP.entries = {};
    (months || []).forEach(function (m) { m.team = String(m.team || rpDefaultTeam()).toUpperCase(); RP.months[m.team + '|' + rpKey(m.year, m.month)] = m; });
    (entries || []).forEach(function (e) {
      var mk = String(e.team || rpDefaultTeam()).toUpperCase() + '|' + rpKey(e.year, e.month);
      if (!RP.entries[mk]) RP.entries[mk] = [];
      var days = Array.isArray(e.days) ? e.days.slice() : [];
      while (days.length < 31) days.push('');
      RP.entries[mk].push({ agent_name: e.agent_name, user_id: e.user_id, emp_id: e.emp_id || '', sort_order: e.sort_order || 0, days: days });
    });
    RP.loaded = true;
  } catch (e) {
    console.warn('[Roster] load failed (run roster_schema.sql?):', e.message);
    RP.loaded = true; // don't retry on every call
    RP.loadError = e.message;
  }
}

function rpMonthVisibleToViewer(k, team) {
  var m = rpM(k, team);
  if (!m) return false;
  return m.status === 'released';
}

// Build rows in the SAME shape the Google-Sheet CSV produced, so every
// existing consumer (renderRosterPage, loadMyShift, banner, timesheet) just works.
function rpBuildSheetRows(k, team) {
  var p = rpParseKey(k), n = rpDaysIn(p.year, p.month);
  var list = rpE(k, team).slice().sort(function (a, b) { return (a.sort_order - b.sort_order) || a.agent_name.localeCompare(b.agent_name); });
  var rows = [];
  rows.push(['', RP_MONTHS_SHORT[p.month - 1] + ' - ' + p.year]);
  var dateRow = ['EMP ID', 'DATE'], dayRow = ['', 'DAY'];
  for (var d = 1; d <= n; d++) { dateRow.push(String(d)); dayRow.push(RP_DOW[new Date(p.year, p.month - 1, d).getDay()]); }
  rows.push(dateRow); rows.push(dayRow);
  list.forEach(function (e) {
    var r = [e.emp_id || '', e.agent_name];
    for (var i = 0; i < n; i++) r.push(e.days[i] || '');
    rows.push(r);
  });
  return rows;
}

// Register released months with the existing roster machinery:
//   ROSTER_MONTHS[key].customUrl = 'db://roster/YYYY-MM'  → month tab appears
//   _rosterDataCache[url] = rows                           → loadRosterData/loadMyShift/timesheet read it
function rpPublishToPipeline() {
  if (RP_SETTINGS.enabled === false) return;
  if (typeof window.ROSTER_MONTHS === 'undefined') return;
  if (!window._rosterDataCache) window._rosterDataCache = {};
  var team = RP.viewTeam || rpMyTeam();
  // drop any slot that belongs to another team's roster
  Object.keys(window.ROSTER_MONTHS).forEach(function (short) {
    var c = window.ROSTER_MONTHS[short];
    if (c && c.dbKey && c.dbTeam !== team) { delete c.customUrl; delete c.dbKey; delete c.dbTeam; }
  });
  rpMonthKeys(team).forEach(function (k) {
    if (!rpMonthVisibleToViewer(k, team)) return;
    var p = rpParseKey(k), short = RP_MONTHS_SHORT[p.month - 1];
    var url = 'db://roster/' + team + '/' + k;
    var rows = rpBuildSheetRows(k, team);
    // Far-future timestamp so the TTL check in loadRosterData always treats it as fresh
    window._rosterDataCache[url] = { rows: rows, timestamp: Date.now() + 1e12, db: true };
    if (!window.ROSTER_MONTHS[short]) window.ROSTER_MONTHS[short] = { label: short + ' ' + p.year, gid: '' };
    // Only override the month slot if it's the same or a later year than the one already there
    var existing = window.ROSTER_MONTHS[short];
    var exYear = (existing.label.match(/(\d{4})/) || [])[1];
    if (!exYear || +exYear <= p.year) {
      existing.customUrl = url; existing.label = short + ' ' + p.year; existing.dbKey = k; existing.dbTeam = team;
    }
  });
}

// ─────────────────────────────────────────────────────────
// AGENT LIST
// ─────────────────────────────────────────────────────────
async function rpLoadUsers() {
  if (RP.users) return RP.users;
  try {
    var u = await sbQuery('users', 'select=id,name,role&order=name.asc');
    RP.users = (u || []).filter(function (x) { return ['superadmin', 'syslevel'].indexOf(String(x.role || '').toLowerCase()) === -1 && x.name; });
  } catch (e) { RP.users = []; }
  return RP.users;
}

// ─────────────────────────────────────────────────────────
// PLANNER PAGE — INIT
// ─────────────────────────────────────────────────────────
async function rpInit() {
  var page = document.getElementById('page-rosterplan');
  if (!page) return;
  if (!currentUser || !rpCanPlan()) {
    page.innerHTML = '<div class="placeholder-page"><h2>Roster Planner</h2><p>You don\'t have access to plan rosters.</p></div>';
    return;
  }
  page.innerHTML = '<div class="rp-page"><div class="rp-loading">Loading roster planner…</div></div>';
  await rpLoadSettings();
  await rpTeamsLoad();
  await rpLoadAll(true);
  await rpLoadUsers();
  // team: keep the one already open if still allowed, else my team, else the first plannable
  var allowed = rpPlannableTeams();
  if (!allowed.length) { page.innerHTML = '<div class="rp-page"><div class="rp-empty"><div class="rp-empty-title">No team to plan</div><div class="rp-empty-sub">Ask an admin to assign you to a team.</div></div></div>'; return; }
  if (!RP.team || !allowed.some(function (t) { return t.code === RP.team; })) {
    var mine = rpMyTeam();
    RP.team = allowed.some(function (t) { return t.code === mine; }) ? mine : allowed[0].code;
  }

  if (RP.loadError) {
    page.innerHTML = '<div class="rp-page"><div class="rp-empty"><div class="rp-empty-title">Roster tables not found</div>' +
      '<div class="rp-empty-sub">Run <code>roster_schema.sql</code> on the primary database, then reopen this page.<br><span style="opacity:.7">' + rpEsc(RP.loadError) + '</span></div></div></div>';
    return;
  }

  // Default month: next month if it exists or can be created, else current
  var keys = rpMonthKeys();
  var next = rpNextKey(rpTodayKey());
  RP.key = rpM(next) ? next : (rpM(rpTodayKey()) ? rpTodayKey() : (keys.length ? keys[keys.length - 1] : next));
  if (!rpM(RP.key)) await rpCreateMonth(RP.key, true);
  if (!RP.brush) RP.brush = (RP_SETTINGS.shifts[0] || {}).code || '';
  rpRender();
}

async function rpCreateMonth(k, silent) {
  var p = rpParseKey(k);
  try {
    var r = await sbUpsert('roster_months', { team: RP.team, year: p.year, month: p.month, status: 'draft', updated_by: currentUser ? currentUser.name : null }, 'team,year,month');
    rpSetM(k, (r && r[0]) || { team: RP.team, year: p.year, month: p.month, status: 'draft' });
    var cur = rpE(k);
    // Seed agent list: previous month's agents (same team) if present, else this team's members
    if (!cur.length) {
      var prev = RP.entries[rpMK(rpPrevKey(k))];
      var n = rpDaysIn(p.year, p.month);
      if (prev && prev.length) {
        prev.forEach(function (e) { cur.push({ agent_name: e.agent_name, user_id: e.user_id, emp_id: e.emp_id, sort_order: e.sort_order, days: rpBlank(n) }); });
      } else {
        var members = (typeof tmMembers === 'function') ? await tmMembers(RP.team) : (RP.users || []);
        members.forEach(function (u, i) { cur.push({ agent_name: u.name, user_id: String(u.id), emp_id: '', sort_order: i, days: rpBlank(n) }); });
      }
      cur.forEach(function (e) { RP.dirty[e.agent_name] = true; });
      if (cur.length) await rpSaveNow(k);
    }
    if (!silent) rpToast('🗓️ ' + rpTeamName(RP.team) + ' · ' + rpLabelLong(k) + ' draft created');
  } catch (e) { rpToast('❌ Could not create month: ' + e.message); }
}
function rpBlank(n) { var a = []; for (var i = 0; i < 31; i++) a.push(''); return a; }

// ─────────────────────────────────────────────────────────
// PLANNER PAGE — RENDER
// ─────────────────────────────────────────────────────────
function rpRender() {
  var page = document.getElementById('page-rosterplan');
  if (!page) return;
  var k = RP.key, m = rpM(k), p = rpParseKey(k), n = rpDaysIn(p.year, p.month);
  var list = rpE(k).slice().sort(function (a, b) { return (a.sort_order - b.sort_order) || a.agent_name.localeCompare(b.agent_name); });
  var released = m && m.status === 'released';
  var today = new Date();
  var isCurMonth = today.getFullYear() === p.year && (today.getMonth() + 1) === p.month;

  // Month tabs: every DB month + "+ next"
  var mkeys = rpMonthKeys();
  var lastKey = mkeys.length ? mkeys[mkeys.length - 1] : rpTodayKey();
  var addKey = rpNextKey(lastKey);
  var tabs = mkeys.map(function (mk) {
    var mm = rpM(mk);
    return '<button class="rp-mtab' + (mk === k ? ' active' : '') + (mm.status === 'released' ? ' released' : ' draft') + '" onclick="rpSwitchMonth(\'' + mk + '\')">' +
      rpLabel(mk) + '<span class="rp-mtab-st">' + (mm.status === 'released' ? 'Released' : 'Draft') + '</span></button>';
  }).join('');
  tabs += '<button class="rp-mtab rp-mtab-add" onclick="rpAddMonth(\'' + addKey + '\')">+ Plan ' + rpLabel(addKey) + '</button>';

  // Brush palette
  var brushes = RP_SETTINGS.shifts.map(function (s) {
    return '<button class="rp-brush' + (RP.brush === s.code ? ' active' : '') + '" onclick="rpSetBrush(\'' + rpEsc(s.code) + '\')" title="' + rpEsc(s.label + (s.time ? ' · ' + s.time : '')) + '">' +
      '<span class="rp-chip" style="' + rpChipStyle(s.code) + '">' + rpEsc(s.code) + '</span>' +
      '<span class="rp-brush-txt"><span>' + rpEsc(s.label) + '</span><small>' + rpEsc(s.time || '—') + '</small></span></button>';
  }).join('');
  brushes += '<button class="rp-brush rp-brush-erase' + (RP.brush === '' ? ' active' : '') + '" onclick="rpSetBrush(\'\')"><span class="rp-chip rp-chip-empty">—</span><span class="rp-brush-txt"><span>Clear</span><small>unassign</small></span></button>';

  // Header cells
  var th = '<th class="rp-th-agent">Agent</th>';
  for (var d = 1; d <= n; d++) {
    var dow = new Date(p.year, p.month - 1, d).getDay(), we = dow === 0 || dow === 6;
    var isToday = isCurMonth && d === today.getDate();
    th += '<th class="rp-th-day' + (we ? ' we' : '') + (isToday ? ' today' : '') + '"><span class="rp-th-dow">' + RP_DOW[dow].slice(0, 2).toUpperCase() + '</span><span class="rp-th-num">' + d + '</span></th>';
  }
  th += '<th class="rp-th-sum">Summary</th>';

  // Rows
  var coverage = []; for (var i = 0; i < n; i++) coverage.push({ work: 0, night: 0, off: 0 });
  var unassigned = 0, rowsHtml = '';
  list.forEach(function (e, ri) {
    var cnt = {}, cells = '';
    for (var d2 = 1; d2 <= n; d2++) {
      var code = e.days[d2 - 1] || '';
      var kind = rpKind(code);
      if (!code) unassigned++;
      else { cnt[code] = (cnt[code] || 0) + 1; }
      if (kind === 'work' || kind === 'half') coverage[d2 - 1].work++;
      if (kind === 'night') coverage[d2 - 1].night++;
      if (kind === 'off' || kind === 'leave') coverage[d2 - 1].off++;
      var dow2 = new Date(p.year, p.month - 1, d2).getDay(), we2 = dow2 === 0 || dow2 === 6;
      cells += '<td class="rp-td' + (we2 ? ' we' : '') + '" data-a="' + ri + '" data-d="' + d2 + '">' +
        '<span class="rp-cell' + (code ? '' : ' empty') + '" style="' + rpChipStyle(code) + '">' + rpEsc(code) + '</span></td>';
    }
    var sum = Object.keys(cnt).filter(function (c) { return rpKind(c) !== 'off'; }).map(function (c) { return cnt[c] + '×' + c; }).join(' · ');
    var offs = Object.keys(cnt).filter(function (c) { return rpKind(c) === 'off'; }).reduce(function (a, c) { return a + cnt[c]; }, 0);
    rowsHtml += '<tr data-a="' + ri + '"' + (RP.dirty[e.agent_name] ? ' class="rp-dirty"' : '') + '>' +
      '<td class="rp-td-agent"><div class="rp-agent"><span class="rp-agent-name">' + rpEsc(e.agent_name) + '</span>' +
      '<span class="rp-agent-tools">' +
      '<button class="rp-mini" title="Fill whole row with the selected brush" onclick="rpFillRow(' + ri + ')">Fill</button>' +
      '<button class="rp-mini" title="Clear this agent\'s month" onclick="rpClearRow(' + ri + ')">Clear</button>' +
      '<button class="rp-mini rp-mini-x" title="Remove agent from this month" onclick="rpRemoveAgent(' + ri + ')">✕</button>' +
      '</span></div></td>' + cells +
      '<td class="rp-td-sum">' + (sum || '<span class="rp-dim">not assigned</span>') + (offs ? '<span class="rp-dim"> · ' + offs + ' off</span>' : '') + '</td></tr>';
  });

  // Coverage row
  var cov = '<td class="rp-td-agent rp-cov-lbl">Coverage</td>';
  coverage.forEach(function (c) {
    var low = c.work < (RP_SETTINGS.minCoverage || 0);
    cov += '<td class="rp-td rp-cov' + (low ? ' low' : '') + '" title="' + c.work + ' working · ' + c.night + ' night · ' + c.off + ' off/leave"><b>' + c.work + '</b><small>' + c.night + 'N</small></td>';
  });
  cov += '<td class="rp-td-sum rp-dim">working · night</td>';

  var totalCells = list.length * n;
  var done = totalCells - unassigned;
  var pct = totalCells ? Math.round(done / totalCells * 100) : 0;
  var dirtyCount = Object.keys(RP.dirty).length;

  var teamStrip = '';
  var plannable = rpPlannableTeams();
  if (plannable.length > 1 || rpTeamsList().length > 1) {
    teamStrip = '<div class="rp-teams"><span class="rp-teams-lbl">Team</span>' + plannable.map(function (t) {
      var tm = rpM(k, t.code);
      var st = !tm ? 'no ' + rpLabel(k) : (tm.status === 'released' ? 'Released' : 'Draft');
      var on = t.code === RP.team;
      return '<button class="rp-team' + (on ? ' active' : '') + '" style="' + (on ? 'border-color:' + t.color + ';background:' + t.color + '1a;' : '') + '" onclick="rpSwitchTeam(\'' + rpEsc(t.code) + '\')">' +
        '<span class="rp-team-tag" style="background:' + t.color + '">' + rpEsc(t.code) + '</span><span class="rp-team-txt"><span>' + rpEsc(t.name) + '</span><small>' + rpEsc(t.company || '') + ' · ' + st + '</small></span></button>';
    }).join('') + '</div>';
  }
  var teamObj = rpTeamsList().find(function (t) { return t.code === RP.team; }) || { name: RP.team, color: '#C9352B' };

  page.innerHTML =
    '<div class="rp-page" id="rp-root">' +
      '<div class="rp-head">' +
        '<div><h2 class="rp-title">🗓️ Roster Planner <span class="rp-title-team" style="background:' + teamObj.color + '">' + rpEsc(teamObj.name) + '</span></h2>' +
        '<p class="rp-sub">Pick a shift on the left, then click or drag across cells to paint it. Agents only see a month after you release it.</p></div>' +
        '<div class="rp-actions">' +
          '<button class="rp-btn" onclick="rpCopyPrev()" title="Copy the previous month\'s pattern day-of-week-wise">Copy ' + rpLabel(rpPrevKey(k)) + '</button>' +
          '<button class="rp-btn" onclick="rpOpenPattern()">Weekly pattern…</button>' +
          '<button class="rp-btn" onclick="rpAutoWeekOff()" title="Mark every Saturday & Sunday as WO where empty">Auto week-offs</button>' +
          '<button class="rp-btn" onclick="rpOpenAddAgent()">+ Agent</button>' +
          '<button class="rp-btn" onclick="rpExportExcel()">⬇ Excel</button>' +
          '<button class="rp-btn" id="rp-save-btn" onclick="rpSaveNow()" ' + (dirtyCount ? '' : 'disabled') + '>' + (dirtyCount ? 'Save (' + dirtyCount + ')' : 'Saved') + '</button>' +
          (released
            ? '<button class="rp-btn rp-btn-warn" onclick="rpUnrelease()">Unrelease</button>'
            : '<button class="rp-btn rp-btn-primary" onclick="rpRelease()">Release ' + rpEsc(teamObj.name) + ' · ' + rpLabel(k) + '</button>') +
        '</div>' +
      '</div>' +
      teamStrip +
      '<div class="rp-mtabs">' + tabs +
        '<span class="rp-mtabs-info">' + (released ? '✅ Released ' + rpFmtTs(m.released_at) + (m.released_by ? ' by ' + rpEsc(m.released_by) : '') : '📝 Draft · ' + pct + '% assigned · ' + unassigned + ' empty cells') + '</span>' +
      '</div>' +
      (released ? '<div class="rp-banner">This month is live for ' + rpEsc(teamObj.name) + ' agents. Any change you paint is saved and visible immediately.</div>' : '') +
      '<div class="rp-body">' +
        '<aside class="rp-palette"><div class="rp-palette-lbl">Shift brush</div>' + brushes +
          '<div class="rp-palette-tip">Drag across a row to fill a week. Right-click a cell to clear it.</div></aside>' +
        '<div class="rp-gridwrap"><div class="rp-scroll"><table class="rp-tbl" id="rp-tbl"><thead><tr>' + th + '</tr></thead><tbody>' + rowsHtml +
          '<tr class="rp-cov-row">' + cov + '</tr></tbody></table></div>' +
          '<div class="rp-legend"><span><i class="rp-lg" style="background:#C9352B"></i>Red coverage = fewer than ' + (RP_SETTINGS.minCoverage || 0) + ' working</span>' +
          '<span><i class="rp-lg rp-lg-dash"></i>Dashed cell = unassigned</span><span class="rp-dim" style="margin-left:auto">' + list.length + ' agents · ' + n + ' days</span></div>' +
        '</div>' +
      '</div>' +
      '<div id="rp-modal"></div>' +
    '</div>';

  rpBindGrid();
}

// ─────────────────────────────────────────────────────────
// GRID INTERACTION — paint / drag / right-click clear
// ─────────────────────────────────────────────────────────
function rpBindGrid() {
  var tbl = document.getElementById('rp-tbl');
  if (!tbl) return;
  function cellOf(ev) { var td = ev.target.closest ? ev.target.closest('td.rp-td') : null; if (!td || td.classList.contains('rp-cov')) return null; return td; }
  tbl.addEventListener('mousedown', function (ev) {
    var td = cellOf(ev); if (!td) return;
    ev.preventDefault();
    RP.painting = true;
    RP.paintCode = ev.button === 2 ? '' : RP.brush;
    rpPaint(td, RP.paintCode);
  });
  tbl.addEventListener('mouseover', function (ev) {
    if (!RP.painting) return;
    var td = cellOf(ev); if (td) rpPaint(td, RP.paintCode);
  });
  tbl.addEventListener('contextmenu', function (ev) { var td = cellOf(ev); if (td) { ev.preventDefault(); rpPaint(td, ''); } });
  if (!RP._mouseupBound) { RP._mouseupBound = true; document.addEventListener('mouseup', function () { if (RP.painting) { RP.painting = false; rpAfterPaint(); } }); }
  // touch: tap paints
  tbl.addEventListener('touchstart', function (ev) { var td = cellOf(ev); if (td) { rpPaint(td, RP.brush); rpAfterPaint(); } }, { passive: true });
}

function rpPaint(td, code) {
  var a = +td.getAttribute('data-a'), d = +td.getAttribute('data-d');
  var list = rpSortedList();
  var e = list[a]; if (!e) return;
  if ((e.days[d - 1] || '') === (code || '')) return;
  e.days[d - 1] = code || '';
  RP.dirty[e.agent_name] = true;
  var span = td.querySelector('.rp-cell');
  if (span) { span.textContent = code || ''; span.setAttribute('style', rpChipStyle(code)); span.classList.toggle('empty', !code); }
  td.parentNode.classList.add('rp-dirty');
}
function rpAfterPaint() { rpScheduleSave(); rpRefreshCoverage(); }
function rpSortedList() { return rpE(RP.key).slice().sort(function (a, b) { return (a.sort_order - b.sort_order) || a.agent_name.localeCompare(b.agent_name); }); }

// Cheap partial refresh of coverage + summaries + save button (no full re-render while painting)
function rpRefreshCoverage() {
  var k = RP.key, p = rpParseKey(k), n = rpDaysIn(p.year, p.month);
  var list = rpSortedList();
  var cov = []; for (var i = 0; i < n; i++) cov.push({ work: 0, night: 0, off: 0 });
  list.forEach(function (e, ri) {
    var cnt = {};
    for (var d = 1; d <= n; d++) {
      var code = e.days[d - 1] || '', kind = rpKind(code);
      if (code) cnt[code] = (cnt[code] || 0) + 1;
      if (kind === 'work' || kind === 'half') cov[d - 1].work++;
      if (kind === 'night') cov[d - 1].night++;
      if (kind === 'off' || kind === 'leave') cov[d - 1].off++;
    }
    var tr = document.querySelector('#rp-tbl tr[data-a="' + ri + '"] .rp-td-sum');
    if (tr) {
      var sum = Object.keys(cnt).filter(function (c) { return rpKind(c) !== 'off'; }).map(function (c) { return cnt[c] + '×' + c; }).join(' · ');
      var offs = Object.keys(cnt).filter(function (c) { return rpKind(c) === 'off'; }).reduce(function (a, c) { return a + cnt[c]; }, 0);
      tr.innerHTML = (sum || '<span class="rp-dim">not assigned</span>') + (offs ? '<span class="rp-dim"> · ' + offs + ' off</span>' : '');
    }
  });
  var tds = document.querySelectorAll('#rp-tbl .rp-cov-row td.rp-cov');
  tds.forEach(function (td, i) {
    var c = cov[i]; if (!c) return;
    td.classList.toggle('low', c.work < (RP_SETTINGS.minCoverage || 0));
    td.innerHTML = '<b>' + c.work + '</b><small>' + c.night + 'N</small>';
    td.title = c.work + ' working · ' + c.night + ' night · ' + c.off + ' off/leave';
  });
  var sb = document.getElementById('rp-save-btn');
  var dc = Object.keys(RP.dirty).length;
  if (sb) { sb.disabled = !dc; sb.textContent = dc ? 'Save (' + dc + ')' : 'Saved'; }
}

// ─────────────────────────────────────────────────────────
// ACTIONS
// ─────────────────────────────────────────────────────────
function rpSetBrush(code) { RP.brush = code; document.querySelectorAll('.rp-brush').forEach(function (b) { b.classList.remove('active'); }); var btns = document.querySelectorAll('.rp-brush'); btns.forEach(function (b) { var c = b.querySelector('.rp-chip'); if (c && ((code && c.textContent === code) || (!code && c.classList.contains('rp-chip-empty')))) b.classList.add('active'); }); }
function rpSwitchMonth(k) { if (Object.keys(RP.dirty).length) rpSaveNow(); RP.key = k; RP.dirty = {}; rpRender(); }
async function rpAddMonth(k) { await rpCreateMonth(k); RP.key = k; RP.dirty = {}; rpRender(); }
async function rpSwitchTeam(code) {
  if (Object.keys(RP.dirty).length) await rpSaveNow();
  RP.team = code; RP.dirty = {};
  if (!rpM(RP.key)) {
    var keys = rpMonthKeys();
    if (keys.length && !confirm('No ' + rpLabel(RP.key) + ' roster for ' + rpTeamName(code) + ' yet. Create a draft?')) { RP.key = keys[keys.length - 1]; rpRender(); return; }
    await rpCreateMonth(RP.key, true);
  }
  rpRender();
}

function rpFillRow(ri) {
  var e = rpSortedList()[ri]; if (!e) return;
  var p = rpParseKey(RP.key), n = rpDaysIn(p.year, p.month);
  for (var d = 0; d < n; d++) e.days[d] = RP.brush || '';
  RP.dirty[e.agent_name] = true; rpScheduleSave(); rpRender();
}
function rpClearRow(ri) {
  var e = rpSortedList()[ri]; if (!e) return;
  if (!confirm('Clear the whole month for ' + e.agent_name + '?')) return;
  e.days = rpBlank(); RP.dirty[e.agent_name] = true; rpScheduleSave(); rpRender();
}
async function rpRemoveAgent(ri) {
  var e = rpSortedList()[ri]; if (!e) return;
  if (!confirm('Remove ' + e.agent_name + ' from ' + rpLabelLong(RP.key) + '?')) return;
  var p = rpParseKey(RP.key);
  try { await sbDeleteWhere('roster_entries', 'team=eq.' + encodeURIComponent(RP.team) + '&year=eq.' + p.year + '&month=eq.' + p.month + '&agent_name=eq.' + encodeURIComponent(e.agent_name)); } catch (err) { }
  rpSetE(RP.key, rpE(RP.key).filter(function (x) { return x.agent_name !== e.agent_name; }));
  delete RP.dirty[e.agent_name];
  rpRender(); rpToast('Removed ' + e.agent_name);
}

function rpAutoWeekOff() {
  var p = rpParseKey(RP.key), n = rpDaysIn(p.year, p.month), changed = 0;
  rpE(RP.key).forEach(function (e) {
    for (var d = 1; d <= n; d++) {
      var dow = new Date(p.year, p.month - 1, d).getDay();
      if ((dow === 0 || dow === 6) && !e.days[d - 1]) { e.days[d - 1] = 'WO'; changed++; RP.dirty[e.agent_name] = true; }
    }
  });
  rpScheduleSave(); rpRender(); rpToast('🗓️ ' + changed + ' weekend cells marked WO');
}

// Copy previous month by weekday pattern: for each agent, take the previous month's
// LAST full week (Mon–Sun) and repeat it across this month. Empty cells only, unless confirmed.
function rpCopyPrev() {
  var prevK = rpPrevKey(RP.key), prev = RP.entries[rpMK(prevK)];
  if (!prev || !prev.length) { rpToast('No roster found for ' + rpLabel(prevK)); return; }
  var overwrite = confirm('Copy ' + rpLabel(prevK) + ' pattern into ' + rpLabel(RP.key) + '?\n\nOK = overwrite everything · Cancel = fill only empty cells');
  var pp = rpParseKey(prevK), pn = rpDaysIn(pp.year, pp.month);
  var p = rpParseKey(RP.key), n = rpDaysIn(p.year, p.month);
  var cur = rpE(RP.key);
  var changed = 0;
  prev.forEach(function (pe) {
    // weekday template from the last 7 days of previous month (covers each dow once)
    var tpl = {};
    for (var d = pn; d > pn - 7 && d >= 1; d--) { var dow = new Date(pp.year, pp.month - 1, d).getDay(); if (tpl[dow] === undefined) tpl[dow] = pe.days[d - 1] || ''; }
    var ce = cur.find(function (x) { return x.agent_name === pe.agent_name; });
    if (!ce) { ce = { agent_name: pe.agent_name, user_id: pe.user_id, emp_id: pe.emp_id, sort_order: pe.sort_order, days: rpBlank() }; cur.push(ce); }
    for (var dd = 1; dd <= n; dd++) {
      var dw = new Date(p.year, p.month - 1, dd).getDay();
      var code = tpl[dw] || '';
      if (!code) continue;
      if (overwrite || !ce.days[dd - 1]) { if (ce.days[dd - 1] !== code) { ce.days[dd - 1] = code; changed++; RP.dirty[ce.agent_name] = true; } }
    }
  });
  rpSetE(RP.key, cur);
  rpScheduleSave(); rpRender(); rpToast('📋 Copied pattern · ' + changed + ' cells updated');
}

// ── Weekly pattern modal ──
function rpOpenPattern() {
  var list = rpSortedList();
  var work = RP_SETTINGS.shifts.filter(function (s) { return s.kind === 'work' || s.kind === 'night'; });
  var html = '<div class="rp-overlay" onclick="if(event.target===this)rpCloseModal()"><div class="rp-modal">' +
    '<div class="rp-modal-head"><div class="rp-modal-title">Apply weekly pattern</div><button class="rp-x" onclick="rpCloseModal()">✕</button></div>' +
    '<div class="rp-field"><label>Shift</label><select id="rp-pat-shift" class="rp-select">' + work.map(function (s) { return '<option value="' + rpEsc(s.code) + '">' + rpEsc(s.code + ' · ' + s.label + (s.time ? ' · ' + s.time : '')) + '</option>'; }).join('') + '</select></div>' +
    '<div class="rp-field"><label>Week-off days</label><div class="rp-dowpick">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (dn, i) { var dow = (i + 1) % 7; var on = dow === 0 || dow === 6; return '<label class="rp-dow' + (on ? ' on' : '') + '"><input type="checkbox" value="' + dow + '"' + (on ? ' checked' : '') + ' onchange="this.parentNode.classList.toggle(\'on\',this.checked)">' + dn + '</label>'; }).join('') + '</div></div>' +
    '<div class="rp-field"><label>Agents <a href="#" onclick="rpPatAll(true);return false;">all</a> · <a href="#" onclick="rpPatAll(false);return false;">none</a></label><div class="rp-agentpick" id="rp-pat-agents">' +
    list.map(function (e, i) { return '<label><input type="checkbox" value="' + i + '" checked> ' + rpEsc(e.agent_name) + '</label>'; }).join('') + '</div></div>' +
    '<div class="rp-field"><label><input type="checkbox" id="rp-pat-over" checked> Overwrite existing cells (untick to fill only empty cells)</label></div>' +
    '<div class="rp-modal-foot"><button class="rp-btn" onclick="rpCloseModal()">Cancel</button><button class="rp-btn rp-btn-primary" onclick="rpApplyPattern()">Apply to ' + rpLabel(RP.key) + '</button></div>' +
    '</div></div>';
  document.getElementById('rp-modal').innerHTML = html;
}
function rpPatAll(v) { document.querySelectorAll('#rp-pat-agents input').forEach(function (c) { c.checked = v; }); }
function rpApplyPattern() {
  var shift = document.getElementById('rp-pat-shift').value;
  var offs = Array.from(document.querySelectorAll('.rp-dowpick input:checked')).map(function (c) { return +c.value; });
  var over = document.getElementById('rp-pat-over').checked;
  var idx = Array.from(document.querySelectorAll('#rp-pat-agents input:checked')).map(function (c) { return +c.value; });
  var list = rpSortedList(), p = rpParseKey(RP.key), n = rpDaysIn(p.year, p.month), changed = 0;
  idx.forEach(function (i) {
    var e = list[i]; if (!e) return;
    for (var d = 1; d <= n; d++) {
      var dow = new Date(p.year, p.month - 1, d).getDay();
      var code = offs.indexOf(dow) > -1 ? 'WO' : shift;
      if (over || !e.days[d - 1]) { if (e.days[d - 1] !== code) { e.days[d - 1] = code; changed++; RP.dirty[e.agent_name] = true; } }
    }
  });
  rpCloseModal(); rpScheduleSave(); rpRender(); rpToast('✅ Pattern applied · ' + changed + ' cells');
}
function rpCloseModal() { var m = document.getElementById('rp-modal'); if (m) m.innerHTML = ''; }

// ── Add agent modal ──
async function rpOpenAddAgent() {
  await rpLoadUsers();
  var present = {}; rpE(RP.key).forEach(function (e) { present[e.agent_name.toLowerCase()] = true; });
  var teamOf = (typeof tmTeamOf === 'function') ? tmTeamOf : function () { return RP.team; };
  var avail = (RP.users || []).filter(function (u) { return !present[String(u.name).toLowerCase()]; })
    .sort(function (a, b) { var ta = teamOf(a.id) === RP.team ? 0 : 1, tb = teamOf(b.id) === RP.team ? 0 : 1; return ta - tb || a.name.localeCompare(b.name); });
  var html = '<div class="rp-overlay" onclick="if(event.target===this)rpCloseModal()"><div class="rp-modal">' +
    '<div class="rp-modal-head"><div class="rp-modal-title">Add agent to ' + rpLabel(RP.key) + '</div><button class="rp-x" onclick="rpCloseModal()">✕</button></div>' +
    '<div class="rp-field"><label>Portal users not yet on this roster</label><div class="rp-agentpick">' +
    (avail.length ? avail.map(function (u) { var other = teamOf(u.id) !== RP.team; return '<label><input type="checkbox" data-id="' + rpEsc(String(u.id)) + '" value="' + rpEsc(u.name) + '"> ' + rpEsc(u.name) + ' <small class="rp-dim">(' + rpEsc(u.role) + (other ? ' · ' + rpEsc(rpTeamName(teamOf(u.id))) : '') + ')</small></label>'; }).join('') : '<span class="rp-dim">Everyone is already on this month.</span>') +
    '</div></div>' +
    '<div class="rp-field"><label>Or add a name manually (e.g. a new joiner without a login yet)</label><input id="rp-add-name" class="rp-input" placeholder="Full name"><input id="rp-add-emp" class="rp-input" placeholder="EMP ID (optional)" style="margin-top:.4rem"></div>' +
    '<div class="rp-modal-foot"><button class="rp-btn" onclick="rpCloseModal()">Cancel</button><button class="rp-btn rp-btn-primary" onclick="rpAddAgents()">Add</button></div>' +
    '</div></div>';
  document.getElementById('rp-modal').innerHTML = html;
}
function rpAddAgents() {
  var cur = rpE(RP.key);
  var maxSort = cur.reduce(function (a, e) { return Math.max(a, e.sort_order || 0); }, 0);
  var added = 0;
  document.querySelectorAll('.rp-agentpick input:checked').forEach(function (c) {
    cur.push({ agent_name: c.value, user_id: c.getAttribute('data-id'), emp_id: '', sort_order: ++maxSort, days: rpBlank() }); RP.dirty[c.value] = true; added++;
  });
  var nm = (document.getElementById('rp-add-name').value || '').trim();
  if (nm && !cur.find(function (e) { return e.agent_name.toLowerCase() === nm.toLowerCase(); })) {
    cur.push({ agent_name: nm, user_id: null, emp_id: (document.getElementById('rp-add-emp').value || '').trim(), sort_order: ++maxSort, days: rpBlank() }); RP.dirty[nm] = true; added++;
  }
  rpCloseModal(); if (added) { rpScheduleSave(); rpRender(); rpToast('➕ ' + added + ' agent(s) added'); }
}

// ─────────────────────────────────────────────────────────
// SAVE / RELEASE
// ─────────────────────────────────────────────────────────
function rpScheduleSave() { clearTimeout(RP.saveTimer); RP.saveTimer = setTimeout(function () { rpSaveNow(); }, 1500); }
async function rpSaveNow(forKey) {
  var k = forKey || RP.key; var names = Object.keys(RP.dirty);
  if (!names.length) return;
  var p = rpParseKey(k);
  var payload = rpE(k).filter(function (e) { return RP.dirty[e.agent_name]; }).map(function (e) {
    return { team: RP.team, year: p.year, month: p.month, user_id: e.user_id ? String(e.user_id) : null, agent_name: e.agent_name, emp_id: e.emp_id || null, sort_order: e.sort_order || 0, days: e.days, updated_by: currentUser ? currentUser.name : null };
  });
  var sb = document.getElementById('rp-save-btn'); if (sb) { sb.disabled = true; sb.textContent = 'Saving…'; }
  try {
    if (payload.length) await sbUpsert('roster_entries', payload, 'team,year,month,agent_name');
    if (rpM(k) && rpM(k).id) await sbUpdate('roster_months', 'id', rpM(k).id, { updated_by: currentUser ? currentUser.name : null }).catch(function () { });
    RP.dirty = {};
    document.querySelectorAll('#rp-tbl tr.rp-dirty').forEach(function (tr) { tr.classList.remove('rp-dirty'); });
    if (sb) { sb.textContent = 'Saved'; }
    // If this month is live, refresh what agents see
    if (rpM(k) && rpM(k).status === 'released') rpPublishToPipeline();
  } catch (e) {
    if (sb) { sb.disabled = false; sb.textContent = 'Save (' + names.length + ')'; }
    rpToast('❌ Save failed: ' + e.message, 5000);
  }
}
async function rpRelease() {
  var k = RP.key, p = rpParseKey(k);
  var list = rpE(k), n = rpDaysIn(p.year, p.month), empty = 0;
  list.forEach(function (e) { for (var d = 0; d < n; d++) if (!e.days[d]) empty++; });
  var msg = 'Release ' + rpTeamName(RP.team) + ' · ' + rpLabelLong(k) + ' to its agents?' + (empty ? '\n\n⚠️ ' + empty + ' cells are still unassigned (they will show as blank).' : '');
  if (!confirm(msg)) return;
  await rpSaveNow(k);
  try {
    await sbUpdate('roster_months', 'id', rpM(k).id, { status: 'released', released_at: rpNow(), released_by: currentUser ? currentUser.name : null });
    rpM(k).status = 'released'; rpM(k).released_at = rpNow(); rpM(k).released_by = currentUser ? currentUser.name : null;
    rpPublishToPipeline(); rpRender(); rpToast('🚀 ' + rpTeamName(RP.team) + ' · ' + rpLabel(k) + ' released');
    rpPostAnnouncement(k).catch(function () { });
  } catch (e) { rpToast('❌ Release failed: ' + e.message, 5000); }
}
async function rpUnrelease() {
  var k = RP.key;
  if (!confirm('Hide ' + rpTeamName(RP.team) + ' · ' + rpLabelLong(k) + ' from agents again (back to draft)?')) return;
  try {
    await sbUpdate('roster_months', 'id', rpM(k).id, { status: 'draft', released_at: null, released_by: null });
    rpM(k).status = 'draft';
    var short = RP_MONTHS_SHORT[rpParseKey(k).month - 1];
    if (window.ROSTER_MONTHS && window.ROSTER_MONTHS[short] && window.ROSTER_MONTHS[short].dbKey === k && window.ROSTER_MONTHS[short].dbTeam === RP.team) { delete window.ROSTER_MONTHS[short].customUrl; delete window.ROSTER_MONTHS[short].dbKey; delete window.ROSTER_MONTHS[short].dbTeam; }
    if (window._rosterDataCache) delete window._rosterDataCache['db://roster/' + RP.team + '/' + k];
    rpRender(); rpToast('↩️ ' + rpLabel(k) + ' is a draft again');
  } catch (e) { rpToast('❌ ' + e.message, 5000); }
}
// Optional: drop a line in Announcements when a roster goes live (silently skipped if table differs)
async function rpPostAnnouncement(k) {
  if (typeof sbInsertResilient !== 'function') return;
  await sbInsertResilient('announcements', {
    text: '🗓️ ' + rpTeamName(RP.team) + ' — ' + rpLabelLong(k) + ' shift roster is released. Check Team → Roster.',
    posted_by: currentUser ? currentUser.name : null,
    pinned: false
  }, ['pinned', 'posted_by']);
}

// ─────────────────────────────────────────────────────────
// EXCEL EXPORT (same layout as the old sheet)
// ─────────────────────────────────────────────────────────
function rpExportExcel() {
  if (typeof XLSX === 'undefined') { rpToast('XLSX library not loaded'); return; }
  var rows = rpBuildSheetRows(RP.key);
  var ws = XLSX.utils.aoa_to_sheet(rows);
  var cols = [{ wch: 10 }, { wch: 22 }]; for (var i = 0; i < 31; i++) cols.push({ wch: 5 });
  ws['!cols'] = cols;
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, rpLabel(RP.key));
  XLSX.writeFile(wb, 'Roster_' + RP.team + '_' + RP.key + '.xlsx');
  rpToast('✅ Exported');
}

// ─────────────────────────────────────────────────────────
// AGENT-SIDE EXTRAS on the existing Roster page
//   • "Plan roster" button for planners
//   • shift legend with times
//   • "released" badge
// ─────────────────────────────────────────────────────────
function rpDecorateRosterPage() {
  var ctrl = document.querySelector('#page-roster .roster-controls');
  if (!ctrl) return;
  // Sync button is not needed: the page refreshes from the DB every time it opens
  var sync = document.getElementById('roster-sync-btn'); if (sync) sync.style.display = 'none';

  // ── team segmented control (self-contained styles so it never renders bare) ──
  if (typeof tmTeams === 'function') {
    var old = document.getElementById('rp-view-team'); if (old) old.remove();
    var vt = RP.viewTeam || rpMyTeam();
    var teams = rpTeamsList();
    var wrap = document.createElement('div'); wrap.id = 'rp-view-team';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:0;background:var(--navy-card);border:1px solid var(--navy-border);border-radius:10px;padding:3px;margin-right:.4rem;';
    if (rpCanPlan() && teams.length > 1) {
      wrap.innerHTML = teams.map(function (t) {
        var on = t.code === vt;
        return '<button onclick="rpViewTeam(\'' + rpEsc(t.code) + '\')" style="height:34px;padding:0 .9rem;border:none;border-radius:8px;cursor:pointer;font-family:\'DM Sans\',sans-serif;font-size:.78rem;font-weight:600;white-space:nowrap;transition:all .15s;' +
          (on ? 'background:' + t.color + ';color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.18);' : 'background:transparent;color:var(--text-muted);') + '">' + rpEsc(t.name) + '</button>';
      }).join('');
    } else {
      var t0 = teams.find(function (t) { return t.code === vt; });
      if (t0) wrap.innerHTML = '<span style="display:inline-flex;align-items:center;gap:.5rem;padding:0 .8rem;height:34px;font-size:.78rem;font-weight:600;color:var(--text-primary);"><span style="width:9px;height:9px;border-radius:2px;background:' + t0.color + '"></span>' + rpEsc(t0.name) + '</span>';
    }
    ctrl.insertBefore(wrap, ctrl.firstChild);
  }

  // ── Plan roster button for planners ──
  if (rpCanPlan() && !document.getElementById('rp-plan-btn')) {
    var b = document.createElement('button');
    b.id = 'rp-plan-btn'; b.className = 'roster-refresh-btn'; b.style.background = 'linear-gradient(135deg,#C9352B,#EF493C)'; b.style.color = '#fff';
    b.innerHTML = '✏️ Plan roster';
    b.onclick = function () { showPage('rosterplan', document.getElementById('sidebar-rosterplan')); };
    ctrl.appendChild(b);
  }

  // ── "My roster" view button inside the existing Full Month / Week View toggle ──
  var tog = document.getElementById('roster-view-toggle');
  if (tog && !document.getElementById('rvt-my')) {
    var mb = document.createElement('button'); mb.className = 'roster-vt-btn'; mb.id = 'rvt-my'; mb.textContent = '🙋 My roster';
    mb.onclick = function () { rpSetRosterView('my'); };
    tog.insertBefore(mb, tog.firstChild);
  }
  if (!RP.rosterView) RP.rosterView = rpCanPlan() ? 'team' : 'my';
  rpApplyRosterView();

  // ── compact shift legend (one quiet line; WFH/leave already in the main legend) ──
  var lg = document.querySelector('#page-roster .roster-legend');
  if (lg) {
    var oldL = document.getElementById('rp-shift-legend'); if (oldL) oldL.remove();
    var work = RP_SETTINGS.shifts.filter(function (s) { return (s.kind === 'work' || s.kind === 'night') && s.code.toUpperCase().indexOf('WFH') === -1; });
    if (work.length) {
      var div = document.createElement('div'); div.id = 'rp-shift-legend';
      div.style.cssText = 'display:flex;align-items:center;gap:.9rem;flex-wrap:wrap;font-size:.7rem;color:var(--text-dim);margin:.1rem 0 .4rem;';
      div.innerHTML = '<span style="letter-spacing:.1em;text-transform:uppercase;font-weight:700;font-size:.6rem;">Shifts</span>' + work.map(function (s) {
        return '<span style="display:inline-flex;align-items:center;gap:.3rem;"><span style="display:inline-block;min-width:20px;padding:0 4px;border-radius:4px;font-size:.6rem;font-weight:700;text-align:center;line-height:16px;' + rpChipStyle(s.code) + '">' + rpEsc(s.code) + '</span>' + rpEsc(s.label) + (s.time ? ' <span style="opacity:.75">' + rpEsc(s.time) + '</span>' : '') + '</span>';
      }).join('');
      lg.parentNode.insertBefore(div, lg.nextSibling);
    }
  }
  rpTrimMonthTabs();
}

// Month tabs: previous + current month, plus a newly released later month (badge "New"); the rest behind "Archive"
function rpTrimMonthTabs() {
  var c = document.getElementById('roster-month-tabs'); if (!c) return;
  var btns = Array.from(c.querySelectorAll('.roster-month-btn'));
  if (!btns.length) return;
  var now = new Date(), cur = now.getMonth(), year = now.getFullYear();
  var hidden = 0;
  btns.forEach(function (b) {
    var key = (b.id || '').replace('rmb-', ''); var mi = RP_MONTHS_SHORT.indexOf(key);
    var cfg = window.ROSTER_MONTHS && window.ROSTER_MONTHS[key];
    var cfgYear = cfg && (cfg.label.match(/(\d{4})/) || [])[1]; cfgYear = cfgYear ? +cfgYear : year;
    var rel = (cfgYear - year) * 12 + (mi - cur);          // months from now
    var isNew = rel > 0 && cfg && cfg.dbKey;              // a released future month
    var keep = rel === 0 || rel === -1 || isNew;
    var badge = b.querySelector('.rp-new'); if (badge) badge.remove();
    if (isNew) { var sp = document.createElement('span'); sp.className = 'rp-new'; sp.textContent = 'New'; sp.style.cssText = 'margin-left:.4rem;font-size:.58rem;font-weight:800;letter-spacing:.06em;padding:1px 6px;border-radius:8px;background:#2EC56F;color:#06301a;vertical-align:middle;'; b.appendChild(sp); }
    if (!keep && !RP.archiveOpen) { b.style.display = 'none'; hidden++; } else b.style.display = '';
  });
  var ab = document.getElementById('rp-archive-btn');
  var archivable = btns.filter(function (b) { var key = (b.id || '').replace('rmb-', ''); var mi = RP_MONTHS_SHORT.indexOf(key); return mi < cur - 1 || (mi > cur && !(window.ROSTER_MONTHS[key] && window.ROSTER_MONTHS[key].dbKey)); }).length;
  if (archivable) {
    if (!ab) { ab = document.createElement('button'); ab.id = 'rp-archive-btn'; ab.className = 'roster-month-btn'; ab.style.borderStyle = 'dashed'; ab.onclick = function () { RP.archiveOpen = !RP.archiveOpen; rpTrimMonthTabs(); }; c.appendChild(ab); }
    ab.textContent = RP.archiveOpen ? 'Hide archive' : '🗂 Archive (' + archivable + ')';
  } else if (ab) ab.remove();
}

// ── Roster page view: 'my' (calendar of my shifts) or 'team' (the existing grid) ──
function rpSetRosterView(v) { RP.rosterView = v; rpApplyRosterView(); if (v === 'team' && typeof window.setRosterViewMode === 'function') window.setRosterViewMode(window._rosterViewMode || 'month'); }
function rpApplyRosterView() {
  var my = RP.rosterView === 'my';
  var grid = document.getElementById('roster-table-wrap'), lg = document.querySelector('#page-roster .roster-legend'), sl = document.getElementById('rp-shift-legend'), nav = document.getElementById('roster-week-nav'), srch = document.getElementById('roster-search');
  var card = document.getElementById('rp-my-roster');
  if (grid) grid.style.display = my ? 'none' : '';
  if (lg) lg.style.display = my ? 'none' : '';
  if (sl) sl.style.display = my ? 'none' : '';
  if (srch) srch.style.display = my ? 'none' : '';
  if (nav && my) nav.style.display = 'none';
  if (card) card.style.display = my ? '' : 'none';
  ['rvt-my', 'rvt-month', 'rvt-week'].forEach(function (id) { var b = document.getElementById(id); if (!b) return; if (id === 'rvt-my') b.classList.toggle('active', my); else if (my) b.classList.remove('active'); });
  if (!my) { var bm = document.getElementById('rvt-month'), bw = document.getElementById('rvt-week'); var mode = window._rosterViewMode || 'month'; if (bm) bm.classList.toggle('active', mode === 'month'); if (bw) bw.classList.toggle('active', mode === 'week'); }
  if (my && RP.lastRows) rpRenderMyRoster(RP.lastRows);
}
function rpFindMyRow(rows) {
  if (!currentUser || !rows) return null;
  var me = String(currentUser.name || '').toLowerCase().trim(); var first = me.split(' ')[0];
  var agentRows = (typeof rosterAgentRows === 'function') ? rosterAgentRows(rows) : rows.slice(3);
  return agentRows.find(function (r) { var n = String(r[1] || '').toLowerCase().trim(); return n === me || n.split(' ')[0] === first || n.indexOf(first) > -1 || me.indexOf(n.split(' ')[0]) > -1; }) || null;
}
function rpStatusOf(code, wknd) {
  if (typeof parseRosterStatus === 'function') return parseRosterStatus(code, wknd);
  var k = rpKind(code); return { type: k === 'work' || k === 'night' ? 'present' : k === 'off' ? 'off' : k === 'leave' ? 'leave' : k === 'half' ? 'half' : 'empty', label: code || '—' };
}
function rpRenderMyRoster(rows) {
  var page = document.getElementById('page-roster'); if (!page) return;
  var card = document.getElementById('rp-my-roster');
  if (!card) { card = document.createElement('div'); card.id = 'rp-my-roster'; var anchor = document.querySelector('#page-roster .roster-legend') || document.getElementById('roster-table-wrap'); anchor.parentNode.insertBefore(card, anchor); }
  if (RP.rosterView !== 'my') { card.style.display = 'none'; return; }
  card.style.display = '';
  var hdr = rows.find(function (r) { return r.some(function (c) { return /[A-Za-z]+\s*-\s*\d{4}/.test(c); }); });
  var dateRow = rows.find(function (r) { return String(r[1] || '').trim().toUpperCase() === 'DATE'; });
  var mi = hdr && typeof getMonthIndex === 'function' ? getMonthIndex(hdr.find(function (c) { return /[A-Za-z]+\s*-\s*\d{4}/.test(c); }) || '') : null;
  var today = new Date();
  var month = mi && mi.month !== undefined ? mi.month : (window._rosterTodayM !== undefined ? window._rosterTodayM : today.getMonth());
  var year = mi && mi.year ? mi.year : (window._rosterTodayY || today.getFullYear());
  var myRow = rpFindMyRow(rows);
  var teamName = rpTeamName(RP.viewTeam || rpMyTeam());
  if (!dateRow || !myRow) {
    card.innerHTML = '<div class="rp-my-card"><div class="rp-my-head"><div><div class="rp-my-title">My roster · ' + RP_MONTHS_SHORT[month] + ' ' + year + '</div><div class="rp-my-sub">' + rpEsc(teamName) + '</div></div></div>' +
      '<div class="rp-my-empty">' + (dateRow ? 'You are not on this month\'s roster yet. Ask your TL to add you.' : 'No roster for this month yet.') + '</div></div>';
    return;
  }
  var n = rpDaysIn(year, month + 1), isCur = today.getFullYear() === year && today.getMonth() === month;
  var codes = {}; dateRow.forEach(function (d, i) { if (i < 2) return; var num = Number(d); if (num > 0) codes[num] = String(myRow[i] || '').trim(); });
  var stats = { work: 0, off: 0, leave: 0, wfh: 0 };
  var cells = [];
  var firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  for (var i = 0; i < firstDow; i++) cells.push('<div class="rp-my-cell pad"></div>');
  for (var d = 1; d <= n; d++) {
    var dow = new Date(year, month, d).getDay(), wk = dow === 0 || dow === 6;
    var code = codes[d] || '';
    var st = rpStatusOf(code, wk);
    if (st.type === 'present') stats.work++; else if (st.type === 'wfh') { stats.wfh++; stats.work++; } else if (st.type === 'half') stats.work++; else if (st.type === 'leave') stats.leave++; else if (st.type === 'off') stats.off++;
    var def = rpShift(code);
    var chipStyle = def ? rpChipStyle(code) : (st.type === 'off' ? 'background:#D1D9E4;color:#374151;' : st.type === 'leave' ? 'background:#EF493C;color:#fff;' : st.type === 'wfh' ? 'background:#8B6BD1;color:#fff;' : st.type === 'half' ? 'background:#E65100;color:#fff;' : st.type === 'present' ? 'background:#4C76A8;color:#fff;' : '');
    var label = st.type === 'off' ? 'Off' : st.type === 'leave' ? 'Leave' : (code || '—');
    var sub = def ? (def.kind === 'off' ? '' : (def.time || def.label)) : (st.type === 'wfh' ? 'Work from home' : st.type === 'half' ? 'Half day' : '');
    cells.push('<div class="rp-my-cell' + (wk ? ' wk' : '') + (isCur && d === today.getDate() ? ' today' : '') + (!code ? ' none' : '') + '">' +
      '<span class="rp-my-num">' + d + '</span>' +
      (code || wk ? '<span class="rp-my-chip" style="' + chipStyle + '"><b>' + rpEsc(label) + '</b>' + (sub ? '<small>' + rpEsc(sub) + '</small>' : '') + '</span>' : '<span class="rp-my-chip empty">—</span>') +
      '</div>');
  }
  // who is on with me today
  var withMe = '';
  if (isCur) {
    var tc = codes[today.getDate()] || ''; var tst = rpStatusOf(tc, (today.getDay() === 0 || today.getDay() === 6));
    var ti = dateRow.findIndex(function (c, i) { return i >= 2 && Number(c) === today.getDate(); });
    if (ti > 0 && (tst.type === 'present' || tst.type === 'wfh' || tst.type === 'half')) {
      var mates = (typeof rosterAgentRows === 'function' ? rosterAgentRows(rows) : []).filter(function (r) { return r !== myRow && String(r[ti] || '').trim().toUpperCase() === tc.toUpperCase(); }).map(function (r) { return String(r[1] || '').trim(); });
      withMe = '<div class="rp-my-today"><div class="rp-my-today-l">Today · ' + RP_DOW[today.getDay()] + ' ' + today.getDate() + '</div><div class="rp-my-today-v"><span class="rp-my-chip inline" style="' + (rpShift(tc) ? rpChipStyle(tc) : 'background:#4C76A8;color:#fff;') + '"><b>' + rpEsc(tc) + '</b></span>' + (rpShift(tc) && rpShift(tc).time ? '<span>' + rpEsc(rpShift(tc).time) + '</span>' : '') + '</div>' +
        '<div class="rp-my-today-m">' + (mates.length ? 'On with you: ' + rpEsc(mates.slice(0, 8).join(', ')) + (mates.length > 8 ? ' +' + (mates.length - 8) + ' more' : '') : 'Nobody else on this shift today') + '</div></div>';
    } else {
      withMe = '<div class="rp-my-today"><div class="rp-my-today-l">Today · ' + RP_DOW[today.getDay()] + ' ' + today.getDate() + '</div><div class="rp-my-today-v"><b>' + (tst.type === 'off' ? 'Week off' : tst.type === 'leave' ? 'On leave' : rpEsc(tc || '—')) + '</b></div></div>';
    }
  }
  card.innerHTML = '<div class="rp-my-card">' +
    '<div class="rp-my-head"><div><div class="rp-my-title">My roster · ' + RP_MONTHS_LONG[month] + ' ' + year + '</div><div class="rp-my-sub">' + rpEsc(currentUser.name) + ' · ' + rpEsc(teamName) + '</div></div>' +
    '<div class="rp-my-stats"><span><b>' + stats.work + '</b>working</span><span><b>' + stats.off + '</b>week off</span><span><b>' + stats.leave + '</b>leave</span>' + (stats.wfh ? '<span><b>' + stats.wfh + '</b>WFH</span>' : '') + '</div></div>' +
    withMe +
    '<div class="rp-my-dows">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (x, i) { return '<div' + (i > 4 ? ' class="wk"' : '') + '>' + x + '</div>'; }).join('') + '</div>' +
    '<div class="rp-my-grid">' + cells.join('') + '</div>' +
    '<div class="rp-my-foot">Tap <b>Full Month</b> above to see the whole team.</div>' +
    '</div>';
}

// Privileged viewer switches which team's released roster the Roster page shows
function rpViewTeam(code) {
  RP.viewTeam = code;
  rpPublishToPipeline();
  rpDecorateRosterPage();
  if (typeof window.loadRosterMonthSettings === 'function' && typeof window.initRosterMonthTabs === 'function') { try { window.initRosterMonthTabs(); } catch (e) { } }
  else if (typeof window.loadRosterData === 'function') { window.loadRosterData(); }
}

// ─────────────────────────────────────────────────────────
// CONTROL DECK CARD
// ─────────────────────────────────────────────────────────
function rpBuildControlCard() {
  var card = document.getElementById('cd-roster-card'); if (!card) return;
  var sh = RP_SETTINGS.shifts;
  var rows = sh.map(function (s, i) {
    return '<div class="rp-cd-row">' +
      '<input class="rp-cd-inp" style="width:56px" value="' + rpEsc(s.code) + '" placeholder="Code" onchange="rpCdShift(' + i + ',\'code\',this.value)">' +
      '<input class="rp-cd-inp" style="flex:1" value="' + rpEsc(s.label) + '" placeholder="Label" onchange="rpCdShift(' + i + ',\'label\',this.value)">' +
      '<input class="rp-cd-inp" style="width:120px" value="' + rpEsc(s.time || '') + '" placeholder="Time" onchange="rpCdShift(' + i + ',\'time\',this.value)">' +
      '<select class="rp-cd-inp" style="width:84px" onchange="rpCdShift(' + i + ',\'kind\',this.value)">' + ['work', 'night', 'off', 'half', 'leave'].map(function (kd) { return '<option' + (s.kind === kd ? ' selected' : '') + '>' + kd + '</option>'; }).join('') + '</select>' +
      '<input type="color" class="rp-cd-color" value="' + rpEsc(s.bg) + '" title="Background" onchange="rpCdShift(' + i + ',\'bg\',this.value)">' +
      '<input type="color" class="rp-cd-color" value="' + rpEsc(s.fg) + '" title="Text" onchange="rpCdShift(' + i + ',\'fg\',this.value)">' +
      '<button class="rp-mini rp-mini-x" onclick="rpCdRemoveShift(' + i + ')">✕</button></div>';
  }).join('');
  card.innerHTML =
    '<div class="cd-card"><div class="cd-card-header"><span class="cd-card-icon" style="background:rgba(201,53,43,.12);font-size:1.1rem;">🗓️</span>' +
    '<div><div class="cd-card-title">Roster Planner</div><div class="cd-card-sub">Shift codes, who can plan, coverage alarm. Months planned here replace the Google Sheet once released.</div></div></div>' +
    '<div style="display:flex;flex-direction:column;gap:.7rem;margin-top:1rem;">' +
    '<div class="rp-cd-toggle"><div><div class="rp-cd-t">Use built-in roster</div><div class="rp-cd-s">Released months come from TeamCore; months with no DB roster still use the sheet link</div></div>' +
    '<label class="cat-toggle-wrap"><input type="checkbox" ' + (RP_SETTINGS.enabled !== false ? 'checked' : '') + ' onchange="rpCdSet(\'enabled\',this.checked)"><span class="cat-toggle-slider"></span></label></div>' +
    '<div class="rp-cd-toggle"><div><div class="rp-cd-t">Team Leads can plan</div><div class="rp-cd-s">Allow role "tl" to open the planner and release months</div></div>' +
    '<label class="cat-toggle-wrap"><input type="checkbox" ' + (RP_SETTINGS.tlCanPlan !== false ? 'checked' : '') + ' onchange="rpCdSet(\'tlCanPlan\',this.checked)"><span class="cat-toggle-slider"></span></label></div>' +
    '<div class="rp-cd-toggle"><div><div class="rp-cd-t">Team Leads plan only their own team</div><div class="rp-cd-s">Off = TLs can plan every team like admins</div></div>' +
    '<label class="cat-toggle-wrap"><input type="checkbox" ' + (RP_SETTINGS.tlOwnTeamOnly !== false ? 'checked' : '') + ' onchange="rpCdSet(\'tlOwnTeamOnly\',this.checked)"><span class="cat-toggle-slider"></span></label></div>' +
    '<div class="rp-cd-toggle"><div><div class="rp-cd-t">Minimum day coverage</div><div class="rp-cd-s">Coverage row turns red below this many working agents</div></div>' +
    '<input type="number" min="0" max="50" class="rp-cd-inp" style="width:70px" value="' + (RP_SETTINGS.minCoverage || 0) + '" onchange="rpCdSet(\'minCoverage\',+this.value)"></div>' +
    '<div style="margin-top:.5rem;border-top:1px solid var(--navy-border);padding-top:.8rem;"><div style="font-size:.72rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;margin-bottom:.5rem;">SHIFT CODES</div>' +
    '<div style="font-size:.72rem;color:var(--text-dim);margin-bottom:.5rem;line-height:1.5;">Keep <b>WO</b>, <b>WFH</b>, <b>HL</b>, <b>L</b>, <b>CO</b> as they are — the roster page recognises these. Working shifts can be any code (S1, 9-6, MS…).</div>' +
    '<div id="rp-cd-shifts" style="display:flex;flex-direction:column;gap:.35rem;">' + rows + '</div>' +
    '<div style="display:flex;gap:.5rem;margin-top:.6rem;"><button class="rp-btn" onclick="rpCdAddShift()">+ Add shift</button><button class="rp-btn" onclick="rpCdReset()">Reset defaults</button><button class="rp-btn rp-btn-primary" onclick="rpCdSave()">Save shift codes</button></div></div>' +
    '<div id="rp-cd-msg" class="cd-msg" style="display:none;margin-top:.5rem;"></div></div></div>';
}
function rpCdMsg(m) { var el = document.getElementById('rp-cd-msg'); if (el) { el.textContent = m; el.style.display = 'block'; setTimeout(function () { el.style.display = 'none'; }, 2500); } }
async function rpCdSet(k, v) { RP_SETTINGS[k] = v; if (await rpSaveSettings()) rpCdMsg('✅ Saved'); if (k === 'enabled') { if (v) rpPublishToPipeline(); } }
function rpCdShift(i, f, v) { if (RP_SETTINGS.shifts[i]) RP_SETTINGS.shifts[i][f] = (f === 'code' ? String(v).trim().toUpperCase() : v); }
function rpCdAddShift() { RP_SETTINGS.shifts.push({ code: 'NEW', label: 'New shift', time: '', bg: '#64748B', fg: '#FFFFFF', kind: 'work' }); rpBuildControlCard(); }
function rpCdRemoveShift(i) { RP_SETTINGS.shifts.splice(i, 1); rpBuildControlCard(); }
function rpCdReset() { if (confirm('Reset shift codes to defaults?')) { RP_SETTINGS.shifts = JSON.parse(JSON.stringify(RP_DEFAULT_SHIFTS)); rpBuildControlCard(); } }
async function rpCdSave() {
  RP_SETTINGS.shifts = RP_SETTINGS.shifts.filter(function (s) { return s.code; });
  if (await rpSaveSettings()) { rpCdMsg('✅ Shift codes saved'); rpBuildControlCard(); }
}

// ─────────────────────────────────────────────────────────
// HOOKS INTO THE PORTAL
// ─────────────────────────────────────────────────────────
(function rpInstallHooks() {
  rpLoadSettingsCache();
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (typeof window.showPage !== 'function' || typeof window.loadRosterSummary !== 'function') { if (tries > 300) clearInterval(iv); return; }
    clearInterval(iv);

    function rpUpdateSidebar() { var sb = document.getElementById('sidebar-rosterplan'); if (sb) sb.style.display = (currentUser && rpCanPlan()) ? '' : 'none'; }

    // 1. Page routing
    var _showPage = window.showPage;
    window.showPage = function (page, el) {
      if (page === 'rosterplan' && !(currentUser && rpCanPlan())) { return _showPage('home', document.querySelector('.sidebar-item')); }
      _showPage(page, el);
      rpUpdateSidebar();
      if (page === 'rosterplan') rpInit();
      if (page === 'roster') setTimeout(rpDecorateRosterPage, 300);
      if (page === 'controldeck') setTimeout(rpBuildControlCard, 200);
    };

    // 2. Sidebar visibility for planners
    rpUpdateSidebar();
    if (typeof window.updateAdminVisibility === 'function') {
      var _uav = window.updateAdminVisibility;
      window.updateAdminVisibility = function () { var r = _uav.apply(this, arguments); rpUpdateSidebar(); return r; };
    }

    // 3. Make DB months available before the sheet code runs.
    //    loadRosterSummary runs right after login and on "Sync Roster".
    var _lrs = window.loadRosterSummary;
    window.loadRosterSummary = async function () {
      try { await rpLoadSettings(); await rpTeamsLoad(); await rpLoadAll(true); if (!RP.viewTeam) RP.viewTeam = rpMyTeam(); rpPublishToPipeline(); } catch (e) { }
      if (RP_SETTINGS.enabled !== false) {
        var active = window._rosterActiveMonth || RP_MONTHS_SHORT[new Date().getMonth()];
        var cfg = window.ROSTER_MONTHS && window.ROSTER_MONTHS[active];
        if (cfg && cfg.dbKey && rpMonthVisibleToViewer(cfg.dbKey, cfg.dbTeam)) {
          window._rosterCsvUrl = cfg.customUrl;
          var rows = rpBuildSheetRows(cfg.dbKey, cfg.dbTeam);
          window._rosterDataCache[cfg.customUrl] = { rows: rows, timestamp: Date.now() + 1e12, db: true };
          if (typeof window._processRosterRows === 'function') { window._processRosterRows(rows); rpUpdateSidebar(); return; }
        }
      }
      return _lrs.apply(this, arguments);
    };

    // 4. loadRosterData reads window._rosterCsvUrl; serve db:// urls straight from our cache
    if (typeof window.loadRosterData === 'function') {
      var _lrd = window.loadRosterData;
      window.loadRosterData = async function () {
        var url = window._rosterCsvUrl || '';
        if (url.indexOf('db://roster/') === 0) {
          var parts = url.replace('db://roster/', '').split('/'); var team = parts[0], k = (parts[1] || '').split(/[?&]/)[0];
          if (rpM(k, team)) { var rows = rpBuildSheetRows(k, team); window._rosterDataCache[url] = { rows: rows, timestamp: Date.now() + 1e12, db: true }; if (typeof window._processRosterRows === 'function') { window._processRosterRows(rows); return; } }
        }
        return _lrd.apply(this, arguments);
      };
    }

    // 5. The per-month settings loader runs when the Roster page opens — refresh DB months there, then re-apply ours after it
    if (typeof window.loadRosterMonthSettings === 'function') {
      var _lrms = window.loadRosterMonthSettings;
      window.loadRosterMonthSettings = async function () { var r = await _lrms.apply(this, arguments); try { await rpTeamsLoad(); await rpLoadAll(true); if (!RP.viewTeam) RP.viewTeam = rpMyTeam(); } catch (e) { } rpPublishToPipeline(); return r; };
    }
    // 5b. After tabs are built / month switched: trim tabs, and feed the My-roster calendar
    if (typeof window.switchRosterMonth === 'function') {
      var _srm = window.switchRosterMonth;
      window.switchRosterMonth = function () { var r = _srm.apply(this, arguments); setTimeout(rpTrimMonthTabs, 50); return r; };
    }
    if (typeof window._processRosterRows === 'function') {
      var _prr = window._processRosterRows;
      window._processRosterRows = function (rows) { var r = _prr.apply(this, arguments); RP.lastRows = rows; try { rpRenderMyRoster(rows); rpTrimMonthTabs(); } catch (e) { console.warn('[Roster] my-roster', e); } return r; };
    }
    if (typeof window.setRosterViewMode === 'function') {
      var _svm = window.setRosterViewMode;
      window.setRosterViewMode = function (mode) { RP.rosterView = 'team'; var r = _svm.apply(this, arguments); rpApplyRosterView(); return r; };
    }
    // 5c. Codes defined in Control Deck are shown exactly as defined (label = code), typed by their kind
    if (typeof window.parseRosterStatus === 'function') {
      var _prs = window.parseRosterStatus;
      window.parseRosterStatus = function (raw, isWknd) {
        var def = rpShift(String(raw || '').trim());
        if (def) {
          var isWfh = def.code.toUpperCase().indexOf('WFH') > -1;
          var type = isWfh ? 'wfh' : def.kind === 'off' ? 'off' : def.kind === 'leave' ? 'leave' : def.kind === 'half' ? 'half' : 'present';
          var cls = { present: 'rc-p', wfh: 'rc-w', half: 'rc-h', leave: 'rc-a', off: 'rc-o' }[type];
          return { type: type, label: type === 'off' ? 'Off' : type === 'leave' ? 'Leave' : def.code, cls: cls };
        }
        return _prs.apply(this, arguments);
      };
    }

    // 6. Any fetch() of a db:// url (e.g. the pre-fetch of adjacent months) must not hit the network
    var _fetch = window.fetch;
    window.fetch = function (input) {
      var u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.indexOf('db://roster/') === 0) {
        var parts = u.replace('db://roster/', '').split('/'); var team = parts[0], k = (parts[1] || '').split(/[?&]/)[0];
        var csv = rpBuildSheetRows(k, team).map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
        var body = csv; return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(body); }, json: function () { return Promise.reject(new Error('csv')); } });
      }
      return _fetch.apply(this, arguments);
    };
  }, 100);
})();
