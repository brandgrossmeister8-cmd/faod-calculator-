/**
 * Калькулятор диетотерапии FAOD
 * Модуль расчётов
 *
 * Основа: Клинические рекомендации РФ 2024
 * «Нарушения митохондриального β-окисления жирных кислот»
 */

class FAODCalculator {
  constructor() {
    this.data = {
      diagnoses: null,
      energyNorms: null,
      macroRatios: null,
      feedingIntervals: null,
      formulas: null,
      medications: null,
      efaNorms: null
    };
    this.loaded = false;
  }

  /**
   * Загрузка всех справочных данных
   */
  async loadData() {
    try {
      const files = [
        'diagnoses',
        'energy_norms',
        'macro_ratios',
        'feeding_intervals',
        'formulas',
        'medications',
        'efa_norms'
      ];

      const promises = files.map(file =>
        fetch(`data/${file}.json`).then(r => r.json())
      );

      const results = await Promise.all(promises);

      // Преобразуем массив диагнозов в объект для быстрого доступа по id
      const diagnosesRaw = results[0];
      const diagnosesMap = {};
      for (const diag of diagnosesRaw.diagnoses) {
        diagnosesMap[diag.id] = diag;
      }
      this.data.diagnoses = {
        diagnoses: diagnosesMap,
        categories: diagnosesRaw.categories
      };

      this.data.energyNorms = results[1];
      this.data.macroRatios = results[2];
      this.data.feedingIntervals = results[3];
      this.data.formulas = results[4];
      this.data.medications = results[5];
      this.data.efaNorms = results[6];

      this.loaded = true;
      return true;
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      return false;
    }
  }

  /**
   * Основной метод расчёта
   * @param {Object} input - входные данные пациента
   * @returns {Object} - полный расчёт диетотерапии
   */
  calculate(input) {
    this._validateInput(input);

    const ageInMonths = this._calculateAgeInMonths(input.birthDate, input.calculationDate);
    const ageInYears = ageInMonths / 12;

    // Получаем информацию о диагнозе
    const diagnosisInfo = this._getDiagnosisInfo(input.diagnosis, input.clinicalForm);

    // Расчёт энергии
    const energy = this._calculateEnergy(
      ageInMonths,
      input.weight,
      input.sex,
      input.condition
    );

    // Расчёт макронутриентов
    const macros = this._calculateMacronutrients(
      energy.totalKcal,
      input.diagnosis,
      input.clinicalForm,
      input.condition
    );

    // Расчёт незаменимых жирных кислот
    const efa = this._calculateEFA(
      ageInMonths,
      input.weight,
      energy.totalKcal,
      input.diagnosis
    );

    // Расчёт интервалов кормления
    const feeding = this._calculateFeedingIntervals(
      ageInMonths,
      input.condition,
      input.diagnosis,
      input.clinicalForm
    );

    // Расчёт препаратов
    const medications = this._calculateMedications(
      input.weight,
      ageInMonths,
      input.diagnosis,
      input.clinicalForm,
      input.condition
    );

    // Подбор смесей (для детей до 3 лет)
    const formulas = ageInMonths <= 36
      ? this._selectFormulas(input.diagnosis, input.clinicalForm, ageInMonths)
      : null;

    // Экстренный протокол
    const emergency = this._calculateEmergencyProtocol(
      ageInMonths,
      input.weight
    );

    return {
      patient: {
        ageMonths: ageInMonths,
        ageYears: Math.floor(ageInYears),
        ageDisplay: this._formatAge(ageInMonths),
        weight: input.weight,
        sex: input.sex,
        diagnosis: input.diagnosis,
        clinicalForm: input.clinicalForm,
        condition: input.condition
      },
      diagnosisInfo,
      energy,
      macros,
      efa,
      feeding,
      medications,
      formulas,
      emergency,
      warnings: this._generateWarnings(input.diagnosis, input.clinicalForm, input.condition),
      calculatedAt: new Date().toISOString()
    };
  }

  // ============ ПРИВАТНЫЕ МЕТОДЫ ============

