document.addEventListener("DOMContentLoaded", () => {
	// No token check needed here anymore.
	// The Express backend handles redirects for /dashboard automatically.

	// --- Auth & API Helpers ---
	async function apiFetch(url, options = {}) {
		const headers = {
			"Content-Type": "application/json",
			...(options.headers || {}),
		};
		// Include cookies with the request
		options.credentials = "same-origin";
		const response = await fetch(url, { ...options, headers });
		if (response.status === 401) {
			window.location.href = "/login";
			throw new Error("Session expired. Please log in again.");
		}
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(
				data.message || `Request failed with status ${response.status}`,
			);
		}
		return data;
	}

	// --- UI Elements ---
	const navItems = document.querySelectorAll(".nav-item");
	const viewSections = document.querySelectorAll(".view-section");
	const logoutBtn = document.getElementById("logoutBtn");
	const menuToggle = document.getElementById("menuToggle");
	const navMenu = document.getElementById("navMenu");

	// --- Navigation Logic ---
	navItems.forEach((item) => {
		item.addEventListener("click", () => {
			navItems.forEach((nav) => nav.classList.remove("active"));
			viewSections.forEach((section) => section.classList.remove("active"));

			item.classList.add("active");
			const viewId = item.getAttribute("data-view");
			document.getElementById(viewId).classList.add("active");

			if (window.innerWidth <= 768) {
				navMenu.classList.remove("show");
			}

			if (viewId === "api-keys") loadApiKeys();
			if (viewId === "prompts") loadPrompts();
			if (viewId === "guilds") loadGuilds();
		});
	});

	menuToggle.addEventListener("click", () => {
		navMenu.classList.toggle("show");
	});

	logoutBtn.addEventListener("click", async () => {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch (e) {
			console.error("Logout failed", e);
		}
		window.location.href = "/login";
	});

	// --- Modals ---
	const modalOverlay = document.getElementById("modalOverlay");
	const modalClose = document.getElementById("modalClose");
	const modalTitle = document.getElementById("modalTitle");
	const modalBody = document.getElementById("modalBody");
	const modalAlert = document.getElementById("modalAlert");

	function openModal(title, contentHtml) {
		modalTitle.textContent = title;
		modalBody.innerHTML = contentHtml;
		modalAlert.style.display = "none";
		modalOverlay.classList.add("active");
	}

	function closeModal() {
		modalOverlay.classList.remove("active");
		modalBody.innerHTML = "";
	}

	modalClose.addEventListener("click", closeModal);

	// --- API Keys Management ---
	const apiKeysTableBody = document.getElementById("apiKeysTableBody");
	const apiAlert = document.getElementById("apiAlert");

	async function loadApiKeys() {
		try {
			apiKeysTableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
			const data = await apiFetch("/api/apikeys");
			renderApiKeys(data || []);
		} catch (error) {
			apiAlert.textContent = error.message;
			apiAlert.classList.add("error");
		}
	}

	function renderApiKeys(keys) {
		apiAlert.classList.remove("error");
		if (keys.length === 0) {
			apiKeysTableBody.innerHTML =
				'<tr><td colspan="4">No API keys found.</td></tr>';
			return;
		}
		apiKeysTableBody.innerHTML = keys
			.map(
				(key) => `
      <tr>
        <td>${key.subjectName}</td>
        <td><span class="badge">${key.category}</span></td>
        <td><code>${key.apiKey.substring(0, 8)}...</code></td>
        <td class="actions">
          <button class="action-btn edit-key-btn" data-id="${key.id}">Edit Metadata</button>
          <button class="action-btn btn-danger delete-key-btn" data-id="${key.id}">Delete</button>
        </td>
      </tr>
    `,
			)
			.join("");
	}

	document.getElementById("createApiKeyBtn").addEventListener("click", () => {
		openModal(
			"Create API Key",
			`
      <form id="apiKeyForm">
        <div class="form-group">
          <label>Subject Name</label>
          <input type="text" id="akSubject" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="akCategory" class="form-control">
            <option value="Ollama API">Ollama API</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>API Key (Value)</label>
          <input type="text" id="akValue" class="form-control" required>
        </div>
        <button type="submit" class="btn btn-primary">Save API Key</button>
      </form>
    `,
		);

		document
			.getElementById("apiKeyForm")
			.addEventListener("submit", async (e) => {
				e.preventDefault();
				try {
					await apiFetch("/api/apikeys", {
						method: "POST",
						body: JSON.stringify({
							subjectName: document.getElementById("akSubject").value,
							category: document.getElementById("akCategory").value,
							apiKey: document.getElementById("akValue").value,
						}),
					});
					closeModal();
					loadApiKeys();
				} catch (error) {
					modalAlert.textContent = error.message;
					modalAlert.classList.add("error");
				}
			});
	});

	apiKeysTableBody.addEventListener("click", async (e) => {
		if (e.target.classList.contains("delete-key-btn")) {
			if (!confirm("Are you sure you want to delete this key?")) return;
			const id = e.target.getAttribute("data-id");
			try {
				await apiFetch(`/api/apikeys/${id}`, { method: "DELETE" });
				loadApiKeys();
			} catch (error) {
				apiAlert.textContent = error.message;
				apiAlert.classList.add("error");
			}
		}

		if (e.target.classList.contains("edit-key-btn")) {
			const id = e.target.getAttribute("data-id");
			openModal(
				"Edit API Key Metadata",
				`
        <form id="editApiKeyForm">
          <div class="form-group">
            <label>Subject Name</label>
            <input type="text" id="editAkSubject" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="editAkCategory" class="form-control">
              <option value="Ollama API">Ollama API</option>
              <option value="other">Other</option>
            </select>
          </div>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Note: Actual API Key string cannot be edited for security.</p>
          <button type="submit" class="btn btn-primary">Update Metadata</button>
        </form>
      `,
			);

			document
				.getElementById("editApiKeyForm")
				.addEventListener("submit", async (ev) => {
					ev.preventDefault();
					try {
						await apiFetch(`/api/apikeys/${id}`, {
							method: "PUT",
							body: JSON.stringify({
								subjectName: document.getElementById("editAkSubject").value,
								category: document.getElementById("editAkCategory").value,
							}),
						});
						closeModal();
						loadApiKeys();
					} catch (error) {
						modalAlert.textContent = error.message;
						modalAlert.classList.add("error");
					}
				});
		}
	});

	// --- Prompts Management ---
	const promptsTableBody = document.getElementById("promptsTableBody");
	const promptAlert = document.getElementById("promptAlert");
	let currentPrompts = [];

	async function loadPrompts() {
		try {
			promptsTableBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
			const data = await apiFetch("/api/prompts");
			renderPrompts(data || []);
		} catch (error) {
			promptAlert.textContent = error.message;
			promptAlert.classList.add("error");
		}
	}

	function renderPrompts(prompts) {
		currentPrompts = prompts;
		promptAlert.classList.remove("error");
		if (prompts.length === 0) {
			promptsTableBody.innerHTML =
				'<tr><td colspan="4">No prompts found.</td></tr>';
			return;
		}
		promptsTableBody.innerHTML = prompts
			.map(
				(p) => `
      <tr>
        <td><strong>${p.promptName}</strong></td>
        <td><span class="badge">${p.category || "CHAOS_CHAT"}</span></td>
        <td>${p.promptValue.length > 50 ? p.promptValue.substring(0, 50) + "..." : p.promptValue}</td>
        <td class="actions">
          <button class="action-btn edit-prompt-btn" data-id="${p.id}">Edit</button>
          <button class="action-btn btn-danger delete-prompt-btn" data-id="${p.id}">Delete</button>
        </td>
      </tr>
    `,
			)
			.join("");
	}

	document.getElementById("createPromptBtn").addEventListener("click", () => {
		openModal(
			"Create Prompt",
			`
      <form id="promptForm">
        <div class="form-group">
          <label>Prompt Name (Unique)</label>
          <input type="text" id="pName" class="form-control" required>
        </div>
        <div class="form-group">
          <label>Category</label>
          <select id="pCategory" class="form-control" required>
            <option value="CHAOS_CHAT">Chaos Chat</option>
            <option value="WELCOME_MESSAGE">Welcome Message</option>
          </select>
        </div>
        <div class="form-group">
          <label>Prompt Value</label>
          <textarea id="pValue" class="form-control" rows="4" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Save Prompt</button>
      </form>
    `,
		);

		document
			.getElementById("promptForm")
			.addEventListener("submit", async (e) => {
				e.preventDefault();
				try {
					await apiFetch("/api/prompts", {
						method: "POST",
						body: JSON.stringify({
							promptName: document.getElementById("pName").value,
							category: document.getElementById("pCategory").value,
							promptValue: document.getElementById("pValue").value,
						}),
					});
					closeModal();
					loadPrompts();
				} catch (error) {
					modalAlert.textContent = error.message;
					modalAlert.classList.add("error");
				}
			});
	});

	promptsTableBody.addEventListener("click", async (e) => {
		if (e.target.classList.contains("delete-prompt-btn")) {
			if (!confirm("Are you sure you want to delete this prompt?")) return;
			const id = e.target.getAttribute("data-id");
			try {
				await apiFetch(`/api/prompts/${id}`, { method: "DELETE" });
				loadPrompts();
			} catch (error) {
				promptAlert.textContent = error.message;
				promptAlert.classList.add("error");
			}
		}

		if (e.target.classList.contains("edit-prompt-btn")) {
			const id = e.target.getAttribute("data-id");
			const prompt = currentPrompts.find((p) => p.id === id);
			// Ideally we fetch the specific prompt data, but for simplicity, we let the backend handle the update.
			openModal(
				"Edit Prompt",
				`
        <form id="editPromptForm">
          <div class="form-group">
            <label>Prompt Name (Unique)</label>
            <input type="text" id="editPName" class="form-control" required>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="editPCategory" class="form-control" required>
              <option value="CHAOS_CHAT">Chaos Chat</option>
              <option value="WELCOME_MESSAGE">Welcome Message</option>
            </select>
          </div>
          <div class="form-group">
            <label>Prompt Value</label>
            <textarea id="editPValue" class="form-control" rows="4" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Update Prompt</button>
        </form>
      `,
			);

			document.getElementById("editPName").value = prompt.promptName;
			document.getElementById("editPCategory").value =
				prompt.category || "CHAOS_CHAT";
			document.getElementById("editPValue").value = prompt.promptValue;

			document
				.getElementById("editPromptForm")
				.addEventListener("submit", async (ev) => {
					ev.preventDefault();
					try {
						await apiFetch(`/api/prompts/${id}`, {
							method: "PUT",
							body: JSON.stringify({
								promptName: document.getElementById("editPName").value,
								category: document.getElementById("editPCategory").value,
								promptValue: document.getElementById("editPValue").value,
							}),
						});
						closeModal();
						loadPrompts();
					} catch (error) {
						modalAlert.textContent = error.message;
						modalAlert.classList.add("error");
					}
				});
		}
	});

	// --- Discord Guilds & Activity ---
	const guildsTableBody = document.getElementById("guildsTableBody");
	const guildAlert = document.getElementById("guildAlert");
	const refreshGuildsBtn = document.getElementById("refreshGuildsBtn");

	const statTotalGuilds = document.getElementById("statTotalGuilds");
	const statTotalUsers = document.getElementById("statTotalUsers");
	const statTotalMessages = document.getElementById("statTotalMessages");

	let currentGuildsData = null;

	function formatDate(isoStr) {
		if (!isoStr) return "N/A";
		const date = new Date(isoStr);
		return date.toLocaleString();
	}

	async function loadGuilds() {
		try {
			if (guildsTableBody) {
				guildsTableBody.innerHTML =
					'<tr><td colspan="6">Loading server stats...</td></tr>';
			}
			const data = await apiFetch("/api/guilds");
			renderGuilds(data);
		} catch (error) {
			if (guildAlert) {
				guildAlert.textContent = error.message;
				guildAlert.classList.add("error");
			}
		}
	}

	function renderGuilds(summary) {
		currentGuildsData = summary;
		if (guildAlert) guildAlert.classList.remove("error");

		if (statTotalGuilds)
			statTotalGuilds.textContent = summary.totalGuildsTracked || 0;
		if (statTotalUsers)
			statTotalUsers.textContent = summary.totalUsersTracked || 0;
		if (statTotalMessages)
			statTotalMessages.textContent = summary.totalMessagesTracked || 0;

		const guilds = summary.guilds || [];
		if (!guildsTableBody) return;

		if (guilds.length === 0) {
			guildsTableBody.innerHTML =
				'<tr><td colspan="6">No active Discord servers recorded yet.</td></tr>';
			return;
		}

		guildsTableBody.innerHTML = guilds
			.map((g) => {
				const name = g.name || "Unknown Server";
				const initial = name.charAt(0) || "S";
				return `
			<tr>
				<td>
					<div class="guild-info">
						${g.iconUrl ? `<img src="${g.iconUrl}" class="guild-icon" alt="${name}">` : `<div class="guild-icon-placeholder">${initial}</div>`}
						<strong>${name}</strong>
					</div>
				</td>
				<td><code>${g.id}</code></td>
				<td><span class="badge">${g.memberCount || 0} members</span></td>
				<td><span class="badge badge-success">${g.totalMessages || 0} msgs</span></td>
				<td>${formatDate(g.lastActiveAt)}</td>
				<td class="actions">
					<button class="action-btn view-guild-users-btn" data-id="${g.id}">View Users (${g.users ? g.users.length : 0})</button>
				</td>
			</tr>
		`;
			})
			.join("");
	}

	if (refreshGuildsBtn) {
		refreshGuildsBtn.addEventListener("click", () => loadGuilds());
	}

	if (guildsTableBody) {
		guildsTableBody.addEventListener("click", (e) => {
			if (e.target.classList.contains("view-guild-users-btn")) {
				const guildId = e.target.getAttribute("data-id");
				if (!currentGuildsData || !currentGuildsData.guilds) return;

				const guild = currentGuildsData.guilds.find((g) => g.id === guildId);
				if (!guild) return;

				const users = guild.users || [];
				let usersHtml = "";

				if (users.length === 0) {
					usersHtml = "<p>No active users recorded in this server yet.</p>";
				} else {
					usersHtml = `
						<div class="table-container">
							<table>
								<thead>
									<tr>
										<th>User</th>
										<th>ID</th>
										<th>Role/Bot</th>
										<th>Messages</th>
										<th>Last Active</th>
									</tr>
								</thead>
								<tbody>
									${users
										.map((u) => {
											const displayName =
												u.displayName || u.username || "Unknown User";
											const username = u.username || "unknown";
											const userInitial = displayName.charAt(0) || "U";
											return `
										<tr>
											<td>
												<div class="user-cell">
													${u.avatarUrl ? `<img src="${u.avatarUrl}" class="user-avatar" alt="${displayName}">` : `<div class="user-avatar-placeholder">${userInitial}</div>`}
													<div>
														<div><strong>${displayName}</strong></div>
														<div style="font-size: 0.75rem; color: var(--text-muted)">@${username}</div>
													</div>
												</div>
											</td>
											<td><code>${u.id}</code></td>
											<td>${u.bot ? '<span class="badge badge-bot">BOT</span>' : '<span class="badge">USER</span>'}</td>
											<td><strong>${u.messageCount || 0}</strong></td>
											<td>${formatDate(u.lastActiveAt)}</td>
										</tr>
									`;
										})
										.join("")}
								</tbody>
							</table>
						</div>
					`;
				}

				openModal(`Active Users in ${guild.name || "Server"}`, usersHtml);
			}
		});
	}

	// Init
	loadApiKeys();
});
