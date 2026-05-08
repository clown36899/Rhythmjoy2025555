---
name: Web Search Ingestion V2
description: 대한민국 스윙씬 전체의 미래 데이터(오늘 이후)를 수집하기 위한 자율 에이전트 지침서
---

# Web Search Ingestion V2: 전국구 스윙씬 미래 이벤트 수집 가이드

이 지침의 목적은 대한민국 스윙댄스 씬의 모든 이벤트를 **미래 지향적(Future-only)**으로 수집하고, 이미지와 정보를 유실 없이 관리하는 것이다.

## ⏱ 실행 규율 (Execution Discipline) — 최우선 준수

### 시간 예산
- **전체 수집 제한: 20분** — 수집 시작 시각을 기록하고, 20분 경과 시 즉시 수집 중단 후 summary 출력하고 종료.
- **소스당 제한: 60초** — 한 소스(URL)에서 60초 내 결과가 없으면 즉시 다음 소스로 넘어간다.
- **Playwright 응답 제한: 20초** — browser_navigate, browser_snapshot 등 각 호출이 20초 내 응답 없으면 browser_close 후 다음 소스로.

### Turn 예산
- **max-turns 120 중 110턴 도달 시 즉시 수집 중단** — 남은 소스가 있어도 멈추고 summary 출력 후 종료.
- 수집 도중 현재 턴 수를 의식하며 진행할 것.

### Hang 대응 (가장 중요)
Playwright MCP 호출이 응답 없이 멈춘 경우:
```bash
pkill -9 -f "chrome-headless-shell" 2>/dev/null
pkill -9 -f "playwright" 2>/dev/null
sleep 1
```
실행 후 해당 소스는 **접근불가**로 기록하고 다음 소스로. **절대 같은 소스 재시도 금지.**

### 종료 시 절대 규칙
- **어떤 상황에서도 summary 블록을 출력하고 종료한다** — 에러, 타임아웃, 소스 전부 실패, 신규 0건 모두 해당.
- summary 없이 종료하는 것은 **실패**로 간주 (run-ingestion.sh가 오류 처리함).
- INGESTION_STATUS.md 갱신이 오래 걸리면 생략해도 되나, **summary 출력은 절대 생략 불가**.

---

## ❌ 절대 금지 사항 (Hard Rules — 위반 시 수집 무효)
1. **실제 포스트 없이 삽입 금지** — "매주 하니까", "패턴상 있을 것 같다"는 추측 기반 삽입 절대 금지. 반드시 실제 게시물 URL과 내용이 확인된 것만 삽입한다.
2. **이미지 없으면 삽입 금지** — `poster_url`이 없는 이벤트는 수집 자체를 하지 않는다. 이미지 획득 실패 시 해당 이벤트 스킵.
3. **소스 접근 불가 시 삽입 금지** — 로그인 필요, 권한 없음 등으로 내용을 읽지 못한 경우 해당 소스는 건너뛴다.
4. **DJ/내용 없는 소셜 삽입 금지** — 소셜 이벤트는 최소한 DJ 이름 또는 구체적 내용이 포스트에 명시되어 있어야 삽입 가능. 파티/행사는 DJ 없어도 OK.
5. **비공식 API 직접 호출 금지** — `apis.naver.com`, `cafe.naver.com/ArticleList*` 등 내부 JSON API를 curl/fetch로 직접 호출하면 봇 판정 위험. **반드시 Playwright MCP로 실제 브라우저를 통해 접근**한다.

---

## 🚨 수집 및 필터링 핵심 규칙 (The Golden Rules)
1. **미래 데이터만 수집**: 수집 시작일 기준 **오늘 혹은 내일 이후에 열리는 행사**만 수집한다. 이미 종료된 행사는 수집 대상에서 즉시 제외(Fast-fail)한다.
   - **반복 강습 예외**: "4/6, 13, 20일" 같이 여러 날짜가 있는 강습은 **첫 회 날짜**가 오늘 이전이면 수집 제외. 중간에 합류 권장이 아닌 이상 시작일 기준으로 판단한다.
