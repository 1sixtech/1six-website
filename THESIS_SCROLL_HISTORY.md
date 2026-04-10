# ThesisSection Scroll — 문제 히스토리 및 현재 상태

## 업데이트 (`2026-04-10`)

### 18. 마지막 슬라이드 하향 탈출 시 bottom sentinel 재캡처 차단
- **증상**: thesis-07에서 아래로 강하게 스와이프해도 `ThesisGraph`로 빠지지 않고 Thesis에 붙잡히는 느낌.
- **원인**:
  - `release('down')`가 bottom sentinel이 아니라 top sentinel만 막고 있었음
  - 동시에 `scrollIntoView({ behavior: 'smooth' })`가 `#thesis-graph`를 viewport top에 정렬하면서 thesis 바로 아래의 bottom sentinel을 다시 intersect 상태로 만듦
  - 결과적으로 smooth exit 중 bottom sentinel이 다시 `capture('bottom')`을 실행
- **수정**:
  - 하향 탈출 시 bottom sentinel 자체를 cooldown으로 잠금
  - `scrollIntoView()` 대신 `window.scrollTo(graphTop + 1, 'smooth')`로 종료 위치를 `ThesisGraph` 내부 1px까지 넘김
  - sentinel이 viewport 바깥으로 빠진 뒤에만 역방향 재진입이 가능하도록 조정

### 19. 모바일 햄버거 메뉴 Product 이동 시 Thesis capture 해제 + hash 이동 경로 통합
- **증상**: 모바일 메뉴에서 `PRODUCTS`를 눌러도 Thesis에 남아 있거나, home hash 이동이 일관되지 않음.
- **원인**:
  - `Header`가 same-page hash 이동 시 Thesis 모바일 capture 상태를 해제하지 않음
  - `ScrollToTop`이 여전히 존재하지 않는 `#about` pin-spacer를 기다리고 있어 direct hash/home re-entry가 5초 fallback로 밀릴 수 있었음
  - same-page / cross-route hash 이동 로직이 서로 다른 코드 경로로 분기되어 동작이 갈라져 있었음
- **수정**:
  - `HASH_SCROLL_REQUEST_EVENT`를 추가해 hash 이동 직전에 `ThesisSectionMobile`이 touch capture를 해제하도록 변경
  - hash scroll 계산을 `src/lib/hashScroll.ts`로 공통화
  - cross-route 이동은 `router.push('/#hash', { scroll: false })`로 단일화
  - `ScrollToTop`은 `#thesis` pin-spacer readiness를 기준으로 polling하도록 수정

### 20. 초기 로드 오발 capture와 exit/nav 중 재캡처 억제 보강
- **증상**:
  - 홈 첫 로드 직후 Hero가 아니라 Thesis 첫 페이지로 즉시 끌려감
  - 메뉴 이동이나 smooth exit 도중에도 sentinel/threshold가 다시 살아나 첫 페이지나 마지막 페이지로 재캡처될 수 있었음
- **원인**:
  - top sentinel IO가 "viewport를 벗어남"이 아니라 "현재 intersecting이 아님"만 보고 즉시 capture
  - programmatic hash scroll과 exit smooth scroll 중에도 capture 조건이 계속 활성 상태였음
  - bottom re-entry는 zero-height sentinel의 0px 경계 first-intersect 특성 때문에 지나치게 예민했음
- **수정**:
  - top sentinel은 `entry.boundingClientRect.bottom < 0`일 때만 capture하도록 보강
  - exit 및 programmatic nav 시 `CAPTURE_SUSPEND_MS = 1200` 동안 capture 전체를 억제
  - reverse re-entry는 bottom sentinel IO 대신 `window.scrollY` crossing 기반 threshold 검출로 변경
  - `ScrollToTop`도 초기 hash 랜딩 전에 `HASH_SCROLL_REQUEST_EVENT`를 발행해 동일 억제 경로를 사용

## 현재 코드 상태 (`8b9312e`)

ThesisSection은 **데스크톱/모바일 완전 분리** 아키텍처:

