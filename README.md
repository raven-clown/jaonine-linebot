# เจ้านาย (JaoNine) — LINE Task Bot

MVP โค้ดตาม `04-development-roadmap.md` Phase 1-5 (webhook → database → สร้างงาน → มอบหมาย/รับงาน → แจ้งเตือน)
Stack: NestJS + Prisma + PostgreSQL + node-cron (ตาม `02-architecture-tech-stack.md`, งบ 0 บาท)

## โครงสร้างโปรเจกต์

```
src/
  main.ts                     bootstrap (เปิด rawBody สำหรับตรวจลายเซ็น LINE)
  app.module.ts               ประกอบทุก module
  prisma/                     PrismaService (เชื่อม DB)
  line/                       LineService (reply/push, verify signature) + flex-builder (ข้อความ/Flex/Quick Reply)
  webhook/                    รับ event จาก LINE, ตรวจลายเซ็น
  commands/                   แปลความข้อความ/postback → เรียก service ที่เกี่ยวข้อง
  conversation/                state การสนทนาแบบ step-by-step ตอนสร้างงาน (in-memory)
  users/                      auto-register User/Group/GroupMember (Phase 2)
  tasks/                      สร้าง/มอบหมาย/รับ/เสร็จ/ถอนงาน + business logic (Phase 3-4)
  notifications/              จัดคิวแจ้งเตือน + scheduler ด้วย node-cron (Phase 5)
prisma/schema.prisma          schema ตาม 03-database-schema.md
```

## Setup

### 1. เตรียมบัญชี (Phase 0)

- สร้าง LINE Official Account + เปิด Messaging API → ได้ `Channel Secret` และ `Channel Access Token`
- สมัคร Supabase หรือ Neon (Postgres free tier) → ได้ `DATABASE_URL`
- สมัคร Render.com หรือ Fly.io (free tier hosting)

> Database พร้อมใช้แล้ว: provision Supabase project ชื่อ `jaonine` (ref `ojsbateovtayqxdpbrkr`) ไว้ให้แล้ว สร้างตารางครบทั้ง 7 ตามสคีมาปัจจุบัน (รวม `NotificationPreference`) และเปิด Row Level Security ทุกตาราง `DATABASE_URL` กรอกไว้ใน `.env` แล้ว เหลือแค่กรอก `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN`

### 2. ติดตั้งและตั้งค่า

```bash
cp .env.example .env   # แล้วกรอกค่าให้ครบ
npm install            # จะรัน prisma generate ให้อัตโนมัติ (postinstall)
npm run prisma:migrate # สร้างตารางตาม schema.prisma ในฐานข้อมูล
```

หมายเหตุ: ถ้า `npm install` รันในเครื่อง/สภาพแวดล้อมที่บล็อกการโหลด Prisma engine binary (บางแซนด์บ็อกซ์ปิด `binaries.prisma.sh`) จะเห็น error ตอน postinstall — รันซ้ำ `npx prisma generate` ในเครื่องที่ต่อเน็ตปกติ (เช่นเครื่องพี่เอง หรือตอน build บน Render/Fly) จะผ่านปกติ ไม่กระทบตอน deploy จริง

### 3. รันแบบ dev

```bash
npm run start:dev
```

ใช้ ngrok หรือคล้ายกันเพื่อเปิด public URL ชี้เข้าเครื่อง แล้วเอา URL + `/webhook` ไปตั้งใน LINE Developer Console (Webhook URL)

### 4. Deploy (Render/Fly free tier)

- Build command: `npm install && npm run build`
- Start command: `npm run start:prod`
- ตั้ง environment variables ให้ตรงกับ `.env.example`
- รัน `npm run prisma:deploy` (หรือใส่เป็น release command) เพื่อ migrate database บน production
- เอา URL ที่ได้ (`https://<app>.onrender.com/webhook`) ไปตั้งใน LINE Developer Console

## คำสั่งที่ใช้ในแชท LINE (ใช้ได้ทั้งแชทกลุ่มและทักบอทแบบ 1-ต่อ-1)

ทักบอทแบบ 1-ต่อ-1 (ไม่ผ่านกลุ่ม) จะเป็น "งานส่วนตัว" อัตโนมัติ — ใช้ Group/Task infrastructure เดิมทั้งหมด แค่ผูกกับ pseudo-group ที่มีแค่ตัวเองคนเดียว (`personalSpaceId`, ดู `src/users/users.service.ts`) และมอบหมายงานให้ตัวเองเสมอ (ข้ามขั้นตอนเลือกผู้รับผิดชอบ)