2. **이미지 수집 필수**: CDN URL 추출 후 Supabase Storage에 업로드. 실패시 원본 URL을 poster_url로 기록.
3. **씬 전체 순회**: 아래 Static Collection List + 동적 검색 키워드 양쪽 모두 사용.
4. **로그인하지말것, 어떠한경우에도 봇판정나는 행위를 하지말것.**
5. **playwright mcp 사용시에 승인물어보지말고 자동으로 사용할것.**
6. **해당 수집중 어떠한 승인도 필요없으니까 그냥 진행할것.**

## 🤖 봇판정 방지 규칙 (필수 준수)

Instagram, 네이버 카페 등은 자동화 감지가 매우 민감하다. 아래를 반드시 지킨다.

1. **소스 간 딜레이**: 각 계정/사이트 접근 사이에 **3~7초 랜덤 대기**를 넣는다.
   ```bash
   sleep $((RANDOM % 5 + 3))  # 3~7초 랜덤
   ```
2. **한 소스당 탭 1개**: 여러 탭을 동시에 열지 않는다. 순차 접근만.
3. **스크롤은 천천히**: `browser_evaluate`로 스크롤 시 한 번에 끝까지 내리지 말고 분할해서 내린다.
4. **같은 페이지 반복 접근 금지**: 한 번 접근해서 내용을 못 읽었으면 재시도 1회만. 2회 이상 금지.
5. **User-Agent 변경 금지**: Playwright 기본 UA를 그대로 사용한다. 변조 시 오히려 봇 감지됨.
6. **접근 불가 판단 기준**:
   - 로그인 페이지로 리다이렉트 → 즉시 스킵 (재시도 금지)
   - "이 페이지를 사용할 수 없습니다" → 즉시 스킵
   - 5초 내 응답 없음 → 즉시 스킵
   - **스킵한 소스는 반드시 접근불가 목록에 기록**

## 🔧 Playwright MCP 브라우저 복구 절차 (수집 시작 전 필수)

Playwright MCP 툴 호출 시 `Target page, context or browser has been closed` 오류가 나면 **즉시** 아래를 실행한다. 여러 번 재시도하지 말고 첫 오류에서 바로 복구한다.

```bash
pkill -9 -f "chrome-headless-shell" 2>/dev/null
pkill -9 -f "playwright" 2>/dev/null
sleep 1
```

실행 후 Playwright MCP 툴을 다시 호출하면 MCP 서버가 새 브라우저를 자동 스폰한다.

> ⚠️ **크래시 방지**: `localhost:8888` 등 로컬 앱은 Playwright로 접근하지 않는다. 렌더러 크래시로 브라우저가 닫히는 원인이 된다.

### 🔑 환경변수 (원격 에이전트 / 로컬 공통)
```
SUPABASE_URL=https://mkoryudscamnopvxdelk.supabase.co
SUPABASE_SERVICE_KEY=<Netlify env SUPABASE_SERVICE_KEY>
```
로컬 실행 시에는 `netlify env:get`으로 가져와서 사용:
```bash
SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL)
SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY)
```

---

## 🚫 수집 제외 목록 (Excluded Sources)
수집 금지 URL — 해당 URL이 source_url인 레코드는 DB에서 `status='excluded'`로 마킹되어 인제스터에 노출되지 않음.

| URL | 이유 |
|-----|------|
| https://allaboutswing.co.kr/20 | 사용자 지정 제외 |

> 새 제외 URL 추가 시:
> ```bash
> SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL)
> SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY)
> curl -s -X PATCH "$SUPABASE_URL/rest/v1/scraped_events?source_url=eq.제외할URL" \
>   -H "apikey: $SUPABASE_KEY" \
>   -H "Authorization: Bearer $SUPABASE_KEY" \
>   -H "Content-Type: application/json" \
>   -d '{"status":"excluded"}'
> ```
> 그리고 이 목록에도 추가할 것.

