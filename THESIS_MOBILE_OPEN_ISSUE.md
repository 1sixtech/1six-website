# OPEN ISSUE — /about → THESIS 클릭 시 Hero로 떨어짐

**Status**: UNRESOLVED — 근본 원인 미확정
**Date logged**: 2026-04-11
**Checkpoint commit**: `2a1262a` (giwook-Han/fix-mobile-problem)
**Priority**: P1 — 실기기에서 재현되는 사용자 경로 버그

---

## 증상

`/about` 페이지에서:
1. Hamburger 메뉴 열기
2. THESIS 링크 클릭
3. **결과**: `/`로 이동은 되지만 Hero 섹션에 머묾. Thesis 섹션으로 스크롤도, 캡처도 되지 않음.

`/about`의 어느 스크롤 위치(최상단/중간/최하단)에서 시작하든 결과 동일 — **무조건 Hero로 떨어짐**.

## 검증된 사실 (사용자 iPhone 실기기)

- `/` 페이지에서 hamburger → THESIS 클릭 시에는 정상 (슬라이드 0으로 캡처)
- `/about` → THESIS만 실패
- 테스트 대상 commit: `2a1262a` (Finding 2 + 4 수정 후, Finding 1 수정 전)
- `2a1262a`에 Header.tsx를 수정한 첫 번째 시도도 **증상 동일** — 실패

## 실패한 첫 번째 시도 (`Finding 1 fix v1`)

### 가설 (틀렸음)

Header.tsx의 cross-route 분기에서 `manualUnlockRef`를 설정하지 않아서 scroll-lock effect가 `unlockScroll(true)` 호출 → rAF scrollTo(0, savedY) race가 ScrollToTop의 `scrollTo(0, 0)` + hash poll을 덮어쓴다.

### 수정 내용