| พิมพ์ | ทำอะไร |
|---|---|
| `สร้างงาน` | เปิดฟอร์ม LIFF สำหรับสร้างงาน (ถ้าตั้งค่า `LIFF_ID` แล้ว) หรือ fallback เป็น flow ถาม-ตอบทีละขั้นตอนแบบเดิม |
| `งาน` / `list` | แสดงรายการงานที่ยังไม่เสร็จในกลุ่ม |
| `งานของฉัน` | แสดงเฉพาะงานที่ตัวเองรับผิดชอบอยู่ |
| `งานของ<ชื่อ>` | แสดงงานของสมาชิกคนอื่นในกลุ่ม เช่น `งานของแนน` (match ชื่อตรงตัวก่อน ไม่เจอค่อย match บางส่วน) |
| `ประวัติงาน` | แสดงงานที่เสร็จ/ยกเลิกไปแล้ว ล่าสุด 20 รายการ (เก็บข้อมูลไว้ดูย้อนหลังได้ตาม `TASK_RETENTION_DAYS`) |
| `แพลนของฉัน` | ดูระดับผู้ใช้ (FREE/PRO) และลิมิตงานค้างสูงสุด |
| `ตั้งแจ้งเตือน` | ตั้งค่าการแจ้งเตือนเดดไลน์ของตัวเอง (ดูหัวข้อถัดไป) |
| `ยกเลิก` | ยกเลิก flow ที่กำลังทำอยู่ |
| `help` / `ช่วยเหลือ` | แสดงคำสั่งทั้งหมด |
| ปุ่มใต้การ์ดงาน | รับงาน / ทำเสร็จแล้ว / ถอนงาน / ลบงานถาวร (เฉพาะงานที่เสร็จ/ยกเลิกแล้ว) |

## ระดับผู้ใช้ (FREE/PRO) และลิมิตงานค้าง

- `User.plan` (`FREE` ค่าเริ่มต้น / `PRO`) กำหนดลิมิตจำนวนงานค้างสูงสุดต่อคน (ดู `PLAN_LIMITS` ใน `src/tasks/plan.util.ts`: FREE = 3, PRO = 15)
- `GroupMember.maxOpenTasksOverride` ใช้ปรับลิมิตเป็นรายคน/รายกลุ่มได้ถ้าจำเป็น (ถ้าตั้งไว้จะข้าม Plan ไปเลย)
- **ยังไม่เชื่อมระบบรับเงินจริง** — การอัปเกรดเป็น PRO ตอนนี้ต้องปรับผ่านฐานข้อมูลโดยตรง เช่น `UPDATE "User" SET plan = 'PRO' WHERE "lineUserId" = '...'`

## ป้องกันข้อมูลบวม (data retention)

`TaskRetentionService` (`src/notifications/task-retention.service.ts`) รันทุกคืนตอนตี 3 ลบงานที่สถานะ `DONE`/`CANCELLED` ที่ผ่านมานานเกิน `TASK_RETENTION_DAYS` (ค่าเริ่มต้น 365 วัน) ทิ้งถาวร — `TaskLog`/`NotificationSchedule` ที่เกี่ยวข้องถูกลบตามไปด้วยอัตโนมัติ (`onDelete: Cascade`) ตั้งเป็น `0` หรือติดลบเพื่อปิดการลบอัตโนมัติ ระหว่างที่ยังไม่ถึงกำหนดลบ สามารถเรียกดูย้อนหลังผ่าน `ประวัติงาน` ได้ตามปกติ

## ตั้งค่าการแจ้งเตือนเดดไลน์ (ต่อคน)

พิมพ์ `ตั้งแจ้งเตือน` ในแชทกลุ่ม แล้วเลือกโหมดที่ต้องการ — **แต่ละคนตั้งของตัวเองได้อิสระ** ไม่กระทบคนอื่นในกลุ่ม:

