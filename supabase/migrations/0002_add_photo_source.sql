-- Add 'photo' as a valid log entry source, alongside existing 'manual' and 'voice'.
alter type public.log_source add value 'photo';
