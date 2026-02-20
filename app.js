(function () {
  const STORAGE_PREFIX = "lifegrass_";
  const BIRTH_YEAR_KEY = STORAGE_PREFIX + "birthYear";
  const FILLED_KEY = STORAGE_PREFIX + "filledWeeks"; // Set of "year-week" e.g. "1995-32"
  const JOURNAL_KEY = STORAGE_PREFIX + "journal";    // { "1995-32": { keywords, text } }

  const WEEKS_PER_YEAR = 52;

  function getBirthYear() {
    const saved = localStorage.getItem(BIRTH_YEAR_KEY);
    if (saved) return parseInt(saved, 10);
    return parseInt(document.getElementById("birthYear").value, 10) || 1995;
  }

  function setBirthYear(year) {
    localStorage.setItem(BIRTH_YEAR_KEY, String(year));
  }

  function getWeekOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date - start;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.min(Math.floor(diff / oneWeek), 51);
  }

  function getCurrentWeekIndex(birthYear) {
    const now = new Date();
    const yearIndex = now.getFullYear() - birthYear;
    const weekInYear = getWeekOfYear(now);
    return yearIndex * WEEKS_PER_YEAR + weekInYear;
  }

  function getTotalWeeksShown(birthYear) {
    const now = new Date();
    const years = Math.max(1, now.getFullYear() - birthYear + 5);
    return years * WEEKS_PER_YEAR;
  }

  function getFilledSet() {
    try {
      const raw = localStorage.getItem(FILLED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (_) {
      return new Set();
    }
  }

  function setFilledSet(set) {
    localStorage.setItem(FILLED_KEY, JSON.stringify([...set]));
  }

  function getJournal(year, week) {
    const key = `${year}-${week}`;
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data[key] || null;
    } catch (_) {
      return null;
    }
  }

  function setJournal(year, week, data) {
    const key = `${year}-${week}`;
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      obj[key] = data;
      localStorage.setItem(JOURNAL_KEY, JSON.stringify(obj));
    } catch (_) {}
  }

  function weekKeyFromIndex(birthYear, index) {
    const year = birthYear + Math.floor(index / WEEKS_PER_YEAR);
    const week = index % WEEKS_PER_YEAR;
    return `${year}-${week}`;
  }

  const TOTAL_WEEKS = 4000;

  function renderGrid(birthYear) {
    const currentIndex = getCurrentWeekIndex(birthYear);
    const filled = getFilledSet();
    const totalYears = Math.ceil(TOTAL_WEEKS / WEEKS_PER_YEAR); // 77년 = 4004주

    // 위쪽 가로 축: 영어 월 (Jan, Feb, Mar, …)
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthLabelsEl = document.getElementById("monthLabels");
    if (monthLabelsEl) {
      monthLabelsEl.innerHTML = "";
      MONTHS.forEach(function (m, idx) {
        const span = document.createElement("span");
        span.textContent = m;
        if (idx >= 8) span.classList.add("month-span-5");
        monthLabelsEl.appendChild(span);
      });
    }

    // 연도별 행: 년도 (1995, 1996, …)
    const bodyEl = document.getElementById("calendarBody");
    if (!bodyEl) return;
    bodyEl.innerHTML = "";

    for (let year = 0; year < totalYears; year++) {
      const row = document.createElement("div");
      row.className = "year-row";

      const yearLabel = document.createElement("div");
      yearLabel.className = "year-label";
      yearLabel.textContent = String(birthYear + year);
      row.appendChild(yearLabel);

      const cellsWrap = document.createElement("div");
      cellsWrap.className = "year-cells";

      for (let week = 0; week < WEEKS_PER_YEAR; week++) {
        const i = year * WEEKS_PER_YEAR + week;
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.index = i;

        if (i < currentIndex) {
          cell.classList.add("past");
          const key = weekKeyFromIndex(birthYear, i);
          if (filled.has(key)) cell.classList.add("filled");
        } else if (i === currentIndex) {
          cell.classList.add("current");
        }

        cellsWrap.appendChild(cell);
        
        // 클릭 이벤트 추가
        cell.addEventListener("click", function() {
          openWeekModal(birthYear, i);
        });
      }

      row.appendChild(cellsWrap);
      bodyEl.appendChild(row);
    }
  }

  function getYearAndWeekFromIndex(birthYear, index) {
    const year = birthYear + Math.floor(index / WEEKS_PER_YEAR);
    const week = index % WEEKS_PER_YEAR;
    return { year, week };
  }

  function generateAIInsight(journalData) {
    if (!journalData || (!journalData.text && !journalData.keywords)) {
      return "No journal entry for this week.";
    }
    
    const text = journalData.text || "";
    const keywords = journalData.keywords || "";
    
    // 간단한 키워드 기반 분석 (실제로는 AI API 호출)
    const lowerText = text.toLowerCase();
    const lowerKeywords = keywords.toLowerCase();
    
    if (lowerText.includes("learn") || lowerText.includes("study") || lowerKeywords.includes("learn")) {
      return "A week focused on growth and learning. Keep nurturing your curiosity!";
    } else if (lowerText.includes("work") || lowerText.includes("project") || lowerKeywords.includes("work")) {
      return "Productive week with meaningful progress. Your dedication shows.";
    } else if (lowerText.includes("friend") || lowerText.includes("family") || lowerKeywords.includes("friend")) {
      return "A week enriched by connections. Relationships are life's greatest treasures.";
    } else if (lowerText.includes("rest") || lowerText.includes("relax") || lowerKeywords.includes("rest")) {
      return "A week of rest and recovery. Taking care of yourself is important.";
    } else if (lowerText.includes("challenge") || lowerText.includes("difficult") || lowerKeywords.includes("challenge")) {
      return "A challenging week that built resilience. You're stronger than you think.";
    } else if (text.length > 100) {
      return "A reflective week with deep thoughts. Your introspection is valuable.";
    } else if (keywords) {
      return `A week marked by: ${keywords}. Each moment shapes your journey.`;
    } else {
      return "A week captured in your memory. Every week adds to your story.";
    }
  }

  function openWeekModal(birthYear, index) {
    const { year, week } = getYearAndWeekFromIndex(birthYear, index);
    const journalData = getJournal(year, week);
    
    const modal = document.getElementById("weekModal");
    const titleEl = document.getElementById("modalTitle");
    const keywordsEl = document.getElementById("modalKeywords");
    const journalEl = document.getElementById("modalJournal");
    const insightEl = document.getElementById("modalInsight");
    
    if (!modal || !titleEl || !keywordsEl || !journalEl || !insightEl) return;
    
    // 제목 설정
    titleEl.textContent = `Week ${week + 1}, ${year}`;
    
    // 일기 내용
    if (journalData) {
      keywordsEl.textContent = journalData.keywords || "No keywords";
      journalEl.textContent = journalData.text || "No journal entry.";
    } else {
      keywordsEl.textContent = "No keywords";
      journalEl.textContent = "No journal entry for this week.";
    }
    
    // AI 분석
    const insight = generateAIInsight(journalData);
    insightEl.textContent = insight;
    
    // 모달 표시
    modal.style.display = "flex";
  }

  function closeWeekModal() {
    const modal = document.getElementById("weekModal");
    if (modal) modal.style.display = "none";
  }

  function updateWeekLabel(birthYear) {
    const now = new Date();
    const week = getWeekOfYear(now);
    const year = now.getFullYear();
    const label = document.getElementById("weekLabel");
    if (label) label.textContent = `Week ${week + 1}, ${year}`;
  }

  function loadJournalForCurrentWeek(birthYear) {
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekOfYear(now);
    const data = getJournal(year, week);

    const kw = document.getElementById("weekKeywords");
    const ta = document.getElementById("weekJournal");
    if (kw) kw.value = (data && data.keywords) || "";
    if (ta) ta.value = (data && data.text) || "";
  }

  function applyBirthYear() {
    const input = document.getElementById("birthYear");
    const year = parseInt(input.value, 10);
    if (isNaN(year) || year < 1920 || year > 2020) return;
    setBirthYear(year);
    const birth = getBirthYear();
    input.value = birth;
    renderGrid(birth);
    updateWeekLabel(birth);
    loadJournalForCurrentWeek(birth);
  }

  function plant() {
    const birthYear = getBirthYear();
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekOfYear(now);
    const key = `${year}-${week}`;

    const keywords = (document.getElementById("weekKeywords") && document.getElementById("weekKeywords").value) || "";
    const text = (document.getElementById("weekJournal") && document.getElementById("weekJournal").value) || "";

    setJournal(year, week, { keywords, text });

    const filled = getFilledSet();
    filled.add(key);
    setFilledSet(filled);

    renderGrid(birthYear);

    const box = document.getElementById("recommendBox");
    if (box) {
      box.innerHTML = "<p class=\"placeholder\">AI recommendations coming soon. Thanks for journaling 🌱</p>";
    }
  }

  function init() {
    const birthYear = getBirthYear();
    const input = document.getElementById("birthYear");
    if (input) input.value = birthYear;

    renderGrid(birthYear);
    updateWeekLabel(birthYear);
    loadJournalForCurrentWeek(birthYear);

    const applyBtn = document.getElementById("applyBirth");
    if (applyBtn) applyBtn.addEventListener("click", applyBirthYear);

    const plantBtn = document.getElementById("btnPlant");
    if (plantBtn) plantBtn.addEventListener("click", plant);

    // 모달 닫기 이벤트
    const modalClose = document.getElementById("modalClose");
    if (modalClose) modalClose.addEventListener("click", closeWeekModal);

    const modalOverlay = document.getElementById("weekModal");
    if (modalOverlay) {
      modalOverlay.addEventListener("click", function(e) {
        if (e.target === modalOverlay) closeWeekModal();
      });
    }

    // ESC 키로 모달 닫기
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        const modal = document.getElementById("weekModal");
        if (modal && modal.style.display !== "none") {
          closeWeekModal();
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
