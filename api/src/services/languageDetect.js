'use strict';
// French or English? Counts very common function words (and French accents)
// in the text. Good enough for emails, job ads and CVs; returns null when the
// text is too short or too mixed to say.

const FR = new Set(('le la les un une des du de et est sont pour avec dans sur pas nous vous votre vos notre nos je ne '
  + 'que qui au aux ce cette ces mais ou où été être avoir avons avez merci bonjour madame monsieur candidature poste '
  + 'cordialement souhaitons malheureusement retenu suite offre entreprise équipe très plus').split(' '));
// No words that are also common in French ("a", "on", "job", "team").
const EN = new Set(('the an and is are for with in not we you your our i to of that which this these but or been be '
  + 'have has thank thanks hello dear applying regards unfortunately role will would '
  + 'please more very').split(' '));

/** @returns {{ language: 'en'|'fr'|null, fr: number, en: number }} */
function scoreLanguage(text) {
  const words = String(text || '').toLowerCase().normalize('NFC').match(/[a-zà-öø-ÿœ']+/g) || [];
  let fr = 0, en = 0;
  for (const raw of words) {
    const w = raw.replace(/^(l|d|j|n|qu|c|m|s|t)'/, '');      // l'équipe → équipe, d'un → un
    if (FR.has(w)) fr++;
    if (EN.has(w)) en++;
    if (/[éèêàùçœ]/.test(w)) fr += 0.5;
  }
  const total = fr + en;
  let language = null;
  if (total >= 3) {
    if (fr >= en * 1.5) language = 'fr';
    else if (en >= fr * 1.5) language = 'en';
  }
  return { language, fr, en };
}

const detectLanguage = text => scoreLanguage(text).language;

module.exports = { detectLanguage, scoreLanguage };
