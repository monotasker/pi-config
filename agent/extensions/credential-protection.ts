/**
 * Credential File Protection Extension
 *
 * Prompts for UI confirmation before reading/writing sensitive files.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const credentialPatterns = [
		/\.env($|\.)/,
		/.invenio\.private$/,
		/docker\/nginx_local\//,
		/\.private$/,
	];

	function isCredentialPath(path: string): boolean {
		return credentialPatterns.some((pattern) => pattern.test(path));
	}

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "read") return undefined;

		const path = event.input.path as string;
		
		if (!isCredentialPath(path)) return undefined;

		if (ctx.hasUI) {
			const choice = await ctx.ui.select(
				`Read credential file?\n\n  ${path}\n\nAllow access?`,
				["Yes", "No"]
			);

			if (choice !== "Yes") {
				return { block: true, reason: "Blocked by user - credential file access denied" };
			}
		} else {
			return { 
				block: true, 
				reason: "Credential file access requires UI confirmation. Run with interactive mode enabled." 
			};
		}

		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

		const path = (event.input as { path: string }).path;
		
		if (!isCredentialPath(path)) return undefined;

		if (ctx.hasUI) {
			const choice = await ctx.ui.select(
				`Write to credential file?\n\n  ${path}\n\nAllow modification?`,
				["Yes", "No"]
			);

			if (choice !== "Yes") {
				return { block: true, reason: "Blocked by user - credential file modification denied" };
			}
		} else {
			return { 
				block: true, 
				reason: "Credential file modification requires UI confirmation. Run with interactive mode enabled." 
			};
		}

		return undefined;
	});

	const blockedCommands = [
		/^printenv\b/,
		/^\s*env\s+--null\b/,
		/^\s*docker\s+compose\s+config\b/,
	];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;
		
		for (const pattern of blockedCommands) {
			if (pattern.test(command)) {
				return { 
					block: true, 
					reason: `Command blocked for security: "${command}" can leak environment variables` 
				};
			}
		}

		return undefined;
	});
}