  /**
   * Валидация входных данных
   */
  _validateInput(input) {
    const required = ['birthDate', 'weight', 'sex', 'diagnosis', 'condition'];
    for (const field of required) {
      if (!input[field]) {
        throw new Error(`Отсутствует обязательное поле: ${field}`);
      }
    }

    if (input.weight <= 0 || input.weight > 300) {
      throw new Error('Некорректная масса тела');
    }

    if (!['male', 'female'].includes(input.sex)) {
      throw new Error('Некорректный пол');
    }

    if (!['stable', 'intercurrent', 'crisis'].includes(input.condition)) {
      throw new Error('Некорректное состояние');
    }
  }

  /**
   * Расчёт возраста в месяцах
   */
  _calculateAgeInMonths(birthDate, calculationDate = new Date()) {
    const birth = new Date(birthDate);
    const calc = new Date(calculationDate);

    let months = (calc.getFullYear() - birth.getFullYear()) * 12;
    months += calc.getMonth() - birth.getMonth();

    if (calc.getDate() < birth.getDate()) {
      months--;
    }

    return Math.max(0, months);
  }

  /**
   * Форматирование возраста для отображения
   */
  _formatAge(ageInMonths) {
    if (ageInMonths < 1) {
      const days = Math.round(ageInMonths * 30);
      return `${days} дн.`;
    } else if (ageInMonths < 12) {
      return `${ageInMonths} мес.`;
    } else if (ageInMonths < 24) {
      const years = Math.floor(ageInMonths / 12);
      const months = ageInMonths % 12;
      return months > 0 ? `${years} г. ${months} мес.` : `${years} год`;
    } else {
      const years = Math.floor(ageInMonths / 12);
      const months = ageInMonths % 12;
      return months > 0 ? `${years} л. ${months} мес.` : `${years} лет`;
    }
  }

  /**
   * Получение информации о диагнозе
   */
  _getDiagnosisInfo(diagnosis, clinicalForm) {
    const diagData = this.data.diagnoses.diagnoses[diagnosis];
    if (!diagData) {
      throw new Error(`Неизвестный диагноз: ${diagnosis}`);
    }

    let formInfo = null;
    if (diagData.clinicalForms && clinicalForm) {
      formInfo = diagData.clinicalForms.find(f => f.id === clinicalForm);
    }

    return {
      code: diagnosis,
      name: diagData.nameShort,
      fullName: diagData.name,
      gene: diagData.gene,
      requiresDiet: diagData.requiresDiet,
      requiresMCT: diagData.requiresMCT,
      mctContraindicated: diagData.mctContraindicated,
      requiresDHA: diagData.requiresDHA,
      carnitineRequired: diagData.carnitineRequired,
      carnitineIVAllowed: diagData.carnitineIVAllowed,
      clinicalForm: formInfo
    };
  }

  /**
   * Расчёт суточной потребности в энергии
   */
  _calculateEnergy(ageInMonths, weight, sex, condition) {
    let kcalPerKg;

    if (ageInMonths < 12) {
      // Дети до 1 года — по месяцам
      const infantData = this.data.energyNorms.infants.data;
      const ageGroup = infantData.find(
        g => ageInMonths >= g.ageMonthsFrom && ageInMonths < g.ageMonthsTo
      );
      kcalPerKg = ageGroup ? ageGroup[sex] : infantData[infantData.length - 1][sex];
    } else if (ageInMonths < 216) {
      // Дети 1-18 лет — по годам
      const ageYears = Math.floor(ageInMonths / 12);
      const childData = this.data.energyNorms.children.data;
      const ageGroup = childData.find(
        g => ageYears >= g.ageYearsFrom && ageYears < g.ageYearsTo
      );
      kcalPerKg = ageGroup ? ageGroup[sex] : childData[childData.length - 1][sex];
    } else {
      // Взрослые
      const ageYears = Math.floor(ageInMonths / 12);
      const adultData = this.data.energyNorms.adults.data;
      const ageGroup = adultData.find(
        g => ageYears >= g.ageYearsFrom && ageYears < g.ageYearsTo
      );

      // Выбор по весу (упрощённо: < 60 кг → weight50kg, иначе weight70kg)
      const weightKey = weight < 60 ? 'weight50kg' : 'weight70kg';
      kcalPerKg = ageGroup ? ageGroup[weightKey][sex] : 40;
    }

    // Коррекция по состоянию
    const adjustments = this.data.energyNorms.adjustments;
    let multiplier = adjustments.stable.multiplier;

    if (condition === 'intercurrent') {
      multiplier = adjustments.intercurrent.multiplier;
    } else if (condition === 'crisis') {
      multiplier = adjustments.crisis.multiplier;
    }

    const baseKcal = Math.round(kcalPerKg * weight);
    const totalKcal = Math.round(baseKcal * multiplier);

    return {
      kcalPerKg: Math.round(kcalPerKg * 10) / 10,
      baseKcal,
      multiplier,
      totalKcal,
      conditionNote: condition === 'stable'
        ? null
        : `+${Math.round((multiplier - 1) * 100)}% из-за ${condition === 'crisis' ? 'криза' : 'заболевания'}`
    };
  }

