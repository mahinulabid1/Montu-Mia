import type { GuildMember, Message } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChaosChatV1 } from "../chat";
import { messageHistoryServiceV2 } from "../modules/message-history.service";
import { MessageQueueService } from "../modules/message-queue.service";
import { WelcomeService } from "../modules/welcome.service";

// Mock the shared db module to avoid real database connection in tests
vi.mock("prisma/db", () => {
	return {
		prisma: {
			prompt: {
				findFirst: vi.fn(),
			},
		},
	};
});

// Mock pino to prevent test output clutter
vi.mock("pino", () => {
	const mockLogger = {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	};
	return {
		default: vi.fn(() => mockLogger),
	};
});

// Mock environment variables for base URLs
process.env.OLLAMA_BASE_URL = "http://localhost:11434";

describe("MessageHistoryService", () => {
	beforeEach(() => {
		messageHistoryServiceV2.clear();
	});

	it("should isolate history by channelId", () => {
		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-1",
			role: "user",
			content: "Hello from channel 1",
			authorId: "user-1",
			authorName: "Alice",
		});
		messageHistoryServiceV2.addMessage("channel-2", {
			messageId: "msg-2",
			role: "user",
			content: "Hello from channel 2",
			authorId: "user-2",
			authorName: "Bob",
		});

		const history1 = messageHistoryServiceV2.getHistoryPrompt("channel-1");
		const history2 = messageHistoryServiceV2.getHistoryPrompt("channel-2");

		expect(history1).toContain("Hello from channel 1");
		expect(history1).not.toContain("Hello from channel 2");
		expect(history2).toContain("Hello from channel 2");
		expect(history2).not.toContain("Hello from channel 1");
	});

	it("should cap history length and re-index correctly", () => {
		for (let i = 1; i <= 12; i++) {
			messageHistoryServiceV2.addMessage("channel-1", {
				messageId: `msg-${i}`,
				role: "user",
				content: `message-${i}`,
				authorId: `user-${i}`,
				authorName: `User${i}`,
			});
		}
		const history = messageHistoryServiceV2.getHistoryPrompt("channel-1");
		// Should only contain last 10 messages (3 to 12)
		expect(history).not.toContain("User1 (ID: user-1): message-1");
		expect(history).not.toContain("User2 (ID: user-2): message-2");
		expect(history).toContain("User3 (ID: user-3): message-3");
		expect(history).toContain("User12 (ID: user-12): message-12");

		const rawHistory = messageHistoryServiceV2.getRawHistory("channel-1");
		expect(rawHistory.length).toBe(10);
		// Local IDs are sequential starting at 1
		expect(rawHistory[0].id).toBe(1);
		expect(rawHistory[9].id).toBe(10);
	});

	it("should format history transcript with correct reply attribution", () => {
		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-1",
			role: "user",
			content: "Hello",
			authorId: "user-1",
			authorName: "Alice",
		});
		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-2",
			role: "user",
			content: "Hi Alice",
			authorId: "user-2",
			authorName: "Bob",
			replyTo: {
				messageId: "msg-1",
				authorId: "user-1",
				authorName: "Alice",
			},
		});

		const history = messageHistoryServiceV2.getHistoryPrompt("channel-1");
		expect(history).toContain("Bob (ID: user-2) replying to Alice: Hi Alice");
	});

	it("should prune messages older than 10 minutes (TTL)", () => {
		vi.useFakeTimers();
		const now = Date.now();
		vi.setSystemTime(now);

		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-1",
			role: "user",
			content: "Old message",
			authorId: "user-1",
			authorName: "Alice",
		});

		// Advance time by 5 minutes
		vi.setSystemTime(now + 5 * 60 * 1000);
		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-2",
			role: "user",
			content: "Recent message",
			authorId: "user-2",
			authorName: "Bob",
		});

		// At +5 minutes, both messages should be present
		let history = messageHistoryServiceV2.getHistoryPrompt("channel-1");
		expect(history).toContain("Old message");
		expect(history).toContain("Recent message");

		// Advance time by another 6 minutes (total 11 minutes since msg-1, 6 minutes since msg-2)
		vi.setSystemTime(now + 11 * 60 * 1000);

		// Now msg-1 should be pruned, and msg-2 should remain and be re-indexed to ID 1
		history = messageHistoryServiceV2.getHistoryPrompt("channel-1");
		expect(history).not.toContain("Old message");
		expect(history).toContain("Recent message");

		const rawHistory = messageHistoryServiceV2.getRawHistory("channel-1");
		expect(rawHistory.length).toBe(1);
		expect(rawHistory[0].id).toBe(1);
		expect(rawHistory[0].content).toBe("Recent message");

		// Advance time by another 5 minutes (total 16 minutes, msg-2 is now 11 minutes old)
		vi.setSystemTime(now + 16 * 60 * 1000);

		// All messages should be expired
		history = messageHistoryServiceV2.getHistoryPrompt("channel-1");
		expect(history).toBe("");

		vi.useRealTimers();
	});
});