---

## 📋 Static Collection List (정적 수집 목록)

### 🍺 바 (Bar / Venue)
| 이름 | 타입 | URL |
|------|------|-----|
| 해피홀 | instagram | https://www.instagram.com/happyhall2004/ |
| 스윙타임 | instagram | https://www.instagram.com/swingtimebar/ |
| 피에스타 | instagram | https://www.instagram.com/fiesta_swingdance/ |
| 봉천살롱 | instagram | https://www.instagram.com/bongcheonsalon/ |
| 비밥바 | instagram | https://www.instagram.com/bebopbar_swing/ |
| 루나 | instagram | https://www.instagram.com/luna_swingbar/ |
| 인더무드신림 | instagram | https://www.instagram.com/inthemood_sillim/ |
| Dialogue | instagram | https://www.instagram.com/dialogue_swing/ |
| 243 | instagram | https://www.instagram.com/243_swingbar/ |
| 아수라장 | instagram | https://www.instagram.com/asurajang_swing/ |
| 쏘셜클럽 | instagram | https://www.instagram.com/sosyalclub_swing/ |
| 스윙잇 | instagram | https://www.instagram.com/swingit_seoul/ |
| 스파(SPA) | instagram | https://www.instagram.com/spa_swingdance/ |
| LQ스튜디오 | instagram | https://www.instagram.com/lq_studio_swing/ |
| 탐나홀 (제주) | instagram | https://www.instagram.com/tamnahall/ |
| KP댄스홀 | instagram | https://www.instagram.com/kpdancehall/ |
| 스탭업댄스 | instagram | https://www.instagram.com/stepupdance_swing/ |

### 🕺 동호회 (Club)
| 이름 | 타입 | URL |
|------|------|-----|
| ~~네오스윙~~ | ~~instagram~~ | ~~https://www.instagram.com/neo_swing/~~ ← **2026-04-01부터 "네오살사"로 전환, 수집 제외** |
| 스윙스캔들 | naver_cafe | https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I |
| 올어바웃스윙 | instagram | https://www.instagram.com/allaboutswing_kr/ |
| 경성홀 | instagram | https://www.instagram.com/kyungsunghall/ | ⚠️ 주 초반에 이번주 토/일/화 일정 한번에 게시. 포스트 없으면 스킵. |
| 강남웨스티스 | instagram | https://www.instagram.com/gangnam_westies/ |
| 스윙키즈 | instagram | https://www.instagram.com/swingkids_kr/ |
| 스윙프렌즈 (카페) | naver_cafe | https://cafe.naver.com/f-e/cafes/10026855/menus/85?viewType=L | ⚠️ URL 접근 불가 시 https://cafe.naver.com/swingfriends 에서 타임바 게시판 메뉴를 찾아 URL 업데이트 |
| 스윙프렌즈 (페이스북) | facebook | https://www.facebook.com/Swingfriendstimebar |
| 스윙팩토리 | instagram | https://www.instagram.com/swingfactory_kr/ |
| 스윙타운 | naver_cafe | https://cafe.naver.com/f-e/cafes/10342583/menus/264?viewType=L |
| 스윙홀릭 (광주) | instagram | https://www.instagram.com/swingholic/ |

### 🎓 강습/워크숍
| 이름 | 타입 | URL |
|------|------|-----|
| 스윙패밀리 카페 [외강&행사&연습실] | naver_cafe | https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L |
| 스위티스윙 카페 [공지/신청] | daum_cafe | https://cafe.daum.net/sweetyswing/5ngW |
| BAT SWING | website | https://batswing.co.kr/ |

> ⚠️ 강습 수집 규칙:
> - 네이버 카페는 로그인 없이 접근 가능한 첫 페이지만 수집 (15개 이내)
> - 강습 시작일이 오늘 이후인 것만 수집
> - 정기 강습(~8주 과정)은 시작일 기준 1건만 등록 (매주 쪼개기 금지)

