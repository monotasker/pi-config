/**
 * Generic Web Search Extension
 *
 * Adds a flexible web search tool that supports multiple APIs:
 * - Tavily (agent-oriented search + snippets)
 * - Exa (semantic search with content extraction)
 * - Brave (independent index + LLM context)
 * - Serper (Google SERP as JSON)
 * - DuckDuckGo (fallback, using ddg-search package)
 *
 * API keys are fetched dynamically:
 * 1. From environment variables first (TAVILY_API_KEY, EXA_API_KEY, etc.)
 * 2. If not found, from ssec: ssec get tavily-api-key
 *
 * The extension automatically uses available APIs and falls back to ddg-search if needed.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";

// API-specific result types
interface SearchResult {
	title: string;
	url: string;
	description?: string;
	content?: string; // for APIs that provide content extraction (Exa)
}

interface SearchDetails {
	query: string;
	resultsCount: number;
	answersCount: number;
	sourceApi?: string; // which API was used
	results: SearchResult[];
}

// Common search parameters
const SearchParams = Type.Object({
	query: Type.String({
		description:
			"Search query to look up on the web. Be specific for better results.",
	}),
	maxResults: Type.Optional(
		Type.Number({
			description: "Maximum number of results to return (default: 5, max: 10)",
			minimum: 1,
			maximum: 10,
			default: 5,
		})
	),
});

/**
 * Fetch an API key from ssec
 */
async function fetchApiKeyFromSsec(service: string): Promise<string | null> {
	try {
		const { execFile } = await import("child_process");
		const util = await import("util");
		const execFilePromise = util.promisify(execFile);

		const { stdout } = await execFilePromise("ssec", ["get", service]);
		return stdout.trim();
	} catch (error) {
		// Silently return null if ssec fails or key not found
		return null;
	}
}

/**
 * Get API key from environment variable or ssec
 */
async function getApiKey(envVarName: string, ssecService: string): Promise<string | null> {
	// First check environment variable
	const envKey = process.env[envVarName];
	if (envKey) {
		return envKey;
	}

	// Fall back to ssec
	return await fetchApiKeyFromSsec(ssecService);
}

/**
 * Check if any API keys are available
 */
async function hasAnyApiKey(): Promise<boolean> {
	const keys = [
		process.env.TAVILY_API_KEY,
		process.env.EXA_API_KEY,
		process.env.BRAVE_SEARCH_API_KEY,
		process.env.SERPER_API_KEY,
	];
	
	if (keys.some(k => !!k)) {
		return true;
	}

	// Check if ssec has any keys
	const ssecKeys = await Promise.all([
		fetchApiKeyFromSsec("tavily-api-key"),
		fetchApiKeyFromSsec("exa-api-key"),
		fetchApiKeyFromSsec("brave-search-api-key"),
		fetchApiKeyFromSsec("serper-api-key"),
	]);

	return ssecKeys.some(k => !!k);
}

/**
 * Fetch results from Tavily API
 */
async function fetchTavilyResults(
	query: string,
	maxResults: number = 5
): Promise<SearchResult[] | null> {
	const apiKey = await getApiKey("TAVILY_API_KEY", "tavily-api-key");
	if (!apiKey) return null;

	try {
		const response = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				search_depth: "basic",
				max_results: maxResults,
				include_answer: false,
			}),
		});

		if (!response.ok) {
			console.error("Tavily API error:", response.statusText);
			return null;
		}

		const data = await response.json();
		
		if (!data.results || !Array.isArray(data.results)) {
			return [];
		}

		return data.results.map((item: any) => ({
			title: item.title,
			url: item.url,
			description: item.content || "",
		}));
	} catch (error) {
		console.error("Tavily search failed:", error);
		return null;
	}
}

/**
 * Fetch results from Exa API
 */
async function fetchExaResults(
	query: string,
	maxResults: number = 5
): Promise<SearchResult[] | null> {
	const apiKey = await getApiKey("EXA_API_KEY", "exa-api-key");
	if (!apiKey) return null;

	try {
		const response = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"x-api-key": apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				numResults: maxResults,
				type: "auto",
				contents: { text: true },
			}),
		});

		if (!response.ok) {
			console.error("Exa API error:", response.statusText);
			return null;
		}

		const data = await response.json();
		
		if (!data.results || !Array.isArray(data.results)) {
			return [];
		}

		return data.results.map((item: any) => ({
			title: item.title,
			url: item.url,
			description: item.text || "",
			content: item.text || undefined,
		}));
	} catch (error) {
		console.error("Exa search failed:", error);
		return null;
	}
}

