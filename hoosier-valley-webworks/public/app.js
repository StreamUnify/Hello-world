const inquiry = document.querySelector("#inquiry");
const destination = document.querySelector('meta[name="inquiry-email"]')?.content.trim();
const directEmail = document.querySelector("#direct-email");
const status = document.querySelector("#form-status");

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

if (destination) {
  directEmail.href = `mailto:${destination}`;
  directEmail.textContent = destination;
  directEmail.hidden = false;
  document.querySelector("#inquiry-button").textContent = "Open email draft";
  document.querySelector("#form-note").textContent = "Review and send the draft from your email app.";
}

inquiry.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(inquiry);
  const subject = `Project inquiry — ${fields.get("service")}`;
  const body = [
    `Name: ${fields.get("name").trim()}`,
    `Email: ${fields.get("email").trim()}`,
    `Service: ${fields.get("service")}`,
    "",
    fields.get("details").trim(),
  ].join("\n");

  if (destination) {
    window.location.href = `mailto:${destination}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = "Your email app can open the draft. You can also email me directly using the address on this page.";
    return;
  }

  const url = URL.createObjectURL(new Blob([`${subject}\n\n${body}\n`], { type: "text/plain" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = "project-brief.txt";
  document.body.append(download);
  download.click();
  download.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = "Your project brief is ready. Check your downloads.";
});

document.querySelector("#inquiry-button").disabled = false;
