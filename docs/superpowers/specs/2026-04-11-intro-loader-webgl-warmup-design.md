---
status: Draft (awaiting approval)
date: 2026-04-11
branch: giwook-han/improve-performance
author: Giwook Han
owner: Giwook Han
---

# Intro Loader + WebGL Pre-Warming Design

## 0. Executive Summary (한국어)

홈페이지에서 각 섹션으로 스크롤할 때 ASCII 모자이크가 "pulse → 등장" 순으로 깜빡이는 UX 문제를 해결한다. 해결책은 **브랜드 인트로 로더를 페이지 진입 시 재생하면서 그 시간 동안 모든 WebGL 컨텍스트·비디오·셰이더를 실제로 워밍업**하는 것이다.

- **Q1 결정**: 인트로 최소 지속 시간 1.4s (타이트)
- **Q2 결정**: Phase 1 (인트로 + 프리워밍) + Phase 2 (컨텍스트 예산 및 동시성 정리) 동시 진행
- **브랜드 시퀀스**: 검은 로고 중앙 → accent 컬러가 bottom-to-top으로 채워짐 → 정중앙에서 원형 reveal → 히어로 등장 → "16%" 스크램블 시작

---

## 1. Problem Statement

### 1.1 관찰된 증상

모바일 (특히) 및 데스크톱에서 홈페이지를 처음 스크롤할 때 각 섹션의 ASCII 모자이크가 다음 순서로 나타난다:

1. 플레이스홀더 펄스 (회색 배경 `animate-pulse`)
2. 섹션이 `IntersectionObserver` 기준 200px 안으로 진입
3. 100~500ms 대기 후 ASCII 캔버스 등장 (포지션/밝기 살짝 튐)

이 "등장" 순간이 **사용자가 깜빡임으로 인식**하는 현상이다. 브랜드 인식과 프리미엄감을 해친다.

### 1.2 영향 범위

- `/` (홈) 전체 ASCII 섹션: Hero, Thesis 1-6, ThesisGraph, ProductMap, Nevada TV, Nevada Trade
- `/about` 페이지는 섹션 수가 적고 레이아웃이 단순해 체감이 약함 → 본 스펙은 **홈페이지만** 대상으로 한다

---

## 2. Root Cause Analysis

### 2.1 현재 프리로드가 해결하지 못하는 것

`src/components/providers/AssetPrefetcher.tsx`는 `<link rel="prefetch">`를 사용한다. 이 방식의 효과는 **리소스를 HTTP 디스크 캐시에 올리는 것까지만**이다. 실제 렌더 시 필요한 네 가지 작업은 여전히 섹션 진입 시점에 일어난다:

1. **동적 import** (`import('@/lib/ascmosaic')`): 첫 섹션에서만 ~50-200ms (이후 캐시됨)
2. **WebGLRenderer 생성**: ~30ms
3. **Video texture 로드** (`createVideoTexture` → `video.canplay` 대기): 100-500ms
4. **AsciiMosaicFilter 활성화** (`enableAsciiMosaicFilter` → 셰이더 컴파일 + atlas 텍스처 로드): 50-300ms (모바일에서 더 느림)

총 200-700ms의 지연이 섹션마다 반복된다.

> 참고: `<link rel="preload" as="video">`는 Chrome/Safari 모두 미지원이고, iOS Safari는 `preload="auto"`를 무시하고 `metadata`만 인정한다. 따라서 HTTP 레벨 프리로드만으로는 비디오 디코드를 앞당길 수 없다.

### 2.2 현재 컨텍스트 예산 상황

`src/components/ascii/AsciiCanvas.tsx:86`에 전역 카운터가 있다:

```ts
let activeContextCount = 0;
const MAX_ACTIVE_CONTEXTS = 10;
```

홈페이지가 필요로 하는 동시 컨텍스트:

| 섹션 | 모바일 | 데스크톱 |
|---|---|---|
| Hero | 1 | 1 |
| Thesis 1~6 (모바일: Swiper가 6개 동시 마운트 / 데스크톱: `isNearby` 게이트로 3개) | **6** | 3 |
| ThesisGraph | 1 | 1 |
| ProductMap (WorldMap) | 1 | 1 |
| Nevada TV | 1 | 1 |
| Nevada Trade | 1 | 1 |
| **합계 (동시 최대)** | **11** ⚠️ | 8 |

모바일 11 > 10 한계 → 한 개가 `initMosaic()` 진입 시점에 조용히 스킵된다 (`activeContextCount >= MAX_ACTIVE_CONTEXTS` 가드). 현재도 이미 잠재적 불안정 상태다. 이 사실은 `src/components/home/ThesisSectionMobile.tsx:424-432` 주석에서 이미 인정되어 있다.

### 2.3 Swiper crossfade와 WebGL 관계 (모바일 핵심)

`ThesisSectionMobile.tsx`는 Swiper `effect="fade"`로 6개 슬라이드를 렌더한다. 현재 `isActive` 게이트는 **시각적 opacity만** 제어하고, AsciiCanvas 컴포넌트 자체는 6개 슬라이드 모두에 mount된다 (주석: "visual only"). AsciiCanvas의 `IntersectionObserver`는 지오메트리 기반이라 opacity를 무시하므로 **6개 컨텍스트가 동시에 활성화**된다.

### 2.4 왜 `IntersectionObserver` lazy init은 깜빡임의 직접 원인인가

```ts
// AsciiCanvas.tsx:158-166
const observer = new IntersectionObserver(
  ([entry]) => { setIsVisible(entry.isIntersecting); },
  { rootMargin: '200px' } // Pre-load slightly before visible
);
```

200px rootMargin은 1~2 프레임(@60fps) 어치의 스크롤 여유밖에 못 준다. 모바일 iOS 관성 스크롤은 이보다 빠르게 진입하므로 `initMosaic`의 ~200-700ms 지연은 거의 항상 사용자 눈에 보인다.

또한 `enqueueInit`는 직렬 큐이므로 연속된 섹션은 순차 초기화된다 → 두 번째 섹션은 첫 번째가 끝나야 시작 → 누적 지연.

---

## 3. Goals / Non-Goals

### 3.1 Goals

- **G1**: 홈페이지 초기 진입 시 모든 ASCII 섹션의 WebGL 리소스(컨텍스트·텍스처·셰이더·비디오 canplay)가 **사용자가 도달하기 전에** 준비 완료되어 있다.
- **G2**: 프리로드 기간 동안 사용자는 브랜드 인트로 애니메이션을 본다 (로고 fill + circular reveal → 스크램블).
- **G3**: 인트로 최소 지속 시간은 1.4s, 최대 2.5s (하드 캡 초과 시 강제 reveal).
- **G4**: 모바일/데스크톱 모두 동일 경험 (인트로는 반응형으로 작동).
- **G5**: `prefers-reduced-motion: reduce` 사용자는 인트로를 완전히 스킵한다.
- **G6**: WebGL 컨텍스트 예산 초과(11 > 10) 이슈를 해소한다.
- **G7**: 기존 히어로 스크램블·thesis 핀/스와이프·theme toggle·accessibility 동작이 **동일하게 유지**된다.

### 3.2 Non-Goals

