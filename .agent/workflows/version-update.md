---
description: 버전 업데이트 및 CHANGELOG 관리 방법
---

# 버전 업데이트 워크플로우

## 🤖 AI 어시스턴트를 통한 자동 업데이트 (권장)

AI 어시스턴트에게 다음과 같이 요청하면 **모든 파일을 자동으로 업데이트**합니다:

**예시 요청:**
- "버전 2.2.5로 업데이트해줘"
- "버전 확정하고 CHANGELOG 업데이트"
- "새 버전 기록해줘: [변경사항 설명]"

**자동 수행 작업:**
1. `package.json` 버전 업데이트
2. `CHANGELOG.md`에 새 버전 항목 추가
3. `src/data/changelog.ts`에 새 버전 데이터 추가
4. 변경사항 요약 제공

> [!IMPORTANT]
> **Git 커밋 및 푸시(Push) 금지**
> 모든 자동 업데이트 작업 후, Git 커밋 및 푸시는 **사용자의 명시적인 승인**이 있을 때만 수행해야 합니다. 지시 없이 독단적으로 원격 저장소에 푸시하는 것은 절대 금지입니다.

---

## 📝 수동 업데이트 방법

AI 어시스턴트 없이 직접 업데이트하는 경우:

### 1. package.json 버전 업데이트
```json
{
  "version": "2.2.5"  // 버전 번호 수정
}
```

### 2. CHANGELOG.md 업데이트
```markdown
## Version 2.2.5 (2025-12-21)
- 변경사항 1
- 변경사항 2
```

### 3. src/data/changelog.ts 업데이트
```typescript
export const changelogData: ChangelogVersion[] = [
  {
    version: "2.2.5",
    date: "2025-12-21",
    changes: [
      "변경사항 1",
      "변경사항 2"
    ]
  },
  // ... 기존 버전들
];
```

### 4. Git 커밋 (승인 필수)
```bash
# 1. 파일 추가
git add package.json CHANGELOG.md src/data/changelog.ts

# 2. 커밋 수행 (사용자 승인 후)
git commit -m "버전 2.2.5 업데이트"

# 3. 푸시 수행 (사용자 승인 후)
git push
```

---

## 📍 파일 위치

- **package.json**: `/Users/inteyeo/Rhythmjoy2025555-5/package.json`
- **CHANGELOG.md**: `/Users/inteyeo/Rhythmjoy2025555-5/CHANGELOG.md`
- **changelog.ts**: `/Users/inteyeo/Rhythmjoy2025555-5/src/data/changelog.ts`

---

## 📊 버전 번호 규칙

- **Major (X.0.0)**: 대규모 변경, 호환성 깨짐
- **Minor (0.X.0)**: 새 기능 추가, 하위 호환
- **Patch (0.0.X)**: 버그 수정, 작은 개선

---

## 🎯 게시판 개발일지 탭

버전 업데이트 후 게시판 → "개발일지" 탭에서 모든 버전 히스토리를 확인할 수 있습니다.

