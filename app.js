const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.75, 0.5, 0.25];
const LBS_PLATES = [45, 35, 25, 10, 5, 2.5, 1.25, 1, 0.5, 0.25];
const RAMP_FIVE = [0.5, 0.625, 0.75, 0.875, 1];
const RAMP_FOUR = [0.625, 0.75, 0.875, 1];

const defaults = {
  kg: {
    lifts: {
      squat: { name: "Back Squat", max: 120, increment: 2.5 },
      bench: { name: "Bench Press", max: 85, increment: 1 },
      row: { name: "Barbell Row", max: 75, increment: 1 },
      deadlift: { name: "Deadlift", max: 145, increment: 2.5 },
      incline: { name: "Incline Bench", max: 65, increment: 1 },
      ohp: { name: "Overhead Press", max: 52.5, increment: 1 }
    },
    barWeight: 20,
    availablePlates: [...KG_PLATES]
  },
  lbs: {
    lifts: {
      squat: { name: "Back Squat", max: 265, increment: 5 },
      bench: { name: "Bench Press", max: 185, increment: 5 },
      row: { name: "Barbell Row", max: 165, increment: 5 },
      deadlift: { name: "Deadlift", max: 315, increment: 5 },
      incline: { name: "Incline Bench", max: 145, increment: 5 },
      ohp: { name: "Overhead Press", max: 115, increment: 5 }
    },
    barWeight: 45,
    availablePlates: [...LBS_PLATES]
  }
};

let state = loadState();
let activeWorkout = "A";

const liftInputs = document.querySelector("#liftInputs");
const workoutContent = document.querySelector("#workoutContent");
const weekNumber = document.querySelector("#weekNumber");
const rampWeeks = document.querySelector("#rampWeeks");
const pressChoice = document.querySelector("#pressChoice");
const unitToggle = document.querySelector("#unitToggle");
const barWeightInput = document.querySelector("#barWeightInput");
const showAssistance = document.querySelector("#showAssistance");
const exportButton = document.querySelector("#exportButton");
const importButton = document.querySelector("#importButton");
const importFile = document.querySelector("#importFile");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("madcow-planner"));
    const unit = saved?.unit || "kg";
    return {
      unit,
      lifts: saved?.lifts || structuredClone(defaults[unit].lifts),
      barWeight: saved?.barWeight !== undefined ? Number(saved.barWeight) : defaults[unit].barWeight,
      week: saved?.week || 1,
      rampWeeks: saved?.rampWeeks || 4,
      pressChoice: saved?.pressChoice || "incline",
      availablePlates: saved?.availablePlates?.length ? saved.availablePlates : [...defaults[unit].availablePlates],
      showAssistance: saved?.showAssistance || false,
      completedSets: saved?.completedSets || {}
    };
  } catch {
    return {
      unit: "kg",
      lifts: structuredClone(defaults.kg.lifts),
      barWeight: 20,
      week: 1,
      rampWeeks: 4,
      pressChoice: "incline",
      availablePlates: [...KG_PLATES],
      showAssistance: false,
      completedSets: {}
    };
  }
}

function saveState() {
  localStorage.setItem("madcow-planner", JSON.stringify(state));
}

function formatWeight(value) {
  return Number(value.toFixed(2)).toString();
}

function getPlatesList() {
  return state.unit === "kg" ? KG_PLATES : LBS_PLATES;
}

function convertWeight(weight, toUnit) {
  if (toUnit === "lbs") {
    return Math.round(weight * 2.20462 * 2) / 2;
  } else {
    return Math.round((weight / 2.20462) * 4) / 4;
  }
}