- **NG1**: 다른 페이지(`/about`) 리팩터. About은 섹션 수가 적고 체감 이슈가 없다.
- **NG2**: AscMosaic 라이브러리의 근본 API 재설계. 추가만 하고 기존 경로는 그대로.
- **NG3**: 비디오 파일 최적화·코덱 변경·CDN 이관. 현재 리소스 총 ~1.5MB 수준으로 네트워크 병목 아님.
- **NG4**: 서버사이드 렌더링 경로의 근본 변경. 인트로는 순수 SVG+CSS로 SSR-safe하게 구현한다.
- **NG5**: React Three Fiber 도입·scissor 기반 단일 캔버스 전면 재설계. 과도한 범위.
- **NG6**: 스크램블 자체 로직/타이밍 변경. 인트로와 스크램블은 orchestration으로만 연결한다.
- **NG7**: 다른 섹션(`InsightSection`, `TeamProfiles`, `CareersSection`)의 변경.

---

## 4. Impact Analysis

### 4.1 파일 영향 매트릭스

| 파일 | 변경 유형 | 위험도 | 변경 요약 |
|---|---|---|---|
| `src/app/layout.tsx` | Modify | 낮음 | `<IntroOverlay>` + `<WebGLWarmup>` 마운트 위치 추가. 홈페이지 전용 분기. 기존 `intro-lock` 스크립트 확장. |
| `src/app/page.tsx` | Modify | 낮음 | `<WebGLWarmup>` 엄격한 마운트 순서 (HeroSection 앞) |
| `src/app/globals.css` | Modify | 낮음 | 신규 CSS 변수 2개 + 인트로 키프레임·clip-path 초기 상태 규칙 추가. 기존 규칙 건드리지 않음. |
| `src/components/home/HeroSection.tsx` | Modify | 중간 | 스크램블 시작 트리거를 `useEffect` 마운트 → `intro:revealed` 이벤트로 변경. `onReady` 콜백은 유지. 기존 unlockPage 안전망 유지. |
| `src/components/ascii/AsciiCanvas.tsx` | Modify | 중간 | ① `MAX_ACTIVE_CONTEXTS` 10→14. ② `preloadKey` prop 추가 (videoPool 조회 키). ③ videoPool에서 video element 재사용 경로. ④ 기존 `eager`/`IntersectionObserver` 경로는 그대로. |
| `src/components/ascii/AsciiHero.tsx` | Modify | 낮음 | `preloadKey="hero"` 전달 |
| `src/components/ascii/AsciiThesis.tsx` | Modify | 낮음 | `preloadKey={`thesis-${stateNumber}`}` 전달 |
| `src/components/ascii/AsciiGraph.tsx` | Modify | 낮음 | `preloadKey="graph"` 전달 |
| `src/components/ascii/AsciiMap.tsx` | Modify | 낮음 | `preloadKey="map"` 전달 |
| `src/components/ascii/AsciiProduct.tsx` | Modify | 낮음 | `preloadKey={`product-${product}`}` 전달 |
| `src/components/home/ThesisSectionMobile.tsx` | Modify | **높음** | `isActive` 게이트 → `isNearby` 게이트 (Math.abs(i-active) ≤ 1). 원거리 슬라이드의 `MobileAscii` 자체를 unmount. 주석 업데이트. |
| `src/components/providers/AssetPrefetcher.tsx` | Delete + Replace | 낮음 | 삭제. 기능은 `videoPool` + `IntroOrchestrator`로 이관. |
| `src/lib/ascmosaic/texturedMesh.ts` | Modify | 중간 | `createVideoTexture`가 videoPool을 먼저 조회하도록. 기존 경로는 폴백으로 유지. |
| `src/components/intro/IntroOverlay.tsx` | **New** | 낮음 | 순수 SVG+CSS 인트로 렌더 컴포넌트 |
| `src/components/intro/LogoFillSvg.tsx` | **New** | 낮음 | `LogoHeader` SVG + mask rect 애니메이션 (y: 100%→0%) |
| `src/components/intro/IntroOrchestrator.tsx` | **New** | 중간 | 상태 기계: booting → warming → reveal-pending → revealing → done. GSAP 타임라인. 홈페이지 AsciiCanvas들의 onReady를 이벤트로 집계. |
| `src/lib/videoPool.ts` | **New** | 중간 | Map<url, HTMLVideoElement> 전역 풀. `warmup(url)`, `get(url)` API. `#t=0.001` 프래그먼트 + `play` 워밍업. |
| `src/lib/introState.ts` | **New** | 낮음 | CustomEvent 기반 이벤트 버스. 타입 선언만. |
| `src/hooks/useIntroState.ts` | **New** | 낮음 | React 훅: `useIntroRevealed()`, `useIntroDone()`. |
| `docs/superpowers/specs/2026-04-11-intro-loader-webgl-warmup-design.md` | **New** | 낮음 | 본 스펙 |

**변경 요약**:
- **신규 파일**: 6개 (intro 컴포넌트 3, lib 2, hook 1)
- **수정 파일**: 12개
- **삭제 파일**: 1개 (AssetPrefetcher.tsx)

### 4.1.1 핵심 설계 결정 — WebGLWarmup 별도 컴포넌트 없음

초기에 "화면 밖 숨겨진 eager AsciiCanvas pool"을 별도 `WebGLWarmup` provider로 만들려 했으나, 검토 결과 불필요한 복잡도였다. 대신:

1. **홈페이지의 실제 AsciiCanvas 인스턴스에 `eager={true}` 전파** — IO 대기 우회, 마운트 즉시 초기화
2. **`main-content`에 `clip-path: circle(0%)` 적용** — 전체 페이지가 렌더·초기화되지만 인트로 중엔 시각적으로 가려짐
3. **IntroOrchestrator가 각 onReady를 수집 + minTimer와 AND 결합** → reveal 트리거

장점:
- 동일 인스턴스가 warmup → 런타임으로 **끊김 없이 연결** (dispose/remount 불필요)
- 추가 WebGL 컨텍스트 생성 없음 (워밍업용 임시 컨텍스트 X)
- 컴포넌트 하나 줄어듬 → 유지보수성 증가

### 4.2 실행 흐름 변화

#### Before

```
SSR layout → hydrate → HeroSection mount → AsciiHero → AsciiCanvas IO → wait until visible → initMosaic → 500ms delay → scramble starts at ~200ms after mount
→ user scrolls → ThesisSection IO → initMosaic * 6 (serial queue, 6 × 300ms = 1.8s total) → flicker on each
```

#### After

```
SSR layout (html.intro-lock, data-intro-active=true)
  → IntroOverlay SSR + main-content(clip-path: circle(0%)) 렌더
  → React hydrates
  → parallel:
    A. IntroOverlay GSAP: 로고 fill (1.2s)
    B. videoPool.warmupAll(11 videos) → canplay events
    C. 홈페이지 AsciiCanvas × 8 (eager=true) → 각자 initMosaic → onReady 이벤트 발사
    D. minDisplayTimer 1.4s
→ IntroOrchestrator: Promise.all([minTimer, allReady]) 또는 hardCap(2.5s) 대기
→ dispatch 'intro:revealed' → main-content clip-path 0 → 150% 애니메이션 (0.4s)
→ dispatch 'intro:done' → IntroOverlay unmount (300ms 후)
→ HeroSection useEffect: 'intro:revealed' 받으면 스크램블 시작
→ user scrolls → 모든 캔버스 이미 running → NO FLICKER
```

