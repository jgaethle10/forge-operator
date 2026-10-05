import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveCompetitionProviderSecrets } from "../raven/provider-secret-boundary.mjs";

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
}

function acceptedTerms(value) {
  return ["accepted", "already_accepted", "entered"].includes(String(value || "").trim().toLowerCase());
}

function submissionAuthorized(value) {
  return ["authorized_existing_terms_only", "approved_existing_terms_only"].includes(String(value || "").trim().toLowerCase());
}

function safeMessage(value) {
  const text = String(value || "Systemia autonomous submission").trim();
  return text.slice(0, 240) || "Systemia autonomous submission";
}

export async function runCommand(command, args, { env = process.env, cwd = process.cwd(), timeoutMs = 900000 } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => finish({
      code: 127,
      stdout,
      stderr: "",
      error_name: String(error?.code || error?.name || "spawn_error"),
    }));
    child.on("close", (code) => finish({ code: Number(code ?? 1), stdout, stderr, error_name: null }));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ code: 124, stdout, stderr: "", error_name: "timeout" });
    }, timeoutMs);
  });
}

function baseReceipt(job, state, extra = {}) {
  const body = {
    schema: "evercraft.systemia.competition-submission-receipt.v1",
    job_id: String(job?.job_id || ""),
    provider: String(job?.provider || ""),
    competition_ref: job?.competition_ref ? String(job.competition_ref) : null,
    state,
    submission_attempted: false,
    provider_receipt_verified: false,
    staking_attempted: false,
    payment_attempted: false,
    terms_accepted_by_agent: false,
    base44_used: false,
    public_fabric_used: false,
    secret_values_persisted: false,
    observed_at: new Date().toISOString(),
    ...extra,
  };
  return { ...body, receipt_hash: sha256(JSON.stringify(body)) };
}

function artifactExists(job, fsImpl) {
  const p = path.resolve(String(job?.artifact_path || ""));
  return Boolean(job?.artifact_path) && fsImpl.existsSync(p) && fsImpl.statSync(p).isFile();
}

function kaggleEnv(env, secret) {
  const childEnv = { ...env };
  if (secret.mode === "bearer") childEnv.KAGGLE_API_TOKEN = secret.access_token;
  if (secret.mode === "basic") {
    childEnv.KAGGLE_USERNAME = secret.username;
    childEnv.KAGGLE_KEY = secret.key;
  }
  return childEnv;
}

function numeraiEnv(env, secret, artifactPath, modelId) {
  return {
    ...env,
    NUMERAI_PUBLIC_ID: secret.public_id,
    NUMERAI_SECRET_KEY: secret.secret_key,
    SYSTEMIA_ARTIFACT_PATH: path.resolve(artifactPath),
    SYSTEMIA_NUMERAI_MODEL_ID: modelId,
  };
}

export async function executeSubmissionJob(job, {
  env = process.env,
  fsImpl = fs,
  runCommandImpl = runCommand,
} = {}) {
  if (!submissionAuthorized(job?.submission_authority || env.SYSTEMIA_COMPETITION_SUBMISSION_AUTHORITY)) {
    return baseReceipt(job, "held_submission_authority_missing");
  }
  if (String(job?.raven_qa_state || "").toLowerCase() !== "passed") {
    return baseReceipt(job, "held_raven_qa_not_passed");
  }
  if (!acceptedTerms(job?.terms_state)) {
    return baseReceipt(job, "held_human_terms_gate");
  }
  if (!artifactExists(job, fsImpl)) {
    return baseReceipt(job, "held_submission_artifact_missing");
  }

  const secrets = resolveCompetitionProviderSecrets(env);
  const provider = String(job?.provider || "").toLowerCase();
  const artifactPath = path.resolve(String(job.artifact_path));
  const message = safeMessage(job.message);

  if (provider === "kaggle") {
    if (!secrets.kaggle) return baseReceipt(job, "held_missing_credentials");
    if (!job.competition_ref) return baseReceipt(job, "held_competition_ref_missing");

    const result = await runCommandImpl("kaggle", [
      "competitions", "submit", String(job.competition_ref),
      "-f", artifactPath,
      "-m", message,
      "--wait", String(Number(job.wait_seconds || 600)),
    ], { env: kaggleEnv(env, secrets.kaggle) });

    if (result.code !== 0) {
      return baseReceipt(job, result.error_name === "ENOENT" ? "held_executor_unavailable" : "provider_submission_failed", {
        submission_attempted: result.error_name !== "ENOENT",
        command_exit_code: result.code,
        executor_error: result.error_name || null,
      });
    }
    const match = String(result.stdout || "").match(/Submission ref:\s*(\d+)/i);
    if (!match) {
      return baseReceipt(job, "provider_receipt_unverified", {
        submission_attempted: true,
        command_exit_code: result.code,
      });
    }
    return baseReceipt(job, "submitted_provider_receipt_verified", {
      submission_attempted: true,
      provider_receipt_verified: true,
      provider_submission_ref: match[1],
      command_exit_code: result.code,
    });
  }

  if (provider === "numerai") {
    if (!secrets.numerai) return baseReceipt(job, "held_missing_credentials");
    const modelId = String(job.model_id || env.SYSTEMIA_NUMERAI_MODEL_ID || "").trim();
    if (!modelId) return baseReceipt(job, "held_model_id_missing");

    const python = [
      "from numerapi import NumerAPI",
      "import json, os",
      "napi = NumerAPI()",
      "sid = napi.upload_predictions(os.environ['SYSTEMIA_ARTIFACT_PATH'], model_id=os.environ['SYSTEMIA_NUMERAI_MODEL_ID'])",
      "print(json.dumps({'submission_id': sid}))",
    ].join("; ");

    const result = await runCommandImpl("python3", ["-c", python], {
      env: numeraiEnv(env, secrets.numerai, artifactPath, modelId),
    });

    if (result.code !== 0) {
      return baseReceipt(job, result.error_name === "ENOENT" ? "held_executor_unavailable" : "provider_submission_failed", {
        submission_attempted: result.error_name !== "ENOENT",
        command_exit_code: result.code,
        executor_error: result.error_name || null,
      });
    }

    let submissionId = null;
    for (const line of String(result.stdout || "").trim().split(/\r?\n/).reverse()) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.submission_id) {
          submissionId = String(parsed.submission_id);
          break;
        }
      } catch {}
    }
    if (!submissionId) {
      return baseReceipt(job, "provider_receipt_unverified", {
        submission_attempted: true,
        command_exit_code: result.code,
      });
    }
    return baseReceipt(job, "submitted_provider_receipt_verified", {
      submission_attempted: true,
      provider_receipt_verified: true,
      provider_submission_ref: submissionId,
      command_exit_code: result.code,
    });
  }

  return baseReceipt(job, "held_unsupported_provider");
}

export const competitionSubmissionPolicy = {
  route: ["systemia", "build_test", "raven_qa", "raven_nexus", "provider_api"],
  submission: "autonomous_existing_terms_only",
  participation: "human_gate_if_new_terms_required",
  staking: "disabled",
  payments: "disabled",
};
