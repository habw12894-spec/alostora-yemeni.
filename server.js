import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL) console.warn('WARNING: DATABASE_URL is not configured.');
if (!jwtSecret || jwtSecret.length < 32) console.warn('WARNING: Set JWT_SECRET to a random secret of at least 32 characters.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
const uploadDir = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use(helmet({ contentSecurityPolicy: false })); // الواجهة الحالية تحتوي على CSS/JS مضمّن؛ فعّل CSP مضبوطًا قبل الإنتاج
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map(x=>x.trim()) : false }));
app.use(express.json({ limit: '1mb' }));
const publicDir = path.resolve(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir, { fallthrough: false, setHeaders: res => res.setHeader('X-Content-Type-Options','nosniff') }));
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
const hashCode = value => crypto.createHash('sha256').update(value).digest('hex');
const tokenFor = user => jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
const auth = async (req,res,next) => {
 try { const value = req.headers.authorization || ''; const token = value.startsWith('Bearer ') ? value.slice(7) : ''; if (!token || !jwtSecret || jwtSecret.length < 32) return res.status(401).json({error:'يلزم تسجيل الدخول'}); const payload = jwt.verify(token,jwtSecret); const result = await pool.query('SELECT id, display_name, email, phone, role, avatar_url, bio FROM users WHERE id=$1 AND is_active=TRUE',[payload.sub]); if (!result.rowCount) return res.status(401).json({error:'الحساب غير متاح'}); req.user=result.rows[0]; next(); } catch { return res.status(401).json({error:'جلسة الدخول غير صالحة'}); }
};
const admin = (req,res,next) => req.user?.role === 'admin' ? next() : res.status(403).json({error:'هذه العملية للمشرف فقط'});
const safeUser = u => ({id:u.id, displayName:u.display_name, email:u.email, phone:u.phone, role:u.role, avatarUrl:u.avatar_url, bio:u.bio});
app.get('/api/health', async (_req,res) => { try { await pool.query('SELECT 1'); res.json({ok:true,service:'افنكس',database:'connected'}); } catch { res.status(503).json({ok:false,service:'افنكس',database:'unavailable'}); } });

