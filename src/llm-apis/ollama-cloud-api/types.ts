export interface OllamaCloudConfig {
	baseUrl: string;
	cookie?: string;
}

export interface OllamaMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface OllamaChatRequest {
	model: string;
	messages: OllamaMessage[];
	stream?: false;
}

export interface CloudChatResponse {
	status: "success" | "failed";
	content: string | null;
}