  /**
   * Расчёт макронутриентов
   */
  _calculateMacronutrients(totalKcal, diagnosis, clinicalForm, condition) {
    const ratioData = this.data.macroRatios.diagnosisRatios[diagnosis];
    if (!ratioData) {
      throw new Error(`Нет данных о соотношении макронутриентов для ${diagnosis}`);
    }

    let ratios;

    // Обработка диагнозов с несколькими формами
    if (ratioData.hasMultipleForms && clinicalForm) {
      ratios = ratioData.forms[clinicalForm];
      if (!ratios) {
        throw new Error(`Неизвестная клиническая форма: ${clinicalForm}`);
      }
    } else {
      ratios = ratioData;
    }

    // При кризе — коррекция (исключение LCT, увеличение углеводов)
    let effectiveRatios = { ...ratios };
    if (condition === 'crisis') {
      const crisisAdj = this.data.macroRatios.crisisAdjustments;
      effectiveRatios = {
        ...ratios,
        lctPercent: { min: 0, max: 0, recommended: 0 },
        carbsPercent: crisisAdj.carbsIncrease
      };
    }

    // Расчёт в граммах
    const energyFactors = this.data.energyNorms.macronutrientEnergy;

    const proteinPercent = effectiveRatios.proteinPercent.recommended;
    const carbsPercent = effectiveRatios.carbsPercent.recommended || effectiveRatios.carbsPercent.min;
    const fatPercent = effectiveRatios.fatPercent.recommended;
    const mctPercent = effectiveRatios.mctPercent?.recommended || 0;
    const lctPercent = effectiveRatios.lctPercent?.recommended || fatPercent;

    const proteinKcal = totalKcal * proteinPercent / 100;
    const carbsKcal = totalKcal * carbsPercent / 100;
    const fatKcal = totalKcal * fatPercent / 100;
    const mctKcal = totalKcal * mctPercent / 100;
    const lctKcal = totalKcal * lctPercent / 100;

    const proteinGrams = Math.round(proteinKcal / energyFactors.protein.kcalPerGram);
    const carbsGrams = Math.round(carbsKcal / energyFactors.carbohydrate.kcalPerGram);
    const fatGrams = Math.round(fatKcal / energyFactors.fat.kcalPerGram);
    const mctGrams = Math.round(mctKcal / energyFactors.mct.kcalPerGram);
    const lctGrams = Math.round(lctKcal / energyFactors.fat.kcalPerGram);

    return {
      dietDescription: ratios.dietDescription,
      protein: {
        percent: proteinPercent,
        percentRange: ratios.proteinPercent,
        grams: proteinGrams,
        kcal: Math.round(proteinKcal)
      },
      carbs: {
        percent: carbsPercent,
        percentRange: effectiveRatios.carbsPercent,
        grams: carbsGrams,
        kcal: Math.round(carbsKcal)
      },
      fat: {
        percent: fatPercent,
        percentRange: ratios.fatPercent,
        grams: fatGrams,
        kcal: Math.round(fatKcal)
      },
      mct: {
        percent: mctPercent,
        percentRange: ratios.mctPercent,
        grams: mctGrams,
        kcal: Math.round(mctKcal),
        contraindicated: ratios.mctPercent?.contraindicated || false
      },
      lct: {
        percent: lctPercent,
        percentRange: ratios.lctPercent,
        grams: lctGrams,
        kcal: Math.round(lctKcal),
        note: ratios.lctPercent?.note
      },
      warnings: ratios.warnings || []
    };
  }

