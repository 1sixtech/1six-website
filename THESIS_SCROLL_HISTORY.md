# ThesisSection Scroll — 문제 히스토리 및 현재 상태

## 현재 코드 상태 (`22559bb`)

ThesisSection은 **데스크톱/모바일 완전 분리** 아키텍처:

- **데스크톱 (768px+):** 기존 GSAP ScrollTrigger `pin: true` + Observer로 discrete page-by-page crossfade 전환 (7페이지). 코드 무변경, 100% 정상 작동.
- **모바일 (767px-):** `ThesisSectionMobile` 컴포넌트 — Swiper.js vertical + EffectFade + body scroll lock. GSAP pin/Observer/normalizeScroll 일체 미사용.

### 모바일 아키텍처 상세

```
page scroll → Hero → 스크롤 다운 → Thesis 섹션 60% 보임
                                      ↓
                            IntersectionObserver (threshold: 0.6)
                                      ↓
                       body overflow:hidden + position:fixed
                       (페이지 스크롤 완전 잠금)
                       savedScrollY로 스크롤 위치 보존
                                      ↓
                       Swiper vertical + EffectFade
                       아래 스와이프 → 다음 페이지 (crossfade)
                       위 스와이프 → 이전 페이지 (crossfade)
                                      ↓
                       마지막 슬라이드 + 아래 50px 이상 → unlock + scrollIntoView(#thesis-graph)
                       첫 슬라이드 + 위 50px 이상 → unlock + scrollTo(0)
```

- **디바이스 감지:** `ThesisSection`이 parent로, `isMobile` state가 `null`(SSR) → `true/false`(client) 순서로 결정. null일 때는 빈 placeholder 렌더링하여 GSAP pin-spacer DOM 조작 방지.
- **데이터 공유:** `thesisData.tsx`에서 `THESIS_STATES`, `InlineAscii`, `MobileAscii`, `subTextClass` export. 두 컴포넌트에서 공유.
- **WebGL 관리:** active slide +-1만 canvas 마운트 (React 조건부 렌더링). Swiper fade의 opacity:0 슬라이드에서 IntersectionObserver가 "visible"로 판단하는 문제를 우회.
- **normalizeScroll:** 완전 제거. 대신 intro-lock 해제 시 `ScrollTrigger.refresh(true)` 명시적 호출 (ScrollRevealWrapper 동작 보장).
- **pagination dots:** 하단 중앙, 수평 배치 (커스텀 React 버튼).

---

## 해결된 문제들

### Phase 1: 데스크톱 GSAP 문제 (해결됨, 모바일 분리 전)

#### 1. 데스크톱 wheel freeze (치명적)
- **증상**: 데스크톱에서 thesis 진입 후 wheel 스크롤로 페이지 전환이 전혀 안 됨. 키보드(ArrowDown)는 작동.
- **원인**: Two-Observer 패턴(`ffff820`)에서 viewport-level `preventScroll` Observer가 wheel 이벤트를 먼저 소비하여, section-level `intentObserver`에 이벤트가 도달하지 못함.
- **해결**: `d3a0e7c`에서 Two-Observer를 Single Observer로 통합하여 이벤트 채널 충돌 제거.
- **현재 상태**: ✅ 해결됨

#### 2. 여러 페이지 동시 스킵 (데스크톱 + 모바일)
- **증상**: 강한 trackpad fling이나 빠른 swipe 시 thesis 페이지가 2-3개씩 건너뜀.
- **원인**: `onComplete`에서 Observer disable/re-enable 시 150ms cooldown이 trackpad momentum(~500ms-1.5s)보다 짧아, 잔여 momentum 이벤트가 다음 전환을 즉시 트리거.
- **해결**: `1dd6f11`에서 onComplete에서 Observer를 disable하지 않도록 변경. `COOLDOWN_MS = 400` time-based debounce로 momentum 흡수.
- **현재 상태**: ✅ 해결됨