| โหมด | พฤติกรรม |
|---|---|
| 🔔 มาตรฐาน (ค่าเริ่มต้น) | เตือนล่วงหน้า 1 เดือน, 15/12/9/7/5/3/1 วัน, และ 12/6/3/1 ชม. ก่อนเดดไลน์ (ดู `DEFAULT_OFFSETS_MIN` ใน `src/notifications/reminder-schedule.util.ts`) |
| ⏱️ แจ้งตอนหมดเวลาอย่างเดียว | ไม่มีเตือนล่วงหน้า แจ้งครั้งเดียวตอนถึงเวลาเดดไลน์พอดี |
| 🛠️ กำหนดเอง | พิมพ์ระยะเวลาที่ต้องการเอง เช่น `1mo 15d 7d 3d 1d 12h 6h 1h` (`mo`=เดือน, `d`=วัน, `h`=ชม.) |
| 🔕 ปิดแจ้งเตือน | ไม่มีเตือนล่วงหน้าและไม่มีเตือนซ้ำตอนเลยเดดไลน์ (ยังได้รับแจ้งตอนถูกมอบหมายงานตามปกติ เพราะเป็นคนละประเภทกับเตือนเดดไลน์) |

Business logic: `TasksService.createTask` และ `claimTask` เรียก `NotificationsService.scheduleDeadlineReminders(taskId, deadline, recipientUserId)` ซึ่งจะ resolve preference ของ "ผู้รับผิดชอบงานนั้น" (ไม่ใช่ preference กลางของบอท) แล้วสร้างแถว `NotificationSchedule` ล่วงหน้าตามจำนวนจุดเตือนที่ต้องส่ง — ตัดจุดที่เวลาผ่านไปแล้วออกอัตโนมัติ ตอนถอนงาน/ทำเสร็จ/ยกเลิกงาน ระบบจะลบเตือนที่ยังไม่ส่งของงานนั้นทิ้งให้ (`cancelPendingDeadlineReminders`) กันไม่ให้เตือนซ้ำหลังงานจบไปแล้ว

## Business logic ที่ทำไว้ตาม roadmap

- **Phase 1**: webhook controller ตรวจ `x-line-signature` ด้วย HMAC-SHA256 ก่อนประมวลผลทุกครั้ง
- **Phase 2**: `UsersService.ensureUserAndGroup` auto-create User/Group/GroupMember ตอนมีคนทักบอทครั้งแรกในกลุ่ม
- **Phase 3**: `ConversationService` เก็บ state การสนทนาแบบ in-memory ต่อ (group, user) — เหมาะกับรัน instance เดียวตอน MVP (ดู `05-scaling-plan.md` ถ้าจะ scale เป็นหลาย instance ค่อยย้ายไป Redis)
- **Phase 4**: `TasksService.claimTask` ใช้ conditional update (`updateMany` ด้วย where เงื่อนไขสถานะ) ป้องกัน race condition ตอนสองคนกด "รับงาน" พร้อมกัน, เช็ค `maxOpenTasks` ก่อนให้ assign/claim สำเร็จเสมอ, บันทึกทุก action ลง `TaskLog`
- **Phase 5**: `SchedulerService` ใช้ node-cron รันทุก `SCHEDULER_INTERVAL_MIN` นาที เช็ค `NotificationSchedule` ที่ถึงเวลาส่ง (`ASSIGNED_ALERT`, `BEFORE_DEADLINE` ตาม preference ต่อคน, `CLAIMED_BROADCAST`) และ generate `OVERDUE_REPEAT` ใหม่ตามรอบที่ตั้งไว้จนกว่างานจะเสร็จ (ข้ามคนที่ตั้งโหมด "ปิดแจ้งเตือน" ไว้)

## ยังไม่ทำ (ตาม roadmap เป็น Phase ถัดไป)

- Phase 6 (ปฏิทิน/สรุปรายวัน-สัปดาห์) — ดู `04-development-roadmap.md`
- Gamification, custom branding ฯลฯ — พักไว้ตาม `07-feature-roadmap.md`

## Known limitation ของโค้ดชุดนี้

- Conversation state เก็บใน memory (`Map`) — ถ้า process restart หรือ deploy ใหม่ระหว่างมีคนสร้างงานค้างอยู่ จะรีเซ็ต flow นั้น (ต้องเริ่มใหม่) ยอมรับได้ในสเกล MVP
- ยังไม่มี rate-limit ป้องกัน spam คำสั่ง — เพิ่มทีหลังถ้าจำเป็น