  /**
   * Расчёт незаменимых жирных кислот
   */
  _calculateEFA(ageInMonths, weight, totalKcal, diagnosis) {
    const efaData = this.data.efaNorms.essentialFattyAcids;

    // Найти возрастную группу для линолевой кислоты
    const laNorms = efaData.linoleicAcid.norms;
    let laGroup;
    if (ageInMonths < 12) {
      laGroup = laNorms.find(g =>
        g.ageMonthsFrom !== undefined &&
        ageInMonths >= g.ageMonthsFrom &&
        ageInMonths < g.ageMonthsTo
      );
    } else {
      const ageYears = ageInMonths / 12;
      laGroup = laNorms.find(g =>
        g.ageYearsFrom !== undefined &&
        ageYears >= g.ageYearsFrom &&
        ageYears < g.ageYearsTo
      );
    }

    if (!laGroup) {
      laGroup = laNorms[laNorms.length - 1];
    }

    // Расчёт линолевой кислоты
    const laPercent = laGroup.recommended;
    const laGrams = (totalKcal * laPercent / 100) / 9;
    const laMg = Math.round(laGrams * 1000);

    // Найти возрастную группу для альфа-линоленовой кислоты
    const alaNorms = efaData.alphaLinolenicAcid.norms;
    let alaGroup;
    if (ageInMonths < 12) {
      alaGroup = alaNorms.find(g =>
        g.ageMonthsFrom !== undefined &&
        ageInMonths >= g.ageMonthsFrom &&
        ageInMonths < g.ageMonthsTo
      );
    } else {
      const ageYears = ageInMonths / 12;
      alaGroup = alaNorms.find(g =>
        g.ageYearsFrom !== undefined &&
        ageYears >= g.ageYearsFrom &&
        ageYears < g.ageYearsTo
      );
    }

    if (!alaGroup) {
      alaGroup = alaNorms[alaNorms.length - 1];
    }

    const alaPercent = alaGroup.recommended;
    const alaGrams = (totalKcal * alaPercent / 100) / 9;
    const alaMg = Math.round(alaGrams * 1000);

    // DHA (только для LCHAD, TFP, VLCAD)
    let dha = null;
    const diagInfo = this.data.diagnoses.diagnoses[diagnosis];
    if (diagInfo?.requiresDHA) {
      const dhaNorms = efaData.dha.norms;
      let dhaGroup;
      if (ageInMonths < 12) {
        dhaGroup = dhaNorms.find(g =>
          g.ageMonthsFrom !== undefined &&
          ageInMonths >= g.ageMonthsFrom &&
          ageInMonths < g.ageMonthsTo
        );
      } else {
        const ageYears = ageInMonths / 12;
        dhaGroup = dhaNorms.find(g =>
          g.ageYearsFrom !== undefined &&
          ageYears >= g.ageYearsFrom &&
          ageYears < g.ageYearsTo
        );
      }

      if (!dhaGroup) {
        dhaGroup = dhaNorms[dhaNorms.length - 1];
      }

      dha = {
        mgPerDay: dhaGroup.mgPerDay,
        required: true,
        note: 'Обязательно для профилактики ретинопатии и нейропатии'
      };
    }

    return {
      linoleicAcid: {
        name: 'Линолевая кислота (LA, омега-6)',
        percent: laPercent,
        mgPerDay: laMg,
        gramsPerDay: Math.round(laGrams * 10) / 10
      },
      alphaLinolenicAcid: {
        name: 'Альфа-линоленовая кислота (ALA, омега-3)',
        percent: alaPercent,
        mgPerDay: alaMg,
        gramsPerDay: Math.round(alaGrams * 10) / 10
      },
      dha,
      ratio: {
        la_to_ala: Math.round(laPercent / alaPercent * 10) / 10,
        optimal: '5-10:1'
      }
    };
  }

