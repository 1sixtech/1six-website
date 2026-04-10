# ThesisSection Scroll — 문제 히스토리 및 현재 상태

## 현재 코드 상태 (`5e78c2f`)

ThesisSection은 GSAP ScrollTrigger `pin: true`로 전체 화면 고정 + Observer로 discrete page-by-page 전환 (7페이지, crossfade). 현재 아키텍처:

- **Observer**: `target: section`, `preventDefault: false`, enable/disable lifecycle (onEnter에서 enable, onLeave에서 disable, onComplete에서는 disable 안 함)
- **수동 touch/wheel 리스너**: section element에 `{ passive: false }`로 등록, `sectionActiveRef`가 true일 때만 `e.preventDefault()` 호출 — 조건부 native scroll 차단
- **iOS momentum 대응**: module-level `ScrollTrigger.normalizeScroll(true)` (touch-only 디바이스에서만, intro-lock 해제 후 defer 활성화)
- **momentum debounce**: `COOLDOWN_MS = 400` time-based debounce + `animatingRef` gate
- **bounce-back 방지**: `exitingRef` (이벤트 기반 해제)
- **경계 탈출**: 즉시 `scrollTo(st.end + 50)` + `ScrollTrigger.update()` (rAF 없음)
- **시각적 보호**: `overflow-hidden z-10` on section, `.pin-spacer` 배경색, `thesis-touch-lock` CSS

---

## 해결된 문제들

### 1. 데스크톱 wheel freeze (치명적)
- **증상**: 데스크톱에서 thesis 진입 후 wheel 스크롤로 페이지 전환이 전혀 안 됨. 키보드(ArrowDown)는 작동.
- **원인**: Two-Observer 패턴(`ffff820`)에서 viewport-level `preventScroll` Observer가 wheel 이벤트를 먼저 소비하여, section-level `intentObserver`에 이벤트가 도달하지 못함.
- **해결**: `d3a0e7c`에서 Two-Observer를 Single Observer로 통합하여 이벤트 채널 충돌 제거.
- **현재 상태**: ✅ 해결됨

### 2. 여러 페이지 동시 스킵 (데스크톱 + 모바일)
- **증상**: 강한 trackpad fling이나 빠른 swipe 시 thesis 페이지가 2-3개씩 건너뜀.
- **원인**: `onComplete`에서 Observer disable/re-enable 시 150ms cooldown이 trackpad momentum(~500ms-1.5s)보다 짧아, 잔여 momentum 이벤트가 다음 전환을 즉시 트리거.
- **해결**: `1dd6f11`에서 onComplete에서 Observer를 disable하지 않도록 변경 (mobile touch leak 방지). `COOLDOWN_MS = 400` time-based debounce로 momentum 흡수.
- **현재 상태**: ✅ 해결됨

### 3. Hero ↔ Thesis 중간에서 스크롤 멈춤
- **증상**: Hero에서 thesis로 스크롤하다 중간에 멈추면, native scroll이 차단되어 더 이상 이동 불가.
- **원인**: always-on Observer(`18e889e`)가 `preventDefault: true`로 pin 범위 밖에서도 wheel/touch 이벤트를 차단.
- **해결**: `1dd6f11`에서 Observer를 onEnter/onLeave lifecycle으로 전환 (pin 시에만 enable). 수동 touch/wheel 리스너가 `sectionActiveRef` 조건부로 대체.
- **현재 상태**: ✅ 해결됨

### 4. 데스크톱 마지막 페이지에서 탈출 불가
- **증상**: thesis-07에서 아래로 스크롤해도 ThesisGraph로 넘어가지 않음.
- **원인**: (a) `+1px` offset이 pin-spacer reflow에 흡수되어 `onLeave` 미발동, (b) boundary exit에서 `sectionActiveRef = false` 설정 후 safety timeout이 이를 복구하지 않아 영구 데드락.
- **해결**: `1dd6f11`에서 offset을 `+50px`로 증가 + safety timeout에서 `sectionActiveRef` + Observer 복구 로직 추가.
- **현재 상태**: ✅ 해결됨

### 5. 경계 탈출 시 bounce-back
- **증상**: thesis 마지막에서 탈출 후 macOS/iOS elastic bounce로 다시 thesis로 끌려들어감.
- **원인**: `onEnterBack`에 bounce-back 보호 없음 (`justExitedRef` 제거 후).
- **해결**: `18e889e`에서 `exitingRef` 도입 (이벤트 기반 — `onLeave` fire 시 해제, safety timeout에서도 해제하여 데드락 방지).
- **현재 상태**: ✅ 해결됨

