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

// Shift is auto-detected from the time of sign-in. Before this hour (24h
// clock) counts as "morning"; at or after it counts as "afternoon".
window.CARETAKER_SHIFT_CUTOFF_HOUR = 13;