#### 3. Hero ↔ Thesis 중간에서 스크롤 멈춤
- **증상**: Hero에서 thesis로 스크롤하다 중간에 멈추면, native scroll이 차단되어 더 이상 이동 불가.
- **원인**: always-on Observer(`18e889e`)가 `preventDefault: true`로 pin 범위 밖에서도 wheel/touch 이벤트를 차단.
- **해결**: `1dd6f11`에서 Observer를 onEnter/onLeave lifecycle으로 전환 (pin 시에만 enable). 수동 touch/wheel 리스너가 `sectionActiveRef` 조건부로 대체.
- **현재 상태**: ✅ 해결됨

#### 4. 데스크톱 마지막 페이지에서 탈출 불가
- **증상**: thesis-07에서 아래로 스크롤해도 ThesisGraph로 넘어가지 않음.
- **원인**: (a) `+1px` offset이 pin-spacer reflow에 흡수되어 `onLeave` 미발동, (b) boundary exit에서 `sectionActiveRef = false` 설정 후 safety timeout이 이를 복구하지 않아 영구 데드락.
- **해결**: `1dd6f11`에서 offset을 `+50px`로 증가 + safety timeout에서 `sectionActiveRef` + Observer 복구 로직 추가.
- **현재 상태**: ✅ 해결됨

#### 5. 경계 탈출 시 bounce-back
- **증상**: thesis 마지막에서 탈출 후 macOS/iOS elastic bounce로 다시 thesis로 끌려들어감.
- **원인**: `onEnterBack`에 bounce-back 보호 없음.
- **해결**: `18e889e`에서 `exitingRef` 도입 (이벤트 기반 — `onLeave` fire 시 해제, safety timeout에서도 해제하여 데드락 방지).
- **현재 상태**: ✅ 해결됨

#### 6. 경계 탈출 시 "한 번 먹히는" 느낌
- **증상**: 마지막/첫 페이지에서 탈출 시 swipe가 한 번 소비되는 듯한 딜레이.
- **원인**: `requestAnimationFrame`으로 `scrollTo`를 1프레임 defer하여 16ms 공백 발생.
- **해결**: `d15407a`에서 rAF 제거, `scrollTo` 즉시 실행.
- **현재 상태**: ✅ 해결됨

#### 7. 하단 레이어 bleed-through
- **증상**: thesis 보는 중 하단에 ThesisGraph 디자인이 비쳐 보임.
- **원인**: section에 `overflow: hidden`과 `z-index` 미설정, pin-spacer에 배경색 없음.
- **해결**: `d3a0e7c`에서 section에 `overflow-hidden z-10`, globals.css에 `.pin-spacer { background-color }` 추가.
- **현재 상태**: ✅ 해결됨

