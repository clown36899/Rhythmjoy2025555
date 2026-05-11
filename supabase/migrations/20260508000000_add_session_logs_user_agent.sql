alter table public.session_logs
    add column if not exists user_agent text,
    add column if not exists platform text;

comment on column public.session_logs.user_agent is '세션 시작 시점의 브라우저 user agent. 봇/자동화 트래픽 필터링에 사용.';
comment on column public.session_logs.platform is '세션 시작 시점의 navigator.platform.';

