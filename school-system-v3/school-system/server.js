/**
 * 学校管理系统 - 独立后端
 * 运行：node server.js  （无需数据库，数据存 data/db.json）
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- 数据初始化（仅保留管理员正式账号） ---------- */
function seedDB() {
  return {
    users: [
      { id: 'u1', username: 'admin', password: 'admin123', role: 'admin', name: '黄校长', dept: '校办公室' },
    ],
    classes: [], students: [], teachers: [], grades: [],
    attendance: [], fees: [], notices: [], schedule: [], leaves: [],
  };
}
function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(seedDB(), null, 2), 'utf-8');
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8'); }
let db = loadDB();

/* ---------- token 鉴权 ---------- */
const tokens = {};
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = tokens[token];
  if (!userId) return res.status(401).json({ error: '未登录或登录已过期' });
  req.user = db.users.find(u => u.id === userId);
  next();
}
function needRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: '无权限' });
    next();
  };
}
function makeToken(userId) {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  tokens[token] = userId;
  return token;
}
const HOME = { admin: 'admin.html', teacher: 'teacher.html', student: 'student.html', parent: 'parent.html' };

function findOrCreateClass(className) {
  if (!className) return null;
  let cls = db.classes.find(c => c.name === className);
  if (!cls) {
    cls = { id: 'c' + Date.now(), name: className, grade: className.replace(/[0-9]+班.*/, ''), teacherId: null };
    db.classes.push(cls);
  }
  return cls;
}

/* ---------- 登录 / 注册 ---------- */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: '账号或密码错误' });
  res.json({ token: makeToken(user.id), role: user.role, name: user.name, userId: user.id, home: HOME[user.role] });
});
app.post('/api/logout', (req, res) => {
  delete tokens[(req.headers.authorization || '').replace('Bearer ', '')];
  res.json({ ok: true });
});

app.post('/api/register', (req, res) => {
  const { role, username, password, name } = req.body;
  if (!role || !username || !password || !name) return res.status(400).json({ error: '请填写完整信息' });
  if (!['teacher', 'student', 'parent'].includes(role)) return res.status(400).json({ error: '不支持的角色' });
  if (db.users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

  const userId = 'u' + Date.now();
  let user;
  if (role === 'teacher') {
    const teacherId = 't' + Date.now();
    const subject = req.body.subject || '';
    let classId = null;
    if (req.body.className) {
      const cls = findOrCreateClass(req.body.className);
      if (cls) { classId = cls.id; cls.teacherId = userId; }
    }
    user = { id: userId, username, password, role: 'teacher', name, subject, teacherId, classId };
    db.teachers.push({ id: teacherId, name, subject, classId, userId });
  } else if (role === 'student') {
    const cls = findOrCreateClass(req.body.className || '');
    const studentId = 's' + Date.now();
    const studentNo = req.body.studentNo || String(20260000 + db.students.length + 1);
    user = { id: userId, username, password, role: 'student', name, gender: req.body.gender || '男', classId: cls ? cls.id : null, studentId };
    db.students.push({ id: studentId, name, gender: req.body.gender || '男', studentNo, classId: cls ? cls.id : null, userId });
  } else {
    const child = db.students.find(s => s.name === req.body.childName);
    user = { id: userId, username, password, role: 'parent', name, childId: child ? child.id : null, childName: req.body.childName || '' };
  }
  db.users.push(user);
  saveDB(db);
  res.json({ token: makeToken(userId), role: user.role, name: user.name, userId: user.id, home: HOME[user.role] });
});

app.get('/api/public/students', (req, res) => {
  res.json(db.students.map(s => ({ id: s.id, name: s.name, className: (db.classes.find(c => c.id === s.classId) || {}).name || '' })));
});

app.get('/api/notices', auth, (req, res) => res.json(db.notices));

/* ---------- 通用：修改密码 ---------- */
app.post('/api/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (req.user.password !== oldPassword) return res.status(400).json({ error: '原密码错误' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  req.user.password = newPassword;
  saveDB(db);
  res.json({ ok: true });
});

