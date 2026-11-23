const assessment = document.querySelector("#security-assessment");
const assessmentButton = document.querySelector("#security-assessment-button");
const assessmentResult = document.querySelector("#security-result");
const assessmentTitle = document.querySelector("#security-result-title");
const assessmentSummary = document.querySelector("#security-result-summary");
const assessmentFixes = document.querySelector("#security-result-fixes");

function showResult(title, summary, fixes = []) {
  assessmentTitle.textContent = title;
  assessmentSummary.textContent = summary;
  assessmentFixes.replaceChildren(...fixes.map((fix) => {
    const item = document.createElement("li");
    item.textContent = fix;
    return item;
  }));
  assessmentFixes.hidden = fixes.length === 0;
  assessmentResult.hidden = false;
  assessmentResult.focus();
}

assessment.elements.website.addEventListener("input", () => {
  assessment.elements.website.setCustomValidity("");
  assessmentResult.hidden = true;
});

assessment.addEventListener("submit", async (event) => {
  event.preventDefault();
  const website = assessment.elements.website;
  const address = website.value.trim();
  let host;
  try {
    const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
    if (!url.hostname.includes(".") || url.username || url.password || url.port || /[\s\\]/.test(address)) {
      throw new Error("Invalid website address");
    }
    host = url.hostname.replace(/\.$/, "");
  } catch {
    website.setCustomValidity("Enter a public website address, such as example.com.");
    website.reportValidity();
    return;
  }

  assessmentButton.disabled = true;
  website.readOnly = true;
  assessmentButton.textContent = "Checking website…";
  assessmentResult.hidden = true;
  const endpoint = new URL("https://hoosier-valley-webworks-grade.onrender.com/grade");
  endpoint.searchParams.set("host", host);

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok) {
      showResult("Grade unavailable", result.error);
      return;
    }
    showResult(`Preliminary grade: ${result.grade}`,
      `${result.host} · HTTPS connected. ${result.passed} of ${result.total} security header checks passed.`,
      result.fixes);
  } catch {
    showResult("Grade unavailable", "The review service couldn’t respond. Please try again shortly.");
  } finally {
    website.readOnly = false;
    assessmentButton.disabled = false;
    assessmentButton.textContent = "Show my security grade";
  }
});

assessmentButton.disabled = false;
