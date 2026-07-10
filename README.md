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

## คำสั่งที่ใช้ในแชทกลุ่ม LINE

| พิมพ์ | ทำอะไร |
|---|---|
| `สร้างงาน` | เริ่ม flow สร้างงานใหม่ (ถาม หัวข้อ → รายละเอียด → ความสำคัญ → เส้นตาย → โหมดมอบหมาย → ผู้รับ) |
| `งาน` / `list` | แสดงรายการงานที่ยังไม่เสร็จในกลุ่ม |
| `ยกเลิก` | ยกเลิก flow ที่กำลังทำอยู่ |
| `help` / `ช่วยเหลือ` | แสดงคำสั่งทั้งหมด |
| ปุ่มใต้การ์ดงาน | รับงาน / ทำเสร็จแล้ว / ถอนงาน |

## Business logic ที่ทำไว้ตาม roadmap

- **Phase 1**: webhook controller ตรวจ `x-line-signature` ด้วย HMAC-SHA256 ก่อนประมวลผลทุกครั้ง
- **Phase 2**: `UsersService.ensureUserAndGroup` auto-create User/Group/GroupMember ตอนมีคนทักบอทครั้งแรกในกลุ่ม
- **Phase 3**: `ConversationService` เก็บ state การสนทนาแบบ in-memory ต่อ (group, user) — เหมาะกับรัน instance เดียวตอน MVP (ดู `05-scaling-plan.md` ถ้าจะ scale เป็นหลาย instance ค่อยย้ายไป Redis)
- **Phase 4**: `TasksService.claimTask` ใช้ conditional update (`updateMany` ด้วย where เงื่อนไขสถานะ) ป้องกัน race condition ตอนสองคนกด "รับงาน" พร้อมกัน, เช็ค `maxOpenTasks` ก่อนให้ assign/claim สำเร็จเสมอ, บันทึกทุก action ลง `TaskLog`
- **Phase 5**: `SchedulerService` ใช้ node-cron รันทุก `SCHEDULER_INTERVAL_MIN` นาที เช็ค `NotificationSchedule` ที่ถึงเวลาส่ง (`ASSIGNED_ALERT`, `BEFORE_DEADLINE`, `CLAIMED_BROADCAST`) และ generate `OVERDUE_REPEAT` ใหม่ตามรอบที่ตั้งไว้จนกว่างานจะเสร็จ

## ยังไม่ทำ (ตาม roadmap เป็น Phase ถัดไป)

- Phase 6 (ปฏิทิน/สรุปรายวัน-สัปดาห์) — ดู `04-development-roadmap.md`
- Gamification, custom branding ฯลฯ — พักไว้ตาม `07-feature-roadmap.md`

## Known limitation ของโค้ดชุดนี้

- Conversation state เก็บใน memory (`Map`) — ถ้า process restart หรือ deploy ใหม่ระหว่างมีคนสร้างงานค้างอยู่ จะรีเซ็ต flow นั้น (ต้องเริ่มใหม่) ยอมรับได้ในสเกล MVP
- ยังไม่มี rate-limit ป้องกัน spam คำสั่ง — เพิ่มทีหลังถ้าจำเป็น
