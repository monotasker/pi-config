import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const contextFiles = event.systemPromptOptions.contextFiles;
    
    if (contextFiles.length > 0) {
      const lines = [`Loaded ${contextFiles.length} context file(s):`, ""];
      
      for (const file of contextFiles) {
        lines.push(`• ${file.path} (${file.content.length} chars)`);
      }
      
      await ctx.ui.notify(lines.join("\n"), "info");
    } else {
      await ctx.ui.notify("No context files loaded", "warn");
    }
  });
}