describe("MessageQueueService", () => {
	it("should process items sequentially and invoke the callback contract", async () => {
		const processedMessages: string[] = [];
		const callback = vi.fn().mockImplementation(async (msg: Message) => {
			processedMessages.push(msg.content);
		});

		const queue = new MessageQueueService(callback);

		const msg1 = { id: "1", content: "first", channel: {} } as Message;
		const msg2 = { id: "2", content: "second", channel: {} } as Message;

		queue.enqueue(msg1);
		queue.enqueue(msg2);

		// Allow async queue processing to run
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(callback).toHaveBeenCalledTimes(2);
		expect(processedMessages).toEqual(["first", "second"]);
	});

	it("should deduplicate messages using a sliding window", async () => {
		const callback = vi.fn().mockResolvedValue(undefined);
		const queue = new MessageQueueService(callback);
		const msg = { id: "dup-1", content: "hello", channel: {} } as Message;

		queue.enqueue(msg);
		queue.enqueue(msg); // Duplicate

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(callback).toHaveBeenCalledTimes(1);
	});
});

describe("ChaosChatV1 (Helpers)", () => {
	it("should sanitize bot self-mentions dynamically", () => {
		const mockClient = {
			user: { id: "bot-123" },
		} as any;

		const chaos = new ChaosChatV1(mockClient);

		const result = chaos.sanitizeReply("Hello <@bot-123> how are you?");
		const resultNickname = chaos.sanitizeReply(
			"Hello <@!bot-123> how are you?",
		);

		expect(result).toBe("Hello  how are you?");
		expect(resultNickname).toBe("Hello  how are you?");
	});

	it("should split messages exceeding character limit correctly", () => {
		const mockClient = {
			user: { id: "bot-123" },
		} as any;

		const chaos = new ChaosChatV1(mockClient);
		const longText = "a".repeat(2500);
		const chunks = (chaos as any).splitMessage(longText, 1000);

		expect(chunks.length).toBe(3);
		expect(chunks[0].length).toBeLessThanOrEqual(1000);
		expect(chunks[1].length).toBeLessThanOrEqual(1000);
		expect(chunks[2].length).toBeLessThanOrEqual(500);
	});

	it("should convert @DisplayName mentions back to <@UserId> safely using longest match", () => {
		const mockClient = {
			user: { id: "bot-123" },
		} as any;
		const chaos = new ChaosChatV1(mockClient);

		// Seed history to populate conversation display names
		messageHistoryServiceV2.clear();
		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-1",
			role: "user",
			content: "Hello Alice Smith",
			authorId: "user-1",
			authorName: "Alice Smith",
		});
		messageHistoryServiceV2.addMessage("channel-1", {
			messageId: "msg-2",
			role: "user",
			content: "Hello Alice",
			authorId: "user-2",
			authorName: "Alice",
		});

		const mockMsg = {
			id: "msg-3",
			channelId: "channel-1",
			author: { id: "user-3" },
			member: { displayName: "Charlie" },
		} as any;

		const result = (chaos as any).convertMentionsToIds(
			"Hey @Alice Smith and @Alice!",
			"channel-1",
			mockMsg,
			null,
		);

		expect(result).toBe("Hey <@user-1> and <@user-2>!");
	});
});

describe("WelcomeService Fallbacks", () => {
	it("should fall back to systemChannel if configured target is mismatched", async () => {
		const mockSystemChannel = {
			id: "sys-channel",
			permissionsFor: vi.fn().mockReturnValue({ has: () => true }),
		};
		const mockMember = {
			id: "user-1",
			guild: {
				name: "Test Guild",
				systemChannel: mockSystemChannel,
				channels: {
					cache: {
						find: () => null,
					},
				},
				members: {
					me: { id: "bot-id" },
				},
			},
		} as unknown as GuildMember;

		const mockClient = {
			channels: {
				fetch: vi.fn().mockRejectedValue(new Error("Unknown Channel")),
			},
		} as any;

		const welcome = new WelcomeService(mockClient, {
			targetChannelId: "missing-channel",
		});
		const fallbackChannel = (welcome as any).getFallbackChannel(mockMember);

		expect(fallbackChannel?.id).toBe("sys-channel");
	});
});