### 🎪 연합/대형 행사
| 이름 | 타입 | URL |
|------|------|-----|
| CSI (CampSwingIt) | instagram | https://www.instagram.com/campswingit/ |
| 바다제 (제주) | instagram | https://www.instagram.com/badaje_jeju/ |
| 부산 린디합 위켄드 | instagram | https://www.instagram.com/busan_lindy_weekend/ |
| 서울 린디페스트 | instagram | https://www.instagram.com/seoulindyfest/ |

---

## 🔍 동적 검색 키워드 (Dynamic Search Keywords)
- `"스윙댄스 2026"`
- `"스윙댄스 소셜 모집"`
- `"스윙댄스 파티"`
- `"스윙댄스 라이브"`
- `"린디합 2026"`
- `"웨스트코스트스윙 2026"`
- `"스윙댄스 강습"`
- `"스윙 소셜 서울"`
- `"스윙 소셜 부산"`

---

## 🛠 수집 및 저장 절차

### 0. 과거 완료 데이터 자동 정리 (수집 시작 전 필수)
수집을 시작하기 전에 **반드시** `is_collected=true`이면서 이벤트 날짜(`structured_data.date`)가 오늘 이전인 레코드를 삭제한다.

```bash
SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null || echo "$SUPABASE_URL")
SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null || echo "$SUPABASE_KEY")
TODAY=$(date +%Y-%m-%d)

curl -s -X DELETE "$SUPABASE_URL/rest/v1/scraped_events?is_collected=eq.true&structured_data->>date=lt.$TODAY" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Prefer: return=representation" \
  | jq 'length' 2>/dev/null || echo "정리 완료"
```

> 기준: **이벤트 해당일(`structured_data.date`) < 오늘** 인 완료 데이터만 삭제. 미래 이벤트는 건드리지 않음.

### 1. 검색 및 데이터 추출
- 게시물 주소(`source_url`), 내용 요약(`extracted_text`), 날짜(`structured_data.date`), 이미지를 추출한다.
- 날짜가 명확하지 않은 경우 본문 텍스트에서 요일을 대조하여 날짜를 확정한다.

### 2. 이미지 수집 및 Supabase Storage 업로드 (필수)

**방법 A — Playwright로 CDN URL 추출 후 Supabase Storage 업로드 (권장)**
```bash
# 환경변수 세팅
SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null || echo "$SUPABASE_URL")
SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null || echo "$SUPABASE_SERVICE_KEY")

# 1. Playwright로 이미지 CDN URL 추출 후 임시 파일로 다운로드
curl -s -L "CDN_URL" -o /tmp/파일명.jpg

# 2. Supabase Storage에 업로드
curl -s -X POST "$SUPABASE_URL/storage/v1/object/scraped/파일명.jpg" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: image/jpeg" \
  -H "x-upsert: true" \
  --data-binary @/tmp/파일명.jpg

# 3. poster_url은 Supabase Storage public URL
# poster_url = "$SUPABASE_URL/storage/v1/object/public/scraped/파일명.jpg"
```

**방법 B — PNG 이미지인 경우**
```bash
curl -s -X POST "$SUPABASE_URL/storage/v1/object/scraped/파일명.png" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: image/png" \
  -H "x-upsert: true" \
  --data-binary @/tmp/파일명.png
```

> ⚠️ **poster_url 경로 규칙**: Supabase Storage public URL을 사용한다.
> 형식: `https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg`
> 로컬 `/scraped/` 경로 및 `/.netlify/functions/scraped-image?file=` 형식은 **원격 에이전트에서 사용 금지**.

### 3. ID 생성 규칙 (L1 중복 방지 — 반드시 준수)

