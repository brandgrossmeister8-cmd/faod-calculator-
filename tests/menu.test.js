/**
 * Тест детального меню для калькулятора FAOD
 * Запуск: node tests/menu.test.js
 */

const fs = require('fs');
const path = require('path');

// Загрузка всех данных
const dataDir = path.join(__dirname, '..', 'data');

function loadAllData() {
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
    efaNorms: JSON.parse(fs.readFileSync(path.join(dataDir, 'efa_norms.json'), 'utf8')),
    complementaryFoods: JSON.parse(fs.readFileSync(path.join(dataDir, 'complementary_foods.json'), 'utf8'))
  };
}

// Загрузка FAODCalculator
const calculatorCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');

// Выполнение кода калькулятора
const FAODCalculator = eval(`
  ${calculatorCode}
  FAODCalculator;
`);

console.log('\n=== Тест детального меню FAOD ===\n');

const data = loadAllData();

// Создаём калькулятор и загружаем данные вручную
const calculator = new FAODCalculator();
calculator.data = data;
calculator.loaded = true;

// Тестовый случай: ребёнок 8 месяцев с LCHAD
const testInput = {
  birthDate: '2025-06-21', // примерно 8 месяцев назад
  calculationDate: '2026-02-21',
  weight: 8.5,
  sex: 'male',
  diagnosis: 'LCHAD',
  clinicalForm: null,
  condition: 'stable',
  breastfeeding: false
};

console.log('Входные данные:');
console.log(`  Возраст: ~8 месяцев`);
console.log(`  Вес: ${testInput.weight} кг`);
console.log(`  Диагноз: LCHAD`);
console.log(`  Состояние: стабильное`);
console.log('');

try {
  const menu = calculator.calculateDetailedMenu(testInput);

  console.log('=== РЕЗУЛЬТАТ ===\n');
  console.log(`Возрастная группа: ${menu.ageGroup}`);
  console.log(`Смесь: ${menu.formula.name} (${menu.formula.volumePerDay} мл/сут)`);

  if (menu.mctOil) {
    console.log(`MCT-масло: ${menu.mctOil.volumePerDay} мл/сут`);
  }

  console.log('\n--- Расписание кормлений ---\n');

  menu.schedule.forEach(meal => {
    console.log(`⏰ ${meal.time} — ${meal.type}`);
    console.log('┌─────────────────────────────┬────────┬─────┬─────┬─────┬─────┬─────┐');
    console.log('│ Продукт                     │ Кол-во │Ккал │ Б   │ Ж   │ У   │ LCT │');
    console.log('├─────────────────────────────┼────────┼─────┼─────┼─────┼─────┼─────┤');

    meal.items.forEach(item => {
      const n = item.nutrients || {};
      const name = item.name.padEnd(27).substring(0, 27);
      const amount = item.amount.toString().padStart(6);
      const kcal = (n.kcal || 0).toString().padStart(4);
      const protein = (n.protein || 0).toFixed(1).padStart(4);
      const fat = (n.fat || 0).toFixed(1).padStart(4);
      const carbs = (n.carbs || 0).toFixed(1).padStart(4);
      const lct = (n.lct || 0).toFixed(1).padStart(4);
      console.log(`│ ${name} │${amount} │${kcal} │${protein} │${fat} │${carbs} │${lct} │`);
    });

    if (meal.total) {
      console.log('├─────────────────────────────┼────────┼─────┼─────┼─────┼─────┼─────┤');
      const kcal = meal.total.kcal.toString().padStart(4);
      const protein = meal.total.protein.toFixed(1).padStart(4);
      const fat = meal.total.fat.toFixed(1).padStart(4);
      const carbs = meal.total.carbs.toFixed(1).padStart(4);
      const lct = meal.total.lct.toFixed(1).padStart(4);
      console.log(`│ ИТОГО:                      │        │${kcal} │${protein} │${fat} │${carbs} │${lct} │`);
    }
    console.log('└─────────────────────────────┴────────┴─────┴─────┴─────┴─────┴─────┘');
    console.log('');
  });

  // Суточные итоги
  let dailyTotal = { kcal: 0, protein: 0, fat: 0, carbs: 0, lct: 0 };
  menu.schedule.forEach(meal => {
    if (meal.total) {
      dailyTotal.kcal += meal.total.kcal || 0;
      dailyTotal.protein += meal.total.protein || 0;
      dailyTotal.fat += meal.total.fat || 0;
      dailyTotal.carbs += meal.total.carbs || 0;
      dailyTotal.lct += meal.total.lct || 0;
    }
  });

  console.log('=== СУТОЧНЫЕ ИТОГИ ===');
  console.log(`  Калории: ${Math.round(dailyTotal.kcal)} ккал`);
  console.log(`  Белки: ${dailyTotal.protein.toFixed(1)} г`);
  console.log(`  Жиры: ${dailyTotal.fat.toFixed(1)} г`);
  console.log(`  Углеводы: ${dailyTotal.carbs.toFixed(1)} г`);
  console.log(`  LCT: ${dailyTotal.lct.toFixed(1)} г`);

  console.log('\n✅ Тест пройден успешно!\n');

} catch (error) {
  console.error('❌ Ошибка:', error.message);
  console.error(error.stack);
  process.exit(1);
}
