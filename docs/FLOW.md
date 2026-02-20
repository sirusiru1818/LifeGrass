# LifeGrass — 실행·기능 흐름 정리

## 1. 전체 구조

```
LifeGrass/
├── index.html      # UI 구조 (헤더, 그리드, 일기, 추천, 모달)
├── styles.css      # 레이아웃·테마·반응형
├── app.js          # 로직 전부 (IIFE, DOM + localStorage)
├── .env            # 환경 변수 (git 제외, Azure OpenAI·Storage 등)
└── docs/
    └── FLOW.md     # 본 문서
```

- **프론트만** 동작 (빌드 없음, `index.html` 열면 실행).
- **데이터**는 브라우저 `localStorage`에만 저장 (서버 없음).

---

## 2. 실행 흐름 (페이지 로드 → 초기 화면)

```
1. HTML 로드
   └── <script src="app.js"></script> 실행

2. app.js IIFE 실행
   └── document.readyState 확인
       ├── "loading" 이면 → DOMContentLoaded 후 init()
       └── 아니면 → 바로 init()

3. init()
   ├── getBirthYear()           → localStorage 또는 input에서 태어난 해
   ├── birthYear input 값 채움
   ├── renderGrid(birthYear)    → 인생 잔디 그리드 그림
   ├── updateWeekLabel(birthYear) → "Week N, YYYY" 표시
   ├── loadJournalForCurrentWeek(birthYear) → 이번 주 일기/키워드 채움
   └── 이벤트 등록
       ├── Apply 버튼 → applyBirthYear
       ├── Plant 버튼 → plant
       ├── 모달 닫기(X, 배경 클릭) → closeWeekModal
       └── keydown Escape → closeWeekModal
```

즉, **한 번의 init()**으로 그리드·이번 주 라벨·이번 주 일기 폼이 채워지고, 이후에는 사용자 액션(Apply, Plant, 칸 클릭)으로만 동작합니다.

---

## 3. 데이터 저장 (localStorage)

| 키 | 의미 | 값 형식 |
|----|------|--------|
| `lifegrass_birthYear` | 태어난 해 | 문자열 숫자 `"1995"` |
| `lifegrass_filledWeeks` | 일기 쓴 주 목록 | JSON 배열 `["2025-7","2025-8"]` → Set처럼 사용 |
| `lifegrass_journal` | 주별 일기 | `{ "2025-7": { keywords, text }, ... }` |

- **주 식별**: `year-week` (연도-해당 연도 내 주차 0~51).
- **주차 계산**: 1월 1일부터 경과 일수 ÷ 7, 최대 51 (`getWeekOfYear`).

---

## 4. 기능별 흐름

### 4.1 태어난 해 적용 (Apply)

```
사용자: Birth year 입력 후 [Apply] 클릭
  → applyBirthYear()
     ├── input 값 파싱, 1920~2020 검사
     ├── setBirthYear(year)        → localStorage 저장
     ├── renderGrid(birthYear)     → 그리드 다시 그림
     ├── updateWeekLabel(birthYear)
     └── loadJournalForCurrentWeek(birthYear)
```

- 그리드 행 수는 **4000주 고정** (77년 × 52주), 행 레이블만 `birthYear`부터 1995, 1996, … 로 바뀝니다.

### 4.2 인생 잔디 그리드 그리기 (renderGrid)

```
renderGrid(birthYear)
  ├── getCurrentWeekIndex(birthYear)  → 오늘까지의 “주 인덱스” (0~4000대)
  ├── getFilledSet()                  → 일기 쓴 주 set
  ├── totalYears = ceil(4000/52) = 77
  │
  ├── [헤더] monthLabels에 Jan~Dec 12개 span (grid 52칸에 4/5 span 배분)
  │
  └── [본문] 77개 year-row
        각 row:
          ├── year-label (birthYear + year)
          └── year-cells (52개 cell)
                각 cell: index = year*52 + week
                ├── index < currentIndex  → .past, filled면 .filled
                ├── index === currentIndex → .current (깜빡임)
                └── index > currentIndex  → 기본(빈 칸)
                └── click → openWeekModal(birthYear, index)
```

