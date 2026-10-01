// Field-matching rules.
//
// These ship inside the extension, so every change to them is reviewed,
// built, hashed and signed like any other code. The backend sends values;
// it can never change how a value finds its field.
//
// phrases      Words that make a field a plausible home for this value.
//              A field is plausible when all words of any phrase appear in
//              one of its labels, its placeholder, or its name/id.
//              Plausibility is deliberately broad: the engine only fills
//              when exactly one field is plausible, so a broad net turns
//              guesses into skips.
// autocomplete HTML autocomplete tokens that identify the field outright.
// format       What a well-formed value from the backend looks like.
// kind         Extra handling: 'date' (ISO yyyy-mm-dd in, converted only
//              when the field states its format) or 'email'.
(() => {
  'use strict';

  const rules = {
    firstName: {
      label: 'First name',
      phrases: ['first name', 'given name', 'forename'],
      autocomplete: ['given-name'],
    },
    lastName: {
      label: 'Last name',
      phrases: ['last name', 'family name', 'surname'],
      autocomplete: ['family-name'],
    },
    dob: {
      label: 'Date of birth',
      phrases: ['date of birth', 'birth date', 'birthdate', 'dob'],
      autocomplete: ['bday'],
      kind: 'date',
      format: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    npi: {
      label: 'NPI',
      phrases: ['npi', 'national provider identifier'],
      format: '^\\d{10}$',
    },
    licenseNumber: {
      label: 'License number',
      phrases: ['license number', 'licence number', 'license no', 'license num', 'license id'],
    },
    email: {
      label: 'Email',
      phrases: ['email', 'e mail', 'email address'],
      autocomplete: ['email'],
      kind: 'email',
    },
    phone: {
      label: 'Phone',
      phrases: ['phone', 'telephone', 'tel', 'phone number'],
      autocomplete: ['tel', 'tel-national'],
      format: '^[0-9()+. -]{7,20}$',
    },
    street: {
      label: 'Street address',
      phrases: ['street', 'street address', 'address line 1', 'address 1', 'mailing address'],
      autocomplete: ['address-line1', 'street-address'],
    },
    city: {
      label: 'City',
      phrases: ['city', 'town'],
      autocomplete: ['address-level2'],
    },
    state: {
      label: 'State',
      phrases: ['state'],
      autocomplete: ['address-level1'],
      format: '^[A-Z]{2}$',
    },
    zip: {
      label: 'ZIP code',
      phrases: ['zip', 'zip code', 'postal code', 'postcode'],
      autocomplete: ['postal-code'],
      format: '^\\d{5}(-\\d{4})?$',
    },
  };

  for (const rule of Object.values(rules)) {
    Object.freeze(rule.phrases);
    if (rule.autocomplete) Object.freeze(rule.autocomplete);
    Object.freeze(rule);
  }
  globalThis.SafeFillRules = Object.freeze(rules);
})();
