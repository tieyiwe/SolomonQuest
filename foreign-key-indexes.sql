-- Run in the Supabase SQL editor.
--
-- Postgres does NOT automatically index foreign key columns (only primary
-- keys and unique constraints get one for free) — every one of these is
-- filtered on constantly by the API (school_id on nearly every list route,
-- course_id/student_id/teacher_id everywhere, etc.) and was doing a
-- sequential scan. That gets more expensive — more compute billed — as
-- each table grows. All idempotent (safe to re-run).
--
-- If any single line below errors because a table/column doesn't exist in
-- your instance, just skip that line and run the rest — they're
-- independent of each other.

create index if not exists profiles_school_id_idx on public.profiles (school_id);

create index if not exists courses_school_id_idx on public.courses (school_id);
create index if not exists courses_program_id_idx on public.courses (program_id);
create index if not exists courses_teacher_id_idx on public.courses (teacher_id);
create index if not exists courses_created_by_idx on public.courses (created_by);

create index if not exists course_enrollments_student_id_idx on public.course_enrollments (student_id);

create index if not exists assignments_course_id_idx on public.assignments (course_id);

create index if not exists submissions_assignment_id_idx on public.submissions (assignment_id);
create index if not exists submissions_student_id_idx on public.submissions (student_id);

create index if not exists announcements_school_id_idx on public.announcements (school_id);
create index if not exists announcements_course_id_idx on public.announcements (course_id);
create index if not exists announcements_posted_by_idx on public.announcements (posted_by);

create index if not exists notifications_user_id_idx on public.notifications (user_id);

create index if not exists student_applications_school_id_idx on public.student_applications (school_id);
create index if not exists student_applications_program_id_idx on public.student_applications (program_id);
create index if not exists student_applications_applicant_id_idx on public.student_applications (applicant_id);

create index if not exists attendance_course_id_idx on public.attendance (course_id);
create index if not exists attendance_student_id_idx on public.attendance (student_id);

create index if not exists invitations_school_id_idx on public.invitations (school_id);
create index if not exists invitations_invited_by_idx on public.invitations (invited_by);
create index if not exists invitations_program_id_idx on public.invitations (program_id);

create index if not exists course_resources_course_id_idx on public.course_resources (course_id);
create index if not exists course_resources_uploaded_by_idx on public.course_resources (uploaded_by);

create index if not exists school_resources_school_id_idx on public.school_resources (school_id);
create index if not exists school_resources_uploaded_by_idx on public.school_resources (uploaded_by);

create index if not exists chat_channels_school_id_idx on public.chat_channels (school_id);
create index if not exists chat_channel_members_channel_id_idx on public.chat_channel_members (channel_id);
create index if not exists chat_channel_members_user_id_idx on public.chat_channel_members (user_id);
create index if not exists chat_messages_channel_id_idx on public.chat_messages (channel_id);
create index if not exists chat_messages_sender_id_idx on public.chat_messages (sender_id);
create index if not exists chat_messages_parent_id_idx on public.chat_messages (parent_id);

create index if not exists forum_topics_school_id_idx on public.forum_topics (school_id);
create index if not exists forum_topics_course_id_idx on public.forum_topics (course_id);
create index if not exists forum_comments_topic_id_idx on public.forum_comments (topic_id);
create index if not exists forum_reactions_user_id_idx on public.forum_reactions (user_id);
create index if not exists forum_reactions_topic_id_idx on public.forum_reactions (topic_id);
create index if not exists forum_reactions_comment_id_idx on public.forum_reactions (comment_id);

create index if not exists video_sessions_course_id_idx on public.video_sessions (course_id);

create index if not exists quizzes_course_id_idx on public.quizzes (course_id);
create index if not exists quiz_questions_quiz_id_idx on public.quiz_questions (quiz_id);
create index if not exists quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id);
create index if not exists quiz_attempts_student_id_idx on public.quiz_attempts (student_id);
create index if not exists quiz_answers_attempt_id_idx on public.quiz_answers (attempt_id);
create index if not exists quiz_answers_question_id_idx on public.quiz_answers (question_id);

create index if not exists reminders_school_id_idx on public.reminders (school_id);
create index if not exists reminders_target_user_id_idx on public.reminders (target_user_id);
create index if not exists reminders_course_id_idx on public.reminders (course_id);

create index if not exists platform_audit_log_performed_by_idx on public.platform_audit_log (performed_by);
create index if not exists platform_audit_log_created_at_idx on public.platform_audit_log (created_at desc);

create index if not exists tuition_plans_course_id_idx on public.tuition_plans (course_id);
create index if not exists tuition_payments_student_id_idx on public.tuition_payments (student_id);
create index if not exists tuition_payments_course_id_idx on public.tuition_payments (course_id);
create index if not exists tuition_installments_tuition_payment_id_idx on public.tuition_installments (tuition_payment_id);