  /**
   * Расчёт интервалов кормления
   */
  _calculateFeedingIntervals(ageInMonths, condition, diagnosis, clinicalForm) {
    const intervals = this.data.feedingIntervals;

    // Базовые интервалы по возрасту
    const stableIntervals = intervals.stableState.intervals;
    let ageGroup = stableIntervals.find(
      g => ageInMonths >= g.ageMonthsFrom && ageInMonths < g.ageMonthsTo
    );

    if (!ageGroup) {
      ageGroup = stableIntervals[stableIntervals.length - 1];
    }

    let dayInterval = ageGroup.dayIntervalHours;
    let nightInterval = ageGroup.nightIntervalHours;
    let feedingsPerDay = ageGroup.feedingsPerDay;
    let recommendations = [ageGroup.note];

    // Применение специфики диагноза ПЕРЕД коррекцией по состоянию
    const diagSpecific = intervals.diagnosisSpecific[diagnosis];
    let diagnosisNote = null;

    if (diagSpecific) {
      diagnosisNote = diagSpecific.description;

      // Применяем коррекцию интервалов по диагнозу
      if (diagSpecific.intervalAdjustment) {
        const adj = diagSpecific.intervalAdjustment;

        if (adj.type === 'stricter') {
          // Строгие интервалы для LCHAD, TFP, CACT
          dayInterval = Math.max(2, dayInterval - (adj.dayIntervalReduction || 0));
          nightInterval = Math.max(3, nightInterval - (adj.nightIntervalReduction || 0));
          if (adj.maxNightInterval && nightInterval > adj.maxNightInterval) {
            nightInterval = adj.maxNightInterval;
          }
        } else if (adj.type === 'conditional' && clinicalForm) {
          // Условная коррекция по клинической форме (VLCAD, CPT2)
          let formAdj = null;
          if (diagnosis === 'VLCAD') {
            formAdj = clinicalForm === 'symptomatic' ? adj.symptomaticForm : adj.asymptomaticForm;
          } else if (diagnosis === 'CPT2') {
            if (clinicalForm === 'neonatal') formAdj = adj.neonatalForm;
            else if (clinicalForm === 'infantile') formAdj = adj.infantileForm;
            else formAdj = adj.lateForm;
          }

          if (formAdj) {
            dayInterval = Math.max(2, dayInterval - (formAdj.dayIntervalReduction || 0));
            nightInterval = Math.max(3, nightInterval - (formAdj.nightIntervalReduction || 0));
            if (formAdj.maxNightInterval && nightInterval > formAdj.maxNightInterval) {
              nightInterval = formAdj.maxNightInterval;
            }
          }
        } else if (adj.type === 'progressive' && diagnosis === 'MCAD' && ageInMonths >= 12) {
          // MCAD: после года можно увеличить ночной интервал
          nightInterval = Math.min(12, nightInterval + (adj.nightIntervalBonus || 0));
        }
      }

      // Примечание для новорождённых с MCAD
      if (diagnosis === 'MCAD' && ageInMonths < 4 && diagSpecific.newbornNote) {
        recommendations.push(diagSpecific.newbornNote);
      }
    }

    // Коррекция по состоянию (ПОСЛЕ диагноза)
    if (condition === 'intercurrent') {
      const adj = intervals.intercurrentIllness;
      dayInterval = Math.max(
        adj.minimumDayInterval,
        dayInterval - adj.dayIntervalReduction
      );
      nightInterval = Math.max(
        adj.minimumNightInterval,
        nightInterval - adj.nightIntervalReduction
      );
      // Правильный расчёт кормлений: 14ч дня + 10ч ночи
      const dayHours = 14;
      const nightHours = 10;
      const dayFeedings = Math.ceil(dayHours / dayInterval);
      const nightFeedings = Math.ceil(nightHours / nightInterval);
      feedingsPerDay = dayFeedings + nightFeedings;
      recommendations = [...adj.recommendations];
    } else if (condition === 'crisis') {
      const crisis = intervals.metabolicCrisis;
      dayInterval = crisis.dayIntervalHours;
      nightInterval = crisis.nightIntervalHours;
      feedingsPerDay = Math.ceil(24 / 2); // Каждые 2 часа = 12 кормлений
      recommendations = [...crisis.recommendations];
    } else {
      // Для стабильного состояния пересчитываем кормления с учётом диагноза
      const dayHours = 14;
      const nightHours = 10;
      const dayFeedings = Math.ceil(dayHours / dayInterval);
      const nightFeedings = Math.ceil(nightHours / nightInterval);
      feedingsPerDay = dayFeedings + nightFeedings;
    }

    // Кукурузный крахмал (для детей старше 8 месяцев при необходимости)
    let cornstarch = null;
    if (ageInMonths >= intervals.cornstarch.minimumAge &&
        ['LCHAD', 'TFP', 'VLCAD'].includes(diagnosis)) {
      cornstarch = {
        eligible: true,
        dose: intervals.cornstarch.dose,
        dilution: intervals.cornstarch.dilution,
        timing: intervals.cornstarch.timing,
        indication: intervals.cornstarch.indication
      };
    }

    return {
      ageGroup: ageGroup.label,
      dayIntervalHours: dayInterval,
      nightIntervalHours: nightInterval,
      feedingsPerDay,
      recommendations,
      diagnosisNote,
      cornstarch,
      conditionAdjusted: condition !== 'stable'
    };
  }