- **데스크톱 (768px+):** 기존 GSAP ScrollTrigger `pin: true` + Observer로 discrete page-by-page crossfade 전환 (7페이지). 코드 무변경, 100% 정상 작동.
- **모바일 (767px-):** `ThesisSectionMobile` 컴포넌트 — Swiper.js vertical + EffectFade + sentinel 기반 touchmove capture. GSAP pin/Observer/normalizeScroll 일체 미사용.

### 모바일 현재 아키텍처 상세 (`8b9312e`)

```
Hero (normal page scroll)
  │ scroll down
  ▼
┌ top sentinel (h-0, directly above thesis) ─────────┐
│  IO threshold:0, no rootMargin                      │
│  sentinel leaves viewport → capture('top', coords)  │
│  entry.boundingClientRect.bottom = section top      │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ capture('top' | 'bottom', sectionTopAbs) ──────────┐
│  1) stateRef = 'captured'                            │
│  2) window.scrollTo(sectionTopAbs, 'auto')  ← instant │
│  3) swiper.slideTo(dir==='bottom'?TOTAL-1:0, 0)      │
│  4) document.addEventListener('touchmove',           │
│        preventPageScroll, {passive:false})           │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ Thesis (100dvh, Swiper vertical + fade) ───────────┐
│  stateRef === 'captured' →                           │
│    document touchmove.preventDefault() blocks        │
│    all page-level scroll (fullpage.js pattern).      │
│  Swiper handles internal vertical swipes for         │
│    page-by-page crossfade (7 slides).                │
│  All 6 MobileAscii WebGL canvases mount concurrently │
│    while thesis is in view — AsciiCanvas's IO is     │
│    geometric and ignores the opacity-0 wrapper on    │
│    inactive slides. `MAX_ACTIVE_CONTEXTS = 10`       │
│    provides the headroom (verified working from      │
│    aa3f932 onward). A true single-canvas approach    │
│    would require real unmount of inactive subtrees   │
│    and is NOT implemented.                           │
│                                                      │
│  Edge exit (touchend on section):                    │
│    Slide 0  + swipe UP   > 50px → release('up')     │
│    Slide N-1 + swipe DOWN > 50px → release('down')  │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ release(exitDirection) ────────────────────────────┐
│  1) stateRef = 'idle'                                │
│  2) document.removeEventListener('touchmove', ...)   │
│  3) blockedSentinel = exitDir==='down' ? 'top':'bot' │
│  4) setTimeout(() => blockedSentinel=null, 700ms)    │
└────────────────────────────────────────────────────┘
  │
  ▼
┌ smooth scroll to Hero (exit up) or                  │
│ smooth scroll to #thesis-graph (exit down)          │
└────────────────────────────────────────────────────┘
  │
  ▼
ThesisGraph (normal page scroll)
  │ scroll up (reverse re-entry)
  ▼
┌ bottom sentinel (h-0, directly below thesis) ──────┐
│  IO threshold:0, rootMargin: '0px 0px -50% 0px'     │
│  → sentinel must scroll up past viewport MIDLINE    │
│    before fire (not just bottom edge)               │
│  → ThesisGraph must be ~half-visible before         │
│    re-capture happens (delays premature re-entry)   │
│  sectionTopAbs = entry.top + scrollY - offsetHeight │
│    (IO snapshot, avoids iOS momentum overshoot)     │
│  → capture('bottom', sectionTopAbs)                  │
└────────────────────────────────────────────────────┘
```

### 핵심 설계 포인트

