// ===== Family Tasks core logic (shared by the Google Apps Script backend and the in-app demo mode) =====
// db: { all(table), insert(table, row), update(table, match, patch), remove(table, match) }
// opts: { hash(salt, password), rand(len), now() }
function makeCore(db, opts) {
  var SESSION_DAYS = 90;
  var TYPES = ['family', 'school', 'work', 'friends', 'church', 'sports', 'club', 'roommates', 'other'];
  var MAX_GROUPS = 10;
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function fail(e) { return { ok: false, error: e }; }
  function clean(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
  function find(t, f) { var a = db.all(t); for (var i = 0; i < a.length; i++) if (f(a[i])) return a[i]; return null; }
  function filter(t, f) { return db.all(t).filter(f); }
  function newId() { return opts.rand(12); }
  function recCode(n) { var s = ''; for (var i = 0; i < n; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length)); return s; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function parseJson(v, d) { try { return JSON.parse(v || '') || d; } catch (e) { return d; } }
  function newCode() { var s = ''; for (var i = 0; i < 4; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length)); return 'FAM-' + s; }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d)); }
  function validTime(t) { return t === '' || /^\d{2}:\d{2}$/.test(String(t)); }

  function auth(req) {
    var s = find('sessions', function (x) { return x.token === String(req.token || ''); });
    if (!s || Number(s.expires) < opts.now()) return null;
    return find('users', function (u) { return u.id === s.userId; });
  }
  function membership(userId, groupId) { return find('members', function (m) { return m.userId === userId && (!groupId || m.groupId === groupId); }); }
  function myGroups(userId) {
    return filter('members', function (m) { return m.userId === userId; }).map(function (m) {
      var g = groupInfo(m.groupId); if (!g) return null;
      g.role = m.role; g.nickname = m.nickname; return g;
    }).filter(function (x) { return x; });
  }
  function groupInfo(groupId) {
    var g = find('groups', function (x) { return x.id === groupId; });
    if (!g) return null;
    return { id: g.id, name: g.name, code: g.code, ownerId: g.ownerId, type: TYPES.indexOf(g.type) >= 0 ? g.type : 'family' };
  }
  function membersOf(groupId) {
    return filter('members', function (m) { return m.groupId === groupId; })
      .map(function (m) { return { userId: m.userId, nickname: m.nickname, role: m.role, joined: Number(m.joined) }; });
  }
  function publicTask(t) {
    return { id: t.id, title: t.title, assignee: t.assignee, createdBy: t.createdBy, date: t.date, time: t.time,
      repeat: t.repeat, notify: String(t.notify) === 'true' || t.notify === true, done: parseJson(t.done, []),
      status: parseJson(t.status, {}), endTime: t.endTime || '', endDate: t.endDate || '', cheer: parseJson(t.cheer, { t: 'cat', c: 'random' }),
      updated: Number(t.updated) };
  }
  function nick(groupId, userId) {
    var m = find('members', function (x) { return x.groupId === groupId && x.userId === userId; });
    return m ? m.nickname : 'Someone';
  }
  function event(groupId, toUser, text, taskId) {
    db.insert('events', { id: newId(), groupId: groupId, toUser: toUser, text: text, taskId: taskId || '', created: String(opts.now()) });
  }
  function session(user) {
    var token = opts.rand(32);
    db.insert('sessions', { token: token, userId: user.id, expires: String(opts.now() + SESSION_DAYS * 86400000) });
    return token;
  }
  function me(user, groupId) {
    var m = (groupId && membership(user.id, groupId)) || membership(user.id);
    return { ok: true, user: { id: user.id, username: user.username }, group: m ? groupInfo(m.groupId) : null,
      role: m ? m.role : null, nickname: m ? m.nickname : null, groups: myGroups(user.id) };
  }
  function needGroup(req) {
    var u = auth(req); if (!u) return { err: fail('not_logged_in') };
    var m = (req.groupId && membership(u.id, String(req.groupId))) || membership(u.id);
    if (!m) return { err: fail('no_group') };
    return { user: u, mem: m };
  }

  var A = {};
  A.signup = function (req) {
    var username = clean(req.username, 30).toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail('bad_username');
    if (String(req.password || '').length < 6) return fail('weak_password');
    if (find('users', function (u) { return u.username === username; })) return fail('username_taken');
    var salt = opts.rand(16), rec = recCode(8);
    var user = { id: newId(), username: username, salt: salt, hash: opts.hash(salt, String(req.password)), created: String(opts.now()),
      recHash: opts.hash(salt, 'rec:' + rec), resetHash: '', resetExp: '' };
    db.insert('users', user);
    var r = me(user); r.token = session(user); r.recoveryCode = rec.slice(0, 4) + '-' + rec.slice(4); return r;
  };
  A.login = function (req) {
    var username = clean(req.username, 30).toLowerCase();
    var u = find('users', function (x) { return x.username === username; });
    if (!u || opts.hash(u.salt, String(req.password || '')) !== u.hash) return fail('wrong_login');
    var r = me(u); r.token = session(u); return r;
  };
  // Forgot password: use your recovery code (given at sign-up) or a reset code from your family admin
  A.resetPassword = function (req) {
    var username = clean(req.username, 30).toLowerCase();
    var u = find('users', function (x) { return x.username === username; });
    var code = normCode(req.code);
    if (!u || !code) return fail('bad_reset_code');
    var okRec = u.recHash && opts.hash(u.salt, 'rec:' + code) === u.recHash;
    var okReset = u.resetHash && Number(u.resetExp) > opts.now() && opts.hash(u.salt, 'reset:' + code) === u.resetHash;
    if (!okRec && !okReset) return fail('bad_reset_code');
    if (String(req.password || '').length < 6) return fail('weak_password');
    db.update('users', function (x) { return x.id === u.id; }, { hash: opts.hash(u.salt, String(req.password)), resetHash: '', resetExp: '' });
    db.remove('sessions', function (s) { return s.userId === u.id; });
    u = find('users', function (x) { return x.id === u.id; });
    var r = me(u); r.token = session(u); return r;
  };
  A.changePassword = function (req) {
    var u = auth(req); if (!u) return fail('not_logged_in');
    if (opts.hash(u.salt, String(req.oldPassword || '')) !== u.hash) return fail('wrong_old_password');
    if (String(req.password || '').length < 6) return fail('weak_password');
    db.update('users', function (x) { return x.id === u.id; }, { hash: opts.hash(u.salt, String(req.password)) });
    db.remove('sessions', function (s) { return s.userId === u.id && s.token !== String(req.token); });
    return { ok: true };
  };
  A.newRecoveryCode = function (req) {
    var u = auth(req); if (!u) return fail('not_logged_in');
    if (opts.hash(u.salt, String(req.password || '')) !== u.hash) return fail('wrong_login');
    var rec = recCode(8);
    db.update('users', function (x) { return x.id === u.id; }, { recHash: opts.hash(u.salt, 'rec:' + rec) });
    return { ok: true, recoveryCode: rec.slice(0, 4) + '-' + rec.slice(4) };
  };
  A.adminResetCode = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    if (c.mem.role !== 'admin') return fail('admins_only');
    var m = find('members', function (x) { return x.groupId === c.mem.groupId && x.userId === req.userId; });
    if (!m) return fail('not_a_member');
    var u = find('users', function (x) { return x.id === req.userId; }); if (!u) return fail('not_found');
    var code = recCode(6);
    db.update('users', function (x) { return x.id === u.id; }, { resetHash: opts.hash(u.salt, 'reset:' + code), resetExp: String(opts.now() + 86400000) });
    return { ok: true, code: code, username: u.username, nickname: m.nickname };
  };
  A.logout = function (req) { db.remove('sessions', function (s) { return s.token === String(req.token || ''); }); return { ok: true }; };
  A.me = function (req) { var u = auth(req); return u ? me(u) : fail('not_logged_in'); };

  A.createGroup = function (req) {
    var u = auth(req); if (!u) return fail('not_logged_in');
    if (myGroups(u.id).length >= MAX_GROUPS) return fail('too_many_groups');
    var type = TYPES.indexOf(req.type) >= 0 ? req.type : 'family';
    var name = clean(req.name, 40) || 'My Group';
    var nickname = clean(req.nickname, 20) || u.username;
    var code; do { code = newCode(); } while (find('groups', function (g) { return g.code === code; }));
    var g = { id: newId(), name: name, code: code, ownerId: u.id, created: String(opts.now()), type: type };
    db.insert('groups', g);
    db.insert('members', { groupId: g.id, userId: u.id, nickname: nickname, role: 'admin', joined: String(opts.now()) });
    return me(u, g.id);
  };
  A.joinGroup = function (req) {
    var u = auth(req); if (!u) return fail('not_logged_in');
    if (myGroups(u.id).length >= MAX_GROUPS) return fail('too_many_groups');
    var code = clean(req.code, 12).toUpperCase().replace(/\s/g, '');
    if (code && code.indexOf('FAM-') !== 0) code = 'FAM-' + code;
    var g = find('groups', function (x) { return x.code === code; });
    if (!g) return fail('bad_code');
    if (membership(u.id, g.id)) return fail('already_in_group');
    if (membersOf(g.id).length >= 30) return fail('group_full');
    var nickname = clean(req.nickname, 20) || u.username;
    db.insert('members', { groupId: g.id, userId: u.id, nickname: nickname, role: 'member', joined: String(opts.now()) });
    membersOf(g.id).forEach(function (m) { if (m.userId !== u.id) event(g.id, m.userId, nickname + ' joined ' + g.name, ''); });
    return me(u, g.id);
  };
  A.leaveGroup = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var gid = c.mem.groupId;
    db.remove('members', function (m) { return m.userId === c.user.id && m.groupId === gid; });
    var left = membersOf(gid);
    if (!left.length) {
      db.remove('groups', function (g) { return g.id === gid; });
      db.remove('tasks', function (t) { return t.groupId === gid; });
      db.remove('events', function (e) { return e.groupId === gid; });
    } else if (!left.some(function (m) { return m.role === 'admin'; })) {
      db.update('members', function (m) { return m.groupId === gid && m.userId === left[0].userId; }, { role: 'admin' });
    }
    return me(c.user);
  };
  A.setNickname = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var n = clean(req.nickname, 20); if (!n) return fail('empty_nickname');
    db.update('members', function (m) { return m.userId === c.user.id && m.groupId === c.mem.groupId; }, { nickname: n });
    return { ok: true };
  };
  A.removeMember = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    if (c.mem.role !== 'admin') return fail('admins_only');
    if (req.userId === c.user.id) return fail('use_leave');
    db.remove('members', function (m) { return m.groupId === c.mem.groupId && m.userId === req.userId; });
    return { ok: true };
  };
  A.updateGroup = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    if (c.mem.role !== 'admin') return fail('admins_only');
    var patch = {}, name = clean(req.name, 40);
    if (name) patch.name = name;
    if (TYPES.indexOf(req.type) >= 0) patch.type = req.type;
    db.update('groups', function (g) { return g.id === c.mem.groupId; }, patch);
    return { ok: true, group: groupInfo(c.mem.groupId) };
  };
  A.newCode = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    if (c.mem.role !== 'admin') return fail('admins_only');
    var code; do { code = newCode(); } while (find('groups', function (g) { return g.code === code; }));
    db.update('groups', function (g) { return g.id === c.mem.groupId; }, { code: code });
    return { ok: true, code: code };
  };

  A.sync = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var gid = c.mem.groupId, since = Number(req.since || 0), cutoff = opts.now() - 45 * 86400000;
    var tasks = filter('tasks', function (t) { return t.groupId === gid; }).map(publicTask)
      .filter(function (t) { return t.repeat !== 'once' || Date.parse(t.date + 'T00:00:00Z') > cutoff; });
    var events = filter('events', function (e) { return e.toUser === c.user.id && Number(e.created) > since; })
      .map(function (e) { return { id: e.id, text: e.text, taskId: e.taskId, created: Number(e.created) }; });
    return { ok: true, group: groupInfo(gid), members: membersOf(gid), tasks: tasks, events: events,
      me: { id: c.user.id, username: c.user.username, nickname: c.mem.nickname, role: c.mem.role }, groups: myGroups(c.user.id), now: opts.now() };
  };
  A.saveTask = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var gid = c.mem.groupId, t = req.task || {};
    var title = clean(t.title, 80); if (!title) return fail('empty_title');
    if (!validDate(t.date)) return fail('bad_date');
    var time = String(t.time || ''); if (!validTime(time)) return fail('bad_time');
    var repeat = ['once', 'daily', 'weekdays', 'weekly'].indexOf(t.repeat) >= 0 ? t.repeat : 'once';
    var assignee = String(t.assignee || c.user.id);
    if (!find('members', function (m) { return m.groupId === gid && m.userId === assignee; })) return fail('not_a_member');
    var notify = t.notify !== false;
    var endTime = String(t.endTime || ''); if (!validTime(endTime)) return fail('bad_time');
    if (endTime && !time) { time = endTime; endTime = ''; }
    if (endTime && endTime <= time) return fail('end_before_start');
    var endDate = repeat === 'once' ? '' : String(t.endDate || '');
    if (endDate && (!validDate(endDate) || endDate < t.date)) return fail('bad_end_date');
    var ch = t.cheer || {}, cheer = { t: 'cat', c: 'random' };
    if (ch.t === 'none') cheer = { t: 'none' };
    else if (ch.t === 'custom' && clean(ch.x, 140)) cheer = { t: 'custom', x: clean(ch.x, 140) };
    else if (ch.t === 'cat' && /^[a-z]{2,12}$/.test(String(ch.c || ''))) cheer = { t: 'cat', c: ch.c };
    cheer = JSON.stringify(cheer);
    var by = c.mem.nickname, row;
    if (t.id) {
      var old = find('tasks', function (x) { return x.id === t.id && x.groupId === gid; });
      if (!old) return fail('not_found');
      db.update('tasks', function (x) { return x.id === t.id; }, { title: title, assignee: assignee, date: t.date, time: time, repeat: repeat, notify: String(notify),
        endTime: endTime, endDate: endDate, cheer: cheer, updated: String(opts.now()) });
      if (notify && assignee !== c.user.id && old.assignee !== assignee) event(gid, assignee, by + ' assigned you: ' + title, t.id);
      else if (notify && assignee !== c.user.id) event(gid, assignee, by + ' updated: ' + title, t.id);
      row = find('tasks', function (x) { return x.id === t.id; });
    } else {
      row = { id: newId(), groupId: gid, title: title, assignee: assignee, createdBy: c.user.id, date: t.date, time: time,
        repeat: repeat, notify: String(notify), done: '[]', status: '{}', created: String(opts.now()), updated: String(opts.now()),
        endTime: endTime, endDate: endDate, cheer: cheer };
      db.insert('tasks', row);
      if (notify && assignee !== c.user.id) event(gid, assignee, by + ' assigned you: ' + title, row.id);
    }
    return { ok: true, task: publicTask(row) };
  };
  A.toggleDone = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var t = find('tasks', function (x) { return x.id === req.taskId && x.groupId === c.mem.groupId; });
    if (!t) return fail('not_found');
    if (!validDate(req.date)) return fail('bad_date');
    var done = []; try { done = JSON.parse(t.done || '[]'); } catch (e) {}
    var i = done.indexOf(req.date), nowDone = i < 0;
    if (nowDone) done.push(req.date); else done.splice(i, 1);
    done = done.sort().slice(-120);
    var smap = parseJson(t.status, {}); delete smap[req.date];
    db.update('tasks', function (x) { return x.id === t.id; }, { done: JSON.stringify(done), status: JSON.stringify(smap), updated: String(opts.now()) });
    if (nowDone && t.createdBy !== c.user.id && String(t.notify) === 'true')
      event(c.mem.groupId, t.createdBy, c.mem.nickname + ' finished: ' + t.title, t.id);
    return { ok: true, done: done, status: smap };
  };
  var STATUS_TEXT = { ongoing: 'started', later: 'will do later', cancelled: 'cancelled', done: 'finished', todo: 'moved back to to-do' };
  A.setStatus = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var t = find('tasks', function (x) { return x.id === req.taskId && x.groupId === c.mem.groupId; });
    if (!t) return fail('not_found');
    if (!validDate(req.date)) return fail('bad_date');
    var st = String(req.status);
    if (!STATUS_TEXT[st]) return fail('bad_status');
    var done = parseJson(t.done, []), map = parseJson(t.status, {}), d = req.date;
    var i = done.indexOf(d); if (i >= 0) done.splice(i, 1);
    delete map[d];
    if (st === 'done') done.push(d);
    else if (st !== 'todo') {
      var e = { s: st, by: c.user.id, at: opts.now() };
      if (st === 'later' && req.until) e.until = Number(req.until);
      var note = clean(req.note, 120); if (note) e.note = note;
      map[d] = e;
    }
    var keys = Object.keys(map).sort(); while (keys.length > 60) delete map[keys.shift()];
    db.update('tasks', function (x) { return x.id === t.id; }, { done: JSON.stringify(done.sort().slice(-120)), status: JSON.stringify(map), updated: String(opts.now()) });
    if (String(t.notify) === 'true' && st !== 'todo') {
      var text = c.mem.nickname + ' ' + STATUS_TEXT[st] + ': ' + t.title + (map[d] && map[d].note ? ' (' + map[d].note + ')' : '');
      [t.createdBy, t.assignee].forEach(function (uid, k, arr) { if (uid !== c.user.id && arr.indexOf(uid) === k) event(c.mem.groupId, uid, text, t.id); });
    }
    return { ok: true, done: done, status: map };
  };
  A.nudge = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var t = find('tasks', function (x) { return x.id === req.taskId && x.groupId === c.mem.groupId; });
    if (!t) return fail('not_found');
    if (t.assignee === c.user.id) return fail('cannot_nudge_self');
    event(c.mem.groupId, t.assignee, c.mem.nickname + ' reminded you: ' + t.title, t.id);
    return { ok: true };
  };
  A.deleteTask = function (req) {
    var c = needGroup(req); if (c.err) return c.err;
    var t = find('tasks', function (x) { return x.id === req.taskId && x.groupId === c.mem.groupId; });
    if (!t) return fail('not_found');
    if (t.createdBy !== c.user.id && t.assignee !== c.user.id && c.mem.role !== 'admin') return fail('not_allowed');
    db.remove('tasks', function (x) { return x.id === t.id; });
    return { ok: true };
  };
  A.deleteAccount = function (req) {
    var u = auth(req); if (!u) return fail('not_logged_in');
    if (opts.hash(u.salt, String(req.password || '')) !== u.hash) return fail('wrong_login');
    myGroups(u.id).forEach(function (g) { A.leaveGroup({ token: req.token, groupId: g.id }); });
    db.remove('sessions', function (s) { return s.userId === u.id; });
    db.remove('events', function (e) { return e.toUser === u.id; });
    db.remove('users', function (x) { return x.id === u.id; });
    return { ok: true };
  };
  // Housekeeping: drop old events and expired sessions
  A._cleanup = function () {
    var old = opts.now() - 14 * 86400000;
    db.remove('events', function (e) { return Number(e.created) < old; });
    db.remove('sessions', function (s) { return Number(s.expires) < opts.now(); });
    return { ok: true };
  };
  return A;
}

var TABLES = {
  users: ['id', 'username', 'salt', 'hash', 'created', 'recHash', 'resetHash', 'resetExp'],
  sessions: ['token', 'userId', 'expires'],
  groups: ['id', 'name', 'code', 'ownerId', 'created', 'type'],
  members: ['groupId', 'userId', 'nickname', 'role', 'joined'],
  tasks: ['id', 'groupId', 'title', 'assignee', 'createdBy', 'date', 'time', 'repeat', 'notify', 'done', 'created', 'updated', 'status', 'endTime', 'endDate', 'cheer'],
  events: ['id', 'groupId', 'toUser', 'text', 'taskId', 'created']
};
// ===== end core =====
