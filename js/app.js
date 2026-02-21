/**
 * Основное приложение калькулятора FAOD
 */

// Глобальные переменные
let calculator = null;
let currentResult = null;

// ============ Инициализация ============

document.addEventListener('DOMContentLoaded', async () => {
  // Инициализация калькулятора
  await initCalculator();

  // Установка текущей даты
  setDefaultDates();

  // Привязка событий
  bindEvents();
});

/**
 * Инициализация калькулятора и загрузка данных
 */
async function initCalculator() {
  showLoading(true);

  try {
    calculator = new FAODCalculator();
    await calculator.loadData();
    console.log('Данные загружены успешно');
  } catch (error) {
    console.error('Ошибка инициализации:', error);
    showError('Не удалось загрузить справочные данные. Пожалуйста, обновите страницу.');
  } finally {
    showLoading(false);
  }
}

/**
 * Установка дат по умолчанию
 */
function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('calculationDate').value = today;
}

/**
 * Привязка обработчиков событий
 */
function bindEvents() {
  // Форма
  const form = document.getElementById('calculator-form');
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('reset', handleReset);

  // Дата рождения — расчёт возраста
  document.getElementById('birthDate').addEventListener('change', updateAgeDisplay);
  document.getElementById('calculationDate').addEventListener('change', updateAgeDisplay);

  // Диагноз — показ информации и клинических форм
  document.getElementById('diagnosis').addEventListener('change', handleDiagnosisChange);

  // Состояние — предупреждение при кризе
  document.querySelectorAll('input[name="condition"]').forEach(radio => {
    radio.addEventListener('change', handleConditionChange);
  });
}

// ============ Обработчики событий ============

/**
 * Обработка отправки формы
 */
async function handleSubmit(event) {
  event.preventDefault();

  if (!calculator || !calculator.loaded) {
    showError('Калькулятор ещё не готов. Подождите загрузки данных.');
    return;
  }

  // Сбор данных формы
  const formData = collectFormData();

  // Валидация
  const validation = validateFormData(formData);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  try {
    // Расчёт
    currentResult = calculator.calculate(formData);
    console.log('Результат расчёта:', currentResult);

    // Отображение результатов
    displayResults(currentResult);

    // Прокрутка к результатам
    document.getElementById('resultsSection').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

  } catch (error) {
    console.error('Ошибка расчёта:', error);
    showError('Ошибка расчёта: ' + error.message);
  }
}

/**
 * Сбор данных из формы
 */
function collectFormData() {
  const form = document.getElementById('calculator-form');
  const formData = new FormData(form);

  return {
    birthDate: formData.get('birthDate'),
    calculationDate: formData.get('calculationDate') || new Date().toISOString().split('T')[0],
    weight: parseFloat(formData.get('weight')),
    sex: formData.get('sex'),
    diagnosis: formData.get('diagnosis'),
    clinicalForm: formData.get('clinicalForm') || null,
    condition: formData.get('condition'),
    isBreastfed: form.querySelector('#isBreastfed').checked,
    hasHypoglycemiaHistory: form.querySelector('#hasHypoglycemiaHistory').checked,
    hasCardiomyopathy: form.querySelector('#hasCardiomyopathy').checked,
    hasLiverDisease: form.querySelector('#hasLiverDisease').checked
  };
}

/**
 * Валидация данных формы
 */
function validateFormData(data) {
  if (!data.birthDate) {
    return { valid: false, error: 'Укажите дату рождения' };
  }

  const birthDate = new Date(data.birthDate);
  const calcDate = new Date(data.calculationDate);

  if (birthDate > calcDate) {
    return { valid: false, error: 'Дата рождения не может быть позже даты расчёта' };
  }

  if (!data.weight || data.weight <= 0) {
    return { valid: false, error: 'Укажите корректную массу тела' };
  }

  if (!data.sex) {
    return { valid: false, error: 'Укажите пол' };
  }

  if (!data.diagnosis) {
    return { valid: false, error: 'Выберите диагноз' };
  }

  // Проверка клинической формы для диагнозов с несколькими формами
  const diagnosesWithForms = ['CPT2', 'VLCAD', 'GA2'];
  if (diagnosesWithForms.includes(data.diagnosis) && !data.clinicalForm) {
    return { valid: false, error: 'Выберите клиническую форму' };
  }

  return { valid: true };
}