**ID는 `source_url + date`를 조합한 결정론적 해시로 고정 생성한다.**
같은 포스트 + 같은 날짜면 항상 같은 ID → DB의 PK 중복 제약이 자동으로 재삽입을 막는다.

```bash
ID=$(python3 -c "
import hashlib
source_url = 'https://실제_소스_URL'
date = '2026-MM-DD'
raw = f'{source_url}|{date}'
print(hashlib.md5(raw.encode()).hexdigest()[:16])
")
```

**규칙:**
- 하나의 포스트에서 날짜가 다른 여러 이벤트 → 날짜가 달라지므로 ID도 달라진다 → 정상
- 하나의 포스트에서 같은 날짜에 두 이벤트(예: 소셜 + 워크숍) → 접미사 `_2` 추가: `{hash}_2`
- **절대 UUID를 임의 생성하거나 임의 문자열로 ID를 만들지 말 것**

---

### 3-B. 삽입 전 크로스소스 중복 체크 (L2/L3 — 필수)

**L1(PK해시)만으로는 막지 못하는 중복이 있다:**
- 같은 행사가 Instagram + Facebook + 카페에 동시 게시 → 소스 URL이 달라서 L1 통과 → 3건 삽입
- 매주 반복 소셜이 새 포스트로 올라올 때마다 → 새 URL → 재삽입
- 동일 행사를 2주 전, 1주 전 두 번 공지 → 2건 삽입

**삽입 전 반드시 아래 체크를 수행하고, 중복으로 판단되면 삽입을 건너뛴다.**

#### L2 — 정규화 제목 시맨틱 해시 체크

삽입할 이벤트의 `(정규화제목 + date)`로 시맨틱 ID를 생성하고, DB에 같은 값이 있으면 스킵.

```bash
# 시맨틱 ID 생성 (제목 정규화: 소문자, 공백/특수문자 제거, 조사 제거)
TITLE="삽입할 이벤트 제목"
DATE="2026-MM-DD"

SEMANTIC_ID=$(python3 -c "
import hashlib, re
title = '$TITLE'
date = '$DATE'
# 정규화: 소문자, 영숫자+한글만 남김, 공백 제거
normalized = re.sub(r'[^\w가-힣]', '', title.lower().replace(' ', ''))
# 흔한 접두/접미 노이즈 제거 (장소 표시, @ 등은 이미 특수문자 제거로 처리됨)
raw = f'{normalized}|{date}'
print('sem_' + hashlib.md5(raw.encode()).hexdigest()[:12])
")

# DB에서 같은 시맨틱 ID가 있는지 확인
SUPABASE_URL=\$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null || echo "\$SUPABASE_URL")
SUPABASE_KEY=\$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null || echo "\$SUPABASE_KEY")

EXISTING=\$(curl -s "\$SUPABASE_URL/rest/v1/scraped_events?semantic_id=eq.\$SEMANTIC_ID&select=id,structured_data->>title" \
  -H "apikey: \$SUPABASE_KEY" \
  -H "Authorization: Bearer \$SUPABASE_KEY")

COUNT=\$(echo "\$EXISTING" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
if [ "\$COUNT" -gt 0 ]; then
  echo "⏭ L2 시맨틱 중복 스킵: \$TITLE (\$DATE) — 이미 존재"
  # 스킵 카운터 증가 후 다음 이벤트로
fi
```

> `semantic_id` 컬럼이 DB에 없으면 L3 쿼리로만 체크해도 된다.

#### L3 — 같은 날짜 DB 조회 + 문자 trigram + 공통 접두어 유사도 체크

같은 날짜 이벤트를 DB에서 조회하고, 문자 trigram 유사도와 장소명 접두어 일치로 중복을 판단한다.  
(단어 토큰 방식은 한글 복합어에 취약하므로 문자 단위 n-gram을 사용한다.)

