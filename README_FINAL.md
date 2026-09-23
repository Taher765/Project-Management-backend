# Worker Management 2.0 — Multi Project

نسخة جديدة مستقلة عن النسخة القديمة. النظام الآن يدعم أكثر من مشروع مع عزل كامل للبيانات والحسابات.

## الفكرة الأساسية
- كل مشروع له ID مستقل.
- كل أسبوع مرتبط بـ projectId.
- كل معاملات العمال مرتبطة بـ projectId.
- كل مصروفات المشروع مرتبطة بـ projectId.
- كل المبالغ المستلمة من المشروع مرتبطة بـ projectId.
- العامل نفسه يمكن أن يعمل في مشروع A ثم B ثم يعود إلى A بدون إنشاء عامل جديد.
- أجرة العامل وتاريخ تغيير اليومية داخل كل مشروع مستقلان.
- حذف العامل من أسبوع لا يحذفه من المشروع أو من باقي الأسابيع.
- الجمعة يوم عمل طبيعي ويتم حسابها.
- الأيام المستقبلية لا تُحسب كغياب.
- الأسبوع المغلق يمنع تعديل الحضور والخصومات والمعاملات وتغيير اليومية والحذف/الاسترجاع.

## اختيار المشروع
كل طلب خاص بمشروع يقبل `X-Project-Id` في الـ header. ويمكن أيضًا إرسال `projectId` في query/body عند الحاجة.

مثال:
`X-Project-Id: PROJECT_ID`

## حساب ربح المشروع
- `revenue`: إجمالي المبالغ المستلمة من المشروع.
- `workerGrossEarned`: إجمالي أجور العمال قبل الخصومات.
- `workerCost`: صافي تكلفة العمال بعد الخصومات وإضافة المكافآت.
- `otherExpenses`: مصروفات المشروع خارج أجور العمال.
- `totalSpent = workerCost + otherExpenses`.
- `profit = revenue - totalSpent`.
- `workerPaid`: ما تم دفعه فعليًا للعمال.
- `workerRemaining`: مستحقات العمال غير المدفوعة.
- `cashBalance = revenue - workerPaid - otherExpenses`.

## أهم الـ APIs
### Projects
- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `GET /api/projects/:id/dashboard`
- `GET /api/projects/:id/expenses`
- `POST /api/projects/:id/expenses`
- `PATCH /api/projects/:id/expenses/:expenseId`
- `DELETE /api/projects/:id/expenses/:expenseId`
- `GET /api/projects/:id/receipts`
- `POST /api/projects/:id/receipts`
- `PATCH /api/projects/:id/receipts/:receiptId`
- `DELETE /api/projects/:id/receipts/:receiptId`

### Workers
- `POST /api/workers` — إنشاء عامل جديد داخل المشروع.
- `POST /api/workers` مع `workerId` — إعادة العامل الموجود إلى المشروع.
- `GET /api/workers`
- `GET /api/workers/search?q=...`
- `GET /api/workers/:id`
- `PATCH /api/workers/:id`
- `PATCH /api/workers/:id/wage`
- `POST /api/workers/:id/assignments` — إضافة العامل لمشروع آخر أو فترة جديدة.
- `PATCH /api/workers/:id/assignment/end` — إنهاء فترة العمل في المشروع.
- `DELETE /api/workers/:id?weekStart=YYYY-MM-DD` — حذف العامل من أسبوع محدد فقط.
- `PATCH /api/workers/:id/restore?weekStart=YYYY-MM-DD`
- `PATCH /api/workers/:id/attendance`
- `POST /api/workers/:id/transactions`
- `GET /api/workers/:id/transactions`

### Weeks / Archive
- `GET /api/home`
- `GET /api/home/by-date?date=YYYY-MM-DD`
- `GET /api/weeks/current`
- `GET /api/weeks/previous?from=YYYY-MM-DD`
- `GET /api/weeks/next?from=YYYY-MM-DD`
- `GET /api/weeks/by-date/YYYY-MM-DD`
- `GET /api/weeks/archive?date=YYYY-MM-DD&q=...`
- `PATCH /api/weeks/:id/close` — Toggle close/open.
- `GET /api/archive/month?month=MM&year=YYYY`
- `GET /api/archive/project`

