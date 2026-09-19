export interface OllamaCloudConfig {
	baseUrl: string;
	cookie?: string;
}

export interface OllamaMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface OllamaOptions {
	temperature?: number;
	top_p?: number;
	num_predict?: number;
	repeat_penalty?: number;
	[key: string]: unknown;
}

export interface OllamaChatRequest {
	model: string;
	messages: OllamaMessage[];
	stream?: false;
	options?: OllamaOptions;
}

export interface CloudChatResponse {
	status: "success" | "failed";
	content: string | null;
}