#### 8. iOS 첫 swipe 무시 (터치해야 작동 시작)
- **증상**: iPhone에서 Hero→Thesis 스크롤 후, 첫 swipe가 무시되고 한 번 터치해야 그 다음부터 작동.
- **원인**: iOS UIScrollView가 compositor thread에서 momentum scroll을 실행. 첫 touch는 iOS가 momentum 정지용으로 소비 (WebKit #174300).
- **해결**: `5624ab5`에서 module-level `ScrollTrigger.normalizeScroll(true)` 활성화.
- **현재 상태**: ✅ 해결됨 (데스크톱). 모바일은 Swiper 전환으로 우회.

### Phase 2: 모바일 분리 작업 (현재 진행중)

#### 9. GSAP pin-spacer DOM + React hydration 충돌
- **증상**: 모바일에서 웹사이트 진입 시 Thesis가 바로 표시되고 Hero가 보이지 않음. "something went wrong" 에러. 에셋 미로딩, 스와이프 미동작.
- **원인**: `isMobile`이 `false`(SSR 기본값)로 시작 → GSAP ScrollTrigger가 pin-spacer DOM 래퍼 생성 → useEffect에서 `isMobile=true`로 변경 → React가 GSAP 조작 DOM을 ThesisSectionMobile로 교체 시도 → `removeChild` DOMException.
- **해결**: `6a1a73f`에서 ThesisSection을 parent(디바이스 감지) + ThesisSectionDesktop(GSAP hooks)로 분리. `isMobile`을 `null`로 시작하여 SSR 시 빈 placeholder, 디바이스 감지 후 올바른 경로만 마운트.
- **현재 상태**: ✅ 해결됨

#### 10. 모바일 수평 스와이프 UX 문제
- **증상**: 수평 스와이프는 thesis의 "아래로 읽어 내려가는" 스토리텔링에 맞지 않음. 사용자가 아래로 스크롤하면 자연스럽게 페이지가 넘어가야 함.
- **해결**: `f57f6e8`에서 Swiper direction을 `horizontal` → `vertical`로 변경.
- **현재 상태**: ✅ 해결됨

#### 11. 모바일에서 Thesis 섹션이 스크롤에 관통됨
- **증상**: Hero에서 스크롤 다운하면 Thesis 첫 페이지만 스쳐 지나가고 바로 아래로 넘어감. 스크롤이 Thesis에서 멈추지 않음.
- **원인**: Swiper vertical이 100dvh 섹션으로 DOM에 있지만, 페이지 레벨 momentum 스크롤이 Swiper 컨테이너를 관통. GSAP pin이 해결하던 "일정 포인트에서 스크롤 멈춤" 기능이 없었음.
- **해결**: `22559bb`에서 IntersectionObserver(threshold: 0.6) + body scroll lock 패턴 도입. Thesis가 뷰포트에 60% 이상 보이면 `document.body.style.overflow = 'hidden'` + `position: fixed`로 페이지 스크롤 잠금. Swiper가 수직 터치 제스처 처리.
- **현재 상태**: ⏳ 실기기 테스트 필요

---

## 현재 남아있는 문제 / 검증 필요

### A. body scroll lock이 iOS Safari에서 정상 동작하는지
- `overflow: hidden` + `position: fixed` 패턴이 iOS 16.3+에서 정상 동작하는 것은 커뮤니티에서 확인됨
- 하지만 실기기 테스트 필요: Hero → Thesis 진입 시 스크롤이 실제로 멈추는지, 스크롤 위치 보존이 정상인지
- **상태**: ❓ 미확인

### B. Swiper vertical + body lock 상태에서 슬라이드 전환
- body가 locked 상태에서 Swiper의 touch event handling이 정상 동작하는지
- crossfade 애니메이션이 부드러운지 (normalizeScroll 없이 jank 없어야 함)
- **상태**: ❓ 미확인

### C. Edge exit (마지막/첫 슬라이드 탈출)
- 마지막 슬라이드에서 아래로 50px+ 스와이프 시 unlock + ThesisGraph로 smooth scroll
- 첫 슬라이드에서 위로 50px+ 스와이프 시 unlock + Hero(top)로 smooth scroll
- Swiper의 `releaseOnEdges`가 iOS에서 깨져있어 직접 구현했으므로, 실기기 동작 확인 필요
- **상태**: ❓ 미확인

### D. re-entry (다시 Thesis로 돌아올 때)
- ThesisGraph에서 위로 스크롤해서 다시 Thesis에 진입할 때 IntersectionObserver가 다시 lock을 걸는지
- 이 때 activeIndex가 올바르게 유지되는지 (마지막 슬라이드 상태에서 진입?)
- **상태**: ❓ 미확인

### E. 데스크톱 regression
- ThesisSectionDesktop이 기존과 동일하게 동작하는지 (pin, crossfade, keyboard nav, dot click)
- normalizeScroll 제거 후 데스크톱에서 부작용 없는지 (데스크톱은 `ScrollTrigger.isTouch !== 1`이므로 영향 없어야 함)
- **상태**: ❓ 실기기 테스트 필요

---

## 핵심 아키텍처 결정 로그

### 왜 모바일을 분리했는가

30개 이상의 웹 리소스 조사 + Codex 세컨드 오피니언 + 2라운드 eng review를 거친 결론:

1. **iOS Safari의 compositor-thread scroll은 JS scroll interception과 근본적으로 충돌.** normalizeScroll로 해결하면 모든 스크롤이 JS thread를 경유하여 WebGL과 결합 시 jank 발생.
2. **Pinned scroll-trap은 모바일에서 잘못된 interaction primitive.** GSAP pin의 `position:fixed` + pin-spacer DOM 래퍼는 React hydration과 충돌하고, iOS의 hit-testing 비동기화 문제를 야기.
3. **NNGroup 연구:** scroll hijacking은 모바일에서 특히 UX 저해. 하지만 thesis는 핵심 스토리텔링이므로 "한 페이지씩 넘기는 경험" 자체는 유지해야 함.
4. **해결:** 데스크톱 코드 무변경 + 모바일은 body scroll lock + Swiper vertical fade로 동일한 "스크롤하면 멈추고 페이지 전환" 경험을 구현하되, GSAP pin 없이.

### 시도했던 접근들과 결과

| 커밋 | 접근 | 결과 |
|------|------|------|
| `018dd79` | Swiper horizontal + EffectFade | ✅ 빌드 통과, ❌ 수평 스와이프가 스토리텔링에 부자연스러움 |
| `6a1a73f` | ThesisSection parent/desktop 분리 | ✅ GSAP hydration 충돌 해결 |
| `f57f6e8` | Swiper vertical + manual edge exit | ✅ 수직 UX, ❌ 페이지 스크롤이 Thesis를 관통 |
| `22559bb` | IO + body scroll lock + Swiper vertical | ⏳ 실기기 테스트 필요 |

### Swiper releaseOnEdges iOS 버그

- Swiper #6691: vertical slider에서 마지막 슬라이드 도달 후 스크롤이 릴리즈되지 않음 (iOS)
- Swiper #7923: 2025년 3월 보고, iOS 18.3.1, Swiper 11.2.5에서 재현
- **해결:** releaseOnEdges에 의존하지 않고, 직접 touchStart/touchEnd delta로 edge exit 감지

---

## 커밋 히스토리 (thesis scroll 관련, 시간순)

| 커밋 | 설명 | 결과 |
|------|------|------|
| `a3714a9` | wheelSpeed:-1 + callback swap으로 iOS touch 방향 수정 | 방향 정상화 |
| `721296c` | always-on Observer + sectionActiveRef gate + 수동 touch/wheel 리스너 | 조건부 preventDefault 작동, 하지만 momentum 관통 |
| `447c95b` | touchstart preventDefault 추가 (compositor 시작 방지) | 부분 개선 |
| `b68ba61` | 전역 normalizeScroll(true) 도입 | iOS momentum 해결 ✅, header 깨짐 |
| `20b362e` | normalizeScroll intro-lock defer | intro-lock 충돌 해결 |
| `f6dab2c` | anticipatePin:1, cooldown 400ms, refresh(true) | overshoot/stutter 개선 |
| `ffff820` | normalizeScroll 제거, Two-Observer 패턴 | jank 해결 ✅, desktop freeze 발생 ❌ |
| `7152bef` | Two-Observer 개선 (onChangeY 제거, cooldown 증가) | 부분 개선 |
| `d3a0e7c` | Single Observer + disable/enable flush | freeze 해결 ✅, mobile touch leak ❌ |
| `18e889e` | always-on Observer + exitingRef + time debounce + thesis-touch-lock | touch leak 해결 ✅, pin 밖 차단 ❌ |
| `1dd6f11` | enable/disable lifecycle (onComplete에서 안 함) + safety timeout 복구 | pin 밖 차단 해결 ✅, iOS momentum 미해결 |
| `d15407a` | scoped normalizeScroll toggle + rAF 제거 | 새 버그 발생 (페이지 스킵) ❌ |
| `27fb73d` | normalizeScroll 제거 + 수동 touchstart preventDefault | iOS momentum 미해결 |
| `5624ab5` | module-level normalizeScroll(true) + intro-lock defer | **iOS momentum 해결 ✅, jank 부작용** |
| `b98377e` | momentum config (0.3초 cap) | 더 심각한 문제 ❌ |
| `5e78c2f` | momentum config revert | normalizeScroll(true) 기본 — Phase 1 마지막 상태 |
| `018dd79` | **모바일 분리: Swiper horizontal + EffectFade** | 수평 UX 부자연스러움 |
| `6a1a73f` | **ThesisSection parent/desktop 분리** (hydration fix) | ✅ GSAP DOM 충돌 해결 |
| `f57f6e8` | **Swiper vertical + manual edge exit** | ❌ 페이지 스크롤 관통 |
| `22559bb` | **IO + body scroll lock + Swiper vertical** | ⏳ 실기기 테스트 필요 |

---

## 리서치 소스 요약 (50+개)

### iOS Safari 스크롤 메커니즘
- iOS Safari momentum scroll은 compositor thread(UIScrollView)에서 실행, JS 개입 불가
- `touchstart` preventDefault로 momentum 시작을 차단할 수 있으나, 이미 시작된 momentum은 중단 불가
- iOS 15+에서 touchmove preventDefault 동작이 불안정, `touch-action: none` CSS 권장
- `overscroll-behavior: none`을 iOS Safari가 무시함 (WebKit #176454)
- `overflow: hidden`이 body에서 iOS 16.3+부터 정상 동작 (이전 버전은 깨짐)

### GSAP + iOS
- normalizeScroll은 실험적(experimental) 기능, 매 2번째 touchmove를 건너뛰는 내부 로직
- ScrollTrigger pin이 iOS에서 jitter/jumpy 현상 빈번 (position:fixed + compositor 충돌)
- GSAP 포럼에서 모바일 pin 사용 시 가장 많이 추천되는 패턴: 데스크톱/모바일 완전 분리

### Swiper.js
- `releaseOnEdges`: iOS에서 깨짐 (#6691, #7923, 2025년 3월 미해결)
- `touchReleaseOnEdges`: v9 이후 동작 안 함 (#6381)
- vertical + fade 조합은 지원되지만, 페이지 스크롤과의 공존이 어려움

### UX 리서치
- NNGroup: scroll hijacking은 모바일에서 control, freedom, discoverability 모두 위협
- 하지만 "한 페이지씩 넘기는" 패턴 자체는 스토리텔링에 효과적 (scrolljack과는 구분)
- 모바일에서 "adaptive complexity" (데스크톱과 다른 구현)가 업계 표준

### CSS scroll-snap
- WebKit #243582: 빠른 flick 시 끝까지 날아감 (미해결)
- mandatory vs proximity: proximity가 더 안전하지만 fullpage에는 부적합

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/components/home/ThesisSection.tsx` | Parent (디바이스 감지 + 라우팅) + ThesisSectionDesktop (GSAP pin) |
| `src/components/home/ThesisSectionMobile.tsx` | 모바일 전용: Swiper vertical + body scroll lock |
| `src/components/home/thesisData.tsx` | 공유 데이터: THESIS_STATES, InlineAscii, MobileAscii |
| `src/components/home/ThesisGraph.tsx` | id="thesis-graph" (exit scrollIntoView target) |
| `src/app/globals.css` | thesis-touch-lock, pin-spacer 배경색 |
| `src/hooks/useScrollReveal.ts` | normalizeScroll 관련 pollRef fallback |

---

## 다음 단계

1. **iPhone 실기기에서 `22559bb` 테스트** — body scroll lock이 iOS Safari에서 정상 동작하는지
2. **검증 항목:** Hero → Thesis 진입 시 스크롤 멈춤, 7페이지 수직 전환, edge exit, re-entry
3. **실패 시 대안:** Approach B (GSAP pin 유지 + no normalizeScroll + touch-action:none) 또는 Approach C (순수 JS touchmove preventDefault + CSS transition)