```typescript
} else {
  // Cross-route hash nav
  manualUnlockRef.current = true;
  unlockScroll(false);
  setMenuOpen(false);
  router.push(`/#${hash}`, { scroll: false });
}
```

### 결과

iPhone 실기기에서 **증상 변화 없음**. `/about` → THESIS → Hero. 수정은 **revert됨**.

### 이 가설이 왜 틀렸는지

`savedY === 0` (사용자가 `/about` 최상단에서 메뉴 열었을 때) 한정으로 Hero에 머무는 건 설명 가능했지만, **중간/최하단에서 시작해도 Hero에 떨어진다**는 사용자 피드백이 hypothesis를 반박함. race condition만으로는 설명되지 않는 다른 상위 메커니즘이 있음.

## 남아있는 후보 가설들 (검증 필요)

### 가설 A — `ScrollToTop`의 `scrollTo(0, 0)`이 최종 scroll 상태로 남음

`ScrollToTop.tsx`:
```typescript
const hash = window.location.hash.replace('#', '');
if (hash) {
  history.replaceState(null, '', window.location.pathname);
}
window.scrollTo(0, 0);  // ← 이게 Hero로 보냄
if (hash) {
  // poll 시작, ready되면 scrollToHashTarget 호출
}
```

- Poll이 `document.getElementById('thesis')`를 찾고 ready를 판정한 뒤 `scrollToHashTarget('thesis')` 호출하는 타이밍이 언제인가?
- `scrollToHashTarget` 내부는 `ScrollTrigger.refresh()` 후 `rAF(() => scrollTo({top, behavior: 'auto'}))`.
- **의심점**: `scrollToHashTarget`의 `target.getBoundingClientRect().top + window.scrollY`가 올바른가?
  - `ThesisSection` parent가 `isMobile === null`인 초기 상태에 렌더하는 placeholder는 `<section id="thesis" className="h-dvh w-full ...">` — viewport 높이 만큼 차지.
  - Poll이 placeholder를 target으로 잡아서 `scrollToHashTarget`을 호출할 때 placeholder의 `top`은 Hero 바로 아래 = 812px 정도.
  - `rAF(scrollTo(812))` 실행되면 사용자는 Thesis 위치로 이동해야 함.
  - 그런데 **Hero에 머물고 있음**. 즉 이 scrollTo가 실행 안 됐거나, 실행 후 다시 0으로 돌아간 것.

### 가설 B — Polling이 시작되지 않거나 target을 찾지 못함

`ScrollToTop`의 `setInterval(poll, 50)`이 시작되지 않거나, `document.getElementById('thesis')`가 null이어서 polling이 timeout까지 매 50ms마다 실패. 타임아웃은 5000ms.

- 초기 `ThesisSection` placeholder는 SSR에서도 렌더되므로 element는 있어야 정상.
- 하지만 `/about` → `/` transition 중 특정 순간에 element가 일시적으로 없을 수 있음.
- 또는 poll 시작 전에 `ScrollToTop` component가 unmount되면서 `clearInterval`이 실행될 수 있음.

### 가설 C — Next.js의 auto scroll behavior가 `{ scroll: false }`를 무시하고 scroll을 0으로 보냄

Next.js 16 App Router에서 `router.push(url, { scroll: false })` 동작에 known bug가 있는지 확인 필요. Issue #84423 ("router.push with { scroll: false } still scrolls to top when using loading.tsx in production") 등 관련 버그 있음.

- `HomePage`에 `loading.tsx`는 없지만 다른 내부 경로가 관여할 수 있음.
- router.push가 URL을 먼저 업데이트하고 content replacement 시 browser 자체의 hash scroll을 트리거할 수 있음 — 하지만 hash는 ScrollToTop이 strip하므로 이미 사라진 상태.

### 가설 D — `ThesisSection` placeholder의 height가 0이거나 잘못된 위치

`ThesisSection` `isMobile === null`일 때 렌더되는 placeholder:
```tsx
<section id="thesis" className="relative h-dvh w-full overflow-hidden z-10" />
```

- `h-dvh`는 viewport height를 참조. 정상이면 812px.
- 만약 이 placeholder가 fragment 또는 빈 state로 렌더되는 순간이 있으면, `getBoundingClientRect().top`이 0이 되고 `scrollTo(0, 0)`과 동일한 효과.
- 확인 필요: `/about` → `/` transition 중에 `isMobile === null` 상태가 실제로 경유하는지. 이전 mount의 `isMobile=true` state가 보존될 수도 있음. React state는 component lifecycle과 연결되므로 unmount/remount 시 초기화.

### 가설 E — `prevScrollYRef` 또는 다른 onScroll 가드가 Hero로 덮어씀

`ThesisSectionMobile`의 onScroll이 mount 직후 fire되면서 초기 scrollY=0을 prevScrollYRef에 저장. 이후 어떤 경로로 capture 로직이 뒤틀릴 수 있음 — 하지만 이 경우도 "Hero로 감"이 아니라 "Thesis 위치에 idle 상태로 머묾"이 증상이어야 함.

### 가설 F — `/about` mount된 ScrollTrigger가 `/`로 오면서 계산에 영향

`/about`에는 ScrollRevealWrapper 기반의 ScrollTriggers가 여럿 있음. `router.push`로 `/`로 이동할 때 old ScrollTriggers가 완전히 정리되지 않으면 `scrollToHashTarget` 내부의 `ScrollTrigger.refresh()`가 stale trigger들을 refresh하려다가 scrollY를 다른 값으로 세팅할 수 있음.

- `ScrollTrigger.refresh()`는 trigger의 start/end 위치를 재계산하는 것이지 scroll 자체를 건드리지는 않아야 함. 하지만 `normalizeScroll` 또는 `scrollerProxy`가 관여한다면 얘기가 다름.

## 다음 조사 단계 (권장)

1. **iPhone + Safari Web Inspector 연결**하여 `/about` → THESIS 경로에서 `console.log`로 각 시점의 scrollY + 어떤 handler가 scroll을 건드렸는지 trace:
   - `Header.handleNavClick` 진입
   - `unlockScroll` 진입 & `rAF` 내부 scrollTo
   - `router.push` 직후
   - `ScrollToTop` useEffect 진입
   - `ScrollToTop`의 `scrollTo(0, 0)`
   - `ScrollToTop`의 poll 내부 (ready 여부, target 존재 여부, tick count)
   - `scrollToHashTarget` 진입 & 내부 rAF scrollTo
   - `ThesisSectionMobile` mount 시점 & hash listener 등록 시점
   - `ThesisSection` placeholder 존재 여부 (`isMobile === null` 경유 확인)

2. **Desktop Chrome에서 동일 경로 재현 시도**: `@media (max-width: 767px)`로 모바일 emulation한 뒤 `/about` → hamburger → THESIS 클릭 → 어떤 경로가 실행되는지 DevTools breakpoint로 직접 확인.

3. **중간 wait 추가해서 경로 격리**: `router.push` 후 `setTimeout(100)` 걸어서 그 사이에 무슨 일이 일어나는지 관찰. 경로가 달라지면 타이밍 issue 확정.

4. **가설 A 검증**: `ScrollToTop`에서 poll이 실제로 target을 찾는지, `scrollToHashTarget`가 호출되는지 log로 확인.

5. **가설 D 검증**: `ThesisSection` parent의 `isMobile` state가 `/` mount 시 실제로 `null`로 시작하는지 React DevTools로 확인.

## 건드리면 안 되는 것

- 지금까지 iPhone에서 확인된 통과 경로들 (Finding 2, Finding 4, Finding 6). 회귀 방지.
- `/` same-page 분기 (동작 중). 건드리면 Hero → THESIS 정상 경로가 깨질 수 있음.
- `ScrollToTop`의 hash strip 로직 — GSAP pin race 방지의 핵심이라 함부로 건드리면 desktop pin 재계산 race 재발 위험.

## 임시 대응

- `/about` → hamburger → THESIS 경로는 **현재 미작동**으로 기록.
- 사용자는 로고 클릭(`/`로 이동 후 Hero에서 스크롤) 또는 main → HOME 경유를 우회 경로로 사용 가능.
- 근본 원인 확정 전까지 수정 금지 (잘못된 가설로 random fix 적용하면 회귀 리스크).

## 관련 파일

- `src/components/layout/Header.tsx` — `handleNavClick` cross-route else 분기 (line 73-76)
- `src/components/ui/ScrollToTop.tsx` — mount effect의 hash poll 로직
- `src/lib/hashScroll.ts` — `scrollToHashTarget`, `isThesisPinReady`, `shouldWaitForThesisPin`
- `src/components/home/ThesisSection.tsx` — parent placeholder 렌더 로직 (isMobile === null 경유)
- `src/components/home/ThesisSectionMobile.tsx` — hash event listener 등록 (line 358-389 기준)
