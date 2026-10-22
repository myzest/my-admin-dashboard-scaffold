import { useEffect } from 'react';
import { Form } from '@arco-design/web-react';

export default function useFormErrors(error) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!error?.fields) return;
    const registeredFields = form.getFieldsState();
    const fields = Object.entries(error.fields)
      .filter(
        ([field, message]) => Object.hasOwn(registeredFields, field) && typeof message === 'string',
      )
      .map(([field, message]) => [field, { error: { message } }]);
    if (fields.length) form.setFields(Object.fromEntries(fields));
  }, [error, form]);

  return form;
}