function loadFor(targetWeight) {
  const barWeight = state.barWeight;
  if (targetWeight <= barWeight) return { weight: barWeight, plates: [] };

  const unit = 0.25;
  const selected = state.availablePlates
    .map(plate => ({ plate, units: Math.round(plate / unit) }))
    .sort((a, b) => b.plate - a.plate);
  
  if (selected.length === 0) return { weight: barWeight, plates: [] };

  const targetSide = (targetWeight - barWeight) / 2;
  const targetUnits = targetSide / unit;
  const maxPlateUnits = Math.max(...selected.map(item => item.units));
  const limit = Math.ceil(targetUnits) + maxPlateUnits;
  const best = Array(limit + 1).fill(null);
  best[0] = [];

  for (let amount = 1; amount <= limit; amount += 1) {
    for (const item of selected) {
      const previous = amount - item.units;
      if (previous >= 0 && best[previous]) {
        const candidate = [...best[previous], item.plate];
        if (!best[amount] || candidate.length < best[amount].length) best[amount] = candidate;
      }
    }
  }

  let chosenUnits = 0;
  for (let amount = 1; amount <= limit; amount += 1) {
    if (!best[amount]) continue;
    const currentDifference = Math.abs(chosenUnits - targetUnits);
    const newDifference = Math.abs(amount - targetUnits);
    if (newDifference < currentDifference ||
        (newDifference === currentDifference && amount < chosenUnits) ||
        (newDifference === currentDifference && amount === chosenUnits && best[amount].length < best[chosenUnits].length)) {
      chosenUnits = amount;
    }
  }

  return {
    weight: barWeight + chosenUnits * unit * 2,
    plates: best[chosenUnits].sort((a, b) => b - a)
  };
}

function roundToLoadable(weight) {
  return loadFor(weight).weight;
}

function platesFor(totalWeight) {
  return loadFor(totalWeight).plates;
}

function topSet(liftKey, week = state.week) {
  const lift = state.lifts[liftKey];
  const weeksFromTarget = week - state.rampWeeks;
  return roundToLoadable(Number(lift.max) + weeksFromTarget * Number(lift.increment));
}

function rampSets(top, factors, reps = 5) {
  return factors.map((factor, index) => ({
    reps,
    target: top * factor,
    weight: roundToLoadable(top * factor),
    type: index === factors.length - 1 ? "TOP SET" : "RAMP"
  }));
}

function workoutFor(type) {
  const result = [];
  const mainLifts = ["squat", "bench", "row"];

  if (type === "A") {
    mainLifts.forEach(key => result.push({ key, sets: rampSets(topSet(key), RAMP_FIVE), isAssistance: false }));
    if (state.showAssistance) {
      result.push({
        key: "assistance_hypers",
        name: "Weighted Hyperextensions",
        isAssistance: true,
        sets: [
          { reps: "10-12", weightText: "Bodyweight / Weighted", type: "ASSISTANCE" },
          { reps: "10-12", weightText: "Bodyweight / Weighted", type: "ASSISTANCE" }
        ]
      });
      result.push({
        key: "assistance_situps",
        name: "Decline Situps",
        isAssistance: true,
        sets: Array(4).fill(null).map(() => ({ reps: "10-12", weightText: "Weighted", type: "ASSISTANCE" }))
      });
    }
  }

  if (type === "B") {
    const squatRamp = rampSets(topSet("squat"), RAMP_FIVE);
    result.push({ key: "squat", sets: [squatRamp[0], squatRamp[1], squatRamp[2], { ...squatRamp[2], type: "REPEAT" }], isAssistance: false });
    const pressKey = state.pressChoice;
    result.push({ key: pressKey, sets: rampSets(topSet(pressKey), RAMP_FOUR), isAssistance: false });
    result.push({ key: "deadlift", sets: rampSets(topSet("deadlift"), RAMP_FOUR), isAssistance: false });
    if (state.showAssistance) {
      result.push({
        key: "assistance_situps",
        name: "Weighted Situps",
        isAssistance: true,
        sets: Array(3).fill(null).map(() => ({ reps: "10-12", weightText: "Weighted", type: "ASSISTANCE" }))
      });
    }
  }

  if (type === "C") {
    mainLifts.forEach(key => {
      const aSets = rampSets(topSet(key), RAMP_FIVE);
      const increment = Number(state.lifts[key].increment);
      result.push({
        key,
        isAssistance: false,
        sets: [
          ...aSets.slice(0, 4),
          { reps: 3, target: topSet(key) + increment, weight: roundToLoadable(topSet(key) + increment), type: "HEAVY TRIPLE" },
          { reps: 8, target: aSets[2].target, weight: aSets[2].weight, type: "BACK-OFF" }
        ]
      });
    });
    if (state.showAssistance) {
      result.push({
        key: "assistance_dips",
        name: "Weighted Dips",
        isAssistance: true,
        sets: Array(3).fill(null).map(() => ({ reps: "5-8", weightText: "Bodyweight / Weighted", type: "ASSISTANCE" }))
      });
      result.push({
        key: "assistance_curls",
        name: "Barbell Curls",
        isAssistance: true,
        sets: Array(3).fill(null).map(() => ({ reps: "8", weightText: "Light Barbell", type: "ASSISTANCE" }))
      });
      result.push({
        key: "assistance_triceps",
        name: "Lying Triceps Extensions",
        isAssistance: true,
        sets: Array(3).fill(null).map(() => ({ reps: "8", weightText: "Light Barbell", type: "ASSISTANCE" }))
      });
    }
  }
  return result;
}

