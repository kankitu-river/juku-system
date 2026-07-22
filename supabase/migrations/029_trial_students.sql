alter table students
  add column if not exists is_trial boolean not null default false;

insert into students (name, grade, subjects, preferred_teacher_ids, ng_teacher_ids, fixed_slots, parent_requests, is_trial)
select '体験授業（小・中）', '体験', '{}', '{}', '{}', '[]', '', true
where not exists (select 1 from students where name = '体験授業（小・中）');

insert into students (name, grade, subjects, preferred_teacher_ids, ng_teacher_ids, fixed_slots, parent_requests, is_trial)
select '体験授業（高）', '体験', '{}', '{}', '{}', '[]', '', true
where not exists (select 1 from students where name = '体験授業（高）');