/**
 * Fetch results from Brave API
 */
async function fetchBraveResults(
	query: string,
	maxResults: number = 5
): Promise<SearchResult[] | null> {
	const apiKey = await getApiKey("BRAVE_SEARCH_API_KEY", "brave-search-api-key");
	if (!apiKey) return null;

	try {
		const url = new URL("https://api.search.brave.com/res/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", maxResults.toString());

		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
				"X-Subscription-Token": apiKey,
			},
		});

		if (!response.ok) {
			console.error("Brave API error:", response.statusText);
			return null;
		}

		const data = await response.json();
		
		if (!data.web?.results || !Array.isArray(data.web.results)) {
			return [];
		}

		return data.web.results.map((item: any) => ({
			title: item.title,
			url: item.url,
			description: item.description || "",
		}));
	} catch (error) {
		console.error("Brave search failed:", error);
		return null;
	}
}

/**
 * Fetch results from Serper API
 */
async function fetchSerperResults(
	query: string,
	maxResults: number = 5
): Promise<SearchResult[] | null> {
	const apiKey = await getApiKey("SERPER_API_KEY", "serper-api-key");
	if (!apiKey) return null;

	try {
		const response = await fetch("https://google.serper.dev/search", {
			method: "POST",
			headers: {
				"X-API-KEY": apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ 
				q: query, 
				gl: "us", 
				hl: "en", 
				num: maxResults 
			}),
		});

		if (!response.ok) {
			console.error("Serper API error:", response.statusText);
			return null;
		}

		const data = await response.json();
		
		if (!data.organic || !Array.isArray(data.organic)) {
			return [];
		}

		return data.organic.map((item: any) => ({
			title: item.title,
			url: item.link,
			description: item.snippet || "",
		}));
	} catch (error) {
		console.error("Serper search failed:", error);
		return null;
	}
}

/**
 * Fallback: Fetch results from DuckDuckGo using ddg-search package
 */
async function fetchDuckDuckGoResults(
	query: string,
	maxResults: number = 5
): Promise<SearchResult[] | null> {
	try {
		const { search } = await import("ddg-search");
		
		if (typeof search !== "function") {
			return null;
		}

		const ddgResults = await search(query, {
			maxResults,
			timeout: 10000,
		});

		if (!ddgResults || !Array.isArray(ddgResults)) {
			return [];
		}

		return ddgResults.map((item: any) => ({
			title: item.title,
			url: item.url,
			description: item.snippet || item.description || "",
		}));
	} catch (error) {
		console.error("DuckDuckGo search failed:", error);
		
		if ((error as any)?.code === "MODULE_NOT_FOUND") {
			return null;
		}
		
		return [];
	}
}

/**
 * Try multiple APIs in priority order until one succeeds
 */
async function fetchSearchResults(
	query: string,
	maxResults: number = 5
): Promise<{ results: SearchResult[]; sourceApi?: string } | null> {
	const apis = [
		{ name: "tavily", fetcher: fetchTavilyResults },
		{ name: "exa", fetcher: fetchExaResults },
		{ name: "brave", fetcher: fetchBraveResults },
		{ name: "serper", fetcher: fetchSerperResults },
		{ name: "ddg-search", fetcher: fetchDuckDuckGoResults },
	];

	for (const api of apis) {
		const results = await api.fetcher(query, maxResults);
		if (results && results.length > 0) {
			return { results, sourceApi: api.name };
		}
	}

	return null;
}