function renderInputs() {
  const visibleKeys = ["squat", "bench", "row", "deadlift", state.pressChoice];
  liftInputs.innerHTML = visibleKeys.map(key => {
    const lift = state.lifts[key];
    return `
      <div class="lift-field">
        <div class="lift-name"><strong>${lift.name}</strong><small>Current 5-rep max</small></div>
        <label class="input-wrap">
          <input type="number" min="1" step="0.5" value="${lift.max}" data-key="${key}" data-field="max" aria-label="${lift.name} five rep max">
          <span>${state.unit.toUpperCase()}</span>
        </label>
        <label class="input-wrap increment-wrap">
          <input type="number" min="0.1" step="0.1" value="${lift.increment}" data-key="${key}" data-field="increment" aria-label="${lift.name} weekly increment">
          <span>+${state.unit.toUpperCase()}</span>
        </label>
      </div>`;
  }).join("");

  liftInputs.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", event => {
      const { key, field } = event.target.dataset;
      const minimum = field === "max" ? 1 : 0.1;
      state.lifts[key][field] = Math.max(minimum, Number(event.target.value) || minimum);
      saveState();
      renderPlan();
    });
  });
}

function renderPlateStack(weight) {
  const plates = platesFor(weight);
  if (!plates.length) {
    return `
      <div class="barbell-sleeve-container empty-bar">
        <div class="barbell-sleeve">
          <div class="sleeve-collar"></div>
          <div class="sleeve-bar"></div>
          <div class="sleeve-plates"></div>
        </div>
        <div class="plate-label">Empty ${state.barWeight} ${state.unit} bar</div>
      </div>`;
  }
  
  const plateMarkup = plates.map(plate =>
    `<span class="plate" data-size="${plate}" data-unit="${state.unit}">${formatWeight(plate)}</span>`
  ).join("");
  
  const label = plates.map(formatWeight).join(" + ");
  return `
    <div class="barbell-sleeve-container">
      <div class="barbell-sleeve">
        <div class="sleeve-collar"></div>
        <div class="sleeve-bar" style="width: ${Math.max(120, plates.length * 30 + 10)}px;"></div>
        <div class="sleeve-plates">
          ${plateMarkup}
        </div>
      </div>
      <div class="plate-label">Each side: ${label} ${state.unit}</div>
    </div>`;
}

