-- RLS 정책만 수정 (events 테이블 저장 권한 부여)
-- user_id는 text 타입, auth.uid()는 uuid 타입이므로 명시적 캐스팅 필요

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Users can insert their own events" ON public.events;
DROP POLICY IF EXISTS "Users can update their own events" ON public.events;
DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "Admins can do everything on events" ON public.events;
DROP POLICY IF EXISTS "Users can delete their own events" ON public.events;

-- 새 정책: 인증된 사용자는 누구나 INSERT 가능
CREATE POLICY "Authenticated users can insert events" ON public.events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 새 정책: 본인이 작성한 이벤트 UPDATE 가능 (타입 캐스팅)
CREATE POLICY "Users can update their own events" ON public.events
  FOR UPDATE USING (auth.uid()::text = user_id);

-- 새 정책: 본인이 작성한 이벤트 DELETE 가능 (타입 캐스팅)
CREATE POLICY "Users can delete their own events" ON public.events
  FOR DELETE USING (auth.uid()::text = user_id);
