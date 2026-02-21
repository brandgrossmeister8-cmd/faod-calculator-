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
      efaNorms: null,
      complementaryFoods: null
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
        'efa_norms',
        'complementary_foods'
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
      this.data.complementaryFoods = results[7];

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
      feedingDescription: null,
      volumeMLPerKg: null,
      mixedFeeding: null
    };

    // Определение типа вскармливания
    const infantFeeding = this.data.macroRatios.infantFeeding;

    if (infantFeeding.fullFormulaRequired.diagnoses.includes(effectiveForm) ||
        infantFeeding.fullFormulaRequired.diagnoses.includes(diagnosis)) {
      result.feedingType = 'full_formula';
      result.feedingDescription = '100% специализированная смесь';
    } else if (infantFeeding.mixedFeeding.diagnoses.includes(effectiveForm) ||
               infantFeeding.mixedFeeding.diagnoses.includes(diagnosis)) {
      result.feedingType = 'mixed';
      result.feedingDescription = '50% грудное молоко + 50% специализированная смесь';
      result.mixedFeeding = {
        breastMilkPercent: 50,
        formulaPercent: 50
      };
    } else if (infantFeeding.normalFeeding.diagnoses.includes(effectiveForm) ||
               infantFeeding.normalFeeding.diagnoses.includes(diagnosis)) {
      result.feedingType = 'normal';
      result.feedingDescription = 'Грудное молоко или стандартная смесь';

      // Для MCAD — предупреждение о MCT
      if (diagnosis === 'MCAD') {
        result.warning = 'Избегать смесей, содержащих MCT!';
      }

      return result;
    } else {
      // Fallback: определяем по requiresDiet диагноза
      const diagInfo = this.data.diagnoses.diagnoses[diagnosis];
      if (diagInfo?.requiresDiet && diagInfo?.dietType === 'strict') {
        result.feedingType = 'full_formula';
        result.feedingDescription = '100% специализированная смесь (по умолчанию)';
      } else if (diagInfo?.requiresDiet) {
        result.feedingType = 'mixed';
        result.feedingDescription = 'Смешанное вскармливание (рекомендуется консультация)';
        result.mixedFeeding = { breastMilkPercent: 50, formulaPercent: 50 };
      } else {
        result.feedingType = 'normal';
        result.feedingDescription = 'Грудное молоко или стандартная смесь';
        return result;
      }
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

  /**
   * Расчёт детального меню по часам
   */
  calculateDetailedMenu(input) {
    const { weight, diagnosis, clinicalForm, condition, breastfeeding, sex } = input;
    const ageInMonths = input.ageInMonths || this._calculateAgeInMonths(input.birthDate, input.calculationDate);

    const complementary = this.data.complementaryFoods;
    const formulas = this.data.formulas;
    const diagInfo = this.data.diagnoses.diagnoses[diagnosis];

    // Определяем возрастную группу для меню
    let ageGroup, portions;
    if (ageInMonths < 4) {
      ageGroup = 'infant0-4m';
      portions = null; // Только смесь
    } else if (ageInMonths < 6) {
      ageGroup = 'infant4-6m';
      portions = complementary.portionsByAge['4-6m'];
    } else if (ageInMonths < 9) {
      ageGroup = 'infant6-9m';
      portions = complementary.portionsByAge['6-9m'];
    } else if (ageInMonths < 12) {
      ageGroup = 'infant9-12m';
      portions = complementary.portionsByAge['9-12m'];
    } else if (ageInMonths < 36) {
      ageGroup = 'toddler1-3y';
      portions = complementary.portionsByAge['1-3y'];
    } else {
      ageGroup = 'preschool3-6y';
      portions = complementary.portionsByAge['3-6y'];
    }

    // Рассчитываем общую калорийность
    const energy = this._calculateEnergy(ageInMonths, weight, sex || 'male', condition);
    const macros = this._calculateMacronutrients(energy.totalKcal, diagnosis, clinicalForm, condition);

    // Определяем тип смеси
    const effectiveForm = clinicalForm || diagnosis;
    let recommendedFormula = null;
    let formulaType = 'standard';

    if (['LCHAD', 'TFP', 'VLCAD_SYMPTOMATIC', 'CACT', 'CPT2_NEONATAL', 'CPT2_INFANTILE'].includes(effectiveForm)) {
      formulaType = 'mctEnriched';
      const mctFormulas = formulas.categories.mctEnriched.formulas.filter(f =>
        ageInMonths >= f.ageFrom && ageInMonths <= (f.ageTo || 999)
      );
      recommendedFormula = mctFormulas.length > 0 ? mctFormulas[0] : null;
    } else if (['GA2', 'CPT1'].includes(diagnosis)) {
      formulaType = 'lowFat';
      recommendedFormula = formulas.categories.lowFat.formulas[0];
    }

    // Расчёт объёма смеси
    let formulaVolumePerDay;
    if (ageInMonths < 6) {
      formulaVolumePerDay = Math.round(weight * 150); // 150 мл/кг
    } else if (ageInMonths < 12) {
      formulaVolumePerDay = Math.round(weight * 120); // 120 мл/кг с прикормом
    } else if (ageInMonths < 36) {
      formulaVolumePerDay = 350; // Фиксированный объём
    } else {
      formulaVolumePerDay = 250; // После 3 лет
    }

    // Расчёт MCT-масла (если показано)
    let mctOilPerDay = 0;
    const mctAllowed = !diagInfo?.mctContraindicated;
    if (mctAllowed && ['LCHAD', 'TFP', 'VLCAD', 'CACT', 'CPT2'].includes(diagnosis)) {
      if (ageInMonths >= 6 && ageInMonths < 12) {
        mctOilPerDay = Math.round(weight * 0.5); // ~0.5 мл/кг
      } else if (ageInMonths >= 12 && ageInMonths < 36) {
        mctOilPerDay = Math.round(weight * 0.8); // ~0.8 мл/кг
      } else if (ageInMonths >= 36) {
        mctOilPerDay = Math.round(weight * 1); // ~1 мл/кг
      }
    }

    // Расчёт грудного молока (если смешанное вскармливание)
    let breastMilkVolume = 0;
    if (breastfeeding && ageInMonths < 12) {
      if (['VLCAD_ASYMPTOMATIC', 'MCAD', 'SCAD', 'OCTN2', 'SCHAD'].includes(effectiveForm)) {
        breastMilkVolume = Math.round(formulaVolumePerDay * 0.5); // 50% ГВ
        formulaVolumePerDay = Math.round(formulaVolumePerDay * 0.5); // 50% смесь
      }
    }

    // Генерируем расписание по часам
    const schedule = this._generateFeedingSchedule(
      ageGroup,
      ageInMonths,
      weight,
      formulaVolumePerDay,
      breastMilkVolume,
      mctOilPerDay,
      portions,
      diagnosis,
      effectiveForm,
      recommendedFormula,
      condition
    );

    // Подбираем конкретные продукты
    const recommendedProducts = this._selectProducts(ageInMonths, diagnosis, effectiveForm);

    return {
      ageGroup,
      energy,
      macros,
      formula: {
        type: formulaType,
        name: recommendedFormula?.name || 'Стандартная смесь',
        volumePerDay: formulaVolumePerDay,
        note: recommendedFormula?.note
      },
      breastMilk: breastMilkVolume > 0 ? {
        volumePerDay: breastMilkVolume,
        note: 'Чередовать с кормлениями смесью или смешивать'
      } : null,
      mctOil: mctOilPerDay > 0 ? {
        volumePerDay: mctOilPerDay,
        product: 'MCT-масло (Кансо 83% или Ликвиген)',
        note: 'Добавлять в готовые блюда (каши, пюре)'
      } : null,
      schedule,
      recommendedProducts,
      warnings: this._generateWarnings(diagnosis, clinicalForm, condition)
    };
  }

  /**
   * Генерация расписания кормления по часам с детализацией БЖУ
   */
  _generateFeedingSchedule(ageGroup, ageInMonths, weight, formulaVolume, breastMilkVolume, mctOil, portions, diagnosis, effectiveForm, formula, condition) {
    const meals = [];
    const complementary = this.data.complementaryFoods;

    // Получаем данные о смеси
    let formulaData;
    if (formula?.name === 'Моноген') {
      formulaData = complementary.formulas.monogen;
    } else if (formula?.name === 'Нутриген 40-MCT') {
      formulaData = complementary.formulas.nutrigen40mct;
    } else if (formula?.name === 'Basic-F') {
      formulaData = complementary.formulas.basicF;
    } else {
      formulaData = complementary.formulas.standard;
    }

    const breastMilkData = complementary.formulas.breastMilk;

    // Функция расчёта БЖУ для продукта
    const calcNutrients = (per100, amountG) => ({
      kcal: Math.round(per100.kcal * amountG / 100),
      protein: Math.round(per100.protein * amountG / 100 * 10) / 10,
      fat: Math.round((per100.fat || (per100.lct + per100.mct)) * amountG / 100 * 10) / 10,
      carbs: Math.round(per100.carbs * amountG / 100 * 10) / 10,
      lct: Math.round((per100.lct || 0) * amountG / 100 * 10) / 10
    });

    // Функция создания элемента меню с БЖУ
    const createItem = (name, amountG, per100g, unit = 'г') => {
      const nutrients = calcNutrients(per100g, amountG);
      return {
        name,
        amount: `${amountG} ${unit}`,
        nutrients
      };
    };

    // Данные продуктов
    const products = {
      vegetables: {
        kabachok: { name: 'ФрутоНяня Кабачок', per100g: { kcal: 20, protein: 0.8, fat: 0.1, carbs: 4.0, lct: 0.1 } },
        broccoli: { name: 'ФрутоНяня Брокколи', per100g: { kcal: 25, protein: 2.0, fat: 0.3, carbs: 4.0, lct: 0.3 } },
        cauliflower: { name: 'Heinz Цветная капуста', per100g: { kcal: 22, protein: 1.8, fat: 0.2, carbs: 3.5, lct: 0.2 } },
        pumpkin: { name: 'ФрутоНяня Тыква', per100g: { kcal: 28, protein: 0.8, fat: 0.1, carbs: 6.0, lct: 0.1 } }
      },
      cereals: {
        rice: { name: 'Heinz Рисовая безмолочная', per100g: { kcal: 370, protein: 7.0, fat: 0.8, carbs: 82.0, lct: 0.8 } },
        buckwheat: { name: 'ФрутоНяня Гречневая безмолочная', per100g: { kcal: 360, protein: 11.0, fat: 1.2, carbs: 75.0, lct: 1.2 } },
        corn: { name: 'Heinz Кукурузная безмолочная', per100g: { kcal: 375, protein: 6.0, fat: 1.0, carbs: 83.0, lct: 1.0 } }
      },
      meat: {
        turkey: { name: 'ФрутоНяня Индейка', per100g: { kcal: 95, protein: 12.0, fat: 5.0, carbs: 0.5, lct: 5.0 } },
        rabbit: { name: 'ФрутоНяня Кролик', per100g: { kcal: 90, protein: 13.0, fat: 4.0, carbs: 0.5, lct: 4.0 } },
        chicken: { name: 'Heinz Цыплёнок', per100g: { kcal: 88, protein: 11.0, fat: 4.5, carbs: 0.8, lct: 4.5 } }
      },
      fruits: {
        apple: { name: 'ФрутоНяня Яблоко', per100g: { kcal: 50, protein: 0.2, fat: 0.1, carbs: 12.0, lct: 0.1 } },
        pear: { name: 'ФрутоНяня Груша', per100g: { kcal: 45, protein: 0.3, fat: 0.1, carbs: 10.5, lct: 0.1 } }
      },
      mct: { name: 'MCT-масло Кансо 83%', per100g: { kcal: 759, protein: 0, fat: 83, carbs: 0, lct: 0 } },
      cornstarch: { name: 'Кукурузный крахмал', per100g: { kcal: 343, protein: 0.3, fat: 0.1, carbs: 85, lct: 0.1 } }
    };

    // Базовые расписания по возрасту
    if (ageInMonths < 4) {
      // 0-4 месяца: только смесь/ГВ
      const totalVolume = formulaVolume + breastMilkVolume;
      const feedingsCount = 8;
      const volumePerFeeding = Math.round(totalVolume / feedingsCount);
      const times = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '00:00', '03:00'];

      times.forEach(time => {
        const items = [];
        if (breastMilkVolume > 0) {
          const bmVol = Math.round(volumePerFeeding * 0.5);
          items.push(createItem('Грудное молоко', bmVol, breastMilkData.per100ml, 'мл'));
          items.push(createItem(formulaData.name, volumePerFeeding - bmVol, formulaData.per100ml, 'мл'));
        } else {
          items.push(createItem(formulaData.name, volumePerFeeding, formulaData.per100ml, 'мл'));
        }
        const total = this._sumNutrients(items);
        meals.push({ time, type: 'formula', items, total });
      });

    } else if (ageInMonths < 6) {
      // 4-6 месяцев: 5-6 кормлений, начало прикорма
      const formulaPerFeeding = Math.round(formulaVolume / 5);

      // 06:00 - Смесь
      let items = [createItem(formulaData.name, formulaPerFeeding, formulaData.per100ml, 'мл')];
      meals.push({ time: '06:00', type: 'formula', items, total: this._sumNutrients(items) });

      // 10:00 - Смесь + каша
      const cerealDry = 15; // г сухой каши
      items = [
        createItem(formulaData.name, Math.round(formulaPerFeeding * 0.6), formulaData.per100ml, 'мл'),
        createItem(products.cereals.rice.name, cerealDry, products.cereals.rice.per100g)
      ];
      meals.push({ time: '10:00', type: 'cereal', items, total: this._sumNutrients(items) });

      // 14:00 - Смесь + овощи
      items = [
        createItem(formulaData.name, Math.round(formulaPerFeeding * 0.6), formulaData.per100ml, 'мл'),
        createItem(products.vegetables.kabachok.name, 50, products.vegetables.kabachok.per100g)
      ];
      meals.push({ time: '14:00', type: 'vegetables', items, total: this._sumNutrients(items) });

      // 18:00 - Смесь
      items = [createItem(formulaData.name, formulaPerFeeding, formulaData.per100ml, 'мл')];
      meals.push({ time: '18:00', type: 'formula', items, total: this._sumNutrients(items) });

      // 21:00 - Смесь
      items = [createItem(formulaData.name, formulaPerFeeding, formulaData.per100ml, 'мл')];
      meals.push({ time: '21:00', type: 'formula', items, total: this._sumNutrients(items) });

    } else if (ageInMonths < 12) {
      // 6-12 месяцев: 5 кормлений с прикормом
      const formulaPerFeeding = Math.round(formulaVolume / 3);
      const mctPerMeal = mctOil > 0 ? Math.round(mctOil / 2) : 0;
      const strictLCT = ['LCHAD', 'TFP', 'CACT', 'VLCAD_SYMPTOMATIC'].includes(effectiveForm);

      // 06:00 - Смесь
      let items = [createItem(formulaData.name, formulaPerFeeding, formulaData.per100ml, 'мл')];
      if (breastMilkVolume > 0) {
        items = [
          createItem('Грудное молоко', Math.round(breastMilkVolume / 2), breastMilkData.per100ml, 'мл'),
          createItem(formulaData.name, Math.round(formulaPerFeeding * 0.5), formulaData.per100ml, 'мл')
        ];
      }
      meals.push({ time: '06:00', type: 'formula', items, total: this._sumNutrients(items) });

      // 10:00 - Каша + фрукты + MCT
      const cerealDry = 25; // г сухой каши
      items = [
        createItem(products.cereals.rice.name, cerealDry, products.cereals.rice.per100g),
        createItem(products.fruits.apple.name, 50, products.fruits.apple.per100g)
      ];
      if (mctPerMeal > 0) {
        items.push(createItem(products.mct.name, mctPerMeal, products.mct.per100g, 'мл'));
      }
      meals.push({ time: '10:00', type: 'cereal', items, total: this._sumNutrients(items) });

      // 14:00 - Овощи + мясо + MCT
      items = [
        createItem(products.vegetables.broccoli.name, 100, products.vegetables.broccoli.per100g)
      ];
      if (!strictLCT) {
        items.push(createItem(products.meat.rabbit.name, 40, products.meat.rabbit.per100g));
      } else {
        items.push(createItem(products.meat.rabbit.name, 20, products.meat.rabbit.per100g));
      }
      if (mctPerMeal > 0) {
        items.push(createItem(products.mct.name, mctPerMeal, products.mct.per100g, 'мл'));
      }
      meals.push({ time: '14:00', type: 'vegetables_meat', items, total: this._sumNutrients(items) });

      // 18:00 - Смесь + фрукты
      items = [
        createItem(formulaData.name, formulaPerFeeding, formulaData.per100ml, 'мл'),
        createItem(products.fruits.pear.name, 60, products.fruits.pear.per100g)
      ];
      meals.push({ time: '18:00', type: 'formula_fruit', items, total: this._sumNutrients(items) });

      // 21:00 - Смесь + крахмал (при необходимости)
      items = [createItem(formulaData.name, formulaPerFeeding, formulaData.per100ml, 'мл')];
      if (ageInMonths >= 8 && ['LCHAD', 'TFP', 'VLCAD'].includes(diagnosis)) {
        const starchAmount = Math.round(weight);
        items.push(createItem(products.cornstarch.name + ' (1:2 в воде)', starchAmount, products.cornstarch.per100g));
      }
      meals.push({ time: '21:00', type: 'formula', items, total: this._sumNutrients(items) });

    } else {
      // 1-3 года и старше: 5 приёмов
      const mctPerMeal = mctOil > 0 ? Math.round(mctOil / 3) : 0;
      const strictLCT = ['LCHAD', 'TFP', 'CACT', 'VLCAD_SYMPTOMATIC'].includes(effectiveForm);

      // 07:00 - Завтрак: каша + фрукт + MCT
      const cerealDry = 40;
      let items = [
        createItem(products.cereals.buckwheat.name, cerealDry, products.cereals.buckwheat.per100g),
        createItem(products.fruits.apple.name, 80, products.fruits.apple.per100g)
      ];
      if (mctPerMeal > 0) {
        items.push(createItem(products.mct.name, mctPerMeal, products.mct.per100g, 'мл'));
      }
      meals.push({ time: '07:00', type: 'breakfast', items, total: this._sumNutrients(items) });

      // 10:00 - Перекус: смесь
      items = [createItem(formulaData.name, Math.round(formulaVolume / 3), formulaData.per100ml, 'мл')];
      meals.push({ time: '10:00', type: 'snack', items, total: this._sumNutrients(items) });

      // 13:00 - Обед: овощи + мясо + MCT
      items = [
        createItem(products.vegetables.cauliflower.name, 120, products.vegetables.cauliflower.per100g),
        createItem(products.vegetables.pumpkin.name, 50, products.vegetables.pumpkin.per100g)
      ];
      if (!strictLCT) {
        items.push(createItem(products.meat.turkey.name, 60, products.meat.turkey.per100g));
      } else {
        items.push(createItem(products.meat.turkey.name, 30, products.meat.turkey.per100g));
      }
      if (mctPerMeal > 0) {
        items.push(createItem(products.mct.name, mctPerMeal, products.mct.per100g, 'мл'));
      }
      meals.push({ time: '13:00', type: 'lunch', items, total: this._sumNutrients(items) });

      // 16:00 - Перекус: фрукты + смесь
      items = [
        createItem(products.fruits.pear.name, 80, products.fruits.pear.per100g),
        createItem(formulaData.name, Math.round(formulaVolume / 4), formulaData.per100ml, 'мл')
      ];
      meals.push({ time: '16:00', type: 'snack', items, total: this._sumNutrients(items) });

      // 19:00 - Ужин: овощи/каша + смесь + MCT + крахмал
      items = [
        createItem(products.cereals.corn.name, 30, products.cereals.corn.per100g),
        createItem(products.vegetables.kabachok.name, 100, products.vegetables.kabachok.per100g),
        createItem(formulaData.name, Math.round(formulaVolume / 4), formulaData.per100ml, 'мл')
      ];
      if (mctPerMeal > 0) {
        items.push(createItem(products.mct.name, mctPerMeal, products.mct.per100g, 'мл'));
      }
      if (['LCHAD', 'TFP', 'VLCAD'].includes(diagnosis)) {
        const starchAmount = Math.round(weight);
        items.push(createItem(products.cornstarch.name + ' (1:2 в воде)', starchAmount, products.cornstarch.per100g));
      }
      meals.push({ time: '19:00', type: 'dinner', items, total: this._sumNutrients(items) });
    }

    return meals;
  }

  /**
   * Суммирование нутриентов по всем элементам
   */
  _sumNutrients(items) {
    const total = { kcal: 0, protein: 0, fat: 0, carbs: 0, lct: 0 };
    items.forEach(item => {
      if (item.nutrients) {
        total.kcal += item.nutrients.kcal || 0;
        total.protein += item.nutrients.protein || 0;
        total.fat += item.nutrients.fat || 0;
        total.carbs += item.nutrients.carbs || 0;
        total.lct += item.nutrients.lct || 0;
      }
    });
    total.protein = Math.round(total.protein * 10) / 10;
    total.fat = Math.round(total.fat * 10) / 10;
    total.carbs = Math.round(total.carbs * 10) / 10;
    total.lct = Math.round(total.lct * 10) / 10;
    return total;
  }

  /**
   * Подбор конкретных продуктов
   */
  _selectProducts(ageInMonths, diagnosis, effectiveForm) {
    const complementary = this.data.complementaryFoods;
    const result = {
      vegetables: [],
      cereals: [],
      meat: [],
      fruits: [],
      avoid: []
    };

    if (ageInMonths < 4) {
      return result; // Прикорм не вводится
    }

    // Овощи
    result.vegetables = complementary.vegetables.products
      .filter(p => ageInMonths >= p.ageFrom)
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        brand: p.brand,
        fat: p.per100g.lct,
        note: `${p.per100g.kcal} ккал/100г`
      }));

    // Каши
    result.cereals = complementary.cereals.products
      .filter(p => ageInMonths >= p.ageFrom)
      .slice(0, 4)
      .map(p => ({
        name: p.name,
        brand: p.brand,
        fat: p.per100gDry.lct,
        note: p.note || `${p.per100gDry.kcal} ккал/100г сухой`
      }));

    // Мясо (только если возраст >= 6 мес и не строгое ограничение)
    if (ageInMonths >= 6) {
      const strictDiagnoses = ['LCHAD', 'TFP', 'VLCAD_SYMPTOMATIC', 'CACT'];
      if (!strictDiagnoses.includes(effectiveForm)) {
        result.meat = complementary.meat.products
          .filter(p => ageInMonths >= p.ageFrom && p.suitable?.includes(diagnosis))
          .slice(0, 3)
          .map(p => ({
            name: p.name,
            brand: p.brand,
            fat: p.per100g.lct,
            note: `Жир: ${p.per100g.fat}г/100г`
          }));
      } else {
        result.meat = [{
          name: 'Мясо ограничено',
          note: 'При строгой диете мясо вводится осторожно, минимальными порциями'
        }];
      }
    }

    // Фрукты
    result.fruits = complementary.fruits.products
      .filter(p => ageInMonths >= p.ageFrom)
      .slice(0, 4)
      .map(p => ({
        name: p.name,
        brand: p.brand,
        note: `${p.per100g.kcal} ккал/100г`
      }));

    // Продукты, которых следует избегать
    result.avoid = [
      ...complementary.vegetables.avoidProducts,
      ...complementary.cereals.avoidProducts,
      ...complementary.meat.avoidProducts
    ];

    return result;
  }
}

// Экспорт для использования в браузере и Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FAODCalculator;
}
