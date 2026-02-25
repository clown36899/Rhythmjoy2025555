---
description: 쇼케이스 복합 디렉션(Composite Direction) 제작 가이드 - 다양한 전환과 모션 그래픽을 조합하여 시네마틱 쇼케이스를 제작하는 방법
---

# 쇼케이스 복합 디렉션(Composite Direction) 제작 가이드

## 개요

**복합 디렉션**이란 하나의 쇼케이스 안에서 여러 단계(Stage)를 두고, 각 단계마다 서로 다른 모션 기법과 시각 연출을 조합하여 하나의 '영상 콘텐츠'처럼 서사적 흐름을 만드는 방식이다.

**단일 디렉션(V2~V4)**: 하나의 CSS 애니메이션이 무한 반복 (예: 스트림 벨트, 시네마 롤링).
**복합 디렉션(V1)**: 여러 스테이지를 거치며 각각 다른 모션을 순차 실행 → 루프.

---

## V1 아키텍처 해부 (현재 유일한 복합 디렉션)

### 스테이지 구조

```
Opening (2.5s) → Spotlight (N × 1s) → Outro (3s) → [Loop] Opening...
```

| 스테이지 | 지속 시간 | 모션 기법 | 배경 반응 |
|----------|-----------|-----------|-----------|
| **Opening** | 2.5s | 제목 slide-in + 네온 플리커 | 배경 타일 느린 스크롤 (100s) |
| **Spotlight** | 이벤트 수 × 1s | 순차 줌인/아웃 + 카드 급등장 | 배경 3.5x 줌 + blur 5px |
| **Outro** | 3s | 브랜드 텍스트 scale-up | 배경 6x 극단 줌 + blur 15px |

### 핵심 원칙

1. **매 스테이지마다 배경이 반응한다** - CSS `:has()` 셀렉터로 자식 상태에 따라 부모(배경) 스타일 변화
2. **모션 기법을 겹치지 않게 배분** - Opening은 translateY, Spotlight은 scale, Outro는 zoom+fade
3. **상태 엔진이 타이머 기반으로 스테이지를 전환** - React useState + useEffect + setTimeout/setInterval

---

## 레이어 구조 (z-index 계층)

```
z-index: 200  → Outro Stage (최상위, 브랜드 아트)
z-index: 150  → Spotlight Stage (개별 이벤트 카드)
z-index: 100  → Title Overlay (DANCE BILLBOARD)
z-index: 1    → Background Canvas (포스터 몽타주 타일)
```

**규칙**: 새로운 스테이지가 나타나면 이전 스테이지를 `opacity: 0 + visibility: hidden`으로 퇴장시키는 것이 아니라, 위에 새 레이어를 덮는 방식. 이렇게 해야 배경이 항상 살아있어 `:has()` 반응이 가능하다.

---

## 모션 그래픽 카탈로그 (사용 가능한 기법)

새 버전 제작 시 아래 기법들을 조합하여 스테이지별로 배분한다.

### 등장 모션 (Entry Motion)
| 기법 | CSS 속성 | 느낌 |
|------|----------|------|
| **Slide-In** | `translateY(120vh) → 0` | 아래에서 솟아오름 |
| **Slide-Left** | `translateX(-100vw) → 0` | 왼쪽에서 밀려 들어옴 |
| **Slide-Right** | `translateX(100vw) → 0` | 오른쪽에서 밀려 들어옴 |
| **Scale-Up** | `scale(0) → scale(1)` | 작은 점에서 확대 |
| **Scale-Down** | `scale(3) → scale(1)` | 거대한 상태에서 축소 |
| **Neon Flicker** | `opacity` 깜빡임 + `brightness` 폭발 | 네온사인 점등 |
| **Rotate-In** | `rotate(90deg) + scale(0) → 정상` | 회전하며 나타남 |
| **Blur Reveal** | `blur(30px) → blur(0)` + `opacity` | 안개 속에서 선명해짐 |
| **Clip Reveal** | `clip-path: inset(50%) → inset(0%)` | 중앙에서 사각으로 펼쳐짐 |
| **TypeWriter** | 글자 하나씩 `opacity: 0 → 1` | 타이핑 효과 |
| **Split Slide** | 좌우 반씩 반대방향에서 합쳐짐 | 영화 타이틀 느낌 |

### 전환 모션 (Transition Motion)
| 기법 | CSS 속성 | 느낌 |
|------|----------|------|
| **Cross-Fade** | `opacity` 교체 | 부드러운 디졸브 |
| **Zoom Transition** | 현재 `scale(2) → fade` + 다음 `scale(0.5) → 1` | 줌인 후 다음 씬 |
| **Swipe** | `translateX(-100%) + translateX(100%)` | 슬라이드 교체 |
| **Flip** | `rotateY(180deg)` 반전 | 카드 뒤집기 |
| **Morph** | `border-radius + width + height` 변화 | 형태 변형 |

