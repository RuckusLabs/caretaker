// Checklist definitions. Edit these lists to change what caretakers see.
// "general" items apply to every shift; the shift-specific list is appended
// after them.
window.CARETAKER_CHECKLISTS = {
  general: [
    "Kitty litter scooped",
    "Vacuum",
    "Laundry",
    "Checking supplies/food stocks",
  ],
  morning: [
    "Check for cleaning/changing",
    "Ask for tea/coffee/breakfast",
    "Administer Amlodipine (1 tablet) with breakfast",
    "Keep eye on Elsie (tea, coffee, snacks)",
    "Before leaving, ensure Elsie is clean and has something to eat (lunch/snack)",
  ],
  afternoon: [
    "Check for cleaning/changing",
    "Ask for snack/dinner",
    "Before leaving, ensure Elsie is clean and is tucked in with charged phone and water",
  ],
};

// Shift is auto-detected from the time of sign-in against these windows
// (24h clock). A sign-in inside a window uses that shift; outside both
// windows (e.g. someone signs in early/late), it falls back to whichever
// shift is closer in time — see detectShift() in app.js.
window.CARETAKER_SHIFT_WINDOWS = {
  morning: { start: 7, end: 13 },
  afternoon: { start: 16, end: 20 },
};