- **Device split:** `ThesisSection` parent가 `isMobile` state(null→bool)로 라우팅. `isMobile === null` 동안 empty placeholder 렌더링하여 GSAP pin-spacer DOM 조작 방지.
- **데이터 공유:** `thesisData.tsx`에서 `THESIS_STATES`, `InlineAscii`, `MobileAscii`, `subTextClass` export. 두 컴포넌트에서 공유.
- **Scroll capture vs body lock:** `position:fixed` + `overflow:hidden`이 아닌 `document.addEventListener('touchmove', preventDefault, {passive:false})` 사용. iOS momentum race 없고 DOM 조작 없음.
- **normalizeScroll:** 완전 제거. 대신 intro-lock 해제 시 `ScrollTrigger.refresh(true)` 명시적 호출 (ScrollRevealWrapper 동작 보장).
- **WebGL:** 활성 슬라이드 포함 6개 캔버스가 thesis가 뷰포트에 들어올 때 동시에 mount됨. opacity-0 wrapper는 `AsciiCanvas`의 기하학적 IntersectionObserver(`rootMargin: '200px'`)를 막지 못하므로 "active slide만 mount"는 실현되지 않았음. 대신 `MAX_ACTIVE_CONTEXTS = 10` 전역 예산에 의존. `aa3f932` 이후 실사용 검증됨. 실제 단일 캔버스 mount로 가려면 비활성 subtree를 진짜 unmount해야 하고, 그 경우 매 슬라이드 전환마다 re-init 지연이 보이게 됨 — iPhone 검증 없이 변경 금지.
- **Direction-aware cooldown:** exit 방향 반대의 sentinel만 700ms 잠금. 즉시 reverse re-entry 허용.
- **IO entry coords:** capture 시 `getBoundingClientRect()` 대신 `entry.boundingClientRect` 사용. iOS momentum overshoot으로 인한 좌표 오차 제거.

---

## 해결된 문제들

### Phase 1: 데스크톱 GSAP 문제 (해결됨, 모바일 분리 전)

#### 1. 데스크톱 wheel freeze (치명적)
- **증상**: 데스크톱에서 thesis 진입 후 wheel 스크롤로 페이지 전환이 전혀 안 됨. 키보드는 작동.
- **원인**: Two-Observer 패턴(`ffff820`)에서 viewport-level `preventScroll` Observer가 wheel 이벤트를 먼저 소비.
- **해결**: `d3a0e7c`에서 Single Observer로 통합.
- **상태**: ✅ 해결됨

#### 2. 여러 페이지 동시 스킵
- **증상**: 강한 trackpad fling이나 빠른 swipe 시 2-3 페이지 건너뜀.
- **원인**: `onComplete`에서 Observer disable/re-enable 시 150ms cooldown이 trackpad momentum(~500ms-1.5s)보다 짧음.
- **해결**: `1dd6f11`에서 disable 제거 + `COOLDOWN_MS = 400` time-based debounce.
- **상태**: ✅ 해결됨

#### 3. Hero ↔ Thesis 중간에서 스크롤 멈춤
- **증상**: 중간에서 멈추면 native scroll 차단되어 이동 불가.
- **원인**: always-on Observer(`18e889e`)가 `preventDefault: true`로 pin 범위 밖에서도 차단.
- **해결**: `1dd6f11`에서 lifecycle 전환 + sectionActiveRef 조건부.
- **상태**: ✅ 해결됨

#### 4. 데스크톱 마지막 페이지에서 탈출 불가
- **증상**: thesis-07에서 아래로 스크롤해도 ThesisGraph로 안 넘어감.
- **원인**: `+1px` offset이 pin-spacer reflow에 흡수 + safety timeout 미복구.
- **해결**: `1dd6f11`에서 offset `+50px` + safety timeout 복구 로직.
- **상태**: ✅ 해결됨

#### 5. 경계 탈출 시 bounce-back
- **원인**: `onEnterBack`에 bounce-back 보호 없음.
- **해결**: `18e889e`에서 `exitingRef` 도입.
- **상태**: ✅ 해결됨

#### 6. 경계 탈출 시 "한 번 먹히는" 딜레이
- **원인**: `requestAnimationFrame`으로 `scrollTo` 1프레임 defer.
- **해결**: `d15407a`에서 rAF 제거.
- **상태**: ✅ 해결됨

#### 7. 하단 레이어 bleed-through
- **원인**: section에 `overflow: hidden`/`z-index` 미설정.
- **해결**: `d3a0e7c`에서 `overflow-hidden z-10` + `.pin-spacer` 배경색.
- **상태**: ✅ 해결됨

#### 8. iOS 첫 swipe 무시
- **원인**: iOS UIScrollView compositor momentum. 첫 touch는 momentum 정지용.
- **해결**: `5624ab5`에서 module-level `normalizeScroll(true)` 활성화.
- **상태**: ✅ 해결됨 (데스크톱). 모바일은 Swiper로 우회.