/* ---------- 管理员 ---------- */
app.get('/api/admin/stats', auth, needRole('admin'), (req, res) => {
  res.json({
    students: db.students.length, teachers: db.teachers.length,
    classes: db.classes.length, unpaidFees: db.fees.filter(f => !f.paid).length,
    leaves: db.leaves.filter(l => l.status === '待审批').length,
  });
});
app.get('/api/admin/students', auth, needRole('admin'), (req, res) => res.json(db.students));
app.post('/api/admin/students', auth, needRole('admin'), (req, res) => {
  let { className, ...rest } = req.body;
  let classId = rest.classId || null;
  if (className) { const c = findOrCreateClass(className); classId = c ? c.id : null; }
  const s = { id: 's' + Date.now(), gender: '男', studentNo: '', classId, ...rest };
  db.students.push(s); saveDB(db); res.json(s);
});
app.delete('/api/admin/students/:id', auth, needRole('admin'), (req, res) => {
  const id = req.params.id;
  db.students = db.students.filter(s => s.id !== id);
  db.grades = db.grades.filter(g => g.studentId !== id);
  db.attendance = db.attendance.filter(a => a.studentId !== id);
  db.fees = db.fees.filter(f => f.studentId !== id);
  db.leaves = db.leaves.filter(l => l.studentId !== id);
  const su = db.users.find(u => u.studentId === id);
  if (su) db.users = db.users.filter(u => u.id !== su.id);
  saveDB(db); res.json({ ok: true });
});
app.get('/api/admin/teachers', auth, needRole('admin'), (req, res) => res.json(db.teachers));
app.delete('/api/admin/teachers/:id', auth, needRole('admin'), (req, res) => {
  const t = db.teachers.find(x => x.id === req.params.id);
  db.teachers = db.teachers.filter(x => x.id !== req.params.id);
  if (t && t.userId) db.users = db.users.filter(u => u.id !== t.userId);
  db.classes.forEach(c => { if (t && c.teacherId === t.userId) c.teacherId = null; });
  saveDB(db); res.json({ ok: true });
});
app.get('/api/admin/classes', auth, needRole('admin'), (req, res) => res.json(db.classes));
app.post('/api/admin/classes', auth, needRole('admin'), (req, res) => {
  const c = { id: 'c' + Date.now(), name: req.body.name, grade: req.body.grade || '', teacherId: null };
  db.classes.push(c); saveDB(db); res.json(c);
});
app.delete('/api/admin/classes/:id', auth, needRole('admin'), (req, res) => {
  db.classes = db.classes.filter(c => c.id !== req.params.id);
  db.students.forEach(s => { if (s.classId === req.params.id) s.classId = null; });
  saveDB(db); res.json({ ok: true });
});
app.patch('/api/admin/classes/:id', auth, needRole('admin'), (req, res) => {
  const c = db.classes.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: '班级不存在' });
  c.teacherId = req.body.teacherId || null;
  saveDB(db); res.json(c);
});
app.get('/api/admin/users', auth, needRole('admin'), (req, res) => {
  res.json(db.users.map(u => ({ id: u.id, username: u.username, role: u.role, name: u.name })));
});
app.get('/api/admin/parents', auth, needRole('admin'), (req, res) => {
  res.json(db.users.filter(u => u.role === 'parent').map(u => {
    const child = u.childId ? db.students.find(s => s.id === u.childId) : null;
    return { id: u.id, name: u.name, username: u.username, childName: child ? child.name : (u.childName || '未关联') };
  }));
});
app.delete('/api/admin/users/:id', auth, needRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  if (u.studentId) {
    db.students = db.students.filter(s => s.id !== u.studentId);
    db.grades = db.grades.filter(g => g.studentId !== u.studentId);
    db.attendance = db.attendance.filter(a => a.studentId !== u.studentId);
    db.fees = db.fees.filter(f => f.studentId !== u.studentId);
  }
  if (u.teacherId) db.teachers = db.teachers.filter(t => t.id !== u.teacherId);
  db.users = db.users.filter(x => x.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});
app.get('/api/admin/fees', auth, needRole('admin'), (req, res) => res.json(db.fees));
app.post('/api/admin/fees', auth, needRole('admin'), (req, res) => {
  const f = { id: 'f' + Date.now(), paid: false, ...req.body };
  db.fees.push(f); saveDB(db); res.json(f);
});
app.patch('/api/admin/fees/:id', auth, needRole('admin'), (req, res) => {
  const f = db.fees.find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: '记录不存在' });
  f.paid = req.body.paid;
  saveDB(db); res.json(f);
});
app.get('/api/admin/notices', auth, needRole('admin'), (req, res) => res.json(db.notices));
app.post('/api/admin/notices', auth, needRole('admin'), (req, res) => {
  const n = { id: 'n' + Date.now(), date: new Date().toISOString().slice(0, 10), ...req.body };
  db.notices.unshift(n); saveDB(db); res.json(n);
});
app.delete('/api/admin/notices/:id', auth, needRole('admin'), (req, res) => {
  db.notices = db.notices.filter(n => n.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});
app.get('/api/admin/leaves', auth, needRole('admin'), (req, res) => res.json(db.leaves));
app.patch('/api/admin/leaves/:id', auth, needRole('admin'), (req, res) => {
  const l = db.leaves.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: '请假不存在' });
  l.status = req.body.status;
  saveDB(db); res.json(l);
});

