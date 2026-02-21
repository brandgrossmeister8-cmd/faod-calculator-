/**
 * Тесты для калькулятора FAOD
 *
 * Запуск: node tests/calculator.test.js
 * (требуется Node.js)
 */

const fs = require('fs');
const path = require('path');

// Загрузка модулей
const calculatorPath = path.join(__dirname, '..', 'js', 'calculator.js');
const utilsPath = path.join(__dirname, '..', 'js', 'utils.js');

// Простой тестовый фреймворк
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Ошибка: ${error.message}`);
    failedTests++;
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

// Загрузка данных напрямую
function loadData() {
  const dataDir = path.join(__dirname, '..', 'data');

  // Загружаем диагнозы и преобразуем массив в объект
  const diagnosesRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'diagnoses.json'), 'utf8'));
  const diagnosesMap = {};
  for (const diag of diagnosesRaw.diagnoses) {
    diagnosesMap[diag.id] = diag;
  }

  return {
    diagnoses: {
      diagnoses: diagnosesMap,
      categories: diagnosesRaw.categories
    },
    energyNorms: JSON.parse(fs.readFileSync(path.join(dataDir, 'energy_norms.json'), 'utf8')),
    macroRatios: JSON.parse(fs.readFileSync(path.join(dataDir, 'macro_ratios.json'), 'utf8')),
    feedingIntervals: JSON.parse(fs.readFileSync(path.join(dataDir, 'feeding_intervals.json'), 'utf8')),
    formulas: JSON.parse(fs.readFileSync(path.join(dataDir, 'formulas.json'), 'utf8')),
    medications: JSON.parse(fs.readFileSync(path.join(dataDir, 'medications.json'), 'utf8')),
    efaNorms: JSON.parse(fs.readFileSync(path.join(dataDir, 'efa_norms.json'), 'utf8'))
  };
}

// Создание тестового калькулятора (упрощённая версия для Node.js)
class TestCalculator {
  constructor(data) {
    this.data = data;
  }

  calculateEnergy(ageInMonths, weight, sex, condition) {
    let kcalPerKg;

    if (ageInMonths < 12) {
      const infantData = this.data.energyNorms.infants.data;
      const ageGroup = infantData.find(
        g => ageInMonths >= g.ageMonthsFrom && ageInMonths < g.ageMonthsTo
      );
      kcalPerKg = ageGroup ? ageGroup[sex] : infantData[infantData.length - 1][sex];
    } else if (ageInMonths < 216) {
      const ageYears = Math.floor(ageInMonths / 12);
      const childData = this.data.energyNorms.children.data;
      const ageGroup = childData.find(
        g => ageYears >= g.ageYearsFrom && ageYears < g.ageYearsTo
      );
      kcalPerKg = ageGroup ? ageGroup[sex] : childData[childData.length - 1][sex];
    } else {
      const ageYears = Math.floor(ageInMonths / 12);
      const adultData = this.data.energyNorms.adults.data;
      const ageGroup = adultData.find(
        g => ageYears >= g.ageYearsFrom && ageYears < g.ageYearsTo
      );
      const weightKey = weight < 60 ? 'weight50kg' : 'weight70kg';
      kcalPerKg = ageGroup ? ageGroup[weightKey][sex] : 40;
    }

    const adjustments = this.data.energyNorms.adjustments;
    let multiplier = 1.0;
    if (condition === 'intercurrent') multiplier = adjustments.intercurrent.multiplier;
    if (condition === 'crisis') multiplier = adjustments.crisis.multiplier;

    return {
      kcalPerKg: Math.round(kcalPerKg * 10) / 10,
      baseKcal: Math.round(kcalPerKg * weight),
      totalKcal: Math.round(kcalPerKg * weight * multiplier),
      multiplier
    };
  }

  getMacroRatios(diagnosis, clinicalForm) {
    const ratioData = this.data.macroRatios.diagnosisRatios[diagnosis];
    if (ratioData.hasMultipleForms && clinicalForm) {
      return ratioData.forms[clinicalForm];
    }
    return ratioData;
  }

  getFeedingIntervals(ageInMonths, condition) {
    const intervals = this.data.feedingIntervals.stableState.intervals;
    let ageGroup = intervals.find(
      g => ageInMonths >= g.ageMonthsFrom && ageInMonths < g.ageMonthsTo
    );
    if (!ageGroup) ageGroup = intervals[intervals.length - 1];

    let dayInterval = ageGroup.dayIntervalHours;
    let nightInterval = ageGroup.nightIntervalHours;

    if (condition === 'intercurrent') {
      const adj = this.data.feedingIntervals.intercurrentIllness;
      dayInterval = Math.max(adj.minimumDayInterval, dayInterval - adj.dayIntervalReduction);
      nightInterval = Math.max(adj.minimumNightInterval, nightInterval - adj.nightIntervalReduction);
    } else if (condition === 'crisis') {
      dayInterval = 2;
      nightInterval = 2;
    }

    return { dayInterval, nightInterval, label: ageGroup.label };
  }
}

// =============== ТЕСТЫ ===============

console.log('\n=== Тесты калькулятора FAOD ===\n');

const data = loadData();
const calc = new TestCalculator(data);

// --- Тесты загрузки данных ---
console.log('--- Загрузка данных ---');

test('Загружены все диагнозы (11 штук)', () => {
  const diagnoses = Object.keys(data.diagnoses.diagnoses);
  assertEqual(diagnoses.length, 11, 'Количество диагнозов');
});

test('Все обязательные поля диагнозов присутствуют', () => {
  const required = ['name', 'nameShort', 'gene', 'requiresDiet'];
  const expectedDiagnoses = ['OCTN2', 'CPT1', 'CACT', 'CPT2', 'SCAD', 'MCAD', 'VLCAD', 'SCHAD', 'LCHAD', 'TFP', 'GA2'];
  for (const code of expectedDiagnoses) {
    const diag = data.diagnoses.diagnoses[code];
    assertTrue(diag !== undefined, `Диагноз ${code} отсутствует`);
    for (const field of required) {
      assertTrue(diag[field] !== undefined, `${code}: отсутствует ${field}`);
    }
  }
});

test('Нормы энергии: данные для младенцев (12 месяцев)', () => {
  assertEqual(data.energyNorms.infants.data.length, 12, 'Месяцев');
});

test('Нормы энергии: данные для детей (17 лет)', () => {
  assertEqual(data.energyNorms.children.data.length, 17, 'Лет');
});

// --- Тесты расчёта энергии ---
console.log('\n--- Расчёт энергии ---');

test('Энергия для новорождённого 3.5 кг (мальчик)', () => {
  const result = calc.calculateEnergy(0, 3.5, 'male', 'stable');
  assertEqual(result.kcalPerKg, 113, 'ккал/кг для 0 мес');
  assertEqual(result.baseKcal, 396, 'Суточная калорийность');
});

test('Энергия для ребёнка 6 мес, 7 кг (девочка)', () => {
  const result = calc.calculateEnergy(6, 7, 'female', 'stable');
  assertEqual(result.kcalPerKg, 78, 'ккал/кг для 6 мес');
  assertEqual(result.baseKcal, 546, 'Суточная калорийность');
});

test('Энергия для ребёнка 3 года, 14 кг (мальчик)', () => {
  const result = calc.calculateEnergy(36, 14, 'male', 'stable');
  assertInRange(result.kcalPerKg, 75, 85, 'ккал/кг для 3 лет');
});

test('Коррекция энергии при интеркуррентном заболевании (+10%)', () => {
  const stable = calc.calculateEnergy(12, 10, 'male', 'stable');
  const sick = calc.calculateEnergy(12, 10, 'male', 'intercurrent');
  assertEqual(sick.multiplier, 1.1, 'Множитель');
  assertEqual(sick.totalKcal, Math.round(stable.baseKcal * 1.1), 'Калорийность +10%');
});

test('Коррекция энергии при кризе (+15%)', () => {
  const stable = calc.calculateEnergy(12, 10, 'male', 'stable');
  const crisis = calc.calculateEnergy(12, 10, 'male', 'crisis');
  assertEqual(crisis.multiplier, 1.15, 'Множитель');
  assertEqual(crisis.totalKcal, Math.round(stable.baseKcal * 1.15), 'Калорийность +15%');
});

// --- Тесты макронутриентов ---
console.log('\n--- Макронутриенты по диагнозам ---');

test('MCAD: нормальная диета, MCT противопоказаны', () => {
  const ratios = calc.getMacroRatios('MCAD');
  assertEqual(ratios.requiresDiet, false, 'Диета не требуется');
  assertEqual(ratios.mctPercent.contraindicated, true, 'MCT противопоказаны');
  assertEqual(ratios.fatPercent.recommended, 30, 'Жиры 30%');
});

test('LCHAD: строгое ограничение LCT, высокое MCT', () => {
  const ratios = calc.getMacroRatios('LCHAD');
  assertEqual(ratios.requiresDiet, true, 'Диета требуется');
  assertEqual(ratios.mctPercent.recommended, 22, 'MCT 22%');
  assertInRange(ratios.lctPercent.recommended, 3, 5, 'LCT 3-5%');
});

test('VLCAD: разные формы имеют разные соотношения', () => {
  const asympt = calc.getMacroRatios('VLCAD', 'VLCAD_ASYMPTOMATIC');
  const sympt = calc.getMacroRatios('VLCAD', 'VLCAD_SYMPTOMATIC');

  assertTrue(asympt.mctPercent.recommended < sympt.mctPercent.recommended,
    'MCT выше при симптоматической форме');
  assertTrue(asympt.lctPercent.recommended > sympt.lctPercent.recommended,
    'LCT ниже при симптоматической форме');
});

test('GA2: MCT противопоказаны, низкий белок', () => {
  const ratios = calc.getMacroRatios('GA2');
  assertEqual(ratios.mctPercent.contraindicated, true, 'MCT противопоказаны');
  assertInRange(ratios.proteinPercent.recommended, 8, 10, 'Белок ограничен');
});

test('CPT2: три клинические формы', () => {
  const neonatal = calc.getMacroRatios('CPT2', 'CPT2_NEONATAL');
  const infantile = calc.getMacroRatios('CPT2', 'CPT2_INFANTILE');
  const muscular = calc.getMacroRatios('CPT2', 'CPT2_LATE_MUSCULAR');

  assertTrue(neonatal !== undefined, 'Неонатальная форма');
  assertTrue(infantile !== undefined, 'Инфантильная форма');
  assertTrue(muscular !== undefined, 'Мышечная форма');
  assertTrue(muscular.mctPercent.recommended < neonatal.mctPercent.recommended,
    'MCT ниже при мышечной форме');
});

// --- Тесты интервалов кормления ---
console.log('\n--- Интервалы кормления ---');

test('Новорождённый: интервал 3 часа', () => {
  const result = calc.getFeedingIntervals(0, 'stable');
  assertEqual(result.dayInterval, 3, 'Дневной интервал');
  assertEqual(result.nightInterval, 3, 'Ночной интервал');
});

test('6 месяцев: интервал 4 часа днём, 8 ночью', () => {
  const result = calc.getFeedingIntervals(8, 'stable');
  assertEqual(result.dayInterval, 4, 'Дневной интервал');
  assertEqual(result.nightInterval, 8, 'Ночной интервал');
});

test('Интеркуррентное заболевание: сокращение интервалов', () => {
  const stable = calc.getFeedingIntervals(12, 'stable');
  const sick = calc.getFeedingIntervals(12, 'intercurrent');

  assertTrue(sick.dayInterval < stable.dayInterval, 'Дневной интервал сокращён');
  assertTrue(sick.nightInterval < stable.nightInterval, 'Ночной интервал сокращён');
});

test('Криз: интервал 2 часа круглосуточно', () => {
  const result = calc.getFeedingIntervals(12, 'crisis');
  assertEqual(result.dayInterval, 2, 'Дневной интервал');
  assertEqual(result.nightInterval, 2, 'Ночной интервал');
});

// --- Тесты препаратов ---
console.log('\n--- Препараты ---');

test('Карнитин: OCTN2 требует 100-200 мг/кг/сут', () => {
  const dosing = data.medications.carnitine.dosing.OCTN2.oral.standard;
  assertEqual(dosing.doseMin, 100, 'Мин доза');
  assertEqual(dosing.doseMax, 200, 'Макс доза');
});

test('Карнитин: противопоказан в/в для LCHAD/TFP', () => {
  const contraindicated = data.medications.carnitine.indications.contraindicated.diagnoses;
  assertTrue(contraindicated.includes('LCHAD'), 'LCHAD');
  assertTrue(contraindicated.includes('TFP'), 'TFP');
});

test('Рибофлавин: требуется для GA2', () => {
  const required = data.medications.riboflavin.indications.required.diagnoses;
  assertTrue(required.includes('GA2'), 'GA2');
});

test('DHA: требуется для LCHAD и TFP', () => {
  const required = data.medications.dha.indications.required.diagnoses;
  assertTrue(required.includes('LCHAD'), 'LCHAD');
  assertTrue(required.includes('TFP'), 'TFP');
});

// --- Тесты НЖК ---
console.log('\n--- Незаменимые жирные кислоты ---');

test('Линолевая кислота: 3-4.5% для младенцев', () => {
  const infantNorms = data.efaNorms.essentialFattyAcids.linoleicAcid.norms[0];
  assertEqual(infantNorms.percentMin, 3, 'Мин %');
  assertInRange(infantNorms.percentMax, 4, 5, 'Макс %');
});

test('DHA: дозы увеличиваются с возрастом', () => {
  const dhaNorms = data.efaNorms.essentialFattyAcids.dha.norms;
  const infant = dhaNorms[0].mgPerDay.recommended;
  const adolescent = dhaNorms[dhaNorms.length - 1].mgPerDay.recommended;
  assertTrue(adolescent > infant, 'Доза для подростков выше');
});

// --- Тесты смесей ---
console.log('\n--- Специализированные смеси ---');

test('MCT-смеси содержат >80% MCT', () => {
  const mctFormulas = data.formulas.categories.mctEnriched.formulas;
  for (const formula of mctFormulas) {
    if (formula.mctPercent) {
      assertTrue(formula.mctPercent >= 80, `${formula.name}: MCT >= 80%`);
    }
  }
});

test('Смеси имеют показания по диагнозам', () => {
  const mctFormulas = data.formulas.categories.mctEnriched.formulas;
  for (const formula of mctFormulas) {
    if (formula.indications) {
      assertTrue(formula.indications.length > 0, `${formula.name}: есть показания`);
    }
  }
});

// --- Тесты детального меню ---
console.log('\n--- Детальное меню ---');

// Загрузим дополнительные данные для теста
const complementaryFoods = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'complementary_foods.json'), 'utf8'
));

test('Данные о смесях загружены (Моноген, Нутриген)', () => {
  assertTrue(complementaryFoods.formulas.monogen !== undefined, 'Моноген');
  assertTrue(complementaryFoods.formulas.nutrigen40mct !== undefined, 'Нутриген 40-MCT');
  assertTrue(complementaryFoods.formulas.breastMilk !== undefined, 'Грудное молоко');
});

test('Данные о продуктах прикорма загружены', () => {
  assertTrue(complementaryFoods.vegetables.products.length >= 5, 'Овощи >= 5');
  assertTrue(complementaryFoods.cereals.products.length >= 3, 'Каши >= 3');
  assertTrue(complementaryFoods.meat.products.length >= 3, 'Мясо >= 3');
  assertTrue(complementaryFoods.fruits.products.length >= 3, 'Фрукты >= 3');
});

test('Расписание кормления по возрастам присутствует', () => {
  assertTrue(complementaryFoods.feedingSchedules['infant4-6m'] !== undefined, '4-6 мес');
  assertTrue(complementaryFoods.feedingSchedules['infant6-9m'] !== undefined, '6-9 мес');
  assertTrue(complementaryFoods.feedingSchedules['toddler1-3y'] !== undefined, '1-3 года');
});

test('Порции по возрастам указаны корректно', () => {
  assertTrue(complementaryFoods.portionsByAge['6-9m'] !== undefined, '6-9 мес');
  assertTrue(complementaryFoods.portionsByAge['1-3y'] !== undefined, '1-3 года');
  assertEqual(complementaryFoods.portionsByAge['6-9m'].formula_ml_per_kg, 120, 'Смесь 120 мл/кг');
});

test('MCT-продукты имеют противопоказания', () => {
  const mctProducts = complementaryFoods.mctProducts.products;
  assertTrue(mctProducts.length >= 1, 'Минимум 1 MCT-продукт');
  const mctOil = mctProducts[0];
  assertTrue(mctOil.contraindications.includes('MCAD'), 'MCAD в противопоказаниях');
  assertTrue(mctOil.contraindications.includes('GA2'), 'GA2 в противопоказаниях');
});

// --- Итоги ---
console.log('\n=== Результаты ===');
console.log(`Пройдено: ${passedTests}`);
console.log(`Провалено: ${failedTests}`);
console.log(`Всего: ${passedTests + failedTests}`);

if (failedTests > 0) {
  process.exit(1);
}
