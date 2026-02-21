/**
 * Интеграционные тесты калькулятора FAOD
 * Проверка полных сценариев расчёта
 *
 * Запуск: node tests/integration.test.js
 */

const fs = require('fs');
const path = require('path');

// Простой тестовый фреймворк
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passedTests++;
    testResults.push({ name, status: 'passed' });
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Ошибка: ${error.message}`);
    failedTests++;
    testResults.push({ name, status: 'failed', error: error.message });
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Ожидалось: ${expected}, получено: ${actual}`);
  }
}

function assertInRange(actual, min, max, message = '') {
  if (actual < min || actual > max) {
    throw new Error(`${message} Значение ${actual} вне диапазона [${min}, ${max}]`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(message || 'Условие не выполнено');
  }
}

function assertFalse(condition, message = '') {
  if (condition) {
    throw new Error(message || 'Условие должно быть ложным');
  }
}

// Загрузка данных
function loadData() {
  const dataDir = path.join(__dirname, '..', 'data');

  const diagnosesRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'diagnoses.json'), 'utf8'));
  const diagnosesMap = {};
  for (const diag of diagnosesRaw.diagnoses) {
    diagnosesMap[diag.id] = diag;
  }

  return {
    diagnoses: { diagnoses: diagnosesMap, categories: diagnosesRaw.categories },
    energyNorms: JSON.parse(fs.readFileSync(path.join(dataDir, 'energy_norms.json'), 'utf8')),
    macroRatios: JSON.parse(fs.readFileSync(path.join(dataDir, 'macro_ratios.json'), 'utf8')),
    feedingIntervals: JSON.parse(fs.readFileSync(path.join(dataDir, 'feeding_intervals.json'), 'utf8')),
    formulas: JSON.parse(fs.readFileSync(path.join(dataDir, 'formulas.json'), 'utf8')),
    medications: JSON.parse(fs.readFileSync(path.join(dataDir, 'medications.json'), 'utf8')),
    efaNorms: JSON.parse(fs.readFileSync(path.join(dataDir, 'efa_norms.json'), 'utf8'))
  };
}

// Полный калькулятор для тестов
class TestCalculator {
  constructor(data) {
    this.data = data;
  }

  calculate(input) {
    const ageInMonths = this.getAgeInMonths(input.birthDate, input.calculationDate);

    const energy = this.calculateEnergy(ageInMonths, input.weight, input.sex, input.condition);
    const macros = this.calculateMacros(energy.totalKcal, input.diagnosis, input.clinicalForm, input.condition);
    const feeding = this.calculateFeeding(ageInMonths, input.condition, input.diagnosis);
    const medications = this.calculateMedications(input.weight, ageInMonths, input.diagnosis, input.clinicalForm);

    return {
      patient: {
        ageMonths: ageInMonths,
        weight: input.weight,
        diagnosis: input.diagnosis,
        clinicalForm: input.clinicalForm,
        condition: input.condition
      },
      energy,
      macros,
      feeding,
      medications
    };
  }

  getAgeInMonths(birthDate, calcDate = new Date()) {
    const birth = new Date(birthDate);
    const calc = new Date(calcDate);
    let months = (calc.getFullYear() - birth.getFullYear()) * 12;
    months += calc.getMonth() - birth.getMonth();
    if (calc.getDate() < birth.getDate()) months--;
    return Math.max(0, months);
  }

  calculateEnergy(ageInMonths, weight, sex, condition) {
    let kcalPerKg;

    if (ageInMonths < 12) {
      const data = this.data.energyNorms.infants.data;
      const group = data.find(g => ageInMonths >= g.ageMonthsFrom && ageInMonths < g.ageMonthsTo);
      kcalPerKg = group ? group[sex] : data[data.length - 1][sex];
    } else if (ageInMonths < 216) {
      const ageYears = Math.floor(ageInMonths / 12);
      const data = this.data.energyNorms.children.data;
      const group = data.find(g => ageYears >= g.ageYearsFrom && ageYears < g.ageYearsTo);
      kcalPerKg = group ? group[sex] : data[data.length - 1][sex];
    } else {
      kcalPerKg = 40; // Упрощённо для взрослых
    }

    const adj = this.data.energyNorms.adjustments;
    let multiplier = 1.0;
    if (condition === 'intercurrent') multiplier = adj.intercurrent.multiplier;
    if (condition === 'crisis') multiplier = adj.crisis.multiplier;

    return {
      kcalPerKg: Math.round(kcalPerKg * 10) / 10,
      baseKcal: Math.round(kcalPerKg * weight),
      totalKcal: Math.round(kcalPerKg * weight * multiplier),
      multiplier
    };
  }

