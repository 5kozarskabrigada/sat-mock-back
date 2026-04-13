# SAT Mock Exam API

## Backend Architecture

**Technology Stack:**
- NestJS with Fastify
- PostgreSQL (direct connection via `pg` library)
- JWT Authentication
- Connection pooling optimized for concurrent requests

**Base URL:** `http://localhost:3001/api` (development)

---

## Authentication

All endpoints except `/auth/login` and `/auth/register` require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### POST /api/auth/login
Login with email and password.

**Request:**
```json
{
  "email": "admin@test.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "admin@test.com",
    "role": "admin"
  }
}
```

### POST /api/auth/register
Register a new user.

**Request:**
```json
{
  "email": "student@example.com",
  "password": "password123",
  "role": "student"
}
```

---

## Users

### GET /api/users/me
Get current user profile.

### GET /api/users (Admin only)
Get all users. Supports filtering:
- `?role=student` or `?role=admin`

### GET /api/users/:id
Get user by ID.

### PUT /api/users/:id
Update user profile.

### DELETE /api/users/:id (Admin only)
Delete a user.

---

## Exams

### GET /api/exams
Get all exams. Supports filters:
- `?status=active`
- `?classroomId=uuid`

### GET /api/exams/:id
Get exam by ID.

### POST /api/exams (Admin only)
Create new exam.

**Request:**
```json
{
  "title": "SAT Practice Test 1",
  "description": "Full-length practice test",
  "code": "SAT001",
  "status": "draft",
  "classroomId": "uuid",
  "lockdownPolicy": "log"
}
```

### PUT /api/exams/:id (Admin only)
Update exam.

### DELETE /api/exams/:id (Admin only)
Soft delete exam.

### POST /api/exams/:id/restore (Admin only)
Restore deleted exam.

### GET /api/exams/deleted (Admin only)
Get all deleted exams.

---

## Questions

### GET /api/questions/exam/:examId
Get all questions for an exam.

### GET /api/questions/:id
Get question by ID.

### POST /api/questions (Admin only)
Create a single question.

### POST /api/questions/bulk (Admin only)
Create multiple questions at once.

**Request:**
```json
{
  "examId": "uuid",
  "questions": [
    {
      "section": "reading_writing",
      "module": 1,
      "content": { "text": "...", "options": ["A", "B", "C", "D"] },
      "correctAnswer": "A",
      "explanation": "...",
      "domain": "Information and Ideas",
      "equationLatex": null
    }
  ]
}
```

### PUT /api/questions/:id (Admin only)
Update question.

### DELETE /api/questions/:id (Admin only)
Soft delete question.

---

## Student Exams (Exam Taking)

### POST /api/student-exams/start (Student only)
Start taking an exam.

**Request:**
```json
{
  "examId": "uuid"
}
```

### GET /api/student-exams/my-exams (Student only)
Get all exams for current student.
- `?status=in_progress` or `?status=completed`

### GET /api/student-exams/:id
Get student exam attempt by ID.

### GET /api/student-exams/:id/answers
Get all answers for a student exam.

### POST /api/student-exams/:id/answer (Student only)
**AUTOSAVE ENDPOINT** - Save/update a single answer.

**Request:**
```json
{
  "questionId": "uuid",
  "answerValue": "A"
}
```

### POST /api/student-exams/:id/answers-batch (Student only)
**BATCH AUTOSAVE** - Save multiple answers at once (more efficient).

**Request:**
```json
{
  "answers": [
    { "questionId": "uuid1", "answerValue": "A" },
    { "questionId": "uuid2", "answerValue": "C" }
  ]
}
```

### POST /api/student-exams/:id/complete (Student only)
Complete exam and calculate score.

### POST /api/student-exams/:id/lockdown-violation (Student only)
Record a lockdown violation.

### GET /api/student-exams/exam/:examId/results (Admin only)
Get all results for an exam.

---

## Classrooms

### GET /api/classrooms
Get all classrooms.

### GET /api/classrooms/:id
Get classroom by ID.

### GET /api/classrooms/:id/students
Get all students in a classroom.

### POST /api/classrooms (Admin only)
Create classroom.

### PUT /api/classrooms/:id (Admin only)
Update classroom.

### DELETE /api/classrooms/:id (Admin only)
Delete classroom.

### POST /api/classrooms/:id/students (Admin only)
Add student to classroom.

**Request:**
```json
{
  "studentId": "uuid"
}
```

### DELETE /api/classrooms/:id/students/:studentId (Admin only)
Remove student from classroom.

---

## Activity Logs

### GET /api/activity-logs (Admin only)
Get activity logs. Supports filters:
- `?userId=uuid`
- `?examId=uuid`
- `?type=exam_started`

### POST /api/activity-logs
Create activity log.

**Request:**
```json
{
  "userId": "uuid",
  "examId": "uuid",
  "studentExamId": "uuid",
  "type": "lockdown_violation",
  "details": "Tab switched to Google Chrome"
}
```

---

## Connection Pooling

The backend uses optimized PostgreSQL connection pooling:
- **Max connections:** 20
- **Idle timeout:** 30 seconds
- **Connection timeout:** 2 seconds

This ensures:
✅ Multiple concurrent autosaves work perfectly
✅ No connection exhaustion under load
✅ Fast response times
✅ Automatic connection recycling

---

## Environment Variables

Create `.env` file with:
```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000,https://sat-mock-front.vercel.app
```