/**
 * Сброс формы
 */
function handleReset() {
  // Скрыть результаты
  document.getElementById('resultsSection').classList.add('hidden');
  currentResult = null;

  // Сбросить отображение возраста
  document.getElementById('ageDisplay').textContent = '';

  // Скрыть информацию о диагнозе
  document.getElementById('diagnosisInfo').classList.add('hidden');
  document.getElementById('clinicalFormGroup').classList.add('hidden');

  // Скрыть предупреждение о кризе
  document.getElementById('crisisAlert').classList.add('hidden');

  // Установить даты заново
  setTimeout(setDefaultDates, 0);
}

/**
 * Обновление отображения возраста
 */
function updateAgeDisplay() {
  const birthDateInput = document.getElementById('birthDate');
  const calcDateInput = document.getElementById('calculationDate');
  const ageDisplay = document.getElementById('ageDisplay');

  if (!birthDateInput.value) {
    ageDisplay.textContent = '';
    return;
  }

  const birthDate = new Date(birthDateInput.value);
  const calcDate = calcDateInput.value ? new Date(calcDateInput.value) : new Date();

  if (birthDate > calcDate) {
    ageDisplay.textContent = 'Некорректная дата';
    ageDisplay.style.color = 'var(--color-danger)';
    return;
  }

  const ageMonths = FAODUtils.getAgeInMonths(birthDate, calcDate);
  const ageText = FAODUtils.formatAge(ageMonths);

  ageDisplay.textContent = `Возраст: ${ageText}`;
  ageDisplay.style.color = '';
}

/**
 * Обработка изменения диагноза
 */
function handleDiagnosisChange(event) {
  const diagnosis = event.target.value;
  const clinicalFormGroup = document.getElementById('clinicalFormGroup');
  const clinicalFormSelect = document.getElementById('clinicalForm');
  const diagnosisInfo = document.getElementById('diagnosisInfo');

  if (!diagnosis || !calculator || !calculator.loaded) {
    clinicalFormGroup.classList.add('hidden');
    diagnosisInfo.classList.add('hidden');
    return;
  }

  // Получение данных о диагнозе
  const diagData = calculator.data.diagnoses.diagnoses[diagnosis];

  if (!diagData) {
    diagnosisInfo.classList.add('hidden');
    return;
  }

  // Показ информации о диагнозе
  displayDiagnosisInfo(diagData);

  // Обработка клинических форм
  if (diagData.clinicalForms && diagData.clinicalForms.length > 0) {
    clinicalFormSelect.innerHTML = '<option value="">Выберите форму...</option>';

    diagData.clinicalForms.forEach(form => {
      const option = document.createElement('option');
      option.value = form.id;
      option.textContent = form.name;
      clinicalFormSelect.appendChild(option);
    });

    clinicalFormGroup.classList.remove('hidden');
  } else {
    clinicalFormGroup.classList.add('hidden');
    clinicalFormSelect.value = '';
  }
}

/**
 * Отображение информации о диагнозе
 */