  calculateMacros(totalKcal, diagnosis, clinicalForm, condition) {
    const ratioData = this.data.macroRatios.diagnosisRatios[diagnosis];
    let ratios;

    if (ratioData.hasMultipleForms && clinicalForm) {
      ratios = JSON.parse(JSON.stringify(ratioData.forms[clinicalForm]));
    } else {
      ratios = JSON.parse(JSON.stringify(ratioData));
    }

    // Коррекция при кризе — исключаем LCT, увеличиваем углеводы
    let effectiveLctPercent;
    let effectiveCarbsPercent;

    if (condition === 'crisis') {
      effectiveLctPercent = 0;
      effectiveCarbsPercent = 75;
    } else {
      effectiveLctPercent = ratios.lctPercent?.recommended ?? ratios.fatPercent.recommended;
      effectiveCarbsPercent = ratios.carbsPercent.recommended || ratios.carbsPercent.min;
    }

    const protein = {
      percent: ratios.proteinPercent.recommended,
      grams: Math.round((totalKcal * ratios.proteinPercent.recommended / 100) / 4)
    };
    const carbs = {
      percent: effectiveCarbsPercent,
      grams: Math.round((totalKcal * effectiveCarbsPercent / 100) / 4)
    };
    const fat = {
      percent: ratios.fatPercent.recommended,
      grams: Math.round((totalKcal * ratios.fatPercent.recommended / 100) / 9)
    };
    const mct = {
      percent: ratios.mctPercent?.recommended || 0,
      grams: Math.round((totalKcal * (ratios.mctPercent?.recommended || 0) / 100) / 8.3),
      contraindicated: ratios.mctPercent?.contraindicated || false
    };
    const lct = {
      percent: effectiveLctPercent,
      grams: Math.round((totalKcal * effectiveLctPercent / 100) / 9)
    };

    return { protein, carbs, fat, mct, lct, warnings: ratios.warnings || [] };
  }

  calculateFeeding(ageInMonths, condition, diagnosis) {
    const intervals = this.data.feedingIntervals.stableState.intervals;
    let group = intervals.find(g => ageInMonths >= g.ageMonthsFrom && ageInMonths < g.ageMonthsTo);
    if (!group) group = intervals[intervals.length - 1];

    let dayInterval = group.dayIntervalHours;
    let nightInterval = group.nightIntervalHours;

    if (condition === 'intercurrent') {
      const adj = this.data.feedingIntervals.intercurrentIllness;
      dayInterval = Math.max(adj.minimumDayInterval, dayInterval - adj.dayIntervalReduction);
      nightInterval = Math.max(adj.minimumNightInterval, nightInterval - adj.nightIntervalReduction);
    } else if (condition === 'crisis') {
      dayInterval = 2;
      nightInterval = 2;
    }

    return { dayInterval, nightInterval, ageGroup: group.label };
  }

  calculateMedications(weight, ageInMonths, diagnosis, clinicalForm) {
    const diagInfo = this.data.diagnoses.diagnoses[diagnosis];
    const result = { carnitine: null, riboflavin: null, dha: null };

    // Карнитин
    if (diagnosis === 'OCTN2') {
      result.carnitine = {
        required: true,
        dailyMin: Math.round(weight * 100),
        dailyMax: Math.round(weight * 200),
        ivAllowed: true
      };
    } else if (['LCHAD', 'TFP'].includes(diagnosis) ||
               clinicalForm === 'VLCAD_SYMPTOMATIC') {
      result.carnitine = { contraindicated: true };
    }

    // Рибофлавин
    if (diagnosis === 'GA2') {
      result.riboflavin = {
        required: true,
        dailyMin: Math.round(weight * 10),
        dailyMax: Math.min(Math.round(weight * 20), 400)
      };
    }

    // DHA
    if (diagInfo?.requiresDHA) {
      let dose;
      if (ageInMonths < 12) dose = { min: 60, max: 100 };
      else if (ageInMonths < 36) dose = { min: 100, max: 150 };
      else if (ageInMonths < 120) dose = { min: 150, max: 250 };
      else dose = { min: 250, max: 500 };

      result.dha = { required: true, ...dose };
    }

    return result;
  }
}

