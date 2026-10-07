// Auto-tests plugin for OpenCode 1.18.x
// Triggers lab tests after file edits to demo service in Practice 3.

export default async ({ $, project }) => {
  return {
    "tool.execute.after": async (input, output) => {
      try {
        if (input.tool !== "edit") return;
        const files = (output?.files) || [];
        const watched = new Set([
          "practices/practice_03/lab/demo/service.py",
          "practices/practice_03/lab/demo/test_service.py",
        ]);
        const touched = files.some(f => watched.has(f?.path || f));
        if (!touched) return;
        await $.bash({
          command: ["bash", "tools/run_lab_tests.sh"],
          cwd: project.directory,
        });
      } catch (e) {
        // swallow errors to avoid breaking the session
        $.log?.warn?.("auto-tests plugin error", String(e));
      }
    },
  };
};
