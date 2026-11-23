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