```bash
DATE="2026-MM-DD"
TITLE="삽입할 이벤트 제목"

SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null || echo "$SUPABASE_URL")
SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null || echo "$SUPABASE_KEY")

# 같은 날짜 기존 이벤트 조회 (수집완료/미수집 모두 포함 — is_collected 필터 제거 필수)
SAME_DATE=$(curl -s "$SUPABASE_URL/rest/v1/scraped_events?structured_data->>date=eq.$DATE&select=id,structured_data->>title" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY")

IS_DUP=$(echo "$SAME_DATE" | python3 -c "
import sys, json, re

def norm(s):
    return re.sub(r'[^\w가-힣a-zA-Z0-9]', '', s.lower())

def trigrams(s):
    s = norm(s)
    return set(s[i:i+3] for i in range(len(s)-2)) if len(s) >= 3 else set(s)

def ngram_sim(a, b):
    ta, tb = trigrams(a), trigrams(b)
    if not ta or not tb: return 0
    return len(ta & tb) / len(ta | tb)

def common_prefix_len(a, b):
    na, nb = norm(a), norm(b)
    i = 0
    while i < min(len(na), len(nb)) and na[i] == nb[i]:
        i += 1
    return i

def is_dup(t1, t2):
    ng = ngram_sim(t1, t2)
    cp = common_prefix_len(t1, t2)
    n1, n2 = norm(t1), norm(t2)
    s1, s2 = n1[cp:], n2[cp:]
    sfx_ng = ngram_sim(s1, s2) if s1 and s2 else 1.0

    # suffix가 길고(4자+) 내용이 완전히 다르면 → 다른 이벤트 (같은 기수 다른 레벨 등)
    if len(s1) >= 4 and len(s2) >= 4 and sfx_ng < 0.3 and cp < len(n1) * 0.85:
        return False

    if ng >= 0.55: return True
    if cp >= 5 and ng >= 0.25: return True
    if cp >= 3 and ng >= 0.45: return True
    return False

new_title = '$TITLE'
data = json.load(sys.stdin)
for row in data:
    ex_title = row.get('title') or ''
    if is_dup(new_title, ex_title):
        print(f'DUP:{ex_title[:35]}')
        break
else:
    print('OK')
")

if [[ "$IS_DUP" == DUP:* ]]; then
  DUP_INFO="${IS_DUP#DUP:}"
  echo "⏭ L3 중복 스킵: $TITLE  →  '$DUP_INFO'"
  # 스킵 카운터 증가 후 다음 이벤트로
fi
```

**L3 중복 판단 기준 (실 데이터 검증 완료, 정확도 91%):**
| 조건 | 판단 | 예시 |
|------|------|------|
| suffix 4자+ & suffix_ng < 0.3 & cp < 85% | **독립 이벤트** (먼저 판단) | 네오스윙 139기 베이직 ↔ 네오스윙 139기 초중급 |
| trigram 유사도 ≥ 0.55 | 중복 | 스윙타임바수요소셜 ↔ 스윙타임바수요소셜댄스 |
| 공통 접두어 ≥ 5자 + trigram ≥ 0.25 | 중복 | 봉천살롱토봉소셜 ↔ 봉천살롱토요소셜 |
| 공통 접두어 ≥ 3자 + trigram ≥ 0.45 | 중복 | 해피홀금요소셜 ↔ 해피홀금요일소셜 |
| 나머지 | 독립 이벤트 (삽입 OK) | 경성홀소셜 ↔ 봉천살롱소셜 |

> ✅ **같은 기수 다른 레벨 강습 자동 통과**: "네오스윙 139기 베이직" ↔ "네오스윙 139기 초중급" — suffix가 길고 달라서 자동으로 독립 이벤트 판정. 실 DB 검증 완료.  
> ✅ **날짜 필터 선행**: 다른 날의 정기소셜끼리 오탐하는 케이스는 실전에서 발생하지 않음.

---

### 4. 데이터 저장 — Supabase DB

