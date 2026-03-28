import { parseDocument, stringify } from "yaml";

const DAPIPE_ACTION_REF = "yevgeniyo-ps/dapipe@main";

const SETUP_STEP = {
  name: "DaPipe Setup",
  uses: DAPIPE_ACTION_REF,
  with: {
    step: "setup",
    mode: "monitor",
    "api-key": "${{ secrets.DAPIPE_API_KEY }}",
  },
};

const ANALYZE_STEP = {
  name: "DaPipe Analyze",
  if: "always()",
  uses: DAPIPE_ACTION_REF,
  with: {
    step: "analyze",
    mode: "monitor",
    "api-key": "${{ secrets.DAPIPE_API_KEY }}",
  },
};

function isDaPipeStep(step: any): boolean {
  if (!step || typeof step !== "object") return false;
  const uses = step.uses || step.get?.("uses");
  if (typeof uses === "string" && uses.includes("dapipe")) return true;
  const name = step.name || step.get?.("name");
  if (typeof name === "string" && name.toLowerCase().includes("dapipe"))
    return true;
  return false;
}

function isUbuntuRunner(runsOn: any): boolean {
  if (typeof runsOn === "string")
    return runsOn.includes("ubuntu") || runsOn.includes("linux");
  if (Array.isArray(runsOn))
    return runsOn.some(
      (r: string) => r.includes("ubuntu") || r.includes("linux")
    );
  return false;
}

export function injectDaPipeSteps(yamlContent: string): {
  modified: string;
  jobsModified: string[];
  skippedJobs: Array<{ name: string; reason: string }>;
  alreadyInstrumented: boolean;
} {
  const doc = parseDocument(yamlContent);
  const jobs = doc.get("jobs");
  if (!jobs || typeof jobs !== "object") {
    return {
      modified: yamlContent,
      jobsModified: [],
      skippedJobs: [],
      alreadyInstrumented: false,
    };
  }

  const jobsModified: string[] = [];
  const skippedJobs: Array<{ name: string; reason: string }> = [];
  let alreadyCount = 0;

  // Parse as plain JS for easier manipulation
  const parsed = doc.toJSON();
  if (!parsed.jobs) {
    return {
      modified: yamlContent,
      jobsModified: [],
      skippedJobs: [],
      alreadyInstrumented: false,
    };
  }

  for (const [jobName, job] of Object.entries(parsed.jobs as Record<string, any>)) {
    // Skip reusable workflow calls (uses: instead of steps:)
    if (job.uses && !job.steps) {
      skippedJobs.push({ name: jobName, reason: "reusable workflow" });
      continue;
    }

    if (!job.steps || !Array.isArray(job.steps)) {
      skippedJobs.push({ name: jobName, reason: "no steps" });
      continue;
    }

    // Skip non-linux runners
    if (job["runs-on"] && !isUbuntuRunner(job["runs-on"])) {
      skippedJobs.push({ name: jobName, reason: "non-linux runner" });
      continue;
    }

    // Check if already instrumented
    const hasDaPipe = job.steps.some((s: any) => isDaPipeStep(s));
    if (hasDaPipe) {
      alreadyCount++;
      continue;
    }

    // Find checkout step index
    const checkoutIdx = job.steps.findIndex(
      (s: any) =>
        s.uses && typeof s.uses === "string" && s.uses.includes("actions/checkout")
    );

    // Insert setup after checkout (or at index 0)
    const insertIdx = checkoutIdx >= 0 ? checkoutIdx + 1 : 0;
    job.steps.splice(insertIdx, 0, { ...SETUP_STEP });

    // Append analyze at end
    job.steps.push({ ...ANALYZE_STEP });

    jobsModified.push(jobName);
  }

  const totalJobs = Object.keys(parsed.jobs).length;
  const alreadyInstrumented =
    alreadyCount > 0 && alreadyCount + skippedJobs.length === totalJobs;

  if (jobsModified.length === 0) {
    return {
      modified: yamlContent,
      jobsModified,
      skippedJobs,
      alreadyInstrumented,
    };
  }

  // Re-serialize, preserving the document structure as much as possible
  // We use stringify on the modified JS object since we've manipulated it at the JS level
  const modified = stringify(parsed, { lineWidth: 0 });

  return { modified, jobsModified, skippedJobs, alreadyInstrumented };
}

export function removeDaPipeSteps(yamlContent: string): {
  modified: string;
  jobsCleaned: string[];
  hadDaPipe: boolean;
} {
  const parsed = parseDocument(yamlContent).toJSON();
  if (!parsed.jobs) {
    return { modified: yamlContent, jobsCleaned: [], hadDaPipe: false };
  }

  const jobsCleaned: string[] = [];
  let hadDaPipe = false;

  for (const [jobName, job] of Object.entries(parsed.jobs as Record<string, any>)) {
    if (!job.steps || !Array.isArray(job.steps)) continue;

    const originalLength = job.steps.length;
    job.steps = job.steps.filter((s: any) => !isDaPipeStep(s));

    if (job.steps.length < originalLength) {
      jobsCleaned.push(jobName);
      hadDaPipe = true;
    }
  }

  if (!hadDaPipe) {
    return { modified: yamlContent, jobsCleaned: [], hadDaPipe: false };
  }

  const modified = stringify(parsed, { lineWidth: 0 });
  return { modified, jobsCleaned, hadDaPipe };
}
