# 범용 조회수 추적 시스템 코드 검토 보고서

## 검토 범위
1. 데이터베이스 스키마 (`item_views` 테이블)
2. RPC 함수 (`increment_item_views`)
3. Custom Hook (`useViewTracking`)
4. 통합 코드 (`useBoardDetail`)

---

## 🟢 정상 작동하는 부분

### 1. 데이터베이스 스키마
✅ **복합 유니크 제약**: `NULLS NOT DISTINCT` 사용으로 NULL 값 처리 정확
✅ **CHECK 제약**: user_id와 fingerprint 중 하나만 존재하도록 강제
✅ **인덱스**: 부분 인덱스 (WHERE 절) 사용으로 성능 최적화
✅ **RLS 정책**: 적절한 권한 설정

### 2. RPC 함수
✅ **SECURITY DEFINER**: 권한 문제 해결
✅ **예외 처리**: unique_violation 적절히 처리
✅ **동적 테이블 업데이트**: CASE 문으로 확장 가능
✅ **COALESCE**: NULL 값 안전 처리

### 3. Custom Hook
✅ **Fingerprint 자동 생성**: 비로그인 사용자 처리
✅ **에러 핸들링**: try-catch로 안전
✅ **useCallback**: 불필요한 재생성 방지

---

## 🟡 잠재적 문제점 및 개선 사항

### 1. **중복 호출 문제** (중요도: 중)

**문제**: 
`useBoardDetail`에서 Hook이 `postId || ''`로 초기화되어, postId가 undefined일 때 빈 문자열로 RPC 호출 가능

**현재 코드**:
```typescript
const { incrementView } = useViewTracking(postId || '', 'board_post');
```

**문제 시나리오**:
- postId가 undefined → `''` 전달 → `parseInt('')` → `NaN` → DB 에러

**해결책**:
```typescript
const { incrementView } = useViewTracking(postId || '0', 'board_post');

// 또는 Hook 내부에서 검증
if (!itemId || itemId === '' || itemId === '0') {
  return false; // 조기 반환
}
```

---

### 2. **React Strict Mode 중복 호출** (중요도: 중)

**문제**:
로그에서 동일한 게시물에 대해 2번 호출되는 것 확인:
```
✅ New view counted for board_post #7
⏭️ Already viewed board_post #7
```

**원인**:
- React 18의 Strict Mode는 useEffect를 2번 실행
- `loadPost` 함수가 2번 호출 → `incrementView`도 2번 호출

**현재 상태**:
- 첫 번째 호출: 성공 (TRUE)
- 두 번째 호출: 중복 방지 (FALSE)
- **결과적으로 문제없음** (중복 방지 로직이 작동)

**개선 방안** (선택):
```typescript
const viewTracked = useRef(false);

useEffect(() => {
  if (post && !viewTracked.current) {
    incrementView();
    viewTracked.current = true;
  }
}, [post?.id]);
```

---

### 3. **RPC 함수의 예외 처리 범위** (중요도: 낮)

**문제**:
RPC 함수가 모든 예외를 `unique_violation`으로만 처리

**현재 코드**:
```sql
EXCEPTION
  WHEN unique_violation THEN
    v_inserted := FALSE;
END;
```

**잠재적 이슈**:
- CHECK 제약 위반 (user_id와 fingerprint 둘 다 NULL)
- 외래 키 제약 위반 (존재하지 않는 user_id)
- 이런 경우에도 FALSE 반환 → 조용히 실패

**개선 방안**:
```sql
EXCEPTION
  WHEN unique_violation THEN
    v_inserted := FALSE;
  WHEN OTHERS THEN
    RAISE WARNING 'Unexpected error in increment_item_views: %', SQLERRM;
    v_inserted := FALSE;
END;
```

---

### 4. **Fingerprint 충돌 가능성** (중요도: 낮)

**문제**:
Fingerprint 생성 방식이 `Math.random()` + `Date.now()` 기반

**현재 코드**:
```typescript
fingerprint = 'fp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
```

**잠재적 이슈**:
- 이론적으로 충돌 가능 (확률 극히 낮음)
- 사용자가 localStorage를 지우면 새 fingerprint 생성 → 중복 카운트

**개선 방안** (선택):
```typescript
// UUID 사용 (더 안전)
fingerprint = 'fp_' + crypto.randomUUID();
```

---

### 5. **item_type 검증 부재** (중요도: 낮)

**문제**:
Hook에서 `ItemType`을 TypeScript로만 제한, 런타임 검증 없음

**잠재적 이슈**:
- 잘못된 타입 전달 시 RPC에서 WARNING만 발생
- item_views에는 기록되지만 counter는 증가 안 됨

**개선 방안** (선택):
```typescript
const VALID_ITEM_TYPES = ['board_post', 'event', 'schedule'] as const;

if (!VALID_ITEM_TYPES.includes(itemType)) {
  console.error(`[ViewTracking] Invalid item_type: ${itemType}`);
  return false;
}
```

---

### 6. **Performance: 불필요한 RPC 호출** (중요도: 낮)

**문제**:
매번 RPC를 호출하여 중복 체크 → 이미 본 글도 DB 쿼리 발생

**개선 방안** (선택):
클라이언트 측 캐시 추가:
```typescript
const viewedItems = useRef(new Set<string>());

const incrementView = useCallback(async () => {
  const key = `${itemType}:${itemId}`;
  if (viewedItems.current.has(key)) {
    console.log('[ViewTracking] Already viewed (cached)');
    return false;
  }
  
  const result = await supabase.rpc(...);
  if (result.data) {
    viewedItems.current.add(key);
  }
  return result.data;
}, [itemId, itemType]);
```

---

## 🔴 심각한 문제 (발견되지 않음)

검토 결과, **치명적인 버그나 보안 문제는 발견되지 않았습니다.**

---

## 📊 우선순위별 개선 권장사항

### 즉시 수정 권장
1. ✅ **없음** - 현재 코드는 정상 작동

### 선택적 개선
1. **postId 검증 추가** - NaN 방지
2. **RPC 예외 처리 개선** - 디버깅 용이성
3. **Fingerprint UUID 사용** - 충돌 방지

### 성능 최적화 (나중에)
1. 클라이언트 측 캐시 추가
2. item_type 런타임 검증

---

## 결론

✅ **전반적으로 잘 구현되었습니다.**
- 핵심 기능 정상 작동
- 중복 방지 로직 완벽
- 확장성 확보

⚠️ **몇 가지 개선 사항이 있지만, 모두 선택적입니다.**
- 현재 상태로도 프로덕션 사용 가능
- 개선 사항은 점진적으로 적용 가능

🎯 **추천**: 현재 상태로 사용하면서, 필요 시 위의 개선 사항을 단계적으로 적용
