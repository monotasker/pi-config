import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let isLearningMode = false;

  pi.on("before_agent_start", async (event, ctx) => {
    if (!isLearningMode) return;

    const learningGuidance = `
You are in learning mode. Focus on:
1. Explaining concepts and principles
2. Providing educational examples (not executable code unless specifically asked)
3. Teaching the user how to solve problems themselves
4. Asking Socratic questions to guide understanding

IMPORTANT: Do NOT edit files unless explicitly instructed by the user. Instead, provide example code they can copy/paste.
`;

    // Prepend learning guidance to existing prompt
    event.systemPrompt = learningGuidance + "\n\n" + event.systemPrompt;
  });

  pi.registerCommand("learning-mode", {
    description: "Toggle learning mode (explain how to do things without editing files)",
    handler: async (_, ctx) => {
      isLearningMode = !isLearningMode;
      const status = isLearningMode ? "enabled" : "disabled";
      const behavior = isLearningMode
        ? "I'll focus on explaining rather than editing."
        : "I'll return to normal assistance (including file edits).";
      ctx.ui.notify(
        `Learning mode ${status}: ${behavior}`,
        "info"
      );
    }
  });
}
