// Copy-to-clipboard for the install command. No trackers, no network calls.
for (const button of document.querySelectorAll("[data-copy]")) {
  const label = button.querySelector("[data-label]");
  button.addEventListener("click", async () => {
    const text = document.getElementById(button.dataset.copy)?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      label.textContent = "Copied";
    } catch {
      // Clipboard blocked (http, old browser): select the text so the user can copy it.
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copy));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      label.textContent = "Selected";
    }
    setTimeout(() => (label.textContent = "Copy"), 2000);
  });
}
