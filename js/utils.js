/**
 * Утилиты для калькулятора FAOD
 */

const FAODUtils = {
  /**
   * Форматирование числа с разделителями
   */
  formatNumber(num, decimals = 0) {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString('ru-RU', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },

  /**
   * Форматирование диапазона
   */
  formatRange(min, max, unit = '') {
    if (min === max) {
      return `${this.formatNumber(min)}${unit}`;
    }
    return `${this.formatNumber(min)}–${this.formatNumber(max)}${unit}`;
  },

  /**
   * Склонение слов
   */
  pluralize(num, forms) {
    // forms = ['год', 'года', 'лет'] или ['месяц', 'месяца', 'месяцев']
    const n = Math.abs(num) % 100;
    const n1 = n % 10;

    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  },

  /**
   * Форматирование возраста
   */
  formatAge(months) {
    if (months < 1) {
      const days = Math.round(months * 30);
      return `${days} ${this.pluralize(days, ['день', 'дня', 'дней'])}`;
    }

    if (months < 12) {
      return `${months} ${this.pluralize(months, ['месяц', 'месяца', 'месяцев'])}`;
    }

    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    if (remainingMonths === 0) {
      return `${years} ${this.pluralize(years, ['год', 'года', 'лет'])}`;
    }

    return `${years} ${this.pluralize(years, ['год', 'года', 'лет'])} ` +
           `${remainingMonths} ${this.pluralize(remainingMonths, ['месяц', 'месяца', 'месяцев'])}`;
  },

  /**
   * Форматирование даты
   */
  formatDate(date, format = 'short') {
    const d = new Date(date);
    const options = format === 'short'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : { day: 'numeric', month: 'long', year: 'numeric' };

    return d.toLocaleDateString('ru-RU', options);
  },

  /**
   * Расчёт возраста в месяцах между двумя датами
   */
  getAgeInMonths(birthDate, toDate = new Date()) {
    const birth = new Date(birthDate);
    const to = new Date(toDate);

    let months = (to.getFullYear() - birth.getFullYear()) * 12;
    months += to.getMonth() - birth.getMonth();

    if (to.getDate() < birth.getDate()) {
      months--;
    }

    return Math.max(0, months);
  },

  /**
   * Проверка валидности даты
   */
  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  },

  /**
   * Округление до заданного числа знаков
   */
  round(num, decimals = 0) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  },

  /**
   * Проверка, входит ли число в диапазон
   */
  inRange(num, min, max) {
    return num >= min && num <= max;
  },

  /**
   * Генерация уникального ID
   */
  generateId() {
    return 'faod_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * Глубокое копирование объекта
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /**
   * Валидация ввода веса
   */
  validateWeight(weight, ageMonths) {
    const num = parseFloat(weight);
    if (isNaN(num) || num <= 0) {
      return { valid: false, error: 'Введите корректную массу тела' };
    }

    // Примерные границы по возрасту
    if (ageMonths < 1 && (num < 1.5 || num > 6)) {
      return { valid: false, error: 'Масса новорождённого обычно 2-5 кг' };
    }
    if (ageMonths < 12 && (num < 3 || num > 15)) {
      return { valid: false, error: 'Проверьте массу тела для данного возраста' };
    }
    if (ageMonths < 36 && (num < 8 || num > 25)) {
      return { valid: false, error: 'Проверьте массу тела для данного возраста' };
    }
    if (num > 300) {
      return { valid: false, error: 'Масса тела превышает допустимые значения' };
    }

    return { valid: true, value: num };
  },

  /**
   * Цвет по уровню предупреждения
   */
  getWarningColor(level) {
    const colors = {
      danger: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8',
      success: '#28a745'
    };
    return colors[level] || colors.info;
  },

  /**
   * Иконка по уровню предупреждения
   */
  getWarningIcon(level) {
    const icons = {
      danger: '⚠️',
      warning: '⚡',
      info: 'ℹ️',
      success: '✓'
    };
    return icons[level] || icons.info;
  },

  /**
   * Конвертация процентов в граммы
   */
  percentToGrams(totalKcal, percent, kcalPerGram) {
    return this.round((totalKcal * percent / 100) / kcalPerGram, 1);
  },

  /**
   * Названия диагнозов на русском
   */
  diagnosisNames: {
    'OCTN2': 'Первичный дефицит карнитина',
    'CPT1': 'Дефицит CPT1',
    'CACT': 'Дефицит CACT',
    'CPT2': 'Дефицит CPT2',
    'SCAD': 'Дефицит SCAD',
    'MCAD': 'Дефицит MCAD',
    'VLCAD': 'Дефицит VLCAD',
    'SCHAD': 'Дефицит SCHAD',
    'LCHAD': 'Дефицит LCHAD',
    'TFP': 'Дефицит TFP',
    'GA2': 'Глутаровая ацидурия тип 2'
  },

  /**
   * Названия состояний
   */
  conditionNames: {
    'stable': 'Стабильное состояние',
    'intercurrent': 'Интеркуррентное заболевание',
    'crisis': 'Метаболический криз'
  },

  /**
   * Названия пола
   */
  sexNames: {
    'male': 'Мужской',
    'female': 'Женский'
  },

  /**
   * Экспорт данных в формат для печати
   */
  prepareForPrint(result) {
    return {
      title: 'Расчёт диетотерапии FAOD',
      subtitle: `${this.diagnosisNames[result.patient.diagnosis]} — ${result.patient.ageDisplay}`,
      date: this.formatDate(new Date(), 'long'),
      sections: [
        {
          title: 'Данные пациента',
          items: [
            { label: 'Возраст', value: result.patient.ageDisplay },
            { label: 'Масса тела', value: `${result.patient.weight} кг` },
            { label: 'Пол', value: this.sexNames[result.patient.sex] },
            { label: 'Диагноз', value: this.diagnosisNames[result.patient.diagnosis] },
            { label: 'Состояние', value: this.conditionNames[result.patient.condition] }
          ]
        },
        {
          title: 'Энергетическая потребность',
          items: [
            { label: 'Суточная калорийность', value: `${result.energy.totalKcal} ккал` },
            { label: 'На кг массы тела', value: `${result.energy.kcalPerKg} ккал/кг` }
          ]
        },
        {
          title: 'Макронутриенты',
          items: [
            { label: 'Белки', value: `${result.macros.protein.grams} г (${result.macros.protein.percent}%)` },
            { label: 'Углеводы', value: `${result.macros.carbs.grams} г (${result.macros.carbs.percent}%)` },
            { label: 'Жиры всего', value: `${result.macros.fat.grams} г (${result.macros.fat.percent}%)` },
            { label: 'в т.ч. MCT', value: `${result.macros.mct.grams} г` },
            { label: 'в т.ч. LCT', value: `${result.macros.lct.grams} г` }
          ]
        },
        {
          title: 'Режим питания',
          items: [
            { label: 'Интервал днём', value: `не более ${result.feeding.dayIntervalHours} ч` },
            { label: 'Интервал ночью', value: `не более ${result.feeding.nightIntervalHours} ч` },
            { label: 'Кормлений в сутки', value: `${result.feeding.feedingsPerDay}` }
          ]
        }
      ]
    };
  }
};