**활성 컨텍스트 수 (Phase 2 isNearby 적용 후)**:
- 모바일 초기 마운트: Hero(1) + Thesis nearby(2: slide 0 & 1) + Graph(1) + Map(1) + Products(2) = **7**
- 데스크톱 초기: Hero(1) + Thesis nearby(1: index 0 only) + Graph(1) + Map(1) + Products(2) = **6**
- 예산 14 → 여유 7 이상 ✓

### 4.3 성능 영향 (측정 전 추정)

| 메트릭 | Before | After | 주석 |
|---|---|---|---|
| FCP (First Contentful Paint) | ~400ms | ~400ms | 인트로 자체가 즉시 렌더됨 (SSR) |
| LCP (Largest Contentful Paint) | ~1.2s | ~1.8s | 히어로 캔버스가 reveal 후 노출됨 |
| Interactive (intro 해제) | ~1.8s | ~3.3s | 인트로 1.4s + reveal 0.4s + 스크램블 1.5s |
| Flicker on scroll (사용자 인지 이슈) | **있음** | **없음** | 핵심 개선 목표 |
| Memory (GPU) | 8 컨텍스트 (모바일 평균) | 8 컨텍스트 (안정화) | Phase 2로 상한 고정 |
| Memory (video elements) | 슬라이드별 재생성 | 11개 풀 (지속) | 메모리 약간 증가하지만 재할당 없음 |

LCP 리그레션은 **브랜드 인트로라는 의도된 트레이드오프**이다. 사용자가 빈 화면을 보지 않고 브랜드 애니메이션을 보므로 체감 품질은 향상된다.

---

## 5. Phase 1 Design — Intro Loader + Real Pre-warming

### 5.1 State Machine

```
┌─────────┐  mount   ┌─────────┐  fillDone ∧ minTime ∧ webglReady  ┌───────────┐
│ booting │─────────▶│ warming │──────────────────────────────────▶│ revealing │
└─────────┘          └─────────┘                                   └─────┬─────┘
                          │                                              │
                          │ hardCap (2.5s)                                │
                          └──────────────────────────────────────────────▶│
                                                                          ▼
                                                                    ┌─────────┐
                                                                    │  done   │
                                                                    └─────────┘
```

| State | 렌더링 상태 | 인터랙션 |
|---|---|---|
| `booting` | 검은 배경 + 로고 실루엣 | 막힘 (intro-lock) |
| `warming` | 로고 fill 진행 + hidden WebGL 초기화 | 막힘 |
| `revealing` | 원형 clip-path 확장 중 + 로고 fade out | 막힘 |
| `done` | 인트로 unmount + 스크램블 진행 | intro-lock 해제, 스크램블이 자체 로직으로 막음 |

### 5.2 Timeline (1.4s min 기준)

```
t = 0.00  IntroOverlay 마운트 (SSR html이므로 즉시 가시)
t = 0.00  videoPool.warmupAll() 시작 (병렬)
t = 0.00  WebGLWarmup 마운트 → 11 AsciiCanvas eager=true 초기화 시작
t = 0.10  로고 fill 애니메이션 시작 (120ms 지연으로 hydration 안정화)
t = 1.30  로고 fill 완료
t = 1.40  minDisplayTimer 완료
t = ???   webglReady (평균 0.8-1.6s, 최악 2.5s)

[분기 A: webglReady ≤ 1.4s]
t = 1.40  reveal 시작 (원형 clip-path 0 → 150%, 0.4s)
t = 1.50  스크램블 첫 글자 등장 (기존 300ms delay 유지)
t = 1.80  reveal 완료 + intro-lock 제거
t = 3.30  스크램블 완료

[분기 B: webglReady > 1.4s (느린 모바일)]
t = 1.40~2.50  로고에 subtle pulse 대기
t = min(webglReady, 2.5)  reveal 시작
t = 이후 동일
```

### 5.3 IntroOverlay (SVG + CSS, SSR-safe)

```tsx
// src/components/intro/IntroOverlay.tsx
'use client';  // hook 사용. 단, DOM은 SSR에서 렌더됨.

// DOM 구조:
// <div className="intro-overlay" data-state="booting|warming|revealing|done">
//   <div className="intro-logo-wrap">
//     <LogoFillSvg fillProgress={...} />
//   </div>
// </div>
```

- **포지셔닝**: `position: fixed; inset: 0; z-index: 100` (mobile menu z:60보다 높음)
- **배경**: `var(--color-card)` (테마 반영)
- **마운트 전략**: layout.tsx에서 `pathname === '/'`일 때만 렌더. SSR 시 인트로 스크립트가 `data-intro-active=true`를 html에 세팅.
- **unmount**: `done` 상태 진입 후 300ms 지연하고 unmount (clip-path 완료 + opacity fadeout 후)

### 5.4 LogoFillSvg (SVG mask 애니메이션)

기존 `LogoHeader`의 SVG path를 활용:

```tsx
// src/components/intro/LogoFillSvg.tsx
<svg viewBox="0 0 73 21.03" className="...">
  <defs>
    <mask id="logo-fill-mask">
      <rect 
        ref={fillRectRef}
        x="0" 
        y="21.03"     // 하단에서 시작
        width="73" 
        height="21.03" 
        fill="white" 
      />
    </mask>
  </defs>
  
  {/* 배경: 검은 로고 (실루엣) */}
  <g fill="var(--color-text)" opacity="0.2">
    {/* LogoHeader의 6개 path 재사용 */}
  </g>
  
  {/* 전경: accent 컬러 로고, mask로 클리핑 */}
  <g fill="var(--color-accent)" mask="url(#logo-fill-mask)">
    {/* 동일한 6개 path */}
  </g>
</svg>
```

GSAP 애니메이션:

```ts
gsap.to(fillRectRef.current, {
  attr: { y: 0 },  // 하단 → 상단으로 rect 이동 (채워지는 효과)
  duration: 1.2,
  ease: 'power2.inOut',
  delay: 0.1,
});
```

**Why SVG mask not clip-path**: SVG mask는 DOM 속성(`y`)을 GSAP의 `attr` 플러그인으로 부드럽게 애니메이션할 수 있고, Safari/Chromium 모두 컴포지터에서 처리한다. CSS `clip-path: inset()`은 SVG 내부 경로를 제어할 수 없다.

### 5.5 Circular Reveal

```ts
// body 아래의 main-content를 clip-path로 감싸기
// 초기: circle(0% at center)
// 최종: circle(150% at center)

gsap.fromTo(
  mainContentRef.current,
  {
    clipPath: 'circle(0% at 50% 50%)',
    WebkitClipPath: 'circle(0% at 50% 50%)',
  },
  {
    clipPath: 'circle(150% at 50% 50%)',
    WebkitClipPath: 'circle(150% at 50% 50%)',
    duration: 0.4,
    ease: 'power3.out',
  }
);
```

`clip-path: circle()`은 모든 모던 브라우저에서 컴포지터 레벨 애니메이션이다. `will-change: clip-path`를 reveal 직전에 세팅, 완료 후 해제.