function displayDiagnosisInfo(diagData) {
  const container = document.getElementById('diagnosisInfo');
  const nameEl = document.getElementById('diagnosisName');
  const descEl = document.getElementById('diagnosisDescription');
  const tagsEl = document.getElementById('diagnosisTags');

  nameEl.textContent = diagData.name;
  descEl.textContent = diagData.description;

  // Теги
  let tags = '';

  if (diagData.requiresDiet) {
    tags += '<span class="tag tag-diet">Требуется диета</span>';
  }

  if (diagData.requiresMCT) {
    tags += '<span class="tag tag-mct">MCT обязательно</span>';
  }

  if (diagData.mctContraindicated) {
    tags += '<span class="tag tag-mct-danger">MCT противопоказаны!</span>';
  }

  if (diagData.requiresDHA) {
    tags += '<span class="tag tag-dha">DHA обязательна</span>';
  }

  if (diagData.carnitineRequired) {
    tags += '<span class="tag tag-carnitine">Карнитин обязателен</span>';
  }

  tagsEl.innerHTML = tags;
  container.classList.remove('hidden');
}

/**
 * Обработка изменения состояния
 */
function handleConditionChange(event) {
  const condition = event.target.value;
  const crisisAlert = document.getElementById('crisisAlert');

  if (condition === 'crisis') {
    crisisAlert.classList.remove('hidden');
  } else {
    crisisAlert.classList.add('hidden');
  }
}

// ============ Отображение результатов ============

/**
 * Отображение результатов расчёта
 */
function displayResults(result) {
  const container = document.getElementById('resultsSection');

  let html = `
    <div class="results-header">
      <h2>Результаты расчёта</h2>
      <div class="results-actions">
        <button class="btn btn-secondary" onclick="window.print()" title="Печать страницы">
          Печать
        </button>
        <button class="btn btn-primary" onclick="exportToWord()" title="Скачать документ Word">
          Word
        </button>
        <button class="btn btn-secondary" onclick="exportToPDF()" title="Открыть для печати в PDF">
          PDF
        </button>
        <button class="btn btn-warning" onclick="exportParentMemo()" title="Памятка для родителей">
          Памятка
        </button>
      </div>
    </div>
  `;

  // Блок предупреждений (если есть)
  if (result.warnings && result.warnings.length > 0) {
    html += renderWarnings(result.warnings);
  }

  // Информация о пациенте
  html += renderPatientInfo(result);

  // Энергетическая потребность
  html += renderEnergy(result.energy);

  // Макронутриенты
  html += renderMacros(result.macros);

  // Незаменимые жирные кислоты
  html += renderEFA(result.efa);

  // Режим питания
  html += renderFeeding(result.feeding);

  // Препараты
  html += renderMedications(result.medications);

  // Смеси (если применимо)
  if (result.formulas && result.formulas.feedingType !== 'normal') {
    html += renderFormulas(result.formulas, result.patient.weight);
  }

  // Экстренный протокол (если криз или интеркуррентное заболевание)
  if (result.patient.condition !== 'stable') {
    html += renderEmergency(result.emergency, result.patient.condition);
  }

  container.innerHTML = html;
  container.classList.remove('hidden');
}

/**
 * Рендеринг предупреждений
 */
function renderWarnings(warnings) {
  let html = '<div class="result-block"><h3>Важные предупреждения</h3><ul class="warnings-list">';

  warnings.forEach(warning => {
    const icon = warning.level === 'danger' ? '⚠️' :
                 warning.level === 'warning' ? '⚡' : 'ℹ️';
    html += `
      <li class="warning-item ${warning.level}">
        <span class="warning-icon">${icon}</span>
        <span>${warning.message}</span>
      </li>
    `;
  });

  html += '</ul></div>';
  return html;
}

/**
 * Рендеринг информации о пациенте
 */
