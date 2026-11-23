const inquiry = document.querySelector("#inquiry");
const submitButton = document.querySelector("#inquiry-button");
const formStatus = document.querySelector("#form-status");

document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    inquiry.elements.service.value = link.dataset.service;
  });
});

document.querySelectorAll("[data-project]").forEach((link) => {
  link.addEventListener("click", () => {
    const project = document.querySelector(link.hash);
    project.querySelector("details").open = true;
  });
});

inquiry.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;

  const submission = Object.fromEntries(new FormData(inquiry));
  submission.name = submission.name.trim();
  submission.email = submission.email.trim();
  submission.details = submission.details.trim();
  if (submission.service === "Free demo") {
    submission._subject = "New Hoosier Valley Webworks free demo request";
  } else if (submission.service === "Full website security report") {
    submission._subject = "New Hoosier Valley Webworks full security report request";
  }

  if (!submission.name || !submission.details) {
    formStatus.textContent = "Enter your name and project details before sending.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  formStatus.textContent = "Sending your inquiry…";

  try {
    const response = await fetch(inquiry.action, {
      method: inquiry.method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || (result.success !== true && result.success !== "true")) {
      throw new Error("The form service did not accept the inquiry.");
    }

    inquiry.reset();
    formStatus.textContent = "Thanks! Your inquiry was sent.";
  } catch {
    formStatus.textContent = "We couldn’t confirm that your inquiry was sent. Your details are still here. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit";
  }
});

submitButton.disabled = false;

const assessment = document.querySelector("#security-assessment");
const assessmentButton = document.querySelector("#security-assessment-button");
const assessmentResult = document.querySelector("#security-result");
const assessmentTitle = document.querySelector("#security-result-title");
const assessmentSummary = document.querySelector("#security-result-summary");
const assessmentFixes = document.querySelector("#security-result-fixes");

const securityControls = [
  { name: "https", fix: "Serve every page over HTTPS and redirect HTTP traffic to HTTPS.", verify: "Confirm that every page uses HTTPS." },
  { name: "signin", fix: "Require two-factor sign-in for every administrator.", verify: "Check whether every administrator uses two-factor sign-in." },
  { name: "permissions", fix: "Remove unused admin access and give each person only the permissions they need.", verify: "Review who has admin access and whether they still need it." },
  { name: "forms", fix: "Validate form submissions on the server before processing them.", verify: "Confirm that form inputs are validated on the server." },
];

assessment.addEventListener("input", () => {
  assessment.elements.website.setCustomValidity("");
  assessmentResult.hidden = true;
});

assessment.addEventListener("submit", (event) => {
  event.preventDefault();
  const website = assessment.elements.website;
  const address = website.value.trim();
  let site;
  try {
    site = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
    if (!/^[a-z\d-]+(?:\.[a-z\d-]+)*\.(?:[a-z]{2,}|xn--[a-z\d-]+)\.?$/i.test(site.hostname)
        || site.username || site.password || /\s/.test(address)) {
      throw new Error("Invalid public website URL");
    }
  } catch {
    website.setCustomValidity("Enter a public website address, such as example.com.");
    website.reportValidity();
    return;
  }

  const applicable = securityControls.filter(({ name }) => assessment.elements[name].value !== "na");
  const confirmed = applicable.filter(({ name }) => assessment.elements[name].value === "yes");
  const missing = applicable.filter(({ name }) => assessment.elements[name].value === "no");
  const unknown = applicable.filter(({ name }) => assessment.elements[name].value === "unknown");
  const answered = confirmed.length + missing.length;
  const score = answered ? confirmed.length / answered : 0;
  const grades = [[1, "A"], [.75, "B"], [.5, "C"], [.25, "D"], [0, "F"]];
  const letter = grades.find(([minimum]) => score >= minimum)[1];
  const grade = letter === "A" && unknown.length ? "B" : letter;

  assessmentTitle.textContent = answered < 2 ? "Not enough information to grade" : `Preliminary grade: ${grade}`;
  assessmentSummary.textContent = `${site.hostname} · ${confirmed.length} safeguards reported in place, ${missing.length} missing, ${unknown.length} unknown.`;
  const priorities = [...missing.map(({ fix }) => fix), ...unknown.map(({ verify }) => verify)].slice(0, 3);
  assessmentFixes.replaceChildren(...priorities.map((priority) => {
    const item = document.createElement("li");
    item.textContent = priority;
    return item;
  }));
  assessmentFixes.hidden = priorities.length === 0;
  assessmentResult.hidden = false;
  assessmentResult.focus();
});

assessmentButton.disabled = false;