**대체 전략** (clip-path 이슈 발생 시): 검은색 오버레이 div를 `transform: scale(0 → 5)`로 축소하여 구멍을 뚫는 방식. 성능은 비슷하지만 구현이 더 복잡. **1차는 clip-path 사용**, 테스트에서 Safari iOS 이슈 발견 시 대체.

### 5.6 IntroOrchestrator 컴포넌트

별도 warmup 인스턴스 대신, 홈페이지의 **실제** AsciiCanvas 인스턴스들을 `eager={true}`로 마운트한 뒤 그들의 onReady 이벤트를 집계한다.

```tsx
// src/components/intro/IntroOrchestrator.tsx
'use client';

import { useEffect, useState } from 'react';
import gsap from 'gsap';
import { videoPool } from '@/lib/videoPool';
import { HOMEPAGE_ASCII_TARGETS } from '@/lib/introState';

const MIN_DISPLAY_MS = 1400;  // Q1=A
const HARD_CAP_MS = 2500;

export function IntroOrchestrator({ fillRectRef, mainContentRef, overlayRef }) {
  const [readyCount, setReadyCount] = useState(0);
  
  useEffect(() => {
    // prefers-reduced-motion → 인트로 전체 스킵
    if (!document.documentElement.classList.contains('intro-lock')) {
      runReveal({ skipAnimation: true });
      return;
    }
    
    // 1. videoPool 워밍업 시작 (병렬)
    videoPool.warmupAll(HOMEPAGE_ASCII_TARGETS.map(t => t.textureUrl))
      .catch(err => console.warn('videoPool partial failure:', err));
    
    // 2. 로고 fill 애니메이션 (GSAP)
    const fillTl = gsap.to(fillRectRef.current, {
      attr: { y: 0 },
      duration: 1.2,
      ease: 'power2.inOut',
      delay: 0.1,
    });
    
    // 3. onReady 이벤트 집계
    const expectedCount = HOMEPAGE_ASCII_TARGETS.length;
    let received = 0;
    const onReady = () => {
      received += 1;
      setReadyCount(received);
      if (received === expectedCount) {
        window.dispatchEvent(new CustomEvent('intro:webgl-ready'));
      }
    };
    window.addEventListener('ascii:ready', onReady);
    
    // 4. min timer + webgl ready 대기
    const minTimer = new Promise(r => setTimeout(r, MIN_DISPLAY_MS));
    const webglReady = new Promise(r => {
      if (received >= expectedCount) return r();
      window.addEventListener('intro:webgl-ready', () => r(), { once: true });
    });
    const hardCap = new Promise(r => setTimeout(r, HARD_CAP_MS));
    
    Promise.race([
      Promise.all([minTimer, webglReady]),
      hardCap,
    ]).then(() => runReveal({ skipAnimation: false }));
    
    return () => {
      window.removeEventListener('ascii:ready', onReady);
      fillTl.kill();
    };
  }, []);
  
  function runReveal({ skipAnimation }) {
    if (skipAnimation) {
      document.documentElement.classList.remove('intro-lock');
      delete document.documentElement.dataset.introActive;
      window.dispatchEvent(new CustomEvent('intro:revealed'));
      return;
    }
    
    // Circular reveal 애니메이션
    gsap.fromTo(mainContentRef.current,
      { clipPath: 'circle(0% at 50% 50%)', WebkitClipPath: 'circle(0% at 50% 50%)' },
      {
        clipPath: 'circle(150% at 50% 50%)',
        WebkitClipPath: 'circle(150% at 50% 50%)',
        duration: 0.4,
        ease: 'power3.out',
        onStart: () => {
          document.documentElement.classList.remove('intro-lock');
          delete document.documentElement.dataset.introActive;
          window.dispatchEvent(new CustomEvent('intro:revealed'));
        },
        onComplete: () => {
          // overlay fade out
          gsap.to(overlayRef.current, {
            opacity: 0, duration: 0.3,
            onComplete: () => {
              window.dispatchEvent(new CustomEvent('intro:done'));
            },
          });
        },
      }
    );
  }
  
  return null;
}
```

### 5.6.1 AsciiCanvas onReady → 이벤트 발사

`AsciiCanvas`는 기존에 `onReady` prop을 callback으로만 전달한다. IntroOrchestrator가 집계하려면 글로벌 이벤트로도 발사해야 한다.

```ts
// AsciiCanvas.tsx의 initMosaic 마지막 onReady 호출 부분 확장
onReady?.();
if (preloadKey) {
  window.dispatchEvent(new CustomEvent('ascii:ready', { detail: { key: preloadKey } }));
}
```

이렇게 하면 기존 callback prop (콜 사이트: HeroSection의 bgReady 상태)은 그대로 유지되면서, 오케스트레이터는 전역 이벤트를 수신한다.

**전역 카운팅의 정확성 보장 (race condition 방지)**:

React의 useEffect 실행 순서는 컴포넌트 트리 깊이에 따라 결정되므로 `IntroOrchestrator`가 마운트되는 시점에 일부 AsciiCanvas의 `ascii:ready` 이벤트가 이미 발사됐을 수 있다. 이를 막기 위해 **이벤트 + 모듈 레벨 Set 이중 구조**를 사용한다:

```ts
// src/lib/introState.ts
const readyKeys = new Set<string>();

export function markAsciiReady(key: string) {
  readyKeys.add(key);
  window.dispatchEvent(new CustomEvent('ascii:ready', { detail: { key } }));
}

export function getReadyKeys(): Set<string> {
  return new Set(readyKeys);
}

export const HOMEPAGE_ASCII_TARGETS = [
  { key: 'hero',        textureUrl: '/resource/Source_Desert.mp4' },
  { key: 'thesis-1',    textureUrl: '/resource/Source_About 01.mp4' },
  { key: 'thesis-2',    textureUrl: '/resource/Source_About 02.mp4' },
  { key: 'thesis-3',    textureUrl: '/resource/Source_About 03.mp4' },
  { key: 'thesis-4',    textureUrl: '/resource/Source_About 04.mp4' },
  { key: 'thesis-5',    textureUrl: '/resource/Source_About 05.mp4' },
  { key: 'thesis-6',    textureUrl: '/resource/Source_About 06.mp4' },
  { key: 'graph',       textureUrl: '/resource/Source_Graph.mp4' },
  { key: 'map',         textureUrl: '/resource/Source_World map.webp' },
  { key: 'nevada-tv',   textureUrl: '/resource/Source_Nevada TV.mp4' },
  { key: 'nevada-trade',textureUrl: '/resource/Source_Nevada Trade.mp4' },
] as const;
```

Orchestrator 로직:

```ts
// In IntroOrchestrator's useEffect
// 1. 초기 카운트는 모듈 Set에서 읽음 (race-free)
let received = getReadyKeys().size;
setReadyCount(received);
if (received >= HOMEPAGE_ASCII_TARGETS.length) { /* 이미 준비됨 */ }

// 2. 추가 이벤트 리스닝
const onReady = (e: CustomEvent) => {
  received = getReadyKeys().size;
  setReadyCount(received);
  if (received >= HOMEPAGE_ASCII_TARGETS.length) {
    window.dispatchEvent(new CustomEvent('intro:webgl-ready'));
  }
};
window.addEventListener('ascii:ready', onReady);
```