// Константы
const FAOD_CONSTANTS = {
  KCAL_PER_GRAM: {
    protein: 4,
    carbs: 4,
    fat: 9,
    mct: 8.3
  },

  AGE_GROUPS: {
    NEWBORN: { from: 0, to: 0.5, label: 'Новорождённый' },
    INFANT_EARLY: { from: 0.5, to: 6, label: 'Грудной (до 6 мес)' },
    INFANT_LATE: { from: 6, to: 12, label: 'Грудной (6-12 мес)' },
    TODDLER: { from: 12, to: 36, label: 'Ранний возраст' },
    PRESCHOOL: { from: 36, to: 72, label: 'Дошкольный' },
    SCHOOL: { from: 72, to: 144, label: 'Школьный' },
    ADOLESCENT: { from: 144, to: 216, label: 'Подростковый' },
    ADULT: { from: 216, to: 1200, label: 'Взрослый' }
  },

  CONDITIONS: ['stable', 'intercurrent', 'crisis'],

  DIAGNOSES: [
    'OCTN2', 'CPT1', 'CACT', 'CPT2', 'SCAD',
    'MCAD', 'VLCAD', 'SCHAD', 'LCHAD', 'TFP', 'GA2'
  ],

  MCT_CONTRAINDICATED: ['MCAD', 'GA2'],

  CARNITINE_IV_CONTRAINDICATED: ['VLCAD_SYMPTOMATIC', 'LCHAD', 'TFP'],

  DHA_REQUIRED: ['LCHAD', 'TFP']
};

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FAODUtils, FAOD_CONSTANTS };
}