function renderExercise(exercise, exerciseIndex) {
  const isAssistance = exercise.isAssistance;
  const name = isAssistance ? exercise.name : state.lifts[exercise.key].name;
  
  const rows = exercise.sets.map((set, index) => {
    const setKey = `${state.week}-${activeWorkout}-${exerciseIndex}-${index}`;
    const completed = !!state.completedSets[setKey];
    
    if (isAssistance) {
      return `
        <div class="set-row ${completed ? "completed-set" : ""}" data-set-key="${setKey}">
          <div class="set-checkbox-wrap">
            <input type="checkbox" class="set-checkbox" data-set-key="${setKey}" ${completed ? "checked" : ""} aria-label="Mark set ${index + 1} completed">
          </div>
          <div class="set-number">SET<strong>${index + 1}</strong></div>
          <div class="set-load"><strong>${set.reps} reps</strong><span></span></div>
          <div><div class="plate-label">${set.weightText}</div></div>
          <div class="set-type"><strong>${set.type}</strong><small>Rest 1-2 min</small></div>
        </div>`;
    }
    
    const rounded = Math.abs(set.weight - set.target) >= 0.01;
    return `
      <div class="set-row ${completed ? "completed-set" : ""}" data-set-key="${setKey}">
        <div class="set-checkbox-wrap">
          <input type="checkbox" class="set-checkbox" data-set-key="${setKey}" ${completed ? "checked" : ""} aria-label="Mark set ${index + 1} completed">
        </div>
        <div class="set-number">SET<strong>${index + 1}</strong></div>
        <div class="set-load"><strong>${set.reps} x ${formatWeight(set.weight)}</strong><span>${state.unit}</span></div>
        ${renderPlateStack(set.weight)}
        <div class="set-type"><strong>${set.type}</strong><small>${set.reps === 8 ? "Rest 2-3 min first" : index < 2 ? "Rest 1-2 min" : "Rest 3-5 min"}</small></div>
      </div>
      ${rounded ? `<div class="rounding-note">Calculated target ${formatWeight(set.target)} ${state.unit}, adjusted to ${formatWeight(set.weight)} ${state.unit} using your selected plates.</div>` : ""}`;
  }).join("");

  const topSetWeight = isAssistance ? "" : `TOP SET: <strong>${formatWeight(topSet(exercise.key))} ${state.unit.toUpperCase()}</strong>`;
  return `<article class="exercise-card">
    <header class="exercise-header"><h3>${name.toUpperCase()}</h3><p>${topSetWeight}</p></header>
    <div class="sets">${rows}</div>
  </article>`;
}

function initSetCheckboxes() {
  document.querySelectorAll(".set-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", event => {
      const setKey = event.target.dataset.setKey;
      const row = event.target.closest(".set-row");
      if (event.target.checked) {
        state.completedSets[setKey] = true;
        row.classList.add("completed-set");
      } else {
        delete state.completedSets[setKey];
        row.classList.remove("completed-set");
      }
      saveState();
    });
  });
}

function updateHeaderMeta() {
  const headerMeta = document.querySelector(".header-meta");
  if (headerMeta) {
    headerMeta.innerHTML = `${state.barWeight} ${state.unit.toUpperCase()} BAR <span></span> ${state.unit.toUpperCase()} PLATES`;
  }
}

function renderPlan() {
  weekNumber.value = state.week;
  rampWeeks.value = state.rampWeeks;
  pressChoice.value = state.pressChoice;
  unitToggle.value = state.unit;
  barWeightInput.value = state.barWeight;
  document.querySelector("#barWeightUnit").textContent = state.unit.toUpperCase();
  showAssistance.checked = state.showAssistance;

  const status = state.week < state.rampWeeks
    ? `${state.rampWeeks - state.week} week${state.rampWeeks - state.week === 1 ? "" : "s"} before matching your current 5RM`
    : state.week === state.rampWeeks ? "Current 5RM target week" : `${state.week - state.rampWeeks} week${state.week - state.rampWeeks === 1 ? "" : "s"} into PR territory`;
  document.querySelector("#weekSummary").innerHTML = `<strong>WEEK ${state.week}</strong><span>/</span><span>${status}</span>`;
  workoutContent.innerHTML = workoutFor(activeWorkout).map((ex, index) => renderExercise(ex, index)).join("");
  initSetCheckboxes();
  updateHeaderMeta();
}

