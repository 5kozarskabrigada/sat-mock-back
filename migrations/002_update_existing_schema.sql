-- Migration to update existing schema for Better Auth compatibility + NestJS backend

-- ============================================
-- UPDATE USERS TABLE FOR BETTER AUTH
-- ============================================

-- Users table already exists, add/rename columns for Better Auth compatibility
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Rename 'name' if it doesn't exist (for Better Auth)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;

-- Update name from first_name + last_name if empty
UPDATE public.users 
SET name = CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))::text 
WHERE name IS NULL AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- ============================================
-- UPDATE ACCOUNTS TABLE
-- ============================================

-- Accounts table exists (from Supabase Better Auth), ensure it has all needed columns
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS id_token TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Update the foreign key if needed (from uuid to text for Better Auth)
-- Note: This might fail if data types don't match, which is OK

-- ============================================
-- UPDATE EXAMS TABLE
-- ============================================

-- Add missing columns
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Change created_by from uuid to text if needed (Better Auth uses text IDs)
-- This is safe if the column doesn't exist yet

-- ============================================
-- UPDATE QUESTIONS TABLE
-- ============================================

-- Split content JSONB into separate columns for NestJS
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS skill TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_text TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_latex TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_image_url TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_type TEXT CHECK (answer_type IN ('multiple_choice', 'grid_in')) DEFAULT 'multiple_choice';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation_latex TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Migrate data from content JSONB to new columns (if content exists)
UPDATE public.questions 
SET 
  question_text = COALESCE((content->>'questionText')::text, (content->>'text')::text),
  options = content->'options',
  question_image_url = (content->>'imageUrl')::text
WHERE content IS NOT NULL AND question_text IS NULL;

-- ============================================
-- UPDATE STUDENT_EXAMS TABLE
-- ============================================

-- Add score breakdown columns
ALTER TABLE public.student_exams ADD COLUMN IF NOT EXISTS reading_writing_score INTEGER;
ALTER TABLE public.student_exams ADD COLUMN IF NOT EXISTS math_score INTEGER;
ALTER TABLE public.student_exams ADD COLUMN IF NOT EXISTS total_score INTEGER;
ALTER TABLE public.student_exams ADD COLUMN IF NOT EXISTS score_detail JSONB;

-- Migrate from score JSONB to individual columns
UPDATE public.student_exams
SET 
  reading_writing_score = (score->>'reading_writing')::integer,
  math_score = (score->>'math')::integer,
  total_score = (score->>'total')::integer,
  score_detail = score
WHERE score IS NOT NULL AND total_score IS NULL;

-- ============================================
-- UPDATE STUDENT_ANSWERS TABLE
-- ============================================

ALTER TABLE public.student_answers ADD COLUMN IF NOT EXISTS time_spent INTEGER DEFAULT 0;
ALTER TABLE public.student_answers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- UPDATE CLASSROOMS TABLE
-- ============================================

ALTER TABLE public.classrooms ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.classrooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.classrooms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- CREATE UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers and recreate
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND column_name = 'updated_at'
    AND table_name IN ('users', 'accounts', 'exams', 'questions', 'student_exams', 'student_answers', 'classrooms')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
  END LOOP;
END$$;

-- ============================================
-- UPDATE INDEXES
-- ============================================

-- Drop old indexes that might conflict
DROP INDEX IF EXISTS idx_exams_status;
DROP INDEX IF EXISTS idx_exams_classroom;
DROP INDEX IF EXISTS idx_questions_exam_id;
DROP INDEX IF EXISTS idx_questions_section;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_classroom ON public.exams(classroom_id);
CREATE INDEX IF NOT EXISTS idx_exams_created_by_new ON public.exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_deleted ON public.exams(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_exam_id_new ON public.questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_questions_section_new ON public.questions(section);
CREATE INDEX IF NOT EXISTS idx_questions_deleted ON public.questions(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_exams_student_id_new ON public.student_exams(student_id);
CREATE INDEX IF NOT EXISTS idx_student_exams_exam_id_new ON public.student_exams(exam_id);
CREATE INDEX IF NOT EXISTS idx_student_exams_status_new ON public.student_exams(status);

CREATE INDEX IF NOT EXISTS idx_student_answers_student_exam_new ON public.student_answers(student_exam_id);
CREATE INDEX IF NOT EXISTS idx_student_answers_question_new ON public.student_answers(question_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id_new ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_student_exam_id_new ON public.activity_logs(student_exam_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type_new ON public.activity_logs(type);

CREATE INDEX IF NOT EXISTS idx_classrooms_created_by_new ON public.classrooms(created_by);
CREATE INDEX IF NOT EXISTS idx_classrooms_deleted ON public.classrooms(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_student_classrooms_student_new ON public.student_classrooms(student_id);
CREATE INDEX IF NOT EXISTS idx_student_classrooms_classroom_new ON public.student_classrooms(classroom_id);