/* ---------- 教师 ---------- */
app.get('/api/teacher/students', auth, needRole('teacher'), (req, res) => {
  const cls = db.classes.find(c => c.teacherId === req.user.id) || null;
  const classId = cls ? cls.id : null;
  res.json({ class: cls, students: db.students.filter(s => s.classId === classId) });
});
app.post('/api/teacher/grades', auth, needRole('teacher'), (req, res) => {
  const g = { id: 'g' + Date.now(), ...req.body };
  db.grades.push(g); saveDB(db); res.json(g);
});
app.get('/api/teacher/grades', auth, needRole('teacher'), (req, res) => {
  const cls = db.classes.find(c => c.teacherId === req.user.id) || null;
  const ids = db.students.filter(s => s.classId === (cls ? cls.id : null)).map(s => s.id);
  res.json(db.grades.filter(g => ids.includes(g.studentId)));
});
app.delete('/api/teacher/grades/:id', auth, needRole('teacher'), (req, res) => {
  db.grades = db.grades.filter(g => g.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});
app.post('/api/teacher/attendance', auth, needRole('teacher'), (req, res) => {
  const a = { id: 'a' + Date.now(), date: new Date().toISOString().slice(0, 10), ...req.body };
  db.attendance.push(a); saveDB(db); res.json(a);
});
app.post('/api/teacher/notices', auth, needRole('teacher'), (req, res) => {
  const n = { id: 'n' + Date.now(), date: new Date().toISOString().slice(0, 10), target: '本班', teacherId: req.user.id, ...req.body };
  db.notices.unshift(n); saveDB(db); res.json(n);
});
app.delete('/api/teacher/notices/:id', auth, needRole('teacher'), (req, res) => {
  db.notices = db.notices.filter(n => n.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});
app.get('/api/teacher/leaves', auth, needRole('teacher'), (req, res) => {
  const cls = db.classes.find(c => c.teacherId === req.user.id) || null;
  const ids = db.students.filter(s => s.classId === (cls ? cls.id : null)).map(s => s.id);
  res.json(db.leaves.filter(l => ids.includes(l.studentId)));
});
app.patch('/api/teacher/leaves/:id', auth, needRole('teacher'), (req, res) => {
  const l = db.leaves.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: '请假不存在' });
  l.status = req.body.status;
  saveDB(db); res.json(l);
});

/* ---------- 学生 ---------- */
app.get('/api/student/me', auth, needRole('student'), (req, res) => {
  const sid = req.user.studentId;
  res.json({
    user: req.user,
    grades: sid ? db.grades.filter(g => g.studentId === sid) : [],
    attendance: sid ? db.attendance.filter(a => a.studentId === sid) : [],
    schedule: db.schedule.filter(s => s.classId === req.user.classId),
    notices: db.notices,
    leaves: db.leaves.filter(l => l.studentId === sid),
  });
});
app.post('/api/student/leave', auth, needRole('student'), (req, res) => {
  const l = { id: 'l' + Date.now(), studentId: req.user.studentId || req.user.id, studentName: req.user.name, status: '待审批', ...req.body };
  db.leaves.push(l); saveDB(db); res.json(l);
});
app.delete('/api/student/leaves/:id', auth, needRole('student'), (req, res) => {
  const l = db.leaves.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ error: '请假不存在' });
  if (l.status !== '待审批') return res.status(400).json({ error: '已审批的请假不能撤回' });
  db.leaves = db.leaves.filter(x => x.id !== req.params.id);
  saveDB(db); res.json({ ok: true });
});

/* ---------- 家长 ---------- */
app.get('/api/parent/me', auth, needRole('parent'), (req, res) => {
  const cid = req.user.childId;
  const child = cid ? db.students.find(s => s.id === cid) : null;
  res.json({
    user: req.user,
    child: child || null,
    grades: cid ? db.grades.filter(g => g.studentId === cid) : [],
    attendance: cid ? db.attendance.filter(a => a.studentId === cid) : [],
    fees: cid ? db.fees.filter(f => f.studentId === cid) : [],
    notices: db.notices,
    schedule: child ? db.schedule.filter(s => s.classId === child.classId) : [],
    leaves: cid ? db.leaves.filter(l => l.studentId === cid) : [],
  });
});
app.post('/api/parent/leave', auth, needRole('parent'), (req, res) => {
  const cid = req.user.childId;
  const child = cid ? db.students.find(s => s.id === cid) : null;
  const l = { id: 'l' + Date.now(), studentId: cid || req.user.id, studentName: child ? child.name : req.user.childName, status: '待审批', from: '家长', ...req.body };
  db.leaves.push(l); saveDB(db); res.json(l);
});

/* ---------- 兜底 ---------- */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.listen(PORT, () => {
  console.log(`学校管理系统已启动: http://localhost:${PORT}`);
  console.log('管理员账号: admin / admin123 （黄校长）');
});