  /**
   * Расчёт дозировок препаратов
   */
  _calculateMedications(weight, ageInMonths, diagnosis, clinicalForm, condition) {
    const meds = this.data.medications;
    const result = {
      carnitine: null,
      riboflavin: null,
      dha: null,
      other: []
    };

    // L-карнитин
    const carnitineInfo = meds.carnitine;
    const diagInfo = this.data.diagnoses.diagnoses[diagnosis];

    if (diagInfo?.carnitineRequired) {
      const isOCTN2 = diagnosis === 'OCTN2';
      const dosing = isOCTN2
        ? carnitineInfo.dosing.OCTN2.oral.standard
        : carnitineInfo.dosing.secondaryDeficiency.oral;

      const minDose = Math.round(weight * dosing.doseMin);
      const maxDose = Math.round(weight * dosing.doseMax);
      const cappedMax = dosing.maxDailyDose
        ? Math.min(maxDose, dosing.maxDailyDose)
        : maxDose;

      result.carnitine = {
        required: true,
        indication: isOCTN2 ? 'Патогенетическое лечение' : 'Вторичный дефицит',
        doseRange: `${dosing.doseMin}-${dosing.doseMax} мг/кг/сут`,
        dailyDose: `${minDose}-${cappedMax} мг/сут`,
        frequency: dosing.frequency,
        ivAllowed: diagInfo.carnitineIVAllowed,
        ivNote: !diagInfo.carnitineIVAllowed
          ? 'В/в введение противопоказано!'
          : null
      };
    } else if (['CPT1', 'CACT', 'CPT2', 'VLCAD'].includes(diagnosis) && condition === 'crisis') {
      // Карнитин только при кризе per os
      result.carnitine = {
        required: true,
        indication: 'Экстренный приём при кризе',
        doseRange: '100 мг/кг однократно',
        dailyDose: `${Math.round(weight * 100)} мг`,
        frequency: 'однократно',
        ivAllowed: clinicalForm !== 'VLCAD_SYMPTOMATIC',
        crisisOnly: true
      };
    } else if (['VLCAD_SYMPTOMATIC', 'LCHAD', 'TFP'].includes(clinicalForm || diagnosis)) {
      result.carnitine = {
        required: false,
        contraindicated: true,
        note: 'L-карнитин противопоказан! Может усилить аритмии.'
      };
    }

    // Рибофлавин (GA2)
    if (diagnosis === 'GA2') {
      const riboDosing = meds.riboflavin.dosing.GA2;
      const infantDose = riboDosing.infantDose;

      const minDose = Math.round(weight * infantDose.doseMin);
      const maxDose = Math.min(
        Math.round(weight * infantDose.doseMax),
        infantDose.maxDailyDose
      );

      result.riboflavin = {
        required: true,
        indication: 'Патогенетическое лечение (рибофлавин-чувствительные формы)',
        doseRange: `${infantDose.doseMin}-${infantDose.doseMax} мг/кг/сут`,
        dailyDose: `${minDose}-${maxDose} мг/сут`,
        frequency: riboDosing.oral.frequency,
        note: 'Начать с минимальной дозы, оценить ответ через 2-4 недели'
      };
    }

    // DHA (LCHAD, TFP, VLCAD)
    if (diagInfo?.requiresDHA) {
      const dhaDosing = meds.dha.dosing;
      let doseGroup;

      if (ageInMonths < 12) {
        doseGroup = dhaDosing.infants;
      } else if (ageInMonths < 36) {
        doseGroup = dhaDosing.children1to3;
      } else if (ageInMonths < 120) {
        doseGroup = dhaDosing.children3to10;
      } else {
        doseGroup = dhaDosing.adolescentsAndAdults;
      }

      result.dha = {
        required: true,
        indication: 'Профилактика ретинопатии и нейропатии',
        dailyDose: `${doseGroup.dose.min}-${doseGroup.dose.max} мг/сут`,
        recommended: `${doseGroup.dose.recommended || doseGroup.dose.min} мг/сут`,
        precautions: meds.dha.precautions
      };
    }

    // CoQ10 (опционально для GA2, VLCAD, LCHAD, TFP)
    if (['GA2', 'VLCAD', 'LCHAD', 'TFP'].includes(diagnosis)) {
      const coq10 = meds.coq10.dosing.children;
      const minDose = Math.round(weight * coq10.doseMin);
      const maxDose = Math.min(
        Math.round(weight * coq10.doseMax),
        coq10.maxDailyDose
      );

      result.other.push({
        name: 'Коэнзим Q10',
        required: false,
        indication: 'Антиоксидантная поддержка (опционально)',
        dailyDose: `${minDose}-${maxDose} мг/сут`
      });
    }

    // Жирорастворимые витамины при строгом ограничении LCT
    if (['LCHAD', 'TFP', 'VLCAD_SYMPTOMATIC', 'CACT', 'CPT2_NEONATAL', 'CPT2_INFANTILE']
        .includes(clinicalForm || diagnosis)) {
      result.other.push({
        name: 'Жирорастворимые витамины',
        required: true,
        indication: 'Компенсация при ограничении жиров',
        components: meds.supplements.fatSolubleVitamins.vitamins
      });
    }

    return result;
  }