function renderPatientInfo(result) {
  const p = result.patient;
  const d = result.diagnosisInfo;

  return `
    <div class="result-block">
      <h3>Данные пациента</h3>
      <div class="result-row">
        <span class="result-label">Возраст</span>
        <span class="result-value">${p.ageDisplay}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Масса тела</span>
        <span class="result-value">${p.weight} кг</span>
      </div>
      <div class="result-row">
        <span class="result-label">Пол</span>
        <span class="result-value">${FAODUtils.sexNames[p.sex]}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Диагноз</span>
        <span class="result-value">${d.fullName}</span>
      </div>
      ${d.clinicalForm ? `
      <div class="result-row">
        <span class="result-label">Клиническая форма</span>
        <span class="result-value">${d.clinicalForm.name}</span>
      </div>
      ` : ''}
      <div class="result-row">
        <span class="result-label">Состояние</span>
        <span class="result-value ${p.condition !== 'stable' ? 'text-danger' : ''}">${FAODUtils.conditionNames[p.condition]}</span>
      </div>
    </div>
  `;
}

/**
 * Рендеринг энергетической потребности
 */
function renderEnergy(energy) {
  return `
    <div class="result-block">
      <h3>Энергетическая потребность</h3>
      <div class="result-row">
        <span class="result-label">Суточная калорийность</span>
        <span class="result-value highlight">${FAODUtils.formatNumber(energy.totalKcal)} ккал</span>
      </div>
      <div class="result-row">
        <span class="result-label">На кг массы тела</span>
        <span class="result-value">${energy.kcalPerKg} ккал/кг</span>
      </div>
      ${energy.conditionNote ? `
      <div class="result-row">
        <span class="result-label">Коррекция</span>
        <span class="result-value text-warning">${energy.conditionNote}</span>
      </div>
      ` : ''}
    </div>
  `;
}

/**
 * Рендеринг макронутриентов
 */
function renderMacros(macros) {
  let warningsHtml = '';
  if (macros.warnings && macros.warnings.length > 0) {
    warningsHtml = `
      <div class="alert alert-warning" style="margin-top: var(--spacing-md)">
        ${macros.warnings.join('<br>')}
      </div>
    `;
  }

  return `
    <div class="result-block">
      <h3>Макронутриенты</h3>
      <p style="color: var(--color-text-secondary); margin-bottom: var(--spacing-md)">
        ${macros.dietDescription}
      </p>
      <table class="macro-table">
        <thead>
          <tr>
            <th>Нутриент</th>
            <th>Граммы</th>
            <th>% калорий</th>
            <th>ккал</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Белки</strong></td>
            <td>${macros.protein.grams} г</td>
            <td>${macros.protein.percent}%</td>
            <td>${macros.protein.kcal}</td>
          </tr>
          <tr>
            <td><strong>Углеводы</strong></td>
            <td>${macros.carbs.grams} г</td>
            <td>${macros.carbs.percent}%</td>
            <td>${macros.carbs.kcal}</td>
          </tr>
          <tr>
            <td><strong>Жиры (всего)</strong></td>
            <td>${macros.fat.grams} г</td>
            <td>${macros.fat.percent}%</td>
            <td>${macros.fat.kcal}</td>
          </tr>
          <tr>
            <td style="padding-left: 20px">в т.ч. MCT ${macros.mct.contraindicated ? '<span class="text-danger">(противопоказаны!)</span>' : ''}</td>
            <td>${macros.mct.grams} г</td>
            <td>${macros.mct.percent}%</td>
            <td>${macros.mct.kcal}</td>
          </tr>
          <tr>
            <td style="padding-left: 20px">в т.ч. LCT ${macros.lct.note ? `<small>(${macros.lct.note})</small>` : ''}</td>
            <td>${macros.lct.grams} г</td>
            <td>${macros.lct.percent}%</td>
            <td>${macros.lct.kcal}</td>
          </tr>
        </tbody>
      </table>
      ${warningsHtml}
    </div>
  `;
}

/**
 * Рендеринг незаменимых жирных кислот
 */
