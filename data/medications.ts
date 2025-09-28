export interface MedicationInfo {
  name: string;
  defaultDosage: number;
  defaultUnit: string;
}

export const ukMedications: MedicationInfo[] = [
  { name: 'Metformin', defaultDosage: 500, defaultUnit: 'mg' },
  { name: 'Gliclazide', defaultDosage: 80, defaultUnit: 'mg' },
  { name: 'Pioglitazone', defaultDosage: 30, defaultUnit: 'mg' },
  { name: 'Sitagliptin', defaultDosage: 100, defaultUnit: 'mg' },
  { name: 'Dapagliflozin', defaultDosage: 10, defaultUnit: 'mg' },
  { name: 'Canagliflozin', defaultDosage: 100, defaultUnit: 'mg' },
  { name: 'Empagliflozin', defaultDosage: 10, defaultUnit: 'mg' },
  { name: 'Liraglutide', defaultDosage: 0.6, defaultUnit: 'mg' },
  { name: 'Semaglutide (Ozempic)', defaultDosage: 0.25, defaultUnit: 'mg' },
  { name: 'Dulaglutide (Trulicity)', defaultDosage: 0.75, defaultUnit: 'mg' },
  { name: 'Insulin Glargine (Lantus)', defaultDosage: 10, defaultUnit: 'units' },
  { name: 'Insulin Aspart (NovoRapid)', defaultDosage: 4, defaultUnit: 'units' },
  { name: 'Alogliptin', defaultDosage: 25, defaultUnit: 'mg' },
  { name: 'Linagliptin', defaultDosage: 5, defaultUnit: 'mg' },
  { name: 'Saxagliptin', defaultDosage: 5, defaultUnit: 'mg' },
  { name: 'Vildagliptin', defaultDosage: 50, defaultUnit: 'mg' },
  { name: 'Repaglinide', defaultDosage: 0.5, defaultUnit: 'mg' },
  { name: 'Nateglinide', defaultDosage: 120, defaultUnit: 'mg' },
  { name: 'Exenatide (Byetta)', defaultDosage: 5, defaultUnit: 'mcg' },
  { name: 'Rosiglitazone', defaultDosage: 4, defaultUnit: 'mg' },
];