---

### Phase 2: 모바일 분리 작업

#### 9. 모바일 전용 분리 시작
- **커밋**: `018dd79` - "feat: replace mobile GSAP scroll-trap with Swiper horizontal fade"
- **시도**: Swiper horizontal + EffectFade로 모바일 전용 컴포넌트 생성.
- **결과**: 빌드 통과. 하지만 수평 스와이프가 thesis의 "아래로 읽는" 스토리텔링에 부자연스러움. SSR hydration 시 GSAP pin-spacer와 React vDOM 충돌로 "something went wrong" 에러 발생.
- **상태**: ❌ hydration 충돌 버그

#### 10. GSAP pin-spacer + React hydration 충돌 수정
- **커밋**: `6a1a73f` - "fix: prevent GSAP pin-spacer DOM conflict on mobile hydration"
- **증상**: 모바일 첫 진입 시 Hero 안 보이고 Thesis 바로 표시. "something went wrong" 에러. 에셋 미로딩.
- **원인**: `isMobile`이 `false`(SSR 기본값)로 시작 → GSAP pin-spacer DOM 생성 → useEffect에서 `isMobile=true`로 변경 → React가 GSAP 조작 DOM 교체 시도 → `removeChild` DOMException.
- **해결**: ThesisSection을 parent(디바이스 감지) + ThesisSectionDesktop(GSAP hooks)로 분리. `isMobile`을 `null`로 시작하여 SSR 시 빈 placeholder, 감지 후 올바른 경로만 마운트.
- **상태**: ✅ 해결됨