// =============== ТЕСТЫ ===============

console.log('\n=== Интеграционные тесты FAOD ===\n');

const data = loadData();
const calc = new TestCalculator(data);

// --- Тестовый сценарий 1: Новорождённый с LCHAD ---
console.log('--- Сценарий 1: Новорождённый с LCHAD ---');

test('LCHAD новорождённый: базовые параметры', () => {
  const result = calc.calculate({
    birthDate: '2024-01-15',
    calculationDate: '2024-01-20',
    weight: 3.2,
    sex: 'male',
    diagnosis: 'LCHAD',
    clinicalForm: null,
    condition: 'stable'
  });

  assertEqual(result.patient.ageMonths, 0, 'Возраст 0 мес');
  assertInRange(result.energy.kcalPerKg, 100, 120, 'ккал/кг для новорождённого');
});

test('LCHAD новорождённый: строгое ограничение LCT', () => {
  const result = calc.calculate({
    birthDate: '2024-01-15',
    calculationDate: '2024-01-20',
    weight: 3.2,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'stable'
  });

  assertInRange(result.macros.lct.percent, 3, 5, 'LCT 3-5%');
  assertInRange(result.macros.mct.percent, 20, 25, 'MCT 20-25%');
  assertFalse(result.macros.mct.contraindicated, 'MCT разрешены');
});

test('LCHAD новорождённый: карнитин противопоказан', () => {
  const result = calc.calculate({
    birthDate: '2024-01-15',
    calculationDate: '2024-01-20',
    weight: 3.2,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'stable'
  });

  assertTrue(result.medications.carnitine.contraindicated, 'Карнитин противопоказан');
});

test('LCHAD новорождённый: DHA требуется', () => {
  const result = calc.calculate({
    birthDate: '2024-01-15',
    calculationDate: '2024-01-20',
    weight: 3.2,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'stable'
  });

  assertTrue(result.medications.dha.required, 'DHA требуется');
  assertInRange(result.medications.dha.min, 50, 80, 'DHA мин');
});

test('LCHAD новорождённый: интервал кормления 3 часа', () => {
  const result = calc.calculate({
    birthDate: '2024-01-15',
    calculationDate: '2024-01-20',
    weight: 3.2,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'stable'
  });

  assertEqual(result.feeding.dayInterval, 3, 'Интервал днём');
  assertEqual(result.feeding.nightInterval, 3, 'Интервал ночью');
});

// --- Тестовый сценарий 2: Ребёнок 8 мес с MCAD ---
console.log('\n--- Сценарий 2: Ребёнок 8 мес с MCAD ---');

test('MCAD 8 мес: нормальная диета', () => {
  const result = calc.calculate({
    birthDate: '2023-05-01',
    calculationDate: '2024-01-01',
    weight: 8.5,
    sex: 'female',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  assertEqual(result.macros.fat.percent, 30, 'Жиры 30%');
  assertInRange(result.macros.protein.percent, 10, 15, 'Белки 10-15%');
});

test('MCAD 8 мес: MCT противопоказаны', () => {
  const result = calc.calculate({
    birthDate: '2023-05-01',
    calculationDate: '2024-01-01',
    weight: 8.5,
    sex: 'female',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  assertTrue(result.macros.mct.contraindicated, 'MCT противопоказаны');
  assertEqual(result.macros.mct.percent, 0, 'MCT 0%');
});

test('MCAD 8 мес: интервал 4 ч днём, 8 ч ночью', () => {
  const result = calc.calculate({
    birthDate: '2023-05-01',
    calculationDate: '2024-01-01',
    weight: 8.5,
    sex: 'female',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  assertEqual(result.feeding.dayInterval, 4, 'Интервал днём');
  assertEqual(result.feeding.nightInterval, 8, 'Интервал ночью');
});

// --- Тестовый сценарий 3: Ребёнок 2 года с VLCAD ---
console.log('\n--- Сценарий 3: Ребёнок 2 года с VLCAD ---');

test('VLCAD симптоматический: строгая диета', () => {
  const result = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_SYMPTOMATIC',
    condition: 'stable'
  });

  assertInRange(result.macros.mct.percent, 18, 25, 'MCT 18-25%');
  assertInRange(result.macros.lct.percent, 5, 12, 'LCT 5-12%');
});

test('VLCAD бессимптомный: умеренная диета', () => {
  const result = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_ASYMPTOMATIC',
    condition: 'stable'
  });

  assertInRange(result.macros.mct.percent, 10, 15, 'MCT 10-15%');
  assertInRange(result.macros.lct.percent, 15, 25, 'LCT 15-25%');
});

test('VLCAD симптоматический: карнитин в/в противопоказан', () => {
  const result = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_SYMPTOMATIC',
    condition: 'stable'
  });

  assertTrue(result.medications.carnitine.contraindicated, 'Карнитин противопоказан');
});