function renderEFA(efa) {
  let dhaHtml = '';
  if (efa.dha) {
    dhaHtml = `
      <div class="result-row">
        <span class="result-label">DHA (докозагексаеновая)</span>
        <span class="result-value text-warning">
          ${efa.dha.mgPerDay.min}–${efa.dha.mgPerDay.max} мг/сут
          <br><small>${efa.dha.note}</small>
        </span>
      </div>
    `;
  }

  return `
    <div class="result-block">
      <h3>Незаменимые жирные кислоты</h3>
      <div class="result-row">
        <span class="result-label">${efa.linoleicAcid.name}</span>
        <span class="result-value">${efa.linoleicAcid.gramsPerDay} г/сут (${efa.linoleicAcid.percent}%)</span>
      </div>
      <div class="result-row">
        <span class="result-label">${efa.alphaLinolenicAcid.name}</span>
        <span class="result-value">${efa.alphaLinolenicAcid.gramsPerDay} г/сут (${efa.alphaLinolenicAcid.percent}%)</span>
      </div>
      ${dhaHtml}
      <div class="result-row">
        <span class="result-label">Соотношение LA:ALA</span>
        <span class="result-value">${efa.ratio.la_to_ala}:1 (оптимально ${efa.ratio.optimal})</span>
      </div>
    </div>
  `;
}

/**
 * Рендеринг режима питания
 */
