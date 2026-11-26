import type { TopicContent } from './types';

export interface LabRule {
  /** Matches the test name. */
  name: RegExp;
  direction: 'high' | 'low';
  /** Everyday name shown to the reader. */
  plain: string;
}

export interface Topic extends TopicContent {
  /** ICD-10 code prefixes, e.g. /^E1[0-4]/. */
  codes?: RegExp;
  /** Condition names, for files without ICD-10 codes. */
  names?: RegExp;
  labs?: LabRule[];
}

const SEE_DIETITIAN = 'Would seeing a dietitian help me?';

/**
 * The knowledge base. Self-care entries are general, widely accepted healthy-living advice.
 * They deliberately contain no medicines or supplements: what is safe to take depends on a
 * person's other conditions, medicines and allergies, which only a clinician can weigh.
 */
export const TOPICS: Topic[] = [
  {
    id: 'heart-attack-marker',
    title: 'A heart-strain marker is raised',
    meaning: 'Troponin is a substance the heart releases when it is under strain or injured. A raised level always needs a doctor to look at it.',
    labs: [{ name: /troponin/i, direction: 'high', plain: 'Heart-strain marker (troponin)' }],
    selfCare: ['Rest and avoid hard physical effort until a doctor has reviewed this result.', 'Do not drive yourself if you feel chest pain, breathlessness or faintness.'],
    askDoctor: ['Was this result already reviewed and explained?', 'Do I need more heart tests?'],
  },
  {
    id: 'potassium',
    title: 'Your potassium level is outside the safe range',
    meaning: 'Potassium is a mineral that keeps your heartbeat steady. Too much or too little can disturb the heart rhythm.',
    labs: [
      { name: /potassium/i, direction: 'high', plain: 'Potassium' },
      { name: /potassium/i, direction: 'low', plain: 'Potassium' },
    ],
    selfCare: ['Do not use salt substitutes ("low-sodium salt") — most are made of potassium.', 'Do not start or stop potassium-rich diets or supplements on your own; ask first.'],
    askDoctor: ['Should this test be repeated?', 'Could one of my medicines be affecting my potassium?', 'Which foods should I limit or eat more of?'],
  },
  {
    id: 'blood-sugar',
    title: 'Your blood sugar is high',
    meaning: 'Sugar stays in your blood instead of being used by your body. Over the years this can harm the eyes, kidneys, nerves and heart — keeping it in range protects them.',
    codes: /^E1[0-4]/,
    names: /diabet/i,
    labs: [
      { name: /hba1c|a1c|glyc(at|osylat)ed/i, direction: 'high', plain: 'Average blood sugar over 3 months (HbA1c)' },
      { name: /glucose/i, direction: 'high', plain: 'Blood sugar (glucose)' },
    ],
    selfCare: [
      'Swap sugary drinks and juices for water or unsweetened tea.',
      'Fill half your plate with vegetables; choose whole grains over white bread, white rice and sweets.',
      'Walk for 10–15 minutes after meals — it lowers blood sugar directly.',
      'Eat at regular times and keep portions of starchy food moderate.',
      'Check your feet daily for cuts or sores that are slow to heal.',
    ],
    askDoctor: ['What blood sugar target is right for me?', 'How often should I be tested?', SEE_DIETITIAN],
  },
  {
    id: 'low-blood-sugar',
    title: 'Your blood sugar was low',
    meaning: 'Low blood sugar can cause shakiness, sweating, confusion or fainting.',
    labs: [{ name: /glucose/i, direction: 'low', plain: 'Blood sugar (glucose)' }],
    selfCare: ['Do not skip meals.', 'If you feel shaky or sweaty, have a sugary drink or a few glucose sweets right away, then a snack.'],
    askDoctor: ['Why was my blood sugar low?', 'Do my diabetes medicines need adjusting?'],
  },
  {
    id: 'blood-pressure',
    title: 'Your blood pressure is high',
    meaning: 'Blood is pushing too hard against the walls of your blood vessels. You usually cannot feel it, but over time it strains the heart, brain and kidneys.',
    codes: /^I1[0-5]/,
    names: /hypertens|high blood pressure/i,
    selfCare: [
      'Use less salt: cook with herbs, lemon and spices, and go easy on processed food, crisps, cured meat and ready meals.',
      'Eat more vegetables, fruit, beans, unsalted nuts and low-fat dairy.',
      'Move most days — a brisk 30-minute walk counts.',
      'Limit alcohol, and stop smoking if you smoke.',
      'Sleep 7–8 hours and find a way to wind down each day.',
      'Measure your blood pressure at home and write the numbers down for your doctor.',
    ],
    askDoctor: ['What blood pressure should I aim for?', 'How often should I measure it at home?'],
  },
  {
    id: 'cholesterol',
    title: 'Your cholesterol needs attention',
    meaning: 'Too much "bad" cholesterol (LDL) can build up inside blood vessels and narrow them, which raises the risk of heart attack and stroke. "Good" cholesterol (HDL) helps clear it.',
    codes: /^E78/,
    names: /hyperlipid|cholesterol|dyslipid/i,
    labs: [
      { name: /\bldl/i, direction: 'high', plain: '"Bad" cholesterol (LDL)' },
      { name: /cholesterol.*total|total.*cholesterol|^cholesterol$/i, direction: 'high', plain: 'Total cholesterol' },
      { name: /triglycerid/i, direction: 'high', plain: 'Blood fats (triglycerides)' },
      { name: /\bhdl/i, direction: 'low', plain: '"Good" cholesterol (HDL)' },
    ],
    selfCare: [
      'Eat oats, beans, lentils, vegetables and fruit — their fibre helps lower cholesterol.',
      'Choose olive oil, nuts and oily fish instead of butter, fatty meat and fried food.',
      'Cut down on pastries, biscuits and fast food.',
      'Be active most days; it raises the "good" cholesterol.',
    ],
    askDoctor: ['What is my risk of heart disease?', 'What cholesterol level should I aim for?'],
  },
  {
    id: 'kidneys',
    title: 'Your kidneys are working below normal',
    meaning: 'Your kidneys filter waste out of your blood. These results suggest they are filtering more slowly than they should. Looked after early, kidney function can often be kept stable.',
    codes: /^N1[7-9]/,
    names: /kidney disease|renal (failure|insufficiency)/i,
    labs: [
      { name: /creatinine/i, direction: 'high', plain: 'Kidney waste marker (creatinine)' },
      { name: /egfr|gfr|glomerular/i, direction: 'low', plain: 'Kidney filtering rate (eGFR)' },
    ],
    selfCare: [
      'Keep blood pressure and blood sugar in range — these are the two biggest protectors of your kidneys.',
      'Use less salt.',
      'Drink water regularly through the day, unless your doctor has told you to limit fluids.',
      'Do not take anti-inflammatory painkillers such as ibuprofen or naproxen unless your doctor agrees — they can harm the kidneys.',
      'Before any new medicine, supplement or herbal product, tell the pharmacist that you have kidney problems.',
    ],
    askDoctor: ['What stage is my kidney function, and is it stable?', 'Which painkillers are safe for me?', 'Do I need to change how much protein, salt or potassium I eat?'],
  },
  {
    id: 'heart-failure',
    title: 'Your heart is under strain',
    meaning: 'Your heart is not pumping as strongly as it should, so fluid can build up in the legs and lungs and you may tire or get breathless easily.',
    codes: /^I50/,
    names: /heart failure/i,
    labs: [{ name: /bnp/i, direction: 'high', plain: 'Heart-strain marker (BNP)' }],
    selfCare: [
      'Weigh yourself every morning. Gaining more than about 1.5–2 kg in two or three days means fluid is building up — call your doctor.',
      'Use less salt; it makes the body hold on to water.',
      'Take your medicines exactly as prescribed, even on days you feel well.',
      'Stay gently active, as advised by your care team.',
    ],
    askDoctor: ['How much fluid should I drink each day?', 'Which symptoms mean I should call you straight away?'],
  },
  {
    id: 'heart-rhythm',
    title: 'You have an irregular heartbeat',
    meaning: 'Your heart sometimes beats out of rhythm (atrial fibrillation). The main concern is that blood clots can form, which is why many people take a blood thinner.',
    codes: /^I48/,
    names: /atrial fibrillation|atrial flutter/i,
    selfCare: [
      'Take any blood-thinning medicine at the same time every day and never skip doses.',
      'Limit alcohol and caffeine if they bring on palpitations.',
      'Tell every doctor, dentist and pharmacist that you have this condition and which medicines you take.',
    ],
    askDoctor: ['What is my stroke risk and how is it being reduced?', 'What should I do if my heart races?'],
  },
  {
    id: 'anemia',
    title: 'Your blood is low in red cells or iron',
    meaning: 'Red blood cells carry oxygen around your body. When they or your iron stores are low (anemia), you can feel tired, weak, dizzy or short of breath.',
    codes: /^D(5\d|6[0-4])/,
    names: /an[a]?emia/i,
    labs: [
      { name: /hemoglobin(?! a1c)|haemoglobin(?! a1c)|\bhgb\b/i, direction: 'low', plain: 'Red blood cell protein (hemoglobin)' },
      { name: /hematocrit|haematocrit/i, direction: 'low', plain: 'Share of red cells in the blood (hematocrit)' },
      { name: /ferritin/i, direction: 'low', plain: 'Iron stores (ferritin)' },
    ],
    selfCare: [
      'Eat iron-rich food: lean red meat, chicken, fish, lentils, beans, spinach and iron-fortified cereals.',
      'Have vitamin C with meals (orange, lemon, peppers, tomatoes) — it helps your body absorb iron.',
      'Drink tea and coffee between meals rather than with them; they block iron absorption.',
      'Rest when you are tired and stand up slowly if you feel dizzy.',
    ],
    askDoctor: ['What is causing my anemia?', 'Do I need iron or vitamin tablets, and which kind is safe for me?'],
  },
  {
    id: 'sodium',
    title: 'Your sodium (blood salt) level is low',
    meaning: 'Sodium keeps the water balance in your body right. A low level can cause tiredness, headache, confusion or unsteadiness.',
    labs: [{ name: /sodium/i, direction: 'low', plain: 'Sodium' }],
    selfCare: ['Do not drink much more or much less water than usual until you have spoken to your doctor — both can make it worse.'],
    askDoctor: ['Could one of my medicines (for example a water tablet) be causing this?', 'How much should I drink each day?'],
  },
  {
    id: 'liver',
    title: 'Your liver tests are raised',
    meaning: 'The liver cleans your blood and helps digest food. Raised liver values mean it is irritated or working harder than usual.',
    codes: /^K7[0-7]/,
    names: /hepatitis|cirrhosis|fatty liver|liver disease/i,
    labs: [
      { name: /\balt\b|alanine/i, direction: 'high', plain: 'Liver enzyme (ALT)' },
      { name: /\bast\b|aspartate/i, direction: 'high', plain: 'Liver enzyme (AST)' },
      { name: /bilirubin/i, direction: 'high', plain: 'Bilirubin' },
      { name: /\bggt\b|alkaline phosphatase/i, direction: 'high', plain: 'Liver enzyme' },
    ],
    selfCare: ['Avoid alcohol until your doctor has reviewed these results.', 'Stay within the dose written on the pack for any painkiller, and ask which are safe for your liver.', 'Aim for a healthy weight with less sugar and fried food.'],
    askDoctor: ['What might be irritating my liver?', 'Should these tests be repeated?'],
  },
  {
    id: 'thyroid',
    title: 'Your thyroid test is out of range',
    meaning: 'The thyroid is a small gland in your neck that sets the speed of your body. Out-of-range results can affect your energy, weight, mood and heartbeat.',
    codes: /^E0[0-7]/,
    names: /thyroid/i,
    labs: [
      { name: /\btsh\b|thyrotropin/i, direction: 'high', plain: 'Thyroid signal (TSH)' },
      { name: /\btsh\b|thyrotropin/i, direction: 'low', plain: 'Thyroid signal (TSH)' },
    ],
    selfCare: ['If you take thyroid tablets, take them at the same time every day, as instructed.'],
    askDoctor: ['Does my thyroid need treatment or just monitoring?', 'When should the test be repeated?'],
  },
  {
    id: 'weight',
    title: 'Your weight is above the healthy range',
    meaning: 'Carrying extra weight makes the heart, joints and blood-sugar control work harder. Even a small loss — 5% of your weight — brings real benefits.',
    codes: /^E66/,
    names: /obes/i,
    selfCare: ['Make small changes you can keep: smaller portions, fewer sugary drinks and snacks.', 'Aim for 30 minutes of movement most days — walking counts.', 'Keep regular meal and sleep times.'],
    askDoctor: ['What is a realistic weight goal for me?', SEE_DIETITIAN],
  },
  {
    id: 'breathing',
    title: 'You have a long-term breathing condition',
    meaning: 'Your airways are sensitive or narrowed (asthma or COPD), which can cause coughing, wheezing or breathlessness.',
    codes: /^J4[0-7]/,
    names: /asthma|copd|chronic obstructive|emphysema|chronic bronchitis/i,
    selfCare: ['If you smoke, stopping is the single most helpful step — ask for support.', 'Avoid smoke, dust and strong fumes.', 'Use your inhalers exactly as shown and keep your reliever with you.', 'Keep your flu and other recommended vaccines up to date.'],
    askDoctor: ['Is my inhaler technique right?', 'What should I do when my breathing gets worse?'],
  },
  {
    id: 'joints',
    title: 'You have wear-and-tear in a joint',
    meaning: 'The cushioning in a joint has worn down (osteoarthritis), which can cause pain and stiffness, especially after resting.',
    codes: /^M1[5-9]/,
    names: /osteoarthritis|arthrosis/i,
    selfCare: ['Keep moving: walking, cycling and swimming strengthen the muscles that protect the joint.', 'Warmth can ease stiffness; a cold pack can ease swelling.', 'Losing a little weight takes a lot of load off knees and hips.', 'Ask a pharmacist which pain relief is safe with your other conditions before taking any.'],
    askDoctor: ['Would physiotherapy help me?', 'Which pain relief is safe with my other conditions?'],
  },
  {
    id: 'reflux',
    title: 'You have acid reflux',
    meaning: 'Stomach acid flows back up towards your throat, causing heartburn.',
    codes: /^K21/,
    names: /reflux|gerd/i,
    selfCare: ['Eat smaller meals and avoid eating in the 3 hours before bed.', 'Notice and cut back on your triggers — often fatty or spicy food, coffee, chocolate and alcohol.', 'Raise the head of your bed slightly.'],
    askDoctor: ['Do I need treatment, or are lifestyle changes enough?'],
  },
  {
    id: 'infection-marker',
    title: 'Your white blood cell count is high',
    meaning: 'White blood cells fight infection. A high count often means your body is dealing with an infection or inflammation.',
    labs: [{ name: /\bwbc\b|leu[ck]ocyte|white blood/i, direction: 'high', plain: 'White blood cells' }],
    selfCare: ['Rest and drink enough fluids.', 'Watch for fever, chills or feeling worse.'],
    askDoctor: ['What is causing this, and does it need treatment?'],
  },
];

/** Findings that come from vital signs rather than from a lab rule or a diagnosis. */
export const OXYGEN_TOPIC: Topic = {
  id: 'oxygen',
  title: 'Your blood oxygen was low',
  meaning: 'Oxygen saturation shows how much oxygen your blood is carrying. Healthy values are usually 95% or higher.',
  selfCare: ['Sit upright and breathe slowly if you feel breathless.', 'Do not smoke, and avoid smoky rooms.'],
  askDoctor: ['What oxygen level is normal for me?', 'What should I do if I get more breathless?'],
};
