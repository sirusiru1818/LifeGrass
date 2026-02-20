(function () {
  const STORAGE_PREFIX = "lifegrass_";
  const WEEKS_PER_YEAR = 52;
  const TOTAL_WEEKS = 4000;

  function getUsername() {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z0-9_-]+)$/);
    return match ? match[1].toLowerCase() : null;
  }

  const USERNAME = getUsername();
  let AUTH_TOKEN = null;

  function getStorageKey(key) {
    return USERNAME ? `${STORAGE_PREFIX}${USERNAME}_${key}` : `${STORAGE_PREFIX}${key}`;
  }

  function getTokenKey() {
    return USERNAME ? `${STORAGE_PREFIX}${USERNAME}_token` : null;
  }

  function saveToken(token) {
    const key = getTokenKey();
    if (key && token) {
      localStorage.setItem(key, token);
      AUTH_TOKEN = token;
    }
  }

  function loadToken() {
    const key = getTokenKey();
    if (key) {
      AUTH_TOKEN = localStorage.getItem(key);
    }
    return AUTH_TOKEN;
  }

  function clearToken() {
    const key = getTokenKey();
    if (key) {
      localStorage.removeItem(key);
    }
    AUTH_TOKEN = null;
  }

  function getBirthYear() {
    const saved = localStorage.getItem(getStorageKey("birthYear"));
    if (saved) return parseInt(saved, 10);
    return parseInt(document.getElementById("birthYear").value, 10) || 1995;
  }

  function setBirthYear(year) {
    localStorage.setItem(getStorageKey("birthYear"), String(year));
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

  function getFilledSet() {
    try {
      const raw = localStorage.getItem(getStorageKey("filledWeeks"));
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (_) {
      return new Set();
    }
  }

  function setFilledSet(set) {
    localStorage.setItem(getStorageKey("filledWeeks"), JSON.stringify([...set]));
  }

  function getJournal(year, week) {
    const key = `${year}-${week}`;
    try {
      const raw = localStorage.getItem(getStorageKey("journal"));
      const data = raw ? JSON.parse(raw) : {};
      return data[key] || null;
    } catch (_) {
      return null;
    }
  }

  function setJournal(year, week, data) {
    const key = `${year}-${week}`;
    try {
      const raw = localStorage.getItem(getStorageKey("journal"));
      const obj = raw ? JSON.parse(raw) : {};
      obj[key] = data;
      localStorage.setItem(getStorageKey("journal"), JSON.stringify(obj));
    } catch (_) {}
  }

  function getFullState() {
    const birthYear = getBirthYear();
    const filled = getFilledSet();
    let journal = {};
    try {
      const raw = localStorage.getItem(getStorageKey("journal"));
      if (raw) journal = JSON.parse(raw);
    } catch (_) {}
    return {
      birthYear: birthYear,
      filledWeeks: Array.from(filled),
      journal: journal,
    };
  }

  function applyState(state) {
    if (state.birthYear != null) setBirthYear(state.birthYear);
    if (Array.isArray(state.filledWeeks)) setFilledSet(new Set(state.filledWeeks));
    if (state.journal && typeof state.journal === "object") {
      try {
        localStorage.setItem(getStorageKey("journal"), JSON.stringify(state.journal));
      } catch (_) {}
    }
  }

  function getApiUrl() {
    return USERNAME ? `/api/data/${USERNAME}` : "/api/data";
  }

  function authHeaders() {
    if (AUTH_TOKEN) {
      return { "Content-Type": "application/json", "Authorization": "Bearer " + AUTH_TOKEN };
    }
    return { "Content-Type": "application/json" };
  }

  function saveStateToServer() {
    if (!USERNAME || !AUTH_TOKEN) return;
    fetch(getApiUrl(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(getFullState()),
    }).catch(function () {});
  }

  function weekKeyFromIndex(birthYear, index) {
    const year = birthYear + Math.floor(index / WEEKS_PER_YEAR);
    const week = index % WEEKS_PER_YEAR;
    return `${year}-${week}`;
  }

  function renderGrid(birthYear) {
    const currentIndex = getCurrentWeekIndex(birthYear);
    const filled = getFilledSet();
    const totalYears = Math.ceil(TOTAL_WEEKS / WEEKS_PER_YEAR);

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

  async function generateAIComment(journalData, year, week) {
    if (!journalData || (!journalData.text && !journalData.keywords)) {
      return "No journal entry for this week.";
    }
    
    const text = journalData.text || "";
    const keywords = journalData.keywords || "";

    try {
      const res = await fetch("/api/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          keywords: keywords, 
          text: text,
          year: year,
          week: week + 1
        }),
      });
      
      if (!res.ok) {
        throw new Error("Failed to generate comment");
      }
      
      const data = await res.json();
      const comment = (data.comment || "").trim();
      
      if (comment) {
        // 여러 줄이면 첫 번째 줄만 사용
        return comment.split(/\n/)[0].trim();
      }
      
      // 폴백: 간단한 규칙 기반 댓글
      return generateFallbackComment(journalData);
    } catch (e) {
      return generateFallbackComment(journalData);
    }
  }

  function generateFallbackComment(journalData) {
    const text = journalData.text || "";
    const keywords = journalData.keywords || "";
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

  function isCurrentWeek(birthYear, index) {
    const currentIndex = getCurrentWeekIndex(birthYear);
    return index === currentIndex;
  }

  function openWeekModal(birthYear, index) {
    const { year, week } = getYearAndWeekFromIndex(birthYear, index);
    const journalData = getJournal(year, week);
    const isCurrent = isCurrentWeek(birthYear, index);
    
    const modal = document.getElementById("weekModal");
    const titleEl = document.getElementById("modalTitle");
    const keywordsEl = document.getElementById("modalKeywords");
    const journalEl = document.getElementById("modalJournal");
    const insightEl = document.getElementById("modalInsight");
    const writeSection = document.getElementById("modalWriteSection");
    const btnWrite = document.getElementById("btnWrite");
    const editSection = document.getElementById("modalEditSection");
    
    if (!modal || !titleEl || !keywordsEl || !journalEl || !insightEl) return;
    
    titleEl.textContent = `Week ${week + 1}, ${year}`;
    
    if (journalData) {
      keywordsEl.textContent = journalData.keywords || "No keywords";
      journalEl.textContent = journalData.text || "No journal entry.";
      // 저장된 AI Comment가 있으면 표시, 없으면 기본 메시지
      if (journalData.aiComment) {
        insightEl.textContent = journalData.aiComment;
      } else {
        insightEl.textContent = "No journal entry for this week.";
      }
    } else {
      keywordsEl.textContent = "No keywords";
      journalEl.textContent = "No journal entry for this week.";
      insightEl.textContent = "No journal entry for this week.";
    }
    
    // 오늘이 포함된 주인 경우 글쓰기 섹션 표시
    if (isCurrent) {
      writeSection.style.display = "block";
      btnWrite.style.display = "block";
    } else {
      writeSection.style.display = "none";
      btnWrite.style.display = "none";
    }
    
    // 편집 섹션은 기본적으로 숨김
    editSection.style.display = "none";
    
    // 모달을 먼저 표시
    modal.style.display = "flex";
  }

  function closeWeekModal() {
    const modal = document.getElementById("weekModal");
    if (modal) modal.style.display = "none";
    
    // 편집 섹션 초기화
    const editSection = document.getElementById("modalEditSection");
    if (editSection) editSection.style.display = "none";
  }


  function showPasswordCheckModal() {
    const modal = document.getElementById("passwordCheckModal");
    const input = document.getElementById("passwordCheckInput");
    const error = document.getElementById("passwordCheckError");
    
    if (!modal || !input || !error) return;
    
    input.value = "";
    error.textContent = "";
    modal.style.display = "flex";
    
    setTimeout(function() {
      input.focus();
    }, 100);
  }

  function hidePasswordCheckModal() {
    const modal = document.getElementById("passwordCheckModal");
    if (modal) modal.style.display = "none";
  }

  async function handlePasswordCheck() {
    const input = document.getElementById("passwordCheckInput");
    const error = document.getElementById("passwordCheckError");
    const btn = document.getElementById("btnPasswordCheck");
    
    if (!input || !error || !btn) return;
    
    const password = input.value;
    
    if (!password) {
      error.textContent = "Please enter your password";
      return;
    }
    
    btn.disabled = true;
    btn.textContent = "Checking...";
    
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: USERNAME, password: password }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Invalid password");
      }
      
      // 비밀번호 확인 성공 - 편집 섹션 표시
      hidePasswordCheckModal();
      showEditSection();
    } catch (e) {
      error.textContent = e.message;
      btn.disabled = false;
      btn.textContent = "Continue";
    }
  }

  function showEditSection() {
    const editSection = document.getElementById("modalEditSection");
    const modalKeywords = document.getElementById("modalWeekKeywords");
    const modalJournal = document.getElementById("modalWeekJournal");
    
    if (!editSection || !modalKeywords || !modalJournal) return;
    
    // 현재 주의 일기 데이터 로드
    const birthYear = getBirthYear();
    const currentIndex = getCurrentWeekIndex(birthYear);
    const { year, week } = getYearAndWeekFromIndex(birthYear, currentIndex);
    const journalData = getJournal(year, week);
    
    if (journalData) {
      modalKeywords.value = journalData.keywords || "";
      modalJournal.value = journalData.text || "";
    } else {
      modalKeywords.value = "";
      modalJournal.value = "";
    }
    
    editSection.style.display = "block";
    
    // 스크롤하여 편집 섹션으로 이동
    setTimeout(function() {
      editSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }

  async function handleModalPlant() {
    const birthYear = getBirthYear();
    const currentIndex = getCurrentWeekIndex(birthYear);
    const { year, week } = getYearAndWeekFromIndex(birthYear, currentIndex);
    const key = `${year}-${week}`;

    const keywords = (document.getElementById("modalWeekKeywords") && document.getElementById("modalWeekKeywords").value) || "";
    const text = (document.getElementById("modalWeekJournal") && document.getElementById("modalWeekJournal").value) || "";

    // 기존 journal 데이터 가져오기 (AI Comment 보존)
    const existingData = getJournal(year, week) || {};
    
    // AI Comment 생성 (Plant 버튼을 눌렀을 때만)
    const insightEl = document.getElementById("modalInsight");
    if (insightEl) {
      insightEl.textContent = "Generating AI comment...";
    }
    
    let aiComment = existingData.aiComment || ""; // 기존 코멘트가 있으면 유지
    if (keywords || text) {
      // 새로운 내용이 있으면 AI Comment 생성
      try {
        const newJournalData = { keywords, text };
        aiComment = await generateAIComment(newJournalData, year, week);
      } catch (e) {
        aiComment = generateFallbackComment({ keywords, text });
      }
    }
    
    // journal 데이터 저장 (keywords, text, aiComment 포함)
    setJournal(year, week, { keywords, text, aiComment });

    const filled = getFilledSet();
    filled.add(key);
    setFilledSet(filled);

    renderGrid(birthYear);
    saveStateToServer();

    // 모달 내용 업데이트
    const journalData = getJournal(year, week);
    const keywordsEl = document.getElementById("modalKeywords");
    const journalEl = document.getElementById("modalJournal");
    
    if (keywordsEl) keywordsEl.textContent = keywords || "No keywords";
    if (journalEl) journalEl.textContent = text || "No journal entry.";
    if (insightEl) {
      insightEl.textContent = aiComment || "No journal entry for this week.";
    }
    
    // 메인 페이지 추천 업데이트
    loadRecommendationsForMainPage(journalData);
    
    // 편집 섹션 숨김
    const editSection = document.getElementById("modalEditSection");
    if (editSection) editSection.style.display = "none";
  }

  function updateUserDisplay() {
    const userDisplay = document.getElementById("userDisplay");
    if (userDisplay && USERNAME) {
      userDisplay.textContent = `@${USERNAME}`;
    }
  }

  function applyBirthYear() {
    const input = document.getElementById("birthYear");
    const year = parseInt(input.value, 10);
    if (isNaN(year) || year < 1920 || year > 2020) return;
    setBirthYear(year);
    const birth = getBirthYear();
    input.value = birth;
    renderGrid(birth);
    saveStateToServer();
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function loadRecommendationsForMainPage(journalData) {
    const box = document.getElementById("recommendBox");
    if (!box) return;
    
    if (!journalData || (!journalData.text && !journalData.keywords)) {
      box.innerHTML = "<p class=\"placeholder\">Write your journal and plant to get AI challenge recommendations.</p>";
      return;
    }
    
    const keywords = journalData.keywords || "";
    const text = journalData.text || "";
    
    box.innerHTML = "<p class=\"placeholder\">Generating recommendations…</p>";
    
    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: keywords, text: text }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.message || data.error || "Request failed");
          return data;
        });
      })
      .then(function (data) {
        const rec = (data.recommendation || "").trim();
        if (rec) {
          // 한줄로만 표시 (첫 번째 줄만 사용)
          const firstLine = rec.split(/\n/)[0].trim();
          box.innerHTML = "<p class=\"recommend-line\">" + escapeHtml(firstLine) + "</p>";
        } else {
          box.innerHTML = "<p class=\"placeholder\">No recommendations this time.</p>";
        }
      })
      .catch(function (err) {
        box.innerHTML = "<p class=\"placeholder recommend-error\">" +
          escapeHtml(err.message || "Could not load recommendations.") + "</p>";
      });
  }

  // Auth functions
  let isNewUser = false;

  function showAuthModal(isNew) {
    isNewUser = isNew;
    const modal = document.getElementById("authModal");
    const title = document.getElementById("authTitle");
    const subtitle = document.getElementById("authSubtitle");
    const passwordInput = document.getElementById("authPassword");
    const confirmInput = document.getElementById("authPasswordConfirm");
    const btn = document.getElementById("btnAuth");
    const error = document.getElementById("authError");
    const wrap = document.querySelector(".wrap");

    if (isNew) {
      title.textContent = `Welcome, @${USERNAME}!`;
      subtitle.textContent = "This username is available. Set a password to claim it as yours.";
      passwordInput.placeholder = "Create a password (4+ characters)";
      confirmInput.style.display = "block";
      btn.textContent = "Create My Page";
    } else {
      title.textContent = `Welcome back, @${USERNAME}`;
      subtitle.textContent = "Enter your password to access your LifeGrass.";
      passwordInput.placeholder = "Enter your password";
      confirmInput.style.display = "none";
      btn.textContent = "Login";
    }

    passwordInput.value = "";
    confirmInput.value = "";
    error.textContent = "";
    
    modal.style.display = "flex";
    wrap.classList.add("locked");
    
    setTimeout(function() {
      passwordInput.focus();
    }, 100);
  }

  function hideAuthModal() {
    const modal = document.getElementById("authModal");
    const wrap = document.querySelector(".wrap");
    modal.style.display = "none";
    wrap.classList.remove("locked");
  }

  async function handleAuth() {
    const passwordInput = document.getElementById("authPassword");
    const confirmInput = document.getElementById("authPasswordConfirm");
    const error = document.getElementById("authError");
    const btn = document.getElementById("btnAuth");

    const password = passwordInput.value;
    const confirm = confirmInput.value;

    error.textContent = "";

    if (isNewUser) {
      if (password.length < 4) {
        error.textContent = "Password must be at least 4 characters";
        return;
      }
      if (password !== confirm) {
        error.textContent = "Passwords do not match";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Creating...";

      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: USERNAME, password: password }),
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Registration failed");
        }

        saveToken(data.token);
        hideAuthModal();
        initApp();
      } catch (e) {
        error.textContent = e.message;
        btn.disabled = false;
        btn.textContent = "Create My Page";
      }
    } else {
      if (!password) {
        error.textContent = "Please enter your password";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Logging in...";

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: USERNAME, password: password }),
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Login failed");
        }

        saveToken(data.token);
        hideAuthModal();
        initApp();
      } catch (e) {
        error.textContent = e.message;
        btn.disabled = false;
        btn.textContent = "Login";
      }
    }
  }

  async function checkAuthAndInit() {
    if (!USERNAME) {
      window.location.href = "/";
      return;
    }

    loadToken();

    if (AUTH_TOKEN) {
      try {
        const res = await fetch(getApiUrl(), { headers: authHeaders() });
        if (res.ok) {
          initApp();
          return;
        }
        clearToken();
      } catch (e) {
        clearToken();
      }
    }

    try {
      const res = await fetch(`/api/auth/check/${USERNAME}`);
      const data = await res.json();
      showAuthModal(!data.exists);
    } catch (e) {
      showAuthModal(true);
    }
  }

  function initApp() {
    const input = document.getElementById("birthYear");
    const doneInit = function () {
      const birthYear = getBirthYear();
      if (input) input.value = birthYear;
      renderGrid(birthYear);
      updateUserDisplay();
      
      // 현재 주의 일기가 있으면 추천 로드
      const now = new Date();
      const year = now.getFullYear();
      const week = getWeekOfYear(now);
      const journalData = getJournal(year, week);
      if (journalData) {
        loadRecommendationsForMainPage(journalData);
      }
    };

    fetch(getApiUrl(), { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && (data.birthYear != null || (data.filledWeeks && data.filledWeeks.length) || (data.journal && Object.keys(data.journal).length))) {
          applyState(data);
        }
        doneInit();
      })
      .catch(function () {
        doneInit();
      });

    const applyBtn = document.getElementById("applyBirth");
    if (applyBtn) applyBtn.addEventListener("click", applyBirthYear);

    const modalClose = document.getElementById("modalClose");
    if (modalClose) modalClose.addEventListener("click", closeWeekModal);

    const modalOverlay = document.getElementById("weekModal");
    if (modalOverlay) {
      modalOverlay.addEventListener("click", function(e) {
        if (e.target === modalOverlay) closeWeekModal();
      });
    }

    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        const modal = document.getElementById("weekModal");
        const passwordModal = document.getElementById("passwordCheckModal");
        if (modal && modal.style.display !== "none") {
          closeWeekModal();
        } else if (passwordModal && passwordModal.style.display !== "none") {
          hidePasswordCheckModal();
        }
      }
    });

    // 글쓰기 버튼 이벤트
    const btnWrite = document.getElementById("btnWrite");
    if (btnWrite) {
      btnWrite.addEventListener("click", showPasswordCheckModal);
    }

    // 비밀번호 확인 모달 이벤트
    const btnPasswordCheck = document.getElementById("btnPasswordCheck");
    if (btnPasswordCheck) {
      btnPasswordCheck.addEventListener("click", handlePasswordCheck);
    }

    const passwordCheckInput = document.getElementById("passwordCheckInput");
    if (passwordCheckInput) {
      passwordCheckInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          handlePasswordCheck();
        }
      });
    }

    const passwordCheckModal = document.getElementById("passwordCheckModal");
    if (passwordCheckModal) {
      passwordCheckModal.addEventListener("click", function(e) {
        if (e.target === passwordCheckModal) {
          hidePasswordCheckModal();
        }
      });
    }

    // 모달 내 Plant 버튼 이벤트
    const btnModalPlant = document.getElementById("btnModalPlant");
    if (btnModalPlant) {
      btnModalPlant.addEventListener("click", handleModalPlant);
    }
  }

  function init() {
    const btnAuth = document.getElementById("btnAuth");
    if (btnAuth) {
      btnAuth.addEventListener("click", handleAuth);
    }

    const passwordInput = document.getElementById("authPassword");
    const confirmInput = document.getElementById("authPasswordConfirm");
    
    if (passwordInput) {
      passwordInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          if (isNewUser && confirmInput.style.display !== "none") {
            confirmInput.focus();
          } else {
            handleAuth();
          }
        }
      });
    }
    
    if (confirmInput) {
      confirmInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          handleAuth();
        }
      });
    }

    checkAuthAndInit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
