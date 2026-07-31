document.addEventListener("DOMContentLoaded", () => {
	// Server handles redirection for /login if already authenticated,
	// but client doesn't need to check localStorage anymore.

	const loginForm = document.getElementById("loginForm");
	const alertBox = document.getElementById("loginAlert");
	const loginBtn = document.getElementById("loginBtn");

	function showError(message) {
		alertBox.textContent = message;
		alertBox.classList.add("error");
	}

	function hideError() {
		alertBox.classList.remove("error");
		alertBox.textContent = "";
	}

	loginForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		hideError();

		const identifier = document.getElementById("usernameOrEmail").value;
		const password = document.getElementById("password").value;

		const originalBtnText = loginBtn.textContent;
		loginBtn.textContent = "Logging in...";
		loginBtn.disabled = true;

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ identifier, password }),
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || "Invalid credentials");
			}

			// Success (Cookie is automatically set by the backend)
			window.location.href = "/dashboard";
		} catch (error) {
			showError(error.message);
		} finally {
			loginBtn.textContent = originalBtnText;
			loginBtn.disabled = false;
		}
	});
});
