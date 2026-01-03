-- Fix Security Definer View Lint Errors
-- 뷰가 호출자(Invoker)의 권한으로 실행되도록 설정하여 RLS를 준수하게 함
-- (PostgreSQL 15+ feature)

ALTER VIEW analytics_daily_summary SET (security_invoker = true);
ALTER VIEW analytics_export_view SET (security_invoker = true);
