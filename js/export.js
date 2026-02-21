/**
 * Модуль экспорта документов
 * Экспорт результатов расчёта в Word (docx) и PDF
 */

const FAODExport = {
  /**
   * Экспорт в Word (HTML-based, открывается в Word)
   */
  async exportToWord(result) {
    const html = this.generateWordHTML(result);
    const blob = new Blob([html], {
      type: 'application/msword'
    });

    const filename = this.generateFilename(result, 'doc');
    this.downloadBlob(blob, filename);
  },

  /**
   * Экспорт в PDF (через печать браузера)
   */
  exportToPDF(result) {
    // Создаём окно для печати
    const printWindow = window.open('', '_blank');
    const html = this.generatePrintHTML(result);

    printWindow.document.write(html);
    printWindow.document.close();

    // Ждём загрузки и запускаем печать
    printWindow.onload = () => {
      printWindow.print();
    };
  },

  /**
   * Генерация имени файла
   */
  generateFilename(result, extension) {
    const date = new Date().toISOString().split('T')[0];
    const diagnosis = result.patient.diagnosis;
    const age = result.patient.ageDisplay.replace(/[^а-яa-z0-9]/gi, '_');
    return `FAOD_${diagnosis}_${age}_${date}.${extension}`;
  },

  /**
   * Скачивание файла
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Генерация HTML для Word
   */
  generateWordHTML(result) {
    const p = result.patient;
    const d = result.diagnosisInfo;
    const e = result.energy;
    const m = result.macros;
    const efa = result.efa;
    const f = result.feeding;
    const meds = result.medications;

    return `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Расчёт диетотерапии FAOD</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
    }
    h1 {
      font-size: 16pt;
      text-align: center;
      margin-bottom: 5pt;
      color: #1a365d;
    }
    h2 {
      font-size: 14pt;
      margin-top: 15pt;
      margin-bottom: 8pt;
      color: #2c5282;
      border-bottom: 1px solid #2c5282;
      padding-bottom: 3pt;
    }
    h3 {
      font-size: 12pt;
      margin-top: 10pt;
      margin-bottom: 5pt;
      font-weight: bold;
    }
    .subtitle {
      text-align: center;
      font-size: 10pt;
      color: #666;
      margin-bottom: 15pt;
    }
    .date {
      text-align: right;
      font-size: 10pt;
      color: #666;
      margin-bottom: 15pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 5pt 8pt;
      text-align: left;
    }
    th {
      background-color: #e2e8f0;
      font-weight: bold;
    }
    .label {
      color: #555;
      width: 40%;
    }
    .value {
      font-weight: bold;
    }
    .highlight {
      color: #2563eb;
      font-size: 14pt;
    }
    .warning {
      background-color: #fef3c7;
      border: 1px solid #f59e0b;
      padding: 8pt;
      margin: 10pt 0;
    }
    .danger {
      background-color: #fee2e2;
      border: 1px solid #dc2626;
      padding: 8pt;
      margin: 10pt 0;
      color: #dc2626;
    }
    .info {
      background-color: #e0f2fe;
      border: 1px solid #0891b2;
      padding: 8pt;
      margin: 10pt 0;
    }
    ul {
      margin: 5pt 0;
      padding-left: 20pt;
    }
    li {
      margin: 3pt 0;
    }
    .footer {
      margin-top: 30pt;
      padding-top: 10pt;
      border-top: 1px solid #ccc;
      font-size: 9pt;
      color: #666;
      text-align: center;
    }
    .section {
      margin-bottom: 15pt;
    }
  </style>
</head>
<body>
  <h1>Расчёт диетотерапии FAOD</h1>
  <p class="subtitle">Нарушения митохондриального β-окисления жирных кислот (МКБ E71.3)</p>
  <p class="date">Дата расчёта: ${FAODUtils.formatDate(new Date(), 'long')}</p>

  ${this.renderWarningsWord(result.warnings)}

  <div class="section">
    <h2>Данные пациента</h2>
    <table>
      <tr>
        <td class="label">Возраст</td>
        <td class="value">${p.ageDisplay}</td>
      </tr>
      <tr>
        <td class="label">Масса тела</td>
        <td class="value">${p.weight} кг</td>
      </tr>
      <tr>
        <td class="label">Пол</td>
        <td class="value">${FAODUtils.sexNames[p.sex]}</td>
      </tr>
      <tr>
        <td class="label">Диагноз</td>
        <td class="value">${d.fullName}</td>
      </tr>
      ${d.clinicalForm ? `
      <tr>
        <td class="label">Клиническая форма</td>
        <td class="value">${d.clinicalForm.name}</td>
      </tr>
      ` : ''}
      <tr>
        <td class="label">Ген</td>
        <td class="value">${d.gene}</td>
      </tr>
      <tr>
        <td class="label">Состояние</td>
        <td class="value">${FAODUtils.conditionNames[p.condition]}</td>
      </tr>
    </table>
  </div>

  <div class="section">
    <h2>Энергетическая потребность</h2>
    <table>
      <tr>
        <td class="label">Суточная калорийность</td>
        <td class="value highlight">${FAODUtils.formatNumber(e.totalKcal)} ккал/сут</td>
      </tr>
      <tr>
        <td class="label">На кг массы тела</td>
        <td class="value">${e.kcalPerKg} ккал/кг/сут</td>
      </tr>
      ${e.conditionNote ? `
      <tr>
        <td class="label">Коррекция</td>
        <td class="value">${e.conditionNote}</td>
      </tr>
      ` : ''}
    </table>
  </div>

  <div class="section">
    <h2>Макронутриенты</h2>
    <p><em>${m.dietDescription}</em></p>
    <table>
      <tr>
        <th>Нутриент</th>
        <th>Граммы/сут</th>
        <th>% калорий</th>
        <th>ккал</th>
      </tr>
      <tr>
        <td><strong>Белки</strong></td>
        <td>${m.protein.grams} г</td>
        <td>${m.protein.percent}%</td>
        <td>${m.protein.kcal}</td>
      </tr>
      <tr>
        <td><strong>Углеводы</strong></td>
        <td>${m.carbs.grams} г</td>
        <td>${m.carbs.percent}%</td>
        <td>${m.carbs.kcal}</td>
      </tr>
      <tr>
        <td><strong>Жиры (всего)</strong></td>
        <td>${m.fat.grams} г</td>
        <td>${m.fat.percent}%</td>
        <td>${m.fat.kcal}</td>
      </tr>
      <tr>
        <td style="padding-left: 15pt;">MCT${m.mct.contraindicated ? ' <span style="color:red">(противопоказаны!)</span>' : ''}</td>
        <td>${m.mct.grams} г</td>
        <td>${m.mct.percent}%</td>
        <td>${m.mct.kcal}</td>
      </tr>
      <tr>
        <td style="padding-left: 15pt;">LCT${m.lct.note ? ` <em>(${m.lct.note})</em>` : ''}</td>
        <td>${m.lct.grams} г</td>
        <td>${m.lct.percent}%</td>
        <td>${m.lct.kcal}</td>
      </tr>
    </table>
    ${m.warnings && m.warnings.length > 0 ? `
    <div class="warning">
      <strong>Внимание:</strong> ${m.warnings.join('; ')}
    </div>
    ` : ''}
  </div>

  <div class="section">
    <h2>Незаменимые жирные кислоты</h2>
    <table>
      <tr>
        <td class="label">Линолевая кислота (LA, ω-6)</td>
        <td class="value">${efa.linoleicAcid.gramsPerDay} г/сут (${efa.linoleicAcid.percent}%)</td>
      </tr>
      <tr>
        <td class="label">α-линоленовая кислота (ALA, ω-3)</td>
        <td class="value">${efa.alphaLinolenicAcid.gramsPerDay} г/сут (${efa.alphaLinolenicAcid.percent}%)</td>
      </tr>
      ${efa.dha ? `
      <tr>
        <td class="label">DHA (докозагексаеновая)</td>
        <td class="value">${efa.dha.mgPerDay.min}–${efa.dha.mgPerDay.max} мг/сут</td>
      </tr>
      ` : ''}
      <tr>
        <td class="label">Соотношение LA:ALA</td>
        <td class="value">${efa.ratio.la_to_ala}:1 (норма ${efa.ratio.optimal})</td>
      </tr>
    </table>
    ${efa.dha ? `
    <div class="info">
      <strong>DHA обязательна</strong> для профилактики ретинопатии и периферической нейропатии.
      Рекомендуется ежегодный осмотр офтальмолога.
    </div>
    ` : ''}
  </div>

  <div class="section">
    <h2>Режим питания</h2>
    <table>
      <tr>
        <td class="label">Возрастная группа</td>
        <td class="value">${f.ageGroup}</td>
      </tr>
      <tr>
        <td class="label">Максимальный интервал днём</td>
        <td class="value highlight">${f.dayIntervalHours} часов</td>
      </tr>
      <tr>
        <td class="label">Максимальный интервал ночью</td>
        <td class="value highlight">${f.nightIntervalHours} часов</td>
      </tr>
      <tr>
        <td class="label">Кормлений в сутки</td>
        <td class="value">${f.feedingsPerDay}</td>
      </tr>
    </table>
    ${f.recommendations && f.recommendations.length > 0 ? `
    <h3>Рекомендации:</h3>
    <ul>
      ${f.recommendations.map(r => `<li>${r}</li>`).join('')}
    </ul>
    ` : ''}
    ${f.cornstarch && f.cornstarch.eligible ? `
    <div class="info">
      <strong>Кукурузный крахмал:</strong> ${f.cornstarch.dose}, ${f.cornstarch.dilution}.
      ${f.cornstarch.timing}. ${f.cornstarch.indication}.
    </div>
    ` : ''}
  </div>

  <div class="section">
    <h2>Медикаментозная терапия</h2>
    ${this.renderMedicationsWord(meds)}
  </div>

  ${result.formulas && result.formulas.feedingType !== 'normal' ? `
  <div class="section">
    <h2>Специализированное питание</h2>
    ${this.renderFormulasWord(result.formulas, p.weight)}
  </div>
  ` : ''}

  ${p.condition !== 'stable' ? `
  <div class="section">
    <h2>Экстренный протокол</h2>
    ${this.renderEmergencyWord(result.emergency, p.condition)}
  </div>
  ` : ''}

  <div class="footer">
    <p>Основа: Клинические рекомендации РФ 2024 «Нарушения митохондриального β-окисления жирных кислот»</p>
    <p><em>Все расчёты требуют верификации врачом. Документ сформирован автоматически.</em></p>
  </div>
</body>
</html>
    `;
  },

  /**
   * Рендеринг предупреждений для Word
   */
  renderWarningsWord(warnings) {
    if (!warnings || warnings.length === 0) return '';

    let html = '<div class="section"><h2>Важные предупреждения</h2>';

    warnings.forEach(w => {
      const className = w.level === 'danger' ? 'danger' : w.level === 'warning' ? 'warning' : 'info';
      html += `<div class="${className}">${w.message}</div>`;
    });

    html += '</div>';
    return html;
  },

  /**
   * Рендеринг препаратов для Word
   */
  renderMedicationsWord(meds) {
    let html = '<table><tr><th>Препарат</th><th>Доза</th><th>Примечание</th></tr>';

    // Карнитин
    if (meds.carnitine) {
      if (meds.carnitine.contraindicated) {
        html += `
          <tr>
            <td>L-карнитин</td>
            <td colspan="2" style="color: red; font-weight: bold;">ПРОТИВОПОКАЗАН! ${meds.carnitine.note}</td>
          </tr>
        `;
      } else if (meds.carnitine.required) {
        html += `
          <tr>
            <td>L-карнитин</td>
            <td>${meds.carnitine.dailyDose}</td>
            <td>${meds.carnitine.frequency}${meds.carnitine.ivNote ? '. ' + meds.carnitine.ivNote : ''}</td>
          </tr>
        `;
      }
    }

    // Рибофлавин
    if (meds.riboflavin && meds.riboflavin.required) {
      html += `
        <tr>
          <td>Рибофлавин (B2)</td>
          <td>${meds.riboflavin.dailyDose}</td>
          <td>${meds.riboflavin.note || meds.riboflavin.indication}</td>
        </tr>
      `;
    }

    // DHA
    if (meds.dha && meds.dha.required) {
      html += `
        <tr>
          <td>DHA (омега-3)</td>
          <td>${meds.dha.recommended}</td>
          <td>${meds.dha.indication}</td>
        </tr>
      `;
    }

    // Другие
    if (meds.other && meds.other.length > 0) {
      meds.other.forEach(med => {
        html += `
          <tr>
            <td>${med.name}</td>
            <td>${med.dailyDose || '—'}</td>
            <td>${med.indication}</td>
          </tr>
        `;
      });
    }

    html += '</table>';

    // Если ничего не добавлено
    if (html === '<table><tr><th>Препарат</th><th>Доза</th><th>Примечание</th></tr></table>') {
      return '<p>Специфическая медикаментозная терапия не требуется.</p>';
    }

    return html;
  },

  /**
   * Рендеринг смесей для Word
   */
  renderFormulasWord(formulas, weight) {
    let html = `<p><strong>Тип вскармливания:</strong> ${formulas.feedingDescription}</p>`;

    if (formulas.volumeMLPerKg) {
      const dailyVolume = Math.round(formulas.volumeMLPerKg * weight);
      html += `<p><strong>Объём смеси:</strong> ${formulas.volumeMLPerKg} мл/кг/сут = ${dailyVolume} мл/сут</p>`;
    }

    if (formulas.recommended && formulas.recommended.length > 0) {
      html += '<h3>Рекомендуемые смеси:</h3><ul>';
      formulas.recommended.forEach(f => {
        html += `<li><strong>${f.name}</strong> (${f.manufacturer}) — ${f.note || ''}</li>`;
      });
      html += '</ul>';
    }

    if (formulas.warning) {
      html += `<div class="warning">${formulas.warning}</div>`;
    }

    return html;
  },

  /**
   * Рендеринг экстренного протокола для Word
   */
  renderEmergencyWord(emergency, condition) {
    const title = condition === 'crisis'
      ? 'Экстренный протокол при метаболическом кризе'
      : 'Протокол при интеркуррентном заболевании';

    return `
      <div class="danger">
        <h3>${title}</h3>
        <table>
          <tr>
            <td class="label">Раствор глюкозы</td>
            <td class="value">${emergency.glucoseConcentration}</td>
          </tr>
          <tr>
            <td class="label">Скорость введения</td>
            <td class="value">${emergency.rateMLPerHour} мл/час</td>
          </tr>
          <tr>
            <td class="label">Суточный объём</td>
            <td class="value">${emergency.dailyVolumeML} мл (${emergency.dailyKcal} ккал)</td>
          </tr>
        </table>

        <h3>Инструкции:</h3>
        <ul>
          ${emergency.instructions.map(i => `<li>${i}</li>`).join('')}
        </ul>

        <h3>Показания к госпитализации:</h3>
        <ul>
          ${emergency.hospitalIndications.map(i => `<li>${i}</li>`).join('')}
        </ul>
      </div>
    `;
  },

  /**
   * Генерация HTML для печати/PDF
   */
  generatePrintHTML(result) {
    // Используем тот же HTML, что и для Word, но без специфичных для Word тегов
    let html = this.generateWordHTML(result);

    // Убираем Word-специфичные элементы
    html = html.replace(/xmlns:o="[^"]*"/g, '');
    html = html.replace(/xmlns:w="[^"]*"/g, '');
    html = html.replace(/<!--\[if gte mso 9\]>[\s\S]*?<!\[endif\]-->/g, '');

    // Добавляем автоматическую печать
    html = html.replace('</head>', `
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      </head>
    `);

    return html;
  },

  /**
   * Генерация памятки для родителей
   */
  generateParentMemo(result) {
    const p = result.patient || {};
    const d = result.diagnosisInfo || {};
    const f = result.feeding || {};
    const emergency = result.emergency || {};

    // Защита от undefined
    const ageDisplay = p.ageDisplay || 'возраст не указан';
    const weight = p.weight || '?';
    const fullName = d.fullName || d.name || 'диагноз не указан';
    const dayInterval = f.dayIntervalHours || 4;
    const nightInterval = f.nightIntervalHours || 8;
    const glucoseConc = emergency.glucoseConcentration || '15-20%';
    const rateML = emergency.rateMLPerHour || 50;
    const mctContra = d.mctContraindicated || false;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Памятка для родителей</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 14pt;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #dc2626;
      text-align: center;
      border: 3px solid #dc2626;
      padding: 15px;
      margin-bottom: 20px;
    }
    h2 {
      color: #1e40af;
      border-bottom: 2px solid #1e40af;
      padding-bottom: 5px;
    }
    .patient-info {
      background: #f0f9ff;
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .danger-box {
      background: #fee2e2;
      border: 2px solid #dc2626;
      padding: 15px;
      border-radius: 10px;
      margin: 15px 0;
    }
    .warning-box {
      background: #fef3c7;
      border: 2px solid #f59e0b;
      padding: 15px;
      border-radius: 10px;
      margin: 15px 0;
    }
    .info-box {
      background: #e0f2fe;
      border: 2px solid #0891b2;
      padding: 15px;
      border-radius: 10px;
      margin: 15px 0;
    }
    ul {
      margin: 10px 0;
    }
    li {
      margin: 8px 0;
    }
    .big-number {
      font-size: 24pt;
      font-weight: bold;
      color: #dc2626;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 10pt;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>ЭКСТРЕННАЯ ПАМЯТКА</h1>

  <div class="patient-info">
    <strong>Пациент:</strong> ${ageDisplay}, ${weight} кг<br>
    <strong>Диагноз:</strong> ${fullName}<br>
    <strong>Дата:</strong> ${FAODUtils.formatDate(new Date(), 'long')}
  </div>

  <h2>Режим кормления</h2>
  <div class="warning-box">
    <p>Максимальный перерыв между кормлениями:</p>
    <p>Днём: <span class="big-number">${dayInterval} часа</span></p>
    <p>Ночью: <span class="big-number">${nightInterval} часов</span></p>
    <p><strong>НЕЛЬЗЯ пропускать кормления!</strong></p>
  </div>

  <h2>Признаки опасности</h2>
  <div class="danger-box">
    <p><strong>Немедленно обратитесь к врачу при:</strong></p>
    <ul>
      <li>Отказ от еды более 4 часов</li>
      <li>Повторная рвота (более 2 раз)</li>
      <li>Вялость, сонливость</li>
      <li>Необычное поведение</li>
      <li>Судороги</li>
      <li>Потеря сознания</li>
    </ul>
  </div>

  <h2>При болезни (ОРВИ, рвота, температура)</h2>
  <div class="info-box">
    <ol>
      <li>Давайте углеводы каждые 2-3 часа</li>
      <li>Раствор глюкозы ${glucoseConc}</li>
      <li>По ${Math.round(rateML * 2)} мл каждые 2 часа</li>
      <li>Если рвота — сразу в больницу!</li>
    </ol>
  </div>

  ${mctContra ? `
  <h2>ЗАПРЕЩЁННЫЕ ПРОДУКТЫ</h2>
  <div class="danger-box">
    <p><strong>НЕЛЬЗЯ давать:</strong></p>
    <ul>
      <li>Кокосовое масло и продукты с ним</li>
      <li>MCT-масло</li>
      <li>Смеси с MCT</li>
    </ul>
  </div>
  ` : ''}

  <h2>Экстренные контакты</h2>
  <div class="info-box">
    <p>Лечащий врач: _______________________</p>
    <p>Телефон: _______________________</p>
    <p>Скорая помощь: <strong>103</strong></p>
  </div>

  <div class="footer">
    <p>Сформировано калькулятором FAOD на основе Клинических рекомендаций РФ 2024</p>
  </div>
</body>
</html>
    `;
  },

  /**
   * Экспорт памятки для родителей
   */
  exportParentMemo(result) {
    const html = this.generateParentMemo(result);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const diagnosis = result.patient?.diagnosis || 'FAOD';
    const filename = `Памятка_FAOD_${diagnosis}_${new Date().toISOString().split('T')[0]}.html`;
    this.downloadBlob(blob, filename);
  },

  /**
   * Экспорт памятки в PDF (открытие для печати)
   */
  exportParentMemoPDF(result) {
    const html = this.generateParentMemo(result);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  }
};

// Обновляем функцию экспорта в app.js
function exportToWord() {
  if (!currentResult) {
    showError('Сначала выполните расчёт');
    return;
  }

  FAODExport.exportToWord(currentResult);
}

function exportToPDF() {
  if (!currentResult) {
    showError('Сначала выполните расчёт');
    return;
  }

  FAODExport.exportToPDF(currentResult);
}

function exportParentMemo() {
  if (!currentResult) {
    showError('Сначала выполните расчёт');
    return;
  }

  try {
    FAODExport.exportParentMemo(currentResult);
  } catch (error) {
    console.error('Ошибка генерации памятки:', error);
    showError('Ошибка генерации памятки: ' + error.message);
  }
}

function printParentMemo() {
  if (!currentResult) {
    showError('Сначала выполните расчёт');
    return;
  }

  try {
    FAODExport.exportParentMemoPDF(currentResult);
  } catch (error) {
    console.error('Ошибка печати памятки:', error);
    showError('Ошибка печати памятки: ' + error.message);
  }
}