app.post('/api/auth/register', async (req,res) => {
 try {
  const displayName=String(req.body.displayName||'').trim(); const email=req.body.email ? String(req.body.email).trim().toLowerCase() : null; const phone=req.body.phone ? String(req.body.phone).trim() : null; const password=String(req.body.password||'');
  if(displayName.length<2 || displayName.length>80 || (!email&&!phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) || password.length<10 || password.length>128) return res.status(400).json({error:'أدخل اسمًا صحيحًا ورقم هاتف أو بريدًا صالحًا وكلمة مرور لا تقل عن 10 أحرف.'});
  const passwordHash=await bcrypt.hash(password,12); const result=await pool.query('INSERT INTO users(display_name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,display_name,email,phone,role,avatar_url,bio',[displayName,email,phone,passwordHash]);
  res.status(201).json({message:'تم إنشاء الحساب. فعّل رقم الهاتف أو البريد قبل اعتبار الحساب موثقًا.',user:safeUser(result.rows[0]),token:tokenFor(result.rows[0]),verification:{email:!!email,phone:!!phone,deliveryConfigured:false}});
 } catch(e) { if(e.code==='23505') return res.status(409).json({error:'رقم الهاتف أو البريد مستخدم بالفعل'}); console.error(e); res.status(500).json({error:'تعذر إنشاء الحساب'}); }
});
app.post('/api/auth/login', async (req,res) => {
 try { const identifier=String(req.body.identifier||'').trim().toLowerCase(); const password=String(req.body.password||''); const r=await pool.query('SELECT * FROM users WHERE lower(coalesce(email,\'\'))=$1 OR phone=$2 LIMIT 1',[identifier,identifier]); if(!r.rowCount || !r.rows[0].is_active || !(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({error:'بيانات الدخول غير صحيحة'}); res.json({token:tokenFor(r.rows[0]),user:safeUser(r.rows[0])}); } catch(e){console.error(e);res.status(500).json({error:'تعذر تسجيل الدخول'});}
});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.patch('/api/me',auth,async(req,res)=>{const displayName=String(req.body.displayName??req.user.display_name).trim();const bio=String(req.body.bio??req.user.bio).trim();if(displayName.length<2||displayName.length>80||bio.length>300)return res.status(400).json({error:'تحقق من الاسم والنبذة'});const r=await pool.query('UPDATE users SET display_name=$1,bio=$2,updated_at=NOW() WHERE id=$3 RETURNING id,display_name,email,phone,role,avatar_url,bio',[displayName,bio,req.user.id]);res.json({user:safeUser(r.rows[0])});});

const maxBytes = Number(process.env.MAX_VIDEO_MB || 100) * 1024 * 1024;
const storage=multer.diskStorage({destination:(_req,_file,cb)=>cb(null,uploadDir),filename:(_req,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase().slice(0,10))});
const upload=multer({storage,limits:{fileSize:maxBytes,files:1},fileFilter:(_req,file,cb)=>{const allowed=['video/mp4','video/webm','video/quicktime'];cb(allowed.includes(file.mimetype)?null:new Error('الأنواع المدعومة حاليًا MP4 وWebM وMOV فقط'),allowed.includes(file.mimetype));}});
app.get('/api/videos',async(req,res)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||20,1),50);const r=await pool.query(`SELECT v.id,v.caption,v.video_url,v.created_at,u.id AS user_id,u.display_name, (SELECT count(*)::int FROM likes l WHERE l.video_id=v.id) AS likes_count,(SELECT count(*)::int FROM comments c WHERE c.video_id=v.id) AS comments_count FROM videos v JOIN users u ON u.id=v.user_id WHERE v.status='published' AND u.is_active=TRUE ORDER BY v.created_at DESC LIMIT $1`,[limit]);res.json({videos:r.rows.map(v=>({...v,videoUrl:v.video_url,user:{id:v.user_id,displayName:v.display_name},likesCount:v.likes_count,commentsCount:v.comments_count}))});}catch(e){console.error(e);res.status(500).json({error:'تعذر تحميل الفيديوهات'});}});
app.post('/api/videos',auth,(req,res)=>upload.single('video')(req,res,async err=>{if(err)return res.status(400).json({error:err.message||'تعذر رفع الفيديو'});if(!req.file)return res.status(400).json({error:'اختر ملف فيديو'});try{const caption=String(req.body.caption||'').trim().slice(0,500);const url='/uploads/'+req.file.filename;const r=await pool.query('INSERT INTO videos(user_id,caption,video_url,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id,caption,video_url,created_at',[req.user.id,caption,url,req.file.mimetype,req.file.size]);res.status(201).json({video:r.rows[0]});}catch(e){fs.unlink(req.file.path,()=>{});console.error(e);res.status(500).json({error:'تعذر حفظ الفيديو'});}}));
app.post('/api/videos/:id/like',auth,async(req,res)=>{try{const r=await pool.query('INSERT INTO likes(user_id,video_id) SELECT $1,id FROM videos WHERE id=$2 AND status=\'published\' ON CONFLICT DO NOTHING RETURNING video_id',[req.user.id,req.params.id]);if(!r.rowCount){const exists=await pool.query('SELECT 1 FROM videos WHERE id=$1 AND status=\'published\'',[req.params.id]);if(!exists.rowCount)return res.status(404).json({error:'الفيديو غير موجود'});await pool.query('DELETE FROM likes WHERE user_id=$1 AND video_id=$2',[req.user.id,req.params.id]);return res.json({liked:false});}res.json({liked:true});}catch(e){console.error(e);res.status(500).json({error:'تعذر تسجيل الإعجاب'});}});
app.get('/api/videos/:id/comments',async(req,res)=>{try{const r=await pool.query('SELECT c.id,c.body,c.created_at,u.id AS user_id,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.video_id=$1 ORDER BY c.created_at ASC LIMIT 100',[req.params.id]);res.json({comments:r.rows.map(c=>({id:c.id,body:c.body,createdAt:c.created_at,user:{id:c.user_id,displayName:c.display_name}}))});}catch(e){res.status(500).json({error:'تعذر تحميل التعليقات'});}});
app.post('/api/videos/:id/comments',auth,async(req,res)=>{const body=String(req.body.body||'').trim();if(!body||body.length>1000)return res.status(400).json({error:'اكتب تعليقًا من 1 إلى 1000 حرف'});try{const r=await pool.query('INSERT INTO comments(user_id,video_id,body) SELECT $1,id,$3 FROM videos WHERE id=$2 AND status=\'published\' RETURNING id,body,created_at',[req.user.id,req.params.id,body]);if(!r.rowCount)return res.status(404).json({error:'الفيديو غير موجود'});res.status(201).json({comment:r.rows[0]});}catch(e){console.error(e);res.status(500).json({error:'تعذر إضافة التعليق'});}});
app.post('/api/users/:id/follow',auth,async(req,res)=>{if(req.params.id===req.user.id)return res.status(400).json({error:'لا يمكنك متابعة نفسك'});try{const r=await pool.query('INSERT INTO follows(follower_id,followed_id) SELECT $1,id FROM users WHERE id=$2 AND is_active=TRUE ON CONFLICT DO NOTHING RETURNING followed_id',[req.user.id,req.params.id]);if(!r.rowCount){const exists=await pool.query('SELECT 1 FROM users WHERE id=$1 AND is_active=TRUE',[req.params.id]);if(!exists.rowCount)return res.status(404).json({error:'المستخدم غير موجود'});await pool.query('DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2',[req.user.id,req.params.id]);return res.json({following:false});}res.json({following:true});}catch(e){console.error(e);res.status(500).json({error:'تعذرت المتابعة'});}});
app.post('/api/videos/:id/report',auth,async(req,res)=>{const reason=String(req.body.reason||'').trim();if(reason.length<3||reason.length>300)return res.status(400).json({error:'اذكر سبب البلاغ'});try{const r=await pool.query('INSERT INTO reports(reporter_id,video_id,reason) SELECT $1,id,$3 FROM videos WHERE id=$2 RETURNING id,status,created_at',[req.user.id,req.params.id,reason]);if(!r.rowCount)return res.status(404).json({error:'الفيديو غير موجود'});res.status(201).json({report:r.rows[0]});}catch(e){console.error(e);res.status(500).json({error:'تعذر إرسال البلاغ'});}});
app.get('/api/admin/reports',auth,admin,async(_req,res)=>{const r=await pool.query('SELECT r.id,r.reason,r.status,r.created_at,v.caption,u.display_name AS reporter FROM reports r LEFT JOIN videos v ON v.id=r.video_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 200');res.json({reports:r.rows});});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'حدث خطأ غير متوقع'});});
app.use((req,res,next) => { if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next(); res.sendFile(path.join(publicDir, 'index.html')); });
app.listen(port,()=>console.log(`AVNEX app listening on port ${port}`));
