import type { Tool } from "../types/chat.types";

/**
 * Registry class to manage tools dynamically.
 * Allows registering, retrieving, and inspecting available tools.
 */
export class ToolRegistry {
	private tools = new Map<string, Tool>();

	/**
	 * Register a tool in the registry.
	 * @param tool - The tool to register
	 */
	register(tool: Tool): void {
		this.tools.set(tool.name, tool);
	}

	/**
	 * Get a tool by name.
	 * @param name - The name of the tool to retrieve
	 * @returns The tool if found, undefined otherwise
	 */
	get(name: string): Tool | undefined {
		return this.tools.get(name);
	}

	/**
	 * Check if a tool is registered.
	 * @param name - The name of the tool to check
	 * @returns true if the tool is registered, false otherwise
	 */
	has(name: string): boolean {
		return this.tools.has(name);
	}

	/**
	 * Get all available tools.
	 * @returns Array of all registered tools
	 */
	getAvailableTools(): Tool[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Get the names of all registered tools.
	 * @returns Array of tool names
	 */
	getToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	/**
	 * Unregister a tool.
	 * @param name - The name of the tool to unregister
	 * @returns true if the tool was removed, false if it wasn't registered
	 */
	unregister(name: string): boolean {
		return this.tools.delete(name);
	}

	/**
	 * Clear all registered tools.
	 */
	clear(): void {
		this.tools.clear();
	}

	/**
	 * Get the number of registered tools.
	 */
	get size(): number {
		return this.tools.size;
	}
}

/**
 * Default singleton instance of ToolRegistry.
 * Can be used for convenience, but dependency injection is recommended for testing.
 */
export const defaultToolRegistry = new ToolRegistry();