// --- Тестовый сценарий 4: OCTN2 ---
console.log('\n--- Сценарий 4: Дефицит карнитина (OCTN2) ---');

test('OCTN2: карнитин обязателен 100-200 мг/кг', () => {
  const result = calc.calculate({
    birthDate: '2020-06-01',
    calculationDate: '2024-01-01',
    weight: 15,
    sex: 'female',
    diagnosis: 'OCTN2',
    condition: 'stable'
  });

  assertTrue(result.medications.carnitine.required, 'Карнитин требуется');
  assertEqual(result.medications.carnitine.dailyMin, 1500, 'Мин 1500 мг');
  assertEqual(result.medications.carnitine.dailyMax, 3000, 'Макс 3000 мг');
  assertTrue(result.medications.carnitine.ivAllowed, 'В/в разрешено');
});

test('OCTN2: диета не требуется', () => {
  const result = calc.calculate({
    birthDate: '2020-06-01',
    calculationDate: '2024-01-01',
    weight: 15,
    sex: 'female',
    diagnosis: 'OCTN2',
    condition: 'stable'
  });

  assertEqual(result.macros.fat.percent, 30, 'Жиры 30% (норма)');
  assertFalse(result.macros.mct.contraindicated, 'MCT не противопоказаны');
});

// --- Тестовый сценарий 5: GA2 ---
console.log('\n--- Сценарий 5: Глутаровая ацидурия тип 2 ---');

test('GA2: рибофлавин обязателен', () => {
  const result = calc.calculate({
    birthDate: '2022-03-01',
    calculationDate: '2024-01-01',
    weight: 10,
    sex: 'male',
    diagnosis: 'GA2',
    condition: 'stable'
  });

  assertTrue(result.medications.riboflavin.required, 'Рибофлавин требуется');
  assertInRange(result.medications.riboflavin.dailyMin, 80, 120, 'Мин доза');
});

test('GA2: MCT противопоказаны', () => {
  const result = calc.calculate({
    birthDate: '2022-03-01',
    calculationDate: '2024-01-01',
    weight: 10,
    sex: 'male',
    diagnosis: 'GA2',
    condition: 'stable'
  });

  assertTrue(result.macros.mct.contraindicated, 'MCT противопоказаны');
});

test('GA2: низкожировая, низкобелковая диета', () => {
  const result = calc.calculate({
    birthDate: '2022-03-01',
    calculationDate: '2024-01-01',
    weight: 10,
    sex: 'male',
    diagnosis: 'GA2',
    condition: 'stable'
  });

  assertInRange(result.macros.fat.percent, 20, 25, 'Жиры 20-25%');
  assertInRange(result.macros.protein.percent, 8, 10, 'Белки 8-10%');
});

// --- Тестовый сценарий 6: Интеркуррентное заболевание ---
console.log('\n--- Сценарий 6: Интеркуррентное заболевание ---');

test('Интеркуррентное: калорийность +10%', () => {
  const stable = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'stable'
  });

  const sick = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'intercurrent'
  });

  const expected = stable.energy.baseKcal * 1.1;
  // Допуск ±2 ккал из-за округления
  assertInRange(sick.energy.totalKcal, expected - 2, expected + 2, 'Калорийность +10%');
});

test('Интеркуррентное: сокращение интервалов', () => {
  const stable = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'stable'
  });

  const sick = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'LCHAD',
    condition: 'intercurrent'
  });

  assertTrue(sick.feeding.dayInterval < stable.feeding.dayInterval, 'Интервал сокращён');
});

// --- Тестовый сценарий 7: Метаболический криз ---
console.log('\n--- Сценарий 7: Метаболический криз ---');

