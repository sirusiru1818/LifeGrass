(function () {
  const API_BASE = "http://localhost:3000";
  
  let allUsers = [];
  let allUserData = {};
  let currentUser = null;
  let userToDelete = null;

  async function fetchUsers() {
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      return data.users || [];
    } catch (e) {
      console.error("Error fetching users:", e);
      return [];
    }
  }

  async function fetchUserData(username) {
    try {
      // 관리자용 엔드포인트 사용 (인증 불필요)
      const res = await fetch(`${API_BASE}/api/admin/data/${username}`);
      if (!res.ok) throw new Error("Failed to fetch user data");
      return await res.json();
    } catch (e) {
      console.error("Error fetching user data:", e);
      return null;
    }
  }

  async function deleteUser(username) {
    try {
      const res = await fetch(`${API_BASE}/api/data/${username}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete user");
      return true;
    } catch (e) {
      console.error("Error deleting user:", e);
      return false;
    }
  }

  async function loadAllData() {
    const tbody = document.getElementById("usersTableBody");
    tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Loading users...</td></tr>';

    allUsers = await fetchUsers();
    allUserData = {};

    let totalEntries = 0;

    for (const username of allUsers) {
      const data = await fetchUserData(username);
      if (data) {
        allUserData[username] = data;
        const journalCount = data.journal ? Object.keys(data.journal).length : 0;
        totalEntries += journalCount;
      }
    }

    document.getElementById("totalUsers").textContent = allUsers.length;
    document.getElementById("totalEntries").textContent = totalEntries;

    renderUsersTable(allUsers);
  }

  function renderUsersTable(users) {
    const tbody = document.getElementById("usersTableBody");

    if (users.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No users found</td></tr>';
      return;
    }

    tbody.innerHTML = "";

    users.forEach((username) => {
      const data = allUserData[username] || {};
      const filledCount = data.filledWeeks ? data.filledWeeks.length : 0;
      const journalCount = data.journal ? Object.keys(data.journal).length : 0;
      const updatedAt = data.updatedAt ? formatDate(data.updatedAt) : "-";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="username-cell" data-username="${escapeHtml(username)}">${escapeHtml(username)}</td>
        <td>${data.birthYear || "-"}</td>
        <td>
          <span class="badge ${filledCount > 0 ? "badge-success" : "badge-muted"}">${filledCount} weeks</span>
          <span class="badge badge-muted">${journalCount} entries</span>
        </td>
        <td>${updatedAt}</td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-view" data-username="${escapeHtml(username)}" title="View details">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2c-2.2 0-4.2 1.2-5.8 3C.8 6.6 0 8 0 8s.8 1.4 2.2 3c1.6 1.8 3.6 3 5.8 3s4.2-1.2 5.8-3c1.4-1.6 2.2-3 2.2-3s-.8-1.4-2.2-3C12.2 3.2 10.2 2 8 2zm0 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
              <circle cx="8" cy="8" r="1.5"/>
            </svg>
          </button>
          <button class="btn btn-ghost btn-delete" data-username="${escapeHtml(username)}" title="Delete user">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".username-cell, .btn-view").forEach((el) => {
      el.addEventListener("click", () => {
        const username = el.dataset.username;
        openUserModal(username);
      });
    });

    tbody.querySelectorAll(".btn-delete").forEach((el) => {
      el.addEventListener("click", () => {
        const username = el.dataset.username;
        openConfirmModal(username);
      });
    });
  }

  function openUserModal(username) {
    currentUser = username;
    const data = allUserData[username] || {};

    document.getElementById("modalUsername").textContent = `@${username}`;
    document.getElementById("modalBirthYear").textContent = data.birthYear || "-";
    document.getElementById("modalFilledCount").textContent = data.filledWeeks
      ? data.filledWeeks.length
      : 0;

    const journalList = document.getElementById("journalList");
    const journal = data.journal || {};
    const entries = Object.entries(journal).sort((a, b) => b[0].localeCompare(a[0]));

    if (entries.length === 0) {
      journalList.innerHTML = '<p class="no-data">No journal entries</p>';
    } else {
      journalList.innerHTML = "";
      entries.forEach(([key, entry]) => {
        const [year, week] = key.split("-");
        const div = document.createElement("div");
        div.className = "journal-item";
        div.innerHTML = `
          <div class="journal-item-header">
            <span class="journal-week">Week ${parseInt(week) + 1}, ${year}</span>
            <span class="journal-keywords">${escapeHtml(entry.keywords || "")}</span>
          </div>
          <div class="journal-text">${escapeHtml(entry.text || "No text")}</div>
        `;
        journalList.appendChild(div);
      });
    }

    document.getElementById("rawJson").textContent = JSON.stringify(data, null, 2);

    document.getElementById("userModal").style.display = "flex";
  }

  function closeUserModal() {
    document.getElementById("userModal").style.display = "none";
    currentUser = null;
  }

  function openConfirmModal(username) {
    userToDelete = username;
    document.getElementById("deleteUsername").textContent = username;
    document.getElementById("confirmModal").style.display = "flex";
  }

  function closeConfirmModal() {
    document.getElementById("confirmModal").style.display = "none";
    userToDelete = null;
  }

  async function confirmDelete() {
    if (!userToDelete) return;

    const success = await deleteUser(userToDelete);
    if (success) {
      closeConfirmModal();
      closeUserModal();
      await loadAllData();
    } else {
      alert("Failed to delete user. Please try again.");
    }
  }

  function filterUsers(query) {
    const lower = query.toLowerCase();
    const filtered = allUsers.filter((u) => u.toLowerCase().includes(lower));
    renderUsersTable(filtered);
  }

  function formatDate(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function init() {
    loadAllData();

    document.getElementById("btnRefresh").addEventListener("click", loadAllData);

    document.getElementById("searchInput").addEventListener("input", (e) => {
      filterUsers(e.target.value);
    });

    document.getElementById("modalClose").addEventListener("click", closeUserModal);
    document.getElementById("btnCloseModal").addEventListener("click", closeUserModal);
    document.getElementById("userModal").addEventListener("click", (e) => {
      if (e.target.id === "userModal") closeUserModal();
    });

    document.getElementById("btnDeleteUser").addEventListener("click", () => {
      if (currentUser) openConfirmModal(currentUser);
    });

    document.getElementById("btnConfirmDelete").addEventListener("click", confirmDelete);
    document.getElementById("btnCancelDelete").addEventListener("click", closeConfirmModal);
    document.getElementById("confirmModal").addEventListener("click", (e) => {
      if (e.target.id === "confirmModal") closeConfirmModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (document.getElementById("confirmModal").style.display !== "none") {
          closeConfirmModal();
        } else if (document.getElementById("userModal").style.display !== "none") {
          closeUserModal();
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