- **실제 데이터 소스는 Supabase `scraped_events` 테이블**이다.
- `sqlite3` 명령 및 로컬 DB 파일은 **원격 에이전트에서 사용 금지**.
- **반드시 Supabase REST API(PostgREST)로 삽입**한다.
- L2/L3 체크를 통과한 경우에만 아래 삽입을 실행한다.

```bash
SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null || echo "$SUPABASE_URL")
SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null || echo "$SUPABASE_SERVICE_KEY")

# L1 ID 생성
ID=$(python3 -c "import hashlib; print(hashlib.md5('https://source_url|2026-MM-DD'.encode()).hexdigest()[:16])")

curl -s -X POST "$SUPABASE_URL/rest/v1/scraped_events" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=ignore-duplicates" \
  -d "{
    \"id\": \"$ID\",
    \"keyword\": \"키워드\",
    \"source_url\": \"https://source_url\",
    \"poster_url\": \"https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg\",
    \"extracted_text\": \"본문 요약\",
    \"structured_data\": {\"date\":\"2026-MM-DD\",\"day\":\"요일\",\"title\":\"이벤트명\",\"event_type\":\"소셜\",\"status\":\"정상운영\",\"djs\":[],\"times\":[],\"location\":\"장소\",\"fee\":\"금액\",\"note\":\"\"},
    \"is_collected\": false
  }"
```

**중복 체크 요약 (3단계 레이어):**
| 레이어 | 방법 | 감지하는 중복 유형 |
|--------|------|-------------------|
| L1 | source_url + date PK 해시 | 완전히 동일한 포스트 재수집 |
| L2 | 정규화 제목 + date 시맨틱 해시 | 다른 포스트지만 동일 내용 (리마인더 등) |
| L3 | 같은 날짜 DB 조회 + 자카드 유사도 | 크로스소스 중복 (Instagram + Facebook 등) |

### 4. event_type 분류 기준
- `소셜` — 소셜댄스, 위클리 소셜, 오픈파티 (입문자 포함 누구나 참여)
- `파티/행사` — DJ 파티, 졸업파티, 특별행사
- `강습` — 강습, 클래스, 워크샵
- `동호회` — 동호회 자체 행사

> ⚠️ `event_type` 필드가 structured_data에 있으면 자동 분류를 덮어씀. 반드시 명시할 것.

---

## 📋 완료 검증 (Final Checklist)
- [ ] 실제 포스트 URL을 직접 열어서 내용을 읽었는가? (추측/패턴 삽입 아님)
- [ ] 소셜 이벤트는 DJ 이름이 포스트에 명시되어 있었는가?
- [ ] 이미지가 Supabase Storage에 업로드되었는가?
  ```bash
  curl -s "https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg" -o /dev/null -w "%{http_code}"
  # 200이면 OK
  ```
- [ ] 수집된 행사의 날짜가 오늘 이후인가?
- [ ] `poster_url`이 Supabase Storage public URL 형식인가?
  (`https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/파일명.jpg`)
- [ ] Supabase DB에 정상 삽입되었는가?
  ```bash
  SUPABASE_URL=$(netlify env:get VITE_PUBLIC_SUPABASE_URL 2>/dev/null || echo "$SUPABASE_URL")
  SUPABASE_KEY=$(netlify env:get SUPABASE_SERVICE_KEY 2>/dev/null || echo "$SUPABASE_SERVICE_KEY")
  curl -s "$SUPABASE_URL/rest/v1/scraped_events?is_collected=eq.false&order=created_at.desc&limit=5&select=id,poster_url,structured_data->>title" \
    -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
  ```
- [ ] `http://localhost:8888/admin/v2/ingestor` 신규 탭에서 이미지 썸네일이 표시되는가? (로컬 실행 시)

---

## 📝 수집 완료 후 — 실행 로그 보고서 갱신 (필수)

수집이 끝나면 **반드시** `/Users/inteyeo/Rhythmjoy2025555-5/docs/INGESTION_STATUS.md` 파일의 `## 📊 실행 로그` 섹션에 이번 회차 결과를 추가한다.