  /**
   * Подбор специализированных смесей
   */
  _selectFormulas(diagnosis, clinicalForm, ageInMonths) {
    const formulas = this.data.formulas;
    const effectiveForm = clinicalForm || diagnosis;
    const result = {
      recommended: [],
      feedingType: null,
      volumeMLPerKg: null,
      mixedFeeding: null
    };

    // Определение типа вскармливания
    const infantFeeding = this.data.macroRatios.infantFeeding;

    if (infantFeeding.fullFormulaRequired.diagnoses.includes(effectiveForm)) {
      result.feedingType = 'full_formula';
      result.feedingDescription = '100% специализированная смесь';
    } else if (infantFeeding.mixedFeeding.diagnoses.includes(effectiveForm)) {
      result.feedingType = 'mixed';
      result.feedingDescription = '50% грудное молоко + 50% специализированная смесь';
      result.mixedFeeding = {
        breastMilkPercent: 50,
        formulaPercent: 50
      };
    } else if (infantFeeding.normalFeeding.diagnoses.includes(effectiveForm)) {
      result.feedingType = 'normal';
      result.feedingDescription = 'Грудное молоко или стандартная смесь';

      // Для MCAD — предупреждение о MCT
      if (diagnosis === 'MCAD') {
        result.warning = 'Избегать смесей, содержащих MCT!';
      }

      return result;
    }

    // Объём смеси
    result.volumeMLPerKg = ageInMonths < 6
      ? formulas.feedingCalculation.infantsUnder6Months.volumeMLperKg
      : formulas.feedingCalculation.infants6to12Months.volumeMLperKg;

    // Подбор смесей с MCT
    if (formulas.categories.mctEnriched) {
      const mctFormulas = formulas.categories.mctEnriched.formulas.filter(f =>
        f.indications && f.indications.includes(effectiveForm) &&
        ageInMonths >= f.ageFrom &&
        ageInMonths <= f.ageTo
      );
      result.recommended.push(...mctFormulas);
    }

    // MCT-масла для обогащения
    if (ageInMonths >= 4) {
      const mctOils = formulas.categories.mctOils.products.filter(p =>
        !p.contraindications || !p.contraindications.includes(diagnosis)
      );
      result.mctOils = mctOils;
    }

    return result;
  }

