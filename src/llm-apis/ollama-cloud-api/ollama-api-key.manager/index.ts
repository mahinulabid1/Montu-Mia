import { prisma } from "prisma/db";

interface ApiKeyRecord {
	apiKey: string;
	isRateLimited: boolean;
	rateLimitResetTime?: number;
}

class OllamaApiKeyManager {
	private keys: ApiKeyRecord[] = [];
	private currentIndex: number = 0;
	public serviceStatus: "online" | "offline" = "online";

	/**
	 * Initializes the manager by fetching all Ollama API keys from the database.
	 */
	public async init() {
		try {
			const dbKeys = await prisma.apiKey.findMany({
				where: { category: "Ollama API" },
			});

			this.keys = dbKeys.map((k) => ({
				apiKey: k.apiKey,
				isRateLimited: false,
			}));

			if (this.keys.length === 0) {
				console.warn(
					"[OllamaApiKeyManager] No Ollama API keys found in database. Service offline.",
				);
				this.serviceStatus = "offline";
			} else {
				console.log(
					`[OllamaApiKeyManager] Loaded ${this.keys.length} API keys.`,
				);
				this.serviceStatus = "online";
			}
		} catch (error) {
			console.error(
				"[OllamaApiKeyManager] Failed to initialize API keys from database.",
				error,
			);
			this.serviceStatus = "offline";
		}
	}

	/**
	 * Resets the rate limit status of keys that have passed their penalty time.
	 */
	private resetExpiredLimits() {
		const now = Date.now();
		let anyKeyAwakened = false;

		for (const keyRecord of this.keys) {
			if (
				keyRecord.isRateLimited &&
				keyRecord.rateLimitResetTime &&
				now >= keyRecord.rateLimitResetTime
			) {
				keyRecord.isRateLimited = false;
				keyRecord.rateLimitResetTime = undefined;
				anyKeyAwakened = true;
				console.log(
					`[OllamaApiKeyManager] Key cooldown expired. Key ending in ...${keyRecord.apiKey.slice(-4)} is now available.`,
				);
			}
		}

		// If service was offline but a key just awakened, put it back online
		if (this.serviceStatus === "offline" && anyKeyAwakened) {
			this.serviceStatus = "online";
			console.log(
				"[OllamaApiKeyManager] A key became available. Service is back online.",
			);
		}
	}

	/**
	 * Gets the next available API key using Round-Robin.
	 * Returns null if all keys are exhausted.
	 */
	public getAvailableKey(): string | null {
		// 1. Lazily check if any keys have recovered from their cooldown
		this.resetExpiredLimits();

		if (this.keys.length === 0) {
			this.serviceStatus = "offline";
			return null;
		}

		// 2. Round-Robin search for an available key
		const startIndex = this.currentIndex;
		do {
			const keyRecord = this.keys[this.currentIndex];

			// Advance the index for the next call
			this.currentIndex = (this.currentIndex + 1) % this.keys.length;

			if (!keyRecord.isRateLimited) {
				return keyRecord.apiKey;
			}
		} while (this.currentIndex !== startIndex);

		// If we looped through all keys and none are available
		console.warn(
			"[OllamaApiKeyManager] All API keys are currently rate-limited.",
		);
		this.serviceStatus = "offline";
		return null;
	}

	/**
	 * Reports that an API key has been rate-limited.
	 * @param apiKey The key that was rate-limited.
	 * @param resetTime Optional epoch timestamp (ms) when the limit expires. Defaults to 1 hour from now.
	 */
	public reportRateLimit(apiKey: string, resetTime?: number) {
		const keyRecord = this.keys.find((k) => k.apiKey === apiKey);
		if (keyRecord) {
			if (!keyRecord.isRateLimited) {
				keyRecord.isRateLimited = true;
				// Default to 1 hour (3600000 ms) if no reset time provided
				keyRecord.rateLimitResetTime = resetTime || Date.now() + 3600000;
				console.warn(
					`[OllamaApiKeyManager] API Key ending in ...${apiKey.slice(-4)} rate-limited until ${new Date(keyRecord.rateLimitResetTime).toISOString()}`,
				);
			}
		}

		// Check if all keys are now exhausted
		const allExhausted = this.keys.every((k) => k.isRateLimited);
		if (allExhausted) {
			console.error(
				"[OllamaApiKeyManager] ALL API keys exhausted. Service going offline.",
			);
			this.serviceStatus = "offline";
		}
	}
}

export const apiKeyManager = new OllamaApiKeyManager();