function renderInventory() {
  const inventory = document.querySelector("#inventoryChips");
  const platesList = getPlatesList();
  
  inventory.innerHTML = platesList.map(plate => {
    const selected = state.availablePlates.includes(plate);
    return `<button type="button" class="inventory-chip ${selected ? "selected" : ""}" data-plate="${plate}" aria-pressed="${selected}">${formatWeight(plate)} ${state.unit.toUpperCase()}</button>`;
  }).join("");

  document.querySelector("#inventoryStatus").textContent = `${state.availablePlates.length} OF ${platesList.length} SELECTED`;
  document.querySelector("#selectAllPlates").disabled = state.availablePlates.length === platesList.length;

  inventory.querySelectorAll(".inventory-chip").forEach(button => {
    button.addEventListener("click", () => {
      const plate = Number(button.dataset.plate);
      const isSelected = state.availablePlates.includes(plate);
      if (isSelected && state.availablePlates.length === 1) {
        button.classList.add("shake");
        setTimeout(() => button.classList.remove("shake"), 300);
        return;
      }
      state.availablePlates = isSelected
        ? state.availablePlates.filter(value => value !== plate)
        : [...state.availablePlates, plate].sort((a, b) => b - a);
      saveState();
      renderInventory();
      renderPlan();
    });
  });
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `madcow_5x5_backup.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && typeof parsed === 'object') {
        state.unit = parsed.unit === "lbs" ? "lbs" : "kg";
        state.lifts = { ...structuredClone(defaults[state.unit].lifts), ...(parsed.lifts || {}) };
        state.barWeight = parsed.barWeight !== undefined ? Number(parsed.barWeight) : defaults[state.unit].barWeight;
        state.week = Math.max(1, Math.min(52, Number(parsed.week) || 1));
        state.rampWeeks = Math.max(3, Math.min(10, Number(parsed.rampWeeks) || 4));
        state.pressChoice = parsed.pressChoice === "ohp" ? "ohp" : "incline";
        state.availablePlates = Array.isArray(parsed.availablePlates) ? parsed.availablePlates : [...defaults[state.unit].availablePlates];
        state.showAssistance = !!parsed.showAssistance;
        state.completedSets = parsed.completedSets || {};
        
        saveState();
        
        unitToggle.value = state.unit;
        barWeightInput.value = state.barWeight;
        document.querySelector("#barWeightUnit").textContent = state.unit.toUpperCase();
        showAssistance.checked = state.showAssistance;
        
        renderInputs();
        renderInventory();
        renderPlan();
        alert("Data imported successfully!");
      }
    } catch (err) {
      alert("Invalid backup file format.");
    }
  };
  reader.readAsText(file);
}

document.querySelector("#selectAllPlates").addEventListener("click", () => {
  state.availablePlates = [...getPlatesList()];
  saveState();
  renderInventory();
  renderPlan();
});

document.querySelectorAll(".workout-tabs button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".workout-tabs button").forEach(tab => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    activeWorkout = button.dataset.workout;
    renderPlan();
  });
});

document.querySelector("#previousWeek").addEventListener("click", () => {
  state.week = Math.max(1, state.week - 1); saveState(); renderPlan();
});
document.querySelector("#nextWeek").addEventListener("click", () => {
  state.week = Math.min(52, state.week + 1); saveState(); renderPlan();
});
weekNumber.addEventListener("change", () => {
  state.week = Math.max(1, Math.min(52, Number(weekNumber.value) || 1)); saveState(); renderPlan();
});
rampWeeks.addEventListener("change", () => {
  state.rampWeeks = Number(rampWeeks.value); saveState(); renderPlan();
});
pressChoice.addEventListener("change", () => {
  state.pressChoice = pressChoice.value; saveState(); renderInputs(); renderPlan();
});

unitToggle.addEventListener("change", () => {
  const newUnit = unitToggle.value;
  // Convert lift values
  Object.keys(state.lifts).forEach(key => {
    state.lifts[key].max = convertWeight(state.lifts[key].max, newUnit);
    state.lifts[key].increment = convertWeight(state.lifts[key].increment, newUnit);
  });
  // Convert bar weight
  state.barWeight = convertWeight(state.barWeight, newUnit);
  // Reset plates list to defaults of the new unit
  state.availablePlates = [...defaults[newUnit].availablePlates];
  state.unit = newUnit;
  
  saveState();
  renderInputs();
  renderInventory();
  renderPlan();
});

barWeightInput.addEventListener("change", () => {
  const val = Number(barWeightInput.value);
  state.barWeight = Math.max(0, isNaN(val) ? defaults[state.unit].barWeight : val);
  saveState();
  renderPlan();
});

showAssistance.addEventListener("change", () => {
  state.showAssistance = showAssistance.checked;
  saveState();
  renderPlan();
});

exportButton.addEventListener("click", exportData);
importButton.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", importData);

document.querySelector("#resetButton").addEventListener("click", () => {
  const unit = "kg";
  state = {
    unit,
    lifts: structuredClone(defaults[unit].lifts),
    barWeight: defaults[unit].barWeight,
    week: 1,
    rampWeeks: 4,
    pressChoice: "incline",
    availablePlates: [...defaults[unit].availablePlates],
    showAssistance: false,
    completedSets: {}
  };
  saveState();
  renderInputs();
  renderInventory();
  renderPlan();
});

renderInputs();
renderInventory();
renderPlan();