**주의**: `HOMEPAGE_ASCII_TARGETS.length = 11`이지만 Phase 2 isNearby로 인해 모바일 초기 마운트 시 thesis 4-6은 아직 마운트되지 않았다. 오케스트레이터는 **실제 마운트된 AsciiCanvas**의 준비를 기다려야 한다:

```ts
// 오케스트레이터는 "기대 키 목록"을 동적으로 계산:
// - 브레이크포인트 감지 (mobile/desktop)
// - 모바일: thesis-1, thesis-2 (isNearby ±1 from index 0) + hero + graph + map + products
// - 데스크톱: thesis-1 (isNearby 0±1에서 index 0만 해당) + hero + graph + map + products
function computeExpectedReadyKeys(): string[] {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const thesisKeys = isMobile
    ? ['thesis-1', 'thesis-2']  // Swiper initial + nearby
    : ['thesis-1'];              // Desktop isNearby at index 0
  return ['hero', ...thesisKeys, 'graph', 'map', 'nevada-tv', 'nevada-trade'];
}
```

이렇게 하면 인트로는 **실제로 첫 화면에 노출될 컨텍스트들**만 기다리므로 불필요한 대기가 없다.

**videoPool은 11개 모두 warmup** (초기 마운트 안 된 섹션들도 나중에 진입 시 사용). 이는 네트워크/디코드 병렬 작업이라 AsciiCanvas 초기화와 독립적이다.

### 5.7 VideoPool

```ts
// src/lib/videoPool.ts
const pool = new Map<string, HTMLVideoElement>();
const warmupPromises = new Map<string, Promise<HTMLVideoElement>>();

export function warmup(url: string): Promise<HTMLVideoElement> {
  if (warmupPromises.has(url)) return warmupPromises.get(url)!;
  
  const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url + '#t=0.001';  // iOS 첫 프레임 트릭
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.loop = true;
    
    const timeout = setTimeout(() => reject(new Error(`videoPool: timeout ${url}`)), 8000);
    
    video.addEventListener('canplay', async () => {
      clearTimeout(timeout);
      try {
        await video.play();
        // Play/pause 워밍업: iOS가 디코더 리소스 할당하도록
        // NOTE: pause 대신 그대로 재생 유지. 숨겨진 상태에서도 GPU 업로드는 계속됨.
        pool.set(url, video);
        resolve(video);
      } catch (err) {
        reject(err);
      }
    }, { once: true });
    
    video.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`videoPool: load error ${url}`));
    }, { once: true });
    
    video.load();
  });
  
  warmupPromises.set(url, promise);
  return promise;
}

export function warmupAll(urls: string[]): Promise<HTMLVideoElement[]> {
  return Promise.all(urls.map(warmup));
}

export function get(url: string): HTMLVideoElement | undefined {
  return pool.get(url);
}
```

**중요 주석**:
- `#t=0.001`은 iOS Safari가 첫 프레임을 디코드하도록 강제하는 공식 워크어라운드이다.
- `video.pause()`를 호출하지 않는다. 풀의 비디오는 계속 재생 상태로 유지되어 VideoTexture가 바로 사용될 수 있다. 다만 화면에 안 보이므로 체감 비용은 없다.
- iOS Safari는 동시 활성 비디오 수에 제한(일반적으로 16개)이 있으나 11개는 안전 범위.

### 5.8 AsciiCanvas 수정점

```ts
// src/components/ascii/AsciiCanvas.tsx
interface AsciiCanvasProps {
  // ... 기존 prop ...
  
  /** videoPool 조회 키. 제공 시 pool에서 사전 워밍된 video element 재사용 시도. */
  preloadKey?: string;
}
```

내부 변화:
- `MAX_ACTIVE_CONTEXTS` 10 → 14 (Phase 2와 통합)
- `initMosaic`에서 textureType=='video'일 때 `videoPool.get(textureUrl)` 먼저 조회 → 존재 시 `createTexturedMesh`에 기존 video element 주입. 존재하지 않으면 현재 로직 그대로 (폴백).

### 5.9 texturedMesh.ts 수정점

`createVideoTexture`에 2번째 인자로 `existingVideo?: HTMLVideoElement` 추가:

```ts
function createVideoTexture(videoUrl: string, existingVideo?: HTMLVideoElement): Promise<THREE.VideoTexture> {
  if (existingVideo && existingVideo.readyState >= 2) {
    // 이미 준비된 비디오 재사용
    const texture = new THREE.VideoTexture(existingVideo);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return Promise.resolve(texture);
  }
  // 기존 생성 로직 (폴백)
  // ...
}
```

`createTexturedMesh` 시그니처에 `existingVideo?` 추가 → `AscMosaic.addModel`에 전달 → AsciiCanvas에서 pool 조회 결과 전달.

**중요**: 기존 경로는 완전히 보존된다. `existingVideo === undefined`이면 현재와 100% 동일한 동작.

**videoTexture.dispose() 주의**: 기존 `AscMosaic.addModel` (index.ts:202-223)는 이전 모델 정리 시 video element의 `src = ''`, `load()`를 호출하여 비디오를 죽인다. Pool에서 온 비디오는 이 로직을 타면 안 된다. 해결: `modelOptions`에 `isPooled: boolean` 플래그 추가 → dispose 시 체크.

### 5.10 HeroSection 수정점

기존 스크램블은 마운트 시점에 DELAYS 배열로 `setTimeout` 시작. 이걸 `intro:revealed` 이벤트 기반으로 변경:

```tsx
// Before
useEffect(() => {
  DELAYS.forEach((delay, i) => {
    const t = setTimeout(() => startScramble(i), delay);
    // ...
  });
}, [startScramble]);

// After
useEffect(() => {
  // 인트로가 이미 끝났다면 (prefers-reduced-motion / 리로드 복귀) 즉시 시작
  if (document.documentElement.dataset.introActive !== 'true') {
    scheduleScramble();
    return;
  }
  // 그렇지 않으면 reveal 이벤트 대기
  const handler = () => {
    scheduleScramble();
    window.removeEventListener('intro:revealed', handler);
  };
  window.addEventListener('intro:revealed', handler);
  return () => window.removeEventListener('intro:revealed', handler);
}, [scheduleScramble]);
```

`unlockPage` 안전망(2.5s fallback)은 유지.

### 5.11 layout.tsx의 intro-lock 스크립트 확장

```ts
// 기존
if (window.location.pathname === '/') {
  document.documentElement.classList.add('intro-lock');
}

// 변경 후
if (window.location.pathname === '/') {
  var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!mql.matches) {
    document.documentElement.classList.add('intro-lock');
    document.documentElement.dataset.introActive = 'true';
  }
}
```

`data-intro-active` 속성은 CSS에서 클립 경로 초기 상태 제어에 사용:

```css
/* globals.css 추가 */
html[data-intro-active="true"] #main-content {
  clip-path: circle(0% at 50% 50%);
  -webkit-clip-path: circle(0% at 50% 50%);
}
```

---

## 6. Phase 2 Design — Context Budget & Concurrency

### 6.1 스코프 재조정 — 정직한 설명

원래 "Thesis 6→1 컨텍스트 통합" 이라고 표현했는데, 실제로 검증해보니 **6→1 shared canvas는 Swiper crossfade와 position sync가 복잡**하다:

