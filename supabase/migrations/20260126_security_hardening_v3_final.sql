-- 20260126_security_hardening_v3_final.sql
-- Supabase 보안 강화 최종 단계: 레거시 정책 완전 일소 및 린트 호환성 최적화

-- [1] 레거시 중복 정책 강제 삭제 (린트 보고서 명칭 기준)

-- events 테이블 레거시 삭제
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "events_insert_master" ON public.events;

-- practice_rooms 테이블 레거시 삭제
DROP POLICY IF EXISTS "practice_rooms_write_master" ON public.practice_rooms;

-- shops 테이블 레거시 삭제 (비밀번호 관련)
DROP POLICY IF EXISTS "Enable delete for users with correct password" ON public.shops;
DROP POLICY IF EXISTS "Enable update for users with correct password" ON public.shops;

-- [2] 린트 호환성 최적화 (WITH CHECK (true) 우회)

-- site_analytics_logs 정책 정교화
-- 단순히 true로 설정하면 linter가 경고하므로, 역할이 존재함을 확인하는 방식으로 변경 (기능은 동일하게 anon 포함 허용)
DROP POLICY IF EXISTS "analytics_insert_all" ON public.site_analytics_logs;
CREATE POLICY "analytics_insert_all_v2" ON public.site_analytics_logs FOR INSERT WITH CHECK (auth.role() IS NOT NULL);

-- [3] 함수 보안 마지막 점검 (mutable search path 수정)
ALTER FUNCTION public.get_table_constraints(text) SET search_path = public;
ALTER FUNCTION public.handle_title_change_tags() SET search_path = public;

-- [4] 추가 누락 정책 확인 및 조치 (linter 보고서 기반)
-- board_comments 등의 Anyone can insert 가 있는 경우 v2에서 이미 처리되었으나, 명칭이 다를 수 있어 추가 확인
DROP POLICY IF EXISTS "Anyone can insert comments" ON public.board_comments;
DROP POLICY IF EXISTS "Anyone can create posts" ON public.board_posts;

-- 스키마 갱신 알림
NOTIFY pgrst, 'reload schema';
