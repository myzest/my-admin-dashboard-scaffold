export function createFieldRules(schema) {
  return [
    {
      required: !schema.safeParse(undefined).success,
      ignoreEmptyString: false,
      validator(value, callback) {
        const result = schema.safeParse(value);
        callback(result.success ? undefined : result.error.issues[0].message);
      },
    },
  ];
}

export function getValidationFields(error) {
  const fields = new Map();
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (
      issue.code !== 'unrecognized_keys' &&
      issue.path.length === 1 &&
      typeof field === 'string' &&
      /^[a-zA-Z][a-zA-Z0-9]*$/.test(field) &&
      !['constructor', 'prototype'].includes(field) &&
      !fields.has(field)
    ) {
      fields.set(field, issue.message);
    }
  }
  return Object.fromEntries(fields);
}