  /**
   * Расчёт экстренного протокола
   */
  _calculateEmergencyProtocol(ageInMonths, weight) {
    const emergency = this.data.feedingIntervals.glucoseEmergency;
    const solutions = emergency.solutions;

    // Найти подходящий протокол по возрасту
    let protocol = solutions.find(
      s => ageInMonths >= s.ageMonthsFrom && ageInMonths < s.ageMonthsTo
    );

    if (!protocol) {
      protocol = solutions[solutions.length - 1];
    }

    const dailyVolume = Math.round(protocol.dailyMLperKg * weight);
    const hourlyRate = Math.round(protocol.rateMLperKgHour * weight * 10) / 10;

    return {
      glucoseConcentration: `${protocol.concentrationPercent}%`,
      rateMLPerHour: hourlyRate,
      dailyVolumeML: dailyVolume,
      dailyKcal: Math.round(protocol.dailyKcalPerKg * weight),
      instructions: [
        `Раствор глюкозы/мальтодекстрина ${protocol.concentrationPercent}%`,
        `Давать по ${Math.round(hourlyRate * 2)} мл каждые 2 часа`,
        'При рвоте — немедленная госпитализация',
        'При отказе от питья > 4 часов — госпитализация'
      ],
      hospitalIndications: this.data.medications.emergencyProtocol.hospitalIndications
    };
  }

  /**
   * Генерация предупреждений
   */
  _generateWarnings(diagnosis, clinicalForm, condition) {
    const warnings = [];
    const diagInfo = this.data.diagnoses.diagnoses[diagnosis];

    // MCT противопоказаны
    if (diagInfo?.mctContraindicated) {
      warnings.push({
        level: 'danger',
        message: 'MCT противопоказаны! Избегать кокосового масла и MCT-продуктов.'
      });
    }

    // Карнитин в/в противопоказан
    if (!diagInfo?.carnitineIVAllowed && diagInfo?.carnitineRequired !== false) {
      warnings.push({
        level: 'warning',
        message: 'В/в введение L-карнитина противопоказано при данном диагнозе.'
      });
    }

    // LCHAD/TFP — DHA обязательна
    if (diagInfo?.requiresDHA) {
      warnings.push({
        level: 'info',
        message: 'DHA обязательна для профилактики ретинопатии. Ежегодный осмотр офтальмолога.'
      });
    }

    // При кризе
    if (condition === 'crisis') {
      warnings.push({
        level: 'danger',
        message: 'Метаболический криз! Исключить LCT на 24-48 часов. Рассмотреть госпитализацию.'
      });
    }

    // Специфичные для форм
    if (clinicalForm === 'CPT2_LATE_MUSCULAR') {
      warnings.push({
        level: 'info',
        message: 'При физических нагрузках — дополнительный приём углеводов и MCT.'
      });
    }

    return warnings;
  }
}

// Экспорт для использования в браузере и Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FAODCalculator;
}