### 6. 경계 탈출 시 "한 번 먹히는" 느낌
- **증상**: 마지막/첫 페이지에서 탈출 시 swipe가 한 번 소비되는 듯한 딜레이.
- **원인**: `requestAnimationFrame`으로 `scrollTo`를 1프레임 defer하여 16ms 공백 발생.
- **해결**: `d15407a`에서 rAF 제거, `scrollTo` 즉시 실행. `Observer.disable()`은 동기적이므로 defer 불필요.
- **현재 상태**: ✅ 해결됨

### 7. 하단 레이어 bleed-through
- **증상**: thesis 보는 중 하단에 ThesisGraph 디자인이 비쳐 보임.
- **원인**: section에 `overflow: hidden`과 `z-index` 미설정, pin-spacer에 배경색 없음.
- **해결**: `d3a0e7c`에서 section에 `overflow-hidden z-10`, globals.css에 `.pin-spacer { background-color }` 추가.
- **현재 상태**: ✅ 해결됨

### 8. iOS 첫 swipe 무시 (터치해야 작동 시작)
- **증상**: iPhone에서 Hero→Thesis 스크롤 후, 첫 swipe가 무시되고 한 번 터치해야 그 다음부터 작동.
- **원인**: iOS UIScrollView가 compositor thread에서 momentum scroll을 실행. `touchend` 후 momentum은 JS 개입 불가. 첫 touch는 iOS가 momentum 정지용으로 소비 (WebKit #174300). `position:fixed` hit-testing도 scroll 후 비동기화.
- **해결**: `5624ab5`에서 module-level `ScrollTrigger.normalizeScroll(true)` 활성화 (touch-only 디바이스). scroll 시작 전부터 JS가 scroll을 관리하여 compositor momentum이 존재하지 않도록 함. intro-lock defer 패턴 적용 (`20b362e` 참고).
- **현재 상태**: ✅ 해결됨 — 단, **전역 scroll jank 부작용 존재** (아래 참조)

---

## 현재 남아있는 문제

### A. 전역 scroll jank (iOS)
- **증상**: `normalizeScroll(true)` 활성 상태에서 모든 scroll이 JS main thread를 경유하여, 특히 WebGL 활성 구간에서 스크롤 끊김/버벅임.
- **원인**: `normalizeScroll`이 native compositor scroll을 JS로 이관하는 것이 설계 의도. main thread 부하(WebGL, GC, layout)가 있으면 scroll 프레임이 누락됨.
- **이전 시도**: `b98377e`에서 momentum config object로 synthetic deceleration을 0.3초로 제한 시도 → 더 심각한 문제 발생하여 `5e78c2f`에서 revert.
- **상태**: ❌ 미해결 — `normalizeScroll(true)` 기본 config 사용 중

### B. 추가로 사용자가 언급한 "몇 개 문제"
- 구체적 증상 미확인 — iPhone 실기기 테스트에서 발견. jank 외에 추가 문제가 있을 수 있음.
- **상태**: ❌ 미확인 — 실기기 테스트 필요

---

## 핵심 아키텍처 제약

### iOS momentum vs normalizeScroll 딜레마

이 프로젝트의 가장 근본적인 tension:

| | normalizeScroll OFF | normalizeScroll ON |
|---|---|---|
| iOS 첫 swipe | ❌ momentum이 thesis 관통, 첫 touch가 먹힘 | ✅ JS가 scroll 관리, momentum 없음 |
| scroll 성능 | ✅ native compositor 60fps | ❌ JS main thread 경유, jank 가능 |

**시도된 중간 지점들과 실패 이유**:
- `normalizeScroll` scoped toggle (onEnter/onLeave): GSAP 내부 Observer 충돌, pin 계산 교란 → 페이지 스킵
- `normalizeScroll` momentum config: 더 심각한 문제 발생 (원인 미확인)
- section touchstart preventDefault: Hero에서 시작된 gesture의 touchstart를 잡을 수 없음
- CSS touch-action: none: 진행 중인 momentum에 영향 없음

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
| `5e78c2f` | momentum config revert | 현재 상태 — normalizeScroll(true) 기본 |

---

## 다음 단계 제안

1. **iPhone 실기기에서 현재 상태(`5e78c2f`)의 구체적 문제 목록 확인** — jank 외에 기능적 문제가 있는지
2. **jank 감소 방향 탐색**:
   - WebGL context를 thesis pin 진입 전에 미리 dispose하여 main thread 부하 감소
   - `normalizeScroll`의 내부 Observer 설정 조정 (momentum 이외의 config)
   - 또는: `normalizeScroll` 대신 iOS 전용의 더 가벼운 scroll interception 방법 검토
3. **핵심 파일**: `src/components/home/ThesisSection.tsx` (전체), `src/app/globals.css` (thesis-touch-lock, pin-spacer)