## مثال إنشاء مشروع
```json
{
  "name": "مشروع الفندق",
  "code": "HOTEL-01",
  "description": "أعمال الفندق",
  "startedAt": "2026-09-01"
}
```

## مثال إضافة عامل إلى مشروع
```json
{
  "name": "أحمد",
  "currentWage": 200,
  "effectiveFrom": "2026-09-01"
}
```
مع header:
`X-Project-Id: PROJECT_ID`

## مثال مصروف مشروع
```json
{
  "amount": 750,
  "category": "food",
  "date": "2026-09-01",
  "note": "أكل العمال"
}
```

## مثال مبلغ مستلم من المشروع
```json
{
  "amount": 10000,
  "date": "2026-09-01",
  "note": "دفعة من حساب المشروع"
}
```

## تشغيل
```bash
npm install
npm run seed:auth
npm run seed:test
npm start
```

المستخدم الافتراضي من seed auth هو `admin / 123456` إذا لم تغيّر متغيرات البيئة.

## Excel Export (added without changing the existing architecture)

Excel export is implemented as additional backend routes plus a small frontend helper. Existing APIs, models, and business calculations remain unchanged.

Routes (all protected and project-scoped through `X-Project-Id`):
- `GET /api/export/worker/:workerId` — worker report workbook.
- `GET /api/export/week?date=YYYY-MM-DD` — week report workbook.
- `GET /api/export/month?year=YYYY&month=MM` — month report workbook.
- `GET /api/export/finances` — revenues, expenses, worker costs, profit, and cash balance workbook.
- `GET /api/export/project` — same project-level financial report for the project summary button.

Frontend helper: `frontend-auth/excel-export.js`. Import the desired function and call it from the existing page's Export Excel button. The helper uses the existing `authFetch()` and does not duplicate calculations.

## Final project-local worker behavior
- Every Worker belongs to one project. Adding the same person/name to another project creates a separate Worker document and separate wage/history/attendance/transactions.
- The `/api/workers/:id` response keeps the old frontend contract: `worker`, `transactions`, `financial`, `currentWeek`, `currentMonth`.
- Adding a worker during an open week keeps the entered daily wage on the earlier days of that same week; attendance remains false until explicitly changed.
- Friday remains the seventh normal payable day.
- August 2026 is the minimum data month. Historical weeks must exist in the database; only the current week is auto-created, so a new week becomes available automatically when it starts.
- Future days are excluded from calculations by `calc()` and therefore do not count as absences or wages.

### Existing database migration
For a database created by the previous global-worker version, run once:
`npm run migrate:workers-projects`

Then seed August through the current week:
`npm run seed:august`

## إضافات API

### حذف مشروع بالكامل
`DELETE /api/projects/:id`

يحذف المشروع وكل بياناته المرتبطة: العمال، WorkerProject، الأسابيع، معاملات العمال، المصروفات والإيرادات. الأرشيف/الشهور مشتقة من الأسابيع، لذلك تختفي بيانات الشهور الخاصة بالمشروع بحذف الأسابيع.

### ملخص المصروفات
`GET /api/projects/:id/expenses`

اختياري: `?date=YYYY-MM-DD` لتحديد اليوم الذي تُحسب عليه أرقام اليوم/الأسبوع/الشهر، والافتراضي هو اليوم الحالي.

الاستجابة تحتوي على `data` وهي قائمة المصروفات، بالإضافة إلى `summary`:
- `day.total`: إجمالي مصروفات اليوم المحدد.
- `week.total`: إجمالي مصروفات أسبوع اليوم المحدد (السبت إلى الجمعة).
- `month.total`: إجمالي مصروفات شهر اليوم المحدد.
- `total`: إجمالي كل مصروفات المشروع.

### ملخص الإيرادات
`GET /api/projects/:id/receipts`

بنفس فكرة المصروفات، مع `summary.day` و`summary.week` و`summary.month` و`summary.total`.

### معرف الأسبوع
استجابات الأسبوع وHome تحتوي الآن على `data.week.id`، ويمكن استخدامه مباشرة في:
`PATCH /api/weeks/:id/close`