function renderFeeding(feeding) {
  let cornstarchHtml = '';
  if (feeding.cornstarch && feeding.cornstarch.eligible) {
    cornstarchHtml = `
      <div class="alert alert-info" style="margin-top: var(--spacing-md)">
        <strong>Кукурузный крахмал:</strong> ${feeding.cornstarch.dose}, ${feeding.cornstarch.dilution}.
        ${feeding.cornstarch.timing}. ${feeding.cornstarch.indication}.
      </div>
    `;
  }

  return `
    <div class="result-block">
      <h3>Режим питания</h3>
      <div class="result-row">
        <span class="result-label">Возрастная группа</span>
        <span class="result-value">${feeding.ageGroup}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Интервал днём</span>
        <span class="result-value highlight">не более ${feeding.dayIntervalHours} ч</span>
      </div>
      <div class="result-row">
        <span class="result-label">Интервал ночью</span>
        <span class="result-value highlight">не более ${feeding.nightIntervalHours} ч</span>
      </div>
      <div class="result-row">
        <span class="result-label">Кормлений в сутки</span>
        <span class="result-value">${feeding.feedingsPerDay}</span>
      </div>
      ${feeding.conditionAdjusted ? '<p class="text-warning" style="margin-top: var(--spacing-sm)">Интервалы сокращены из-за текущего состояния</p>' : ''}
      ${feeding.recommendations.length > 0 ? `
      <div style="margin-top: var(--spacing-md)">
        <strong>Рекомендации:</strong>
        <ul style="margin-top: var(--spacing-xs); padding-left: 20px;">
          ${feeding.recommendations.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
      ${cornstarchHtml}
    </div>
  `;
}

/**
 * Рендеринг препаратов
 */
function renderMedications(meds) {
  let html = '<div class="result-block"><h3>Медикаментозная терапия</h3>';

  // Карнитин
  if (meds.carnitine) {
    if (meds.carnitine.contraindicated) {
      html += `
        <div class="alert alert-danger">
          <strong>L-карнитин:</strong> ${meds.carnitine.note}
        </div>
      `;
    } else if (meds.carnitine.required) {
      html += `
        <div class="result-row">
          <span class="result-label">L-карнитин</span>
          <span class="result-value">
            ${meds.carnitine.dailyDose}<br>
            <small>${meds.carnitine.frequency}</small>
            ${meds.carnitine.ivNote ? `<br><span class="text-danger">${meds.carnitine.ivNote}</span>` : ''}
          </span>
        </div>
      `;
    }
  }

  // Рибофлавин
  if (meds.riboflavin && meds.riboflavin.required) {
    html += `
      <div class="result-row">
        <span class="result-label">Рибофлавин (B2)</span>
        <span class="result-value">
          ${meds.riboflavin.dailyDose}<br>
          <small>${meds.riboflavin.note}</small>
        </span>
      </div>
    `;
  }

  // DHA
  if (meds.dha && meds.dha.required) {
    html += `
      <div class="result-row">
        <span class="result-label">DHA (омега-3)</span>
        <span class="result-value">
          ${meds.dha.recommended}<br>
          <small>${meds.dha.indication}</small>
        </span>
      </div>
    `;
  }

  // Другие препараты
  if (meds.other && meds.other.length > 0) {
    meds.other.forEach(med => {
      html += `
        <div class="result-row">
          <span class="result-label">${med.name}</span>
          <span class="result-value">
            ${med.dailyDose || ''}<br>
            <small>${med.indication}</small>
          </span>
        </div>
      `;
    });
  }

  html += '</div>';
  return html;
}

/**
 * Рендеринг смесей
 */
function renderFormulas(formulas, weight) {
  let html = `
    <div class="result-block">
      <h3>Специализированное питание</h3>
      <div class="result-row">
        <span class="result-label">Тип вскармливания</span>
        <span class="result-value">${formulas.feedingDescription}</span>
      </div>
  `;

  if (formulas.volumeMLPerKg) {
    const dailyVolume = Math.round(formulas.volumeMLPerKg * weight);
    html += `
      <div class="result-row">
        <span class="result-label">Объём смеси</span>
        <span class="result-value">${formulas.volumeMLPerKg} мл/кг/сут = ${dailyVolume} мл/сут</span>
      </div>
    `;
  }

  if (formulas.recommended && formulas.recommended.length > 0) {
    html += '<div style="margin-top: var(--spacing-md)"><strong>Рекомендуемые смеси:</strong><ul style="margin-top: var(--spacing-xs); padding-left: 20px;">';
    formulas.recommended.forEach(f => {
      html += `<li><strong>${f.name}</strong> (${f.manufacturer}) — ${f.note || ''}</li>`;
    });
    html += '</ul></div>';
  }

  if (formulas.warning) {
    html += `<div class="alert alert-warning" style="margin-top: var(--spacing-md)">${formulas.warning}</div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Рендеринг экстренного протокола
 */
function renderEmergency(emergency, condition) {
  const title = condition === 'crisis'
    ? 'Экстренный протокол при кризе'
    : 'Экстренный протокол при заболевании';

  return `
    <div class="result-block emergency-block">
      <h3>${title}</h3>
      <div class="result-row">
        <span class="result-label">Раствор глюкозы</span>
        <span class="result-value highlight">${emergency.glucoseConcentration}</span>
      </div>
      <div class="result-row">
        <span class="result-label">Скорость введения</span>
        <span class="result-value">${emergency.rateMLPerHour} мл/час</span>
      </div>
      <div class="result-row">
        <span class="result-label">Суточный объём</span>
        <span class="result-value">${emergency.dailyVolumeML} мл (${emergency.dailyKcal} ккал)</span>
      </div>

      <div style="margin-top: var(--spacing-md)">
        <strong>Инструкции:</strong>
        <ul style="margin-top: var(--spacing-xs); padding-left: 20px;">
          ${emergency.instructions.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>

      <div class="alert alert-danger" style="margin-top: var(--spacing-md)">
        <strong>Показания к госпитализации:</strong>
        <ul style="margin-top: var(--spacing-xs); padding-left: 20px;">
          ${emergency.hospitalIndications.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

// ============ Вспомогательные функции ============

/**
 * Показать/скрыть индикатор загрузки
 */
function showLoading(show) {
  const modal = document.getElementById('loadingModal');
  if (show) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

/**
 * Показать ошибку
 */
function showError(message) {
  const modal = document.getElementById('errorModal');
  document.getElementById('errorMessage').textContent = message;
  modal.classList.remove('hidden');
}

/**
 * Закрыть модальное окно ошибки
 */
function closeErrorModal() {
  document.getElementById('errorModal').classList.add('hidden');
}

// Функции экспорта определены в export.js