export default function (pi: ExtensionAPI) {
	// Register the search tool
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using multiple search APIs (Tavily, Exa, Brave, Serper, DuckDuckGo). " +
			"Use this when you need current information, news, or general knowledge not in your training data.",
		promptSnippet:
			"Can perform web searches to find current information and facts",
		promptGuidelines: [
			"Use web_search for questions requiring up-to-date information",
			"Use specific queries for better results (e.g., 'site:example.com topic' or 'topic site:example.com')",
			"After searching, analyze and synthesize the results rather than just quoting them",
			"If the first API doesn't return good results, the system automatically tries alternatives",
		],
		parameters: SearchParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const hasKeys = await hasAnyApiKey();
			
			if (!hasKeys) {
				return {
					content: [
						{
							type: "text",
							text:
								"ERROR: No search APIs are configured. " +
								"Set one or more API keys via environment variables:\n" +
								"- TAVILY_API_KEY\n" +
								"- EXA_API_KEY\n" +
								"- BRAVE_SEARCH_API_KEY\n" +
								"- SERPER_API_KEY\n\n" +
								"Or configure ssec with the corresponding service names.",
						},
					],
					isError: true,
					details: {
						query: params.query,
						error: "No API keys configured",
					},
				};
			}

			const result = await fetchSearchResults(
				params.query,
				params.maxResults ?? 5
			);

			if (result === null) {
				return {
					content: [
						{
							type: "text",
							text:
								"ERROR: No search APIs returned results. " +
								"All configured APIs may be unavailable or returned empty results.",
						},
					],
					isError: true,
					details: {
						query: params.query,
						error: "All API searches failed",
					},
				};
			}

			const { results, sourceApi } = result;

			if (results.length === 0) {
				return {
					content: [
						{
							type: "text",
							text:
								`No results found for: "${params.query}". ` +
								"Try rephrasing your query or checking spelling.",
						},
					],
					details: { 
						query: params.query, 
						resultsCount: 0, 
						answersCount: 0, 
						results: [],
						sourceApi,
					},
				};
			}

			// Build result content
			let contentText = `Search results for: "${params.query}"\n\n`;
			
			if (sourceApi) {
				contentText += `Source API: ${sourceApi}\n\n`;
			}
			
			contentText += `## Results (${results.length} found)\n\n`;

			results.forEach((result, index) => {
				contentText += `${index + 1}. ${result.title}\n`;
				if (result.description) {
					contentText += `   ${result.description}\n`;
				}
				contentText += `   URL: ${result.url}\n\n`;
			});

			return {
				content: [{ type: "text", text: contentText }],
				details: {
					query: params.query,
					resultsCount: results.length,
					answersCount: 0, // None of these APIs provide structured answers
					sourceApi,
					results,
				},
			};
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("web_search ")) +
				theme.fg("muted", `"${args.query}"`);
			
			if (args.maxResults && args.maxResults !== 5) {
				text += ` ${theme.fg("dim", `(max ${args.maxResults} results)`)}`;
			}
			
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as SearchDetails | undefined;
			if (!details || result.isError) {
				const text = result.content[0];
				return new Text(
					text?.type === "text" ? text.text : "",
					0,
					0
				);
			}

			let output = theme.fg("success", "✓ ") +
				theme.fg("accent", details.query);

			if (details.sourceApi) {
				output += ` (${theme.fg("dim", details.sourceApi)})`;
			}
			
			output += theme.fg("muted", ` (${details.resultsCount} results)`);

			if (expanded && details.results.length > 0) {
				output += "\n\n";
				
				details.results.forEach((r, i) => {
					output += `${theme.fg("accent", `#${i + 1}`)} ${theme.fg("text", r.title)}\n`;
					if (r.description) {
						output += `  ${theme.fg("dim", r.description)}\n`;
					}
					output += `  ${theme.fg("muted", r.url)}\n\n`;
				});
			}

			return new Text(output, 0, 0);
		},
	});

	// Optional: Register a command for direct search from terminal
	pi.registerCommand("search", {
		description:
			"Search the web using configured APIs. Usage: /search <query> [max_results]",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify(
					"Usage: /search <query> [max_results]",
					"warning"
				);
				return;
			}

			const parts = args.trim().split(/\s+/);
			const query = parts.slice(0, -1).join(" ");
			const maxResults = parseInt(parts[parts.length - 1], 10) || 5;

			ctx.ui.notify(`Searching web for: ${query}`, "info");

			// Execute the tool programmatically
			try {
				const result = await ctx.executeTool("web_search", {
					query,
					maxResults,
				});

				if (result.isError) {
					ctx.ui.notify(
						result.content[0]?.type === "text" ? result.content[0].text : "Unknown error",
						"error"
					);
				} else {
					ctx.ui.notify(`Search complete. Check the transcript for results.`, "success");
				}
			} catch (error) {
				ctx.ui.notify(
					`Error executing search: ${String(error)}`,
					"error"
				);
			}
		},
	});
}