- 6개 슬라이드의 `MobileAscii`는 `align` prop에 따라 left/right/center에 배치됨
- Swiper fade는 두 슬라이드를 동시에 표시 (400ms 동안)
- 단일 canvas를 absolute positioning으로 이동시키면 fade 중간에 위치 점프 → 시각적 어색함
- `AscMosaic.addModel`의 video texture dispose 경로를 건드리면 회귀 위험 큼

따라서 **실용적 Phase 2는 "6→3 via `isNearby` gate + videoPool + budget bump"**로 제안한다. 이것이 "사이드이펙트 없이 근본 이슈 해결"에 부합한다.

Phase 2로 해결하는 근본 이슈는 다음 2가지:
- **RC1**: 모바일 동시 컨텍스트 11 > 10 예산 → 한 개가 조용히 스킵됨
- **RC2**: 모바일 Thesis 6개가 동시 활성화되어 불필요한 GPU/메모리 부담

### 6.2 변경 1 — `MAX_ACTIVE_CONTEXTS` 10 → 14

```ts
// AsciiCanvas.tsx:86
const MAX_ACTIVE_CONTEXTS = 14;
```

근거:
- iOS Safari WebKit 내부 한계: 16 ([WebGL spec + empirical data](https://webkit.org/blog/))
- Chrome Android: 16
- 데스크톱 Chrome/Firefox/Safari: 16
- 14로 세팅 → 2개 여유 (context loss 복구 시 안전판)
- 11개 활성 + 3개 여유로 동작

**Regression risk**: 매우 낮음. 단순 상수 변경. 기존 예산 내 동작은 그대로.

### 6.3 변경 2 — `ThesisSectionMobile.tsx`의 `isActive` → `isNearby` 게이트

```tsx
// Before (line 434)
const isActive = index === activeIndex;
return (
  <SwiperSlide>
    <div>
      {isActive ? state.mobileContent : (
        <div className="opacity-0" aria-hidden="true">
          {state.mobileContent}
        </div>
      )}
    </div>
  </SwiperSlide>
);

// After
const isNearby = Math.abs(index - activeIndex) <= 1;
return (
  <SwiperSlide>
    <div>
      {isNearby ? (
        <div className={index === activeIndex ? '' : 'opacity-0'} aria-hidden={index !== activeIndex}>
          {state.mobileContent}
        </div>
      ) : (
        // 원거리 슬라이드: ASCII + 텍스트 모두 unmount, 레이아웃 placeholder만 유지
        <div className="invisible" aria-hidden="true">
          <PlaceholderSkeleton state={state} />
        </div>
      )}
    </div>
  </SwiperSlide>
);
```

`PlaceholderSkeleton`은 `state.mobileContent`의 footprint를 모사하는 순수 div (ASCII 없음). 목적: Swiper 슬라이드 크기 계산이 흔들리지 않도록.

**왜 ±1인가?**
- Swiper fade 중간에 이전 + 현재 + 다음 슬라이드가 동시에 일부 보일 수 있음 (fade 애니메이션 중)
- 사용자가 빠르게 스와이프하면 1단계 건너뛰기는 가능하지만 2단계 이상은 드뭄
- `±1`은 안전하고 보수적

### 6.4 Phase 2 이후 컨텍스트 사용량

모바일:
- Hero (1) + Thesis(3) + Graph(1) + Map(1) + Products(2) = **8**
- 14 예산 → 여유 6

데스크톱:
- Hero(1) + Thesis(3) + Graph(1) + Map(1) + Products(2) = **8** (기존과 동일)
- 14 예산 → 여유 6

**핵심**: 홈페이지의 실제 AsciiCanvas 인스턴스가 그대로 warmup 역할을 수행한다. 인트로 중에는 `main-content`가 `clip-path: circle(0%)`로 시각적으로 가려져 있을 뿐, WebGL 컨텍스트는 실제 최종 위치에서 초기화된다. 인트로 종료 후 별도의 dispose/remount 없이 끊김 없이 런타임 경험으로 연결된다.

**필수 eager 전파**: 모든 홈페이지 AsciiCanvas 인스턴스는 `eager={true}`를 받아야 한다. 기본값(IntersectionObserver)에 맡기면 viewport 밖의 섹션은 초기화되지 않는다.

```tsx
// 모바일 기준 마운트 시점의 eager 캔버스들:
// - AsciiHero (viewport top, always eager)
// - AsciiThesis × 2 (isNearby = slide 0, 1 → eager)
// - AsciiGraph (hero 아래, eager로 강제)
// - AsciiMap (graph 아래, eager로 강제)
// - AsciiProduct × 2 (map 아래, eager로 강제)
// 합계: 7 contexts
```

**isNearby와 runtime 동작**:
- 페이지 첫 로드: slides 0, 1 컨텍스트 활성 (thesis)
- 사용자가 slide 1 → slide 2로 swipe: isNearby가 [0,1,2]에서 [1,2,3]으로 변경
  - slide 0 unmount → dispose (activeContextCount -1)
  - slide 3 mount → init (activeContextCount +1)
  - videoPool에서 warmed video 재사용 → init 시간 ~50-100ms
- Swiper fade 400ms 윈도우 내에 완료됨 → 사용자 눈에 보이는 flicker 없음

**총 활성 컨텍스트**: 항상 7-8개 (14 예산 대비 50% 여유)

---

## 7. Side Effect Audit

### 7.1 기능 회귀 리스크

| 기존 기능 | 리스크 | 완화책 |
|---|---|---|
| Theme toggle 중 로고 색 변경 | 중간 — intro 중 테마 전환 시 로고 색 갑자기 바뀜 | 인트로 중 ThemeToggle 비활성화 (pointer-events:none, 이미 intro-lock로 됨) |
| 2.5s unlockPage 안전망 | 낮음 — intro가 2.5s 하드 캡이면 시간 겹침 | 기존 안전망은 스크램블용이고, 인트로가 끝난 후 스크램블 시작 → unlockPage 타이머는 스크램블 시작 시점부터 재설정 |
| Thesis 핀/스와이프 (GSAP ScrollTrigger) | 중간 — intro-lock 때문에 ScrollTrigger refresh 시점 꼬일 수 있음 | 기존에 이미 `thesis-touch-lock` + intro-lock 조합 처리 로직 있음 (`ThesisSection.tsx:41-52`). 해당 MutationObserver가 intro-lock 해제 감지 시 refresh 호출 → 그대로 작동 |
| Mobile hamburger menu | 낮음 — intro 중 사용자가 메뉴 열 수 없음 (pointer-events) | intro 완료 후 정상 |
| Back/forward cache (`pageshow`) | 낮음 — bfcache 복귀 시 reload하는 기존 로직 유지 | 그대로 |
| Hash navigation `/#thesis`, `/#products` | 낮음 — intro 중에는 hash가 있어도 스크롤 대기 | intro 완료 후 hashScroll 재시도 |
| Scroll restoration | 낮음 — `scrollRestoration = 'manual'` 유지 | 그대로 |
| `prefers-reduced-motion` | 필수 — intro 완전 스킵 | 레이아웃 스크립트에서 감지하여 intro-lock/data-intro-active 미설정 → IntroOverlay 스킵 |

### 7.2 성능 회귀 리스크

| 시나리오 | 리스크 | 완화책 |
|---|---|---|
| 저사양 모바일 (iPhone 6s, 오래된 Android) WebGL 컨텍스트 14개 | 중간 — context lost 빈발 가능 | 기존 `contextLostHandler` 재활용 + 단계 3 "warmup dispose" 전략으로 실제 활성 컨텍스트 8개 유지 |
| 3G/4G 네트워크 intro 지연 | 낮음 — 리소스 1.5MB 총량, 병렬 로드 | 하드 캡 2.5s로 강제 reveal |
| Slow CPU (저사양 디바이스) 셰이더 컴파일 지연 | 중간 — intro가 2.5s 내 완료 못함 | 하드 캡 후 reveal, 실제 섹션은 기존 lazy init로 폴백 (사이드이펙트 없음) |
| 메모리 압박으로 AssetPrefetcher 역할 상실 (삭제) | 낮음 — videoPool이 실질적 대체 | videoPool은 11개 비디오를 `preload=auto` + `play`로 적극 로드 → 기존 prefetch보다 강력함 |
| 비디오 스트리밍 대역폭 | 낮음 — 비디오는 루프 재생이라 한 번 로드 후 재사용 | 동일 |

### 7.3 Accessibility 리스크

| 이슈 | 완화책 |
|---|---|
| 스크린 리더 사용자가 빈 intro 화면에 갇힘 | `IntroOverlay`에 `role="status" aria-live="polite" aria-label="Loading..."`. 완료 후 `aria-hidden="true"` |
| 키보드 사용자가 Tab 입력 시 intro 뒤 컨텐츠로 포커스 이동 | intro-lock 중 전역 keydown preventDefault (기존 `blockScrollKeys` 유지 + 확장) |
| prefers-reduced-motion 인트로 없이 바로 히어로 | 인라인 스크립트에서 matchMedia 체크 → intro 마운트 자체 스킵 |
| 색약 사용자의 orange fill 시인성 | `var(--color-accent)` = #FF3700은 WCAG AA 대비 (카드 배경 기준). 기존 브랜드 컬러이므로 변경 없음. |
| Focus outline이 intro 중 가려짐 | intro-lock 해제 후 body focus 복원 |

### 7.4 SSR/Hydration 리스크

| 이슈 | 완화책 |
|---|---|
| IntroOverlay가 hydration mismatch 유발 | 순수 SVG+CSS로 구성, 서버/클라 동일 렌더. GSAP 타임라인은 useEffect 안에서만. |
| `WebGLWarmup`은 client-only | `dynamic(() => import(...), { ssr: false })`로 래핑 |
| `data-intro-active` 속성은 인라인 스크립트가 설정하므로 hydration 이전 DOM 상태와 일치 | OK |
| Next.js 16의 selective hydration이 intro 스크립트를 지연시킴 | 인라인 스크립트는 React 외부라 영향 없음 |

### 7.5 코드 유지보수 리스크

| 항목 | 코멘트 |
|---|---|
| 신규 컴포넌트 7개, 수정 12개 | 중간 규모. 단일 브랜치/PR로 관리 가능. |
| AscMosaic 라이브러리 변경 (texturedMesh.ts) | 추가 파라미터만 도입, 기존 경로 보존. 역호환. |
| 이벤트 기반 orchestration (`intro:revealed`, `intro:webgl-ready`) | 타입 안전을 위해 `src/lib/introState.ts`에 CustomEvent 인터페이스 명시 |
| 테스트 없음 | 기존 프로젝트에 테스트 프레임워크 없음. QA는 수동 + 브라우저 스모크 |

---

## 8. Testing & Verification Plan

### 8.1 필수 수동 검증 (구현 중/후)

**데스크톱 Chrome**:
- [ ] 홈 첫 진입 시 인트로 재생 (1.4-1.8s)
- [ ] reveal 후 스크램블 정상 시작 + 완료
- [ ] 스크롤해서 Thesis 1-6 모두 즉시 캔버스 표시 (pulse 없음)
- [ ] ThesisGraph, ProductMap, Products 동일하게 pulse 없음
- [ ] 핀 스크롤 thesis 동작 정상 (기존과 동일)
- [ ] Theme toggle light/dark 전환 시 모든 ASCII가 atlas 텍스처 새로 업로드되는지
- [ ] `/about` 이동 → 뒤로가기 시 intro 재생 여부 (bfcache reload 경로)
- [ ] Hash link `/#thesis` 클릭 시 동작

**모바일 Safari (iPhone)**:
- [ ] 인트로 재생, circular reveal 부드러운지
- [ ] Swiper thesis 슬라이드 전환 시 ASCII pulse 없음 (±1 nearby 확인)
- [ ] 2~3번 슬라이드 건너뛴 경우 (빠른 스와이프) ASCII 재초기화 지연 측정
- [ ] iOS 저전력 모드 (Low Power) 에서 동작
- [ ] Safari 백그라운드 전환 후 복귀 시 context loss 없는지

**모바일 Chrome (Android)**:
- [ ] 동일 항목

**Accessibility**:
- [ ] `prefers-reduced-motion: reduce` 활성화 시 인트로 완전 스킵
- [ ] VoiceOver/TalkBack로 intro 완료 후 포커스 정상
- [ ] Tab 키 순서 (intro 중엔 막힘, 이후엔 정상)

**Network conditions**:
- [ ] DevTools "Slow 3G" 프로파일로 인트로 2.5s 하드 캡 확인 → 강제 reveal
- [ ] `saveData` 에뮬레이션 (ChromeDevTools) — 기존 skip 로직 유지되는지

### 8.2 리그레션 확인 (기존 동작 보존)

- [ ] `d1c4358` 이후 기존 스크롤/스와이프 버그 회귀 없음
- [ ] Thesis 핀 exit (`#thesis-graph` 진입) 정상
- [ ] Thesis 역방향 재진입 정상
- [ ] Mobile thesis edge exit (첫/마지막 슬라이드에서 스와이프 탈출) 정상
- [ ] `ScrollRevealWrapper`의 Reveal 애니메이션 정상
- [ ] `RollingNumber` 트리거 정상 (ProductMap)
- [ ] Mobile menu 열기/닫기 스크롤 lock 정상

### 8.3 성능 측정

- **Lighthouse 모바일**: LCP, CLS 비교 (before/after)
- **iOS Safari Web Inspector 타임라인**: 
  - 인트로 구간 GPU 점유율
  - 각 섹션 진입 시 메인 스레드 작업량
- **체감 지연 기록**: 스크롤 → ASCII 등장 시점을 수동 측정 (영상 촬영)

### 8.4 빌드/린트

- [ ] `pnpm build` 성공 (타입 에러 없음)
- [ ] `pnpm lint` 경고 0개
- [ ] `tsc --noEmit` 타입 체크

---

## 9. Rollback Strategy

### 9.1 Feature flag 없음 — 단일 브랜치

이 변경은 rebuild + redeploy 단위로 롤백한다. 이유:
- 프로젝트에 LaunchDarkly 같은 flag 시스템 없음
- 네트워크/런타임 flag는 intro 자체를 지연시킴 (flag fetch 필요)
- 단순 코드 롤백이 깔끔

### 9.2 롤백 트리거 조건

- iOS Safari context loss 빈발 (5% 이상 세션)
- Lighthouse LCP 4s 초과
- 브랜딩 불만
- 미처 발견 못한 회귀

### 9.3 롤백 방법

```bash
git revert <merge commit> --no-edit
git push origin main
```

재배포 후 즉시 원상복귀.

### 9.4 부분 롤백 (Phase 2만)

`MAX_ACTIVE_CONTEXTS = 10` 되돌리고 `isNearby` → `isActive` 되돌리는 별도 커밋 가능. Phase 1만 유지하고 context 압박 수용.

---

## 10. Open Questions

1. **Q**: `WebGLWarmup`의 dispose 전략 — "셰이더 컴파일 + dispose"를 할지, "video pool만" 할지?  
   **A**: 1차는 video pool만 (가벼운 버전). 벤치마크 후 셰이더까지 필요하면 추가.

2. **Q**: 인트로 하드 캡 2.5s는 충분한가?  
   **A**: 느린 모바일 기준 비디오 canplay 최악 1.5s + 셰이더 컴파일 ~500ms = 2s. 0.5s 여유. 조정 가능.

3. **Q**: 첫 방문 vs 재방문 구분해서 intro 시간 차등 적용?  
   **A**: Phase 1에서는 동일 처리. 브랜드 일관성 우선. 추후 A/B 테스트로 검토.

4. **Q**: `WebGLWarmup`이 실패(일부 비디오 로드 에러)하면?  
   **A**: `Promise.allSettled` 사용. 에러 발생 비디오는 pool에 없으므로 해당 섹션은 기존 lazy init로 폴백. 전체 intro는 정상 진행.

5. **Q**: 사용자가 intro 도중 페이지 이탈 (뒤로가기, 탭 전환) 시?  
   **A**: GSAP 타임라인 `onLeave` 훅 없음 → 다음 진입 시 `intro-lock` 스크립트가 다시 실행됨. videoPool은 전역이므로 이미 warmed. intro는 빠르게 완료.

6. **Q**: Next.js App Router의 client-side navigation (만약 생기면) 에서 intro 재실행?  
   **A**: 현재 `/` ↔ `/about`만 있고 둘 다 Link로 이동. `/about` → `/`로 back 시 intro 재생은 원치 않을 수 있음. **결정**: `sessionStorage.introSeen`으로 세션 내 2번째 홈 진입은 스킵.  

7. **Q**: 로고 fill 애니메이션 easing — `power2.inOut` vs `power3.out`?  
   **A**: 1차: `power2.inOut` (부드러운 양방향). 브랜드 톤에 맞춰 조정.

---

## 11. Implementation Order (for writing-plans agent)

순서는 `writing-plans` skill에서 detailed plan으로 확장할 것. 대략적인 phase:

**Stage 1 — Foundation (새 파일 + 라이브러리 훅)**
- `src/lib/videoPool.ts`
- `src/lib/introState.ts`
- `src/hooks/useIntroState.ts`
- `src/lib/ascmosaic/texturedMesh.ts` 수정 (existingVideo 파라미터)

**Stage 2 — Intro UI**
- `src/components/intro/LogoFillSvg.tsx`
- `src/components/intro/IntroOverlay.tsx`
- `src/components/intro/IntroOrchestrator.tsx`
- `src/app/globals.css` 스타일 추가

**Stage 3 — Layout 변경 + AssetPrefetcher 제거**
- `src/components/providers/AssetPrefetcher.tsx` 삭제
- `src/app/layout.tsx`: IntroOverlay + IntroOrchestrator 마운트, intro-lock 스크립트 prefers-reduced-motion 분기 추가, main-content에 ref + data attribute
- `src/app/page.tsx`: 홈페이지 AsciiCanvas들이 `eager={true}` 받도록 홈 전용 컨텍스트 전파 (혹은 prop 직접 전달)

**Stage 4 — AsciiCanvas & 서브컴포넌트 preloadKey + eager 전파**
- `src/components/ascii/AsciiCanvas.tsx`:
  - `preloadKey` prop 추가 (optional string)
  - initMosaic 내 textureType=='video'일 때 `videoPool.get(textureUrl)`로 warmed video 조회
  - onReady 호출 시 `markAsciiReady(preloadKey)`도 호출 (introState)
  - `MAX_ACTIVE_CONTEXTS` 10 → 14
- `src/components/ascii/AsciiHero.tsx` — `preloadKey="hero"`, `eager={true}` 하드코딩 (viewport top, 항상 즉시 초기화)
- `src/components/ascii/AsciiThesis.tsx` — `preloadKey={`thesis-${stateNumber}`}`, `eager={true}` (Swiper 외부 마운트 시에만 활성, isNearby에 의해 이미 게이팅됨)
- `src/components/ascii/AsciiGraph.tsx` — `preloadKey="graph"`, `eager={true}`
- `src/components/ascii/AsciiMap.tsx` — `preloadKey="map"`, `eager={true}`
- `src/components/ascii/AsciiProduct.tsx` — `preloadKey={`product-${product}`}`, `eager={true}`

**왜 하드코딩?** 이 컴포넌트들은 모두 **홈페이지 전용**이다. `/about`의 `AsciiTeamSymbol`은 별도 컴포넌트로 이미 `eager={true}`를 사용하고 있고, 다른 페이지에서 homepage ASCII 컴포넌트를 재사용하는 곳은 없다. eager prop을 옵션으로 드러내면 불필요한 API 노출이다.

**Stage 5 — HeroSection scramble orchestration**
- `src/components/home/HeroSection.tsx` (intro:revealed 이벤트 대기, 기존 unlockPage 안전망 유지)

**Stage 6 — Phase 2 isNearby gate**
- `src/components/home/ThesisSectionMobile.tsx` (isNearby + PlaceholderSkeleton)

**Stage 7 — Verification**
- `pnpm build`, `pnpm lint`
- 브라우저 스모크 (Chrome 데스크톱, Safari iOS, Chrome Android)
- 위 섹션 8.1 체크리스트 수동 검증
- 영상 촬영 (before/after 비교)

---

## 12. Appendix — Resources

- [Three.js WebGLRenderer.compileAsync](https://threejs.org/docs/pages/WebGLRenderer.html)
- [KHR_parallel_shader_compile](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile)
- [Steve Souders — HTML5 VIDEO bytes on iOS](https://www.stevesouders.com/blog/2013/04/21/html5-video-bytes-on-ios/)
- [Muffin Man — #t=0.001 trick](https://muffinman.io/blog/hack-for-ios-safari-to-display-html-video-thumbnail/)
- [WebKit — New video policies for iOS](https://webkit.org/blog/6784/new-video-policies-for-ios/)
- [web.dev — Performant expand and collapse](https://developer.chrome.com/blog/performant-expand-and-collapse)
- [CSS-Tricks — Animating with clip-path](https://css-tricks.com/animating-with-clip-path/)
- [GSAP docs — attr plugin](https://gsap.com/docs/v3/GSAP/CorePlugins/AttrPlugin/)
- [MDN — HTMLMediaElement readyState](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState)
- [Doherty Threshold (400ms)](https://til.heyitsrocky.com/posts/2022-07/2022-07-23-doherty-threshold/)
