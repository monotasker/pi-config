import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Warn before making edits or writes
  pi.on("tool_call", async (event, ctx) => {
    if ((event.toolName === "edit" || event.toolName === "write") && !event.input.path?.includes(".pi/")) {
      const approved = await ctx.ui.confirm(
        "Approve change",
        `Allow ${event.toolName} on ${event.input.path}?`
      );
      if (!approved) {
        return { block: true, reason: "User declined change" };
      }
    }
  });
}