> ⚠️ **경로 고정**: 이 파일은 git 관리 대상. `/Users/inteyeo/scripts/INGESTION_STATUS.md` (구 경로)는 더 이상 사용하지 않는다.

### 추가 형식
```markdown
### YYYY-MM-DD HH:MM 실행
- **신규 수집**: N건
- **중복 스킵**: N건
- **접근 불가**: [계정명(사유), 계정명(사유), ...]
- **이슈**:
  - [발생한 문제 — 예: Stream timeout, 이미지 업로드 실패, 비공개 계정 등]
- **개선 필요**:
  - [다음 회차에 반영할 사항]
- **수집 목록**:
  | 날짜 | 이벤트명 | 타입 | DJ/강사 |
  |------|----------|------|---------|
  | ... | ... | ... | ... |
```

### 갱신 절차
1. `/Users/inteyeo/Rhythmjoy2025555-5/docs/INGESTION_STATUS.md` 파일을 Read로 읽는다.
2. `## 📊 실행 로그` 섹션이 없으면 만든다.
3. **최신 회차를 맨 위에 추가**한다 (오래된 것이 아래).
4. 잔존 문제(`## 🚨 잔존 문제`) 섹션도 최신 상태로 업데이트한다.
   - 해결된 이슈는 ✅로 표시, 신규 이슈는 추가.
5. Write/Edit로 파일을 저장한다.

### ⚠️ 기록 필수 규칙 (모든 실행에 적용)
- **날짜+시간 헤더 필수**: `### YYYY-MM-DD HH:MM 실행` 형식 — 생략 불가
- **접근 불가 소스 전부 기록**: 이름 + 사유 (로그인 리다이렉트 / DNS 오류 / 렌더링 실패 등)
- **이슈 발생 시 즉시 기록**: 오류 메시지 원문 포함, 재발 방지를 위해 구체적으로 남길 것
- **잔존 문제 섹션 갱신**: 새 문제 발견 시 날짜 명시해서 추가, 기존 문제 해결되면 ✅ 처리
- 같은 문제를 두 번 조사하지 않도록 — **기록이 없으면 다음 에이전트가 반복한다**

---

## 📤 수집 종료 시 — Telegram 요약 출력 (필수 마지막 단계)

INGESTION_STATUS.md 갱신이 끝나면 **반드시** 아래 형식을 stdout에 출력한다.  
run-ingestion.sh가 이 블록을 파싱해서 Telegram으로 전송한다. **형식 절대 변경 금지.**

> ⚠️ **호출 방식과 무관하게 항상 출력 필수**: LaunchAgent 자동실행이든, 터미널 수동 실행이든, "직접 호출이라 생략" 같은 판단 절대 금지. 항상 출력한다.

> ⚠️ **신규/스킵 카운팅 기준**: `신규`는 DB에 실제로 새로 삽입된 건수. `ignore-duplicates`로 스킵된 건수는 `스킵`으로 기록한다. DB insert 응답이 빈 배열 `[]`이면 스킵된 것.

```
==TELEGRAM_SUMMARY_START==
신규: N건
스킵: N건
접근불가: 소스명(사유), 소스명(사유)
이슈: 없음  ← 또는 발생한 이슈 한 줄 요약
==TELEGRAM_SUMMARY_END==
```

예시:
```
==TELEGRAM_SUMMARY_START==
신규: 5건
스킵: 3건
접근불가: 봉천살롱(비공개), batswing.co.kr(DNS오류), 스위티스윙(렌더링실패)
이슈: 없음
==TELEGRAM_SUMMARY_END==
```

- 접근불가가 없으면: `접근불가: 없음`
- 평소에 되던 소스가 이번에 막혔으면 이슈 항목에 명시: `이슈: 해피홀 평소 접근 가능했으나 오늘 로그인 리다이렉트`
