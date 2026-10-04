import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Warn before making edits or writes
  pi.on("tool_call", async (event, ctx) => {
    
    if ((event.toolName === "edit" || event.toolName === "write") && !event.input.path?.includes(".pi/")) {
      const approved = await ctx.ui.confirm(
        "Approve change",
        `Allow ${event.toolName} on ${event.input.path}?`,
        { timeout: 30000 } // 30 second timeout
      );
      if (!approved) {
        return { block: true, reason: "User declined change" };
      }
    }

    // Require approval for file deletion
    if (event.toolName === "bash") {
      const command = event.input.command;
      
      // Block package installations/uninstallations
      if (/^(pnpm|npm|yarn|bun)\s+(add|install|remove|uninstall)/.test(command)) {
        const approved = await ctx.ui.confirm(
          "Approve dependency change",
          `Allow this command that modifies packages:\n${command}`,
          { timeout: 30000 }
        );
        if (!approved) {
          return { block: true, reason: "User declined package modification" };
        }
      }

      // Block web downloads (curl, wget, etc.)
      if (/^(curl|wget|fetch|node)/.test(command.trim().split(/\s+/)[0])) {
        const approved = await ctx.ui.confirm(
          "Approve download",
          `Allow this command that downloads from the web:\n${command}`,
          { timeout: 30000 }
        );
        if (!approved) {
          return { block: true, reason: "User declined download" };
        }
      }

      // Block file deletion
      if (command.trim().startsWith("rm")) {
        // Extract paths from rm command
        const pathMatches = Array.from(command.matchAll(/rm\s+(?:-[^\s]*\s+)*([^\s]+)/g)).map(m => m[1]);
        const filesToDelete = pathMatches.filter(p => !p.includes(".pi/") && !p.startsWith("."));

        if (filesToDelete.length > 0) {
          // Check if there's UI available for interactive confirmation
          if (!ctx.hasUI) {
            // No UI available - skip approval but log a warning
            ctx.ui.notify(`File deletion detected in non-interactive mode: ${filesToDelete.join(", ")}`, "warning");
            // Don't block the operation, just warn
            return;
          }

          // Check if user wants to review each deletion individually
          const reviewIndividually = await ctx.ui.confirm(
            "Approve bulk deletion",
            `This command will delete ${filesToDelete.length} file(s). Review each deletion individually?`,
            { timeout: 30000 } // 30 second timeout
          );

          if (reviewIndividually === undefined) {
            // Timeout occurred - block the operation for safety
            return { block: true, reason: "Approval timeout" };
          }

          if (reviewIndividually) {
            for (const filePath of filesToDelete) {
              const approved = await ctx.ui.confirm(
                "Approve deletion",
                `Allow deletion of ${filePath}?`,
                { timeout: 30000 } // 30 second timeout
              );
              
              if (approved === undefined) {
                return { block: true, reason: "Approval timeout" };
              }
              
              if (!approved) {
                return { block: true, reason: "User declined file deletion" };
              }
            }
          } else {
            // Single prompt for all deletions
            const approved = await ctx.ui.confirm(
              "Approve bulk deletion",
              `Allow deletion of ${filesToDelete.length} file(s):\n- ${filesToDelete.join("\n- ")}`.trim(),
              { timeout: 30000 } // 30 second timeout
            );
            
            if (approved === undefined) {
              return { block: true, reason: "Approval timeout" };
            }
            
            if (!approved) {
              return { block: true, reason: "User declined bulk file deletion" };
            }
          }
        }
      }
    }
  });
}