#### 11. 수평 스와이프 UX 문제
- **커밋**: `f57f6e8` - "fix: switch mobile thesis to vertical swipe with manual edge exit"
- **증상**: 수평 스와이프가 thesis의 스토리텔링에 부자연스러움.
- **해결**: Swiper direction을 `horizontal` → `vertical`로 변경. Swiper releaseOnEdges가 iOS에서 깨져있어(#6691, #7923), 직접 touchStart/touchEnd delta로 edge exit 감지.
- **상태**: ✅ 해결됨 (UX 개선). 하지만 다음 문제 발생.

#### 12. 페이지 스크롤이 Thesis를 관통함 (첫 시도)
- **커밋**: `22559bb` - "fix: add body scroll lock so thesis stops page scroll on mobile"
- **증상**: Hero에서 스크롤 다운하면 Thesis 첫 페이지만 스쳐 지나가고 바로 Products까지 넘어감. Swiper vertical이 100dvh 섹션으로 DOM에 있지만 페이지 레벨 momentum이 관통.
- **해결 시도**: IntersectionObserver(threshold: 0.6) + body scroll lock. `document.body.style.overflow = 'hidden'` + `position: fixed`로 페이지 스크롤 잠금.
- **결과**: 부분 해결되었지만 새 문제들 발생:
  - 60% threshold가 부정확 (어색한 위치에서 lock)
  - 탈출 후 40% 남은 thesis로 re-lock 발생
  - smooth scroll이 "점프" UX
  - body lock과 smooth scroll 간 race condition
- **상태**: ❌ 부분 해결, 새 문제 발생

#### 13. Sentinel 기반 lock으로 전환 (두 번째 시도)
- **커밋**: `9693a5a` - "fix: sentinel-based scroll lock with Safari fallback and exit cooldown"
- **변경**:
  - IO threshold:0.6 → sentinel 기반 (thesis top = viewport top일 때 lock)
  - smooth → `behavior: 'auto'` (instant)
  - body overflow:hidden + touchmove preventDefault Safari fallback 추가
  - exit cooldown 800ms로 re-lock 방지
  - WebGL active +-1 → active only
- **결과**: re-lock 문제 해결. 하지만 여전히 body lock과 smooth scroll 간 타이밍 문제.
- **상태**: ❌ 부분 해결

#### 14. Smooth transitions 시도
- **커밋**: `613d9cb` - "fix: smooth transitions for thesis entry and exit on mobile"
- **시도**: 진입/탈출 모두 `behavior: 'smooth'` + rAF 폴링으로 scroll 완료 대기 후 body lock 적용.
- **문제**: smooth scroll 중 iOS compositor momentum이 JS와 동기화 안 됨. `window.scrollY` 갱신 race condition. rAF 폴링이 completion을 놓침.
- **상태**: ❌ 실패

#### 15. 전체 아키텍처 교체 — touchmove preventDefault capture
- **커밋**: `aa3f932` - "fix: replace body lock with touchmove preventDefault capture"
- **근본 재설계**: body lock 폐기. fullpage.js 패턴으로 전환.
- **핵심 변경**:
  - `body overflow:hidden + position:fixed` → `document.addEventListener('touchmove', preventPageScroll, {passive:false})`
  - 이벤트 레벨에서 동기적 스크롤 차단 (compositor 결정 전)
  - `top sentinel` + `bottom sentinel` 두 개로 양방향 capture
  - Swiper는 자기 컨테이너 내부 터치만 처리
  - 진입 시 `scrollTo(sectionTop, 'auto')` + 즉시 touchmove capture
  - 탈출 시 touchmove capture 해제 + smooth scroll to adjacent section
- **결과**: 첫 순방향(Hero → Thesis) 플로우가 완벽하게 작동. 사용자 피드백: "야야야야야 좋다!!!!"
- **상태**: ✅ 대부분 해결. 역방향 플로우에 문제 남음.

#### 16. 역방향 재진입 시 cooldown 문제
- **커밋**: `a179588` - "fix: direction-aware cooldown for reliable reverse scroll re-entry"
- **증상**: 아래로 탈출(Thesis → Graph) 후 1000ms 동안 모든 sentinel 차단. 사용자가 빠르게 방향 바꿔 위로 스크롤해도 bottom sentinel이 blocked 상태라서 thesis 재진입 불가.
- **해결**: cooldown을 방향별로 분리.
  - `release('down')` → top sentinel만 blocked. bottom sentinel은 즉시 open.
  - `release('up')` → bottom sentinel만 blocked. top sentinel은 즉시 open.
  - state machine 단순화: `'idle' | 'captured'` (exiting 제거)
  - cooldown 1000ms → 500ms
- **상태**: ✅ 재진입 가능. 하지만 역방향 점프 느낌 발생.

#### 17. 역방향 재진입 시 "점프" 느낌
- **커밋**: `8b9312e` - "fix: delay reverse re-entry + use IO entry coords to smooth thesis jump"
- **증상**: ThesisGraph에서 위로 스크롤 시 Thesis로 "순간이동"하는 느낌.
- **첫 원인 추측 (실패)**: `behavior: 'auto'`가 유일한 원인이라고 단정 → 사용자 지적으로 수정. 레이아웃상 sectionTopAbs 이동 거리가 거의 0이어야 함 (thesis/graph 둘 다 h-dvh).
- **재분석 (사용자 지적 반영)**: 단일 원인이 아니라 여러 요인의 조합.
  - **주요 원인 1**: bottom sentinel이 thesis section 바로 아래(0px gap)에 있어서, ThesisGraph로 나가자마자 작은 위 스와이프에도 즉시 fire. "방금 나갔는데 다시 끌려들어간다"는 감각.
  - **주요 원인 2**: `capture` 내부에서 `section.getBoundingClientRect()` 호출 → iOS momentum overshoot으로 실제 위치와 차이. IO 콜백 실행 시점에는 이미 추가 이동된 상태.
  - **보조 원인**: 500ms cooldown이 smooth scroll 애니메이션과 경계.
- **해결**:
  1. **bottom sentinel에 rootMargin** `'0px 0px -50% 0px'` — ThesisGraph가 절반 이상 보일 때까지 fire 지연. 작은 위 스와이프로는 재진입 안 됨.
  2. **IO entry.boundingClientRect 사용** — `getBoundingClientRect()` 호출 대신 IO가 감지한 순간의 좌표 사용. momentum overshoot 오차 제거.
  3. **capture() 시그니처 변경** — `capture(direction, sectionTopAbs)` — 각 sentinel이 자기 좌표를 계산해 전달.
  4. **cooldown 500 → 700ms** — smooth scroll 애니메이션 settle 여유.
- **상태**: ⏳ 실기기 테스트 필요

---

## 현재 남아있는 / 검증 필요한 항목

### A. 역방향 점프 완화 효과 확인 (`8b9312e`)
- bottom sentinel rootMargin이 "너무 이른 재진입"을 실제로 막는지
- IO entry 좌표가 `getBoundingClientRect()` 오차를 실제로 제거하는지
- **상태**: ❓ 실기기 테스트 필요

### B. Swiper slideTo(TOTAL-1, 0) 즉시 전환
- capture 시 slideTo가 애니메이션 없이 즉시 마지막 슬라이드로 전환됨
- 시각적 "순간이동" 요소로 남아있을 가능성 (조사만 하고 수정 안 함)
- **상태**: ❓ 필요 시 fade 애니메이션 추가 검토

### C. Edge exit swipe threshold (50px)
- 현재 `EDGE_THRESHOLD = 50`
- 실기기에서 편한지, 너무 예민/둔감하지 않은지 검증 필요
- **상태**: ❓ 실기기 튜닝 필요

### D. 데스크톱 regression
- ThesisSectionDesktop이 기존과 동일하게 동작하는지
- normalizeScroll 제거 후 데스크톱 영향 없는지 (데스크톱은 `ScrollTrigger.isTouch !== 1`이므로 영향 없어야 함)
- **상태**: ❓ 확인 필요

---

## 핵심 아키텍처 결정 로그

### 왜 모바일을 분리했는가
30개 이상 웹 리소스 + Codex 세컨드 오피니언 + 2라운드 eng review 결론:
1. iOS Safari compositor-thread scroll과 JS scroll interception은 근본적으로 충돌
2. Pinned scroll-trap은 모바일에서 잘못된 interaction primitive
3. NNGroup: scroll hijacking은 모바일 UX 저해. 하지만 thesis는 스토리텔링 핵심.
4. 해결: 데스크톱 코드 무변경 + 모바일은 scroll capture + Swiper vertical fade로 동일 경험을 다른 메커니즘으로 구현.

### 왜 body lock이 아닌 touchmove capture인가
`22559bb` ~ `613d9cb`에서 body `overflow:hidden + position:fixed` 시도했으나:
- iOS compositor momentum이 비동기 lock 적용 전에 관통
- smooth scroll 중 `window.scrollY` JS-compositor 비동기화
- `position:fixed`로 레이아웃 shift
→ `aa3f932`에서 fullpage.js 패턴(`document.addEventListener('touchmove', preventDefault, {passive:false})`)으로 전환. 이벤트 레벨 동기 차단. DOM 조작 없음.

### 왜 sentinel 기반인가
IntersectionObserver `threshold: 0.6` 등 비율 기반은 "정확히 thesis top에서 lock"을 보장 못 함. sentinel(0px h-0 요소)을 thesis section 바로 위/아래 배치하면 IO가 fire하는 순간 기하학적으로 정확한 위치. rootMargin으로 fire 시점 조정 가능.

### Swiper releaseOnEdges iOS 버그
- #6691, #7923: iOS에서 작동 안 함 (2025년 3월 미해결)
- **해결**: releaseOnEdges 사용 안 하고 직접 touchStart/touchEnd delta로 edge exit 감지

---

## 커밋 히스토리 (thesis scroll 관련, 시간순)

### Phase 1: 데스크톱 GSAP (Phase 2 이전)
| 커밋 | 설명 | 결과 |
|------|------|------|
| `a3714a9` | wheelSpeed:-1 + callback swap | iOS touch 방향 수정 |
| `721296c` | always-on Observer + sectionActiveRef | 조건부 preventDefault |
| `447c95b` | touchstart preventDefault | 부분 개선 |
| `b68ba61` | 전역 normalizeScroll(true) | iOS momentum 해결, header 깨짐 |
| `20b362e` | normalizeScroll intro-lock defer | intro-lock 충돌 해결 |
| `f6dab2c` | anticipatePin:1, cooldown 400ms | overshoot 개선 |
| `ffff820` | Two-Observer 패턴 | jank 해결, freeze ❌ |
| `7152bef` | Two-Observer 개선 | 부분 개선 |
| `d3a0e7c` | Single Observer + disable/enable | freeze 해결, touch leak ❌ |
| `18e889e` | always-on Observer + exitingRef | touch leak 해결, pin 밖 차단 ❌ |
| `1dd6f11` | enable/disable lifecycle | pin 밖 차단 해결 |
| `d15407a` | scoped normalizeScroll + rAF 제거 | 페이지 스킵 ❌ |
| `27fb73d` | normalizeScroll 제거 + touchstart | iOS momentum 미해결 |
| `5624ab5` | module-level normalizeScroll(true) | iOS momentum ✅, jank |
| `b98377e` | momentum config (0.3초 cap) | 더 심각한 문제 ❌ |
| `5e78c2f` | momentum config revert | Phase 1 마지막 |

### Phase 2: 모바일 분리
| 커밋 | 설명 | 결과 |
|------|------|------|
| `018dd79` | Swiper horizontal + EffectFade | 수평 UX 부자연, hydration 버그 |
| `6a1a73f` | ThesisSection parent/desktop 분리 | hydration 충돌 해결 |
| `f57f6e8` | Swiper vertical + manual edge exit | 스크롤 관통 ❌ |
| `22559bb` | body scroll lock (threshold 0.6) | 관통 부분 해결, 타이밍 버그 |
| `9693a5a` | sentinel 기반 + Safari fallback | re-lock 해결, 여전히 lock 타이밍 |
| `613d9cb` | smooth transitions | smooth race condition ❌ |
| `aa3f932` | **touchmove preventDefault capture** | **순방향 완벽** ✅ |
| `a179588` | direction-aware cooldown | reverse re-entry 가능 |
| `8b9312e` | **rootMargin + IO entry coords** | 역방향 점프 완화 ⏳ |

---

## 리서치 소스 요약 (60+개)

### iOS Safari 스크롤 메커니즘
- iOS momentum scroll은 compositor thread (UIScrollView)에서 실행. JS 개입 불가.
- `touchstart` preventDefault로 momentum 시작 차단 가능. 이미 시작된 momentum은 불가.
- iOS 15+에서 touchmove preventDefault 동작 불안정. `touch-action: none` CSS 권장.
- `overscroll-behavior: none`을 iOS가 무시 (WebKit #176454).
- `overflow: hidden`이 body에서 iOS 16.3+부터 정상. 이전 버전은 깨짐.
- **중요**: `touchmove.preventDefault({passive:false})`는 이벤트 레벨 동기 차단. iOS에서 신뢰 가능.

### GSAP + iOS
- normalizeScroll은 실험적. 매 2번째 touchmove skip. 모든 scroll JS thread 경유.
- ScrollTrigger pin이 iOS에서 jitter 빈번. position:fixed + compositor 충돌.
- 모바일 pin 사용 시 가장 많이 추천되는 패턴: 데스크톱/모바일 완전 분리.

### Swiper.js
- `releaseOnEdges`: iOS 버그 (#6691, #7923, 2025년 3월 미해결)
- `touchReleaseOnEdges`: v9 이후 동작 안 함 (#6381)
- vertical + fade 지원되지만 페이지 스크롤 공존 어려움.
- **결론**: releaseOnEdges 의존 금지. 직접 touch delta 계산.

### fullpage.js 패턴 (핵심 참고)
- `touchstart` + `touchmove` 이벤트에서 직접 `preventDefault()` 호출
- `overflow:hidden`/`position:fixed` 사용 안 함
- 이벤트 레벨 동기 차단이 가장 신뢰 가능
- `setAllowScrolling(false)` API로 scroll 상태 관리

### UX 리서치
- NNGroup: scroll hijacking은 control/freedom/discoverability 저해
- 하지만 "한 페이지씩 넘기는" 스토리텔링 패턴은 효과적 (scrolljack과 구분)
- "adaptive complexity" (데스크톱/모바일 다른 구현)가 업계 표준

### CSS scroll-snap
- WebKit #243582: 빠른 flick 시 끝까지 날아감 (미해결)
- 모바일 fullpage에 부적합

### IntersectionObserver
- `entry.boundingClientRect`: IO가 감지한 순간의 좌표 (snapshot)
- 콜백 실행 시점과 감지 시점 사이 iOS momentum 오차 가능
- `rootMargin`으로 fire 시점 조정 가능 ('0px 0px -50% 0px' = viewport bottom 50% 위로)

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/components/home/ThesisSection.tsx` | Parent 디바이스 감지 + ThesisSectionDesktop (GSAP pin) |
| `src/components/home/ThesisSectionMobile.tsx` | 모바일: Swiper vertical + sentinel + touchmove capture |
| `src/components/home/thesisData.tsx` | 공유 데이터: THESIS_STATES, InlineAscii, MobileAscii |
| `src/components/home/ThesisGraph.tsx` | id="thesis-graph" (exit scrollIntoView target) |
| `src/app/globals.css` | intro-lock, .pin-spacer 배경색 |
| `src/hooks/useScrollReveal.ts` | normalizeScroll 관련 pollRef fallback |

---

## 실패했던 접근법 목록 (같은 실수 반복 방지)

1. **body `overflow: hidden` + `position: fixed`** (`22559bb`, `9693a5a`, `613d9cb`)
   - iOS compositor momentum이 lock 적용 전에 관통
   - smooth scroll 중 `window.scrollY` JS-compositor 비동기
   - → touchmove capture로 전환 (`aa3f932`)

2. **`behavior: 'smooth'` 진입 + rAF 폴링 lock** (`613d9cb`)
   - smooth scroll 중 iOS momentum race
   - rAF 폴링이 completion 감지 실패
   - → instant snap + 즉시 capture (`aa3f932`)

3. **IntersectionObserver threshold 0.6** (`22559bb`)
   - 부정확한 트리거 위치
   - 탈출 후 40% 남은 섹션으로 re-trigger
   - → sentinel 기반 (`9693a5a`)

4. **단일 cooldown 전체 sentinel 차단** (`aa3f932`)
   - 역방향 re-entry 불가능
   - → direction-aware cooldown (`a179588`)

5. **capture 내부에서 `getBoundingClientRect()`** (`aa3f932` ~ `a179588`)
   - iOS momentum overshoot으로 좌표 오차
   - → IO entry.boundingClientRect 사용 (`8b9312e`)

6. **bottom sentinel이 section 바로 아래 (0px gap, no rootMargin)** (`aa3f932` ~ `a179588`)
   - 너무 이른 reverse re-entry (작은 위 스와이프에도 fire)
   - → rootMargin `'0px 0px -50% 0px'` (`8b9312e`)

7. **Swiper `releaseOnEdges`** (시도 전 리서치로 제외)
   - iOS Safari 버그 (#6691, #7923, 미해결)
   - → 직접 touchStart/touchEnd delta 감지

8. **GSAP `normalizeScroll(true)`** (Phase 1에서 반복 시도)
   - iOS momentum 해결하지만 JS thread 부하로 WebGL jank
   - → 모바일에서 완전 제거, 데스크톱만 유지

---

## 다음 단계

1. **iPhone 실기기에서 `8b9312e` 테스트**
   - [ ] Hero → Thesis 순방향 매끄러운지
   - [ ] Thesis 7페이지 수직 스와이프 동작
   - [ ] 마지막 슬라이드 → ThesisGraph smooth exit
   - [ ] ThesisGraph → 위로 스크롤 → Thesis 재진입 "점프감" 제거 확인
   - [ ] Thesis 첫 슬라이드 → Hero smooth exit
   - [ ] 데스크톱 regression 없음 확인

2. **실패 시 조사 대상**
   - bottom sentinel `rootMargin`을 `-70%`로 더 지연?
   - Swiper `slideTo(idx, 0)` 즉시 전환 대신 짧은 fade?
   - capture 시 scroll velocity 측정해서 overshoot 예측 보정?