### 배경 반응 (Background Reaction)
| 기법 | CSS 속성 | 느낌 |
|------|----------|------|
| **Infinity Zoom** | `scale(1) → scale(3.5)` | 배경이 빨려들어감 |
| **Extreme Zoom** | `scale(6) + blur(15px)` | 극단적 확대, 아웃로용 |
| **Color Shift** | `hue-rotate(0deg → 360deg)` | 색상 변환 |
| **Perspective Tilt** | `perspective(1000px) rotateX(10deg)` | 3D 기울임 |
| **Pulse** | `scale(1) ↔ scale(1.05)` 반복 | 심장박동 리듬 |
| **Vignette** | `radial-gradient` 오버레이 강화 | 집중 효과 |

---

## 상태 엔진 패턴 (React)

```tsx
// 1. 스테이지 상태 정의
const [stage, setStage] = useState<'opening' | 'spotlight' | 'outro'>('opening');
const [activeIndex, setActiveIndex] = useState(-1);

// 2. 스테이지 전환 타이머 (Opening → Spotlight)
useEffect(() => {
    if (stage === 'opening') {
        const timer = setTimeout(() => {
            setStage('spotlight');
            setActiveIndex(0);
        }, OPENING_DURATION);
        return () => clearTimeout(timer);
    }
    if (stage === 'outro') {
        const timer = setTimeout(() => {
            setStage('opening'); // Loop back
        }, OUTRO_DURATION);
        return () => clearTimeout(timer);
    }
}, [stage]);

// 3. 순차 전환 타이머 (Spotlight 내부)
useEffect(() => {
    if (stage === 'spotlight') {
        const timer = setInterval(() => {
            setActiveIndex(prev => {
                if (prev >= events.length - 1) {
                    setStage('outro');
                    return prev;
                }
                return prev + 1;
            });
        }, SPOTLIGHT_INTERVAL);
        return () => clearInterval(timer);
    }
}, [stage, events.length]);
```

**핵심**: `useEffect`의 dependency에 `stage`를 포함하여, 스테이지 전환 시 이전 타이머가 cleanup되고 새 타이머가 설정된다.

---

## CSS `:has()` 배경 반응 패턴

```css
/* 스포트라이트 단계에서 배경 반응 */
.container:has(.spotlight-item.active) .background {
    transform: scale(3.5);
    filter: blur(5px);
    transition: all 0.25s ease;
}

/* 아웃로 단계에서 배경 극단 반응 */
.container:has(.outro-stage.active) .background {
    transform: scale(6);
    filter: blur(15px);
    transition: all 3s ease;
}
```

**주의**: `:has()`는 구형 Safari(15.3 이전)에서 미지원. 현재 타겟 기기에서는 문제없음.

---

## 새 버전(V5+) 제작 체크리스트

1. **스테이지 3개 이상 설계** - 최소 Opening + Main + Outro
2. **각 스테이지별 다른 모션 기법 배정** - 위 카탈로그에서 겹치지 않게 선택
3. **배경 반응 차등 설계** - 스테이지마다 배경의 반응 강도/방식을 다르게 설정
4. **타이밍 밸런스** - Opening은 짧게(2~3s), Main은 이벤트 수에 비례, Outro는 여운(3~4s)
5. **루프 포인트 설정** - Outro 종료 후 Opening으로 자연스럽게 회귀 (리셋 로직 필수)
6. **z-index 계층 명확히** - 각 스테이지 레이어 순서 사전 정의
7. **모바일 대응** - `@media (max-width: 768px)`에서 크기/속도 조정

---

## V5 제작 시 참고할 합성 예시

### 예시 A: "시네마틱 리바운드"
```
Opening: 글자가 왼쪽+오른쪽에서 Split-Slide로 합쳐짐 (2s)
    → 배경: Perspective Tilt (3D 기울임 느낌)
Spotlight: 카드가 Clip-Reveal로 중앙에서 펼쳐짐 (이벤트당 1.5s)
    → 배경: Color Shift (이벤트별 색상 변환)
Outro: 브랜드 로고가 Scale-Down (거대→정상)으로 등장 (3s)
    → 배경: Extreme Zoom + Vignette
```

### 예시 B: "네온 카니발"
```
Opening: 제목이 TypeWriter로 타이핑됨 + Neon Flicker (3s)
    → 배경: Pulse (심장박동 리듬)
Spotlight: 카드가 Rotate-In으로 회전 등장 (이벤트당 1.2s)
    → 배경: Infinity Zoom
Transition: 카드 간 Flip 전환 (카드 뒤집기)
Outro: Blur Reveal 역순 (선명→안개) + 브랜드 Slide-In (2s)
    → 배경: Color Shift + Extreme Zoom
```

### 예시 C: "갤러리 워크"
```
Opening: Blur Reveal (안개 속에서 점점 선명해지는 갤러리) (2.5s)
    → 배경: 정적 그리드에서 서서히 움직이기 시작
Spotlight: Swipe 방식으로 좌→우 슬라이드 전환 (이벤트당 1s)
    → 배경: 활성 이벤트 타일만 확대 (Physical Connection)
Outro: 전체 그리드가 한번에 Scale-Down → 브랜드 텍스트 등장 (3s)
    → 배경: 모든 타일 동시에 축소
```
