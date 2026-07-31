/**
 * Default registry initializer for ChaosChatV1 tools.
 * This module exports a pre-configured ToolRegistry with all standard tools registered.
 */

import {
	GetActiveMembersTool,
	getActiveMembersTool,
} from "./get-active-members.tool";
import { GetDateTool, getDateTool } from "./get-date.tool";
import {
	GetUserDetailsTool,
	getUserDetailsTool,
} from "./get-user-details.tool";
import { defaultToolRegistry, ToolRegistry } from "./tool-registry";

export {
	GetActiveMembersTool,
	getActiveMembersTool,
} from "./get-active-members.tool";
export { GetDateTool, getDateTool } from "./get-date.tool";
export {
	GetUserDetailsTool,
	getUserDetailsTool,
} from "./get-user-details.tool";
// Re-export types and classes for convenience
export { defaultToolRegistry, ToolRegistry } from "./tool-registry";

/**
 * Create a new ToolRegistry with all standard tools pre-registered.
 * @returns A new ToolRegistry instance with standard tools
 */
export function createStandardToolRegistry(): ToolRegistry {
	const registry = new ToolRegistry();

	// Register all standard tools
	registry.register(new GetDateTool());
	registry.register(new GetActiveMembersTool());
	registry.register(new GetUserDetailsTool());

	return registry;
}

/**
 * Default registry instance with all standard tools pre-registered.
 * This is a singleton that can be imported and used directly.
 */
export const standardToolRegistry = createStandardToolRegistry();

// Also register tools in the default registry for backward compatibility
// This ensures defaultToolRegistry has the standard tools
defaultToolRegistry.register(getDateTool);
defaultToolRegistry.register(getActiveMembersTool);
defaultToolRegistry.register(getUserDetailsTool);
