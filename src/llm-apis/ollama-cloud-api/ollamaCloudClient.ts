import { apiKeyManager } from "./ollama-api-key.manager";
import type {
	CloudChatResponse,
	OllamaChatRequest,
	OllamaCloudConfig,
} from "./types";

export class OllamaCloudClient {
	private readonly baseUrl: string;
	private readonly cookie?: string;
	private readonly timeoutMs: number;

	constructor(config: OllamaCloudConfig, timeoutMs = 180000) {
		this.baseUrl = config.baseUrl;
		this.cookie = config.cookie;
		this.timeoutMs = timeoutMs;
	}

	public async chat(request: OllamaChatRequest): Promise<CloudChatResponse> {
		const MAX_RETRIES = 3;
		let attempt = 0;

		while (attempt < MAX_RETRIES) {
			attempt++;

			const token = apiKeyManager.getAvailableKey();
			if (!token) {
				console.error(
					"[OllamaCloudClient] Service Offline: No available API keys (all exhausted or empty DB).",
				);
				return { status: "failed", content: null };
			}

			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			};

			if (this.cookie) {
				headers["Cookie"] = this.cookie;
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

			try {
				const response = await fetch(`${this.baseUrl}/api/chat`, {
					method: "POST",
					headers,
					body: JSON.stringify({
						...request,
						stream: false, // Enforce stream is always false
					}),
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (response.status === 429) {
					console.warn(
						`[OllamaCloudClient] Rate limit (429) hit for key ending in ...${token.slice(-4)}. Attempt ${attempt}/${MAX_RETRIES}`,
					);

					// Optional: Try to read reset headers if the provider sends them
					let resetTime: number | undefined;
					const retryAfter = response.headers.get("retry-after");
					if (retryAfter) {
						// retry-after is usually in seconds
						const seconds = parseInt(retryAfter, 10);
						if (!isNaN(seconds)) {
							resetTime = Date.now() + seconds * 1000;
						}
					}

					apiKeyManager.reportRateLimit(token, resetTime);
					// Continue to the next iteration of the loop to retry with a new key
					continue;
				}

				if (!response.ok) {
					console.error(
						`[OllamaCloudClient] HTTP Error: ${response.status} ${response.statusText}`,
					);
					return { status: "failed", content: null };
				}

				// Parse JSON response. If this fails, it's caught in the catch block.
				const data = await response.json();

				if (data && data.message && typeof data.message.content === "string") {
					return { status: "success", content: data.message.content };
				} else {
					console.error(
						"[OllamaCloudClient] Malformed response format missing message.content:",
						data,
					);
					return { status: "failed", content: null };
				}
			} catch (error: any) {
				clearTimeout(timeoutId);
				if (error.name === "AbortError") {
					console.error(
						`[OllamaCloudClient] Request timed out after ${this.timeoutMs}ms`,
					);
				} else {
					console.error(
						"[OllamaCloudClient] Request failed:",
						error.message || error,
					);
				}
				return { status: "failed", content: null };
			}
		}

		console.error(
			`[OllamaCloudClient] Max retries (${MAX_RETRIES}) reached due to rate limits.`,
		);
		return { status: "failed", content: null };
	}
}