- **칸 하나 = 1주**. 과거/현재/미래·기록 여부는 위 클래스로 구분됩니다.

### 4.3 이번 주 일기 + 심기 (Plant)

```
사용자: 키워드·일기 입력 후 [Plant] 클릭
  → plant()
     ├── 현재 (year, week) 계산
     ├── setJournal(year, week, { keywords, text })  → localStorage
     ├── getFilledSet() → add(key) → setFilledSet()  → “기록한 주”에 추가
     ├── renderGrid(birthYear)                       → 해당 주 칸이 .filled로
     └── recommendBox에 “AI recommendations coming soon…” 메시지
```

- **저장 단위**: `year-week` 한 주. 같은 주를 다시 Plant하면 덮어씁니다.

### 4.4 칸 클릭 → 주별 상세 모달

```
사용자: 그리드 칸 클릭
  → openWeekModal(birthYear, index)
     ├── getYearAndWeekFromIndex(birthYear, index)  → (year, week)
     ├── getJournal(year, week)                     → 해당 주 일기/키워드
     ├── 모달 DOM에 채움
     │     ├── modalTitle: "Week {week+1}, {year}"
     │     ├── modalKeywords, modalJournal
     │     └── modalInsight ← generateAIInsight(journalData)
     └── weekModal.style.display = "flex"
```

- **AI 한줄평**: `generateAIInsight()`는 **키워드/일기 텍스트 기반 규칙** (learn, work, friend, rest, challenge, 글자 수 등). 실제 API는 아직 미연동.

### 4.5 모달 닫기

- **X 버튼**, **배경(overlay) 클릭**, **ESC 키** → `closeWeekModal()` → `weekModal.style.display = "none"`.

---

## 5. 핵심 함수 요약

| 함수 | 역할 |
|------|------|
| `getBirthYear()` / `setBirthYear()` | 태어난 해 읽기/쓰기 |
| `getWeekOfYear(date)` | 그 해의 주차 0~51 |
| `getCurrentWeekIndex(birthYear)` | 태어난 해 기준 “현재까지 몇 주째” 인덱스 |
| `getFilledSet()` / `setFilledSet()` | 일기 쓴 주 set 읽기/쓰기 |
| `getJournal(year, week)` / `setJournal(...)` | 주별 일기/키워드 읽기/쓰기 |
| `weekKeyFromIndex(birthYear, index)` | 인덱스 → `"year-week"` 문자열 |
| `getYearAndWeekFromIndex(birthYear, index)` | 인덱스 → `{ year, week }` |
| `renderGrid(birthYear)` | 77×52 그리드 + 월 레이블 + 칸 클릭 이벤트 |
| `updateWeekLabel(birthYear)` | “Week N, YYYY” 텍스트 갱신 |
| `loadJournalForCurrentWeek(birthYear)` | 이번 주 일기/키워드를 폼에 채움 |
| `applyBirthYear()` | Apply 클릭 시 birthYear 반영 및 그리드/라벨/일기 폼 갱신 |
| `plant()` | 이번 주 일기 저장 + filled 반영 + 그리드 다시 그림 |
| `generateAIInsight(journalData)` | 일기/키워드 기반 한줄평 문자열 반환 |
| `openWeekModal(birthYear, index)` | 해당 주 일기·AI 한줄평으로 모달 열기 |
| `closeWeekModal()` | 모달 숨김 |

---

## 6. UI ↔ 데이터 흐름 요약

- **입력**: Birth year (Apply), 이번 주 키워드·일기 (Plant), 그리드 칸 클릭.
- **출력**: 그리드 색(과거/현재/기록), “Week N, YYYY”, 주별 모달(일기 + AI 한줄평), “Next week’s recommendations” 문구.
- **영구 저장**: `lifegrass_birthYear`, `lifegrass_filledWeeks`, `lifegrass_journal` 세 개만 사용.

이 문서는 전체 코드 분석을 바탕으로 실행 흐름과 기능 흐름을 정리한 것입니다.