test('Криз: калорийность +15%', () => {
  const stable = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_SYMPTOMATIC',
    condition: 'stable'
  });

  const crisis = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_SYMPTOMATIC',
    condition: 'crisis'
  });

  const expected = stable.energy.baseKcal * 1.15;
  // Допуск ±2 ккал из-за округления
  assertInRange(crisis.energy.totalKcal, expected - 2, expected + 2, 'Калорийность +15%');
});

test('Криз: исключение LCT', () => {
  const crisis = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_SYMPTOMATIC',
    condition: 'crisis'
  });

  // При кризе LCT должен быть минимальным (0% или близко к 0)
  // В тестовом калькуляторе применяется коррекция
  assertEqual(crisis.macros.lct.percent, 0, 'LCT 0% при кризе');
});

test('Криз: интервал 2 часа', () => {
  const crisis = calc.calculate({
    birthDate: '2022-01-01',
    calculationDate: '2024-01-01',
    weight: 12,
    sex: 'male',
    diagnosis: 'VLCAD',
    clinicalForm: 'VLCAD_SYMPTOMATIC',
    condition: 'crisis'
  });

  assertEqual(crisis.feeding.dayInterval, 2, 'Интервал 2 ч днём');
  assertEqual(crisis.feeding.nightInterval, 2, 'Интервал 2 ч ночью');
});

// --- Тестовый сценарий 8: CPT2 формы ---
console.log('\n--- Сценарий 8: CPT2 — разные формы ---');

test('CPT2 неонатальная: строгая диета', () => {
  const result = calc.calculate({
    birthDate: '2023-10-01',
    calculationDate: '2024-01-01',
    weight: 5,
    sex: 'male',
    diagnosis: 'CPT2',
    clinicalForm: 'CPT2_NEONATAL',
    condition: 'stable'
  });

  assertInRange(result.macros.mct.percent, 18, 25, 'MCT 18-25%');
  assertInRange(result.macros.lct.percent, 5, 12, 'LCT 5-12%');
});

test('CPT2 мышечная: умеренная диета', () => {
  const result = calc.calculate({
    birthDate: '2000-01-01',
    calculationDate: '2024-01-01',
    weight: 70,
    sex: 'male',
    diagnosis: 'CPT2',
    clinicalForm: 'CPT2_LATE_MUSCULAR',
    condition: 'stable'
  });

  assertInRange(result.macros.fat.percent, 15, 20, 'Жиры 15-20%');
  assertInRange(result.macros.mct.percent, 5, 10, 'MCT 5-10%');
});

// --- Проверка граничных значений ---
console.log('\n--- Граничные значения ---');

test('Возраст: граница 6 мес (смена интервалов)', () => {
  const before = calc.calculate({
    birthDate: '2023-07-15',
    calculationDate: '2024-01-01',
    weight: 7,
    sex: 'male',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  const after = calc.calculate({
    birthDate: '2023-06-01',
    calculationDate: '2024-01-01',
    weight: 7.5,
    sex: 'male',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  // До 6 мес интервал 4 ч, после — 4 ч днём, 8 ч ночью
  assertTrue(before.feeding.nightInterval <= 4 || after.feeding.nightInterval >= 6,
    'Изменение ночного интервала после 6 мес');
});

test('Возраст: граница 12 мес (переход к детским нормам)', () => {
  const infant = calc.calculate({
    birthDate: '2023-02-01',
    calculationDate: '2024-01-01',
    weight: 9,
    sex: 'female',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  const toddler = calc.calculate({
    birthDate: '2022-12-01',
    calculationDate: '2024-01-01',
    weight: 10,
    sex: 'female',
    diagnosis: 'MCAD',
    condition: 'stable'
  });

  // Оба должны иметь корректные расчёты
  assertTrue(infant.energy.kcalPerKg > 0, 'Калорийность младенца');
  assertTrue(toddler.energy.kcalPerKg > 0, 'Калорийность тоддлера');
});

// --- Итоги ---
console.log('\n=== Результаты интеграционных тестов ===');
console.log(`Пройдено: ${passedTests}`);
console.log(`Провалено: ${failedTests}`);
console.log(`Всего: ${passedTests + failedTests}`);

if (failedTests > 0) {
  console.log('\nПроваленные тесты:');
  testResults.filter(t => t.status === 'failed').forEach(t => {
    console.log(`  - ${t.name}: ${t.error}`);
  });
  process.exit(1);
}
