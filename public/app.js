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
    return 1995; // 기본값
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
      return "일기를 작성하면 AI가 감성적인 멘트를 남겨드려요.";
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
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || "Failed to generate comment");
      }
      
      const data = await res.json();
      const comment = (data.comment || "").trim();
      
      if (comment && comment !== "A week captured in your memory.") {
        // 여러 줄이면 첫 번째 줄만 사용
        return comment.split(/\n/)[0].trim();
      }
      
      // 폴백: 간단한 규칙 기반 댓글
      return generateFallbackComment(journalData);
    } catch (e) {
      console.error("AI comment generation error:", e);
      return generateFallbackComment(journalData);
    }
  }

  function generateFallbackComment(journalData) {
    if (!journalData || (!journalData.text && !journalData.keywords)) {
      return "A quiet week, but every moment matters in your journey.";
    }
    
    const text = journalData.text || "";
    const keywords = journalData.keywords || "";
    const lowerText = text.toLowerCase();
    const lowerKeywords = keywords.toLowerCase();
    
    // 감성적인 한 줄 멘트들
    const comments = [];
    
    // 학습/성장 관련
    if (lowerText.includes("learn") || lowerText.includes("study") || lowerText.includes("growth") || lowerKeywords.includes("learn")) {
      comments.push("새로운 것을 배우는 한 주였네요. 성장의 발걸음이 느껴집니다.");
      comments.push("지식의 씨앗을 심은 한 주, 곧 아름다운 열매가 열릴 거예요.");
      comments.push("배움의 여정 속에서 한 걸음 더 나아간 당신이 멋져요.");
    }
    
    // 일/프로젝트 관련
    if (lowerText.includes("work") || lowerText.includes("project") || lowerText.includes("productive") || lowerKeywords.includes("work")) {
      comments.push("의미 있는 일에 집중한 한 주, 그 노력이 빛을 발할 거예요.");
      comments.push("목표를 향해 한 걸음씩 나아가는 당신의 모습이 인상적이에요.");
      comments.push("작은 성취들이 모여 큰 변화를 만들어낼 거예요.");
    }
    
    // 사람/관계 관련
    if (lowerText.includes("friend") || lowerText.includes("family") || lowerText.includes("love") || lowerKeywords.includes("friend") || lowerKeywords.includes("family")) {
      comments.push("소중한 사람들과 함께한 시간이 따뜻한 추억이 되었겠어요.");
      comments.push("관계 속에서 얻은 따뜻함이 이번 주를 특별하게 만들었네요.");
      comments.push("함께한 순간들이 인생의 보물이 되어 간직될 거예요.");
    }
    
    // 휴식/회복 관련
    if (lowerText.includes("rest") || lowerText.includes("relax") || lowerText.includes("recharge") || lowerKeywords.includes("rest")) {
      comments.push("잠시 멈춰서 자신을 돌아본 한 주, 그 여유가 필요했을 거예요.");
      comments.push("휴식도 성장의 일부예요. 잘 쉬어가고 계신가요?");
      comments.push("바쁜 일상 속에서도 자신을 돌보는 시간을 가진 당신이 대단해요.");
    }
    
    // 도전/어려움 관련
    if (lowerText.includes("challenge") || lowerText.includes("difficult") || lowerText.includes("hard") || lowerText.includes("struggle") || lowerKeywords.includes("challenge")) {
      comments.push("어려움을 견뎌낸 당신의 모습이 정말 멋져요. 강인함이 느껴집니다.");
      comments.push("힘든 순간도 성장의 밑거름이 되어 당신을 더 단단하게 만들어요.");
      comments.push("도전 앞에서 포기하지 않은 당신, 그 용기가 빛나요.");
    }
    
    // 성취/축하 관련
    if (lowerText.includes("success") || lowerText.includes("achieve") || lowerText.includes("complete") || lowerText.includes("finish") || lowerKeywords.includes("success")) {
      comments.push("목표를 이루어낸 한 주, 정말 축하해요! 그 기쁨을 만끽하세요.");
      comments.push("작은 성취도 큰 의미가 있어요. 당신의 노력을 응원해요.");
      comments.push("한 걸음씩 나아가는 당신의 모습이 자랑스러워요.");
    }
    
    // 여행/모험 관련
    if (lowerText.includes("travel") || lowerText.includes("adventure") || lowerText.includes("trip") || lowerKeywords.includes("travel")) {
      comments.push("새로운 곳에서 얻은 경험이 인생의 색깔을 더해주었겠어요.");
      comments.push("여행의 추억이 마음속에 오래도록 남을 거예요.");
      comments.push("모험의 한 주, 그 경험이 당신을 더 넓게 만들어요.");
    }
    
    // 감정/느낌 관련
    if (lowerText.includes("happy") || lowerText.includes("joy") || lowerText.includes("smile") || lowerText.includes("laugh")) {
      comments.push("행복한 순간들이 이번 주를 빛나게 만들었네요. 그 기쁨이 계속되길 바라요.");
      comments.push("웃음이 가득했던 한 주, 그 에너지가 전해져요.");
      comments.push("작은 행복들로 가득 찬 한 주였네요. 그 따뜻함이 느껴집니다.");
    }
    
    if (lowerText.includes("sad") || lowerText.includes("difficult") || lowerText.includes("tough") || lowerText.includes("hard")) {
      comments.push("힘든 한 주였을 수도 있지만, 그 감정도 소중한 경험이에요.");
      comments.push("어려운 시간을 보내고 계신가요? 당신은 혼자가 아니에요.");
      comments.push("힘든 순간도 지나가고, 더 나은 날들이 기다리고 있을 거예요.");
    }
    
    // 긴 텍스트 (깊은 사고)
    if (text.length > 150) {
      comments.push("깊이 있게 생각해본 한 주, 그 성찰이 당신을 더 현명하게 만들어요.");
      comments.push("생각이 많은 한 주였네요. 그 고민들이 결실을 맺을 거예요.");
      comments.push("내면을 들여다본 시간이 당신의 성장에 도움이 될 거예요.");
    }
    
    // 키워드만 있는 경우
    if (keywords && !text) {
      const keywordList = keywords.split(",").slice(0, 2).join(", ");
      comments.push(`${keywordList}로 채워진 한 주, 그 순간들이 소중해요.`);
      comments.push(`${keywordList}가 이번 주의 키워드였네요. 그 의미를 간직하세요.`);
    }
    
    // 기본 메시지들 (위 조건에 해당하지 않는 경우)
    if (comments.length === 0) {
      comments.push("한 주를 보내며 쌓인 경험이 당신의 이야기가 되어가고 있어요.");
      comments.push("작은 순간들도 모이면 큰 의미가 되죠. 이번 주도 소중했어요.");
      comments.push("시간이 흘러도 이 순간의 감정은 기억에 남을 거예요.");
      comments.push("한 주를 마무리하며 느낀 것들이 당신을 더 풍부하게 만들어요.");
      comments.push("매 순간이 특별해요. 이번 주도 그랬을 거예요.");
    }
    
    // 랜덤하게 하나 선택
    return comments[Math.floor(Math.random() * comments.length)];
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
    
    if (journalData && (journalData.text || journalData.keywords)) {
      keywordsEl.textContent = journalData.keywords || "No keywords";
      journalEl.textContent = journalData.text || "No journal entry.";
      // 저장된 AI Comment가 있으면 표시, 없으면 AI로 생성
      if (journalData.aiComment) {
        insightEl.textContent = journalData.aiComment;
      } else {
        // AI Comment 생성
        insightEl.textContent = "AI 코멘트 생성 중...";
        generateAIComment(journalData, year, week)
          .then(function(comment) {
            insightEl.textContent = comment;
            // 생성된 코멘트 저장
            setJournal(year, week, { ...journalData, aiComment: comment });
            saveStateToServer();
          })
          .catch(function() {
            insightEl.textContent = generateFallbackComment(journalData);
          });
      }
    } else {
      keywordsEl.textContent = "No keywords";
      journalEl.textContent = "No journal entry for this week.";
      insightEl.textContent = "일기를 작성하면 AI가 감성적인 멘트를 남겨드려요.";
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
    const birthYearInput = document.getElementById("authBirthYear");
    const btn = document.getElementById("btnAuth");
    const error = document.getElementById("authError");
    const wrap = document.querySelector(".wrap");

    if (isNew) {
      title.textContent = `Welcome, @${USERNAME}!`;
      subtitle.textContent = "This username is available. Set a password and birth year to claim it as yours.";
      passwordInput.placeholder = "Create a password (4+ characters)";
      confirmInput.style.display = "block";
      birthYearInput.style.display = "block";
      birthYearInput.value = "1995";
      btn.textContent = "Create My Page";
    } else {
      title.textContent = `Welcome back, @${USERNAME}`;
      subtitle.textContent = "Enter your password to access your LifeGrass.";
      passwordInput.placeholder = "Enter your password";
      confirmInput.style.display = "none";
      birthYearInput.style.display = "none";
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
    const birthYearInput = document.getElementById("authBirthYear");
    const error = document.getElementById("authError");
    const btn = document.getElementById("btnAuth");

    const password = passwordInput.value;
    const confirm = confirmInput.value;
    const birthYear = birthYearInput ? parseInt(birthYearInput.value, 10) : null;

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
      if (!birthYear || isNaN(birthYear) || birthYear < 1920 || birthYear > 2020) {
        error.textContent = "Please enter a valid birth year (1920-2020)";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Creating...";

      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            username: USERNAME, 
            password: password,
            birthYear: birthYear
          }),
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Registration failed");
        }

        saveToken(data.token);
        setBirthYear(birthYear);
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

  function clearUserLocalStorage() {
    // 해당 유저의 모든 localStorage 데이터 삭제
    const keys = [
      getStorageKey("birthYear"),
      getStorageKey("filledWeeks"),
      getStorageKey("journal"),
      getTokenKey(),
    ];
    keys.forEach(key => {
      if (key) localStorage.removeItem(key);
    });
    AUTH_TOKEN = null;
  }

  async function checkAuthAndInit() {
    if (!USERNAME) {
      window.location.href = "/";
      return;
    }

    // 먼저 유저 존재 여부 확인
    try {
      const checkRes = await fetch(`/api/auth/check/${USERNAME}`);
      const checkData = await checkRes.json();
      
      if (!checkData.exists) {
        // 유저가 존재하지 않으면 모든 데이터 초기화
        clearUserLocalStorage();
        showAuthModal(true);
        return;
      }
    } catch (e) {
      // 체크 실패 시에도 새 유저로 간주
      clearUserLocalStorage();
      showAuthModal(true);
      return;
    }

    // 유저가 존재하면 토큰 확인
    loadToken();

    if (AUTH_TOKEN) {
      try {
        const res = await fetch(getApiUrl(), { headers: authHeaders() });
        if (res.ok) {
          initApp();
          return;
        }
        // 401 또는 404면 토큰 무효 또는 유저 삭제됨
        if (res.status === 401 || res.status === 404) {
          clearUserLocalStorage();
          // 다시 유저 존재 여부 확인
          const checkRes = await fetch(`/api/auth/check/${USERNAME}`);
          const checkData = await checkRes.json();
          showAuthModal(!checkData.exists);
          return;
        }
        clearToken();
      } catch (e) {
        clearToken();
      }
    }

    // 토큰이 없으면 로그인 모달 표시
    try {
      const res = await fetch(`/api/auth/check/${USERNAME}`);
      const data = await res.json();
      showAuthModal(!data.exists);
    } catch (e) {
      showAuthModal(true);
    }
  }

  function initApp() {
    const doneInit = function () {
      const birthYear = getBirthYear();
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
